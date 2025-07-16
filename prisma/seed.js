const prisma = require("../config/db");
const bcrypt = require("bcrypt");

async function main() {
  const hashedAdmin = await bcrypt.hash("admin123", 10);
  const hashedUser1 = await bcrypt.hash("user123", 10);
  const hashedUser2 = await bcrypt.hash("user456", 10);

  // Admin seed
  await prisma.user.upsert({
    where: { email: "admin@admin.com" },
    update: {},
    create: {
      username: "admin",
      email: "admin@admin.com",
      password: hashedAdmin,
      role: "admin",
    },
  });

  // User 1 seed
  await prisma.user.upsert({
    where: { email: "user1@example.com" },
    update: {},
    create: {
      username: "user1",
      email: "user1@example.com",
      password: hashedUser1,
      role: "user",
    },
  });

  // User 2 seed
  await prisma.user.upsert({
    where: { email: "user2@example.com" },
    update: {},
    create: {
      username: "user2",
      email: "user2@example.com",
      password: hashedUser2,
      role: "user",
    },
  });

  console.log("✅ Admin & Users seeded");

  await prisma.project.createMany({
    data: [
      {
        id: 100,
        name: "FSRU Lampung",
        jenis: "FSRU",
        kategori: "Big Scale FSRU > 150.000 m³",
        lokasi: "Jawa Timur",
        tahun: 2023,
        levelAACE: 2,
        harga: 5000000000,
        satuan: "m³ / MMSCFD",
      },
      {
        id: 101,
        name: "Small LNG Plant Bau Bau",
        jenis: "LNG Plant",
        kategori: "Small-Scale Liquefaction Plant (100 - 800 TPD)",
        lokasi: "Sulawesi",
        tahun: 2020,
        levelAACE: 5,
        harga: 3000000000,
        satuan: "MTPA",
      },
      {
        id: 102,
        name: "LNGC Papua",
        jenis: "LNGC",
        kategori: "Big Scale LNGC > 100.000 m³",
        lokasi: "Kepulauan Riau",
        tahun: 2023,
        levelAACE: 2,
        harga: 7000000000,
        satuan: "m³",
      },
    ],
    skipDuplicates: true,
  });

  await prisma.unitPrice.create({
    data: {
      uraian: "Project Management LNGC",
      specification: "Manajemen proyek LNGC Papua", // tambahkan string
      qty: 1,
      satuan: "Ls",
      hargaSatuan: 3500000000,
      totalHarga: 3500000000,
      aaceClass: 2,
      accuracyLow: -15,
      accuracyHigh: 20,
      tahun: 2023,
      infrastruktur: "Big Scale LNGC > 100.000 m³",
      volume: 125000,
      satuanVolume: "m³",
      kapasitasRegasifikasi: 0,
      satuanKapasitas: "",
      kelompok: "PROJECT MANAGEMENT DAN PEKERJAAN PERSIAPAN",
      kelompokDetail: "",
      proyek: "LNGC Papua",
      lokasi: "Kepulauan Riau",
      tipe: "LNGC",
      kategori: "Material Konstruksi",
    },
  });

  await prisma.constructionCost.create({
    data: {
      uraian: "Project Management",
      specification: "Project Management untuk FSRU Lampung",
      qty: 1,
      satuan: "Ls",
      hargaSatuan: 1154296598,
      totalHarga: 1154296598,
      aaceClass: 2,
      accuracyLow: -15,
      accuracyHigh: 20,
      tahun: 2023,
      infrastruktur: "Big Scale FSRU",
      volume: 200000,
      satuanVolume: "m³",
      kapasitasRegasifikasi: 250,
      satuanKapasitas: "MMSCFD",
      kelompok: "PROJECT MANAGEMENT DAN PEKERJAAN PERSIAPAN",
      kelompokDetail: "",
      lokasi: "Jawa Timur",
      tipe: "FSRU",
      projectId: 100,
    },
  });

  console.log("✅ Projects, Unit Prices, and Construction Costs seeded");

  const cciData = [
    { kodeProvinsi: 11, provinsi: "Aceh", cci: 96.61 },
    { kodeProvinsi: 12, provinsi: "Sumatera Utara", cci: 97.45 },
    { kodeProvinsi: 13, provinsi: "Sumatera Barat", cci: 93.06 },
    { kodeProvinsi: 14, provinsi: "Riau", cci: 96.1 },
    { kodeProvinsi: 15, provinsi: "Jambi", cci: 95.32 },
    { kodeProvinsi: 16, provinsi: "Sumatera Selatan", cci: 90.62 },
    { kodeProvinsi: 17, provinsi: "Bengkulu", cci: 94.2 },
    { kodeProvinsi: 18, provinsi: "Lampung", cci: 89.12 },
    { kodeProvinsi: 19, provinsi: "Kepulauan Bangka Belitung", cci: 105.37 },
    { kodeProvinsi: 21, provinsi: "Kepulauan Riau", cci: 111.94 },
    { kodeProvinsi: 31, provinsi: "Dki Jakarta", cci: 114.79 },
    { kodeProvinsi: 32, provinsi: "Jawa Barat", cci: 105.3 },
    { kodeProvinsi: 33, provinsi: "Jawa Tengah", cci: 102.08 },
    { kodeProvinsi: 34, provinsi: "Di Yogyakarta", cci: 104.88 },
    { kodeProvinsi: 35, provinsi: "Jawa Timur", cci: 96.29 },
    { kodeProvinsi: 36, provinsi: "Banten", cci: 94.18 },
    { kodeProvinsi: 51, provinsi: "Bali", cci: 107.46 },
    { kodeProvinsi: 52, provinsi: "Nusa Tenggara Barat", cci: 104.09 },
    { kodeProvinsi: 53, provinsi: "Nusa Tenggara Timur", cci: 92.42 },
    { kodeProvinsi: 61, provinsi: "Kalimantan Barat", cci: 107.34 },
    { kodeProvinsi: 62, provinsi: "Kalimantan Tengah", cci: 106.56 },
    { kodeProvinsi: 63, provinsi: "Kalimantan Selatan", cci: 100.7 },
    { kodeProvinsi: 64, provinsi: "Kalimantan Timur", cci: 118.3 },
    { kodeProvinsi: 65, provinsi: "Kalimantan Utara", cci: 107.52 },
    { kodeProvinsi: 71, provinsi: "Sulawesi Utara", cci: 100.77 },
    { kodeProvinsi: 72, provinsi: "Sulawesi Tengah", cci: 91.82 },
    { kodeProvinsi: 73, provinsi: "Sulawesi Selatan", cci: 95.91 },
    { kodeProvinsi: 74, provinsi: "Sulawesi Tenggara", cci: 94.71 },
    { kodeProvinsi: 75, provinsi: "Gorontalo", cci: 96.51 },
    { kodeProvinsi: 76, provinsi: "Sulawesi Barat", cci: 91.63 },
    { kodeProvinsi: 81, provinsi: "Maluku", cci: 106.52 },
    { kodeProvinsi: 82, provinsi: "Maluku Utara", cci: 114.09 },
    { kodeProvinsi: 91, provinsi: "Papua Barat", cci: 124.71 },
    { kodeProvinsi: 92, provinsi: "Papua Barat Daya", cci: 122.21 },
    { kodeProvinsi: 94, provinsi: "Papua", cci: 134.96 },
    { kodeProvinsi: 95, provinsi: "Papua Selatan", cci: 142.98 },
    { kodeProvinsi: 96, provinsi: "Papua Tengah", cci: 209.28 },
    { kodeProvinsi: 97, provinsi: "Papua Pegunungan", cci: 249.12 },
  ];

  for (const cci of cciData) {
    await prisma.cci.create({ data: cci });
  }

  console.log("✅ CCI data seeded");
  console.log("Seeding completed successfully!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
