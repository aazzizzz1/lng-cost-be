/**
 * Supply Chain Data Seed
 * Seeds: 22 vessels (with Holtrop & Mennen fields),
 *        9 ORU plants (OruCapex),
 *        36 distance routes (DistanceRoute),
 *        9 locations with coordinates (Location)
 *
 * Run: node prisma/seedSupplyChain.js
 */
const prisma = require('../config/db');

// ---------------------------------------------------------------------------
// VESSEL DATABASE – ported from Python kapal_df
// All 22 vessels including full Holtrop & Mennen dimensions
// ---------------------------------------------------------------------------
const VESSELS = [
  { name: 'Shinju Maru',             capacityM3: 2500,  speedKnot: 13.0, rentPerDayUSD: 11679.28, voyageTonPerDay: 7.725,  ballastTonPerDay: 6.798,  berthTonPerDay: 1.6995, lpp: 80.3,  breadth: 15.1, draft: 4.1,  depth: 7.0,  withBulb: true,  gt: 2930,   dwt: 1150,  capexUSD: 33139077.76   },
  { name: 'WSD59 3K',                capacityM3: 3000,  speedKnot: 12.0, rentPerDayUSD: 12730.03, voyageTonPerDay: 10.4,   ballastTonPerDay: 9.152,  berthTonPerDay: 2.288,  lpp: 89.34, breadth: 16.82,draft: 4.75, depth: 8.85, withBulb: true,  gt: 3900,   dwt: 2000,  capexUSD: 36163636.12   },
  { name: 'KAGUYA',                  capacityM3: 3539,  speedKnot: 10.0, rentPerDayUSD: 13862.75, voyageTonPerDay: 11.215, ballastTonPerDay: 9.870,  berthTonPerDay: 2.467,  lpp: 76.2,  breadth: 18.0, draft: 4.0,  depth: 7.8,  withBulb: true,  gt: 4044,   dwt: 2431,  capexUSD: 39424110.03   },
  { name: 'CGAS PANTHER',            capacityM3: 3741,  speedKnot: 13.5, rentPerDayUSD: 14286.83, voyageTonPerDay: 11.383, ballastTonPerDay: 10.017, berthTonPerDay: 2.504,  lpp: 92.5,  breadth: 17.4, draft: 7.06, depth: 11.7, withBulb: true,  gt: 5036,   dwt: 4994,  capexUSD: 40644821.79   },
  { name: 'WSD59 5K',                capacityM3: 5000,  speedKnot: 14.0, rentPerDayUSD: 16933.05, voyageTonPerDay: 16.5,   ballastTonPerDay: 14.52,  berthTonPerDay: 3.63,   lpp: 95.55, breadth: 17.79,draft: 5.7,  depth: 9.6,  withBulb: true,  gt: 5381.5, dwt: 3000,  capexUSD: 48261869.56   },
  { name: 'CGAS MATE',               capacityM3: 5700,  speedKnot: 13.5, rentPerDayUSD: 18404.11, voyageTonPerDay: 13.011, ballastTonPerDay: 11.450, berthTonPerDay: 2.862,  lpp: 81.97, breadth: 15.0, draft: 7.8,  depth: 7.8,  withBulb: true,  gt: 3811,   dwt: 3811,  capexUSD: 52496251.26   },
  { name: 'WSD59 6.5K',              capacityM3: 6500,  speedKnot: 13.0, rentPerDayUSD: 20085.31, voyageTonPerDay: 13.6,   ballastTonPerDay: 11.968, berthTonPerDay: 2.992,  lpp: 100.21,breadth: 18.51,draft: 5.8,  depth: 10.16,withBulb: true,  gt: 6795.5, dwt: 4200,  capexUSD: 57335544.64   },
  { name: 'Coral Methane',           capacityM3: 7500,  speedKnot: 14.0, rentPerDayUSD: 22186.82, voyageTonPerDay: 20.52,  ballastTonPerDay: 18.058, berthTonPerDay: 4.514,  lpp: 111.2, breadth: 18.6, draft: 7.15, depth: 10.6, withBulb: true,  gt: 7833,   dwt: 3450,  capexUSD: 63384661.36   },
  { name: 'HONG PENG',               capacityM3: 9534,  speedKnot: 14.0, rentPerDayUSD: 26461.29, voyageTonPerDay: 16.196, ballastTonPerDay: 14.253, berthTonPerDay: 3.563,  lpp: 117.0, breadth: 19.8, draft: 6.9,  depth: 11.3, withBulb: true,  gt: 9823,   dwt: 7534,  capexUSD: 75688564.77   },
  { name: 'Norgas',                  capacityM3: 10000, speedKnot: 14.0, rentPerDayUSD: 27440.59, voyageTonPerDay: 26.57,  ballastTonPerDay: 23.382, berthTonPerDay: 5.845,  lpp: 111.08,breadth: 20.2, draft: 7.1,  depth: 11.47,withBulb: true,  gt: 9691,   dwt: 4600,  capexUSD: 78507453.16   },
  { name: 'CORAL ENERGICE',          capacityM3: 11840, speedKnot: 16.0, rentPerDayUSD: 31306.78, voyageTonPerDay: 18.112, ballastTonPerDay: 15.938, berthTonPerDay: 3.985,  lpp: 156.0, breadth: 24.5, draft: 7.6,  depth: 15.05,withBulb: true,  gt: 16100,  dwt: 11930, capexUSD: 89518941.98   },
  { name: 'WSD55 12K',               capacityM3: 12000, speedKnot: 14.5, rentPerDayUSD: 31642.96, voyageTonPerDay: 18.7,   ballastTonPerDay: 16.456, berthTonPerDay: 4.114,  lpp: 117.29,breadth: 21.17,draft: 6.2,  depth: 12.22,withBulb: true,  gt: 12300,  dwt: 9900,  capexUSD: 90476462.75   },
  { name: 'HUAIHE NENGYUAN QIHANG',  capacityM3: 13850, speedKnot: 13.2, rentPerDayUSD: 35530.16, voyageTonPerDay: 19.782, ballastTonPerDay: 17.408, berthTonPerDay: 4.352,  lpp: 126.0, breadth: 23.6, draft: 5.6,  depth: 15.0, withBulb: true,  gt: 13514,  dwt: 8877,  capexUSD: 101547796.61  },
  { name: 'XIN AO PU TUO HAO',       capacityM3: 14944, speedKnot: 13.5, rentPerDayUSD: 37828.86, voyageTonPerDay: 20.691, ballastTonPerDay: 18.208, berthTonPerDay: 4.552,  lpp: 116.1, breadth: 19.8, draft: 5.9,  depth: 11.0, withBulb: false, gt: 9432,   dwt: 6252,  capexUSD: 108094844.86  },
  { name: 'Coral Energy',            capacityM3: 15600, speedKnot: 15.0, rentPerDayUSD: 39207.24, voyageTonPerDay: 43.39,  ballastTonPerDay: 38.183, berthTonPerDay: 9.546,  lpp: 146.21,breadth: 22.7, draft: 8.0,  depth: 14.95,withBulb: true,  gt: 14139.1,dwt: 7176,  capexUSD: 112020680.0   },
  { name: 'AMAN SENDAI',             capacityM3: 18928, speedKnot: 15.6, rentPerDayUSD: 41726.19, voyageTonPerDay: 24.000, ballastTonPerDay: 21.120, berthTonPerDay: 5.280,  lpp: 124.0, breadth: 25.7, draft: 6.7,  depth: 13.1, withBulb: true,  gt: 16336,  dwt: 9999,  capexUSD: 131937111.97  },
  { name: 'SUN ARROWS',              capacityM3: 19531, speedKnot: 19.2, rentPerDayUSD: 42182.60, voyageTonPerDay: 24.501, ballastTonPerDay: 21.561, berthTonPerDay: 5.390,  lpp: 140.0, breadth: 28.0, draft: 7.6,  depth: 16.0, withBulb: true,  gt: 20620,  dwt: 11142, capexUSD: 135545768.36  },
  { name: 'WSD50 20K',               capacityM3: 20000, speedKnot: 15.0, rentPerDayUSD: 42537.58, voyageTonPerDay: 25.1,   ballastTonPerDay: 22.088, berthTonPerDay: 5.522,  lpp: 142.14,breadth: 25.03,draft: 7.8,  depth: 15.22,withBulb: true,  gt: 17270,  dwt: 12500, capexUSD: 138440245.7   },
  { name: 'Surya Satsuma',           capacityM3: 23000, speedKnot: 15.0, rentPerDayUSD: 44808.27, voyageTonPerDay: 62.76,  ballastTonPerDay: 55.229, berthTonPerDay: 13.807, lpp: 143.5, breadth: 28.0, draft: 8.0,  depth: 16.0, withBulb: true,  gt: 20017,  dwt: 10580, capexUSD: 156306015.5   },
  { name: 'CNTIC VPOWER GLOBAL',     capacityM3: 28550, speedKnot: 16.0, rentPerDayUSD: 64357.01, voyageTonPerDay: 31.994, ballastTonPerDay: 28.155, berthTonPerDay: 7.039,  lpp: 166.0, breadth: 27.6, draft: 7.8,  depth: 18.5, withBulb: true,  gt: 23516,  dwt: 15995, capexUSD: 189520017.06  },
  { name: 'WSD50 30K',               capacityM3: 30000, speedKnot: 16.0, rentPerDayUSD: 69464.34, voyageTonPerDay: 34.8,   ballastTonPerDay: 30.624, berthTonPerDay: 7.656,  lpp: 173.2, breadth: 29.86,draft: 8.0,  depth: 18.96,withBulb: true,  gt: 23482.5,dwt: 15000, capexUSD: 198197549.0   },
  { name: 'HAI YANG SHI YOU 301',    capacityM3: 31043, speedKnot: 16.5, rentPerDayUSD: 73138.09, voyageTonPerDay: 34.065, ballastTonPerDay: 29.977, berthTonPerDay: 7.494,  lpp: 175.0, breadth: 28.1, draft: 7.4,  depth: 18.7, withBulb: true,  gt: 25883,  dwt: 15496, capexUSD: 204439387.49  },
];

