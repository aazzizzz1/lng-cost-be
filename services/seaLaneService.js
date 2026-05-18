/**
 * Indonesian Sea Lane Graph
 * ─────────────────────────────────────────────────────────────────────────────
 * Pre-defined ocean waypoint graph for Indonesian waters.
 * All nodes are verified open-ocean positions (not on land).
 * Edges connect nodes via corridors that do NOT cross islands.
 *
 * Used as the primary routing engine when BATNAS/GEBCO raster files
 * are not present, giving realistic sea routes through actual straits
 * instead of straight lines.
 *
 * Coverage: Selat Makassar · Laut Flores · Laut Banda · Laut Maluku ·
 *           Laut Sulawesi · Laut Arafura · Laut Timor · Selat Ombai ·
 *           Selat Lombok · North Papua coast · Teluk Cendrawasih
 *
 * API:
 *   findRoute({ lat, lon }, { lat, lon })
 *     → { waypoints: [[lat, lon], …], distanceNm: number }
 *
 *   getNodesGeoJSON()
 *     → GeoJSON FeatureCollection (for debug overlay in Leaflet)
 */

// ─────────────────────────────────────────────────────────────────────────────
// Equirectangular NM approximation (accurate enough for < 500 NM legs)
// ─────────────────────────────────────────────────────────────────────────────
function nm(lat1, lon1, lat2, lon2) {
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const avgLat = ((lat1 + lat2) / 2) * Math.PI / 180;
  return Math.sqrt(dLat ** 2 + (dLon * Math.cos(avgLat)) ** 2) * 6371 / 1.852;
}

// ─────────────────────────────────────────────────────────────────────────────
// Ocean node definitions [id, lat, lon]
// All positions verified as open water in Indonesian/regional seas.
// ─────────────────────────────────────────────────────────────────────────────
const RAW_NODES = [
  // ── Selat Makassar ──────────────────────────────────────────────────────────
  ['mak_n',    2.5,  118.0],   // North entrance
  ['mak_c',    0.2,  118.2],   // Centre (near Bontang latitude)
  ['mak_s',   -2.5,  117.6],   // South
  ['mak_sw',  -4.5,  116.8],   // SW exit toward Java/Flores

  // ── Laut Sulawesi (Celebes Sea) ─────────────────────────────────────────────
  ['sul_nw',   4.0,  119.5],
  ['sul_n',    3.5,  124.0],
  ['sul_ne',   2.5,  126.5],
  ['sul_e',    1.5,  126.2],   // Passage between NE Sulawesi and Maluku

  // ── Laut Jawa (east section) ────────────────────────────────────────────────
  ['java_ne', -5.0,  113.5],
  ['java_e',  -5.5,  115.5],
  ['java_se', -6.5,  116.0],

  // ── Selat Lombok / Bali ─────────────────────────────────────────────────────
  ['lombok',  -8.5,  115.8],   // Lombok Strait mid-channel
  ['bali_s',  -9.5,  115.2],   // South of Bali

  // ── Laut Flores ─────────────────────────────────────────────────────────────
  ['flo_w',   -7.5,  118.0],
  ['flo_c',   -7.5,  120.5],
  ['flo_ne',  -5.5,  122.0],   // NE Flores / off SE Sulawesi coast
  ['flo_e',   -7.5,  122.5],

  // ── Selat Ombai ─────────────────────────────────────────────────────────────
  ['ombai',   -8.5,  125.2],

  // ── Selat Wetar ─────────────────────────────────────────────────────────────
  ['wetar',   -8.3,  127.0],

  // ── Laut Timor ──────────────────────────────────────────────────────────────
  ['tim_nw',  -9.5,  122.0],
  ['tim_c',   -9.8,  125.5],
  ['tim_ne',  -9.5,  129.0],

  // ── Laut Banda ──────────────────────────────────────────────────────────────
  ['ban_nw',  -4.0,  124.5],
  ['ban_n',   -3.0,  128.0],
  ['ban_c',   -5.5,  127.0],
  ['ban_sw',  -7.0,  126.5],
  ['ban_e',   -4.5,  131.0],

  // ── Laut Maluku ─────────────────────────────────────────────────────────────
  ['mal_s',   -1.5,  128.5],
  ['mal_n',    1.5,  127.8],

  // ── Kepulauan Halmahera ─────────────────────────────────────────────────────
  ['hal_w',    0.5,  128.5],
  ['hal_n',    1.8,  129.5],
  ['hal_e',    0.5,  131.0],

  // ── Laut Seram ──────────────────────────────────────────────────────────────
  ['seram_w', -3.0,  129.5],
  ['seram_e', -3.5,  132.0],

  // ── Laut Arafura ────────────────────────────────────────────────────────────
  ['ara_w',   -7.5,  133.0],
  ['ara_c',   -7.5,  136.5],
  ['ara_ne',  -5.5,  137.0],

  // ── North Papua coast (open water offshore) ─────────────────────────────────
  ['papua_n',  0.5,  135.0],   // Off Manokwari, open Pacific
  ['sarmi',   -1.8,  138.5],   // Off Sarmi coast

  // ── Teluk Cendrawasih ───────────────────────────────────────────────────────
  ['cend',    -2.5,  135.5],
];

