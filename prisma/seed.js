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

  // NEW: seed RiskMatrix (R1–R32) - upsert to ensure values match Excel exactly
  // const allRows = [
  //   {
  //     riskCode: 'R1',
  //     variable: 'Kecelakaan Kapal',
  //     values: {
  //       "II.1 P1_BOP": 0, "II.1 P2_Durasi": 0, "II.1 P3_BIV": 0,
  //       "II.2 P1_BOP": 0.03159482421875, "II.2 P2_Durasi": 0.042105078125, "II.2 P3_BIV": 0, "II.2 P4_Panjang Jalur": 0.0350982421875, "II.2 P5_Kecepatan Kapal": 0.036499609375,
  //       "II.3 P1_BOP": 0.0322955078125, "II.3 P2_Durasi": 0.03860166015625, "II.3 P3_BIV": 0.036499609375, "II.3 P4_Panjang Jalur": 0.0350982421875,
  //       "II.4 P1_BOP": 0, "II.4 P2_Durasi": 0, "II.4 P3_BIV": 0,
  //       "II.5 P1_BOP": 0.0322955078125, "II.5 P2_Durasi": 0.04000302734375, "II.5 P3_BIV": 0, "II.5 P4_Panjang Jalur": 0.0407037109375, "II.5 P5_Kecepatan Kapal": 0.0379009765625,
  //       "II.6 P1_BOP": 0, "II.6 P3_BIV": 0,
  //       "II.7 P1_BOP": 0, "II.7 P3_BIV": 0,
  //       "II.8 P1_BOP": 0, "II.8 P3_BIV": 0
  //     }
  //   },
  //   {
  //     riskCode: 'R2',
  //     variable: 'Politik (kerusuhan&perang)',
  //     values: {
  //       "II.1 P1_BOP": 0.0110697265625, "II.1 P2_Durasi": 0, "II.1 P3_BIV": 0,
  //       "II.2 P1_BOP": 0.01074501953125, "II.2 P2_Durasi": 0, "II.2 P3_BIV": 0.01334267578125, "II.2 P4_Panjang Jalur": 0, "II.2 P5_Kecepatan Kapal": 0,
  //       "II.3 P1_BOP": 0, "II.3 P2_Durasi": 0, "II.3 P3_BIV": 0, "II.3 P4_Panjang Jalur": 0,
  //       "II.4 P1_BOP": 0.014316796875, "II.4 P2_Durasi": 0, "II.4 P3_BIV": 0,
  //       "II.5 P1_BOP": 0.01334267578125, "II.5 P2_Durasi": 0, "II.5 P3_BIV": 0.01334267578125, "II.5 P4_Panjang Jalur": 0, "II.5 P5_Kecepatan Kapal": 0,
  //       "II.6 P1_BOP": 0.014316796875, "II.6 P3_BIV": 0.014316796875,
  //       "II.7 P1_BOP": 0.01529091796875, "II.7 P3_BIV": 0.01334267578125,
  //       "II.8 P1_BOP": 0.01334267578125, "II.8 P3_BIV": 0
  //     }
  //   },
  //   {
  //     riskCode: 'R3',
  //     variable: 'Pembajakan',
  //     values: {
  //       "II.1 P1_BOP": 0, "II.1 P2_Durasi": 0, "II.1 P3_BIV": 0,
  //       "II.2 P1_BOP": 0, "II.2 P2_Durasi": 0, "II.2 P3_BIV": 0, "II.2 P4_Panjang Jalur": 0, "II.2 P5_Kecepatan Kapal": 0,
  //       "II.3 P1_BOP": 0.01187607421875, "II.3 P2_Durasi": 0.018694921875, "II.3 P3_BIV": 0.018694921875, "II.3 P4_Panjang Jalur": 0,
  //       "II.4 P1_BOP": 0, "II.4 P2_Durasi": 0, "II.4 P3_BIV": 0,
  //       "II.5 P1_BOP": 0, "II.5 P2_Durasi": 0, "II.5 P3_BIV": 0, "II.5 P4_Panjang Jalur": 0, "II.5 P5_Kecepatan Kapal": 0,
  //       "II.6 P1_BOP": 0, "II.6 P3_BIV": 0,
  //       "II.7 P1_BOP": 0, "II.7 P3_BIV": 0,
  //       "II.8 P1_BOP": 0, "II.8 P3_BIV": 0
  //     }
  //   },
  //   {
  //     riskCode: 'R4',
  //     variable: 'Serangan Teroris',
  //     values: {
  //       "II.1 P1_BOP": 0.011994140625, "II.1 P2_Durasi": 0, "II.1 P3_BIV": 0.011310546875,
  //       "II.2 P1_BOP": 0.0150703125, "II.2 P2_Durasi": 0, "II.2 P3_BIV": 0, "II.2 P4_Panjang Jalur": 0, "II.2 P5_Kecepatan Kapal": 0,
  //       "II.3 P1_BOP": 0.0123359375, "II.3 P2_Durasi": 0, "II.3 P3_BIV": 0, "II.3 P4_Panjang Jalur": 0,
  //       "II.4 P1_BOP": 0.016095703125, "II.4 P2_Durasi": 0, "II.4 P3_BIV": 0,
  //       "II.5 P1_BOP": 0.01438671875, "II.5 P2_Durasi": 0, "II.5 P3_BIV": 0, "II.5 P4_Panjang Jalur": 0, "II.5 P5_Kecepatan Kapal": 0,
  //       "II.6 P1_BOP": 0.016779296875, "II.6 P3_BIV": 0,
  //       "II.7 P1_BOP": 0.016095703125, "II.7 P3_BIV": 0.015412109375,
  //       "II.8 P1_BOP": 0.01438671875, "II.8 P3_BIV": 0.01438671875
  //     }
  //   },
  //   {
  //     riskCode: 'R5',
  //     variable: 'Sabotase',
  //     values: {
  //       "II.1 P1_BOP": 0, "II.1 P2_Durasi": 0, "II.1 P3_BIV": 0,
  //       "II.2 P1_BOP": 0, "II.2 P2_Durasi": 0, "II.2 P3_BIV": 0, "II.2 P4_Panjang Jalur": 0, "II.2 P5_Kecepatan Kapal": 0,
  //       "II.3 P1_BOP": 0.011940234375, "II.3 P2_Durasi": 0.0196892578125, "II.3 P3_BIV": 0, "II.3 P4_Panjang Jalur": 0,
  //       "II.4 P1_BOP": 0, "II.4 P2_Durasi": 0, "II.4 P3_BIV": 0,
  //       "II.5 P1_BOP": 0, "II.5 P2_Durasi": 0, "II.5 P3_BIV": 0, "II.5 P4_Panjang Jalur": 0, "II.5 P5_Kecepatan Kapal": 0,
  //       "II.6 P1_BOP": 0, "II.6 P3_BIV": 0,
  //       "II.7 P1_BOP": 0, "II.7 P3_BIV": 0,
  //       "II.8 P1_BOP": 0, "II.8 P3_BIV": 0
  //     }
  //   },
  //   {
  //     riskCode: 'R6',
  //     variable: 'Epidemi',
  //     values: {
  //       "II.1 P1_BOP": 0, "II.1 P2_Durasi": 0, "II.1 P3_BIV": 0,
  //       "II.2 P1_BOP": 0, "II.2 P2_Durasi": 0, "II.2 P3_BIV": 0, "II.2 P4_Panjang Jalur": 0, "II.2 P5_Kecepatan Kapal": 0,
  //       "II.3 P1_BOP": 0.0117203125, "II.3 P2_Durasi": 0.01324375, "II.3 P3_BIV": 0, "II.3 P4_Panjang Jalur": 0,
  //       "II.4 P1_BOP": 0, "II.4 P2_Durasi": 0, "II.4 P3_BIV": 0,
  //       "II.5 P1_BOP": 0, "II.5 P2_Durasi": 0, "II.5 P3_BIV": 0, "II.5 P4_Panjang Jalur": 0, "II.5 P5_Kecepatan Kapal": 0,
  //       "II.6 P1_BOP": 0, "II.6 P3_BIV": 0,
  //       "II.7 P1_BOP": 0, "II.7 P3_BIV": 0,
  //       "II.8 P1_BOP": 0, "II.8 P3_BIV": 0
  //     }
  //   },
  //   {
  //     riskCode: 'R7',
  //     variable: 'Kerusakan peralatan',
  //     values: {
  //       "II.1 P1_BOP": 0.031312109375, "II.1 P2_Durasi": 0.04985947265625, "II.1 P3_BIV": 0.0389390625,
  //       "II.2 P1_BOP": 0.038245703125, "II.2 P2_Durasi": 0.06199326171875, "II.2 P3_BIV": 0, "II.2 P4_Panjang Jalur": 0, "II.2 P5_Kecepatan Kapal": 0,
  //       "II.3 P1_BOP": 0, "II.3 P2_Durasi": 0, "II.3 P3_BIV": 0, "II.3 P4_Panjang Jalur": 0,
  //       "II.4 P1_BOP": 0.0510728515625, "II.4 P2_Durasi": 0.0607798828125, "II.4 P3_BIV": 0.05713974609375,
  //       "II.5 P1_BOP": 0.04257919921875, "II.5 P2_Durasi": 0.05228623046875, "II.5 P3_BIV": 0, "II.5 P4_Panjang Jalur": 0, "II.5 P5_Kecepatan Kapal": 0,
  //       "II.6 P1_BOP": 0.04864609375, "II.6 P3_BIV": 0.05713974609375,
  //       "II.7 P1_BOP": 0.04864609375, "II.7 P3_BIV": 0.0510728515625,
  //       "II.8 P1_BOP": 0.04864609375, "II.8 P3_BIV": 0.04743271484375
  //     }
  //   },
  //   {
  //     riskCode: 'R8',
  //     variable: 'Pemadaman listrik',
  //     values: {
  //       "II.1 P1_BOP": 0.0224234375, "II.1 P2_Durasi": 0.0280044921875, "II.1 P3_BIV": 0.031105078125,
  //       "II.2 P1_BOP": 0.0255240234375, "II.2 P2_Durasi": 0.0317251953125, "II.2 P3_BIV": 0, "II.2 P4_Panjang Jalur": 0, "II.2 P5_Kecepatan Kapal": 0,
  //       "II.3 P1_BOP": 0, "II.3 P2_Durasi": 0, "II.3 P3_BIV": 0, "II.3 P4_Panjang Jalur": 0,
  //       "II.4 P1_BOP": 0.035910986328125, "II.4 P2_Durasi": 0.03482578125, "II.4 P3_BIV": 0.033585546875,
  //       "II.5 P1_BOP": 0.0292447265625, "II.5 P2_Durasi": 0.0342056640625, "II.5 P3_BIV": 0, "II.5 P4_Panjang Jalur": 0, "II.5 P5_Kecepatan Kapal": 0,
  //       "II.6 P1_BOP": 0.033585546875, "II.6 P3_BIV": 0.035910986328125,
  //       "II.7 P1_BOP": 0.0317251953125, "II.7 P3_BIV": 0.0317251953125,
  //       "II.8 P1_BOP": 0.02986484375, "II.8 P3_BIV": 0.028624609375
  //     }
  //   },
  //   {
  //     riskCode: 'R9',
  //     variable: 'Kegagalan fasilitas komunikasi',
  //     values: {
  //       "II.1 P1_BOP": 0.0172283203125, "II.1 P2_Durasi": 0.02372734375, "II.1 P3_BIV": 0,
  //       "II.2 P1_BOP": 0.0231365234375, "II.2 P2_Durasi": 0.0254998046875, "II.2 P3_BIV": 0.026090625, "II.2 P4_Panjang Jalur": 0, "II.2 P5_Kecepatan Kapal": 0,
  //       "II.3 P1_BOP": 0, "II.3 P2_Durasi": 0, "II.3 P3_BIV": 0, "II.3 P4_Panjang Jalur": 0,
  //       "II.4 P1_BOP": 0.022545703125, "II.4 P2_Durasi": 0.0254998046875, "II.4 P3_BIV": 0.024908984375,
  //       "II.5 P1_BOP": 0.0231365234375, "II.5 P2_Durasi": 0.027272265625, "II.5 P3_BIV": 0.0266814453125, "II.5 P4_Panjang Jalur": 0, "II.5 P5_Kecepatan Kapal": 0,
  //       "II.6 P1_BOP": 0.0243181640625, "II.6 P3_BIV": 0.0266814453125,
  //       "II.7 P1_BOP": 0, "II.7 P3_BIV": 0,
  //       "II.8 P1_BOP": 0, "II.8 P3_BIV": 0
  //     }
  //   },
  //   {
  //     riskCode: 'R10',
  //     variable: 'Kemacetan Pelabuhan',
  //     values: {
  //       "II.1 P1_BOP": 0, "II.1 P2_Durasi": 0, "II.1 P3_BIV": 0,
  //       "II.2 P1_BOP": 0.0265783203125, "II.2 P2_Durasi": 0.03811640625, "II.2 P3_BIV": 0, "II.2 P4_Panjang Jalur": 0, "II.2 P5_Kecepatan Kapal": 0,
  //       "II.3 P1_BOP": 0, "II.3 P2_Durasi": 0, "II.3 P3_BIV": 0, "II.3 P4_Panjang Jalur": 0,
  //       "II.4 P1_BOP": 0, "II.4 P2_Durasi": 0, "II.4 P3_BIV": 0,
  //       "II.5 P1_BOP": 0.0306505859375, "II.5 P2_Durasi": 0.03268671875, "II.5 P3_BIV": 0, "II.5 P4_Panjang Jalur": 0, "II.5 P5_Kecepatan Kapal": 0,
  //       "II.6 P1_BOP": 0, "II.6 P3_BIV": 0,
  //       "II.7 P1_BOP": 0, "II.7 P3_BIV": 0,
  //       "II.8 P1_BOP": 0, "II.8 P3_BIV": 0
  //     }
  //   },
  //   {
  //     riskCode: 'R11',
  //     variable: 'Masalah akses darat',
  //     values: {
  //       "II.1 P1_BOP": 0, "II.1 P2_Durasi": 0, "II.1 P3_BIV": 0,
  //       "II.2 P1_BOP": 0, "II.2 P2_Durasi": 0, "II.2 P3_BIV": 0, "II.2 P4_Panjang Jalur": 0, "II.2 P5_Kecepatan Kapal": 0,
  //       "II.3 P1_BOP": 0, "II.3 P2_Durasi": 0, "II.3 P3_BIV": 0, "II.3 P4_Panjang Jalur": 0,
  //       "II.4 P1_BOP": 0, "II.4 P2_Durasi": 0, "II.4 P3_BIV": 0,
  //       "II.5 P1_BOP": 0, "II.5 P2_Durasi": 0, "II.5 P3_BIV": 0, "II.5 P4_Panjang Jalur": 0, "II.5 P5_Kecepatan Kapal": 0,
  //       "II.6 P1_BOP": 0, "II.6 P3_BIV": 0,
  //       "II.7 P1_BOP": 0, "II.7 P3_BIV": 0,
  //       "II.8 P1_BOP": 0, "II.8 P3_BIV": 0
  //     }
  //   },
  //   {
  //     riskCode: 'R12',
  //     variable: 'Kemampuan penyimpanan terbatas',
  //     values: {
  //       "II.1 P1_BOP": 0.0231390625, "II.1 P2_Durasi": 0.02659609375, "II.1 P3_BIV": 0,
  //       "II.2 P1_BOP": 0.023715234375, "II.2 P2_Durasi": 0.028324609375, "II.2 P3_BIV": 0, "II.2 P4_Panjang Jalur": 0, "II.2 P5_Kecepatan Kapal": 0,
  //       "II.3 P1_BOP": 0, "II.3 P2_Durasi": 0, "II.3 P3_BIV": 0, "II.3 P4_Panjang Jalur": 0,
  //       "II.4 P1_BOP": 0.0277484375, "II.4 P2_Durasi": 0.027172265625, "II.4 P3_BIV": 0,
  //       "II.5 P1_BOP": 0.02659609375, "II.5 P2_Durasi": 0.02890078125, "II.5 P3_BIV": 0, "II.5 P4_Panjang Jalur": 0, "II.5 P5_Kecepatan Kapal": 0,
  //       "II.6 P1_BOP": 0.02890078125, "II.6 P3_BIV": 0,
  //       "II.7 P1_BOP": 0, "II.7 P3_BIV": 0,
  //       "II.8 P1_BOP": 0, "II.8 P3_BIV": 0
  //     }
  //   },
  //   {
  //     riskCode: 'R13',
  //     variable: 'Kemampuan berlabuh tidak memadai',
  //     values: {
  //       "II.1 P1_BOP": 0, "II.1 P2_Durasi": 0, "II.1 P3_BIV": 0,
  //       "II.2 P1_BOP": 0.0267375, "II.2 P2_Durasi": 0.02976484375, "II.2 P3_BIV": 0, "II.2 P4_Panjang Jalur": 0, "II.2 P5_Kecepatan Kapal": 0,
  //       "II.3 P1_BOP": 0, "II.3 P2_Durasi": 0, "II.3 P3_BIV": 0, "II.3 P4_Panjang Jalur": 0,
  //       "II.4 P1_BOP": 0, "II.4 P2_Durasi": 0, "II.4 P3_BIV": 0,
  //       "II.5 P1_BOP": 0.02492109375, "II.5 P2_Durasi": 0.0279484375, "II.5 P3_BIV": 0, "II.5 P4_Panjang Jalur": 0, "II.5 P5_Kecepatan Kapal": 0,
  //       "II.6 P1_BOP": 0, "II.6 P3_BIV": 0,
  //       "II.7 P1_BOP": 0, "II.7 P3_BIV": 0,
  //       "II.8 P1_BOP": 0, "II.8 P3_BIV": 0
  //     }
  //   },
  //   {
  //     riskCode: 'R14',
  //     variable: 'Biaya Bunkering tidak pasti',
  //     values: {
  //       "II.1 P1_BOP": 0, "II.1 P2_Durasi": 0, "II.1 P3_BIV": 0,
  //       "II.2 P1_BOP": 0, "II.2 P2_Durasi": 0, "II.2 P3_BIV": 0, "II.2 P4_Panjang Jalur": 0, "II.2 P5_Kecepatan Kapal": 0,
  //       "II.3 P1_BOP": 0.0333578125, "II.3 P2_Durasi": 0, "II.3 P3_BIV": 0, "II.3 P4_Panjang Jalur": 0,
  //       "II.4 P1_BOP": 0, "II.4 P2_Durasi": 0, "II.4 P3_BIV": 0,
  //       "II.5 P1_BOP": 0, "II.5 P2_Durasi": 0, "II.5 P3_BIV": 0, "II.5 P4_Panjang Jalur": 0, "II.5 P5_Kecepatan Kapal": 0,
  //       "II.6 P1_BOP": 0, "II.6 P3_BIV": 0,
  //       "II.7 P1_BOP": 0, "II.7 P3_BIV": 0,
  //       "II.8 P1_BOP": 0, "II.8 P3_BIV": 0
  //     }
  //   },
  //   {
  //     riskCode: 'R15',
  //     variable: 'Kekurangan Kapal Transport',
  //     values: {
  //       "II.1 P1_BOP": 0, "II.1 P2_Durasi": 0, "II.1 P3_BIV": 0,
  //       "II.2 P1_BOP": 0, "II.2 P2_Durasi": 0, "II.2 P3_BIV": 0, "II.2 P4_Panjang Jalur": 0, "II.2 P5_Kecepatan Kapal": 0,
  //       "II.3 P1_BOP": 0.035013671875, "II.3 P2_Durasi": 0, "II.3 P3_BIV": 0, "II.3 P4_Panjang Jalur": 0,
  //       "II.4 P1_BOP": 0, "II.4 P2_Durasi": 0, "II.4 P3_BIV": 0,
  //       "II.5 P1_BOP": 0, "II.5 P2_Durasi": 0, "II.5 P3_BIV": 0, "II.5 P4_Panjang Jalur": 0, "II.5 P5_Kecepatan Kapal": 0,
  //       "II.6 P1_BOP": 0, "II.6 P3_BIV": 0,
  //       "II.7 P1_BOP": 0, "II.7 P3_BIV": 0,
  //       "II.8 P1_BOP": 0, "II.8 P3_BIV": 0
  //     }
  //   },
  //   {
  //     riskCode: 'R16',
  //     variable: 'Perkiraan permintaan tidak akurat',
  //     values: {
  //       "II.1 P1_BOP": 0, "II.1 P2_Durasi": 0, "II.1 P3_BIV": 0,
  //       "II.2 P1_BOP": 0, "II.2 P2_Durasi": 0, "II.2 P3_BIV": 0, "II.2 P4_Panjang Jalur": 0, "II.2 P5_Kecepatan Kapal": 0,
  //       "II.3 P1_BOP": 0.037625, "II.3 P2_Durasi": 0, "II.3 P3_BIV": 0, "II.3 P4_Panjang Jalur": 0,
  //       "II.4 P1_BOP": 0, "II.4 P2_Durasi": 0, "II.4 P3_BIV": 0,
  //       "II.5 P1_BOP": 0, "II.5 P2_Durasi": 0, "II.5 P3_BIV": 0, "II.5 P4_Panjang Jalur": 0, "II.5 P5_Kecepatan Kapal": 0,
  //       "II.6 P1_BOP": 0, "II.6 P3_BIV": 0,
  //       "II.7 P1_BOP": 0, "II.7 P3_BIV": 0,
  //       "II.8 P1_BOP": 0, "II.8 P3_BIV": 0
  //     }
  //   },
  //   {
  //     riskCode: 'R17',
  //     variable: 'Pemogokan Pelabuhan',
  //     values: {
  //       "II.1 P1_BOP": 0.01200625, "II.1 P2_Durasi": 0.0192279296875, "II.1 P3_BIV": 0,
  //       "II.2 P1_BOP": 0.01565859375, "II.2 P2_Durasi": 0.0192279296875, "II.2 P3_BIV": 0, "II.2 P4_Panjang Jalur": 0, "II.2 P5_Kecepatan Kapal": 0,
  //       "II.3 P1_BOP": 0, "II.3 P2_Durasi": 0, "II.3 P3_BIV": 0, "II.3 P4_Panjang Jalur": 0,
  //       "II.4 P1_BOP": 0.01433046875, "II.4 P2_Durasi": 0, "II.4 P3_BIV": 0,
  //       "II.5 P1_BOP": 0.01433046875, "II.5 P2_Durasi": 0.01698671875, "II.5 P3_BIV": 0, "II.5 P4_Panjang Jalur": 0, "II.5 P5_Kecepatan Kapal": 0,
  //       "II.6 P1_BOP": 0, "II.6 P3_BIV": 0,
  //       "II.7 P1_BOP": 0, "II.7 P3_BIV": 0,
  //       "II.8 P1_BOP": 0, "II.8 P3_BIV": 0
  //     }
  //   },
  //   {
  //     riskCode: 'R18',
  //     variable: 'Pemeriksaan Karantina Muatan Lambat',
  //     values: {
  //       "II.1 P1_BOP": 0, "II.1 P2_Durasi": 0, "II.1 P3_BIV": 0,
  //       "II.2 P1_BOP": 0.01648125, "II.2 P2_Durasi": 0.022575, "II.2 P3_BIV": 0, "II.2 P4_Panjang Jalur": 0, "II.2 P5_Kecepatan Kapal": 0,
  //       "II.3 P1_BOP": 0, "II.3 P2_Durasi": 0, "II.3 P3_BIV": 0, "II.3 P4_Panjang Jalur": 0,
  //       "II.4 P1_BOP": 0, "II.4 P2_Durasi": 0, "II.4 P3_BIV": 0,
  //       "II.5 P1_BOP": 0.01648125, "II.5 P2_Durasi": 0.01835625, "II.5 P3_BIV": 0, "II.5 P4_Panjang Jalur": 0, "II.5 P5_Kecepatan Kapal": 0,
  //       "II.6 P1_BOP": 0, "II.6 P3_BIV": 0,
  //       "II.7 P1_BOP": 0, "II.7 P3_BIV": 0,
  //       "II.8 P1_BOP": 0, "II.8 P3_BIV": 0
  //     }
  //   },
  //   {
  //     riskCode: 'R19',
  //     variable: 'Proses Bea Cukai Lama',
  //     values: {
  //       "II.1 P1_BOP": 0, "II.1 P2_Durasi": 0, "II.1 P3_BIV": 0,
  //       "II.2 P1_BOP": 0.023663671875, "II.2 P2_Durasi": 0.0255240234375, "II.2 P3_BIV": 0, "II.2 P4_Panjang Jalur": 0, "II.2 P5_Kecepatan Kapal": 0,
  //       "II.3 P1_BOP": 0, "II.3 P2_Durasi": 0, "II.3 P3_BIV": 0, "II.3 P4_Panjang Jalur": 0,
  //       "II.4 P1_BOP": 0, "II.4 P2_Durasi": 0, "II.4 P3_BIV": 0,
  //       "II.5 P1_BOP": 0.0224234375, "II.5 P2_Durasi": 0.023663671875, "II.5 P3_BIV": 0, "II.5 P4_Panjang Jalur": 0, "II.5 P5_Kecepatan Kapal": 0,
  //       "II.6 P1_BOP": 0, "II.6 P3_BIV": 0,
  //       "II.7 P1_BOP": 0, "II.7 P3_BIV": 0,
  //       "II.8 P1_BOP": 0, "II.8 P3_BIV": 0
  //     }
  //   },
  //   {
  //     riskCode: 'R20',
  //     variable: 'Sengketa Pengiriman Pelabuhan',
  //     values: {
  //       "II.1 P1_BOP": 0, "II.1 P2_Durasi": 0, "II.1 P3_BIV": 0,
  //       "II.2 P1_BOP": 0, "II.2 P2_Durasi": 0, "II.2 P3_BIV": 0, "II.2 P4_Panjang Jalur": 0, "II.2 P5_Kecepatan Kapal": 0,
  //       "II.3 P1_BOP": 0, "II.3 P2_Durasi": 0, "II.3 P3_BIV": 0, "II.3 P4_Panjang Jalur": 0,
  //       "II.4 P1_BOP": 0, "II.4 P2_Durasi": 0, "II.4 P3_BIV": 0,
  //       "II.5 P1_BOP": 0, "II.5 P2_Durasi": 0, "II.5 P3_BIV": 0, "II.5 P4_Panjang Jalur": 0, "II.5 P5_Kecepatan Kapal": 0,
  //       "II.6 P1_BOP": 0, "II.6 P3_BIV": 0,
  //       "II.7 P1_BOP": 0, "II.7 P3_BIV": 0,
  //       "II.8 P1_BOP": 0, "II.8 P3_BIV": 0
  //     }
  //   },
  //   {
  //     riskCode: 'R21',
  //     variable: 'Kurang fleksibel jadwal yang disusun',
  //     values: {
  //       "II.1 P1_BOP": 0.0230435546875, "II.1 P2_Durasi": 0.0317251953125, "II.1 P3_BIV": 0,
  //       "II.2 P1_BOP": 0.0242837890625, "II.2 P2_Durasi": 0.0280044921875, "II.2 P3_BIV": 0, "II.2 P4_Panjang Jalur": 0, "II.2 P5_Kecepatan Kapal": 0,
  //       "II.3 P1_BOP": 0, "II.3 P2_Durasi": 0, "II.3 P3_BIV": 0, "II.3 P4_Panjang Jalur": 0,
  //       "II.4 P1_BOP": 0.023663671875, "II.4 P2_Durasi": 0.027384375, "II.4 P3_BIV": 0,
  //       "II.5 P1_BOP": 0.0218033203125, "II.5 P2_Durasi": 0.0242837890625, "II.5 P3_BIV": 0, "II.5 P4_Panjang Jalur": 0, "II.5 P5_Kecepatan Kapal": 0,
  //       "II.6 P1_BOP": 0, "II.6 P3_BIV": 0,
  //       "II.7 P1_BOP": 0, "II.7 P3_BIV": 0,
  //       "II.8 P1_BOP": 0, "II.8 P3_BIV": 0
  //     }
  //   },
  //   {
  //     riskCode: 'R22',
  //     variable: 'Cuaca buruk',
  //     values: {
  //       "II.1 P1_BOP": 0.045800390625, "II.1 P2_Durasi": 0.088030615234375, "II.1 P3_BIV": 0,
  //       "II.2 P1_BOP": 0.059268408203125, "II.2 P2_Durasi": 0.0832369140625, "II.2 P3_BIV": 0, "II.2 P4_Panjang Jalur": 0, "II.2 P5_Kecepatan Kapal": 0,
  //       "II.3 P1_BOP": 0.059268408203125, "II.3 P2_Durasi": 0.08004111328125, "II.3 P3_BIV": 0.084834814453125, "II.3 P4_Panjang Jalur": 0.081639013671875,
  //       "II.4 P1_BOP": 0.065660009765625, "II.4 P2_Durasi": 0.068855810546875, "II.4 P3_BIV": 0,
  //       "II.5 P1_BOP": 0.06086630859375, "II.5 P2_Durasi": 0.072051611328125, "II.5 P3_BIV": 0, "II.5 P4_Panjang Jalur": 0, "II.5 P5_Kecepatan Kapal": 0,
  //       "II.6 P1_BOP": 0, "II.6 P3_BIV": 0,
  //       "II.7 P1_BOP": 0.052876806640625, "II.7 P3_BIV": 0,
  //       "II.8 P1_BOP": 0, "II.8 P3_BIV": 0
  //     }
  //   },
  //   {
  //     riskCode: 'R23',
  //     variable: 'Gempa bumi',
  //     values: {
  //       "II.1 P1_BOP": 0.02345380859375, "II.1 P2_Durasi": 0.03357099609375, "II.1 P3_BIV": 0,
  //       "II.2 P1_BOP": 0.02471845703125, "II.2 P2_Durasi": 0.032938671875, "II.2 P3_BIV": 0, "II.2 P4_Panjang Jalur": 0, "II.2 P5_Kecepatan Kapal": 0,
  //       "II.3 P1_BOP": 0, "II.3 P2_Durasi": 0, "II.3 P3_BIV": 0, "II.3 P4_Panjang Jalur": 0,
  //       "II.4 P1_BOP": 0.0266154296875, "II.4 P2_Durasi": 0.03104169921875, "II.4 P3_BIV": 0,
  //       "II.5 P1_BOP": 0.02724775390625, "II.5 P2_Durasi": 0.02977705078125, "II.5 P3_BIV": 0, "II.5 P4_Panjang Jalur": 0, "II.5 P5_Kecepatan Kapal": 0,
  //       "II.6 P1_BOP": 0.03230634765625, "II.6 P3_BIV": 0,
  //       "II.7 P1_BOP": 0.02851240234375, "II.7 P3_BIV": 0,
  //       "II.8 P1_BOP": 0.027880078125, "II.8 P3_BIV": 0
  //     }
  //   },
  //   {
  //     riskCode: 'R24',
  //     variable: 'Tsunami',
  //     values: {
  //       "II.1 P1_BOP": 0.0209244140625, "II.1 P2_Durasi": 0.0280337890625, "II.1 P3_BIV": 0,
  //       "II.2 P1_BOP": 0.022257421875, "II.2 P2_Durasi": 0.0280337890625, "II.2 P3_BIV": 0, "II.2 P4_Panjang Jalur": 0, "II.2 P5_Kecepatan Kapal": 0,
  //       "II.3 P1_BOP": 0.0227017578125, "II.3 P2_Durasi": 0.027589453125, "II.3 P3_BIV": 0.028478125, "II.3 P4_Panjang Jalur": 0.0262564453125,
  //       "II.4 P1_BOP": 0.0249234375, "II.4 P2_Durasi": 0.02670078125, "II.4 P3_BIV": 0,
  //       "II.5 P1_BOP": 0.0235904296875, "II.5 P2_Durasi": 0.027589453125, "II.5 P3_BIV": 0, "II.5 P4_Panjang Jalur": 0, "II.5 P5_Kecepatan Kapal": 0,
  //       "II.6 P1_BOP": 0.0271451171875, "II.6 P3_BIV": 0,
  //       "II.7 P1_BOP": 0.02314609375, "II.7 P3_BIV": 0,
  //       "II.8 P1_BOP": 0.024034765625, "II.8 P3_BIV": 0
  //     }
  //   },
  //   {
  //     riskCode: 'R25',
  //     variable: 'Kurangnya tenaga terampil',
  //     values: {
  //       "II.1 P1_BOP": 0.017240234375, "II.1 P2_Durasi": 0.023587890625, "II.1 P3_BIV": 0,
  //       "II.2 P1_BOP": 0.019779296875, "II.2 P2_Durasi": 0.023587890625, "II.2 P3_BIV": 0, "II.2 P4_Panjang Jalur": 0, "II.2 P5_Kecepatan Kapal": 0,
  //       "II.3 P1_BOP": 0.024857421875, "II.3 P2_Durasi": 0.022953125, "II.3 P3_BIV": 0, "II.3 P4_Panjang Jalur": 0,
  //       "II.4 P1_BOP": 0.02168359375, "II.4 P2_Durasi": 0.023587890625, "II.4 P3_BIV": 0,
  //       "II.5 P1_BOP": 0.021048828125, "II.5 P2_Durasi": 0.02168359375, "II.5 P3_BIV": 0, "II.5 P4_Panjang Jalur": 0, "II.5 P5_Kecepatan Kapal": 0,
  //       "II.6 P1_BOP": 0.01914453125, "II.6 P3_BIV": 0,
  //       "II.7 P1_BOP": 0.02168359375, "II.7 P3_BIV": 0,
  //       "II.8 P1_BOP": 0.02422265625, "II.8 P3_BIV": 0
  //     }
  //   },
  //   {
  //     riskCode: 'R26',
  //     variable: 'Kurangnya motivasi',
  //     values: {
  //       "II.1 P1_BOP": 0.0160466796875, "II.1 P2_Durasi": 0.0160466796875, "II.1 P3_BIV": 0,
  //       "II.2 P1_BOP": 0.015455859375, "II.2 P2_Durasi": 0.017819140625, "II.2 P3_BIV": 0, "II.2 P4_Panjang Jalur": 0, "II.2 P5_Kecepatan Kapal": 0,
  //       "II.3 P1_BOP": 0.0184099609375, "II.3 P2_Durasi": 0.01900078125, "II.3 P3_BIV": 0, "II.3 P4_Panjang Jalur": 0,
  //       "II.4 P1_BOP": 0.017819140625, "II.4 P2_Durasi": 0.01900078125, "II.4 P3_BIV": 0,
  //       "II.5 P1_BOP": 0.0166375, "II.5 P2_Durasi": 0.0184099609375, "II.5 P3_BIV": 0, "II.5 P4_Panjang Jalur": 0, "II.5 P5_Kecepatan Kapal": 0,
  //       "II.6 P1_BOP": 0, "II.6 P3_BIV": 0,
  //       "II.7 P1_BOP": 0, "II.7 P3_BIV": 0,
  //       "II.8 P1_BOP": 0, "II.8 P3_BIV": 0
  //     }
  //   },
  //   {
  //     riskCode: 'R27',
  //     variable: 'Kesehatan mental pelaut terganggu',
  //     values: {
  //       "II.1 P1_BOP": 0.01737734375, "II.1 P2_Durasi": 0.019105859375, "II.1 P3_BIV": 0,
  //       "II.2 P1_BOP": 0.0185296875, "II.2 P2_Durasi": 0.020258203125, "II.2 P3_BIV": 0, "II.2 P4_Panjang Jalur": 0, "II.2 P5_Kecepatan Kapal": 0,
  //       "II.3 P1_BOP": 0.0185296875, "II.3 P2_Durasi": 0.017953515625, "II.3 P3_BIV": 0, "II.3 P4_Panjang Jalur": 0,
  //       "II.4 P1_BOP": 0.0185296875, "II.4 P2_Durasi": 0.019105859375, "II.4 P3_BIV": 0,
  //       "II.5 P1_BOP": 0.01737734375, "II.5 P2_Durasi": 0.019105859375, "II.5 P3_BIV": 0, "II.5 P4_Panjang Jalur": 0, "II.5 P5_Kecepatan Kapal": 0,
  //       "II.6 P1_BOP": 0, "II.6 P3_BIV": 0,
  //       "II.7 P1_BOP": 0, "II.7 P3_BIV": 0,
  //       "II.8 P1_BOP": 0, "II.8 P3_BIV": 0
  //     }
  //   },
  //   {
  //     riskCode: 'R28',
  //     variable: 'Kesalahan manusia',
  //     values: {
  //       "II.1 P1_BOP": 0.0303474609375, "II.1 P2_Durasi": 0.03550859375, "II.1 P3_BIV": 0,
  //       "II.2 P1_BOP": 0.0362458984375, "II.2 P2_Durasi": 0.03550859375, "II.2 P3_BIV": 0, "II.2 P4_Panjang Jalur": 0, "II.2 P5_Kecepatan Kapal": 0,
  //       "II.3 P1_BOP": 0.0362458984375, "II.3 P2_Durasi": 0.0332966796875, "II.3 P3_BIV": 0, "II.3 P4_Panjang Jalur": 0,
  //       "II.4 P1_BOP": 0.034033984375, "II.4 P2_Durasi": 0.03550859375, "II.4 P3_BIV": 0,
  //       "II.5 P1_BOP": 0.0332966796875, "II.5 P2_Durasi": 0.034033984375, "II.5 P3_BIV": 0, "II.5 P4_Panjang Jalur": 0, "II.5 P5_Kecepatan Kapal": 0,
  //       "II.6 P1_BOP": 0, "II.6 P3_BIV": 0,
  //       "II.7 P1_BOP": 0.0332966796875, "II.7 P3_BIV": 0,
  //       "II.8 P1_BOP": 0.0347712890625, "II.8 P3_BIV": 0
  //     }
  //   },
  //   {
  //     riskCode: 'R29',
  //     variable: 'Kesejahteraan di bawah standar',
  //     values: {
  //       "II.1 P1_BOP": 0.0160437500, "II.1 P2_Durasi": 0.0187, "II.1 P3_BIV": 0,
  //       "II.2 P1_BOP": 0.0193640625, "II.2 P2_Durasi": 0.020028125, "II.2 P3_BIV": 0, "II.2 P4_Panjang Jalur": 0, "II.2 P5_Kecepatan Kapal": 0,
  //       "II.3 P1_BOP": 0.0187, "II.3 P2_Durasi": 0.0193640625, "II.3 P3_BIV": 0, "II.3 P4_Panjang Jalur": 0,
  //       "II.4 P1_BOP": 0.0193640625, "II.4 P2_Durasi": 0.0193640625, "II.4 P3_BIV": 0,
  //       "II.5 P1_BOP": 0.0180359375, "II.5 P2_Durasi": 0.0193640625, "II.5 P3_BIV": 0, "II.5 P4_Panjang Jalur": 0, "II.5 P5_Kecepatan Kapal": 0,
  //       "II.6 P1_BOP": 0.0193640625, "II.6 P3_BIV": 0,
  //       "II.7 P1_BOP": 0.0206921875, "II.7 P3_BIV": 0,
  //       "II.8 P1_BOP": 0, "II.8 P3_BIV": 0
  //     }
  //   },
  //   {
  //     riskCode: 'R30',
  //     variable: 'Keragaman bahasa dan budaya',
  //     values: {
  //       "II.1 P1_BOP": 0, "II.1 P2_Durasi": 0, "II.1 P3_BIV": 0,
  //       "II.2 P1_BOP": 0, "II.2 P2_Durasi": 0, "II.2 P3_BIV": 0, "II.2 P4_Panjang Jalur": 0, "II.2 P5_Kecepatan Kapal": 0,
  //       "II.3 P1_BOP": 0, "II.3 P2_Durasi": 0, "II.3 P3_BIV": 0, "II.3 P4_Panjang Jalur": 0,
  //       "II.4 P1_BOP": 0, "II.4 P2_Durasi": 0, "II.4 P3_BIV": 0,
  //       "II.5 P1_BOP": 0, "II.5 P2_Durasi": 0, "II.5 P3_BIV": 0, "II.5 P4_Panjang Jalur": 0, "II.5 P5_Kecepatan Kapal": 0,
  //       "II.6 P1_BOP": 0, "II.6 P3_BIV": 0,
  //       "II.7 P1_BOP": 0, "II.7 P3_BIV": 0,
  //       "II.8 P1_BOP": 0, "II.8 P3_BIV": 0
  //     }
  //   },
  //   {
  //     riskCode: 'R31',
  //     variable: 'Budaya keselamatan yang buruk',
  //     values: {
  //       "II.1 P1_BOP": 0.027379296875, "II.1 P2_Durasi": 0.0319251953125, "II.1 P3_BIV": 0,
  //       "II.2 P1_BOP": 0.03127578125, "II.2 P2_Durasi": 0.032574609375, "II.2 P3_BIV": 0, "II.2 P4_Panjang Jalur": 0, "II.2 P5_Kecepatan Kapal": 0,
  //       "II.3 P1_BOP": 0.03127578125, "II.3 P2_Durasi": 0.0280287109375, "II.3 P3_BIV": 0, "II.3 P4_Panjang Jalur": 0,
  //       "II.4 P1_BOP": 0.0306263671875, "II.4 P2_Durasi": 0.032574609375, "II.4 P3_BIV": 0,
  //       "II.5 P1_BOP": 0.029976953125, "II.5 P2_Durasi": 0.0306263671875, "II.5 P3_BIV": 0, "II.5 P4_Panjang Jalur": 0, "II.5 P5_Kecepatan Kapal": 0,
  //       "II.6 P1_BOP": 0.0332240234375, "II.6 P3_BIV": 0,
  //       "II.7 P1_BOP": 0.0319251953125, "II.7 P3_BIV": 0,
  //       "II.8 P1_BOP": 0.032574609375, "II.8 P3_BIV": 0
  //     }
  //   },
  //   {
  //     riskCode: 'R32',
  //     variable: 'Tingkat kepemimpinan keselamatan yang rendah',
  //     values: {
  //       "II.1 P1_BOP": 0.0255240234375, "II.1 P2_Durasi": 0.0280044921875, "II.1 P3_BIV": 0,
  //       "II.2 P1_BOP": 0.0292447265625, "II.2 P2_Durasi": 0.0292447265625, "II.2 P3_BIV": 0, "II.2 P4_Panjang Jalur": 0, "II.2 P5_Kecepatan Kapal": 0,
  //       "II.3 P1_BOP": 0.028624609375, "II.3 P2_Durasi": 0.027384375, "II.3 P3_BIV": 0, "II.3 P4_Panjang Jalur": 0,
  //       "II.4 P1_BOP": 0.027384375, "II.4 P2_Durasi": 0.028624609375, "II.4 P3_BIV": 0,
  //       "II.5 P1_BOP": 0.027384375, "II.5 P2_Durasi": 0.027384375, "II.5 P3_BIV": 0, "II.5 P4_Panjang Jalur": 0, "II.5 P5_Kecepatan Kapal": 0,
  //       "II.6 P1_BOP": 0.028624609375, "II.6 P3_BIV": 0,
  //       "II.7 P1_BOP": 0.0280044921875, "II.7 P3_BIV": 0,
  //       "II.8 P1_BOP": 0.0292447265625, "II.8 P3_BIV": 0
  //     }
  //   },
  // ];

  // for (const row of allRows) {
  //   await prisma.riskMatrix.upsert({
  //     where: { riskCode: row.riskCode },
  //     update: { variable: row.variable, values: row.values },
  //     create: row,
  //   });
  // }
  // console.log(`✅ RiskMatrix seeded/updated (${allRows.length} codes with all II.1-II.8 columns)`);

  // ── Jetty & Dolphins Seed ─────────────────────────────
  console.log('🔧 Seeding Jetty & Dolphins data...');

  // 1. Cb Defaults (BS 6349-4 Table 3)
  await prisma.jdCbDefault.deleteMany();
  await prisma.jdCbDefault.createMany({
    data: [
      { shipType: 'LNGC',      cb: 0.70, source: 'BS 6349-4 Table 3 / PIANC' },
      { shipType: 'LNGBV',     cb: 0.72, source: 'BS 6349-4 Table 3 / PIANC' },
      { shipType: 'SPB',       cb: 0.80, source: 'BS 6349-4 Table 3 / PIANC' },
      { shipType: 'Tanker',    cb: 0.80, source: 'BS 6349-4 Table 3 / PIANC' },
      { shipType: 'Container', cb: 0.67, source: 'BS 6349-4 Table 3 / PIANC' },
      { shipType: 'Ro-Ro',     cb: 0.67, source: 'BS 6349-4 Table 3 / PIANC' },
      { shipType: 'Bulk',      cb: 0.78, source: 'BS 6349-4 Table 3 / PIANC' },
    ],
  });
  console.log('✅ Cb Defaults seeded');

  // 2. Berthing Velocity (PIANC 2002 / BS 6349)
  await prisma.jdBerthingVelocity.deleteMany();
  await prisma.jdBerthingVelocity.createMany({
    data: [
      { deltaMin: 0,      deltaMax: 10000,     favMin: 0.16, favMax: 0.20, modMin: 0.30, modMax: 0.45, unfMin: 0.40, unfMax: 0.60 },
      { deltaMin: 10000,  deltaMax: 50000,     favMin: 0.08, favMax: 0.12, modMin: 0.15, modMax: 0.30, unfMin: 0.22, unfMax: 0.45 },
      { deltaMin: 50000,  deltaMax: 100000,    favMin: 0.08, favMax: 0.08, modMin: 0.15, modMax: 0.15, unfMin: 0.20, unfMax: 0.20 },
      { deltaMin: 100000, deltaMax: 999999999, favMin: 0.08, favMax: 0.08, modMin: 0.15, modMax: 0.15, unfMin: 0.20, unfMax: 0.20 },
    ],
  });
  console.log('✅ Berthing Velocity DB seeded');

  // 3. Fender Catalogue
  await prisma.jdFenderCatalog.deleteMany();
  await prisma.jdFenderCatalog.createMany({
    data: [
      { fenderId: 'SH-300x150',         type: 'Shear Fender',                       energyKj: 29.41995,   reactionKn: 294.1995,  deflPct: 40, heightMm: 300,  widthMm: 150,  costIdr: 30000000,       notes: 'Small shear fender; cost approximated' },
      { fenderId: 'CF-1600x800',        type: 'Cylindrical Floating',               energyKj: 490.3325,   reactionKn: 882.5985,  deflPct: 60, heightMm: 1600, widthMm: 800,  costIdr: 215000000,      notes: 'Self-contained floating cell fender' },
      { fenderId: 'End-Air-1600x800',   type: 'Pneumatic End Loaded',               energyKj: 490.3325,   reactionKn: 1470.9975, deflPct: 60, heightMm: 1600, widthMm: 800,  costIdr: 240000000,      notes: 'End-loaded pneumatic fender; cost approximated' },
      { fenderId: 'Arch-1000x500',      type: 'V-shaped',                           energyKj: 588.399,    reactionKn: 1078.7315, deflPct: 57.5, heightMm: 1000, widthMm: 500, costIdr: 185000000,      notes: 'Arch fender (SCN arch type)' },
      { fenderId: 'SHM-1200x600',       type: 'Shear Fender (multi-bonded)',        energyKj: 980.665,    reactionKn: 980.665,   deflPct: 40, heightMm: 1200, widthMm: 600,  costIdr: 150000000,      notes: 'Multi-bonded shear fender; cost approximated' },
      { fenderId: 'HC-2000',            type: 'Hollow Cylindrical',                 energyKj: 1078.7315,  reactionKn: 2059.3965, deflPct: 33, heightMm: 2000, widthMm: 2000, costIdr: 200000000,      notes: 'Approximate cost, corresponds to medium cylindrical fender' },
      { fenderId: 'Cone-1400x700',      type: 'Buckling Column',                    energyKj: 1569.064,   reactionKn: 1765.197,  deflPct: 52.5, heightMm: 1400, widthMm: 700, costIdr: 250000000,     notes: 'Cone or MV-type fender' },
      { fenderId: 'HC-Axl-3000',        type: 'Hollow Cylindrical Axially Loaded',  energyKj: 6864.655,   reactionKn: 5883.99,   deflPct: 33, heightMm: 3000, widthMm: 3000, costIdr: 6400000000,     notes: 'Large hollow cylindrical fender (HC 6865)' },
      { fenderId: 'LP-Air-3200x2400',   type: 'Low Pressure Air Floating',          energyKj: 6864.655,   reactionKn: 10787.315, deflPct: 60, heightMm: 3200, widthMm: 2400, costIdr: 6800000000,     notes: 'Low-pressure pneumatic floating fender' },
      { fenderId: 'HP-Air-3200x2400',   type: 'High Pressure Air Floating',         energyKj: 8335.6525,  reactionKn: 7845.32,   deflPct: 62, heightMm: 3200, widthMm: 2400, costIdr: 7100000000,     notes: 'High-pressure pneumatic fender (HP 6865)' },
      { fenderId: 'Foam-3200x2400',     type: 'Foam Filled',                        energyKj: 16180.9725, reactionKn: 12748.645, deflPct: 65, heightMm: 3200, widthMm: 2400, costIdr: 8000000000,     notes: 'Foam-filled fender; cost approximated' },
    ],
  });
  console.log('✅ Fender Catalogue seeded');

  // 4. Pile Catalogue
  await prisma.jdPileCatalog.deleteMany();
  await prisma.jdPileCatalog.createMany({
    data: [
      { dMm:60.3,  tMm:6.3,  massKgM:8.4,   aMm2:1069,  auM2M:0.19, abMm2:2856,  welCm3:13.1,   mCapKnm:4.6,     iCm4:39.5,     eiKnm2:83,      zKnSm:43.4  },
      { dMm:76.1,  tMm:6.3,  massKgM:10.8,  aMm2:1382,  auM2M:0.24, abMm2:4548,  welCm3:22.3,   mCapKnm:7.8,     iCm4:84.8,     eiKnm2:178,     zKnSm:56.1  },
      { dMm:88.9,  tMm:6.3,  massKgM:12.8,  aMm2:1635,  auM2M:0.28, abMm2:6207,  welCm3:31.6,   mCapKnm:11.1,    iCm4:140.2,    eiKnm2:295,     zKnSm:66.4  },
      { dMm:114.3, tMm:6.3,  massKgM:16.8,  aMm2:2138,  auM2M:0.36, abMm2:10261, welCm3:54.7,   mCapKnm:19.1,    iCm4:312.7,    eiKnm2:657,     zKnSm:86.8  },
      { dMm:114.3, tMm:8,    massKgM:21,    aMm2:2672,  auM2M:0.36, abMm2:10261, welCm3:66.4,   mCapKnm:23.2,    iCm4:379.5,    eiKnm2:797,     zKnSm:108.5 },
      { dMm:139.7, tMm:5,    massKgM:16.6,  aMm2:2116,  auM2M:0.44, abMm2:15328, welCm3:68.8,   mCapKnm:24.1,    iCm4:480.5,    eiKnm2:1009,    zKnSm:85.9  },
      { dMm:139.7, tMm:8,    massKgM:26,    aMm2:3310,  auM2M:0.44, abMm2:15328, welCm3:103.1,  mCapKnm:36.1,    iCm4:720.3,    eiKnm2:1513,    zKnSm:134.4 },
      { dMm:139.7, tMm:10,   massKgM:32,    aMm2:4075,  auM2M:0.44, abMm2:15328, welCm3:123.4,  mCapKnm:43.2,    iCm4:861.9,    eiKnm2:1810,    zKnSm:165.4 },
      { dMm:168.3, tMm:5,    massKgM:20.1,  aMm2:2565,  auM2M:0.53, abMm2:22246, welCm3:101.7,  mCapKnm:35.6,    iCm4:855.8,    eiKnm2:1797,    zKnSm:104.1 },
      { dMm:168.3, tMm:10,   massKgM:39,    aMm2:4973,  auM2M:0.53, abMm2:22246, welCm3:185.9,  mCapKnm:65.1,    iCm4:1564,     eiKnm2:3284,    zKnSm:201.9 },
      { dMm:193.7, tMm:5,    massKgM:23.3,  aMm2:2964,  auM2M:0.69, abMm2:29468, welCm3:136.6,  mCapKnm:47.8,    iCm4:984.1,    eiKnm2:2773,    zKnSm:130.1 },
      { dMm:193.7, tMm:12.5, massKgM:58,    aMm2:7378,  auM2M:0.69, abMm2:29468, welCm3:217.8,  mCapKnm:76.2,    iCm4:2386.1,   eiKnm2:5011,    zKnSm:171   },
      { dMm:219.1, tMm:10,   massKgM:51.6,  aMm2:6569,  auM2M:0.69, abMm2:37703, welCm3:328.5,  mCapKnm:115.0,   iCm4:3598.4,   eiKnm2:7557,    zKnSm:266.7 },
      { dMm:219.1, tMm:12.5, massKgM:63.7,  aMm2:8178,  auM2M:0.69, abMm2:37703, welCm3:396.6,  mCapKnm:138.8,   iCm4:4344.6,   eiKnm2:9124,    zKnSm:329.4 },
      { dMm:219.1, tMm:16,   massKgM:79.6,  aMm2:10508, auM2M:0.69, abMm2:58535, welCm3:344,    mCapKnm:120.4,   iCm4:3796.5,   eiKnm2:8961,    zKnSm:413.5 },
      { dMm:323.9, tMm:12.5, massKgM:96,    aMm2:12229, auM2M:1.02, abMm2:10926, welCm3:916.7,  mCapKnm:320.8,   iCm4:14846.5,  eiKnm2:31178,   zKnSm:496.5 },
      { dMm:355.6, tMm:10,   massKgM:97.8,  aMm2:12453, auM2M:1.28, abMm2:129717,welCm3:1204.5, mCapKnm:421.6,   iCm4:24475.8,  eiKnm2:51399,   zKnSm:505.6 },
      { dMm:406.4, tMm:12.5, massKgM:122,   aMm2:15581, auM2M:1.28, abMm2:160731,welCm3:1491.9, mCapKnm:522.2,   iCm4:32587.2,  eiKnm2:68364,   zKnSm:628.1 },
      { dMm:457,   tMm:10,   massKgM:110.2, aMm2:14424, auM2M:1.44, abMm2:164030,welCm3:1535.7, mCapKnm:537.5,   iCm4:35091.3,  eiKnm2:73962,   zKnSm:570.2 },
      { dMm:457,   tMm:12.5, massKgM:137,   aMm2:17456, auM2M:1.44, abMm2:164030,welCm3:1888.2, mCapKnm:660.9,   iCm4:43144.8,  eiKnm2:90604,   zKnSm:702.4 },
      { dMm:508,   tMm:10,   massKgM:121.6, aMm2:15930, auM2M:1.6,  abMm2:202683,welCm3:1801.2, mCapKnm:630.4,   iCm4:43260.3,  eiKnm2:90851,   zKnSm:635.2 },
      { dMm:508,   tMm:12.5, massKgM:152.7, aMm2:19458, auM2M:1.6,  abMm2:202683,welCm3:2252.6, mCapKnm:788.4,   iCm4:50852,    eiKnm2:108951,  zKnSm:791.5 },
      { dMm:508,   tMm:14.2, massKgM:172.9, aMm2:22029, auM2M:1.6,  abMm2:202683,welCm3:2645.6, mCapKnm:926.0,   iCm4:59125.4,  eiKnm2:125486,  zKnSm:894.4 },
      { dMm:559,   tMm:10,   massKgM:135.4, aMm2:17467, auM2M:1.76, abMm2:245422,welCm3:2255.6, mCapKnm:789.5,   iCm4:65101.5,  eiKnm2:130660,  zKnSm:700.3 },
      { dMm:559,   tMm:12.5, massKgM:169.2, aMm2:21764, auM2M:1.76, abMm2:245422,welCm3:2814.5, mCapKnm:985.1,   iCm4:75365,    eiKnm2:151336,  zKnSm:875.6 },
      { dMm:559,   tMm:14.2, massKgM:191.9, aMm2:24572, auM2M:1.76, abMm2:245422,welCm3:3231.2, mCapKnm:1130.9,  iCm4:84346.4,  eiKnm2:169410,  zKnSm:1005.9},
      { dMm:610,   tMm:10,   massKgM:152.6, aMm2:19689, auM2M:1.92, abMm2:292247,welCm3:2922.4, mCapKnm:1022.8,  iCm4:78361.3,  eiKnm2:157986,  zKnSm:813.4 },
      { dMm:610,   tMm:12.5, massKgM:191,   aMm2:24513, auM2M:1.92, abMm2:292247,welCm3:3654.4, mCapKnm:1279.0,  iCm4:97806.9,  eiKnm2:197262,  zKnSm:1015.2},
      { dMm:610,   tMm:14.2, massKgM:208.6, aMm2:26579, auM2M:1.92, abMm2:292247,welCm3:4320.7, mCapKnm:1512.2,  iCm4:111781.4, eiKnm2:276741,  zKnSm:1212.3},
      { dMm:660,   tMm:12.5, massKgM:199.6, aMm2:25427, auM2M:2.07, abMm2:342119,welCm3:3876.8, mCapKnm:1356.9,  iCm4:107879.9, eiKnm2:226544,  zKnSm:1032.5},
      { dMm:660,   tMm:12.5, massKgM:199.6, aMm2:25427, auM2M:2.07, abMm2:342119,welCm3:4039.6, mCapKnm:1413.9,  iCm4:133306.4, eiKnm2:279944,  zKnSm:1032.4},
      { dMm:660,   tMm:14.2, massKgM:226.2, aMm2:28819, auM2M:2.07, abMm2:342119,welCm3:4553.4, mCapKnm:1593.7,  iCm4:150263.3, eiKnm2:315529,  zKnSm:1168.7},
      { dMm:660,   tMm:16,   massKgM:254.1, aMm2:32371, auM2M:2.07, abMm2:342119,welCm3:5093.4, mCapKnm:1782.7,  iCm4:168077.2, eiKnm2:352942,  zKnSm:1313.8},
      { dMm:711,   tMm:12.5, massKgM:215.3, aMm2:27430, auM2M:2.23, abMm2:397035,welCm3:4707.3, mCapKnm:1647.6,  iCm4:167343.2, eiKnm2:351421,  zKnSm:1113.7},
      { dMm:711,   tMm:14.2, massKgM:244.3, aMm2:31085, auM2M:2.23, abMm2:397035,welCm3:5305.4, mCapKnm:1856.9,  iCm4:188721.2, eiKnm2:396345,  zKnSm:1261.1},
      { dMm:711,   tMm:16,   massKgM:274.3, aMm2:34915, auM2M:2.23, abMm2:397035,welCm3:5908.4, mCapKnm:2067.9,  iCm4:210188.7, eiKnm2:441434,  zKnSm:1418  },
      { dMm:762,   tMm:10,   massKgM:185.5, aMm2:23625, auM2M:2.39, abMm2:456037,welCm3:4383.9, mCapKnm:1534.4,  iCm4:167026.4, eiKnm2:350760,  zKnSm:959.2 },
      { dMm:762,   tMm:12.5, massKgM:231.1, aMm2:29433, auM2M:2.39, abMm2:456037,welCm3:5426,   mCapKnm:1899.1,  iCm4:206731.3, eiKnm2:434150,  zKnSm:1192.2},
      { dMm:762,   tMm:14.2, massKgM:261.8, aMm2:33350, auM2M:2.39, abMm2:456037,welCm3:6121.6, mCapKnm:2142.6,  iCm4:232917.8, eiKnm2:489143,  zKnSm:1347.5},
      { dMm:762,   tMm:16,   massKgM:294.4, aMm2:37498, auM2M:2.39, abMm2:456037,welCm3:6849.7, mCapKnm:2397.4,  iCm4:260973.3, eiKnm2:548044,  zKnSm:1522.5},
      { dMm:813,   tMm:12.5, massKgM:246.8, aMm2:31436, auM2M:2.55, abMm2:519124,welCm3:6192.5, mCapKnm:2167.4,  iCm4:251690,   eiKnm2:528463,  zKnSm:1270.8},
      { dMm:813,   tMm:14.2, massKgM:279.7, aMm2:35626, auM2M:2.55, abMm2:519124,welCm3:6983.3, mCapKnm:2444.2,  iCm4:284015.6, eiKnm2:596391,  zKnSm:1442.8},
      { dMm:813,   tMm:16,   massKgM:314.5, aMm2:40062, auM2M:2.55, abMm2:519124,welCm3:7828.3, mCapKnm:2739.9,  iCm4:318221.7, eiKnm2:668266,  zKnSm:1626.6},
      { dMm:914,   tMm:16,   massKgM:352.4, aMm2:44956, auM2M:2.87, abMm2:656119,welCm3:8741.1, mCapKnm:3059.4,  iCm4:399390.8, eiKnm2:838740,  zKnSm:1815.8},
      { dMm:914,   tMm:12.5, massKgM:277.9, aMm2:35402, auM2M:2.87, abMm2:656119,welCm3:6980.2, mCapKnm:2443.1,  iCm4:290155.2, eiKnm2:609358,  zKnSm:1437  },
      { dMm:914,   tMm:12.5, massKgM:277.9, aMm2:35402, auM2M:2.87, abMm2:656119,welCm3:7871.1, mCapKnm:2754.9,  iCm4:359708.4, eiKnm2:755388,  zKnSm:1437.4},
      { dMm:914,   tMm:14.2, massKgM:315,   aMm2:40127, auM2M:2.87, abMm2:656119,welCm3:8875.4, mCapKnm:3106.4,  iCm4:405771.5, eiKnm2:852193,  zKnSm:1621.1},
      { dMm:1016,  tMm:10,   massKgM:248.1, aMm2:31604, auM2M:3.19, abMm2:810732,welCm3:7871.1, mCapKnm:2754.9,  iCm4:399849.7, eiKnm2:839684,  zKnSm:1283.2},
      { dMm:1016,  tMm:12.5, massKgM:309.4, aMm2:39426, auM2M:3.19, abMm2:810732,welCm3:9765.8, mCapKnm:3418.0,  iCm4:496128.7, eiKnm2:1041860, zKnSm:1594.8},
      { dMm:1016,  tMm:14.2, massKgM:350.8, aMm2:44691, auM2M:3.19, abMm2:810732,welCm3:11023,  mCapKnm:3858.3,  iCm4:560479.9, eiKnm2:1176953, zKnSm:1801  },
      { dMm:1016,  tMm:16,   massKgM:394.6, aMm2:50266, auM2M:3.19, abMm2:810732,welCm3:12371.6,mCapKnm:4330.1,  iCm4:628479.4, eiKnm2:1319807, zKnSm:2040.9},
      { dMm:1016,  tMm:18,   massKgM:441.8, aMm2:56289, auM2M:3.19, abMm2:810732,welCm3:13802.7,mCapKnm:4830.9,  iCm4:700954,   eiKnm2:1471948, zKnSm:2281.8},
      { dMm:1220,  tMm:12.5, massKgM:368.4, aMm2:46918, auM2M:3.83, abMm2:1168987,welCm3:14025.6,mCapKnm:4909.0, iCm4:855228.3, eiKnm2:1795326, zKnSm:1933.9},
      { dMm:1220,  tMm:14.2, massKgM:422.1, aMm2:53792, auM2M:3.83, abMm2:1168987,welCm3:16028.9,mCapKnm:5610.1, iCm4:977864.6, eiKnm2:1815086, zKnSm:1925.3},
      { dMm:1220,  tMm:12.5, massKgM:372.2, aMm2:47418, auM2M:3.83, abMm2:1168987,welCm3:16028.9,mCapKnm:5610.1, iCm4:977864.6, eiKnm2:2053426, zKnSm:2196.1},
      { dMm:1220,  tMm:16,   massKgM:477.2, aMm2:60838, auM2M:3.83, abMm2:1168987,welCm3:17991.1,mCapKnm:6296.9, iCm4:1098843.3,eiKnm2:2303226, zKnSm:1925.2},
      { dMm:1220,  tMm:18,   massKgM:533.6, aMm2:67972, auM2M:3.83, abMm2:1168987,welCm3:20128.6,mCapKnm:7045.0, iCm4:1228057,  eiKnm2:2578857, zKnSm:1857.8},
    ],
  });
  console.log('✅ Pile Catalogue seeded');

  // 5. QRH Catalogue
  await prisma.jdQrhCatalog.deleteMany();
  await prisma.jdQrhCatalog.createMany({
    data: [
      { classSwlKn: 400,  swlTon: 40.8,  proofFactor: 1.5, costIdr: 234000000,  typeSupplier: 'Single hook', supplier: 'Tiongkok', tahun: 2024 },
      { classSwlKn: 600,  swlTon: 61.2,  proofFactor: 1.5, costIdr: 273000000,  typeSupplier: 'Single hook', supplier: 'Tiongkok', tahun: 2024 },
      { classSwlKn: 800,  swlTon: 81.6,  proofFactor: 1.5, costIdr: 312000000,  typeSupplier: 'Single hook', supplier: 'Tiongkok', tahun: 2024 },
      { classSwlKn: 1000, swlTon: 102,   proofFactor: 1.5, costIdr: 390000000,  typeSupplier: 'Single hook', supplier: 'Tiongkok', tahun: 2024 },
      { classSwlKn: 1200, swlTon: 122.4, proofFactor: 1.5, costIdr: 437000000,  typeSupplier: 'Single hook', supplier: 'Tiongkok', tahun: 2024 },
      { classSwlKn: 1500, swlTon: 153,   proofFactor: 1.5, costIdr: 468000000,  typeSupplier: 'Single hook', supplier: 'Europe',   tahun: 2024 },
      { classSwlKn: 2000, swlTon: 204,   proofFactor: 1.5, costIdr: 546000000,  typeSupplier: 'Double hook', supplier: 'Europe',   tahun: 2024 },
    ],
  });
  console.log('✅ QRH Catalogue seeded');

  // 6. Unit Rates (CAPEX items)
  await prisma.jdUnitRate.deleteMany();
  await prisma.jdUnitRate.createMany({
    data: [
      { rateId: 'STR-001', item: 'Steel Pipe Pile — Material + Fabrikasi + Coating',     rateIdr: 19620000,        unit: 'IDR/ton',  tahun: 2024 },
      { rateId: 'STR-002', item: 'Jasa Pemancangan (Barge + Hydraulic Hammer)',           rateIdr: 5962000,         unit: 'IDR/ton',  tahun: 2024 },
      { rateId: 'STR-003', item: 'Beton K350/C28 — Material (Ready Mix)',                 rateIdr: 4457000,         unit: 'IDR/m³',   tahun: 2024 },
      { rateId: 'STR-004', item: 'Pekerjaan Beton (Bekisting + Cor + Curing)',            rateIdr: 3200000,         unit: 'IDR/m³',   tahun: 2024 },
      { rateId: 'STR-005', item: 'Rebar BJTS 420 — Supply + Install',                    rateIdr: 18500000,        unit: 'IDR/ton',  tahun: 2024 },
      { rateId: 'STR-006', item: 'Guardrail Safety incl Support (Galv A36)',              rateIdr: 222420,          unit: 'IDR/m',    tahun: 2024 },
      { rateId: 'STR-007', item: 'Cathodic Protection — Al-Zn Bracelet Anode',            rateIdr: 18955200,        unit: 'IDR/unit', tahun: 2024 },
      { rateId: 'STR-008', item: 'Infill Pile Head Concrete (Grout/C35)',                 rateIdr: 7344000,         unit: 'IDR/m³',   tahun: 2024 },
      { rateId: 'STR-009', item: 'Pilecap Concrete Insitu (C35)',                         rateIdr: 4456408,         unit: 'IDR/m³',   tahun: 2024 },
      { rateId: 'STR-010', item: 'Splash Zone Protection (HDPE wrap)',                    rateIdr: 1500000,         unit: 'IDR/m',    tahun: 2024 },
      { rateId: 'STR-011', item: 'Corner Protection ASTM A36',                            rateIdr: 2500000,         unit: 'IDR/m',    tahun: 2024 },
      { rateId: 'STR-012', item: 'Pemasangan Handrail',                                   rateIdr: 500000,          unit: 'IDR/m',    tahun: 2024 },
      { rateId: 'STR-013', item: 'PDA Test per Pile',                                     rateIdr: 8500000,         unit: 'IDR/test', tahun: 2024 },
      { rateId: 'STR-014', item: 'Insitu Pilecap / Formwork',                             rateIdr: 850000,          unit: 'IDR/m²',   tahun: 2024 },
      { rateId: 'STR-015', item: 'Infill Pile Head Formwork (circular)',                   rateIdr: 1200000,         unit: 'IDR/unit', tahun: 2024 },
      { rateId: 'GEN-001', item: 'Mob-Demob Barge 180ft + Tugboat + Crane',               rateIdr: 1093350000,      unit: 'IDR/Ls',   tahun: 2024 },
      { rateId: 'GEN-002', item: 'Sewa Barge + Tugboat + Crane (Bulanan)',                rateIdr: 500000000,       unit: 'IDR/bln',  tahun: 2024 },
      { rateId: 'GEN-003', item: 'Survey Batimetri & Topografi',                          rateIdr: 29000000,        unit: 'IDR/Ls',   tahun: 2024 },
      { rateId: 'GEN-004', item: 'Perizinan & AMDAL',                                     rateIdr: 800000000,       unit: 'IDR/Ls',   tahun: 2024 },
      { rateId: 'GEN-005', item: 'Temporary access road / jembatan sementara',            rateIdr: 1093350000,      unit: 'IDR/Ls',   tahun: 2024 },
      { rateId: 'GEN-006', item: 'Kantor Proyek / Direksi Keet',                          rateIdr: 3814977,         unit: 'IDR/m²',   tahun: 2024 },
      { rateId: 'GEN-007', item: 'Operasional Kantor Proyek',                             rateIdr: 40750000,        unit: 'IDR/bln',  tahun: 2024 },
      { rateId: 'GEN-008', item: 'Papan Nama Proyek',                                     rateIdr: 549148,          unit: 'IDR/unit', tahun: 2024 },
      { rateId: 'GEN-009', item: 'Stockyard Construction',                                rateIdr: 250000,          unit: 'IDR/m²',   tahun: 2024 },
      { rateId: 'GEN-010', item: 'Fabrication Yard Construction',                          rateIdr: 300000,          unit: 'IDR/m²',   tahun: 2024 },
      { rateId: 'GEN-011', item: 'Radio / Alat Komunikasi',                               rateIdr: 299950,          unit: 'IDR/unit', tahun: 2024 },
      { rateId: 'GEN-012', item: 'Accommodation During Project (Mess + LV + Meal)',        rateIdr: 45000000,        unit: 'IDR/bln',  tahun: 2024 },
      { rateId: 'GEN-013', item: 'Penyediaan Air Bersih (water supply)',                  rateIdr: 8500000,         unit: 'IDR/bln',  tahun: 2024 },
      { rateId: 'GEN-014', item: 'Penyediaan Listrik / Genset Rental',                    rateIdr: 15000000,        unit: 'IDR/bln',  tahun: 2024 },
      { rateId: 'GEN-015', item: 'Safety Tools, Equipment & Document',                    rateIdr: 35000000,        unit: 'IDR/Ls',   tahun: 2024 },
      { rateId: 'MGT-001', item: 'Project Manager',                                       rateIdr: 46700000,        unit: 'IDR/bln',  tahun: 2024 },
      { rateId: 'MGT-002', item: 'Civil/Marine/Mechanical Engineer',                       rateIdr: 41850000,        unit: 'IDR/bln',  tahun: 2024 },
      { rateId: 'MGT-003', item: 'HSSE Officer',                                          rateIdr: 41850000,        unit: 'IDR/bln',  tahun: 2024 },
      { rateId: 'MGT-004', item: 'QA/QC Engineer',                                        rateIdr: 46700000,        unit: 'IDR/bln',  tahun: 2024 },
      { rateId: 'MGT-005', item: 'Site/Construction Manager',                             rateIdr: 46700000,        unit: 'IDR/bln',  tahun: 2024 },
      { rateId: 'MGT-006', item: 'Planning Engineer / Scheduler',                         rateIdr: 41850000,        unit: 'IDR/bln',  tahun: 2024 },
      { rateId: 'MGT-007', item: 'Cost Control Engineer',                                 rateIdr: 33750000,        unit: 'IDR/bln',  tahun: 2024 },
      { rateId: 'MGT-008', item: 'Document Controller',                                   rateIdr: 33750000,        unit: 'IDR/bln',  tahun: 2024 },
      { rateId: 'MEP-001', item: 'Emergency Ladder incl Timber Fender',                   rateIdr: 111394084,       unit: 'IDR/unit', tahun: 2024 },
      { rateId: 'MEP-002', item: 'Navigation Aid incl Support',                           rateIdr: 2635442063,      unit: 'IDR/unit', tahun: 2024 },
      { rateId: 'MEP-003', item: 'Docking speed sensor including support',                rateIdr: 78087270,        unit: 'IDR/unit', tahun: 2024 },
      { rateId: 'MEP-004', item: 'Long range laser sensor including support',             rateIdr: 78087270,        unit: 'IDR/unit', tahun: 2024 },
      { rateId: 'MEP-005', item: 'Wave and tide laser including support',                 rateIdr: 78087270,        unit: 'IDR/unit', tahun: 2024 },
      { rateId: 'MEP-006', item: 'Loading Arm incl Support & Bolts',                      rateIdr: 1952179306,      unit: 'IDR/unit', tahun: 2024 },
      { rateId: 'MEP-007', item: 'Fire Monitor incl Support & Bolts',                     rateIdr: 1626816219,      unit: 'IDR/unit', tahun: 2024 },
      { rateId: 'MEP-008', item: 'Flood Light incl Support & Bolts',                      rateIdr: 1626816219,      unit: 'IDR/unit', tahun: 2024 },
      { rateId: 'MEP-009', item: 'Service Building incl Foundation',                      rateIdr: 81340869,        unit: 'IDR/unit', tahun: 2024 },
      { rateId: 'MEP-010', item: 'Marine Buoy (mooring/navigation)',                      rateIdr: 1054176825,      unit: 'IDR/unit', tahun: 2024 },
      { rateId: 'MEP-011', item: 'Catwalk Structure',                                     rateIdr: 7182832385,      unit: 'IDR/unit', tahun: 2024 },
      { rateId: 'MEP-012', item: 'Bearing Pad incl Support',                              rateIdr: 1800000,         unit: 'IDR/unit', tahun: 2024 },
      { rateId: 'EQP-FENDER', item: 'Fender (from catalog selection)',                    rateIdr: 0,               unit: 'IDR/unit', keterangan: 'Rate from JdFenderCatalog', tahun: 2024 },
      { rateId: 'EQP-QRH',    item: 'QRH (from catalog selection)',                       rateIdr: 0,               unit: 'IDR/unit', keterangan: 'Rate from JdQrhCatalog',    tahun: 2024 },
    ],
  });
  console.log('✅ Unit Rates seeded');

  // 7. Settings
  await prisma.jdSetting.deleteMany();
  await prisma.jdSetting.createMany({
    data: [
      { key: 'gamma_e',           value: 1.1,   unit: '−', notes: 'Safety factor Edesign = γ × Eeff (BS 6349 §4.7.1)' },
      { key: 'util_limit',        value: 0.9,   unit: '−', notes: 'Utilisation limit fender' },
      { key: 'n_eff_default',     value: 1,     unit: '−', notes: 'Default n_eff' },
      { key: 'lpp_ratio',         value: 0.97,  unit: '−', notes: 'Lpp = LOA × ratio' },
      { key: 'r_over_l_default',  value: 0.25,  unit: '−', notes: 'R = ratio × L_used (PIANC: 0.2–0.3)' },
      { key: 'g_default_tug_YES', value: 3,     unit: 'deg', notes: 'Default angle if tug assist' },
      { key: 'g_default_tug_NO',  value: 10,    unit: 'deg', notes: 'Default angle if no tug' },
      { key: 'cs_rubber',         value: 0.9,   unit: '−', notes: 'BS 6349-4 §4.7.4 — rubber fender' },
      { key: 'cs_other',          value: 1,     unit: '−', notes: 'BS 6349-4 §4.7.4 — non-rubber' },
      { key: 'cc_open_piled',     value: 1,     unit: '−', notes: 'BS 6349-4 §4.7.5 — open piled' },
      { key: 'cc_solid_quay',     value: 0.9,   unit: '−', notes: 'BS 6349-4 §4.7.5 — solid quay' },
      { key: 'freeboard_default', value: 8,     unit: 'm', notes: 'Default freeboard' },
      { key: 'knots_to_ms',       value: 0.5144, unit: '−',       notes: '1 knot = 0.5144 m/s' },
      { key: 'rho_air',           value: 1.23,   unit: 'kg/m³',   notes: 'Density udara' },
      { key: 'rho_water',         value: 1025,   unit: 'kg/m³',   notes: 'Density air laut' },
      { key: 'cd_wind',           value: 1.3,    unit: '−',       notes: 'Drag coeff wind (OCIMF LNG)' },
      { key: 'cd_current',        value: 0.7,    unit: '−',       notes: 'Drag coeff current' },
      { key: 'sf_qrh',            value: 1.35,   unit: '−',       notes: 'Safety factor SWL_req = SF × T_line' },
      { key: 'n_lines_default',   value: 4,      unit: '−',       notes: 'Default mooring lines' },
      { key: 'k_wave_sheltered',  value: 0.5,    unit: 'kN/(m²·m)' },
      { key: 'k_wave_moderate',   value: 1,      unit: 'kN/(m²·m)' },
      { key: 'k_wave_exposed',    value: 2,      unit: 'kN/(m²·m)' },
      { key: 'fy_pile',           value: 350,    unit: 'MPa' },
      { key: 'eta_group',         value: 1,      unit: '−' },
      { key: 'segment_length',    value: 12,     unit: 'm' },
      { key: 'scour_allowance',   value: 1,      unit: 'm' },
      { key: 'tol_driving',       value: 0.5,    unit: 'm' },
      { key: 'pilecap_vol_per_pile', value: 0.8, unit: 'm³/pile' },
      { key: 'pilecap_thk',       value: 2,      unit: 'm' },
      { key: 'slab_thk',          value: 0.2,    unit: 'm' },
      { key: 'rho_v_pilecap',     value: 0.02,   unit: 'm³/m³' },
      { key: 'rho_v_slab',        value: 0.01,   unit: 'm³/m³' },
      { key: 'rebar_density',     value: 7.85,   unit: 'ton/m³' },
      { key: 'infill_depth',      value: 1.5,    unit: 'm' },
      { key: 'anode_per_pile',    value: 1,       unit: 'unit/pile' },
      { key: 'guardrail_bd_perim',value: 2,       unit: 'm/m_side' },
      { key: 'guardrail_trestle', value: 2,       unit: 'm/m' },
      { key: 'jumlah_qrh_per_md', value: 2,       unit: 'unit' },
      { key: 'panjang_sisi_bd',   value: 10,      unit: 'm' },
      { key: 'panjang_sisi_md',   value: 7,       unit: 'm' },
      { key: 'rate_epc',          value: 0.10,   unit: 'fraction', notes: 'EPC/DED fee = 10% of direct cost' },
      { key: 'rate_pmc',          value: 0.03,   unit: 'fraction', notes: 'PMC = 3% of grand total' },
      { key: 'lng_density',       value: 0.46,   unit: 'ton/m³' },
      { key: 'dwt_cargo_ratio',   value: 1.05,   unit: '−' },
      { key: 'lightship_fraction',value: 0.18,   unit: '−' },
      { key: 'precast_rebar_ratio', value: 0.016, unit: 'm³/m³' },
      { key: 'insitu_rebar_ratio',  value: 0.02,  unit: 'm³/m³' },
      { key: 'formwork_factor_slab', value: 2,    unit: 'm²/m³' },
      { key: 'formwork_factor_beam', value: 4.5,  unit: 'm²/m³' },
      { key: 'formwork_factor_cap',  value: 3.5,  unit: 'm²/m³' },
      { key: 'jh_beam_depth',    value: 0.8,  unit: 'm' },
      { key: 'jh_beam_width',    value: 1.2,  unit: 'm' },
      { key: 'jh_beam_spacing',  value: 3,    unit: 'm' },
      { key: 'jh_slab_thk',     value: 0.2,  unit: 'm' },
      { key: 'jh_pilecap_thk',  value: 1.2,  unit: 'm' },
      { key: 'jh_pilecap_width', value: 5,   unit: 'm' },
    ],
  });
  console.log('✅ Settings seeded');

  console.log('🎉 All Jetty & Dolphins seed data completed!');

  console.log("Seeding completed successfully!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