// ---------------------------------------------------------------------------
// ORU CAPEX – semua entri adalah data referensi (nearest-neighbor AACE Six-Tenths)
// capex_term_base = 3678949.0 — Baseline harga ORF/Terminal (Badak NGL Bontang)
// digunakan sebagai referensi inflasi CAPEX terminal di semua scenario
const ORU_PLANTS = [
  { plantName: 'MPP Jeranjang (Lombok Peaker)', fixCapexUSD: 6956193.76957883,  province: 'Nusa Tenggara Barat', capacityValue: 3.6,   unit: 'BBTUD',  year: 2022 },
  { plantName: 'PLTMG Kupang',                  fixCapexUSD: 7013640.21469643,  province: 'Nusa Tenggara Timur', capacityValue: 2.9,   unit: 'BBTUD',  year: 2022 },
  { plantName: 'PLTMG Rangko (Flores)',          fixCapexUSD: 7185979.55004923,  province: 'Nusa Tenggara Timur', capacityValue: 1.65,  unit: 'BBTUD',  year: 2022 },
  { plantName: 'PLTMG Sumbawa',                  fixCapexUSD: 6994491.39965723,  province: 'Nusa Tenggara Barat', capacityValue: 6.13,  unit: 'BBTUD',  year: 2022 },
  { plantName: 'PLTMG Bima',                     fixCapexUSD: 7071086.65981403,  province: 'Nusa Tenggara Barat', capacityValue: 6.13,  unit: 'BBTUD',  year: 2022 },
  { plantName: 'PLTMG Maumere',                  fixCapexUSD: 7043320.87800719,  province: 'Nusa Tenggara Timur', capacityValue: 2.9,   unit: 'BBTUD',  year: 2022 },
  { plantName: 'PLTMG Alor',                     fixCapexUSD: 6851832.72761519,  province: 'Nusa Tenggara Timur', capacityValue: 1.3,   unit: 'BBTUD',  year: 2022 },
  { plantName: 'PLTMG Waingapu',                 fixCapexUSD: 7043320.87800719,  province: 'Nusa Tenggara Timur', capacityValue: 1.3,   unit: 'BBTUD',  year: 2022 },
  { plantName: 'Badak NGL Bontang',              fixCapexUSD: 3678948.68139263,  province: 'Kalimantan Timur',    capacityValue: null,  unit: null,     year: 2022 },
  { plantName: 'ORU Papua Low (2024)',           fixCapexUSD: 23582442.21,       province: 'Papua',               capacityValue: 4.89,  unit: 'MMSCFD', year: 2024 },
  { plantName: 'ORU Papua High (2024)',          fixCapexUSD: 26430984.51,       province: 'Papua',               capacityValue: 16.39, unit: 'MMSCFD', year: 2024 },
];