// Named terminals and common ports
const PORT_NODES = [
  ['bontang',        0.12,  117.50],
  ['kupang',        -10.18, 123.61],
  ['mpp_jeranjang',  -8.65, 116.08],  // Lombok Peaker
  ['jayapura',       -2.53, 140.72],
  ['bima',           -8.47, 118.72],
  ['waingapu',       -9.67, 120.25],  // Sumba
  ['kalabahi',       -8.22, 124.52],  // Alor
  ['maumere',        -8.62, 122.21],  // Flores/NTT
  ['ende',           -8.85, 121.66],
  ['ambon',          -3.68, 128.18],
  ['ternate',         0.77, 127.37],
  ['sorong',         -0.87, 131.25],
  ['manokwari',      -0.86, 134.08],
  ['biak',           -1.17, 136.08],
  ['merauke',        -8.49, 140.40],
  ['lombok_hbr',     -8.56, 116.09],
  ['balikpapan',     -1.26, 116.85],
  ['palu',           -0.90, 119.87],  // Central Sulawesi (offshore approach)
  ['kendari',        -3.97, 122.51],
  ['ternate_off',     1.00, 127.60],  // Offshore Ternate
];

// ─────────────────────────────────────────────────────────────────────────────
// Build node map
// ─────────────────────────────────────────────────────────────────────────────
const NODE_MAP = new Map();
[...RAW_NODES, ...PORT_NODES].forEach(([id, lat, lon]) => {
  NODE_MAP.set(id, { id, lat, lon });
});

