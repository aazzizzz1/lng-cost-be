/**
 * Spatial Route Service – A* Sea-Route Engine
 * ─────────────────────────────────────────────────────────────────────────────
 * Computes the shortest navigable sea-path between two geographic coordinates,
 * respecting a minimum water depth derived from the ship's design draft plus
 * Under-Keel Clearance (UKC) and dynamic wave height.
 *
 * Two engines are tried in order of preference:
 *   1. BATNAS  – high-res local TIF (Indonesia)
 *   2. GEBCO   – global NetCDF (fallback)
 *
 * If both engines fail (data files unavailable), an error is thrown.
 * Haversine straight-line is NOT used – all routes must follow real sea paths.
 *
 * All results are cached in the SpatialRouteCache Prisma table so identical
 * queries are served instantly.
 *
 * Key exported functions
 * ──────────────────────
 *  computeRoute(origin, destination, options)
 *    → { waypoints, distanceNm, minDepth, maxDepth, weatherZones, engine }
 *
 *  computeJettyReport(locationName, lat, lon, options)
 *    → { berthLat, berthLon, jettyM, landKm, berthDepth }
 *
 *  computeDynamicVoyageHours(waypoints, vessel, weatherCache, ihoSvc)
 *    → number of sailing hours (accounting for speed-loss from waves/wind)
 *
 *  getDynamicOruCapex(demandBbtud, province, analysisYear, inflationRate, heatingValue?)
 *    → { finalCapexUsd, scaledBaseCost, inflatedCost, ikkTarget, ikkRef, bestMatchName, bestMatchCapBbtud, capacityFactor }
 */

const crypto  = require('crypto');
const prisma  = require('../config/db');
const ihoSvc  = require('./ihoService');
const { getBatnas, getGebco, isSafeCorridorLine, findBerthPoint, fastNm } = require('./bathymetryService');
const { calcSpeedLoss } = require('./weatherService');

// ─────────────────────────────────────────────────────────────────────────────
// Constants (same as Python)
// ─────────────────────────────────────────────────────────────────────────────
const UKC_CLEARANCE = 2.85; // metres
const MAX_DESIGN_DRAFT = 8.0; // conservative fallback when vessel unknown
const BASE_YEAR = 2022;