// ---------------------------------------------------------------------------
// DISTANCE ROUTES (Python jarak_df) – 36 unique bi-directional pairs
// Note: seeded as one-way; engine uses "Origin - Destination" key
// ---------------------------------------------------------------------------
const ROUTES = [
  { origin: 'MPP Jeranjang (Lombok Peaker)', destination: 'PLTMG Kupang',         nauticalMiles: 514 },
  { origin: 'MPP Jeranjang (Lombok Peaker)', destination: 'PLTMG Rangko (Flores)', nauticalMiles: 269 },
  { origin: 'MPP Jeranjang (Lombok Peaker)', destination: 'PLTMG Sumbawa',         nauticalMiles: 122 },
  { origin: 'MPP Jeranjang (Lombok Peaker)', destination: 'PLTMG Bima',            nauticalMiles: 202 },
  { origin: 'MPP Jeranjang (Lombok Peaker)', destination: 'PLTMG Maumere',         nauticalMiles: 414 },
  { origin: 'MPP Jeranjang (Lombok Peaker)', destination: 'PLTMG Alor',            nauticalMiles: 545 },
  { origin: 'MPP Jeranjang (Lombok Peaker)', destination: 'PLTMG Waingapu',        nauticalMiles: 302 },
  { origin: 'MPP Jeranjang (Lombok Peaker)', destination: 'Badak NGL Bontang',     nauticalMiles: 542 },
  { origin: 'PLTMG Kupang',                  destination: 'PLTMG Rangko (Flores)', nauticalMiles: 537 },
  { origin: 'PLTMG Kupang',                  destination: 'PLTMG Sumbawa',         nauticalMiles: 522 },
  { origin: 'PLTMG Kupang',                  destination: 'PLTMG Bima',            nauticalMiles: 590 },
  { origin: 'PLTMG Kupang',                  destination: 'PLTMG Maumere',         nauticalMiles: 400 },
  { origin: 'PLTMG Kupang',                  destination: 'PLTMG Alor',            nauticalMiles: 150 },
  { origin: 'PLTMG Kupang',                  destination: 'PLTMG Waingapu',        nauticalMiles: 219 },
  { origin: 'PLTMG Kupang',                  destination: 'Badak NGL Bontang',     nauticalMiles: 942 },
  { origin: 'PLTMG Rangko (Flores)',          destination: 'PLTMG Sumbawa',         nauticalMiles: 177 },
  { origin: 'PLTMG Rangko (Flores)',          destination: 'PLTMG Bima',            nauticalMiles: 86  },
  { origin: 'PLTMG Rangko (Flores)',          destination: 'PLTMG Maumere',         nauticalMiles: 183 },
  { origin: 'PLTMG Rangko (Flores)',          destination: 'PLTMG Alor',            nauticalMiles: 313 },
  { origin: 'PLTMG Rangko (Flores)',          destination: 'PLTMG Waingapu',        nauticalMiles: 461 },
  { origin: 'PLTMG Rangko (Flores)',          destination: 'Badak NGL Bontang',     nauticalMiles: 542 },
  { origin: 'PLTMG Sumbawa',                  destination: 'PLTMG Bima',            nauticalMiles: 110 },
  { origin: 'PLTMG Sumbawa',                  destination: 'PLTMG Maumere',         nauticalMiles: 322 },
  { origin: 'PLTMG Sumbawa',                  destination: 'PLTMG Alor',            nauticalMiles: 453 },
  { origin: 'PLTMG Sumbawa',                  destination: 'PLTMG Waingapu',        nauticalMiles: 309 },
  { origin: 'PLTMG Sumbawa',                  destination: 'Badak NGL Bontang',     nauticalMiles: 526 },
  { origin: 'PLTMG Bima',                     destination: 'PLTMG Maumere',         nauticalMiles: 236 },
  { origin: 'PLTMG Bima',                     destination: 'PLTMG Alor',            nauticalMiles: 367 },
  { origin: 'PLTMG Bima',                     destination: 'PLTMG Waingapu',        nauticalMiles: 394 },
  { origin: 'PLTMG Bima',                     destination: 'Badak NGL Bontang',     nauticalMiles: 522 },
  { origin: 'PLTMG Maumere',                  destination: 'PLTMG Alor',            nauticalMiles: 176 },
  { origin: 'PLTMG Maumere',                  destination: 'PLTMG Waingapu',        nauticalMiles: 534 },
  { origin: 'PLTMG Maumere',                  destination: 'Badak NGL Bontang',     nauticalMiles: 619 },
  { origin: 'PLTMG Alor',                     destination: 'PLTMG Waingapu',        nauticalMiles: 274 },
  { origin: 'PLTMG Alor',                     destination: 'Badak NGL Bontang',     nauticalMiles: 729 },
  { origin: 'PLTMG Waingapu',                 destination: 'Badak NGL Bontang',     nauticalMiles: 780 },
];

