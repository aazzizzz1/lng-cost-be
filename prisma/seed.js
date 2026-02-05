const prisma = require("../config/db");
const bcrypt = require("bcrypt");

async function main() {
  // const hashedAdmin = await bcrypt.hash("admin123", 10);
  // const hashedUser1 = await bcrypt.hash("user123", 10);
  // const hashedUser2 = await bcrypt.hash("user456", 10);
  // const hashedEngineer = await bcrypt.hash("engineer123", 10); // NEW

  // // Admin seed
  // await prisma.user.upsert({
  //   where: { email: "admin@admin.com" },
  //   update: {},
  //   create: {
  //     username: "admin",
  //     email: "admin@admin.com",
  //     password: hashedAdmin,
  //     role: "admin",
  //   },
  // });

  // // User 1 seed
  // await prisma.user.upsert({
  //   where: { email: "user1@example.com" },
  //   update: {},
  //   create: {
  //     username: "user1",
  //     email: "user1@example.com",
  //     password: hashedUser1,
  //     role: "user",
  //   },
  // });

  // // User 2 seed
  // await prisma.user.upsert({
  //   where: { email: "user2@example.com" },
  //   update: {},
  //   create: {
  //     username: "user2",
  //     email: "user2@example.com",
  //     password: hashedUser2,
  //     role: "user",
  //   },
  // });

  // // NEW: Engineer seed
  // await prisma.user.upsert({
  //   where: { email: "engineer1@example.com" },
  //   update: {},
  //   create: {
  //     username: "engineer1",
  //     email: "engineer1@example.com",
  //     password: hashedEngineer,
  //     role: "engineer",
  //   },
  // });

  // console.log("✅ Admin & Users seeded");

  // await prisma.project.createMany({
  //   data: [
  //     {
  //       id: 100,
  //       name: "FSRU Lampung",
  //       infrastruktur: "FSRU", // was: jenis
  //       kategori: "Big Scale FSRU > 150.000 m³",
  //       lokasi: "Jawa Timur",
  //       tahun: 2023,
  //       levelAACE: 2,
  //       harga: 5000000000,
  //       satuan: "m³ / MMSCFD",
  //       inflasi: 0, // NEW
  //     },
  //     {
  //       id: 101,
  //       name: "Small LNG Plant Bau Bau",
  //       infrastruktur: "LNG Plant", // was: jenis
  //       kategori: "Small-Scale Liquefaction Plant (100 - 800 TPD)",
  //       lokasi: "Sulawesi",
  //       tahun: 2020,
  //       levelAACE: 5,
  //       harga: 3000000000,
  //       satuan: "MTPA",
  //       inflasi: 0, // NEW
  //     },
  //     {
  //       id: 102,
  //       name: "LNGC Papua",
  //       infrastruktur: "LNGC", // was: jenis
  //       kategori: "Big Scale LNGC > 100.000 m³",
  //       lokasi: "Kepulauan Riau",
  //       tahun: 2023,
  //       levelAACE: 2,
  //       harga: 7000000000,
  //       satuan: "m³",
  //       inflasi: 0, // NEW
  //     },
  //   ],
  //   skipDuplicates: true,
  // });

  // await prisma.unitPrice.create({
  //   data: {
  //     workcode: "PM-001",
  //     uraian: "Project Management LNGC",
  //     specification: "Manajemen proyek LNGC Papua",
  //     qty: 1,
  //     satuan: "Ls",
  //     hargaSatuan: 3500000000,
  //     totalHarga: 3500000000,
  //     aaceClass: 2,
  //     accuracyLow: -15,
  //     accuracyHigh: 20,
  //     tahun: 2023,
  //     infrastruktur: "Big Scale LNGC > 100.000 m³",
  //     volume: 125000,
  //     satuanVolume: "m³",
  //     kelompok: "PROJECT MANAGEMENT DAN PEKERJAAN PERSIAPAN",
  //     kelompokDetail: "",
  //     proyek: "LNGC Papua",
  //     lokasi: "Kepulauan Riau",
  //     tipe: "LNGC",
  //   },
  // });

  // await prisma.constructionCost.create({
  //   data: {
  //     workcode: "PM-002",
  //     uraian: "Project Management",
  //     specification: "Project Management untuk FSRU Lampung",
  //     qty: 1,
  //     satuan: "Ls",
  //     hargaSatuan: 1154296598,
  //     totalHarga: 1154296598,
  //     aaceClass: 2,
  //     accuracyLow: -15,
  //     accuracyHigh: 20,
  //     tahun: 2023,
  //     infrastruktur: "Big Scale FSRU",
  //     volume: 200000,
  //     satuanVolume: "m³",
  //     kelompok: "PROJECT MANAGEMENT DAN PEKERJAAN PERSIAPAN",
  //     kelompokDetail: "",
  //     lokasi: "Jawa Timur",
  //     tipe: "FSRU",
  //     projectId: 100,
  //   },
  // });

  // console.log("✅ Projects, Unit Prices, and Construction Costs seeded");

  // const cciData = [
  //   { kodeProvinsi: 11, provinsi: "Aceh", cci: 96.61 },
  //   { kodeProvinsi: 12, provinsi: "Sumatera Utara", cci: 97.45 },
  //   { kodeProvinsi: 13, provinsi: "Sumatera Barat", cci: 93.06 },
  //   { kodeProvinsi: 14, provinsi: "Riau", cci: 96.1 },
  //   { kodeProvinsi: 15, provinsi: "Jambi", cci: 95.32 },
  //   { kodeProvinsi: 16, provinsi: "Sumatera Selatan", cci: 90.62 },
  //   { kodeProvinsi: 17, provinsi: "Bengkulu", cci: 94.2 },
  //   { kodeProvinsi: 18, provinsi: "Lampung", cci: 89.12 },
  //   { kodeProvinsi: 19, provinsi: "Kepulauan Bangka Belitung", cci: 105.37 },
  //   { kodeProvinsi: 21, provinsi: "Kepulauan Riau", cci: 111.94 },
  //   { kodeProvinsi: 31, provinsi: "Dki Jakarta", cci: 114.79 },
  //   { kodeProvinsi: 32, provinsi: "Jawa Barat", cci: 105.3 },
  //   { kodeProvinsi: 33, provinsi: "Jawa Tengah", cci: 102.08 },
  //   { kodeProvinsi: 34, provinsi: "Di Yogyakarta", cci: 104.88 },
  //   { kodeProvinsi: 35, provinsi: "Jawa Timur", cci: 96.29 },
  //   { kodeProvinsi: 36, provinsi: "Banten", cci: 94.18 },
  //   { kodeProvinsi: 51, provinsi: "Bali", cci: 107.46 },
  //   { kodeProvinsi: 52, provinsi: "Nusa Tenggara Barat", cci: 104.09 },
  //   { kodeProvinsi: 53, provinsi: "Nusa Tenggara Timur", cci: 92.42 },
  //   { kodeProvinsi: 61, provinsi: "Kalimantan Barat", cci: 107.34 },
  //   { kodeProvinsi: 62, provinsi: "Kalimantan Tengah", cci: 106.56 },
  //   { kodeProvinsi: 63, provinsi: "Kalimantan Selatan", cci: 100.7 },
  //   { kodeProvinsi: 64, provinsi: "Kalimantan Timur", cci: 118.3 },
  //   { kodeProvinsi: 65, provinsi: "Kalimantan Utara", cci: 107.52 },
  //   { kodeProvinsi: 71, provinsi: "Sulawesi Utara", cci: 100.77 },
  //   { kodeProvinsi: 72, provinsi: "Sulawesi Tengah", cci: 91.82 },
  //   { kodeProvinsi: 73, provinsi: "Sulawesi Selatan", cci: 95.91 },
  //   { kodeProvinsi: 74, provinsi: "Sulawesi Tenggara", cci: 94.71 },
  //   { kodeProvinsi: 75, provinsi: "Gorontalo", cci: 96.51 },
  //   { kodeProvinsi: 76, provinsi: "Sulawesi Barat", cci: 91.63 },
  //   { kodeProvinsi: 81, provinsi: "Maluku", cci: 106.52 },
  //   { kodeProvinsi: 82, provinsi: "Maluku Utara", cci: 114.09 },
  //   { kodeProvinsi: 91, provinsi: "Papua Barat", cci: 124.71 },
  //   { kodeProvinsi: 92, provinsi: "Papua Barat Daya", cci: 122.21 },
  //   { kodeProvinsi: 94, provinsi: "Papua", cci: 134.96 },
  //   { kodeProvinsi: 95, provinsi: "Papua Selatan", cci: 142.98 },
  //   { kodeProvinsi: 96, provinsi: "Papua Tengah", cci: 209.28 },
  //   { kodeProvinsi: 97, provinsi: "Papua Pegunungan", cci: 249.12 },
  // ];

  // for (const cci of cciData) {
  //   await prisma.cci.create({ data: cci });
  // }

  // console.log("✅ CCI data seeded");
  // // Ensure one default MooringRuleSetting exists
  // const countMooring = await prisma.mooringRuleSetting.count();
  // if (countMooring === 0) {
  //   await prisma.mooringRuleSetting.create({
  //     data: {
  //       jettyMaxDepth: 25,
  //       jettyMaxDistanceKm: 2,
  //       cbmMinDepth: 15,
  //       cbmMaxDepth: 70,
  //       cbmExposurePolicy: 'SHELTERED_SEMI',
  //       spreadMaxDepth: 1000,
  //       towerYokeMaxDepth: 35,
  //       turretForPermanent: true,
  //       calmForVisiting: true,
  //     },
  //   });
  //   console.log('✅ Default MooringRuleSetting seeded');
  // }

  // // NEW: seed Supply Chain base datasets
  // const vesselCount = await prisma.vessel.count();
  // if (vesselCount === 0) {
  //   await prisma.vessel.createMany({
  //     data: [
  //       { name: "Shinju Maru", capacityM3: 2500, speedKnot: 13, rentPerDayUSD: 11679.28, voyageTonPerDay: 7.7, ballastTonPerDay: 6.776, berthTonPerDay: 1.694, portCostLTP: 60.07, portCostDelay: 533.58, portCostPerLocation: 593.65 },
  //       { name: "WSD59 3K", capacityM3: 3000, speedKnot: 12, rentPerDayUSD: 12730.03, voyageTonPerDay: 10.4, ballastTonPerDay: 9.152, berthTonPerDay: 2.288, portCostLTP: 76.52, portCostDelay: 751.35, portCostPerLocation: 827.87 },
  //       { name: "WSD59 5K", capacityM3: 5000, speedKnot: 14, rentPerDayUSD: 16933.05, voyageTonPerDay: 16.5, ballastTonPerDay: 14.52, berthTonPerDay: 3.63, portCostLTP: 101.64, portCostDelay: 765.08, portCostPerLocation: 866.72 },
  //       { name: "WSD59 6.5K", capacityM3: 6500, speedKnot: 13, rentPerDayUSD: 20085.31, voyageTonPerDay: 13.6, ballastTonPerDay: 11.968, berthTonPerDay: 2.992, portCostLTP: 125.62, portCostDelay: 778.19, portCostPerLocation: 903.81 },
  //       { name: "Coral Methane", capacityM3: 7500, speedKnot: 14, rentPerDayUSD: 22186.82, voyageTonPerDay: 20.5, ballastTonPerDay: 18.04, berthTonPerDay: 4.51, portCostLTP: 143.21, portCostDelay: 787.81, portCostPerLocation: 931.02 },
  //       { name: "Norgas", capacityM3: 10000, speedKnot: 14, rentPerDayUSD: 27440.59, voyageTonPerDay: 26.6, ballastTonPerDay: 23.408, berthTonPerDay: 5.852, portCostLTP: 174.71, portCostDelay: 1294.2, portCostPerLocation: 1468.91 },
  //       { name: "WSD55 12K", capacityM3: 12000, speedKnot: 14.5, rentPerDayUSD: 31642.96, voyageTonPerDay: 18.7, ballastTonPerDay: 16.456, berthTonPerDay: 4.114, portCostLTP: 218.95, portCostDelay: 1318.38, portCostPerLocation: 1537.33 },
  //       { name: "Coral Energy", capacityM3: 15600, speedKnot: 15, rentPerDayUSD: 39207.24, voyageTonPerDay: 43.4, ballastTonPerDay: 38.192, berthTonPerDay: 9.548, portCostLTP: 250.14, portCostDelay: 2782.49, portCostPerLocation: 3032.63 },
  //       { name: "WSD50 20K", capacityM3: 20000, speedKnot: 15, rentPerDayUSD: 42537.58, voyageTonPerDay: 25.1, ballastTonPerDay: 22.088, berthTonPerDay: 5.522, portCostLTP: 303.22, portCostDelay: 2811.52, portCostPerLocation: 3114.74 },
  //       { name: "Surya Satsuma", capacityM3: 23000, speedKnot: 15, rentPerDayUSD: 44808.27, voyageTonPerDay: 62.8, ballastTonPerDay: 55.264, berthTonPerDay: 13.816, portCostLTP: 349.8, portCostDelay: 2836.98, portCostPerLocation: 3186.78 },
  //       { name: "WSD50 30K", capacityM3: 30000, speedKnot: 16, rentPerDayUSD: 69464.34, voyageTonPerDay: 34.8, ballastTonPerDay: 30.624, berthTonPerDay: 7.656, portCostLTP: 408.56, portCostDelay: 2869.11, portCostPerLocation: 3277.67 },
  //     ],
  //     skipDuplicates: true,
  //   });
  //   console.log('✅ Vessels seeded');
  // }

  // const distCount = await prisma.distanceRoute.count();
  // if (distCount === 0) {
  //   const routes = [
  //     ["MPP Jeranjang (Lombok Peaker)","PLTMG Kupang",514],["MPP Jeranjang (Lombok Peaker)","PLTMG Rangko (Flores)",269],
  //     ["MPP Jeranjang (Lombok Peaker)","PLTMG Sumbawa",122],["MPP Jeranjang (Lombok Peaker)","PLTMG Bima",202],
  //     ["MPP Jeranjang (Lombok Peaker)","PLTMG Maumere",414],["MPP Jeranjang (Lombok Peaker)","PLTMG Alor",545],
  //     ["MPP Jeranjang (Lombok Peaker)","PLTMG Waingapu",302],["MPP Jeranjang (Lombok Peaker)","Badak NGL Bontang",542],
  //     ["PLTMG Kupang","MPP Jeranjang (Lombok Peaker)",514],["PLTMG Kupang","PLTMG Rangko (Flores)",537],
  //     ["PLTMG Kupang","PLTMG Sumbawa",522],["PLTMG Kupang","PLTMG Bima",590],["PLTMG Kupang","PLTMG Maumere",400],
  //     ["PLTMG Kupang","PLTMG Alor",150],["PLTMG Kupang","PLTMG Waingapu",219],["PLTMG Kupang","Badak NGL Bontang",942],
  //     ["PLTMG Rangko (Flores)","MPP Jeranjang (Lombok Peaker)",269],["PLTMG Rangko (Flores)","PLTMG Kupang",537],
  //     ["PLTMG Rangko (Flores)","PLTMG Sumbawa",177],["PLTMG Rangko (Flores)","PLTMG Bima",86],["PLTMG Rangko (Flores)","PLTMG Maumere",183],
  //     ["PLTMG Rangko (Flores)","PLTMG Alor",313],["PLTMG Rangko (Flores)","PLTMG Waingapu",461],["PLTMG Rangko (Flores)","Badak NGL Bontang",542],
  //     ["PLTMG Sumbawa","MPP Jeranjang (Lombok Peaker)",122],["PLTMG Sumbawa","PLTMG Kupang",522],["PLTMG Sumbawa","PLTMG Rangko (Flores)",177],
  //     ["PLTMG Sumbawa","PLTMG Bima",110],["PLTMG Sumbawa","PLTMG Maumere",322],["PLTMG Sumbawa","PLTMG Alor",453],
  //     ["PLTMG Sumbawa","PLTMG Waingapu",309],["PLTMG Sumbawa","Badak NGL Bontang",526],
  //     ["PLTMG Bima","MPP Jeranjang (Lombok Peaker)",202],["PLTMG Bima","PLTMG Kupang",590],["PLTMG Bima","PLTMG Rangko (Flores)",86],
  //     ["PLTMG Bima","PLTMG Sumbawa",110],["PLTMG Bima","PLTMG Maumere",236],["PLTMG Bima","PLTMG Alor",367],
  //     ["PLTMG Bima","PLTMG Waingapu",394],["PLTMG Bima","Badak NGL Bontang",522],
  //     ["PLTMG Maumere","MPP Jeranjang (Lombok Peaker)",414],["PLTMG Maumere","PLTMG Kupang",400],["PLTMG Maumere","PLTMG Rangko (Flores)",183],
  //     ["PLTMG Maumere","PLTMG Sumbawa",322],["PLTMG Maumere","PLTMG Bima",236],["PLTMG Maumere","PLTMG Alor",176],
  //     ["PLTMG Maumere","PLTMG Waingapu",534],["PLTMG Maumere","Badak NGL Bontang",619],
  //     ["PLTMG Alor","MPP Jeranjang (Lombok Peaker)",545],["PLTMG Alor","PLTMG Kupang",150],["PLTMG Alor","PLTMG Rangko (Flores)",313],
  //     ["PLTMG Alor","PLTMG Sumbawa",453],["PLTMG Alor","PLTMG Bima",367],["PLTMG Alor","PLTMG Maumere",176],
  //     ["PLTMG Alor","PLTMG Waingapu",274],["PLTMG Alor","Badak NGL Bontang",729],
  //     ["PLTMG Waingapu","MPP Jeranjang (Lombok Peaker)",302],["PLTMG Waingapu","PLTMG Kupang",219],["PLTMG Waingapu","PLTMG Rangko (Flores)",461],
  //     ["PLTMG Waingapu","PLTMG Sumbawa",309],["PLTMG Waingapu","PLTMG Bima",394],["PLTMG Waingapu","PLTMG Maumere",534],
  //     ["PLTMG Waingapu","PLTMG Alor",274],["PLTMG Waingapu","Badak NGL Bontang",780],
  //     ["Badak NGL Bontang","MPP Jeranjang (Lombok Peaker)",542],["Badak NGL Bontang","PLTMG Kupang",942],
  //     ["Badak NGL Bontang","PLTMG Rangko (Flores)",542],["Badak NGL Bontang","PLTMG Sumbawa",526],["Badak NGL Bontang","PLTMG Bima",522],
  //     ["Badak NGL Bontang","PLTMG Maumere",619],["Badak NGL Bontang","PLTMG Alor",729],["Badak NGL Bontang","PLTMG Waingapu",780],
  //   ].map(([origin, destination, nm]) => ({ origin, destination, nauticalMiles: nm }))
  //   await prisma.distanceRoute.createMany({ data: routes, skipDuplicates: true });
  //   console.log('✅ Distance routes seeded');
  // }

  // const oruCount = await prisma.oruCapex.count();
  // if (oruCount === 0) {
  //   await prisma.oruCapex.createMany({
  //     data: [
  //       { plantName: "MPP Jeranjang (Lombok Peaker)", fixCapexUSD: 13501607 },
  //       { plantName: "PLTMG Kupang", fixCapexUSD: 14222216 },
  //       { plantName: "PLTMG Rangko (Flores)", fixCapexUSD: 16384042 },
  //       { plantName: "PLTMG Sumbawa", fixCapexUSD: 13982013 },
  //       { plantName: "PLTMG Bima", fixCapexUSD: 14942825 },
  //       { plantName: "PLTMG Maumere", fixCapexUSD: 15136113 },
  //       { plantName: "PLTMG Alor", fixCapexUSD: 11263521 },
  //       { plantName: "PLTMG Waingapu", fixCapexUSD: 15136113 },
  //       { plantName: "Badak NGL Bontang", fixCapexUSD: 3678949 },
  //     ],
  //     skipDuplicates: true,
  //   });
  //   console.log('✅ ORU Capex seeded');
  // }

  // // NEW: seed Locations with coordinates
  // const locCount = await prisma.location.count();
  // if (locCount === 0) {
  //   await prisma.location.createMany({
  //     data: [
  //       // Terminal
  //       { name: "Badak NGL Bontang", type: "terminal", latitude: 0.12, longitude: 117.50 },
  //       // Plants / receiving locations
  //       { name: "MPP Jeranjang (Lombok Peaker)", type: "plant", latitude: -8.65, longitude: 116.08 },
  //       { name: "PLTMG Kupang", type: "plant", latitude: -10.17, longitude: 123.60 },
  //       { name: "PLTMG Rangko (Flores)", type: "plant", latitude: -8.50, longitude: 119.89 },
  //       { name: "PLTMG Sumbawa", type: "plant", latitude: -8.62, longitude: 117.42 },
  //       { name: "PLTMG Bima", type: "plant", latitude: -8.46, longitude: 118.73 },
  //       { name: "PLTMG Maumere", type: "plant", latitude: -8.62, longitude: 122.23 },
  //       { name: "PLTMG Alor", type: "plant", latitude: -8.22, longitude: 124.55 },
  //       { name: "PLTMG Waingapu", type: "plant", latitude: -9.65, longitude: 120.27 },
  //     ],
  //     skipDuplicates: true,
  //   });
  //   console.log('✅ Locations seeded');
  // }

  // NEW: seed RiskMatrix (incremental R1–R32)
  const existingRisk = await prisma.riskMatrix.findMany({
    select: { riskCode: true },
  });
  const existingCodes = new Set(existingRisk.map(r => r.riskCode));

  const allRows = [
    {
      riskCode: 'R1',
      variable: 'Kecelakaan Kapal',
      values: {
        "II.2 P1_BOP": 0.03159482421875, "II.2 P2_Durasi": 0.042105078125, "II.2 P4_Panjang Jalur": 0.0350982421875, "II.2 P5_Kecepatan Kapal": 0.036499609375,
        "II.3 P1_BOP": 0.0322955078125, "II.3 P2_Durasi": 0.03860166015625, "II.3 P3_BIV": 0.036499609375, "II.3 P4_Panjang Jalur": 0.0350982421875,
        "II.5 P1_BOP": 0.0322955078125, "II.5 P2_Durasi": 0.04000302734375, "II.5 P4_Panjang Jalur": 0.0407037109375, "II.5 P5_Kecepatan Kapal": 0.0379009765625
      }
    },
    {
      riskCode: 'R2',
      variable: 'Politik (kerusuhan&perang)',
      values: {
        "II.1 P1_BOP": 0.0110697265625, "II.2 P1_BOP": 0.01074501953125, "II.2 P3_BIV": 0.01334267578125,
        "II.4 P1_BOP": 0.014316796875, "II.5 P1_BOP": 0.01334267578125, "II.5 P2_Durasi": 0.01334267578125,
        "II.7 P1_BOP": 0.0152909179688, "II.7 P3_BIV": 0.01334267578125, "II.8 P1_BOP": 0.01334267578125
      }
    },
    {
      riskCode: 'R3',
      variable: 'Pembajakan',
      values: {
        "II.3 P1_BOP": 0.0118760742188, "II.3 P2_Durasi": 0.018694921875, "II.3 P3_BIV": 0.018694921875
      }
    },
    {
      riskCode: 'R4',
      variable: 'Serangan Teroris',
      values: {
        "II.1 P1_BOP": 0.011994140625, "II.1 P3_BIV": 0.011310546875,
        "II.2 P1_BOP": 0.0150703125,
        "II.3 P1_BOP": 0.0123359375,
        "II.4 P1_BOP": 0.016095703125,
        "II.5 P1_BOP": 0.01438671875,
        "II.6 P1_BOP": 0.016779296875,
        "II.7 P1_BOP": 0.016095703125, "II.7 P3_BIV": 0.015412109375,
        "II.8 P1_BOP": 0.01438671875, "II.8 P3_BIV": 0.01438671875
      }
    },
    {
      riskCode: 'R5',
      variable: 'Sabotase',
      values: { "II.3 P1_BOP": 0.011940234375, "II.3 P2_Durasi": 0.0196892578125 }
    },
    {
      riskCode: 'R6',
      variable: 'Epidemi',
      values: { "II.3 P1_BOP": 0.0117203125, "II.3 P2_Durasi": 0.01324375 }
    },
    {
      riskCode: 'R7',
      variable: 'Kerusakan peralatan',
      values: {
        "II.1 P1_BOP": 0.031312109375, "II.1 P2_Durasi": 0.0498594726563, "II.1 P3_BIV": 0.0389390625,
        "II.2 P1_BOP": 0.038245703125, "II.2 P2_Durasi": 0.0619932617188,
        "II.4 P1_BOP": 0.0510728515625, "II.4 P2_Durasi": 0.0607798828125, "II.4 P3_BIV": 0.0571397460938,
        "II.5 P1_BOP": 0.0425791992188, "II.5 P2_Durasi": 0.0522862304688,
        "II.6 P1_BOP": 0.04864609375, "II.6 P3_BIV": 0.0571397460938,
        "II.7 P1_BOP": 0.04864609375,
        "II.8 P1_BOP": 0.0510728515625, "II.8 P3_BIV": 0.0474327148438
      }
    },
    {
      riskCode: 'R8',
      variable: 'Pemadaman listrik',
      values: {
        "II.1 P1_BOP": 0.0224234375, "II.1 P2_Durasi": 0.0280044921875, "II.1 P3_BIV": 0.031105078125,
        "II.2 P1_BOP": 0.0255240234375, "II.2 P2_Durasi": 0.0317251953125,
        "II.4 P1_BOP": 0.0359109863281, "II.4 P2_Durasi": 0.03482578125, "II.4 P3_BIV": 0.033585546875,
        "II.5 P1_BOP": 0.0292447265625, "II.5 P2_Durasi": 0.0342056640625,
        "II.6 P1_BOP": 0.033585546875,
        "II.7 P1_BOP": 0.0317251953125,
        "II.8 P1_BOP": 0.02986484375, "II.8 P3_BIV": 0.028624609375
      }
    },
    {
      riskCode: 'R9',
      variable: 'Kegagalan fasilitas komunikasi',
      values: {
        "II.1 P1_BOP": 0.0172283203125, "II.1 P2_Durasi": 0.02372734375,
        "II.2 P1_BOP": 0.0231365234375, "II.2 P2_Durasi": 0.0254998046875, "II.2 P3_BIV": 0.026090625,
        "II.4 P1_BOP": 0.022545703125, "II.4 P2_Durasi": 0.0254998046875, "II.4 P3_BIV": 0.024908984375,
        "II.5 P1_BOP": 0.0231365234375, "II.5 P2_Durasi": 0.027272265625, "II.5 P3_BIV": 0.0266814453125,
        "II.6 P1_BOP": 0.0243181640625, "II.6 P3_BIV": 0.0266814453125
      }
    },
    {
      riskCode: 'R10',
      variable: 'Kemacetan Pelabuhan',
      values: {
        "II.2 P1_BOP": 0.0265783203125, "II.2 P2_Durasi": 0.03811640625,
        "II.5 P1_BOP": 0.0306505859375, "II.5 P2_Durasi": 0.03268671875
      }
    },
    {
      riskCode: 'R11',
      variable: 'Masalah akses darat',
      values: {}
    },
    {
      riskCode: 'R12',
      variable: 'Kemampuan penyimpanan terbatas',
      values: {
        "II.1 P1_BOP": 0.0231390625, "II.1 P2_Durasi": 0.02659609375,
        "II.2 P1_BOP": 0.023715234375, "II.2 P2_Durasi": 0.028324609375,
        "II.4 P1_BOP": 0.0277484375, "II.4 P2_Durasi": 0.027172265625,
        "II.5 P1_BOP": 0.02659609375, "II.5 P2_Durasi": 0.02890078125,
        "II.6 P1_BOP": 0.02890078125
      }
    },
    {
      riskCode: 'R13',
      variable: 'Kemampuan berlabuh tidak memadai',
      values: {
        "II.2 P1_BOP": 0.0267375, "II.2 P2_Durasi": 0.02976484375,
        "II.5 P1_BOP": 0.02492109375, "II.5 P2_Durasi": 0.0279484375
      }
    },
    {
      riskCode: 'R14',
      variable: 'Biaya Bunkering tidak pasti',
      values: { "II.3 P1_BOP": 0.0333578125 }
    },
    {
      riskCode: 'R15',
      variable: 'Kekurangan Kapal Transport',
      values: { "II.3 P1_BOP": 0.035013671875 }
    },
    {
      riskCode: 'R16',
      variable: 'Perkiraan permintaan tidak akurat',
      values: { "II.3 P1_BOP": 0.037625 }
    },
    {
      riskCode: 'R17',
      variable: 'Pemogokan Pelabuhan',
      values: {
        "II.1 P1_BOP": 0.01200625, "II.1 P2_Durasi": 0.0192279296875,
        "II.2 P1_BOP": 0.01565859375, "II.2 P2_Durasi": 0.0192279296875,
        "II.4 P1_BOP": 0.01433046875,
        "II.5 P1_BOP": 0.01433046875, "II.5 P2_Durasi": 0.01698671875
      }
    },
    {
      riskCode: 'R18',
      variable: 'Pemeriksaan Karantina Muatan Lambat',
      values: {
        "II.2 P1_BOP": 0.01648125, "II.2 P2_Durasi": 0.022575,
        "II.5 P1_BOP": 0.01648125, "II.5 P2_Durasi": 0.01835625
      }
    },
    {
      riskCode: 'R19',
      variable: 'Proses Bea Cukai Lama',
      values: {
        "II.2 P1_BOP": 0.023663671875, "II.2 P2_Durasi": 0.0255240234375,
        "II.5 P1_BOP": 0.0224234375, "II.5 P2_Durasi": 0.023663671875
      }
    },
    {
      riskCode: 'R20',
      variable: 'Sengketa Pengiriman Pelabuhan',
      values: {}
    },
    {
      riskCode: 'R21',
      variable: 'Kurang fleksibel jadwal yang disusun',
      values: {
        "II.1 P1_BOP": 0.0230435546875, "II.1 P2_Durasi": 0.0317251953125,
        "II.2 P1_BOP": 0.0242837890625, "II.2 P2_Durasi": 0.0280044921875,
        "II.4 P1_BOP": 0.023663671875, "II.4 P2_Durasi": 0.027384375,
        "II.5 P1_BOP": 0.0218033203125, "II.5 P2_Durasi": 0.0242837890625
      }
    },
    {
      riskCode: 'R22',
      variable: 'Cuaca buruk',
      values: {
        "II.1 P1_BOP": 0.045800390625, "II.1 P2_Durasi": 0.088030615234375,
        "II.2 P1_BOP": 0.059268408203125, "II.2 P2_Durasi": 0.0832369140625,
        "II.3 P1_BOP": 0.059268408203125, "II.3 P2_Durasi": 0.08004111328125, "II.3 P3_BIV": 0.084834814453125, "II.3 P4_Panjang Jalur": 0.081639013671875,
        "II.4 P1_BOP": 0.065660009765625, "II.4 P2_Durasi": 0.068855810546875,
        "II.5 P1_BOP": 0.06086630859375, "II.5 P2_Durasi": 0.072051611328125,
        "II.7 P1_BOP": 0.052876806640625
      }
    },
    {
      riskCode: 'R23',
      variable: 'Gempa bumi',
      values: {
        "II.1 P1_BOP": 0.0234538085938, "II.1 P2_Durasi": 0.0335709960938,
        "II.2 P1_BOP": 0.0247184570313, "II.2 P2_Durasi": 0.032938671875,
        "II.4 P1_BOP": 0.0266154296875, "II.4 P2_Durasi": 0.0310416992188,
        "II.5 P1_BOP": 0.0272477539063, "II.5 P2_Durasi": 0.0297770507813,
        "II.6 P1_BOP": 0.0323063476563,
        "II.7 P1_BOP": 0.0285124023438,
        "II.8 P1_BOP": 0.027880078125
      }
    },
    {
      riskCode: 'R24',
      variable: 'Tsunami',
      values: {
        "II.1 P1_BOP": 0.0209244140625, "II.1 P2_Durasi": 0.0280337890625,
        "II.2 P1_BOP": 0.022257421875, "II.2 P2_Durasi": 0.0280337890625,
        "II.3 P1_BOP": 0.0227017578125, "II.3 P2_Durasi": 0.027589453125, "II.3 P3_BIV": 0.028478125, "II.3 P4_Panjang Jalur": 0.0262564453125,
        "II.4 P1_BOP": 0.0249234375, "II.4 P2_Durasi": 0.02670078125,
        "II.5 P1_BOP": 0.0235904296875, "II.5 P2_Durasi": 0.027589453125,
        "II.6 P1_BOP": 0.0271451171875,
        "II.7 P1_BOP": 0.02314609375,
        "II.8 P1_BOP": 0.024034765625
      }
    },
    {
      riskCode: 'R25',
      variable: 'Kurangnya tenaga terampil',
      values: {
        "II.1 P1_BOP": 0.017240234375, "II.1 P2_Durasi": 0.023587890625,
        "II.2 P1_BOP": 0.019779296875, "II.2 P2_Durasi": 0.023587890625,
        "II.3 P1_BOP": 0.024857421875, "II.3 P2_Durasi": 0.022953125,
        "II.4 P1_BOP": 0.02168359375, "II.4 P2_Durasi": 0.023587890625,
        "II.5 P1_BOP": 0.021048828125, "II.5 P2_Durasi": 0.02168359375,
        "II.6 P1_BOP": 0.01914453125,
        "II.7 P1_BOP": 0.02168359375,
        "II.8 P1_BOP": 0.02422265625
      }
    },
    {
      riskCode: 'R26',
      variable: 'Kurangnya motivasi',
      values: {
        "II.1 P1_BOP": 0.0160466796875, "II.1 P2_Durasi": 0.0160466796875,
        "II.2 P1_BOP": 0.015455859375, "II.2 P2_Durasi": 0.017819140625,
        "II.3 P1_BOP": 0.0184099609375, "II.3 P2_Durasi": 0.01900078125,
        "II.4 P1_BOP": 0.017819140625, "II.4 P2_Durasi": 0.01900078125,
        "II.5 P1_BOP": 0.0166375, "II.5 P2_Durasi": 0.0184099609375
      }
    },
    {
      riskCode: 'R27',
      variable: 'Kesehatan mental pelaut terganggu',
      values: {
        "II.1 P1_BOP": 0.01737734375, "II.1 P2_Durasi": 0.019105859375,
        "II.2 P1_BOP": 0.0185296875, "II.2 P2_Durasi": 0.020258203125,
        "II.3 P1_BOP": 0.0185296875, "II.3 P2_Durasi": 0.017953515625,
        "II.4 P1_BOP": 0.0185296875, "II.4 P2_Durasi": 0.019105859375,
        "II.5 P1_BOP": 0.01737734375, "II.5 P2_Durasi": 0.019105859375
      }
    },
    {
      riskCode: 'R28',
      variable: 'Kesalahan manusia',
      values: {
        "II.1 P1_BOP": 0.0303474609375, "II.1 P2_Durasi": 0.03550859375,
        "II.2 P1_BOP": 0.0362458984375, "II.2 P2_Durasi": 0.03550859375,
        "II.3 P1_BOP": 0.0362458984375, "II.3 P2_Durasi": 0.0332966796875,
        "II.4 P1_BOP": 0.034033984375,
        "II.5 P1_BOP": 0.0332966796875, "II.5 P2_Durasi": 0.034033984375,
        "II.7 P1_BOP": 0.0332966796875,
        "II.8 P1_BOP": 0.0347712890625
      }
    },
    {
      riskCode: 'R29',
      variable: 'Kesejahteraan di bawah standar',
      values: {
        "II.1 P1_BOP": 0.01604375, "II.1 P2_Durasi": 0.0187,
        "II.2 P1_BOP": 0.0193640625, "II.2 P2_Durasi": 0.020028125,
        "II.3 P1_BOP": 0.0187, "II.3 P2_Durasi": 0.0193640625,
        "II.4 P1_BOP": 0.0193640625,
        "II.5 P1_BOP": 0.0180359375, "II.5 P2_Durasi": 0.0193640625,
        "II.7 P1_BOP": 0.0206921875
      }
    },
    {
      riskCode: 'R30',
      variable: 'Kurangnya fleksibilitas',
      values: {}
    },
    {
      riskCode: 'R31',
      variable: 'Budaya keselamatan yang buruk',
      values: {
        "II.1 P1_BOP": 0.027379296875, "II.1 P2_Durasi": 0.0319251953125,
        "II.2 P1_BOP": 0.03127578125, "II.2 P2_Durasi": 0.032574609375,
        "II.3 P1_BOP": 0.03127578125, "II.3 P2_Durasi": 0.0280287109375,
        "II.4 P1_BOP": 0.0306263671875, "II.4 P2_Durasi": 0.032574609375,
        "II.5 P1_BOP": 0.029976953125, "II.5 P2_Durasi": 0.0306263671875,
        "II.6 P1_BOP": 0.0332240234375,
        "II.7 P1_BOP": 0.0319251953125,
        "II.8 P1_BOP": 0.032574609375
      }
    },
    {
      riskCode: 'R32',
      variable: 'Tingkat kepemimpinan keselamatan yang rendah',
      values: {
        "II.1 P1_BOP": 0.0255240234375, "II.1 P2_Durasi": 0.0280044921875,
        "II.2 P1_BOP": 0.0292447265625, "II.2 P2_Durasi": 0.0292447265625,
        "II.3 P1_BOP": 0.028624609375, "II.3 P2_Durasi": 0.027384375,
        "II.4 P1_BOP": 0.027384375, "II.4 P2_Durasi": 0.028624609375,
        "II.5 P1_BOP": 0.027384375, "II.5 P2_Durasi": 0.027384375,
        "II.6 P1_BOP": 0.028624609375,
        "II.7 P1_BOP": 0.0280044921875,
        "II.8 P1_BOP": 0.0292447265625
      }
    },
  ];

  const missingRows = allRows.filter(r => !existingCodes.has(r.riskCode));
  if (missingRows.length > 0) {
    await prisma.riskMatrix.createMany({
      data: missingRows,
      skipDuplicates: true,
    });
    console.log(`✅ RiskMatrix seeded/updated (${missingRows.length} new codes)`);
  } else {
    console.log('ℹ️ RiskMatrix already up to date');
  }

  console.log("Seeding completed successfully!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
