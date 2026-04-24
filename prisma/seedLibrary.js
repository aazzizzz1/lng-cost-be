/**
 * seedLibrary.js — seeds InfraLibrary (unified single table).
 *
 * Run:  node prisma/seedLibrary.js
 *
 * Images are uploaded separately via POST /api/library/:id/drawings.
 * Drawing entries are seeded with null imageUrl as placeholders.
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

/**
 * Catalog data ported from the frontend Redux slice.
 * Structure: { [categoryCode]: { name, items: { [variantKey]: { label, params, drawings } } } }
 */
const CATALOG = {
  LNGBV: {
    name: 'LNG Bunkering Vessel',
    description: 'Small-to-medium LNG vessels used for ship-to-ship bunkering operations.',
    items: {
      '5000': {
        label: 'LNGBV 5,000 m³',
        params: {
          'Main Dimension': {
            'Length Over All (LOA)': '99.90 M',
            'Breadth (B)': '18 M',
            'Draught (T)': '4.10 M',
            'Deadweight (DWT)': '- TON',
          },
          'Cargo Tank': { Type: 'CIRCULAR', Capacity: '5,000 m³', Quantity: '2 PCS' },
          'Propeller Type': 'CPP',
        },
        drawings: [{ drawKey: 'ga', title: 'General Arrangement — LNGBV 5,000 m³', order: 0 }],
      },
      '10000': {
        label: 'LNGBV 10,000 m³',
        params: {
          'Main Dimension': {
            'Length Over All (LOA)': '124.7 M',
            'Breadth (B)': '21.8 M',
            'Draught (T)': '5.6 M',
            'Deadweight (DWT)': '- TON',
          },
          'Cargo Tank': { Type: 'CIRCULAR', Capacity: '10,000 m³', Quantity: '2 PCS' },
          'Propeller Type': 'CPP',
        },
        drawings: [{ drawKey: 'ga', title: 'General Arrangement — LNGBV 10,000 m³', order: 0 }],
      },
      '15000': {
        label: 'LNGBV 15,000 m³',
        params: {
          'Main Dimension': {
            'Length Over All (LOA)': '155.5 M',
            'Breadth (B)': '22 M',
            'Draught (T)': '8.40 M',
            'Deadweight (DWT)': '- TON',
          },
          'Cargo Tank': { Type: 'CIRCULAR', Capacity: '15,000 m³', Quantity: '2 PCS' },
          'Propeller Type': 'CPP',
        },
        drawings: [{ drawKey: 'ga', title: 'General Arrangement — LNGBV 15,000 m³', order: 0 }],
      },
    },
  },

  LNGC: {
    name: 'LNG Carrier',
    description: 'Medium-scale LNG carrier vessels for regional distribution.',
    items: {
      '18000': {
        label: 'LNG Carrier 18,000 m³',
        params: {
          'Main Dimension': {
            'Length Over All (LOA)': '143 M',
            'Breadth (B)': '25.2 M',
            'Draught (T)': '6.6 M',
            'Deadweight (DWT)': '- TON',
          },
          'Cargo Tank': { Type: 'CIRCULAR', Capacity: '18,000 m³', Quantity: '2 PCS' },
          'Propeller Type': 'CPP',
        },
        drawings: [{ drawKey: 'ga', title: 'General Arrangement — LNGC 18,000 m³', order: 0 }],
      },
      '20000': {
        label: 'LNG Carrier 20,000 m³',
        params: {
          'Main Dimension': {
            'Length Over All (LOA)': '159.9 M',
            'Breadth (B)': '24 M',
            'Draught (T)': '8 M',
            'Deadweight (DWT)': '- TON',
          },
          'Cargo Tank': { Type: 'CIRCULAR', Capacity: '20,000 m³', Quantity: '3 PCS' },
          'Propeller Type': 'CPP',
        },
        drawings: [{ drawKey: 'ga', title: 'General Arrangement — LNGC 20,000 m³', order: 0 }],
      },
    },
  },

  SPB: {
    name: 'Self-Propelled Barge',
    description: 'Self-propelled LNG barges for shallow-water distribution.',
    items: {
      '1200': {
        label: 'Self-Propelled Barge 1,200 m³',
        params: {
          'Main Dimension': {
            'Length Over All (LOA)': '66.80 M',
            'Breadth (B)': '15 M',
            'Draught (T)': '3 M',
            'Deadweight (DWT)': '800 TON',
          },
          'Cargo Tank': { Type: 'CIRCULAR', Capacity: '1,200 m³', Quantity: '3 PCS' },
          'Propeller Type': 'FPP',
        },
        drawings: [{ drawKey: 'ga', title: 'General Arrangement — SPB 1,200 m³', order: 0 }],
      },
      '4000': {
        label: 'Self-Propelled Barge 4,000 m³',
        params: {
          'Main Dimension': {
            'Length Over All (LOA)': '75.70 M',
            'Breadth (B)': '20 M',
            'Draught (T)': '3 M',
            'Deadweight (DWT)': '2,300 TON',
          },
          'Cargo Tank': { Type: 'CIRCULAR', Capacity: '4,000 m³', Quantity: '1 PCS' },
          'Propeller Type': 'FPP',
        },
        drawings: [{ drawKey: 'ga', title: 'General Arrangement — SPB 4,000 m³', order: 0 }],
      },
    },
  },

  FSRU: {
    name: 'Floating Storage & Regasification Unit',
    description: 'Large floating units for LNG storage and regasification.',
    items: {
      '83000': {
        label: 'FSRU 83,000 m³',
        params: {
          'Main Dimension': {
            'Length Over All (LOA)': '200 M',
            'Breadth (B)': '39.80 M',
            'Draught (T)': '7.70 M',
            'Deadweight (DWT)': '- TON',
          },
          'Cargo Tank': { Type: 'CIRCULAR', Capacity: '83,000 m³', Quantity: '4 PCS' },
          'Propeller Type': 'CPP',
        },
        drawings: [{ drawKey: 'ga', title: 'General Arrangement — FSRU 83,000 m³', order: 0 }],
      },
    },
  },

  TRUCK: {
    name: 'LNG Trucking',
    description: 'Road tanker trucks for LNG last-mile distribution.',
    items: {
      '40000': {
        label: 'LNG Trucking 40,000 L (39.6 m³)',
        params: {
          'Main Dimension': {
            'Length Over All (LOA)': '12,980 MM',
            Width: '2,500 MM',
            Height: '3,880 MM',
            'Deadweight (DWT)': '18,370 KG',
          },
          Tank: { Capacity: '39.6 m³' },
        },
        drawings: [{ drawKey: 'ga', title: 'General Arrangement — LNG Truck 39.6 m³', order: 0 }],
      },
      '52000': {
        label: 'LNG Trucking 52,000 L (52.5 m³)',
        params: {
          'Main Dimension': {
            'Length Over All (LOA)': '16,500 MM',
            Width: '2,500 MM',
            Height: '3,880 MM',
            'Deadweight (DWT)': '21,715 KG',
          },
          Tank: { Capacity: '52.5 m³' },
        },
        drawings: [{ drawKey: 'ga', title: 'General Arrangement — LNG Truck 52.5 m³', order: 0 }],
      },
    },
  },

  ORU: {
    name: 'Onshore Receiving Unit',
    description: 'Land-based LNG receiving and regasification facilities.',
    items: {
      c1a6: {
        label: 'ORU — Type C1A, 12 m³/HR',
        params: {
          'Storage Capacity': { Each: '500 m³', Total: '2,000 m³' },
          'Send Out System': { Capacity: '12 m³/HR', Pressure: '15.8 BARG' },
          'Engineering Spec': { 'Storage Tank Technology': '', 'Vaporizer Technology': '' },
        },
        drawings: [{ drawKey: 'pfd', title: 'ORU Type C1A — typical PFD', order: 0 }],
      },
      c1b12: {
        label: 'ORU — Type C1B, 12 m³/HR',
        params: {
          'Storage Capacity': { Each: '500 m³', Total: '2,000 m³' },
          'Send Out System': { Capacity: '12 m³/HR', Pressure: '15.8 BARG' },
          'Engineering Spec': { 'Storage Tank Technology': '', 'Vaporizer Technology': '' },
        },
        drawings: [{ drawKey: 'pfd', title: 'ORU Type C1B — typical PFD', order: 0 }],
      },
    },
  },

  ORF: {
    name: 'Onshore Receiving Facility',
    description: 'Onshore LNG receiving facilities with piping & instrumentation.',
    items: {
      v5: {
        label: 'ORF — 4.893 m³/HR',
        params: { Parameter: { Capacity: '4.893 m³/HR', Pressure: '16 BARG' } },
        drawings: [{ drawKey: 'pid', title: 'P&ID — ORF 4.893 m³/HR', order: 0 }],
      },
      v16: {
        label: 'ORF — 16.39 m³/HR',
        params: { Parameter: { Capacity: '16.39 m³/HR', Pressure: '16 BARG' } },
        drawings: [{ drawKey: 'pid', title: 'P&ID — ORF 16.39 m³/HR', order: 0 }],
      },
    },
  },

  LNG_PLANT: {
    name: 'LNG Plant',
    description: 'Onshore and mini LNG liquefaction plants.',
    items: {
      onshore2: {
        label: 'Onshore LNG Plant — 2.5 MMSCFD',
        params: {
          'Send Out System': { Capacity: '2.5 MMSCFD', Pressure: '- BARG' },
        },
        drawings: [{ drawKey: 'pfd', title: 'PFD — Onshore LNG Plant 2.5 MMSCFD', order: 0 }],
      },
      mini25: {
        label: 'Mini LNG Plant — 2.5 MMSCFD',
        params: {
          'Send Out System': { Capacity: '2.5 MMSCFD', Pressure: '- BARG' },
        },
        drawings: [{ drawKey: 'pfd', title: 'PFD — Mini LNG Plant 2.5 MMSCFD', order: 0 }],
      },
    },
  },

  JETTY_LNGBV: {
    name: 'Jetty — LNGBV',
    description: 'Jetty infrastructure sized for LNG Bunkering Vessels.',
    items: {
      '2000': {
        label: 'Jetty LNGBV — 2,000 CBM',
        params: {
          Jetty: { Type: 'CARGO', 'Size (LOA)': '83 M', Deadweight: '- TON', Capacity: '2,000 CBM' },
        },
        drawings: [{ drawKey: 'ga', title: 'Jetty LNGBV 2,000 CBM — General Layout', order: 0 }],
      },
      '3500': {
        label: 'Jetty LNGBV — 3,500 CBM',
        params: {
          Jetty: { Type: 'CARGO', 'Size (LOA)': '83 M', Deadweight: '- TON', Capacity: '3,500 CBM' },
        },
        drawings: [{ drawKey: 'ga', title: 'Jetty LNGBV 3,500 CBM — General Layout', order: 0 }],
      },
    },
  },

  JETTY_SPB: {
    name: 'Jetty — SPB',
    description: 'Jetty infrastructure sized for Self-Propelled Barges.',
    items: {
      '15000': {
        label: 'Jetty SPB — 15,000 CBM',
        params: {
          Jetty: { Type: 'CARGO', 'Size (LOA)': '83 M', Deadweight: '- TON', Capacity: '15,000 CBM' },
        },
        drawings: [{ drawKey: 'ga', title: 'Jetty SPB 15,000 CBM — General Layout', order: 0 }],
      },
    },
  },
};

