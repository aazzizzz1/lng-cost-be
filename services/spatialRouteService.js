/**
 * Spatial Route Service – A* Sea-Route Engine
 * ─────────────────────────────────────────────────────────────────────────────
 * Computes the shortest navigable sea-path between two geographic coordinates,
 * respecting a minimum water depth derived from the ship's design draft plus
 * Under-Keel Clearance (UKC) and dynamic wave height.
 *
 * Three engines are tried in order of preference:
 *   1. BATNAS  – high-res local TIF (Indonesia)
 *   2. GEBCO   – global NetCDF (fallback)
 *   3. Haversine – straight line (no bathymetry, last resort)
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
 *  getDynamicOruCapex(demandMmscfd, province, analysisYear, inflationRate, prismaClient)
 *    → number (USD)
 */

const crypto  = require('crypto');
const prisma  = require('../config/db');
const ihoSvc  = require('./ihoService');
const seaLaneSvc = require('./seaLaneService');
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

  // Short-edge threshold: edges ≤ 2 grid spacings skip the corridor check.
  // This guarantees the graph is connected in open water, at the cost that
  // very short edges near coasts may cross a pixel-wide shallow band.
  // maxJumpDeg ≈ gridStep × pixelSize × 3.5, so 2 grid spacings ≈ maxJumpDeg × (2/3.5)
  const shortEdgeNm = (maxJumpDeg * (2.0 / 3.5)) * 60.0;

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
      // Long edges only: corridor check prevents land-crossing shortcuts.
      // Short edges (≤ 2 grid spacings) are unconditionally included so the
      // grid stays connected in open water.
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
      // Cap corridor checks at 30 samples to keep smoothPath O(path×60×30)
      if (isSafeCorridorLine(win, l1, o1, l2, o2, safeD, 2, 30)) { furthest = nxt; break; }
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
// Run A* pipeline on one BathyWindow with iterative capsule expansion
// Matches Python build_offline_spatial_network / build_network_gebco flow
// FIX: 5 capsule iterations (was 3), force-connect origin/dest, better gridStep
// ─────────────────────────────────────────────────────────────────────────────
async function _computeWithWindow(win, p1, p2, safeD) {
  // 1. Straight-line check (buffer_px=2, matching Python)
  if (isSafeCorridorLine(win, p1.lat, p1.lon, p2.lat, p2.lon, safeD, 2)) {
    const d  = fastNm(p1.lat, p1.lon, p2.lat, p2.lon);
    const wp = applyOrganicInterpolation([[p1.lat, p1.lon], [p2.lat, p2.lon]]);
    return { waypoints: wp, distanceNm: d };
  }

  const directNm = fastNm(p1.lat, p1.lon, p2.lat, p2.lon);

  // gridStep: keep node count ≤ 80,000 to bound buildAdjacency runtime
  const totalPx  = win.width * win.height;
  const gridStep = Math.max(1, Math.floor(Math.sqrt(totalPx / 80000)));

  const pixelSizeDeg = Math.max(Math.abs(win.latStep), Math.abs(win.lonStep));

  // haloRadDeg: adds dense nodes near origin/dest for port-area connectivity.
  // Cap at 0.5° to avoid large halo boxes on wide GEBCO windows.
  const haloRadDeg = Math.min(0.50, Math.max(0.15, gridStep * pixelSizeDeg * 8));

  // maxJumpDeg: maximum distance two nodes can be connected.
  // CONSTANT across all capsule iterations – do NOT scale with capsule radius.
  // ~3.5 grid spacings ensures full connectivity with K=16 neighbours.
  const maxJumpDeg = gridStep * pixelSizeDeg * 3.5;

  // Iterative capsule expansion: 5 iterations matching Python
  // rad = max(base, directNm * factor) in degrees
  const capsuleRadii = [
    Math.max(0.6,  directNm * 0.008),
    Math.max(1.5,  directNm * 0.015),
    Math.max(4.0,  directNm * 0.04),
    Math.max(7.0,  directNm * 0.07),
    Math.max(12.0, directNm * 0.12),
  ];

  const t0 = Date.now();
  for (let iter = 0; iter < capsuleRadii.length; iter++) {
    const capsuleRadDeg = capsuleRadii[iter];

    // 2. Build capsule-filtered grid + halo nodes
    const tGrid = Date.now();
    const nodes = buildValidGrid(win, safeD, gridStep, p1, p2, capsuleRadDeg);
    const tHalo = Date.now();
    addHaloNodes(win, safeD, nodes, [p1, p2], haloRadDeg);
    const tAdj = Date.now();

    // 3. Add virtual origin / destination nodes
    nodes.push({ lat: p1.lat, lon: p1.lon, depth: 0, danger: 1.0 });
    nodes.push({ lat: p2.lat, lon: p2.lon, depth: 0, danger: 1.0 });
    const si = nodes.length - 2;
    const ei = nodes.length - 1;
    if (nodes.length < 4) continue;

    // 4. Build adjacency list (KNN K=16, sorted-lat binary search, constant maxJumpDeg)
    const adj = buildAdjacency(nodes, win, safeD, maxJumpDeg);
    const tAstar = Date.now();

    // 5. Force-connect origin/dest to K nearest deep-water nodes when
    //    normal corridor check fails (matching Python force-connect fallback)
    for (const vi of [si, ei]) {
      if ((adj[vi] || []).length === 0) {
        const { lat: vl, lon: vo } = nodes[vi];
        const portSafeD = safeD * 0.85;   // slightly relaxed for port approach
        const cands = nodes
          .map((nd, idx) => ({ idx, d: fastNm(vl, vo, nd.lat, nd.lon) }))
          .filter(({ idx }) => idx !== vi)
          .sort((a, b) => a.d - b.d)
          .slice(0, 20);
        let connected = 0;
        for (const { idx, d } of cands) {
          if (isSafeCorridorLine(win, vl, vo, nodes[idx].lat, nodes[idx].lon, portSafeD, 0)) {
            adj[vi].push({ ni: idx, w: d });
            adj[idx].push({ ni: vi, w: d });
            if (++connected >= 5) break;
          }
        }
        // Hard force-connect to 3 nearest if still isolated
        if (connected === 0) {
          for (const { idx, d } of cands.slice(0, 3)) {
            adj[vi].push({ ni: idx, w: d });
            adj[idx].push({ ni: vi, w: d });
          }
        }
      }
    }

    // 6. A* with visited set + 1.5x weighted heuristic
    const result = astar(nodes, adj, si, ei);
    const tEnd = Date.now();
    console.log(`[SpatialRoute] iter ${iter}: capsR=${capsuleRadDeg.toFixed(2)}° nodes=${nodes.length} grid=${tHalo-tGrid}ms halo=${tAdj-tHalo}ms adj=${tAstar-tAdj}ms astar=${tEnd-tAstar}ms total=${tEnd-t0}ms path=${result?'found':'null'}`);
    if (!result) continue;   // widen capsule and retry

    // 7. Smooth path (lookahead 60, matching Python)
    const tSmooth0 = Date.now();
    const smoothed = smoothPath(result.path, nodes, win, safeD);
    console.log(`[SpatialRoute] smoothPath: ${Date.now()-tSmooth0}ms  ${result.path.length}→${smoothed.length} nodes`);

    // 8. Bezier maneuver curves (matching Python KINEMATIKA MANUVER KAPAL)
    const rawWp      = smoothed.map(i => [nodes[i].lat, nodes[i].lon]);
    const withBezier = applyBezierManeuvers(rawWp);

    // 9. Organic interpolation every 3 NM (matching Python final_organic_path)
    const finalWp = applyOrganicInterpolation(withBezier);

    let dist = 0;
    for (let i = 0; i < finalWp.length - 1; i++) {
      dist += fastNm(finalWp[i][0], finalWp[i][1], finalWp[i + 1][0], finalWp[i + 1][1]);
    }
    return { waypoints: finalWp, distanceNm: dist };
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
  const { draft = MAX_DESIGN_DRAFT, waveHeight = 0, forceRecompute = false } = options;
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
  let engineUsed  = 'haversine';
  let win         = null;

  // BATNAS: high-res TIF (Indonesia).
  // Use for routes up to 200 NM where BATNAS resolution adds real value.
  // Limit bbox to 3° to avoid loading excessively large rasters.
  if (directNm <= 200) {
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
  }

  // GEBCO: global NetCDF – use for all distances when BATNAS unavailable/skipped.
  // Use the full adaptive pad so longer routes can route around large island groups.
  if (!routeResult) {
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

  // Sea lane graph (Indonesian waypoint network) – works without raster data
  if (!routeResult) {
    try {
      const seaResult = seaLaneSvc.findRoute(origin, destination);
      if (seaResult) {
        // Apply Bezier maneuvers and organic interpolation to sea-lane routes too
        const withBezier  = applyBezierManeuvers(seaResult.waypoints);
        const withOrganic = applyOrganicInterpolation(withBezier);
        routeResult = { waypoints: withOrganic, distanceNm: seaResult.distanceNm };
        engineUsed  = 'sea-lanes';
        win         = null;
      }
    } catch (e) {
      console.warn('[SpatialRoute] Sea lane error:', e.message);
    }
  }

  // Last resort: straight line haversine
  if (!routeResult) {
    engineUsed  = 'haversine';
    const distNm = fastNm(origin.lat, origin.lon, destination.lat, destination.lon);
    routeResult = {
      waypoints: applyOrganicInterpolation([[origin.lat, origin.lon], [destination.lat, destination.lon]]),
      distanceNm: distNm,
    };
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

  return { ...record, fromCache: false };
}

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC: computeJettyReport
// ─────────────────────────────────────────────────────────────────────────────
async function computeJettyReport(locationName, lat, lon, options = {}) {
  const { draft = MAX_DESIGN_DRAFT, waveHeight = 0, maxJettyM = 0 } = options;
  const safeD = -(draft + UKC_CLEARANCE + 0.5 * waveHeight);

  // Check DB
  try {
    const cached = await prisma.jettyBerthReport.findUnique({ where: { locationName } });
    if (cached) return cached;
  } catch (_) { /* continue */ }

  const pad = 0.5;
  let win = null;
  let engineUsed = 'haversine';

  try {
    win = await getBatnas(lat - pad, lat + pad, lon - pad, lon + pad);
    if (win) engineUsed = 'batnas';
  } catch (_) { }

  if (!win) {
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
      engineUsed: 'haversine',
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
// Interpolates ORU CAPEX using two pinpoint references + IKK (CCI from DB).
// ─────────────────────────────────────────────────────────────────────────────
const ORU_PINPOINTS = [
  { cap: 4.89,  cost: 23582442.21, year: 2024, refProv: 'Papua' },
  { cap: 16.39, cost: 26430984.51, year: 2024, refProv: 'Papua' },
];

async function getDynamicOruCapex(demandMmscfd, targetProv, analysisYear, inflationRate) {
  const [p1, p2] = ORU_PINPOINTS;
  const slope = (p2.cost - p1.cost) / (p2.cap - p1.cap);
  const baseCost = Math.max(1000, p1.cost + slope * (demandMmscfd - p1.cap));

  // Get IKK from CCI table
  let ikkTarget = 100, ikkRef = 134.96; // Papua default
  try {
    const rows = await prisma.cci.findMany({ where: { provinsi: { contains: targetProv, mode: 'insensitive' } } });
    if (rows.length > 0) ikkTarget = rows[0].cci;
    const refRow = await prisma.cci.findFirst({ where: { provinsi: { contains: 'Papua', mode: 'insensitive' } } });
    if (refRow) ikkRef = refRow.cci;
  } catch (_) { /* use defaults */ }

  const inflated = baseCost * Math.pow(1 + inflationRate, analysisYear - p1.year);
  return inflated * (ikkTarget / ikkRef);
}

module.exports = {
  computeRoute,
  computeJettyReport,
  computeDynamicVoyageHours,
  getDynamicOruCapex,
  makeRouteKey,
  fastNm,
  UKC_CLEARANCE,
};
