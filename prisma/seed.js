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
  console.log("Seeding completed successfully!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