async function main() {
  console.log('🌱  Seeding infrastructure library (unified table)…');

  // Remove legacy shorthand variantKey records so they are replaced by full integers
  const legacyKeys = [
    { code: 'LNGBV', variantKey: '5k' }, { code: 'LNGBV', variantKey: '10k' }, { code: 'LNGBV', variantKey: '15k' },
    { code: 'LNGC', variantKey: '18k' }, { code: 'LNGC', variantKey: '20k' },
    { code: 'SPB', variantKey: '1k2' }, { code: 'SPB', variantKey: '4k' },
    { code: 'FSRU', variantKey: '83k' },
    { code: 'TRUCK', variantKey: '40k' }, { code: 'TRUCK', variantKey: '52k' },
    { code: 'JETTY_LNGBV', variantKey: '2k' }, { code: 'JETTY_LNGBV', variantKey: '3k5' },
    { code: 'JETTY_SPB', variantKey: '15k' },
  ];
  for (const { code, variantKey } of legacyKeys) {
    const deleted = await prisma.infraLibrary.deleteMany({ where: { code, variantKey } });
    if (deleted.count > 0) console.log(`  🗑  Removed legacy key [${code}] ${variantKey}`);
  }

  for (const [code, catData] of Object.entries(CATALOG)) {
    for (const [variantKey, itemData] of Object.entries(catData.items)) {
      const result = await prisma.infraLibrary.upsert({
        where: { code_variantKey: { code, variantKey } },
        update: {
          categoryName: catData.name,
          description: catData.description ?? null,
          label: itemData.label,
          params: itemData.params,
          // Do NOT overwrite drawings on update — preserve uploaded imageUrls
        },
        create: {
          code,
          categoryName: catData.name,
          description: catData.description ?? null,
          variantKey,
          label: itemData.label,
          params: itemData.params,
          drawings: itemData.drawings.map((dw) => ({
            drawKey: dw.drawKey,
            title: dw.title,
            order: dw.order ?? 0,
            imageUrl: null,
            fileName: null,
            mimeType: null,
          })),
        },
      });
      console.log(`  ✔ [${code}] ${variantKey} — "${result.label}" (id=${result.id})`);
    }
  }

  console.log('\n✅  Library seed complete.');
}

main()
  .catch((e) => {
    console.error('❌  Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