// ---------------------------------------------------------------------------
// LOCATION COORDINATES
// Based on actual geographic positions of each plant/terminal
// ---------------------------------------------------------------------------
const LOCATIONS = [
  { name: 'Badak NGL Bontang',              type: 'terminal', latitude: 0.096989,   longitude: 117.477606, province: 'Kalimantan Timur',   year: 2022 },
  { name: 'MPP Jeranjang (Lombok Peaker)',  type: 'plant',    latitude: -8.659828,  longitude: 116.073925, province: 'Nusa Tenggara Barat', year: 2022 },
  { name: 'PLTMG Kupang',                   type: 'plant',    latitude: -10.353614, longitude: 123.458081, province: 'Nusa Tenggara Timur', year: 2022 },
  { name: 'PLTMG Rangko (Flores)',           type: 'plant',    latitude: -8.460847,  longitude: 119.944175, province: 'Nusa Tenggara Timur', year: 2022 },
  { name: 'PLTMG Sumbawa',                   type: 'plant',    latitude: -8.447617,  longitude: 117.336522, province: 'Nusa Tenggara Barat', year: 2022 },
  { name: 'PLTMG Bima',                      type: 'plant',    latitude: -8.408975,  longitude: 118.699328, province: 'Nusa Tenggara Barat', year: 2022 },
  { name: 'PLTMG Maumere',                   type: 'plant',    latitude: -8.619886,  longitude: 122.339192, province: 'Nusa Tenggara Timur', year: 2022 },
  { name: 'PLTMG Alor',                      type: 'plant',    latitude: -8.242778,  longitude: 124.529975, province: 'Nusa Tenggara Timur', year: 2022 },
  { name: 'PLTMG Waingapu',                  type: 'plant',    latitude: -9.476673,  longitude: 120.153197, province: 'Nusa Tenggara Timur', year: 2022 },
  // Referensi Papua 2024
  { name: 'ORU Papua Low (2024)',   type: 'plant', latitude: -4.0,     longitude: 136.0,    province: 'Papua',               year: 2024 },
  { name: 'ORU Papua High (2024)',  type: 'plant', latitude: -4.0,     longitude: 136.0,    province: 'Papua',               year: 2024 },
];

