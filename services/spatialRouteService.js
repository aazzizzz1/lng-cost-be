/**
 * Spatial Route Service – A* Sea-Route Engine
 * ─────────────────────────────────────────────────────────────────────────────
 * STRICT DEPTH AUDIT UPDATE:
 * - FIX 1: Menghapus "Skip Pixel" di fast_safe_corridor_numpy. Pengecekan 100% dari pangkal ke ujung.
 * - FIX 2: Engine Micro A* sekarang murni menggunakan `safeD` (bukan 0.0) di seluruh pengecekan node dan edge.
 * - FIX 3: Validasi mutlak pada Bezier Curve. Jika kurva memotong area dangkal, manuver dibatalkan.
 * - FIX 4: Macro Satellite diwajibkan mengecek koridor lurus bebas dangkal agar tidak melompati pulau.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const crypto = require('crypto');
const prisma = require('../config/db');
const ihoSvc = require('./ihoService');
const { getBatnas, getGebco } = require('./bathymetryService');


const UKC_CLEARANCE = 2.85;
const MAX_DESIGN_DRAFT = 8.0;
const MAX_LPP = 175.0;

// ==============================================================================
// 1. REPLIKA PUSTAKA PYTHON (MinHeap, KDTree Scipy & Geodesic)
// ==============================================================================

function pyRound(x) {
  const r = Math.round(x);
  return Math.abs(x % 1) === 0.5 ? (r % 2 === 0 ? r : r - 1) : r;
}

class MinHeap {
  constructor() { this.h = []; }
  push(priority, cost, item, path) { this.h.push({ priority, cost, item, path }); this._up(this.h.length - 1); }
  pop() { const top = this.h[0], last = this.h.pop(); if (this.h.length) { this.h[0] = last; this._down(0); } return top; }
  get size() { return this.h.length; }
  _up(i) { while (i > 0) { const p = (i - 1) >> 1; if (this.h[p].priority <= this.h[i].priority) break; [this.h[p], this.h[i]] = [this.h[i], this.h[p]]; i = p; } }
  _down(i) {
    while (true) {
      let m = i, l = 2 * i + 1, r = 2 * i + 2;
      if (l < this.h.length && this.h[l].priority < this.h[m].priority) m = l;
      if (r < this.h.length && this.h[r].priority < this.h[m].priority) m = r;
      if (m === i) break; [this.h[m], this.h[i]] = [this.h[i], this.h[m]]; i = m;
    }
  }
}

class KDTree {
  constructor(coords) {
    this.coords = coords;
    this.grid = new Map();
    this.cellSize = 0.05; 
    for (let i = 0; i < coords.length; i++) {
      const r = Math.floor(coords[i][0] / this.cellSize), c = Math.floor(coords[i][1] / this.cellSize);
      const key = `${r},${c}`;
      if (!this.grid.has(key)) this.grid.set(key, []);
      this.grid.get(key).push(i);
    }
  }
  query(point, k = 1, distance_upper_bound = Infinity) {
    let cands = [];
    const rSq = distance_upper_bound === Infinity ? Infinity : distance_upper_bound * distance_upper_bound;
    
    if (distance_upper_bound === Infinity) {
      for (let i = 0; i < this.coords.length; i++) {
        const dlat = point[0] - this.coords[i][0], dlon = point[1] - this.coords[i][1];
        cands.push({ d: Math.sqrt(dlat*dlat + dlon*dlon), idx: i });
      }
    } else {
      const rC = Math.floor(point[0] / this.cellSize), cC = Math.floor(point[1] / this.cellSize);
      const rad = Math.ceil(distance_upper_bound / this.cellSize);
      for (let r = rC - rad; r <= rC + rad; r++) {
        for (let c = cC - rad; c <= cC + rad; c++) {
          const bucket = this.grid.get(`${r},${c}`);
          if (bucket) {
            for (let i = 0; i < bucket.length; i++) {
              const idx = bucket[i];
              const dlat = point[0] - this.coords[idx][0], dlon = point[1] - this.coords[idx][1];
              const d2 = dlat*dlat + dlon*dlon;
              if (d2 <= rSq) cands.push({ d: Math.sqrt(d2), idx });
            }
          }
        }
      }
    }
    
    cands.sort((a, b) => a.d - b.d);
    if (k === 1) {
      if (cands.length === 0) return [[Infinity], [-1]];
      return [[cands[0].d], [cands[0].idx]]; 
    }
    const topK = cands.slice(0, k);
    return [topK.map(x => x.d), topK.map(x => x.idx)];
  }
}

function makeRouteKey(origin, destination) {
  const canonical = [origin, destination].sort().join('|');
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

function geodesic_nm(c1, c2) {
  const a = 6378137.0, b = 6356752.314245, f = 1 / 298.257223563;
  const L = (c2[1] - c1[1]) * Math.PI / 180;
  const U1 = Math.atan((1 - f) * Math.tan(c1[0] * Math.PI / 180));
  const U2 = Math.atan((1 - f) * Math.tan(c2[0] * Math.PI / 180));
  const sinU1 = Math.sin(U1), cosU1 = Math.cos(U1);
  const sinU2 = Math.sin(U2), cosU2 = Math.cos(U2);
  let lambda = L, lambdaP, iterLimit = 100;
  let sinLambda, cosLambda, sinSigma, cosSigma, sigma, sinAlpha, cosSqAlpha, cos2SigmaM;
  do {
    sinLambda = Math.sin(lambda); cosLambda = Math.cos(lambda);
    sinSigma = Math.sqrt((cosU2 * sinLambda) ** 2 + (cosU1 * sinU2 - sinU1 * cosU2 * cosLambda) ** 2);
    if (sinSigma === 0) return 0; 
    cosSigma = sinU1 * sinU2 + cosU1 * cosU2 * cosLambda;
    sigma = Math.atan2(sinSigma, cosSigma);
    sinAlpha = cosU1 * cosU2 * sinLambda / sinSigma;
    cosSqAlpha = 1 - sinAlpha * sinAlpha;
    cos2SigmaM = cosSqAlpha === 0 ? 0 : cosSigma - 2 * sinU1 * sinU2 / cosSqAlpha;
    const C = f / 16 * cosSqAlpha * (4 + f * (4 - 3 * cosSqAlpha));
    lambdaP = lambda;
    lambda = L + (1 - C) * f * sinAlpha * (sigma + C * sinSigma * (cos2SigmaM + C * cosSigma * (-1 + 2 * cos2SigmaM * cos2SigmaM)));
  } while (Math.abs(lambda - lambdaP) > 1e-12 && --iterLimit > 0);
  if (iterLimit === 0) return NaN;
  const uSq = cosSqAlpha * (a * a - b * b) / (b * b);
  const A = 1 + uSq / 16384 * (4096 + uSq * (-768 + uSq * (320 - 175 * uSq)));
  const B = uSq / 1024 * (256 + uSq * (-128 + uSq * (74 - 47 * uSq)));
  const deltaSigma = B * sinSigma * (cos2SigmaM + B / 4 * (cosSigma * (-1 + 2 * cos2SigmaM * cos2SigmaM) - B / 6 * cos2SigmaM * (-3 + 4 * sinSigma * sinSigma) * (-3 + 4 * cos2SigmaM * cos2SigmaM)));
  const s = b * A * (sigma - deltaSigma);
  return s / 1852.0; 
}

function fast_nm_dist(c1, c2) {
  const dlat = c2[0] - c1[0];
  const dlon = (c2[1] - c1[1]) * Math.cos(((c1[0] + c2[0]) / 2) * (Math.PI / 180));
  return Math.sqrt(dlat * dlat + dlon * dlon) * 60.0;
}

function getElevationClean(win, r, c) {
  if (r < 0 || r >= win.height || c < 0 || c >= win.width) return 9999.0;
  let v = win.data[r * win.width + c];
  if (isNaN(v) || v > 8000 || v < -11000) return 9999.0;
  return v;
}

// ==============================================================================
// 2. FAST SAFE CORRIDOR NUMPY PORTING (STRICT DEPTH AUDIT)
// ==============================================================================
function fast_safe_corridor_numpy(p1, p2, win, limit_depth, buffer_px = 0, isBatnas = true) {
  const dlat = Math.abs(p2[0] - p1[0]), dlon = Math.abs(p2[1] - p1[1]);
  const lat_step_abs = Math.abs(win.latStep), lon_step_abs = Math.abs(win.lonStep);
  const factor = isBatnas ? 1.5 : 10.0;
  
  const pixel_steps = Math.trunc(Math.max(dlat / lat_step_abs, dlon / lon_step_abs) * factor);
  const steps = Math.max(isBatnas ? 5 : 10, pixel_steps);

  for (let i = 0; i <= steps; i++) {
    const t = steps === 0 ? 0 : i / steps;
    const sLat = p1[0] + t * (p2[0] - p1[0]);
    const sLon = p1[1] + t * (p2[1] - p1[1]);

    const r = Math.trunc(Math.max(0, Math.min(win.height - 1, pyRound((sLat - win.latStart) / win.latStep))));
    const c = Math.trunc(Math.max(0, Math.min(win.width - 1, pyRound((sLon - win.lonStart) / win.lonStep))));
    
    if (getElevationClean(win, r, c) > limit_depth) return false;

    if (buffer_px > 0) {
      const l_up = Math.min(win.height - 1, r + buffer_px), l_dn = Math.max(0, r - buffer_px);
      const l_rt = Math.min(win.width - 1, c + buffer_px), l_lf = Math.max(0, c - buffer_px);
      
      if (getElevationClean(win, l_up, c) > limit_depth || getElevationClean(win, l_dn, c) > limit_depth ||
          getElevationClean(win, r, l_rt) > limit_depth || getElevationClean(win, r, l_lf) > limit_depth ||
          getElevationClean(win, l_up, l_rt) > limit_depth || getElevationClean(win, l_up, l_lf) > limit_depth ||
          getElevationClean(win, l_dn, l_rt) > limit_depth || getElevationClean(win, l_dn, l_lf) > limit_depth) {
        return false;
      }
    }
  }
  return true;
}

function live_astar_path(G_nodes, G_edges, source, target, heuristic) {
  const queue = new MinHeap();
  queue.push(0, 0, source, [source]);
  const visited = new Set();
  
  const start_time = Date.now();
  const start_dist = heuristic(G_nodes[source], G_nodes[target]);
  let nodes_explored = 0;

  process.stdout.write(`        🧭 Memulai inisiasi AI Navigasi...\r`);

  while (queue.size) {
    const { cost, item: curr, path } = queue.pop();
    if (visited.has(curr)) continue;
    visited.add(curr);
    nodes_explored++;

    if (nodes_explored % 100 === 0) {
      const curr_dist = heuristic(G_nodes[curr], G_nodes[target]);
      const pct = Math.max(0.0, Math.min(99.9, 100.0 - (curr_dist / start_dist * 100.0)));
      const elapsed = (Date.now() - start_time) / 1000;
      process.stdout.write(`        🧭 Navigasi AI: ${pct.toFixed(1)}% Selesai | Titik Diproses: ${nodes_explored} | Waktu: ${elapsed.toFixed(1)}s          \r`);
    }

    if (curr === target) {
      const elapsed = (Date.now() - start_time) / 1000;
      console.log(`        🧭 Navigasi AI: 100.0% Selesai | Titik Diproses: ${nodes_explored} | Berhasil dalam ${elapsed.toFixed(1)}s          `);
      return path;
    }

    const neighbors = G_edges.get(curr) || [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor.ni)) {
        const new_cost = cost + neighbor.w;
        const priority = new_cost + (1.5 * heuristic(G_nodes[neighbor.ni], G_nodes[target]));
        queue.push(priority, new_cost, neighbor.ni, [...path, neighbor.ni]);
      }
    }
  }
  return null;
}

// ==============================================================================
// 3. FIND BERTH LOGIC (MURNI KDTREE + BFS ANTI-TRAP)
// ==============================================================================
async function calculate_access_and_jetty(pt_name, pt_pos, win, weatherCacheByZone, overrideSafeD = null) {
  const ptNameDisp = pt_name.charAt(0).toUpperCase() + pt_name.slice(1);
  console.log(`  🏗️ Menganalisis akses pesisir untuk [${pt_name}] di koordinat ${pt_pos[0].toFixed(4)}, ${pt_pos[1].toFixed(4)}`);
  
  let PORT_SAFE_DEPTH;
  if (overrideSafeD !== null) {
    PORT_SAFE_DEPTH = overrideSafeD; 
  } else {
    let local_max_wave = 0.0;
    if (weatherCacheByZone) {
      try {
        const zone = await ihoSvc.getActiveZone(pt_pos[0], pt_pos[1]);
        if (zone && weatherCacheByZone[zone]) {
           local_max_wave = weatherCacheByZone[zone].wave || 0.0;
        }
      } catch (e) {}
    }
    PORT_SAFE_DEPTH = -(MAX_DESIGN_DRAFT + UKC_CLEARANCE + (0.5 * local_max_wave));
  }

  // 1. Pemetaan Area Laut Dalam (Validasi Anti-Terkurung via BFS / Connected Components)
  const numPixels = win.width * win.height;
  const isDeep = new Uint8Array(numPixels);
  for (let i = 0; i < numPixels; i++) {
    if (win.data[i] !== 9999 && win.data[i] <= PORT_SAFE_DEPTH) isDeep[i] = 1;
  }

  const componentLabels = new Int32Array(numPixels);
  let currentLabel = 1;
  const oceanLabels = new Set(); // <-- KUNCI PERBAIKAN: Menyimpan BANYAK lautan, bukan cuma 1
  const q = new Int32Array(numPixels);

  for (let i = 0; i < numPixels; i++) {
    if (isDeep[i] === 1 && componentLabels[i] === 0) {
      let size = 0;
      let touchesBorder = false; // <-- Deteksi apakah laut ini terhubung ke samudera luar
      q[0] = i;
      componentLabels[i] = currentLabel;
      let head = 0, tail = 1;
      
      while (head < tail) {
        const curr = q[head++];
        size++;
        const r = Math.floor(curr / win.width);
        const c = curr % win.width;
        
        // Jika menyentuh batas tepi peta, ini dipastikan bukan "danau terkurung"
        if (r === 0 || r === win.height - 1 || c === 0 || c === win.width - 1) {
            touchesBorder = true;
        }
        
        // BFS 8-Arah (Diagonal) untuk mencegah buntu di selat sempit/miring
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            if (dr === 0 && dc === 0) continue;
            const nr = r + dr, nc = c + dc;
            if (nr >= 0 && nr < win.height && nc >= 0 && nc < win.width) {
              const n = nr * win.width + nc;
              if (isDeep[n] && !componentLabels[n]) {
                componentLabels[n] = currentLabel;
                q[tail++] = n;
              }
            }
          }
        }
      }
      
      // Jika lautan menyentuh pinggir peta ATAU ukurannya super masif, masukkan ke daftar Laut Valid
      if (touchesBorder || size > (numPixels * 0.05)) {
        oceanLabels.add(currentLabel);
      }
      currentLabel++;
    }
  }

  // Ekstraksi Koordinat Murni dari Seluruh Laut Valid
  const ocean_coords = [];
  for (let r = 0; r < win.height; r++) {
    for (let c = 0; c < win.width; c++) {
      if (oceanLabels.has(componentLabels[r * win.width + c])) {
        
        const lat = win.latStart + r * win.latStep;
        const lon = win.lonStart + c * win.lonStep;
        
        // Pembatas radius pencarian agar komputasi kilat (Radius 0.5 derajat / ~55 KM)
        if (Math.abs(lat - pt_pos[0]) > 0.5 || Math.abs(lon - pt_pos[1]) > 0.5) continue;
        
        ocean_coords.push([lat, lon, win.data[r * win.width + c]]);
      }
    }
  }

  let berthLat = pt_pos[0], berthLon = pt_pos[1], berthDepth = PORT_SAFE_DEPTH - 1;
  let dist_nm_total = 0;

  // 2. Pencarian Jarak Terdekat Tanpa Batas (KDTree)
  if (ocean_coords.length > 0) {
    const tree = new KDTree(ocean_coords.map(x => [x[0], x[1]]));
    const [d_deg, idx] = tree.query(pt_pos, 1);
    berthLat = ocean_coords[idx[0]][0];
    berthLon = ocean_coords[idx[0]][1];
    berthDepth = ocean_coords[idx[0]][2];
    dist_nm_total = fast_nm_dist(pt_pos, [berthLat, berthLon]);
  }

  // 3. Kalkulasi Porsi Darat vs Laut Dangkal
  const total_dist_m = dist_nm_total * 1852.0;
  const dist_km_total = total_dist_m / 1000.0;
  const steps = Math.max(5, Math.trunc(dist_km_total * 10)); 
  let landCount = 0;
  
  for (let i = 0; i < steps; i++) {
    const t = i / (steps - 1 || 1);
    const sLat = pt_pos[0] + t * (berthLat - pt_pos[0]);
    const sLon = pt_pos[1] + t * (berthLon - pt_pos[1]);
    const r = Math.trunc(Math.max(0, Math.min(win.height - 1, pyRound((sLat - win.latStart) / win.latStep))));
    const c = Math.trunc(Math.max(0, Math.min(win.width - 1, pyRound((sLon - win.lonStart) / win.lonStep))));
    if (getElevationClean(win, r, c) > 0.0) landCount++;
  }
  
  const darat_pct = steps > 0 ? (landCount / steps) : 0;
  const land_km = dist_km_total * darat_pct;
  const land_m = land_km * 1000;
  const jetty_m = Math.max(0, total_dist_m - land_m);

  if (total_dist_m > 50) {
     console.log(`      ⚠️ Kapal terkurung dangkal. Menggeser titik Berth sejauh ${(dist_km_total).toFixed(2)} KM menuju laut lepas.`);
  }
  console.log(`      ✅ ${ptNameDisp}: Total kebutuhan Jetty/Alur Keruk: ${total_dist_m.toFixed(0)} M (Darat: ${land_m.toFixed(0)} M | Laut Dangkal: ${jetty_m.toFixed(0)} M) | Kedalaman Sandar: ${berthDepth.toFixed(1)} m`);
  
  return { berthLat, berthLon, berthDepth, landKm: land_km, jettyM: jetty_m, safeD: PORT_SAFE_DEPTH };
}

// ==============================================================================
// 4. BEZIER & ORGANIC POST-PROCESSING (STRICT AUDIT)
// ==============================================================================
function applyBezierManeuvers(pathCoords, win, safeD, isBatnas) {
  if (pathCoords.length < 3) return pathCoords;
  const turn_radius_m = 5.0 * MAX_LPP;
  const R_nm = turn_radius_m / 1852.0;
  const result = [pathCoords[0]];
  
  for (let k = 1; k < pathCoords.length - 1; k++) {
    const pPrev = pathCoords[k - 1], pCurr = pathCoords[k], pNext = pathCoords[k + 1];
    const dPrevNm = fast_nm_dist(pPrev, pCurr), dNextNm = fast_nm_dist(pCurr, pNext);
    if (dPrevNm < 0.1 || dNextNm < 0.1) { result.push(pCurr); continue; }

    const cutNm = Math.min(R_nm, dPrevNm / 2.1, dNextNm / 2.1);
    const vPrev = [pPrev[0] - pCurr[0], pPrev[1] - pCurr[1]], vNext = [pNext[0] - pCurr[0], pNext[1] - pCurr[1]];
    const lonScale = Math.cos(pCurr[0] * Math.PI / 180);
    const dist_prev_deg = Math.sqrt(vPrev[0]**2 + (vPrev[1]*lonScale)**2), dist_next_deg = Math.sqrt(vNext[0]**2 + (vNext[1]*lonScale)**2);
    
    const cut_deg_prev = dist_prev_deg > 0 ? (cutNm / 60.0) : 0;
    const cut_deg_next = dist_next_deg > 0 ? (cutNm / 60.0) : 0;

    const p0 = dist_prev_deg > 0 ? [pCurr[0] + vPrev[0]*(cut_deg_prev/dist_prev_deg), pCurr[1] + vPrev[1]*(cut_deg_prev/dist_prev_deg)] : pCurr;
    const p2 = dist_next_deg > 0 ? [pCurr[0] + vNext[0]*(cut_deg_next/dist_next_deg), pCurr[1] + vNext[1]*(cut_deg_next/dist_next_deg)] : pCurr;
    
    const curvePts = [];
    for (const t of [0.0, 0.25, 0.5, 0.75, 1.0]) {
      curvePts.push([(1-t)**2 * p0[0] + 2*(1-t)*t * pCurr[0] + t**2 * p2[0], (1-t)**2 * p0[1] + 2*(1-t)*t * pCurr[1] + t**2 * p2[1]]);
    }
    
    // STRICT AUDIT BEZIER: Pastikan hasil curve tidak memotong ujung daratan (corner cutting)
    let isValidCurve = true;
    for (let i = 0; i < curvePts.length - 1; i++) {
      if (!fast_safe_corridor_numpy(curvePts[i], curvePts[i+1], win, safeD, 0, isBatnas)) {
        isValidCurve = false;
        break;
      }
    }

    if (isValidCurve) {
      result.push(...curvePts.slice(1));
    } else {
      result.push(pCurr); // Kembalikan ke sudut patah patah asli jika kurva memakan daratan
    }
  }
  result.push(pathCoords[pathCoords.length - 1]);
  return result;
}

function applyOrganicInterpolation(pathCoords) {
  if (pathCoords.length < 2) return pathCoords;
  const out = [pathCoords[0]];
  for (let i = 0; i < pathCoords.length - 1; i++) {
    const p1 = pathCoords[i], p2 = pathCoords[i + 1];
    const dist_leg = fast_nm_dist(p1, p2);
    if (dist_leg > 3.0) {
      const num_inserts = Math.floor(dist_leg / 3.0);
      for (let ins = 1; ins <= num_inserts; ins++) {
        const frac = ins / (num_inserts + 1);
        out.push([p1[0] + (p2[0]-p1[0])*frac, p1[1] + (p2[1]-p1[1])*frac]);
      }
    }
    out.push(p2);
  }
  return out;
}

// ==============================================================================
// 5. CORE: A-STAR ROUTER (BATNAS & GEBCO) - 100% STRICT SAFE DEPTH
// ==============================================================================
async function run_spatial_core(cu, cv, safeD, win, isBatnas, u, v) {
  const dist_nm_total_log = geodesic_nm(cu, cv); 
  const lat_step_abs = Math.abs(win.latStep);
  const lon_step_abs = Math.abs(win.lonStep);

  console.log(`   --------------------------------------------------------`);
  console.log(`   🚦 Memproses Rute: ${u} <--> ${v} (Jarak Lurus: ${dist_nm_total_log.toFixed(1)} NM)`);

  let auto_waypoints = [];
  
  // =========================================================================
  // STRICT MACRO SATELLITE
  // =========================================================================
  if (isBatnas && dist_nm_total_log > 150.0) {
    const stride_r = Math.max(1, Math.trunc(0.025 / lat_step_abs));
    const stride_c = Math.max(1, Math.trunc(0.025 / lon_step_abs));
    const rA = Math.trunc(Math.max(0, Math.min(win.height-1, pyRound((cu[0] - win.latStart) / win.latStep))));
    const cA = Math.trunc(Math.max(0, Math.min(win.width-1, pyRound((cu[1] - win.lonStart) / win.lonStep))));
    const rB = Math.trunc(Math.max(0, Math.min(win.height-1, pyRound((cv[0] - win.latStart) / win.latStep))));
    const cB = Math.trunc(Math.max(0, Math.min(win.width-1, pyRound((cv[1] - win.lonStart) / win.lonStep))));

    const queue_macro = new MinHeap();
    const visited_macro = new Set();
    queue_macro.push(0, 0, `${rA},${cA}`, [[rA, cA]]);
    
    while(queue_macro.size) {
      const { cost, item, path } = queue_macro.pop();
      if (visited_macro.has(item)) continue; visited_macro.add(item);
      const [r, c] = item.split(',').map(Number);

      if (Math.abs(r - rB) <= stride_r * 3 && Math.abs(c - cB) <= stride_c * 3) {
        path.push([rB, cB]);
        const step_size = Math.max(5, Math.trunc(0.83 / (stride_r * lat_step_abs)));
        for (let i = step_size; i < path.length - 1; i += step_size) {
          auto_waypoints.push([win.latStart + path[i][0] * win.latStep, win.lonStart + path[i][1] * win.lonStep]);
        }
        console.log(`      ✅ Satelit Makro memetakan ${auto_waypoints.length} Titik Transit Ultra-Presisi!          `);
        break;
      }

      const moves_16 = [
        [-stride_r, 0], [stride_r, 0], [0, -stride_c], [0, stride_c],
        [-stride_r, -stride_c], [-stride_r, stride_c], [stride_r, -stride_c], [stride_r, stride_c],
        [-stride_r*2, -stride_c], [-stride_r*2, stride_c], [stride_r*2, -stride_c], [stride_r*2, stride_c],
        [-stride_r, -stride_c*2], [-stride_r, stride_c*2], [stride_r, -stride_c*2], [stride_r, stride_c*2]
      ];
      
      for (const [dr, dc] of moves_16) {
        const nr = r + dr, nc = c + dc;
        if (nr >= 0 && nr < win.height && nc >= 0 && nc < win.width) {
          if (!visited_macro.has(`${nr},${nc}`)) {
            const elev_next = getElevationClean(win, nr, nc);
            const ptR = [win.latStart + r * win.latStep, win.lonStart + c * win.lonStep];
            const ptNr = [win.latStart + nr * win.latStep, win.lonStart + nc * win.lonStep];
            
            // STRICT AUDIT: Satelit makro wajib mematuhi safeD dan koridor tembus lurus
            if (elev_next <= safeD && fast_safe_corridor_numpy(ptR, ptNr, win, safeD, 0, isBatnas)) {
              const penalty = 1.0;
              const ncost = cost + (Math.sqrt(dr*dr + dc*dc) * penalty);
              const heuristic = Math.sqrt((nr - rB)**2 + (nc - cB)**2);
              queue_macro.push(ncost + heuristic, ncost, `${nr},${nc}`, [...path, [nr, nc]]);
            }
          }
        }
      }
    }
  }

  const route_segments = [cu, ...auto_waypoints, cv];
  const full_organic_path = [];

  // =========================================================================
  // STRICT MICRO CAPSULE ROUTING
  // =========================================================================
  for (let seg_idx = 0; seg_idx < route_segments.length - 1; seg_idx++) {
    const p_start = route_segments[seg_idx], p_end = route_segments[seg_idx+1];

    if (fast_safe_corridor_numpy(p_start, p_end, win, safeD, 3, isBatnas)) {
      if (full_organic_path.length === 0) full_organic_path.push(p_start, p_end);
      else full_organic_path.push(p_end);
      continue;
    }

    let success_micro = false, pad_iter = isBatnas ? 0.6 : 1.2, c_factor = 1;
    let segPath = [];

    while (pad_iter <= 15.0 && !success_micro) {
      const min_lat_iter = Math.min(p_start[0], p_end[0]) - pad_iter, max_lat_iter = Math.max(p_start[0], p_end[0]) + pad_iter;
      const min_lon_iter = Math.min(p_start[1], p_end[1]) - pad_iter, max_lon_iter = Math.max(p_start[1], p_end[1]) + pad_iter;
      
      const idx1 = Math.trunc(Math.max(0, Math.min(win.height-1, pyRound((max_lat_iter - win.latStart) / win.latStep))));
      const idx2 = Math.trunc(Math.max(0, Math.min(win.height-1, pyRound((min_lat_iter - win.latStart) / win.latStep))));
      const y_min_idx = Math.min(idx1, idx2), y_max_idx = Math.max(idx1, idx2);
      
      const idx3 = Math.trunc(Math.max(0, Math.min(win.width-1, pyRound((min_lon_iter - win.lonStart) / win.lonStep))));
      const idx4 = Math.trunc(Math.max(0, Math.min(win.width-1, pyRound((max_lon_iter - win.lonStart) / win.lonStep))));
      const x_min_idx = Math.min(idx3, idx4), x_max_idx = Math.max(idx3, idx4);

      const B_cells = 10 * c_factor;
      const final_coords = [];

      for (let bi = y_min_idx; bi < y_max_idx; bi += B_cells) {
        for (let bj = x_min_idx; bj < x_max_idx; bj += B_cells) {
          const r_end = Math.min(bi+B_cells, y_max_idx), c_end = Math.min(bj+B_cells, x_max_idx);
          let hasShallow = false;
          
          outer_b: for (let r = bi; r < r_end; r++) {
              for (let c = bj; c < c_end; c++) {
                  if (getElevationClean(win, r, c) > safeD) { hasShallow = true; break outer_b; } // Patokan Dangkal = safeD
              }
          }
          
          if (hasShallow) {
            for (let r = bi; r < r_end; r += c_factor) {
              for (let c = bj; c < c_end; c += c_factor) {
                if (getElevationClean(win, r, c) <= safeD) final_coords.push([win.latStart+r*win.latStep, win.lonStart+c*win.lonStep]);
              }
            }
          } else {
            const r = Math.floor((bi+r_end)/2), c = Math.floor((bj+c_end)/2);
            if (getElevationClean(win, r, c) <= safeD) final_coords.push([win.latStart+r*win.latStep, win.lonStart+c*win.lonStep]);
          }
        }
      }

      const haloRad = Math.max(25, c_factor * 6);
      for (const pt of [p_start, p_end]) {
        const tr = Math.round((pt[0]-win.latStart)/win.latStep), tc = Math.round((pt[1]-win.lonStart)/win.lonStep);
        for (let r = Math.max(0, tr-haloRad); r <= Math.min(win.height-1, tr+haloRad); r++) {
          for (let c = Math.max(0, tc-haloRad); c <= Math.min(win.width-1, tc+haloRad); c++) {
            if (getElevationClean(win, r, c) <= safeD) final_coords.push([win.latStart+r*win.latStep, win.lonStart+c*win.lonStep]);
          }
        }
      }

      final_coords.push(p_start, p_end);
      const si = final_coords.length - 2, ei = final_coords.length - 1;

      const valid_nodes = [];
      const G_nodes = {};
      const seen = new Set();
      let nodeIdx = 0;
      let realSi = -1;
      let realEi = -1;

      for (let i = 0; i < final_coords.length; i++) {
        const pt = final_coords[i];
        
        const r = pyRound((pt[0]-win.latStart)/win.latStep), c = pyRound((pt[1]-win.lonStart)/win.lonStep);
        const key = `${r},${c}`;
        
        if (seen.has(key)) {
          if (i === si) { G_nodes[nodeIdx] = pt; valid_nodes.push({ i: nodeIdx, danger: 1.0 }); realSi = nodeIdx; nodeIdx++; }
          else if (i === ei) { G_nodes[nodeIdx] = pt; valid_nodes.push({ i: nodeIdx, danger: 1.0 }); realEi = nodeIdx; nodeIdx++; }
          continue;
        }
        seen.add(key);

        const r_up = Math.min(win.height-1, r+3), r_dn = Math.max(0, r-3);
        const c_rt = Math.min(win.width-1, c+3), c_lf = Math.max(0, c-3);
        
        let danger = 1.0;
        let el = getElevationClean(win, r, c);

        // PENALTY SYSTEM
        if (el > safeD) {
            danger = 5.0; // Seharusnya tidak terjadi karena sudah di-filter safeD
        } else {
            outer_dang: for (let nr = r_dn; nr <= r_up; nr++) {
                for (let nc = c_lf; nc <= c_rt; nc++) {
                    if (getElevationClean(win, nr, nc) > safeD) { 
                        danger = 1.7; // Kapal menjauh dari dinding laut dangkal
                        break outer_dang; 
                    }
                }
            }
        }
        
        G_nodes[nodeIdx] = pt;
        valid_nodes.push({ i: nodeIdx, danger });
        
        if (i === si) realSi = nodeIdx;
        if (i === ei) realEi = nodeIdx;
        nodeIdx++;
      }

      const G_edges = new Map();
      const tree_grid = new KDTree(valid_nodes.map(n => G_nodes[n.i]));
      const max_jump_deg = B_cells * Math.max(lat_step_abs, lon_step_abs) * 3.5;

      for (let a = 0; a < valid_nodes.length; a++) {
        const nA = valid_nodes[a];
        const [dists_deg, indices] = tree_grid.query(G_nodes[nA.i], 16, max_jump_deg);
        if (!G_edges.has(nA.i)) G_edges.set(nA.i, []);
        
        for (let j = 0; j < indices.length; j++) {
          const nB = valid_nodes[indices[j]];
          if (nA.i >= nB.i) continue;
          
          const ptA = G_nodes[nA.i], ptB = G_nodes[nB.i];
          const d_nm = fast_nm_dist(ptA, ptB);
          const penalty = Math.max(nA.danger, nB.danger);

          // STRICT AUDIT: Hubungan Edge Wajib Lulus safeD
          if (fast_safe_corridor_numpy(ptA, ptB, win, safeD, 0, isBatnas)) {
            G_edges.get(nA.i).push({ ni: nB.i, w: d_nm * penalty });
            if (!G_edges.has(nB.i)) G_edges.set(nB.i, []);
            G_edges.get(nB.i).push({ ni: nA.i, w: d_nm * penalty });
          }
        }
      }

      for (const vi of [realSi, realEi]) {
        if (vi === -1) continue;
        if (!G_edges.has(vi)) G_edges.set(vi, []);
        const [dists, indices] = tree_grid.query(G_nodes[vi], 500, Infinity);
        let conn = 0;
        
        for (let j = 0; j < indices.length; j++) {
          const nB = valid_nodes[indices[j]];
          if (vi === nB.i) continue;
          
          const pt_A = G_nodes[vi], pt_B = G_nodes[nB.i];

          // STRICT AUDIT: Menghubungkan Terminal (Pusat ke Edge) dgn safeD mutlak
          if (fast_safe_corridor_numpy(pt_A, pt_B, win, safeD, 1, isBatnas)) {
            const w = fast_nm_dist(pt_A, pt_B);
            let d_vi = 1.0;
            for(let k=0; k<valid_nodes.length; k++) if(valid_nodes[k].i === vi) { d_vi = valid_nodes[k].danger; break; }
            const penalty = Math.max(d_vi, nB.danger);

            G_edges.get(vi).push({ ni: nB.i, w: w * penalty });
            if (!G_edges.has(nB.i)) G_edges.set(nB.i, []);
            G_edges.get(nB.i).push({ ni: vi, w: w * penalty });
            if (++conn >= 15) break;
          }
        }
        
        if (conn === 0) {
          for (let j = 0; j < indices.length; j++) {
            const nB = valid_nodes[indices[j]];
            if (vi === nB.i) continue;
            
            if (G_edges.has(nB.i) && G_edges.get(nB.i).length >= 1) {
               const pt_A = G_nodes[vi], pt_B = G_nodes[nB.i];

               if (fast_safe_corridor_numpy(pt_A, pt_B, win, safeD, 0, isBatnas)) {
                   const w = fast_nm_dist(pt_A, pt_B);
                   let d_vi = 1.0;
                   for(let k=0; k<valid_nodes.length; k++) if(valid_nodes[k].i === vi) { d_vi = valid_nodes[k].danger; break; }
                   const penalty = Math.max(d_vi, nB.danger);

                   G_edges.get(vi).push({ ni: nB.i, w: w * penalty });
                   if (!G_edges.has(nB.i)) G_edges.set(nB.i, []);
                   G_edges.get(nB.i).push({ ni: vi, w: w * penalty });
                   if (++conn >= 3) break; 
               }
            }
          }
        }
      }

      const heuristic_dist = (n1_pt, n2_pt) => fast_nm_dist(n1_pt, n2_pt);
      const raw_path = live_astar_path(G_nodes, G_edges, realSi, realEi, heuristic_dist);

      if (raw_path) {
        segPath = raw_path.map(idx => G_nodes[idx]);
        success_micro = true;
      } else {
        pad_iter += 2.0; 
        c_factor += 1; 
      }
    }

    if (!success_micro) {
      console.log(`      ❌ SEGMEN GAGAL (KANDAS MUTLAK): Terhalang perairan dangkal yang tidak dapat ditembus pada syarat ${safeD.toFixed(1)}m.`);
      return null; // Return null akan otomatis menggagalkan rute secara jujur (berth terjebak total)
    }

    const smooth_seg = [segPath[0]]; let curr = 0;
    while (curr < segPath.length - 1) {
      let furthest = curr + 1;
      for (let nxt = Math.min(segPath.length - 1, curr + 40); nxt > curr + 1; nxt--) {
        // STRICT AUDIT: Smoothing wajb mematuhi safeD
        if (fast_safe_corridor_numpy(segPath[curr], segPath[nxt], win, safeD, 4, isBatnas)) { furthest = nxt; break; }
      }
      smooth_seg.push(segPath[furthest]); curr = furthest;
    }

    if (full_organic_path.length === 0) full_organic_path.push(...smooth_seg);
    else full_organic_path.push(...smooth_seg.slice(1));
  }

  const global_smoothed = [full_organic_path[0]]; let curr = 0;
  while (curr < full_organic_path.length - 1) {
    let furthest = curr + 1;
    for (let nxt = Math.min(full_organic_path.length - 1, curr + 200); nxt > curr + 1; nxt--) {
      // STRICT AUDIT: Global Smoothing wajib mematuhi safeD
      if (fast_safe_corridor_numpy(full_organic_path[curr], full_organic_path[nxt], win, safeD, 4, isBatnas)) { furthest = nxt; break; }
    }
    global_smoothed.push(full_organic_path[furthest]); curr = furthest;
  }

  // Inject win dan safeD ke Bezier agar sudut lengkungan tervalidasi
  const with_bezier = applyBezierManeuvers(global_smoothed, win, safeD, isBatnas);
  const final_wp = applyOrganicInterpolation(with_bezier);

  let dist = 0;
  for (let i = 0; i < final_wp.length - 1; i++) dist += fast_nm_dist(final_wp[i], final_wp[i+1]);
  console.log(`      ✅ RUTE DITEMUKAN | Jarak Laut Aktual (Telah Diluruskan): ${dist.toFixed(1)} NM | Waypoint Akhir: ${final_wp.length}          `);
  return { waypoints: final_wp, distanceNm: dist };
}

// ==============================================================================
// 6. MAIN PUBLIC COMPUTE ROUTE API
// ==============================================================================
const _pendingRoutes = new Map();

async function computeRoute(origin, destination, options = {}) {
  const key = makeRouteKey(origin.name || `${origin.lat},${origin.lon}`, destination.name || `${destination.lat},${destination.lon}`);
  // Cek apakah rute sedang diproses server lain
  if (!options.forceRecompute && _pendingRoutes.has(key)) return _pendingRoutes.get(key);
  // ⚡ [TAMBAHKAN BLOK INI] MEMBACA CACHE DARI DATABASE POSTGRESQL ⚡
  if (!options.forceRecompute) {
    try {
      const cachedRoute = await prisma.spatialRouteCache.findUnique({ where: { routeKey: key } });
      if (cachedRoute && cachedRoute.waypoints && cachedRoute.waypoints.length > 0) {
        console.log(`      ⚡ CACHE DITEMUKAN | Memuat Rute: ${origin.name || 'Origin'} <--> ${destination.name || 'Dest'} dalam 0.0s`);
        return { ...cachedRoute, status: cachedRoute.maxDepth <= cachedRoute.safeDepth ? 'Aman' : 'Rawan Kandas', fromCache: true };
      }
    } catch (e) {
      console.error('[Cache Error] Gagal membaca rute dari database:', e.message);
    }
  }
  // ⚡ [AKHIR BLOK TAMBAHAN] ⚡
  let _res, _rej; const _def = new Promise((r, j) => { _res = r; _rej = j; });
  if (!options.forceRecompute) _pendingRoutes.set(key, _def);
  try {
    const pad = options.bathyEngine === 'batnas' ? 3.0 : 1.0; 
    
    const win = options.bathyEngine === 'batnas'
      ? await getBatnas(Math.min(origin.lat, destination.lat) - pad, Math.max(origin.lat, destination.lat) + pad, Math.min(origin.lon, destination.lon) - pad, Math.max(origin.lon, destination.lon) + pad)
      : await getGebco(Math.min(origin.lat, destination.lat) - pad, Math.max(origin.lat, destination.lat) + pad, Math.min(origin.lon, destination.lon) - pad, Math.max(origin.lon, destination.lon) + pad);

    if (!win) throw new Error(`Data bathymetri gagal dimuat untuk rute ini.`);

    for (let i = 0; i < win.data.length; i++) {
      if (win.data[i] > 8000 || win.data[i] < -11000 || isNaN(win.data[i])) {
        win.data[i] = -9999; 
      }
    }

    let route_max_wave = 0;
    if (options.weatherCacheByZone) {
       for (const z of Object.values(options.weatherCacheByZone)) {
           route_max_wave = Math.max(route_max_wave, z.wave || 0);
       }
    }
    const finalSafeD = -(MAX_DESIGN_DRAFT + UKC_CLEARANCE + 0.5 * route_max_wave);

    console.log(`\n🕸️ MERAKIT JARINGAN NAVIGASI (STRICT AUDIT DEPTH PARITY)...`);
    console.log(`   ⚓ DRAFT KAPAL MAKSIMAL (DATABASE): ${MAX_DESIGN_DRAFT.toFixed(1)}m | UKC: ${UKC_CLEARANCE.toFixed(2)}m`);
    console.log(`   📐 PANJANG KAPAL (LPP) MAKSIMAL  : ${MAX_LPP.toFixed(1)}m`);
    console.log(`\n   🏗️  MENGKALKULASI AKSES PESISIR (DARAT -> PANTAI -> JETTY/KERUK)...`);
    console.log(`      (Memaksa pencarian Jetty hingga kedalaman laut ekstrem rute: ${finalSafeD.toFixed(1)}m)`);

    const bOrig = await calculate_access_and_jetty(origin.name || 'Origin', [origin.lat, origin.lon], win, options.weatherCacheByZone, finalSafeD);
    const bDest = await calculate_access_and_jetty(destination.name || 'Dest', [destination.lat, destination.lon], win, options.weatherCacheByZone, finalSafeD);

    console.log(`\n   🗺️ MEMULAI KALKULASI RUTE (SMART A-STAR ENGINE)...`);
    
    let routeResult = await run_spatial_core([bOrig.berthLat, bOrig.berthLon], [bDest.berthLat, bDest.berthLon], finalSafeD, win, options.bathyEngine === 'batnas', origin.name || 'Origin', destination.name || 'Dest');

    if (!routeResult || routeResult.waypoints.length < 2) {
        console.log(`      ⚠️ RUTE ALAMI BUNTU: Tidak ada jalur murni air yang memenuhi syarat kedalaman ${finalSafeD.toFixed(1)}m.`);
        console.log(`      ⚠️ Mengirimkan data kosong agar rute dicoret dari sistem.`);
        routeResult = { waypoints: [], distanceNm: -1.0 }; 
    }

    let mn = Infinity, mx = -Infinity;
    for (const pt of routeResult.waypoints) {
      const r = Math.round((pt[0]-win.latStart)/win.latStep), c = Math.round((pt[1]-win.lonStart)/win.lonStep);
      const d = getElevationClean(win, r, c);
      if (d !== 9999) { mn = Math.min(mn, d); mx = Math.max(mx, d); }
    }

    // Pencarian Zona Laut Akurat Berdasarkan Garis Rute (Waypoint)
    const exactZones = new Set();
    if (routeResult.waypoints && routeResult.waypoints.length > 0) {
      // Kita ambil sampel setiap 5 titik agar proses komputasi tetap kilat
      for (let i = 0; i < routeResult.waypoints.length; i += 5) {
        const pt = routeResult.waypoints[i];
        try {
          const zone = await ihoSvc.getActiveZone(pt[0], pt[1]);
          if (zone) exactZones.add(zone);
        } catch (e) {}
      }
      // Pastikan titik pelabuhan tujuan (terakhir) juga selalu terdata
      const lastPt = routeResult.waypoints[routeResult.waypoints.length - 1];
      try {
        const zone = await ihoSvc.getActiveZone(lastPt[0], lastPt[1]);
        if (zone) exactZones.add(zone);
      } catch (e) {}
    }
    const weatherZones = Array.from(exactZones);

    const status = (mx <= finalSafeD) ? 'Aman' : 'Rawan Kandas';
    const dbRecord = {
      routeKey: key, origin: origin.name, destination: destination.name,
      waypoints: routeResult.waypoints, distanceNm: routeResult.distanceNm,
      minDepth: mn === Infinity ? 0 : mn, maxDepth: mx === -Infinity ? 0 : mx,
      engineUsed: options.bathyEngine,
      safeDepth: parseFloat(finalSafeD.toFixed(1)),
      weatherZones
    };

    try { await prisma.spatialRouteCache.upsert({ where: { routeKey: key }, update: dbRecord, create: dbRecord }); } catch (e) { console.error('[SpatialRoute] DB upsert error:', e.message); }

    const res = { ...dbRecord, status, fromCache: false };
    if (_res) _res(res); return res;
  } catch (e) {
    if (_rej) _rej(e); throw e;
  } finally {
    if (!options.forceRecompute) _pendingRoutes.delete(key);
  }
}

async function computeJettyReport(locationName, lat, lon, options = {}) {
  
  // ⚡ [TAMBAHKAN BLOK INI] MEMBACA CACHE PELABUHAN ⚡
  if (!options.forceRecompute) {
    try {
      const cachedJetty = await prisma.jettyBerthReport.findUnique({ where: { locationName } });
      if (cachedJetty) {
        return { ...cachedJetty, landM: parseFloat((cachedJetty.landKm * 1000).toFixed(0)), fromCache: true };
      }
    } catch (e) {
      console.error('[Cache Error] Gagal membaca Jetty:', e.message);
    }
  }
  // ⚡ [AKHIR BLOK TAMBAHAN] ⚡
  const pad = 0.5;
  
  const win = options.bathyEngine === 'batnas'
    ? await getBatnas(lat - pad, lat + pad, lon - pad, lon + pad)
    : await getGebco(lat - pad, lat + pad, lon - pad, lon + pad);

  if (!win) return { locationName, origLat: lat, origLon: lon, shoreLat: lat, shoreLon: lon, berthLat: lat, berthLon: lon, landKm: 0, jettyM: 0, berthDepth: 0, engineUsed: 'none' };

  for (let i = 0; i < win.data.length; i++) {
    if (win.data[i] > 8000 || win.data[i] < -11000 || isNaN(win.data[i])) win.data[i] = -9999;
  }

  const berth = await calculate_access_and_jetty(locationName, [lat, lon], win, options.weatherCacheByZone, null);

  const safeDepth = parseFloat(berth.safeD.toFixed(1));
  const berthStatus = berth.berthDepth <= berth.safeD ? 'Aman' : 'Rawan Kandas';
  
  const dbReport = {
    locationName, origLat: lat, origLon: lon, shoreLat: lat, shoreLon: lon,
    berthLat: berth.berthLat, berthLon: berth.berthLon,
    landKm: parseFloat(berth.landKm.toFixed(2)),
    jettyM: parseFloat(berth.jettyM.toFixed(0)),
    berthDepth: parseFloat(berth.berthDepth.toFixed(1)),
    safeDepth,
    status: berthStatus,
    engineUsed: options.bathyEngine
  };

  try { await prisma.jettyBerthReport.upsert({ where: { locationName }, update: dbReport, create: dbReport }); } catch (e) { console.error('[JettyReport] DB upsert error:', e.message); }
  
  return { ...dbReport, landM: parseFloat((berth.landKm * 1000).toFixed(0)) };
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. ENGINE VOYAGE & ORU DYNAMIC
// ─────────────────────────────────────────────────────────────────────────────
async function computeDynamicVoyageHours(waypoints, vessel, weatherCacheByZone) {
  if (!waypoints || waypoints.length < 2) return 0;
  let totalHours = 0;
  for (let i = 0; i < waypoints.length - 1; i++) {
    const [l1, o1] = waypoints[i], [l2, o2] = waypoints[i + 1];
    const d = fast_nm_dist([l1, o1], [l2, o2]);
    const zone = await ihoSvc.getActiveZone((l1 + l2) / 2, (o1 + o2) / 2);
    const wx = (zone && weatherCacheByZone && weatherCacheByZone[zone]) || { wave: 0, wind: 0 };
    const spd = calcSpeedLoss(vessel, wx.wave || 0, wx.wind || 0);
    totalHours += d / spd;
  }
  return totalHours;
}

const IKK_DATA_FALLBACK = { 'Aceh': 96.61, 'Sumatera Utara': 97.45, 'Sumatera Barat': 93.06, 'Riau': 96.1, 'Jambi': 95.32, 'Sumatera Selatan': 90.62, 'Bengkulu': 94.2, 'Lampung': 89.12, 'Kepulauan Bangka Belitung': 105.37, 'Kepulauan Riau': 111.94, 'Dki Jakarta': 114.79, 'Jawa Barat': 105.3, 'Jawa Tengah': 102.08, 'Di Yogyakarta': 104.88, 'Jawa Timur': 96.29, 'Banten': 94.18, 'Bali': 107.46, 'Nusa Tenggara Barat': 104.09, 'Nusa Tenggara Timur': 92.42, 'Kalimantan Barat': 107.34, 'Kalimantan Tengah': 106.56, 'Kalimantan Selatan': 100.7, 'Kalimantan Timur': 118.3, 'Kalimantan Utara': 107.52, 'Sulawesi Utara': 100.77, 'Sulawesi Tengah': 91.82, 'Sulawesi Selatan': 95.91, 'Sulawesi Tenggara': 94.71, 'Gorontalo': 96.51, 'Sulawesi Barat': 91.63, 'Maluku': 106.52, 'Maluku Utara': 114.09, 'Papua Barat': 124.71, 'Papua Barat Daya': 122.21, 'Papua': 134.96, 'Papua Selatan': 142.98, 'Papua Tengah': 209.28, 'Papua Pegunungan': 249.12 };
const ORU_DB_FALLBACK = [ { cap: 4.89,  unit: 'MMSCFD', cost: 23582442.21, year: 2024, refLoc: 'Papua' }, { cap: 16.39, unit: 'MMSCFD', cost: 26430984.51, year: 2024, refLoc: 'Papua' }, { cap: 3.6,   unit: 'BBTUD',  cost: 6956193.77,  year: 2022, refLoc: 'Nusa Tenggara Barat' }, { cap: 2.9,   unit: 'BBTUD',  cost: 7013640.21,  year: 2022, refLoc: 'Nusa Tenggara Timur' }, { cap: 1.65,  unit: 'BBTUD',  cost: 7185979.55,  year: 2022, refLoc: 'Nusa Tenggara Timur' }, { cap: 6.13,  unit: 'BBTUD',  cost: 6994491.40,  year: 2022, refLoc: 'Nusa Tenggara Barat' }, { cap: 6.13,  unit: 'BBTUD',  cost: 7071086.66,  year: 2022, refLoc: 'Nusa Tenggara Barat' }, { cap: 2.9,   unit: 'BBTUD',  cost: 7043320.88,  year: 2022, refLoc: 'Nusa Tenggara Timur' }, { cap: 1.3,   unit: 'BBTUD',  cost: 6851832.73,  year: 2022, refLoc: 'Nusa Tenggara Timur' }, { cap: 1.3,   unit: 'BBTUD',  cost: 7043320.88,  year: 2022, refLoc: 'Nusa Tenggara Timur' } ];

function lookupIkk(ikkMap, prov) {
  if (!prov) return 100.0;
  if (ikkMap[prov] != null) return ikkMap[prov];
  const lower = prov.toLowerCase();
  for (const [k, v] of Object.entries(ikkMap)) { if (k.toLowerCase() === lower) return v; }
  return 100.0;
}

async function getDynamicOruCapex(demandBbtud, targetProv, analysisYear, inflationRate, heatingValue = 1050) {
  let ikkMap = IKK_DATA_FALLBACK;
  try { const cciRows = await prisma.cci.findMany(); if (cciRows.length > 0) { ikkMap = {}; for (const r of cciRows) ikkMap[r.provinsi] = r.cci; } } catch (_) { }

  let oruDb = [];
  try {
    const rows = await prisma.oruCapex.findMany({ where: { capacityValue: { not: null } }, orderBy: { capacityValue: 'asc' } });
    if (rows.length >= 1) { oruDb = rows.map(r => ({ cap: r.capacityValue, unit: r.unit || 'MMSCFD', cost: r.fixCapexUSD, year: r.year, refLoc: r.province || 'Papua' })); }
  } catch (_) { }
  if (oruDb.length < 1) oruDb = ORU_DB_FALLBACK;

  const oruInBbtud = oruDb.map(item => { return { ...item, capBbtud: item.unit === 'MMSCFD' ? (item.cap * heatingValue) / 1000.0 : item.cap }; });
  
  const bestMatch = oruInBbtud.reduce((prev, curr) => {
    const diffCurr = Math.abs(curr.capBbtud - demandBbtud);
    const diffPrev = Math.abs(prev.capBbtud - demandBbtud);
    if (diffCurr < diffPrev) return curr;
    if (diffCurr === diffPrev) return curr.cost > prev.cost ? curr : prev;
    return prev;
  });

  const capacityFactor = Math.pow(demandBbtud / bestMatch.capBbtud, 0.6);
  const scaledBaseCost = bestMatch.cost * capacityFactor;

  const ikkTarget = lookupIkk(ikkMap, targetProv);
  const ikkRef    = lookupIkk(ikkMap, bestMatch.refLoc);
  const inflatedCost = scaledBaseCost * Math.pow(1 + inflationRate, analysisYear - bestMatch.year);
  const finalCapexUsd = inflatedCost * (ikkTarget / ikkRef);

  return { finalCapexUsd, scaledBaseCost, inflatedCost, ikkTarget, ikkRef, bestMatchName: bestMatch.refLoc, bestMatchCapBbtud: parseFloat(bestMatch.capBbtud.toFixed(4)), capacityFactor: parseFloat(capacityFactor.toFixed(6)) };
}

async function computeWeatherLegReport(legs, vessel, weatherCacheByZone) {
  const results = [];
  try {
    for (const { origin, destination, waypoints } of legs) {
      if (!waypoints || waypoints.length < 2) continue;
      const zonesSet = new Set();
      let totalDist = 0, totalHours = 0, minSpd = Infinity;
      
      console.log(`\n   📊 LOG KECEPATAN KAPAL: ${origin} ➔ ${destination}`);
      
      // 🚨 CEK PERTAMA: Apakah data Kapal ada?
      if (!vessel || vessel.speedKnot === undefined) {
        throw new Error("Data kapal (vessel) kosong atau tidak memiliki 'speedKnot'!");
      }

      let currentZone = "Lautan Normal";
      let currentSpeed = vessel.speedKnot;
      let segmentStartDist = 0;

      for (let i = 0; i < waypoints.length - 1; i++) {
        const [l1, o1] = waypoints[i], [l2, o2] = waypoints[i + 1];
        const d = fast_nm_dist([l1, o1], [l2, o2]);
        let zone = null;
        try { zone = await ihoSvc.getActiveZone((l1 + l2) / 2, (o1 + o2) / 2); } catch (_) { }
        const wx = (zone && weatherCacheByZone && weatherCacheByZone[zone]) || { wave: 0, wind: 0 };
        
        // 🚨 CEK KEDUA: Apakah fungsi perhitungan ombak ada?
        if (typeof calcSpeedLoss !== 'function') {
           throw new Error("Fungsi 'calcSpeedLoss' HILANG! Pastikan sudah di-require/import di bagian paling atas file.");
        }
        
        const spd = calcSpeedLoss(vessel, wx.wave || 0, wx.wind || 0);
        const zoneName = zone ? zone : "Lautan Normal";

        if (Math.abs(spd - currentSpeed) > 0.05 || zoneName !== currentZone) {
          if (totalDist > segmentStartDist) {
            const status = currentSpeed < vessel.speedKnot ? '⚠️ Kecepatan Turun' : '✅ Kecepatan Normal';
            const zLabel = currentZone.replace('_', ' ');
            console.log(`      ➤ Jarak ${segmentStartDist.toFixed(0)} - ${totalDist.toFixed(0)} NM: ${status} (${currentSpeed.toFixed(1)} Kts) melintasi ${zLabel}`);
          }
          currentZone = zoneName;
          currentSpeed = spd;
          segmentStartDist = totalDist;
        }

        if (zone) zonesSet.add(zone);
        totalDist += d;
        totalHours += d / spd;
        if (spd < minSpd) minSpd = spd;
      }
      
      if (totalDist > segmentStartDist) {
        const status = currentSpeed < vessel.speedKnot ? '⚠️ Kecepatan Turun' : '✅ Kecepatan Normal';
        const zLabel = currentZone.replace('_', ' ');
        console.log(`      ➤ Jarak ${segmentStartDist.toFixed(0)} - ${totalDist.toFixed(0)} NM: ${status} (${currentSpeed.toFixed(1)} Kts) melintasi ${zLabel}`);
      }

      const avgSpd = totalHours > 0 ? totalDist / totalHours : vessel.speedKnot;
      console.log(`      🏁 RATA-RATA AKHIR: ${avgSpd.toFixed(1)} Kts | TOTAL WAKTU: ${totalHours.toFixed(1)} Jam\n`);

      results.push({ origin, destination, zonesAffected: [...zonesSet], avgSpeedKts: parseFloat(avgSpd.toFixed(2)), minSpeedKts: minSpd === Infinity ? vessel.speedKnot : parseFloat(minSpd.toFixed(2)) });
    }
  } catch (err) {
    // 🔥 Jika terjadi Error, terminal akan teriak warna merah!
    console.error(`\n   ❌ [SYSTEM CRASH] GAGAL MEMPROSES LOG KECEPATAN: ${err.message}\n`);
  }
  return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// MODEL FISIKA: HOLTROP & MENNEN SPEED-LOSS
// ─────────────────────────────────────────────────────────────────────────────
function calcSpeedLoss(vessel, waveH, windKt) {
  const Vs_knot = vessel.speedKnot || vessel.Kecepatan || 14;
  if (waveH === 0 && windKt === 0) return Vs_knot;

  const Vs   = Vs_knot * 0.5144;       // m/s
  const LPP  = vessel.lpp   || vessel.LPP  || 120;
  const B    = vessel.breadth || vessel.B  || 22;
  const T    = vessel.draft  || vessel.T   || 7;
  const D    = vessel.depth  || vessel.D   || 14;
  const withBulb = vessel.withBulb !== undefined ? vessel.withBulb : true;

  const g           = 9.81;
  const rho_sea_ton = 1.025;
  const rho_sea_kg  = 1025.0;
  const rho_air     = 1.225;
  const nu          = 1.18831e-6;

  if (Vs <= 0.1) return Vs_knot;

  const LWL = 1.04 * LPP;
  const Fn  = Vs / Math.sqrt(g * LWL);
  const Cb  = Math.max(0.4, Math.min(0.9, -4.22 + 27.8 * Math.sqrt(Fn) - 39.1 * Fn + 46.6 * Fn ** 3));
  const Cm  = 0.977 + 0.085 * (Cb - 0.60);
  const Cp  = Cb / Cm;
  const CWP = Cb / (0.471 + 0.551 * Cb);

  const lcb_min = 9.7 - (45 * Fn) - 0.8;
  const Vol_Disp = LWL * B * T * Cb;
  const Rn  = LWL * (Vs / nu);
  const Cf0 = 0.075 / (Math.log10(Rn) - 2) ** 2;

  const Lr_L = Math.max(0.01, 1 - Cp + 0.06 * Cp * lcb_min / (4 * Cp - 1));
  const Cp_safe = Math.max(0.01, Math.min(0.99, Cp));
  const k1_base = 0.93 + 0.4871 * 1.0 * Math.pow(B / LPP, 1.0681) * Math.pow(T / LPP, 0.4611) * Math.pow(1 / Lr_L, 0.1216) * Math.pow(LPP ** 3 / Vol_Disp, 0.3649) * Math.pow(1 - Cp_safe, -0.6042);

  const S_main = LWL * (2 * T + B) * Math.sqrt(Cm) * (0.4530 + 0.4425 * Cb - 0.2862 * Cm - 0.003467 * (B / T) + 0.3696 * CWP) + (withBulb ? (2.38 * (0.10 * B * T * Cm) / Cb) : 0);
  const S_tot = S_main + (1.75 * LPP * T) / 100 + 0.6 * Cb * LPP * 0.18 / Math.max(Cb - 0.2, 0.01) * 4;

  const iE_safe = Math.max(0.1, Math.min(89.9, 125.67 * (B / LPP) - 162.25 * Cp ** 2 + 234.32 * Cp ** 3 + 0.1551 * lcb_min ** 3));
  const C11 = 2223105 * Math.pow(B / LPP, 3.7861) * Math.pow(T / B, 1.0796) * Math.pow(90 - iE_safe, -1.3757);

  const m1 = 0.01404 * (LPP / T) - 1.7525 * Math.pow(Vol_Disp, 1 / 3) / LPP - 4.7932 * (B / LPP) - (8.0789 * Cp - 13.8673 * Cp ** 2 + 6.9844 * Cp ** 3);

  const bulbABT = withBulb ? 0.10 * B * T * Cm : 0;
  const r_b = 0.56 * Math.sqrt(bulbABT);
  const h_b = 0.5 * T;
  const i_val = T - h_b - 0.4464 * r_b;
  let C12 = 1.0;
  if (withBulb && r_b > 0 && (r_b + i_val) > 0) C12 = (Math.exp(1.89) * bulbABT * r_b) / (B * T * (r_b + i_val));
  const C13 = 1.0;

  const Rw_W = Math.max(0.0, C11 * C12 * C13 * Math.exp(m1 * Math.pow(Fn, -0.9) + (-1.69385 * 0.4 * Math.exp(-0.034 * Math.pow(Fn, -3.29)) * Math.cos((1.446 * Cp - 0.03 * (LPP / B)) * Math.pow(Fn, -2)))));

  const R_calm_kN = Math.max(0.1, 0.5 * rho_sea_ton * Vs ** 2 * S_tot * (Cf0 * k1_base + (0.006 * Math.pow(LWL + 100, -0.16) - 0.00205)) + Rw_W * (rho_sea_ton * g * Vol_Disp));
  const R_wave_kN = (0.64 * waveH ** 2 * B ** 2 * Cb * rho_sea_kg * g / LPP) / 1000.0;
  const R_wind_kN = (0.5 * rho_air * (LPP * (D - T) + 0.6 * LPP * B) * 0.9 * (windKt * 0.5144) ** 2) / 1000.0;

  const speed_loss_pct = 1 - Math.pow(1 / (1 + (R_wave_kN + R_wind_kN) / R_calm_kN), 1 / 3);
  return Math.max(0.1, Vs_knot - Vs_knot * speed_loss_pct);
}

module.exports = { computeRoute, computeJettyReport, computeDynamicVoyageHours, computeWeatherLegReport, getDynamicOruCapex, makeRouteKey, fastNm: fast_nm_dist, UKC_CLEARANCE };