// ─────────────────────────────────────────────────────────────────────────────
// Min-Heap for A*
// ─────────────────────────────────────────────────────────────────────────────
class MinHeap {
  constructor() { this.h = []; }
  push(priority, item) {
    this.h.push({ priority, item });
    this._up(this.h.length - 1);
  }
  pop() {
    const top = this.h[0];
    const last = this.h.pop();
    if (this.h.length) { this.h[0] = last; this._down(0); }
    return top;
  }
  get size() { return this.h.length; }
  _up(i) {
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.h[p].priority <= this.h[i].priority) break;
      [this.h[p], this.h[i]] = [this.h[i], this.h[p]]; i = p;
    }
  }
  _down(i) {
    while (true) {
      let m = i, l = 2*i+1, r = 2*i+2;
      if (l < this.h.length && this.h[l].priority < this.h[m].priority) m = l;
      if (r < this.h.length && this.h[r].priority < this.h[m].priority) m = r;
      if (m === i) break;
      [this.h[m], this.h[i]] = [this.h[i], this.h[m]]; i = m;
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Route-key hash
// ─────────────────────────────────────────────────────────────────────────────
function makeRouteKey(origin, destination) {
  const canonical = [origin, destination].sort().join('|');
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

// ─────────────────────────────────────────────────────────────────────────────
// Ship parameters (max from vessel database, matching Python kapal_df)
// MAX_LPP = 175.0 m  → HAI YANG SHI YOU 301 (largest vessel in database)
// ─────────────────────────────────────────────────────────────────────────────
const MAX_LPP = 175.0;

// ─────────────────────────────────────────────────────────────────────────────
// Capsule distance: perpendicular distance from point P to line segment A→B
// Matches Python capsule_mask calculation
// ─────────────────────────────────────────────────────────────────────────────
function capsuleDist(p, a, b) {
  const ab = [b[0] - a[0], b[1] - a[1]];
  const ap = [p[0] - a[0], p[1] - a[1]];
  const len2 = ab[0] * ab[0] + ab[1] * ab[1];
  if (len2 === 0) return Math.sqrt(ap[0] * ap[0] + ap[1] * ap[1]);
  const t = Math.max(0, Math.min(1, (ap[0] * ab[0] + ap[1] * ab[1]) / len2));
  const proj = [a[0] + t * ab[0], a[1] + t * ab[1]];
  return Math.sqrt((p[0] - proj[0]) ** 2 + (p[1] - proj[1]) ** 2);
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-slice a BathyWindow to a bounding-box.
// Matches Python: ds_gebco.sel(lat=slice(min_lat, max_lat), ...) per iteration.
// CRITICAL for performance: keeps node count low per iteration.
// ─────────────────────────────────────────────────────────────────────────────
function sliceWindow(win, minLat, maxLat, minLon, maxLon) {
  const { latStart, latStep, lonStart, lonStep, width, height, data } = win;
  const latStepAbs = Math.abs(latStep);
  const lonStepAbs = Math.abs(lonStep);

  let rMin, rMax;
  if (latStep < 0) {
    // latStart = northernmost lat, rows go south
    rMin = Math.max(0, Math.floor((latStart - maxLat) / latStepAbs));
    rMax = Math.min(height - 1, Math.ceil((latStart - minLat) / latStepAbs));
  } else {
    // latStart = southernmost lat, rows go north
    rMin = Math.max(0, Math.floor((minLat - latStart) / latStep));
    rMax = Math.min(height - 1, Math.ceil((maxLat - latStart) / latStep));
  }
  const cMin = Math.max(0, Math.floor((minLon - lonStart) / lonStepAbs));
  const cMax = Math.min(width - 1, Math.ceil((maxLon - lonStart) / lonStepAbs));

  if (rMin > rMax || cMin > cMax) return null;
  const newW = cMax - cMin + 1;
  const newH = rMax - rMin + 1;
  if (newW < 3 || newH < 3) return null;

  const newData = new Float32Array(newW * newH);
  for (let r = 0; r < newH; r++) {
    const srcRow = (rMin + r) * width + cMin;
    newData.set(data.subarray(srcRow, srcRow + newW), r * newW);
  }
  return {
    data: newData, width: newW, height: newH,
    latStart: latStart + rMin * latStep, latStep,
    lonStart: lonStart + cMin * lonStep, lonStep,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Block-adaptive node generation (matching Python B_cells approach):
//   open-water blocks  → 1 representative node per B_CELLS×B_CELLS block (coarse)
//   land-adjacent blocks → dense grid at cFactor pixels apart (fine)
// + capsule filter  : only nodes within capsuleRadDeg of A→B line
// + danger score    : 1.7x near shallow water, 1.0 in open ocean
// Matches Python: B_cells = 15*c_factor, block-level adaptive sampling
// ─────────────────────────────────────────────────────────────────────────────
function buildAdaptiveGrid(win, safeD, cFactor, capsuleRadDeg, p1, p2) {
  const B_CELLS = 15 * cFactor;
  const A = [p1.lat, p1.lon];
  const B = [p2.lat, p2.lon];
  const AB = [B[0] - A[0], B[1] - A[1]];
  const lenSqAB = AB[0] * AB[0] + AB[1] * AB[1];

  const H = win.height, W = win.width;
  const rawR = [], rawC = [];

  // Block-adaptive sampling: fine near land, coarse in open ocean
  for (let bi = 0; bi < H; bi += B_CELLS) {
    const rEnd = Math.min(bi + B_CELLS, H);
    for (let bj = 0; bj < W; bj += B_CELLS) {
      const cEnd = Math.min(bj + B_CELLS, W);

      // Check if block contains any shallow/land pixels
      let hasShallow = false;
      outerB: for (let r = bi; r < rEnd; r++)
        for (let c = bj; c < cEnd; c++) {
          const v = win.data[r * W + c];
          if (!isNaN(v) && v <= 8000 && v > safeD) { hasShallow = true; break outerB; }
        }

      if (hasShallow) {
        // Dense grid: every cFactor pixels within block
        for (let r = bi; r < rEnd; r += cFactor)
          for (let c = bj; c < cEnd; c += cFactor) {
            rawR.push(r); rawC.push(c);
          }
      } else {
        // Coarse: single center representative node
        rawR.push(Math.floor((bi + rEnd) / 2));
        rawC.push(Math.floor((bj + cEnd) / 2));
      }
    }
  }

  // Apply depth filter + capsule filter + danger score
  const nodes = [];
  for (let k = 0; k < rawR.length; k++) {
    const r = rawR[k], c = rawC[k];
    if (r >= H || c >= W) continue;
    const v = win.data[r * W + c];
    if (isNaN(v) || v > 8000 || v < -11000 || v > safeD) continue;

    const lat = win.latStart + r * win.latStep;
    const lon = win.lonStart + c * win.lonStep;

    // Capsule distance filter (perpendicular dist from A→B line)
    const AP = [lat - A[0], lon - A[1]];
    let perpDist;
    if (lenSqAB === 0) {
      perpDist = Math.sqrt(AP[0] * AP[0] + AP[1] * AP[1]);
    } else {
      const t = Math.max(0, Math.min(1, (AP[0] * AB[0] + AP[1] * AB[1]) / lenSqAB));
      const dx = lat - (A[0] + t * AB[0]), dy = lon - (A[1] + t * AB[1]);
      perpDist = Math.sqrt(dx * dx + dy * dy);
    }
    if (perpDist > capsuleRadDeg) continue;

    // Danger score: 1.7x if any nearby pixel is shallow
    let danger = 1.0;
    const rUp = Math.min(r + 3, H - 1), rDn = Math.max(r - 3, 0);
    const cRt = Math.min(c + 3, W - 1), cLf = Math.max(c - 3, 0);
    outerD: for (let nr = rDn; nr <= rUp; nr++)
      for (let nc = cLf; nc <= cRt; nc++) {
        const nv = win.data[nr * W + nc];
        if (!isNaN(nv) && nv <= 8000 && nv > safeD) { danger = 1.7; break outerD; }
      }

    nodes.push({ lat, lon, depth: v, danger });
  }
  return nodes;
}

// ─────────────────────────────────────────────────────────────────────────────
// Build a capsule-filtered grid of valid deep-water nodes
// Matches Python: capsule_mask + node_danger_score (1.7x near shallow)
// ─────────────────────────────────────────────────────────────────────────────
function buildValidGrid(win, safeD, step, originPt, destPt, capsuleRadDeg) {
  const A = [originPt.lat, originPt.lon];
  const B = [destPt.lat,   destPt.lon];
  const nodes = [];
  for (let r = 0; r < win.height; r += step) {
    for (let c = 0; c < win.width; c += step) {
      const v = win.data[r * win.width + c];
      if (isNaN(v) || v > 8000 || v < -11000 || v > safeD) continue;
      const lat = win.latStart + r * win.latStep;
      const lon = win.lonStart + c * win.lonStep;
      // Capsule filter – matches Python capsule_mask
      if (capsuleDist([lat, lon], A, B) > capsuleRadDeg) continue;
      // Danger score: 1.7x near shallow water, 1.0 in open ocean (matching Python)
      let danger = 1.0;
      const rU = Math.min(r + 3, win.height - 1);
      const rD = Math.max(r - 3, 0);
      const cR = Math.min(c + 3, win.width  - 1);
      const cL = Math.max(c - 3, 0);
      outer: for (let nr = rD; nr <= rU; nr++) {
        for (let nc = cL; nc <= cR; nc++) {
          const nv = win.data[nr * win.width + nc];
          if (!isNaN(nv) && nv <= 8000 && nv > safeD) { danger = 1.7; break outer; }
        }
      }
      nodes.push({ lat, lon, depth: v, danger });
    }
  }
  return nodes;
}

// ─────────────────────────────────────────────────────────────────────────────
// Add dense halo nodes near origin/destination
// Matches Python: halo_lats/halo_lons (r_halo = max(15, c_factor*5))
// Ensures A* connectivity even when capsule is very narrow near coasts
// FIX: iterate only within the halo pixel-box, not the entire window (was O(W×H))
// ─────────────────────────────────────────────────────────────────────────────
function addHaloNodes(win, safeD, nodes, points, haloRadDeg) {
  const seen = new Set(nodes.map(n => `${n.lat.toFixed(5)},${n.lon.toFixed(5)}`));
  const latStepAbs = Math.abs(win.latStep);
  const lonStepAbs = Math.abs(win.lonStep);
  for (const pt of points) {
    // Compute centre pixel
    const rCenter = Math.round((pt.lat - win.latStart) / win.latStep);
    const cCenter = Math.round((pt.lon - win.lonStart) / win.lonStep);
    const rHalo   = Math.ceil(haloRadDeg / latStepAbs) + 1;
    const cHalo   = Math.ceil(haloRadDeg / lonStepAbs) + 1;
    const rMin = Math.max(0, rCenter - rHalo);
    const rMax = Math.min(win.height - 1, rCenter + rHalo);
    const cMin = Math.max(0, cCenter - cHalo);
    const cMax = Math.min(win.width  - 1, cCenter + cHalo);
    for (let r = rMin; r <= rMax; r++) {
      for (let c = cMin; c <= cMax; c++) {
        const v = win.data[r * win.width + c];
        if (isNaN(v) || v > 8000 || v < -11000 || v > safeD) continue;
        const lat = win.latStart + r * win.latStep;
        const lon = win.lonStart + c * win.lonStep;
        const key = `${lat.toFixed(5)},${lon.toFixed(5)}`;
        if (!seen.has(key)) { seen.add(key); nodes.push({ lat, lon, depth: v, danger: 1.0 }); }
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Pre-build adjacency list using sorted-lat binary-search KNN
// FIX 1: typed arrays instead of {j,d} objects → eliminates GC pressure
// FIX 2: no corridor check for short edges (<2 grid spacings) → ensures graph
//         connectivity; corridor check only for longer edges
// Matches Python KDTree k_neighbors=16
// ─────────────────────────────────────────────────────────────────────────────
function buildAdjacency(nodes, win, safeD, maxJumpDeg) {
  const n   = nodes.length;
  const adj = Array.from({ length: n }, () => []);
  const K   = 16;
  const MAX_CORRIDOR_STEPS = 20;

  // Sort node indices by lat
  const sortedIdxArr = Array.from({ length: n }, (_, i) => i);
  sortedIdxArr.sort((a, b) => nodes[a].lat - nodes[b].lat);
  const sortedLats = new Float64Array(n);
  for (let k = 0; k < n; k++) sortedLats[k] = nodes[sortedIdxArr[k]].lat;

  function lowerBound(target) {
    let lo = 0, hi = n;
    while (lo < hi) { const m = (lo + hi) >> 1; if (sortedLats[m] < target) lo = m + 1; else hi = m; }
    return lo;
  }
  function upperBound(target) {
    let lo = 0, hi = n;
    while (lo < hi) { const m = (lo + hi) >> 1; if (sortedLats[m] <= target) lo = m + 1; else hi = m; }
    return lo;
  }

  // Short-edge threshold: matches Python exactly:
  //   c_factor * max(lat_step, lon_step) * 60 * 1.5 NM
  // Since maxJumpDeg = B_CELLS * pixelSize * 2.5 = 15*cFactor * pixelSize * 2.5,
  //   cFactor * pixelSize = maxJumpDeg / 37.5
  //   shortEdgeNm = maxJumpDeg / 37.5 * 60 * 1.5 = maxJumpDeg * 2.4
  const shortEdgeNm = maxJumpDeg * 2.4;

  // Reusable typed buffers for K-nearest (avoid per-node object allocation)
  const kNearJ = new Int32Array(K);
  const kNearD = new Float64Array(K);

  const DEG2RAD = Math.PI / 180.0;

  for (let i = 0; i < n; i++) {
    const li     = nodes[i].lat;
    const oi     = nodes[i].lon;
    const cosLat = Math.cos(li * DEG2RAD);
    const dangI  = nodes[i].danger || 1.0;

    const jStart = lowerBound(li - maxJumpDeg);
    const jEnd   = upperBound(li + maxJumpDeg);

    // K-nearest selection via typed-array max-heap (no object allocation)
    let kCount = 0;
    let kMaxM  = 0;
    let kMaxD  = 0.0;

    for (let k = jStart; k < jEnd; k++) {
      const j = sortedIdxArr[k];
      if (j <= i) continue;                             // avoid duplicate edges
      const dLon = nodes[j].lon - oi;
      if (dLon < -maxJumpDeg || dLon > maxJumpDeg) continue;
      const dLat  = nodes[j].lat - li;
      const dLonS = dLon * cosLat;
      const d     = Math.sqrt(dLat * dLat + dLonS * dLonS) * 60.0; // NM
      if (d < 0.01) continue;

      if (kCount < K) {
        kNearJ[kCount] = j;
        kNearD[kCount] = d;
        kCount++;
        if (kCount === K) {
          // Find the max element position
          kMaxM = 0;
          for (let m = 1; m < K; m++) if (kNearD[m] > kNearD[kMaxM]) kMaxM = m;
          kMaxD = kNearD[kMaxM];
        }
      } else if (d < kMaxD) {
        kNearJ[kMaxM] = j;
        kNearD[kMaxM] = d;
        kMaxM = 0;
        for (let m = 1; m < K; m++) if (kNearD[m] > kNearD[kMaxM]) kMaxM = m;
        kMaxD = kNearD[kMaxM];
      }
    }

    // Add edges
    for (let m = 0; m < kCount; m++) {
      const j = kNearJ[m];
      const d = kNearD[m];
      // Short edges (≤ c_factor * pixel * 1.5 NM): add unconditionally for grid connectivity.
      // Long edges: corridor check prevents land-crossing shortcuts.
      if (d > shortEdgeNm) {
        if (!isSafeCorridorLine(win, li, oi, nodes[j].lat, nodes[j].lon, safeD, 0, MAX_CORRIDOR_STEPS)) continue;
      }
      const w = d * Math.max(dangI, nodes[j].danger || 1.0);
      adj[i].push({ ni: j, w });
      adj[j].push({ ni: i, w });
    }
  }
  return adj;
}

// ─────────────────────────────────────────────────────────────────────────────
// A* on pre-built adjacency graph
// Matches Python live_astar_path: visited set + 1.5x weighted heuristic
// ─────────────────────────────────────────────────────────────────────────────
function astar(nodes, adj, si, ei) {
  const n       = nodes.length;
  const dist    = new Float64Array(n).fill(Infinity);
  const prev    = new Int32Array(n).fill(-1);
  const visited = new Uint8Array(n);
  dist[si] = 0;

  const heap = new MinHeap();
  heap.push(0, si);

  while (heap.size) {
    const { item: cur } = heap.pop();
    if (visited[cur]) continue;
    visited[cur] = 1;
    if (cur === ei) break;
    for (const { ni, w } of (adj[cur] || [])) {
      if (visited[ni]) continue;
      const nd = dist[cur] + w;
      if (nd < dist[ni]) {
        dist[ni] = nd;
        prev[ni] = cur;
        // 1.5x weighted heuristic – matches Python: priority = new_cost + 1.5 * heuristic
        const h = fastNm(nodes[ni].lat, nodes[ni].lon, nodes[ei].lat, nodes[ei].lon);
        heap.push(nd + 1.5 * h, ni);
      }
    }
  }

  if (dist[ei] === Infinity) return null;
  const path = [];
  let cur = ei;
  while (cur !== -1) { path.push(cur); cur = prev[cur]; }
  path.reverse();
  return { path, dist: dist[ei] };
}

// ─────────────────────────────────────────────────────────────────────────────
// Smooth a path – remove zig-zag nodes (lookahead 60, matching Python)
// Uses capped corridor steps so it doesn't blow up on large GEBCO windows.
// ─────────────────────────────────────────────────────────────────────────────
function smoothPath(path, nodes, win, safeD) {
  if (path.length <= 2) return path;
  const out = [path[0]];
  let cur = 0;
  while (cur < path.length - 1) {
    let furthest = cur + 1;
    for (let nxt = Math.min(path.length - 1, cur + 60); nxt > cur + 1; nxt--) {
      const { lat: l1, lon: o1 } = nodes[path[cur]];
      const { lat: l2, lon: o2 } = nodes[path[nxt]];
      // Full pixel-resolution corridor check (no step cap) — ensures narrow straits like
      // Selat Larantuka are not missed. A 30-sample cap was previously under-sampling:
      // a 13 NM jump on GEBCO 0.004°/px needs ~375 samples, not 30.
      if (isSafeCorridorLine(win, l1, o1, l2, o2, safeD, 2)) { furthest = nxt; break; }
    }
    out.push(path[furthest]);
    cur = furthest;
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Bezier ship maneuver curves at each turn
// Matches Python: turn_radius_m = 5.0 * MAX_LPP, 5 Bezier points t=0,0.25,0.5,0.75,1.0
// ─────────────────────────────────────────────────────────────────────────────
function applyBezierManeuvers(waypoints) {
  if (waypoints.length < 3) return waypoints;
  const rNm    = (5.0 * MAX_LPP) / 1852.0;   // turn radius in NM
  const result = [waypoints[0]];

  for (let k = 1; k < waypoints.length - 1; k++) {
    const pPrev = waypoints[k - 1];
    const pCurr = waypoints[k];
    const pNext = waypoints[k + 1];

    const dPrevNm = fastNm(pPrev[0], pPrev[1], pCurr[0], pCurr[1]);
    const dNextNm = fastNm(pCurr[0], pCurr[1], pNext[0], pNext[1]);
    if (dPrevNm < 0.1 || dNextNm < 0.1) { result.push(pCurr); continue; }

    const cutNm     = Math.min(rNm, dPrevNm / 2.1, dNextNm / 2.1);
    const vPrev     = [pPrev[0] - pCurr[0], pPrev[1] - pCurr[1]];
    const vNext     = [pNext[0] - pCurr[0], pNext[1] - pCurr[1]];
    const lonScale  = Math.cos(pCurr[0] * Math.PI / 180);
    const dPrevDeg  = Math.sqrt(vPrev[0] ** 2 + (vPrev[1] * lonScale) ** 2);
    const dNextDeg  = Math.sqrt(vNext[0] ** 2 + (vNext[1] * lonScale) ** 2);
    const cutPrev   = dPrevDeg > 0 ? cutNm / 60.0 : 0;
    const cutNext   = dNextDeg > 0 ? cutNm / 60.0 : 0;

    const p0 = dPrevDeg > 0
      ? [pCurr[0] + vPrev[0] * (cutPrev / dPrevDeg), pCurr[1] + vPrev[1] * (cutPrev / dPrevDeg)]
      : pCurr;
    const p2 = dNextDeg > 0
      ? [pCurr[0] + vNext[0] * (cutNext / dNextDeg), pCurr[1] + vNext[1] * (cutNext / dNextDeg)]
      : pCurr;
    const p1 = pCurr;

    for (const t of [0.0, 0.25, 0.5, 0.75, 1.0]) {
      result.push([
        (1 - t) * (1 - t) * p0[0] + 2 * (1 - t) * t * p1[0] + t * t * p2[0],
        (1 - t) * (1 - t) * p0[1] + 2 * (1 - t) * t * p1[1] + t * t * p2[1],
      ]);
    }
  }
  result.push(waypoints[waypoints.length - 1]);
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Organic interpolation: insert points every 3 NM
// Matches Python: final_organic_path (dist_leg > 3.0)
// ─────────────────────────────────────────────────────────────────────────────
function applyOrganicInterpolation(waypoints, intervalNm = 3.0) {
  if (waypoints.length < 2) return waypoints;
  const out = [waypoints[0]];
  for (let i = 0; i < waypoints.length - 1; i++) {
    const [l1, o1] = waypoints[i];
    const [l2, o2] = waypoints[i + 1];
    const d = fastNm(l1, o1, l2, o2);
    if (d > intervalNm) {
      const numInserts = Math.floor(d / intervalNm);
      for (let ins = 1; ins <= numInserts; ins++) {
        const frac = ins / (numInserts + 1);
        out.push([l1 + frac * (l2 - l1), o1 + frac * (o2 - o1)]);
      }
    }
    out.push([l2, o2]);
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Macro satellite pre-routing: coarse A* over full window to find milestone
// waypoints for long routes. Matches Python ENGINE 1.5: ULTRA-FINE MACRO
// SATELLITE PRE-SCAN.
// stride = max(2, 0.025/pixelSize, sqrt(totalPx/40000)) → nodes ≤ 40k.
// Returns array of {lat,lon} milestone checkpoints ~50 NM apart (empty on fail).
// ─────────────────────────────────────────────────────────────────────────────
function _computeMacroWaypoints(win, p1, p2, safeD) {
  const pixelSizeDeg = Math.max(Math.abs(win.latStep), Math.abs(win.lonStep));
  const totalPx = win.width * win.height;
  // stride matches Python: stride_r = max(1, round(0.025 / lat_step_abs))
  // also cap to keep node count ≤ 40k
  const macroStep = Math.max(
    2,
    Math.round(0.025 / pixelSizeDeg),
    Math.floor(Math.sqrt(totalPx / 40000)),
  );

  // Build full-window coarse nodes (no capsule filter — macro covers whole bbox)
  const nodes = [];
  for (let r = 0; r < win.height; r += macroStep) {
    for (let c = 0; c < win.width; c += macroStep) {
      const v = win.data[r * win.width + c];
      if (isNaN(v) || v > 8000 || v < -11000 || v > safeD) continue;
      nodes.push({
        lat: win.latStart + r * win.latStep,
        lon: win.lonStart + c * win.lonStep,
        depth: v, danger: 1.0,
      });
    }
  }
  if (nodes.length < 4) return [];

  nodes.push({ lat: p1.lat, lon: p1.lon, depth: 0, danger: 1.0 });
  nodes.push({ lat: p2.lat, lon: p2.lon, depth: 0, danger: 1.0 });
  const si = nodes.length - 2;
  const ei = nodes.length - 1;
  const n  = nodes.length;

  const maxJumpDeg = macroStep * pixelSizeDeg * 4.0;
  const K = 8;  // fewer neighbours — macro only needs rough connectivity
  const DEG2RAD = Math.PI / 180;

  // Sorted-lat KNN adjacency (no corridor check — macro resolution is too coarse)
  const sortedIdx = Array.from({ length: n }, (_, i) => i);
  sortedIdx.sort((a, b) => nodes[a].lat - nodes[b].lat);
  const sortedLats = new Float64Array(n);
  for (let k = 0; k < n; k++) sortedLats[k] = nodes[sortedIdx[k]].lat;
  function mlb(t){let lo=0,hi=n;while(lo<hi){const m=(lo+hi)>>1;if(sortedLats[m]<t)lo=m+1;else hi=m;}return lo;}
  function mub(t){let lo=0,hi=n;while(lo<hi){const m=(lo+hi)>>1;if(sortedLats[m]<=t)lo=m+1;else hi=m;}return lo;}

  const adj = Array.from({ length: n }, () => []);
  const kJ  = new Int32Array(K);
  const kD  = new Float64Array(K);
  for (let i = 0; i < n; i++) {
    const li = nodes[i].lat, oi = nodes[i].lon;
    const cosLat = Math.cos(li * DEG2RAD);
    let kCount = 0, kMaxM = 0, kMaxD = 0;
    for (let k = mlb(li - maxJumpDeg); k < mub(li + maxJumpDeg); k++) {
      const j = sortedIdx[k]; if (j <= i) continue;
      const dLon = nodes[j].lon - oi;
      if (Math.abs(dLon) > maxJumpDeg) continue;
      const dLat = nodes[j].lat - li;
      const d = Math.sqrt(dLat * dLat + (dLon * cosLat) ** 2) * 60;
      if (d < 0.01) continue;
      if (kCount < K) {
        kJ[kCount] = j; kD[kCount] = d; kCount++;
        if (kCount === K) { kMaxM = 0; for (let m = 1; m < K; m++) if (kD[m] > kD[kMaxM]) kMaxM = m; kMaxD = kD[kMaxM]; }
      } else if (d < kMaxD) {
        kJ[kMaxM] = j; kD[kMaxM] = d; kMaxM = 0; for (let m = 1; m < K; m++) if (kD[m] > kD[kMaxM]) kMaxM = m; kMaxD = kD[kMaxM];
      }
    }
    for (let m = 0; m < kCount; m++) {
      const jm = kJ[m]; const dm = kD[m];
      // Macro phase: NO corridor check (matches Python macro satellite).
      // Only pixel depth at each node is checked — enough at coarse resolution.
      adj[i].push({ ni: jm, w: dm });
      adj[jm].push({ ni: i, w: dm });
    }
  }

  // Force-connect origin/dest if isolated
  for (const vi of [si, ei]) {
    if (!adj[vi].length) {
      nodes.map((nd, idx) => ({ idx, d: fastNm(nodes[vi].lat, nodes[vi].lon, nd.lat, nd.lon) }))
        .filter(x => x.idx !== vi).sort((a, b) => a.d - b.d).slice(0, 5)
        .forEach(({ idx, d }) => { adj[vi].push({ ni: idx, w: d }); adj[idx].push({ ni: vi, w: d }); });
    }
  }

  const result = astar(nodes, adj, si, ei);
  if (!result || result.path.length < 3) return [];

  // Extract milestone waypoints every ~50 NM (skip start/end)
  const milestones = [];
  let accDist = 0;
  for (let k = 1; k < result.path.length - 1; k++) {
    const prev = nodes[result.path[k - 1]];
    const curr = nodes[result.path[k]];
    accDist += fastNm(prev.lat, prev.lon, curr.lat, curr.lon);
    if (accDist >= 50) {
      milestones.push({ lat: curr.lat, lon: curr.lon });
      accDist = 0;
    }
  }
  return milestones;
}

// ─────────────────────────────────────────────────────────────────────────────
// Run A* pipeline on one BathyWindow with iterative capsule expansion
// Matches Python build_offline_spatial_network / build_network_gebco flow
// FIX: 5 capsule iterations (was 3), force-connect origin/dest, better gridStep
// For routes >150 NM uses macro satellite pre-routing to find intermediate
// ─────────────────────────────────────────────────────────────────────────────
// Snap a coordinate to the nearest safe-depth pixel in a BathyWindow.
// This is the critical fix for coastal ports (Bontang=+12m, Kupang=+102m in
// GEBCO) whose raw GEBCO depth is positive = land/dry.
// Python equivalent: find_berth_point() pre-snaps before routing.
// maxSearchDeg: search radius in degrees (default 1.0° ≈ 60 NM)
// ─────────────────────────────────────────────────────────────────────────────
function snapToSafeWater(win, lat, lon, safeD, maxSearchDeg = 1.0) {
  const latStepAbs = Math.abs(win.latStep);
  const lonStepAbs = Math.abs(win.lonStep);

  const r0 = Math.round((lat - win.latStart) / win.latStep);
  const c0 = Math.round((lon - win.lonStart) / win.lonStep);

  // Check if already in safe water
  if (r0 >= 0 && r0 < win.height && c0 >= 0 && c0 < win.width) {
    const v0 = win.data[r0 * win.width + c0];
    if (!isNaN(v0) && v0 >= -11000 && v0 <= safeD) {
      return { lat, lon, depth: v0, snapped: false };
    }
  }

  // Scan bounding box for nearest safe pixel
  const rSearch = Math.min(win.height - 1, Math.ceil(maxSearchDeg / latStepAbs));
  const cSearch = Math.min(win.width  - 1, Math.ceil(maxSearchDeg / lonStepAbs));
  const rMin = Math.max(0, r0 - rSearch);
  const rMax = Math.min(win.height - 1, r0 + rSearch);
  const cMin = Math.max(0, c0 - cSearch);
  const cMax = Math.min(win.width  - 1, c0 + cSearch);

  let bestDist2 = Infinity, bestLat = lat, bestLon = lon, bestDepth = 0;

  for (let r = rMin; r <= rMax; r++) {
    for (let c = cMin; c <= cMax; c++) {
      const v = win.data[r * win.width + c];
      if (isNaN(v) || v > 8000 || v < -11000 || v > safeD) continue;
      const bLat = win.latStart + r * win.latStep;
      const bLon = win.lonStart + c * win.lonStep;
      const dist2 = (bLat - lat) ** 2 + (bLon - lon) ** 2;
      if (dist2 < bestDist2) {
        bestDist2 = dist2; bestLat = bLat; bestLon = bLon; bestDepth = v;
      }
    }
  }

  return {
    lat: bestLat, lon: bestLon, depth: bestDepth,
    snapped: bestDist2 < Infinity,
  };
}

// milestones, then routes each ~50 NM segment — significantly faster.
// ─────────────────────────────────────────────────────────────────────────────
async function _computeWithWindow(win, p1, p2, safeD, _isMacroSegment = false) {
  // 0. Pre-snap: if origin/dest sit on land/shallow (common for coastal ports
  //    like Bontang +12m, Kupang +102m in GEBCO), shift to nearest safe pixel.
  //    Use deeper threshold (min -20m) so snap lands in proper navigable water,
  //    not the 5–8m transition shelf that isolates the node from the main graph.
  const snapDepth = Math.min(safeD, -20.0);
  const sp1 = snapToSafeWater(win, p1.lat, p1.lon, snapDepth);
  const sp2 = snapToSafeWater(win, p2.lat, p2.lon, snapDepth);
  // If deeper snap fails (very shallow area), fall back to safeD snap
  const sp1f = sp1.snapped ? sp1 : snapToSafeWater(win, p1.lat, p1.lon, safeD);
  const sp2f = sp2.snapped ? sp2 : snapToSafeWater(win, p2.lat, p2.lon, safeD);
  const ep1 = sp1f.snapped ? { ...p1, lat: sp1f.lat, lon: sp1f.lon } : p1;
  const ep2 = sp2f.snapped ? { ...p2, lat: sp2f.lat, lon: sp2f.lon } : p2;
  if (sp1f.snapped) console.log(`[SpatialRoute] snap p1: (${p1.lat.toFixed(4)},${p1.lon.toFixed(4)}) → (${ep1.lat.toFixed(4)},${ep1.lon.toFixed(4)}) depth=${sp1f.depth}m`);
  if (sp2f.snapped) console.log(`[SpatialRoute] snap p2: (${p2.lat.toFixed(4)},${p2.lon.toFixed(4)}) → (${ep2.lat.toFixed(4)},${ep2.lon.toFixed(4)}) depth=${sp2f.depth}m`);

  // Helper: wrap final waypoints with original p1/p2 endpoints (for top-level
  // calls only; macro segments use milestone coords which are already in sea)
  function wrapWaypoints(wp) {
    if (_isMacroSegment) return wp;
    if (sp1.snapped) wp.unshift([p1.lat, p1.lon]);
    if (sp2.snapped) wp.push([p2.lat, p2.lon]);
    return wp;
  }

  // 1. Straight-line check (buffer_px=2, matching Python)
  if (isSafeCorridorLine(win, ep1.lat, ep1.lon, ep2.lat, ep2.lon, safeD, 2)) {
    const d  = fastNm(ep1.lat, ep1.lon, ep2.lat, ep2.lon);
    const wp = applyOrganicInterpolation([[ep1.lat, ep1.lon], [ep2.lat, ep2.lon]]);
    return { waypoints: wrapWaypoints(wp), distanceNm: d };
  }

  const directNm = fastNm(ep1.lat, ep1.lon, ep2.lat, ep2.lon);

  // ─── Macro satellite pre-routing for long routes (>150 NM) ───────────────
  if (!_isMacroSegment && directNm > 150) {
    const tMacro = Date.now();
    const milestones = _computeMacroWaypoints(win, ep1, ep2, safeD);
    console.log(`[SpatialRoute] macro: ${Date.now() - tMacro}ms  ${milestones.length} milestones for ${directNm.toFixed(0)} NM`);
    if (milestones.length >= 1) {
      const segPts = [ep1, ...milestones, ep2];
      let allWp    = [];
      let totalDist = 0;
      let segFailed = false;
      for (let s = 0; s < segPts.length - 1; s++) {
        const s1 = segPts[s], s2 = segPts[s + 1];
        const segPad = Math.max(1.5, fastNm(s1.lat, s1.lon, s2.lat, s2.lon) * 0.06);
        const subWin = sliceWindow(
          win,
          Math.min(s1.lat, s2.lat) - segPad, Math.max(s1.lat, s2.lat) + segPad,
          Math.min(s1.lon, s2.lon) - segPad, Math.max(s1.lon, s2.lon) + segPad,
        );
        // Macro segments: isMacroSegment=true — milestones are already in safe water
        const segResult = await _computeWithWindow(subWin || win, s1, s2, safeD, true);
        if (!segResult) { segFailed = true; break; }
        allWp.push(...(s === 0 ? segResult.waypoints : segResult.waypoints.slice(1)));
        totalDist += segResult.distanceNm;
      }
      if (!segFailed && allWp.length > 0) {
        console.log(`[SpatialRoute] macro+segs OK: ${totalDist.toFixed(1)} NM  ${allWp.length} wp`);
        return { waypoints: wrapWaypoints(allWp), distanceNm: totalDist };
      }
      console.log(`[SpatialRoute] macro segs failed — fallback to full-route capsule`);
    }
  }

  // ─── Iterative capsule expansion ─────────────────────────────────────────
  const gridScales = [
    [Math.max(1.2,  directNm * 0.008), 2],
    [Math.max(2.5,  directNm * 0.015), 3],
    [Math.max(5.0,  directNm * 0.04),  4],
    [Math.max(8.0,  directNm * 0.07),  5],
    [Math.max(12.0, directNm * 0.12),  6],
  ];

  const t0 = Date.now();
  for (let iter = 0; iter < gridScales.length; iter++) {
    const [capsuleRadDeg, cFactor] = gridScales[iter];
    const B_CELLS = 15 * cFactor;

    const subWin = sliceWindow(
      win,
      Math.min(ep1.lat, ep2.lat) - capsuleRadDeg, Math.max(ep1.lat, ep2.lat) + capsuleRadDeg,
      Math.min(ep1.lon, ep2.lon) - capsuleRadDeg, Math.max(ep1.lon, ep2.lon) + capsuleRadDeg,
    );
    if (!subWin) continue;

    const subPixelSize = Math.max(Math.abs(subWin.latStep), Math.abs(subWin.lonStep));
    const maxJumpDeg   = B_CELLS * subPixelSize * 2.5;
    const haloRadDeg   = Math.max(15, cFactor * 5) * subPixelSize;

    const tGrid = Date.now();
    const nodes = buildAdaptiveGrid(subWin, safeD, cFactor, capsuleRadDeg, ep1, ep2);
    const tHalo = Date.now();
    addHaloNodes(subWin, safeD, nodes, [ep1, ep2], haloRadDeg);
    const tAdj = Date.now();

    // Virtual origin/destination nodes (snapped coordinates = already in safe water)
    nodes.push({ lat: ep1.lat, lon: ep1.lon, depth: 0, danger: 1.0 });
    nodes.push({ lat: ep2.lat, lon: ep2.lon, depth: 0, danger: 1.0 });
    const si = nodes.length - 2;
    const ei = nodes.length - 1;
    if (nodes.length < 4) continue;

    const adj = buildAdjacency(nodes, subWin, safeD, maxJumpDeg);
    const tAstar = Date.now();

    // ALWAYS force-connect si and ei — even when buildAdjacency already added
    // edges via reverse KNN, those edges may lead into an isolated coastal shelf
    // cluster that is disconnected from the main sea graph (coastal shallow zone
    // blocks all long-range corridor checks). Two-tier approach:
    //   tier-1: 12 nearest nodes (local cluster connectivity)
    //   tier-2: 6 nearest deep-ocean nodes depth<-50m (main-graph bridge)
    // Uses a bounding-box pre-filter to keep the scan O(local) not O(n).
    const scanRadDeg = maxJumpDeg * 5;
    for (const vi of [si, ei]) {
      const { lat: vl, lon: vo } = nodes[vi];
      const otherVi = vi === si ? ei : si;

      // Collect candidates within scanRadDeg box
      const cands = [];
      for (let ni = 0; ni < si; ni++) {  // skip virtual si/ei (last 2)
        const nd = nodes[ni];
        const dLat = nd.lat - vl;
        if (dLat < -scanRadDeg || dLat > scanRadDeg) continue;
        const dLon = nd.lon - vo;
        if (dLon < -scanRadDeg || dLon > scanRadDeg) continue;
        cands.push({ idx: ni, d: fastNm(vl, vo, nd.lat, nd.lon), depth: nd.depth || 0 });
      }
      cands.sort((a, b) => a.d - b.d);

      // Tier-1: 12 nearest (unconditional — ensures local cluster reachable)
      const tier1Set = new Set();
      for (const { idx, d } of cands.slice(0, 12)) {
        adj[vi].push({ ni: idx, w: d });
        adj[idx].push({ ni: vi, w: d });
        tier1Set.add(idx);
      }

      // Tier-2: up to 6 nearest deep-ocean nodes (depth < -50m)
      // These are guaranteed members of the main connected component
      let deepCount = 0;
      for (const { idx, d, depth } of cands) {
        if (tier1Set.has(idx)) continue;
        if (depth < -50) {
          adj[vi].push({ ni: idx, w: d });
          adj[idx].push({ ni: vi, w: d });
          if (++deepCount >= 6) break;
        }
      }
      // If still no deep node found in local box, scan wider (rare: very shallow bay)
      if (deepCount === 0) {
        for (let ni = 0; ni < si; ni++) {
          if ((nodes[ni].depth || 0) >= -50) continue;
          const d = fastNm(vl, vo, nodes[ni].lat, nodes[ni].lon);
          adj[vi].push({ ni, w: d });
          adj[ni].push({ ni: vi, w: d });
          if (++deepCount >= 4) break;
        }
      }
    }

    const result = astar(nodes, adj, si, ei);
    const tEnd = Date.now();
    console.log(`[SpatialRoute] iter ${iter}: capsR=${capsuleRadDeg.toFixed(2)}° cF=${cFactor} nodes=${nodes.length} subWin=${subWin.width}×${subWin.height} grid=${tHalo-tGrid}ms halo=${tAdj-tHalo}ms adj=${tAstar-tAdj}ms astar=${tEnd-tAstar}ms total=${tEnd-t0}ms path=${result?'found':'null'}`);
    if (!result) continue;

    const tSmooth0 = Date.now();
    const smoothed = smoothPath(result.path, nodes, subWin, safeD);
    console.log(`[SpatialRoute] smoothPath: ${Date.now()-tSmooth0}ms  ${result.path.length}→${smoothed.length} nodes`);

    const rawWp      = smoothed.map(i => [nodes[i].lat, nodes[i].lon]);
    const withBezier = applyBezierManeuvers(rawWp);
    const finalWp    = applyOrganicInterpolation(withBezier);

    let dist = 0;
    for (let i = 0; i < finalWp.length - 1; i++) {
      dist += fastNm(finalWp[i][0], finalWp[i][1], finalWp[i + 1][0], finalWp[i + 1][1]);
    }
    return { waypoints: wrapWaypoints(finalWp), distanceNm: dist };
  }

  return null; // all capsule widths failed
}

// ─────────────────────────────────────────────────────────────────────────────
// Extract min/max depth along waypoints
// ─────────────────────────────────────────────────────────────────────────────
async function _depthProfile(waypoints, win) {
  if (!win) return { minDepth: 0, maxDepth: 0 };
  let mn = Infinity, mx = -Infinity;
  for (const [lat, lon] of waypoints) {
    const { getElevation } = require('./bathymetryService');
    const d = getElevation(win, lat, lon);
    if (!isNaN(d)) { mn = Math.min(mn, d); mx = Math.max(mx, d); }
  }
  return { minDepth: mn === Infinity ? 0 : mn, maxDepth: mx === -Infinity ? 0 : mx };
}

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC: computeRoute
// ─────────────────────────────────────────────────────────────────────────────
// In-process dedup guard: prevents concurrent requests for the same route key
// from each running a full A* computation. Cleared once the DB write completes.
const _pendingRoutes = new Map();

/**
 * @param {{ lat: number, lon: number, name: string }} origin
 * @param {{ lat: number, lon: number, name: string }} destination
 * @param {{
 *   draft?: number,          vessel design draft (m), default MAX_DESIGN_DRAFT
 *   waveHeight?: number,     max wave height (m)
 *   forceRecompute?: boolean
 *   maxJettyM?: number
 * }} options
 */
async function computeRoute(origin, destination, options = {}) {
  const {
    draft = MAX_DESIGN_DRAFT,
    waveHeight = 0,
    forceRecompute = false,
    // bathyEngine: 'batnas' | 'gebco' (default). Strict single-source — no hybrid fallback between them.
    bathyEngine = 'gebco',
  } = options;
  const safeD = -(draft + UKC_CLEARANCE + 0.5 * waveHeight);

  const key = makeRouteKey(origin.name || `${origin.lat},${origin.lon}`,
                            destination.name || `${destination.lat},${destination.lon}`);

  // Cache hit
  if (!forceRecompute) {
    try {
      const cached = await prisma.spatialRouteCache.findUnique({ where: { routeKey: key } });
      if (cached) return { ...cached, waypoints: cached.waypoints, fromCache: true };
    } catch (_) { /* continue */ }
  }

  // In-process dedup: reuse pending computation for concurrent same-key calls
  if (!forceRecompute && _pendingRoutes.has(key)) {
    return _pendingRoutes.get(key);
  }

  // Register a deferred promise so concurrent callers wait for this result
  let _resolve, _reject;
  const _deferred = new Promise((res, rej) => { _resolve = res; _reject = rej; });
  if (!forceRecompute) _pendingRoutes.set(key, _deferred);

  try {
    const directNm = fastNm(origin.lat, origin.lon, destination.lat, destination.lon);

  // Pad = route-adaptive: use 5% of direct distance, min 2°, max 8°
  // This ensures the GEBCO window is large enough for detours around islands
  const pad = Math.min(8.0, Math.max(2.0, directNm * 0.05));
  const bbox = {
    minLat: Math.min(origin.lat, destination.lat) - pad,
    maxLat: Math.max(origin.lat, destination.lat) + pad,
    minLon: Math.min(origin.lon, destination.lon) - pad,
    maxLon: Math.max(origin.lon, destination.lon) + pad,
  };

  let routeResult = null;
  let engineUsed  = null;
  let win         = null;

  // Strict single-source bathymetry selection (no hybrid fallback between BATNAS and GEBCO).
  // bathyEngine === 'batnas': use BATNAS only (high-res TIF, Indonesia).
  // bathyEngine === 'gebco' (default): use GEBCO only (global NetCDF).
  if (bathyEngine === 'batnas') {
    try {
      const batnasPad = Math.min(3.0, pad);
      win = await getBatnas(
        Math.min(origin.lat, destination.lat) - batnasPad,
        Math.max(origin.lat, destination.lat) + batnasPad,
        Math.min(origin.lon, destination.lon) - batnasPad,
        Math.max(origin.lon, destination.lon) + batnasPad,
      );
      if (win) {
        routeResult = await _computeWithWindow(win, origin, destination, safeD);
        if (routeResult) engineUsed = 'batnas';
      }
    } catch (e) {
      console.warn('[SpatialRoute] BATNAS error:', e.message);
    }
  } else {
    // bathyEngine === 'gebco' (default)
    try {
      const tG0 = Date.now();
      win = await getGebco(bbox.minLat, bbox.maxLat, bbox.minLon, bbox.maxLon);
      if (win) {
        console.log(`[SpatialRoute] getGebco: ${Date.now()-tG0}ms  ${win.width}×${win.height}`);
        const tR0 = Date.now();
        routeResult = await _computeWithWindow(win, origin, destination, safeD);
        console.log(`[SpatialRoute] _computeWithWindow: ${Date.now()-tR0}ms`);
        if (routeResult) engineUsed = 'gebco';
      }
    } catch (e) {
      console.warn('[SpatialRoute] GEBCO error:', e.message);
    }
  }

  if (!routeResult) {
    throw new Error(
      `[SpatialRoute] Tidak dapat menghitung rute laut dari "${origin.name || `${origin.lat},${origin.lon}`}" ` +
      `ke "${destination.name || `${destination.lat},${destination.lon}`}": ` +
      `BATNAS dan GEBCO gagal. Pastikan file data bathymetri tersedia.`
    );
  }

  // Depth profile
  const tD0 = Date.now();
  const { minDepth, maxDepth } = await _depthProfile(routeResult.waypoints, win);
  console.log(`[SpatialRoute] _depthProfile: ${Date.now()-tD0}ms`);

  // Weather zones
  const tIho0 = Date.now();
  const weatherZones = await ihoSvc.getZonesForBbox(bbox.minLat, bbox.maxLat, bbox.minLon, bbox.maxLon);
  console.log(`[SpatialRoute] ihoSvc: ${Date.now()-tIho0}ms`);

  const record = {
    routeKey:    key,
    origin:      origin.name || `${origin.lat},${origin.lon}`,
    destination: destination.name || `${destination.lat},${destination.lon}`,
    waypoints:   routeResult.waypoints,
    distanceNm:  routeResult.distanceNm,
    minDepth,
    maxDepth,
    engineUsed,
    safeDepth:   safeD,
    weatherZones,
  };

  // Persist
  try {
    await prisma.spatialRouteCache.upsert({
      where: { routeKey: key },
      update: record,
      create: record,
    });
  } catch (_) { /* non-critical */ }

  const _result = { ...record, fromCache: false };
  if (_resolve) _resolve(_result);
  return _result;
  } catch (e) {
    if (_reject) _reject(e);
    throw e;
  } finally {
    if (!forceRecompute) _pendingRoutes.delete(key);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC: computeJettyReport
// ─────────────────────────────────────────────────────────────────────────────
async function computeJettyReport(locationName, lat, lon, options = {}) {
  const {
    draft = MAX_DESIGN_DRAFT,
    waveHeight = 0,
    maxJettyM = 0,
    // bathyEngine: 'batnas' | 'gebco' (default). Strict single-source.
    bathyEngine = 'gebco',
  } = options;
  const safeD = -(draft + UKC_CLEARANCE + 0.5 * waveHeight);

  // Check DB
  try {
    const cached = await prisma.jettyBerthReport.findUnique({ where: { locationName } });
    if (cached) return cached;
  } catch (_) { /* continue */ }

  const pad = 0.5;
  let win = null;
  let engineUsed = null;

  // Strict single-source bathymetry selection
  if (bathyEngine === 'batnas') {
    try {
      win = await getBatnas(lat - pad, lat + pad, lon - pad, lon + pad);
      if (win) engineUsed = 'batnas';
    } catch (_) { }
  } else {
    // bathyEngine === 'gebco' (default)
    try {
      win = await getGebco(lat - pad, lat + pad, lon - pad, lon + pad);
      if (win) engineUsed = 'gebco';
    } catch (_) { }
  }

  let report;
  if (win) {
    const berth = findBerthPoint(win, lat, lon, safeD, maxJettyM);
    // Estimate land km as distance from original coord to shore (approx 0 since we don't have shore detection here)
    report = {
      locationName,
      origLat: lat,
      origLon: lon,
      shoreLat: lat,
      shoreLon: lon,
      berthLat: berth.berthLat,
      berthLon: berth.berthLon,
      landKm: 0,
      jettyM: berth.jettyM,
      berthDepth: berth.berthDepth,
      engineUsed,
    };
  } else {
    report = {
      locationName,
      origLat: lat, origLon: lon,
      shoreLat: lat, shoreLon: lon,
      berthLat: lat, berthLon: lon,
      landKm: 0, jettyM: 0, berthDepth: 0,
      engineUsed: 'none',
    };
  }

  // Persist
  try {
    await prisma.jettyBerthReport.upsert({
      where: { locationName },
      update: report,
      create: report,
    });
  } catch (_) { /* non-critical */ }

  return report;
}

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC: computeDynamicVoyageHours
// Calculates sailing hours along waypoints accounting for weather speed-loss.
// ─────────────────────────────────────────────────────────────────────────────
async function computeDynamicVoyageHours(waypoints, vessel, weatherCacheByZone) {
  if (!waypoints || waypoints.length < 2) return 0;
  let totalHours = 0;
  for (let i = 0; i < waypoints.length - 1; i++) {
    const [l1, o1] = waypoints[i];
    const [l2, o2] = waypoints[i + 1];
    const d = fastNm(l1, o1, l2, o2);
    const midLat = (l1 + l2) / 2;
    const midLon = (o1 + o2) / 2;
    const zone = await ihoSvc.getActiveZone(midLat, midLon);
    const wx = (zone && weatherCacheByZone && weatherCacheByZone[zone]) || { wave: 0, wind: 0 };
    const spd = calcSpeedLoss(vessel, wx.wave || 0, wx.wind || 0);
    totalHours += d / spd;
  }
  return totalHours;
}

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC: getDynamicOruCapex
// Menghitung CAPEX ORU dinamis menggunakan nearest-neighbor matching dari DB,
// AACE Rule of Six-Tenths (eksponensial 0.6), IKK regional adjustment, dan
// compound inflation ke analysis year.
// ─────────────────────────────────────────────────────────────────────────────

// IKK Data – fallback jika tabel cci tidak tersedia
const IKK_DATA_FALLBACK = {
  'Aceh': 96.61, 'Sumatera Utara': 97.45, 'Sumatera Barat': 93.06, 'Riau': 96.1,
  'Jambi': 95.32, 'Sumatera Selatan': 90.62, 'Bengkulu': 94.2, 'Lampung': 89.12,
  'Kepulauan Bangka Belitung': 105.37, 'Kepulauan Riau': 111.94, 'Dki Jakarta': 114.79,
  'Jawa Barat': 105.3, 'Jawa Tengah': 102.08, 'Di Yogyakarta': 104.88, 'Jawa Timur': 96.29,
  'Banten': 94.18, 'Bali': 107.46, 'Nusa Tenggara Barat': 104.09, 'Nusa Tenggara Timur': 92.42,
  'Kalimantan Barat': 107.34, 'Kalimantan Tengah': 106.56, 'Kalimantan Selatan': 100.7,
  'Kalimantan Timur': 118.3, 'Kalimantan Utara': 107.52, 'Sulawesi Utara': 100.77,
  'Sulawesi Tengah': 91.82, 'Sulawesi Selatan': 95.91, 'Sulawesi Tenggara': 94.71,
  'Gorontalo': 96.51, 'Sulawesi Barat': 91.63, 'Maluku': 106.52, 'Maluku Utara': 114.09,
  'Papua Barat': 124.71, 'Papua Barat Daya': 122.21, 'Papua': 134.96, 'Papua Selatan': 142.98,
  'Papua Tengah': 209.28, 'Papua Pegunungan': 249.12,
};

// ORU fallback jika tabel OruCapex kosong
const ORU_DB_FALLBACK = [
  { cap: 4.89,  unit: 'MMSCFD', cost: 23582442.21, year: 2024, refLoc: 'Papua' },
  { cap: 16.39, unit: 'MMSCFD', cost: 26430984.51, year: 2024, refLoc: 'Papua' },
];

// Helper: IKK lookup dengan case-insensitive fallback
function lookupIkk(ikkMap, prov) {
  if (!prov) return 100.0;
  if (ikkMap[prov] != null) return ikkMap[prov];
  const lower = prov.toLowerCase();
  for (const [k, v] of Object.entries(ikkMap)) {
    if (k.toLowerCase() === lower) return v;
  }
  return 100.0;
}

async function getDynamicOruCapex(demandBbtud, targetProv, analysisYear, inflationRate, heatingValue = 1050) {
  // Step 1: Load IKK dari tabel cci, fallback ke konstanta
  let ikkMap = IKK_DATA_FALLBACK;
  try {
    const cciRows = await prisma.cci.findMany();
    if (cciRows.length > 0) {
      ikkMap = {};
      for (const r of cciRows) ikkMap[r.provinsi] = r.cci;
    }
  } catch (_) { /* gunakan fallback */ }

  // Step 2: Load semua data ORU dari DB (semua entri bisa jadi referensi nearest-neighbor)
  let oruDb = [];
  try {
    const rows = await prisma.oruCapex.findMany({
      where: { capacityValue: { not: null } },
      orderBy: { capacityValue: 'asc' },
    });
    if (rows.length >= 1) {
      oruDb = rows.map(r => ({
        cap:    r.capacityValue,
        unit:   r.unit || 'MMSCFD',
        cost:   r.fixCapexUSD,
        year:   r.year,
        refLoc: r.province || 'Papua',
      }));
    }
  } catch (_) { /* gunakan fallback */ }

  if (oruDb.length < 1) oruDb = ORU_DB_FALLBACK;

  // Step 3: Konversi semua entri ke BBTUD untuk perbandingan
  const oruInBbtud = oruDb.map(item => {
    const bbtud = item.unit === 'MMSCFD'
      ? (item.cap * heatingValue) / 1000.0
      : item.cap;
    return { ...item, capBbtud: bbtud };
  });

  // Step 4: Nearest-neighbor matching (min |item_bbtud - demand_bbtud|)
  const bestMatch = oruInBbtud.reduce((prev, curr) =>
    Math.abs(curr.capBbtud - demandBbtud) < Math.abs(prev.capBbtud - demandBbtud) ? curr : prev
  );

  // Step 5: AACE Rule of Six-Tenths scaling
  const capacityFactor = Math.pow(demandBbtud / bestMatch.capBbtud, 0.6);
  const scaledBaseCost = bestMatch.cost * capacityFactor;

  // Step 6: IKK adjustment (dari cci table)
  const ikkTarget = lookupIkk(ikkMap, targetProv);
  const ikkRef    = lookupIkk(ikkMap, bestMatch.refLoc);

  // Step 7: Compound inflation ke analysis year
  const inflatedCost = scaledBaseCost * Math.pow(1 + inflationRate, analysisYear - bestMatch.year);
  const finalCapexUsd = inflatedCost * (ikkTarget / ikkRef);

  return {
    finalCapexUsd,
    scaledBaseCost,
    inflatedCost,
    ikkTarget,
    ikkRef,
    bestMatchName: bestMatch.refLoc,
    bestMatchCapBbtud: parseFloat(bestMatch.capBbtud.toFixed(4)),
    capacityFactor: parseFloat(capacityFactor.toFixed(6)),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC: computeWeatherLegReport
// For each leg (origin, destination, waypoints[]) returns which IHO zones are
// crossed, the average speed under weather, and the minimum point speed.
// Used to build the weather section of the supply chain run report.
// ─────────────────────────────────────────────────────────────────────────────
async function computeWeatherLegReport(legs, vessel, weatherCacheByZone) {
  // legs: [{ origin, destination, waypoints: [[lat,lon],...] }, ...]
  const results = [];
  for (const { origin, destination, waypoints } of legs) {
    if (!waypoints || waypoints.length < 2) continue;
    const zonesSet = new Set();
    let totalDist = 0, totalHours = 0, minSpd = Infinity;
    for (let i = 0; i < waypoints.length - 1; i++) {
      const [l1, o1] = waypoints[i];
      const [l2, o2] = waypoints[i + 1];
      const d = fastNm(l1, o1, l2, o2);
      const midLat = (l1 + l2) / 2;
      const midLon = (o1 + o2) / 2;
      let zone = null;
      try { zone = await ihoSvc.getActiveZone(midLat, midLon); } catch (_) { }
      const wx = (zone && weatherCacheByZone && weatherCacheByZone[zone]) || { wave: 0, wind: 0 };
      const spd = calcSpeedLoss(vessel, wx.wave || 0, wx.wind || 0);
      if (zone) zonesSet.add(zone);
      totalDist += d;
      totalHours += d / spd;
      if (spd < minSpd) minSpd = spd;
    }
    const avgSpd = totalHours > 0 ? totalDist / totalHours : vessel.speedKnot;
    results.push({
      origin,
      destination,
      zonesAffected: [...zonesSet],
      avgSpeedKts:   parseFloat(avgSpd.toFixed(2)),
      minSpeedKts:   minSpd === Infinity ? vessel.speedKnot : parseFloat(minSpd.toFixed(2)),
    });
  }
  return results;
}

module.exports = {
  computeRoute,
  computeJettyReport,
  computeDynamicVoyageHours,
  computeWeatherLegReport,
  getDynamicOruCapex,
  makeRouteKey,
  fastNm,
  UKC_CLEARANCE,
};