async function main() {
  console.log('Seeding supply chain data...');

  // ── Vessels ──────────────────────────────────────────────────────────────
  let vesselCount = 0;
  for (const v of VESSELS) {
    await prisma.vessel.upsert({
      where: { name: v.name },
      update: {
        capacityM3:       v.capacityM3,
        speedKnot:        v.speedKnot,
        rentPerDayUSD:    v.rentPerDayUSD,
        voyageTonPerDay:  v.voyageTonPerDay,
        ballastTonPerDay: v.ballastTonPerDay,
        berthTonPerDay:   v.berthTonPerDay,
        portCostLTP:      0,
        portCostDelay:    0,
        portCostPerLocation: 0,
        lpp:      v.lpp,
        breadth:  v.breadth,
        draft:    v.draft,
        depth:    v.depth,
        withBulb: v.withBulb,
        gt:       v.gt,
        dwt:      v.dwt,
        capexUSD: v.capexUSD,
      },
      create: {
        ...v,
        portCostLTP: 0,
        portCostDelay: 0,
        portCostPerLocation: 0,
      },
    });
    vesselCount++;
  }
  console.log(`✅ ${vesselCount} vessels upserted`);

  // ── ORU Capex ──────────────────────────────────────────────────────────────
  let oruCount = 0;
  for (const o of ORU_PLANTS) {
    await prisma.oruCapex.upsert({
      where: { plantName: o.plantName },
      update: {
        fixCapexUSD:    o.fixCapexUSD,
        province:       o.province,
        capacityValue:  o.capacityValue,
        unit:           o.unit,
        year:           o.year,
      },
      create: o,
    });
    oruCount++;
  }
  console.log(`✅ ${oruCount} ORU records upserted`);

  // ── Distance Routes ────────────────────────────────────────────────────────
  let routeCount = 0;
  for (const r of ROUTES) {
    // Seed both directions for the engine's lookup
    for (const [orig, dest] of [[r.origin, r.destination], [r.destination, r.origin]]) {
      await prisma.distanceRoute.upsert({
        where: { origin_destination: { origin: orig, destination: dest } },
        update: { nauticalMiles: r.nauticalMiles },
        create: { origin: orig, destination: dest, nauticalMiles: r.nauticalMiles },
      });
    }
    routeCount++;
  }
  console.log(`✅ ${routeCount} routes upserted (${routeCount * 2} directional entries)`);

  // ── Locations ──────────────────────────────────────────────────────────────
  let locCount = 0;
  for (const l of LOCATIONS) {
    await prisma.location.upsert({
      where: { name: l.name },
      update: {
        type:      l.type,
        latitude:  l.latitude,
        longitude: l.longitude,
        province:  l.province,
        year:      l.year,
      },
      create: l,
    });
    locCount++;
  }
  console.log(`✅ ${locCount} locations upserted`);

  console.log('\n✅ Supply chain seed complete.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