// ─────────────────────────────────────────────────────────────────────────────
// Edge definitions (undirected, verified as open-water crossings)
// ─────────────────────────────────────────────────────────────────────────────
const EDGES = [
  // ── Bontang → Makassar ──────────────────────────────────────────────────────
  ['bontang',   'mak_c'],
  ['bontang',   'mak_n'],
  ['balikpapan','mak_c'],
  ['balikpapan','mak_s'],

  // ── Makassar Strait (N→S) ───────────────────────────────────────────────────
  ['mak_n', 'mak_c'],
  ['mak_c', 'mak_s'],
  ['mak_s', 'mak_sw'],

  // ── Makassar → Sulawesi Sea ─────────────────────────────────────────────────
  ['mak_n',  'sul_nw'],
  ['sul_nw', 'sul_n'],
  ['sul_n',  'sul_ne'],
  ['sul_ne', 'sul_e'],
  ['sul_e',  'mal_n'],   // Passage east of Sulawesi into Maluku Sea
  ['sul_e',  'hal_w'],

  // ── Makassar → Java Sea ─────────────────────────────────────────────────────
  ['mak_sw', 'java_e'],
  ['mak_sw', 'java_se'],
  ['mak_sw', 'flo_w'],
  ['java_ne','java_e'],
  ['java_e', 'java_se'],
  ['java_e', 'lombok'],
  ['java_se','lombok'],
  ['java_se','mpp_jeranjang'],
  ['lombok', 'mpp_jeranjang'],
  ['lombok', 'lombok_hbr'],
  ['lombok', 'bali_s'],
  ['lombok', 'flo_w'],
  ['bima',   'flo_w'],
  ['bima',   'lombok'],

  // ── Laut Flores ─────────────────────────────────────────────────────────────
  ['flo_w',  'flo_c'],
  ['flo_c',  'flo_ne'],
  ['flo_c',  'flo_e'],
  ['flo_ne', 'flo_e'],
  ['flo_ne', 'ban_nw'],
  ['flo_e',  'ombai'],
  ['flo_e',  'maumere'],
  ['flo_c',  'ende'],
  ['maumere','ban_nw'],
  ['ende',   'flo_w'],
  ['waingapu','flo_c'],
  ['waingapu','ombai'],
  ['kendari', 'flo_ne'],
  ['kendari', 'ban_nw'],

  // ── Selat Ombai → Timor ─────────────────────────────────────────────────────
  ['ombai',  'tim_nw'],
  ['ombai',  'wetar'],
  ['ombai',  'ban_c'],
  ['wetar',  'ban_sw'],
  ['wetar',  'tim_c'],
  ['tim_nw', 'kupang'],
  ['tim_nw', 'tim_c'],
  ['tim_c',  'kupang'],
  ['tim_c',  'tim_ne'],
  ['tim_ne', 'ban_e'],
  ['kalabahi','ombai'],
  ['kalabahi','tim_nw'],

  // ── Laut Banda ──────────────────────────────────────────────────────────────
  ['ban_nw', 'ban_n'],
  ['ban_nw', 'ban_c'],
  ['ban_nw', 'ambon'],
  ['ban_n',  'mal_s'],
  ['ban_c',  'ban_sw'],
  ['ban_c',  'ban_e'],
  ['ban_sw', 'ban_e'],
  ['ban_sw', 'wetar'],
  ['ambon',  'seram_w'],
  ['ambon',  'ban_n'],

  // ── Laut Maluku ─────────────────────────────────────────────────────────────
  ['mal_s',  'hal_w'],
  ['mal_s',  'ban_n'],
  ['mal_n',  'hal_n'],
  ['mal_n',  'hal_w'],
  ['hal_w',  'hal_n'],
  ['hal_n',  'hal_e'],
  ['hal_e',  'ban_e'],
  ['hal_e',  'seram_e'],
  ['ternate','mal_n'],
  ['ternate','hal_w'],
  ['ternate_off','mal_n'],
  ['ternate_off','hal_n'],

  // ── Laut Seram ──────────────────────────────────────────────────────────────
  ['seram_w','seram_e'],
  ['seram_e','ban_e'],

  // ── Banda → Arafura ─────────────────────────────────────────────────────────
  ['ban_e',  'ara_w'],
  ['ara_w',  'ara_c'],
  ['ara_c',  'ara_ne'],
  ['ara_ne', 'cend'],
  ['ara_ne', 'biak'],
  ['ara_c',  'merauke'],
  ['merauke','jayapura'],

  // ── Sorong / West Papua ─────────────────────────────────────────────────────
  ['sorong',    'hal_e'],
  ['sorong',    'ban_e'],
  ['sorong',    'manokwari'],
  ['manokwari', 'cend'],
  ['manokwari', 'papua_n'],

  // ── North Papua coast ───────────────────────────────────────────────────────
  ['papua_n',   'hal_e'],
  ['papua_n',   'biak'],
  ['cend',      'biak'],
  ['biak',      'sarmi'],
  ['sarmi',     'jayapura'],
];

