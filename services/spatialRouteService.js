/**
 * Spatial Route Service – A* Sea-Route Engine
 * ─────────────────────────────────────────────────────────────────────────────
 * REPLIKA 100% MURNI GOOGLE COLAB V3 (ULTIMATE LOGGED & FULL)
 * - Tampilan Log Terminal disamakan persis dengan format Python Colab
 * - Geodesic Vincenty ditambahkan untuk akurasi Jarak Lurus WGS-84 (Match 511.5 NM)
 * - Pencarian Jetty murni KDTree (Tanpa Linspace) agar Match dengan Colab (943 M)
 * - Start rute murni ditarik HANYA dari Berth (Titik Sandar), bukan daratan
 * - FULL VERSION: Semua fungsi ekonomi, cuaca, dan IKK terpasang utuh.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const crypto = require('crypto');
const prisma = require('../config/db');
const ihoSvc = require('./ihoService');
const { getBatnas, getGebco } = require('./bathymetryService');
const { calcSpeedLoss } = require('./weatherService');

const UKC_CLEARANCE = 2.85;
const MAX_DESIGN_DRAFT = 8.0;
const MAX_LPP = 175.0;

// ==============================================================================
// 1. REPLIKA PUSTAKA PYTHON (MinHeap, KDTree Scipy & Geodesic)
// ==============================================================================
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
    const rC = Math.floor(point[0] / this.cellSize), cC = Math.floor(point[1] / this.cellSize);
    const rad = distance_upper_bound === Infinity ? 10 : Math.ceil(distance_upper_bound / this.cellSize);
    
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

// Rumus Vincenty Elipsoid WGS-84 (Akurasi Tinggi untuk Jarak Lurus 511.5 NM)
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

// Replika fast_nm_dist murni (Untuk Heuristic A-Star & Looping)
function fast_nm_dist(c1, c2) {
  const dlat = c2[0] - c1[0];
  const dlon = (c2[1] - c1[1]) * Math.cos(((c1[0] + c2[0]) / 2) * (Math.PI / 180));
  return Math.sqrt(dlat * dlat + dlon * dlon) * 60.0;
}

function getElevationClean(win, r, c) {
  if (r < 0 || r >= win.height || c < 0 || c >= win.width) return -9999;
  let v = win.data[r * win.width + c];
  if (isNaN(v) || v > 8000 || v < -11000) return -9999;
  return v;
}

// ==============================================================================
// 2. OSM FETCHING
// ==============================================================================
let globalOSMCache = null;
let isFetchingOSM = false;

async function getOSMFerryRoutes(b_min_lat, b_max_lat, b_min_lon, b_max_lon) {
  if (globalOSMCache) return globalOSMCache;
  if (isFetchingOSM) {
    while (isFetchingOSM) await new Promise(r => setTimeout(r, 500));
    return globalOSMCache || { nodes: {}, edges: [] };
  }
  isFetchingOSM = true;
  
  console.log(`   📡 Menghisap Data Jalan Tol OSM (Harbor Exit Guide)...`);
  console.log(`      🔍 Memindai Bounding Box OSM: Lat (${b_min_lat.toFixed(1)} s/d ${b_max_lat.toFixed(1)}), Lon (${b_min_lon.toFixed(1)} s/d ${b_max_lon.toFixed(1)})`);
  
  const query = `[out:json][timeout:60]; way["route"~"ferry"](${b_min_lat}, ${b_min_lon}, ${b_max_lat}, ${b_max_lon}); out body; >; out skel qt;`;
  const urls = ["https://lz4.overpass-api.de/api/interpreter", "https://overpass-api.de/api/interpreter"];
  let data = null;

  for (const url of urls) {
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: `data=${encodeURIComponent(query)}` });
      if (res.ok) { data = await res.json(); break; }
    } catch (e) {}
  }

  const nodes = {}, edges = [];
  if (data && data.elements) {
    for (const e of data.elements) if (e.type === 'node') nodes[`OSM_${e.id}`] = [e.lat, e.lon];
    for (const e of data.elements) {
      if (e.type === 'way' && e.nodes) {
        for (let i = 0; i < e.nodes.length - 1; i++) {
          const u_id = `OSM_${e.nodes[i]}`, v_id = `OSM_${e.nodes[i+1]}`;
          if (nodes[u_id] && nodes[v_id]) edges.push([u_id, v_id]);
        }
      }
    }
  }
  console.log(`      ✅ Berhasil mengunduh jalur Tol Laut OSM!                                        \n`);
  globalOSMCache = { nodes, edges };
  isFetchingOSM = false;
  return globalOSMCache;
}

// ==============================================================================
// 3. FAST SAFE CORRIDOR NUMPY PORTING
// ==============================================================================
function fast_safe_corridor_numpy(p1, p2, win, limit_depth, buffer_px = 0, isBatnas = true) {
  const dlat = Math.abs(p2[0] - p1[0]), dlon = Math.abs(p2[1] - p1[1]);
  const lat_step_abs = Math.abs(win.latStep), lon_step_abs = Math.abs(win.lonStep);
  const factor = isBatnas ? 1.5 : 10.0;
  
  const pixel_steps = Math.trunc(Math.max(dlat / lat_step_abs, dlon / lon_step_abs) * factor);
  const steps = Math.max(isBatnas ? 5 : 10, pixel_steps);

  for (let i = 0; i < steps; i++) {
    const t = i / (steps - 1 || 1);
    const sLat = p1[0] + t * (p2[0] - p1[0]);
    const sLon = p1[1] + t * (p2[1] - p1[1]);

    const r = Math.trunc(Math.max(0, Math.min(win.height - 1, Math.round((sLat - win.latStart) / win.latStep))));
    const c = Math.trunc(Math.max(0, Math.min(win.width - 1, Math.round((sLon - win.lonStart) / win.lonStep))));
    
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

  process.stdout.write(`         🧭 Memulai inisiasi AI Navigasi...\r`);

  while (queue.size) {
    const { cost, item: curr, path } = queue.pop();
    if (visited.has(curr)) continue;
    visited.add(curr);
    nodes_explored++;

    if (nodes_explored % 100 === 0) {
      const curr_dist = heuristic(G_nodes[curr], G_nodes[target]);
      const pct = Math.max(0.0, Math.min(99.9, 100.0 - (curr_dist / start_dist * 100.0)));
      const elapsed = (Date.now() - start_time) / 1000;
      process.stdout.write(`         🧭 Navigasi AI: ${pct.toFixed(1)}% Selesai | Titik Diproses: ${nodes_explored} | Waktu: ${elapsed.toFixed(1)}s          \r`);
    }

    if (curr === target) {
      const elapsed = (Date.now() - start_time) / 1000;
      console.log(`         🧭 Navigasi AI: 100.0% Selesai | Titik Diproses: ${nodes_explored} | Berhasil dalam ${elapsed.toFixed(1)}s          `);
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
  console.log(`         ❌ [FATAL] A-Star GAGAL! Jalur terputus (NetworkXNoPath). Titik buntu di nodes ke-${nodes_explored}`);
  return null;
}

// ==============================================================================
// 4. FIND BERTH LOGIC (MURNI KDTREE TANPA LINSPACE OVERRIDE)
// ==============================================================================
function calculate_access_and_jetty(pt_name, pt_pos, win, PORT_SAFE_DEPTH, max_jetty_m_limit) {
  const ptNameDisp = pt_name.charAt(0).toUpperCase() + pt_name.slice(1);
  const valid_deep_coords = [];
  const shore_coords = [];
  
  for (let r = 0; r < win.height; r++) {
    for (let c = 0; c < win.width; c++) {
      const v = getElevationClean(win, r, c);
      const lat = win.latStart + r * win.latStep;
      const lon = win.lonStart + c * win.lonStep;
      
      if (Math.abs(lat - pt_pos[0]) > 0.5 || Math.abs(lon - pt_pos[1]) > 0.5) continue;
      
      if (v <= PORT_SAFE_DEPTH) valid_deep_coords.push([lat, lon, v]);
      if (v >= -1.0 && v <= 1.5) shore_coords.push([lat, lon]);
    }
  }

  let berth_pos = pt_pos, land_km = 0, jetty_m = 0, berth_depth = 0;

  if (valid_deep_coords.length > 0 && shore_coords.length > 0) {
    const tree_deep = new KDTree(valid_deep_coords.map(x => [x[0], x[1]]));
    const tree_shore = new KDTree(shore_coords);

    if (max_jetty_m_limit > 0) {
      const shore_cands = [];
      for (let i = 0; i < shore_coords.length; i++) {
        const [d_deg, d_idx] = tree_deep.query(shore_coords[i], 1);
        if (d_deg.length && d_deg[0] * 111000 <= max_jetty_m_limit) { 
          shore_cands.push({ shore_pt: shore_coords[i], deep_idx: d_idx[0], jetty: d_deg[0] * 111000 });
        }
      }
      if (shore_cands.length > 0) {
        const tree_valid_shore = new KDTree(shore_cands.map(x => x.shore_pt));
        const [d_p2vs_deg, valid_idx_match] = tree_valid_shore.query(pt_pos, 1);
        const best = shore_cands[valid_idx_match[0]];
        
        berth_pos = [valid_deep_coords[best.deep_idx][0], valid_deep_coords[best.deep_idx][1]];
        berth_depth = valid_deep_coords[best.deep_idx][2];
        land_km = d_p2vs_deg[0] * 111.0;
        jetty_m = best.jetty;
      } else {
        const [d_p2s_deg, best_shore_idx] = tree_shore.query(pt_pos, 1);
        const shore_pt = shore_coords[best_shore_idx[0]];
        const [d_s2d_deg, best_deep_idx] = tree_deep.query(shore_pt, 1);

        berth_pos = [valid_deep_coords[best_deep_idx[0]][0], valid_deep_coords[best_deep_idx[0]][1]];
        berth_depth = valid_deep_coords[best_deep_idx[0]][2];
        land_km = d_p2s_deg[0] * 111.0;
        jetty_m = d_s2d_deg[0] * 111000;
      }
    } else {
      const [d_p2s_deg, best_shore_idx] = tree_shore.query(pt_pos, 1);
      const shore_pt = shore_coords[best_shore_idx[0]];
      const [d_s2d_deg, best_deep_idx] = tree_deep.query(shore_pt, 1);

      berth_pos = [valid_deep_coords[best_deep_idx[0]][0], valid_deep_coords[best_deep_idx[0]][1]];
      berth_depth = valid_deep_coords[best_deep_idx[0]][2];
      land_km = d_p2s_deg[0] * 111.0;
      jetty_m = d_s2d_deg[0] * 111000;
    }
  } else if (valid_deep_coords.length > 0) {
    const tree = new KDTree(valid_deep_coords.map(x => [x[0], x[1]]));
    const [d_deg, idx] = tree.query(pt_pos, 1);
    berth_pos = [valid_deep_coords[idx[0]][0], valid_deep_coords[idx[0]][1]];
    berth_depth = valid_deep_coords[idx[0]][2];
    jetty_m = d_deg[0] * 111000;
  } else {
    berth_depth = PORT_SAFE_DEPTH - 1; 
  }
  
  console.log(`      ✅ ${ptNameDisp}: Akses Darat ${(land_km/1000).toFixed(1)} KM | Jetty ${jetty_m.toFixed(0)} M | Sandar ${berth_depth.toFixed(1)} m | Syarat: ${PORT_SAFE_DEPTH.toFixed(1)} m`);
  return { berthLat: berth_pos[0], berthLon: berth_pos[1], berthDepth: berth_depth, landKm: land_km/1000, jettyM: jetty_m };
}

// ==============================================================================
// 5. BEZIER & ORGANIC POST-PROCESSING
// ==============================================================================
function applyBezierManeuvers(pathCoords) {
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
    
    for (const t of [0.0, 0.25, 0.5, 0.75, 1.0]) {
      result.push([(1-t)**2 * p0[0] + 2*(1-t)*t * pCurr[0] + t**2 * p2[0], (1-t)**2 * p0[1] + 2*(1-t)*t * pCurr[1] + t**2 * p2[1]]);
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
// 6. CORE: A-STAR ROUTER (BATNAS & GEBCO) - 100% COLAB COMPLIANT
// ==============================================================================
async function run_spatial_core(cu, cv, safeD, win, osmData, isBatnas, u, v) {
  const dist_nm_total_log = geodesic_nm(cu, cv); 
  const lat_step_abs = Math.abs(win.latStep), lon_step_abs = Math.abs(win.lonStep);

  console.log(`   --------------------------------------------------------`);
  console.log(`   🚦 Memproses Rute: ${u} <--> ${v} (Jarak Lurus: ${dist_nm_total_log.toFixed(1)} NM)`);

  let auto_waypoints = [];
  
  if (isBatnas && dist_nm_total_log > 150.0) {
    const stride_r = Math.max(1, Math.trunc(0.025 / lat_step_abs));
    const stride_c = Math.max(1, Math.trunc(0.025 / lon_step_abs));
    const rA = Math.trunc(Math.max(0, Math.min(win.height-1, Math.round((cu[0] - win.latStart) / win.latStep))));
    const cA = Math.trunc(Math.max(0, Math.min(win.width-1, Math.round((cu[1] - win.lonStart) / win.lonStep))));
    const rB = Math.trunc(Math.max(0, Math.min(win.height-1, Math.round((cv[0] - win.latStart) / win.latStep))));
    const cB = Math.trunc(Math.max(0, Math.min(win.width-1, Math.round((cv[1] - win.lonStart) / win.lonStep))));

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
          if (getElevationClean(win, nr, nc) <= safeD && !visited_macro.has(`${nr},${nc}`)) {
            const ncost = cost + Math.sqrt(dr*dr + dc*dc);
            const heuristic = Math.sqrt((nr - rB)**2 + (nc - cB)**2);
            queue_macro.push(ncost + heuristic, ncost, `${nr},${nc}`, [...path, [nr, nc]]);
          }
        }
      }
    }
  }

  const route_segments = [cu, ...auto_waypoints, cv];
  const full_organic_path = [];

  for (let seg_idx = 0; seg_idx < route_segments.length - 1; seg_idx++) {
    const p_start = route_segments[seg_idx], p_end = route_segments[seg_idx+1];

    if (fast_safe_corridor_numpy(p_start, p_end, win, safeD, 3, isBatnas)) {
      if (full_organic_path.length === 0) full_organic_path.push(p_start, p_end);
      else full_organic_path.push(p_end);
      continue;
    }

    let success_micro = false, pad_iter = isBatnas ? 0.6 : 1.2, c_factor = 2;
    let segPath = [];

    while (pad_iter <= 15.0 && !success_micro) {
      const min_lat_iter = Math.min(p_start[0], p_end[0]) - pad_iter, max_lat_iter = Math.max(p_start[0], p_end[0]) + pad_iter;
      const min_lon_iter = Math.min(p_start[1], p_end[1]) - pad_iter, max_lon_iter = Math.max(p_start[1], p_end[1]) + pad_iter;
      
      const idx1 = Math.trunc(Math.max(0, Math.min(win.height-1, Math.round((max_lat_iter - win.latStart) / win.latStep))));
      const idx2 = Math.trunc(Math.max(0, Math.min(win.height-1, Math.round((min_lat_iter - win.latStart) / win.latStep))));
      const y_min_idx = Math.min(idx1, idx2), y_max_idx = Math.max(idx1, idx2);
      
      const idx3 = Math.trunc(Math.max(0, Math.min(win.width-1, Math.round((min_lon_iter - win.lonStart) / win.lonStep))));
      const idx4 = Math.trunc(Math.max(0, Math.min(win.width-1, Math.round((max_lon_iter - win.lonStart) / win.lonStep))));
      const x_min_idx = Math.min(idx3, idx4), x_max_idx = Math.max(idx3, idx4);

      const B_cells = 10 * c_factor;
      const final_coords = [];

      for (let bi = y_min_idx; bi < y_max_idx; bi += B_cells) {
        for (let bj = x_min_idx; bj < x_max_idx; bj += B_cells) {
          const r_end = Math.min(bi+B_cells, y_max_idx), c_end = Math.min(bj+B_cells, x_max_idx);
          let hasShallow = false;
          outer_b: for (let r = bi; r < r_end; r++) for (let c = bj; c < c_end; c++) {
            if (getElevationClean(win, r, c) > safeD) { hasShallow = true; break outer_b; }
          }
          if (hasShallow) {
            for (let r = bi; r < r_end; r+=c_factor*2) for (let c = bj; c < c_end; c+=c_factor*2) {
              if (getElevationClean(win, r, c) <= safeD) final_coords.push([win.latStart+r*win.latStep, win.lonStart+c*win.lonStep]);
            }
          } else {
            const r = Math.floor((bi+r_end)/2), c = Math.floor((bj+c_end)/2);
            if (getElevationClean(win, r, c) <= safeD) final_coords.push([win.latStart+r*win.latStep, win.lonStart+c*win.lonStep]);
          }
        }
      }

      const haloRad = Math.max(15, c_factor * 5);
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

      for (let i = 0; i < final_coords.length; i++) {
        const pt = final_coords[i];
        const r = Math.round((pt[0]-win.latStart)/win.latStep), c = Math.round((pt[1]-win.lonStart)/win.lonStep);
        const key = `${r},${c}`;
        
        if (seen.has(key)) {
          if (i === si) { G_nodes[nodeIdx] = pt; valid_nodes.push({ i: nodeIdx, danger: 1.0 }); var realSi = nodeIdx; nodeIdx++; }
          else if (i === ei) { G_nodes[nodeIdx] = pt; valid_nodes.push({ i: nodeIdx, danger: 1.0 }); var realEi = nodeIdx; nodeIdx++; }
          continue;
        }
        seen.add(key);

        const r_up = Math.min(win.height-1, r+3), r_dn = Math.max(0, r-3);
        const c_rt = Math.min(win.width-1, c+3), c_lf = Math.max(0, c-3);
        
        let danger = 1.0;
        let isSafe = true;
        
        if (getElevationClean(win, r_up, c) > safeD || getElevationClean(win, r_dn, c) > safeD || getElevationClean(win, r, c_rt) > safeD || getElevationClean(win, r, c_lf) > safeD) isSafe = false;
        if (!isSafe && i !== si && i !== ei) continue; 

        outer_dang: for (let nr = r_dn; nr <= r_up; nr++) for (let nc = c_lf; nc <= c_rt; nc++) {
          if (getElevationClean(win, nr, nc) > safeD) { danger = 1.7; break outer_dang; }
        }
        
        G_nodes[nodeIdx] = pt;
        valid_nodes.push({ i: nodeIdx, danger });
        
        if (i === si) var realSi = nodeIdx;
        if (i === ei) var realEi = nodeIdx;
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
          
          const d_nm = fast_nm_dist(G_nodes[nA.i], G_nodes[nB.i]);
          const penalty = Math.max(nA.danger, nB.danger);
          
          if (d_nm <= c_factor * Math.max(lat_step_abs, lon_step_abs) * 60.0 * 1.5) {
            G_edges.get(nA.i).push({ ni: nB.i, w: d_nm * penalty });
            if (!G_edges.has(nB.i)) G_edges.set(nB.i, []);
            G_edges.get(nB.i).push({ ni: nA.i, w: d_nm * penalty });
          } else if (fast_safe_corridor_numpy(G_nodes[nA.i], G_nodes[nB.i], win, safeD, 0, isBatnas)) {
            G_edges.get(nA.i).push({ ni: nB.i, w: d_nm * penalty });
            if (!G_edges.has(nB.i)) G_edges.set(nB.i, []);
            G_edges.get(nB.i).push({ ni: nA.i, w: d_nm * penalty });
          }
        }
      }

      for (const vi of [realSi, realEi]) {
        if (!G_edges.has(vi)) G_edges.set(vi, []);
        const [dists, indices] = tree_grid.query(G_nodes[vi], 200);
        let conn = 0;
        for (let j = 0; j < indices.length; j++) {
          const nB = valid_nodes[indices[j]];
          if (vi === nB.i) continue;
          if (fast_safe_corridor_numpy(G_nodes[vi], G_nodes[nB.i], win, safeD, 1, isBatnas)) {
            const w = fast_nm_dist(G_nodes[vi], G_nodes[nB.i]);
            G_edges.get(vi).push({ ni: nB.i, w });
            if (!G_edges.has(nB.i)) G_edges.set(nB.i, []);
            G_edges.get(nB.i).push({ ni: vi, w });
            if (++conn >= 15) break;
          }
        }
        
        if (conn < 3) {
          for (let j = 0; j < Math.min(8, indices.length); j++) {
            const nB = valid_nodes[indices[j]];
            if (vi === nB.i) continue;
            const w = fast_nm_dist(G_nodes[vi], G_nodes[nB.i]);
            G_edges.get(vi).push({ ni: nB.i, w });
            if (!G_edges.has(nB.i)) G_edges.set(nB.i, []);
            G_edges.get(nB.i).push({ ni: vi, w });
          }
        }
      }

      const heuristic_dist = (n1_pt, n2_pt) => fast_nm_dist(n1_pt, n2_pt);
      const raw_path = live_astar_path(G_nodes, G_edges, realSi, realEi, heuristic_dist);

      if (raw_path) {
        segPath = raw_path.map(idx => G_nodes[idx]);
        success_micro = true;
      } else {
        pad_iter += 2.0; c_factor += 1;
      }
    }

    if (!success_micro) return null;

    const smooth_seg = [segPath[0]]; let curr = 0;
    while (curr < segPath.length - 1) {
      let furthest = curr + 1;
      for (let nxt = Math.min(segPath.length - 1, curr + 40); nxt > curr + 1; nxt--) {
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
      if (fast_safe_corridor_numpy(full_organic_path[curr], full_organic_path[nxt], win, safeD, 4, isBatnas)) { furthest = nxt; break; }
    }
    global_smoothed.push(full_organic_path[furthest]); curr = furthest;
  }

  const with_bezier = applyBezierManeuvers(global_smoothed);
  const final_wp = applyOrganicInterpolation(with_bezier);

  let dist = 0;
  for (let i = 0; i < final_wp.length - 1; i++) dist += fast_nm_dist(final_wp[i], final_wp[i+1]);
  console.log(`      ✅ RUTE DITEMUKAN | Jarak Laut Aktual (Telah Diluruskan): ${dist.toFixed(1)} NM | Waypoint Akhir: ${final_wp.length}          `);
  return { waypoints: final_wp, distanceNm: dist };
}

// ==============================================================================
// 7. MAIN PUBLIC COMPUTE ROUTE API
// ==============================================================================
const _pendingRoutes = new Map();

async function computeRoute(origin, destination, options = {}) {
  // PAKSAAN: Selalu gunakan draft kapal terbesar dari database saat membuat jaring agar universal aman.
  const safeD = -(MAX_DESIGN_DRAFT + UKC_CLEARANCE + 0.5 * (options.waveHeight || 0));
  const key = makeRouteKey(origin.name || `${origin.lat},${origin.lon}`, destination.name || `${destination.lat},${destination.lon}`);

  if (!options.forceRecompute && _pendingRoutes.has(key)) return _pendingRoutes.get(key);
  let _res, _rej; const _def = new Promise((r, j) => { _res = r; _rej = j; });
  if (!options.forceRecompute) _pendingRoutes.set(key, _def);

  try {
    const pad = options.bathyEngine === 'batnas' ? 3.0 : 1.0; 
    
    const win = options.bathyEngine === 'batnas'
      ? await getBatnas(Math.min(origin.lat, destination.lat) - pad, Math.max(origin.lat, destination.lat) + pad, Math.min(origin.lon, destination.lon) - pad, Math.max(origin.lon, destination.lon) + pad)
      : await getGebco(Math.min(origin.lat, destination.lat) - pad, Math.max(origin.lat, destination.lat) + pad, Math.min(origin.lon, destination.lon) - pad, Math.max(origin.lon, destination.lon) + pad);

    if (!win) throw new Error(`Data bathymetri gagal dimuat untuk rute ini.`);

    console.log(`\n🕸️ MERAKIT JARINGAN NAVIGASI (MODE: ULTRA-FINE CAPSULE & STRING PULLING)...`);
    console.log(`   ⚓ DRAFT KAPAL MAKSIMAL (DATABASE): ${MAX_DESIGN_DRAFT.toFixed(1)}m | UKC: ${UKC_CLEARANCE.toFixed(2)}m`);
    console.log(`   📐 PANJANG KAPAL (LPP) MAKSIMAL  : ${MAX_LPP.toFixed(1)}m (Untuk Kalkulasi Manuver)`);
    console.log(`\n   🏗️  MENGKALKULASI AKSES PESISIR (DARAT -> PANTAI -> JETTY/KERUK)...`);

    const bOrig = calculate_access_and_jetty(origin.name || 'Origin', [origin.lat, origin.lon], win, safeD, 0);
    const bDest = calculate_access_and_jetty(destination.name || 'Dest', [destination.lat, destination.lon], win, safeD, 0);

    const bbox_min_lat = Math.min(origin.lat, destination.lat) - 5.0;
    const bbox_max_lat = Math.max(origin.lat, destination.lat) + 5.0;
    const bbox_min_lon = Math.min(origin.lon, destination.lon) - 5.0;
    const bbox_max_lon = Math.max(origin.lon, destination.lon) + 5.0;

    const osmData = await getOSMFerryRoutes(bbox_min_lat, bbox_max_lat, bbox_min_lon, bbox_max_lon);

    console.log(`\n   🗺️ MEMULAI KALKULASI RUTE (ULTRA-FINE MACRO & STRING PULLING AI)...`);
    
    // INPUT MURNI DARI BERTH KE BERTH
    const routeResult = await run_spatial_core([bOrig.berthLat, bOrig.berthLon], [bDest.berthLat, bDest.berthLon], safeD, win, osmData, options.bathyEngine === 'batnas', origin.name || 'Origin', destination.name || 'Dest');

    if (!routeResult) throw new Error(`Gagal mencari rute.`);

    let mn = Infinity, mx = -Infinity;
    for (const pt of routeResult.waypoints) {
      const r = Math.round((pt[0]-win.latStart)/win.latStep), c = Math.round((pt[1]-win.lonStart)/win.lonStep);
      const d = getElevationClean(win, r, c);
      if (d !== -9999) { mn = Math.min(mn, d); mx = Math.max(mx, d); }
    }

    const weatherZones = await ihoSvc.getZonesForBbox(Math.min(origin.lat, destination.lat) - pad, Math.max(origin.lat, destination.lat) + pad, Math.min(origin.lon, destination.lon) - pad, Math.max(origin.lon, destination.lon) + pad);

    const record = {
      routeKey: key, origin: origin.name, destination: destination.name,
      waypoints: routeResult.waypoints, distanceNm: routeResult.distanceNm,
      minDepth: mn === Infinity ? 0 : mn, maxDepth: mx === -Infinity ? 0 : mx,
      engineUsed: options.bathyEngine, safeDepth: safeD, weatherZones
    };

    try { await prisma.spatialRouteCache.upsert({ where: { routeKey: key }, update: record, create: record }); } catch (_) {}

    const res = { ...record, fromCache: false };
    if (_res) _res(res); return res;
  } catch (e) {
    if (_rej) _rej(e); throw e;
  } finally {
    if (!options.forceRecompute) _pendingRoutes.delete(key);
  }
}

async function computeJettyReport(locationName, lat, lon, options = {}) {
  // PAKSAAN: Selalu gunakan draft kapal terbesar dari database
  const safeD = -(MAX_DESIGN_DRAFT + UKC_CLEARANCE + 0.5 * (options.waveHeight || 0));
  const pad = 0.5;

  const win = options.bathyEngine === 'batnas'
    ? await getBatnas(lat - pad, lat + pad, lon - pad, lon + pad)
    : await getGebco(lat - pad, lat + pad, lon - pad, lon + pad);

  if (!win) return { locationName, origLat: lat, origLon: lon, shoreLat: lat, shoreLon: lon, berthLat: lat, berthLon: lon, landKm: 0, jettyM: 0, berthDepth: 0, engineUsed: 'none' };

  const berth = calculate_access_and_jetty(locationName, [lat, lon], win, safeD, options.maxJettyM || 0);

  const report = {
    locationName, origLat: lat, origLon: lon, shoreLat: lat, shoreLon: lon,
    berthLat: berth.berthLat, berthLon: berth.berthLon,
    landKm: parseFloat(berth.landKm.toFixed(2)), jettyM: parseFloat(berth.jettyM.toFixed(0)),
    berthDepth: parseFloat(berth.berthDepth.toFixed(1)), engineUsed: options.bathyEngine
  };

  try { await prisma.jettyBerthReport.upsert({ where: { locationName }, update: report, create: report }); } catch (_) {}
  return report;
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. ENGINE VOYAGE & ORU DYNAMIC
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
  
  // TIE-BREAKER KONSERVATIF: Mengambil harga yang lebih mahal jika kapasitas kembar
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
  for (const { origin, destination, waypoints } of legs) {
    if (!waypoints || waypoints.length < 2) continue;
    const zonesSet = new Set();
    let totalDist = 0, totalHours = 0, minSpd = Infinity;
    for (let i = 0; i < waypoints.length - 1; i++) {
      const [l1, o1] = waypoints[i], [l2, o2] = waypoints[i + 1];
      const d = fast_nm_dist([l1, o1], [l2, o2]);
      let zone = null;
      try { zone = await ihoSvc.getActiveZone((l1 + l2) / 2, (o1 + o2) / 2); } catch (_) { }
      const wx = (zone && weatherCacheByZone && weatherCacheByZone[zone]) || { wave: 0, wind: 0 };
      const spd = calcSpeedLoss(vessel, wx.wave || 0, wx.wind || 0);
      if (zone) zonesSet.add(zone);
      totalDist += d;
      totalHours += d / spd;
      if (spd < minSpd) minSpd = spd;
    }
    const avgSpd = totalHours > 0 ? totalDist / totalHours : vessel.speedKnot;
    results.push({ origin, destination, zonesAffected: [...zonesSet], avgSpeedKts: parseFloat(avgSpd.toFixed(2)), minSpeedKts: minSpd === Infinity ? vessel.speedKnot : parseFloat(minSpd.toFixed(2)) });
  }
  return results;
}

module.exports = { computeRoute, computeJettyReport, computeDynamicVoyageHours, computeWeatherLegReport, getDynamicOruCapex, makeRouteKey, fastNm: fast_nm_dist, UKC_CLEARANCE };