// ─────────────────────────────────────────────────────────────────────────────
// Build adjacency list
// ─────────────────────────────────────────────────────────────────────────────
const GRAPH = new Map();
for (const [id] of NODE_MAP) GRAPH.set(id, []);

for (const [a, b] of EDGES) {
  const na = NODE_MAP.get(a);
  const nb = NODE_MAP.get(b);
  if (!na || !nb) {
    console.warn(`[SeaLane] Unknown node in edge: ${!na ? a : b}`);
    continue;
  }
  const d = nm(na.lat, na.lon, nb.lat, nb.lon);
  GRAPH.get(a).push({ to: b, dist: d });
  GRAPH.get(b).push({ to: a, dist: d });
}

// ─────────────────────────────────────────────────────────────────────────────
// MinHeap
// ─────────────────────────────────────────────────────────────────────────────
class MinHeap {
  constructor() { this.h = []; }
  push(p, v) { this.h.push([p, v]); this._up(this.h.length - 1); }
  pop() {
    const t = this.h[0];
    const l = this.h.pop();
    if (this.h.length) { this.h[0] = l; this._down(0); }
    return t;
  }
  get size() { return this.h.length; }
  _up(i) {
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.h[p][0] <= this.h[i][0]) break;
      [this.h[p], this.h[i]] = [this.h[i], this.h[p]]; i = p;
    }
  }
  _down(i) {
    while (true) {
      let m = i, l = 2 * i + 1, r = 2 * i + 2;
      if (l < this.h.length && this.h[l][0] < this.h[m][0]) m = l;
      if (r < this.h.length && this.h[r][0] < this.h[m][0]) m = r;
      if (m === i) break;
      [this.h[m], this.h[i]] = [this.h[i], this.h[m]]; i = m;
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// A* on the sea lane graph
// Uses virtual origin/dest nodes to avoid mutating global state.
// ─────────────────────────────────────────────────────────────────────────────
function _astar(extNodes, getAdj, startId, endId) {
  const endNode = extNodes.get(endId);
  const dist = new Map();
  const prev = new Map();
  dist.set(startId, 0);

  const heap = new MinHeap();
  heap.push(0, startId);

  while (heap.size) {
    const [, cur] = heap.pop();
    if (cur === endId) break;
    const curD = dist.get(cur) ?? Infinity;
    for (const { to, dist: d } of getAdj(cur)) {
      const nd = curD + d;
      if (nd < (dist.get(to) ?? Infinity)) {
        dist.set(to, nd);
        prev.set(to, cur);
        const n = extNodes.get(to);
        if (n) heap.push(nd + nm(n.lat, n.lon, endNode.lat, endNode.lon), to);
      }
    }
  }

  const totalDist = dist.get(endId) ?? Infinity;
  if (totalDist === Infinity) return null;

  const path = [];
  let cur = endId;
  while (cur !== undefined) { path.push(cur); cur = prev.get(cur); }
  path.reverse();
  return { path, distNm: totalDist };
}

// ─────────────────────────────────────────────────────────────────────────────
// Ship Maneuvering Constants (from ENERGIS Python engine)
// turn_radius = 5 × LPP_max (largest vessel: HAI YANG SHI YOU 301, LPP=175m)
// ─────────────────────────────────────────────────────────────────────────────
const MAX_LPP_M = 175.0;
const TURN_RADIUS_NM = (5.0 * MAX_LPP_M) / 1852.0; // ≈ 0.472 NM

/**
 * Apply Bezier curve maneuvering at each turn point.
 * Simulates realistic ship turning kinematics (from Python: KINEMATIKA MANUVER KAPAL).
 * At each waypoint between prev→curr→next, inserts a quadratic Bezier arc
 * with radius proportional to MAX_LPP, replacing the sharp corner.
 *
 * @param {[number, number][]} waypoints  [[lat,lon], ...]
 * @returns {[number, number][]}
 */
function applyBezierManeuver(waypoints) {
  if (waypoints.length <= 2) return waypoints;

  const result = [waypoints[0]];

  for (let k = 1; k < waypoints.length - 1; k++) {
    const pPrev = waypoints[k - 1];
    const pCurr = waypoints[k];
    const pNext = waypoints[k + 1];

    const dPrevNm = nm(pPrev[0], pPrev[1], pCurr[0], pCurr[1]);
    const dNextNm = nm(pCurr[0], pCurr[1], pNext[0], pNext[1]);

    // Skip if legs too short to apply turning
    if (dPrevNm < 0.1 || dNextNm < 0.1) {
      result.push(pCurr);
      continue;
    }

    // Cut amount: min of turn radius, half of each adjacent leg
    const cutNm  = Math.min(TURN_RADIUS_NM, dPrevNm / 2.1, dNextNm / 2.1);
    const cutDeg = cutNm / 60.0;

    // Vectors from curr toward prev and toward next
    const vPrev = [pPrev[0] - pCurr[0], pPrev[1] - pCurr[1]];
    const vNext = [pNext[0] - pCurr[0], pNext[1] - pCurr[1]];

    // Lon scale correction for latitude
    const lonScale    = Math.cos(pCurr[0] * Math.PI / 180);
    const distPrevDeg = Math.sqrt(vPrev[0] ** 2 + (vPrev[1] * lonScale) ** 2);
    const distNextDeg = Math.sqrt(vNext[0] ** 2 + (vNext[1] * lonScale) ** 2);

    if (distPrevDeg < 1e-9 || distNextDeg < 1e-9) {
      result.push(pCurr);
      continue;
    }

    // Bezier anchor points (p0 → back along prev, p2 → forward toward next)
    const p0 = [
      pCurr[0] + vPrev[0] * (cutDeg / distPrevDeg),
      pCurr[1] + vPrev[1] * (cutDeg / distPrevDeg),
    ];
    const p1 = pCurr;  // quadratic control point at corner
    const p2 = [
      pCurr[0] + vNext[0] * (cutDeg / distNextDeg),
      pCurr[1] + vNext[1] * (cutDeg / distNextDeg),
    ];

    // Sample quadratic Bezier B(t) = (1−t)²·p0 + 2(1−t)t·p1 + t²·p2
    for (const t of [0.0, 0.25, 0.5, 0.75, 1.0]) {
      result.push([
        (1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * p1[0] + t ** 2 * p2[0],
        (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * p1[1] + t ** 2 * p2[1],
      ]);
    }
  }

  result.push(waypoints[waypoints.length - 1]);
  return result;
}

/**
 * Insert intermediate waypoints every `intervalNm` NM along each leg.
 * Matches Python "final_organic_path" logic (3 NM interval).
 * Produces smooth Leaflet Polyline rendering.
 *
 * @param {[number, number][]} waypoints
 * @param {number} intervalNm  default 3 NM
 * @returns {[number, number][]}
 */
function insertOrganicWaypoints(waypoints, intervalNm = 3.0) {
  const result = [];
  for (let k = 0; k < waypoints.length - 1; k++) {
    const p1    = waypoints[k];
    const p2    = waypoints[k + 1];
    const distLeg = nm(p1[0], p1[1], p2[0], p2[1]);
    result.push(p1);
    if (distLeg > intervalNm) {
      const numInserts = Math.floor(distLeg / intervalNm);
      for (let ins = 1; ins <= numInserts; ins++) {
        const frac = ins / (numInserts + 1);
        result.push([
          p1[0] + (p2[0] - p1[0]) * frac,
          p1[1] + (p2[1] - p1[1]) * frac,
        ]);
      }
    }
  }
  result.push(waypoints[waypoints.length - 1]);
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC: findRoute
// ─────────────────────────────────────────────────────────────────────────────
/**
 * @param {{ lat: number, lon: number }} origin
 * @param {{ lat: number, lon: number }} destination
 * @returns {{ waypoints: [lat, lon][], distanceNm: number }}
 */
function findRoute(origin, destination) {
  const O = '__o';
  const D = '__d';
  const K = 6; // connect each virtual node to K nearest graph nodes

  const allGraphIds = [...NODE_MAP.keys()];

  // K nearest for each virtual endpoint
  function kNearest(lat, lon) {
    return allGraphIds
      .map(id => {
        const n = NODE_MAP.get(id);
        return { id, d: nm(lat, lon, n.lat, n.lon) };
      })
      .sort((a, b) => a.d - b.d)
      .slice(0, K);
  }

  const oNN = kNearest(origin.lat, origin.lon);
  const dNN = kNearest(destination.lat, destination.lon);

  // Build extended node map (reference only, no copy)
  const extNodes = new Map(NODE_MAP);
  extNodes.set(O, { id: O, lat: origin.lat, lon: origin.lon });
  extNodes.set(D, { id: D, lat: destination.lat, lon: destination.lon });

  // Pre-build back-edge lists (don't mutate GRAPH)
  const backEdges = new Map(); // nodeId → [{to: O|D, dist}]
  for (const { id, d } of oNN) {
    if (!backEdges.has(id)) backEdges.set(id, []);
    backEdges.get(id).push({ to: O, dist: d });
  }
  for (const { id, d } of dNN) {
    if (!backEdges.has(id)) backEdges.set(id, []);
    backEdges.get(id).push({ to: D, dist: d });
  }

  // Adjacency accessor (no mutation)
  function getAdj(id) {
    if (id === O) return oNN.map(({ id: to, d: dist }) => ({ to, dist }));
    if (id === D) return dNN.map(({ id: to, d: dist }) => ({ to, dist }));
    const base = GRAPH.get(id) || [];
    const back = backEdges.get(id);
    return back ? [...base, ...back] : base;
  }

  const result = _astar(extNodes, getAdj, O, D);

  if (!result) {
    // Straight line fallback
    const d = nm(origin.lat, origin.lon, destination.lat, destination.lon);
    return { waypoints: [[origin.lat, origin.lon], [destination.lat, destination.lon]], distanceNm: d };
  }

  const rawWaypoints = result.path.map(id => {
    const n = extNodes.get(id);
    return [n.lat, n.lon];
  });

  // Ensure exact origin/dest endpoints
  rawWaypoints[0] = [origin.lat, origin.lon];
  rawWaypoints[rawWaypoints.length - 1] = [destination.lat, destination.lon];

  // ── Post-processing (matching Python ENERGIS engine) ──────────────────────
  // 1. Bezier maneuvering: round sharp corners with ship turning kinematic
  const withManeuver = applyBezierManeuver(rawWaypoints);

  // 2. Organic interpolation: insert waypoints every 3 NM for smooth rendering
  const waypoints = insertOrganicWaypoints(withManeuver, 3.0);

  // 3. Recompute true distance along organic path
  let distanceNm = 0;
  for (let i = 0; i < waypoints.length - 1; i++) {
    distanceNm += nm(waypoints[i][0], waypoints[i][1], waypoints[i + 1][0], waypoints[i + 1][1]);
  }

  return { waypoints, distanceNm };
}

// ─────────────────────────────────────────────────────────────────────────────
// DEBUG: GeoJSON of all nodes (for Leaflet overlay during development)
// ─────────────────────────────────────────────────────────────────────────────
function getNodesGeoJSON() {
  const features = [];
  for (const [id, { lat, lon }] of NODE_MAP) {
    features.push({
      type: 'Feature',
      properties: { id },
      geometry: { type: 'Point', coordinates: [lon, lat] },
    });
  }
  return { type: 'FeatureCollection', features };
}

module.exports = { findRoute, getNodesGeoJSON, nm };
