/**
 * seedRiskMatrix.js
 * Seeds R1–R32 risk variables with their II.1–II.8 × P-group impact values.
 * All values match Python data_risk_raw exactly.
 * Called from seed.js: await seedRiskMatrix(prisma)
 */

const RISK_ROWS = [
  {
    riskCode: 'R1',
    variable: 'Kecelakaan Kapal',
    values: {
      "II.1 P1_BOP": 0, "II.1 P2_Durasi": 0, "II.1 P3_BIV": 0,
      "II.2 P1_BOP": 0.03159482421875, "II.2 P2_Durasi": 0.042105078125, "II.2 P3_BIV": 0, "II.2 P4_Panjang Jalur": 0.0350982421875, "II.2 P5_Kecepatan Kapal": 0.036499609375,
      "II.3 P1_BOP": 0.0322955078125, "II.3 P2_Durasi": 0.03860166015625, "II.3 P3_BIV": 0.036499609375, "II.3 P4_Panjang Jalur": 0.0350982421875,
      "II.4 P1_BOP": 0, "II.4 P2_Durasi": 0, "II.4 P3_BIV": 0,
      "II.5 P1_BOP": 0.0322955078125, "II.5 P2_Durasi": 0.04000302734375, "II.5 P3_BIV": 0, "II.5 P4_Panjang Jalur": 0.0407037109375, "II.5 P5_Kecepatan Kapal": 0.0379009765625,
      "II.6 P1_BOP": 0, "II.6 P3_BIV": 0,
      "II.7 P1_BOP": 0, "II.7 P3_BIV": 0,
      "II.8 P1_BOP": 0, "II.8 P3_BIV": 0
    }
  },
  {
    riskCode: 'R2',
    variable: 'Politik (kerusuhan&perang)',
    values: {
      "II.1 P1_BOP": 0.0110697265625, "II.1 P2_Durasi": 0, "II.1 P3_BIV": 0,
      "II.2 P1_BOP": 0.01074501953125, "II.2 P2_Durasi": 0, "II.2 P3_BIV": 0.01334267578125, "II.2 P4_Panjang Jalur": 0, "II.2 P5_Kecepatan Kapal": 0,
      "II.3 P1_BOP": 0, "II.3 P2_Durasi": 0, "II.3 P3_BIV": 0, "II.3 P4_Panjang Jalur": 0,
      "II.4 P1_BOP": 0.014316796875, "II.4 P2_Durasi": 0, "II.4 P3_BIV": 0,
      "II.5 P1_BOP": 0.01334267578125, "II.5 P2_Durasi": 0, "II.5 P3_BIV": 0.01334267578125, "II.5 P4_Panjang Jalur": 0, "II.5 P5_Kecepatan Kapal": 0,
      "II.6 P1_BOP": 0.014316796875, "II.6 P3_BIV": 0.014316796875,
      "II.7 P1_BOP": 0.01529091796875, "II.7 P3_BIV": 0.01334267578125,
      "II.8 P1_BOP": 0.01334267578125, "II.8 P3_BIV": 0
    }
  },
  {
    riskCode: 'R3',
    variable: 'Pembajakan',
    values: {
      "II.1 P1_BOP": 0, "II.1 P2_Durasi": 0, "II.1 P3_BIV": 0,
      "II.2 P1_BOP": 0, "II.2 P2_Durasi": 0, "II.2 P3_BIV": 0, "II.2 P4_Panjang Jalur": 0, "II.2 P5_Kecepatan Kapal": 0,
      "II.3 P1_BOP": 0.01187607421875, "II.3 P2_Durasi": 0.018694921875, "II.3 P3_BIV": 0.018694921875, "II.3 P4_Panjang Jalur": 0,
      "II.4 P1_BOP": 0, "II.4 P2_Durasi": 0, "II.4 P3_BIV": 0,
      "II.5 P1_BOP": 0, "II.5 P2_Durasi": 0, "II.5 P3_BIV": 0, "II.5 P4_Panjang Jalur": 0, "II.5 P5_Kecepatan Kapal": 0,
      "II.6 P1_BOP": 0, "II.6 P3_BIV": 0,
      "II.7 P1_BOP": 0, "II.7 P3_BIV": 0,
      "II.8 P1_BOP": 0, "II.8 P3_BIV": 0
    }
  },
  {
    riskCode: 'R4',
    variable: 'Serangan Teroris',
    values: {
      "II.1 P1_BOP": 0.011994140625, "II.1 P2_Durasi": 0, "II.1 P3_BIV": 0.011310546875,
      "II.2 P1_BOP": 0.0150703125, "II.2 P2_Durasi": 0, "II.2 P3_BIV": 0, "II.2 P4_Panjang Jalur": 0, "II.2 P5_Kecepatan Kapal": 0,
      "II.3 P1_BOP": 0.0123359375, "II.3 P2_Durasi": 0, "II.3 P3_BIV": 0, "II.3 P4_Panjang Jalur": 0,
      "II.4 P1_BOP": 0.016095703125, "II.4 P2_Durasi": 0, "II.4 P3_BIV": 0,
      "II.5 P1_BOP": 0.01438671875, "II.5 P2_Durasi": 0, "II.5 P3_BIV": 0, "II.5 P4_Panjang Jalur": 0, "II.5 P5_Kecepatan Kapal": 0,
      "II.6 P1_BOP": 0.016779296875, "II.6 P3_BIV": 0,
      "II.7 P1_BOP": 0.016095703125, "II.7 P3_BIV": 0.015412109375,
      "II.8 P1_BOP": 0.01438671875, "II.8 P3_BIV": 0.01438671875
    }
  },
  {
    riskCode: 'R5',
    variable: 'Sabotase',
    values: {
      "II.1 P1_BOP": 0, "II.1 P2_Durasi": 0, "II.1 P3_BIV": 0,
      "II.2 P1_BOP": 0, "II.2 P2_Durasi": 0, "II.2 P3_BIV": 0, "II.2 P4_Panjang Jalur": 0, "II.2 P5_Kecepatan Kapal": 0,
      "II.3 P1_BOP": 0.011940234375, "II.3 P2_Durasi": 0.0196892578125, "II.3 P3_BIV": 0, "II.3 P4_Panjang Jalur": 0,
      "II.4 P1_BOP": 0, "II.4 P2_Durasi": 0, "II.4 P3_BIV": 0,
      "II.5 P1_BOP": 0, "II.5 P2_Durasi": 0, "II.5 P3_BIV": 0, "II.5 P4_Panjang Jalur": 0, "II.5 P5_Kecepatan Kapal": 0,
      "II.6 P1_BOP": 0, "II.6 P3_BIV": 0,
      "II.7 P1_BOP": 0, "II.7 P3_BIV": 0,
      "II.8 P1_BOP": 0, "II.8 P3_BIV": 0
    }
  },
  {
    riskCode: 'R6',
    variable: 'Epidemi',
    values: {
      "II.1 P1_BOP": 0, "II.1 P2_Durasi": 0, "II.1 P3_BIV": 0,
      "II.2 P1_BOP": 0, "II.2 P2_Durasi": 0, "II.2 P3_BIV": 0, "II.2 P4_Panjang Jalur": 0, "II.2 P5_Kecepatan Kapal": 0,
      "II.3 P1_BOP": 0.0117203125, "II.3 P2_Durasi": 0.01324375, "II.3 P3_BIV": 0, "II.3 P4_Panjang Jalur": 0,
      "II.4 P1_BOP": 0, "II.4 P2_Durasi": 0, "II.4 P3_BIV": 0,
      "II.5 P1_BOP": 0, "II.5 P2_Durasi": 0, "II.5 P3_BIV": 0, "II.5 P4_Panjang Jalur": 0, "II.5 P5_Kecepatan Kapal": 0,
      "II.6 P1_BOP": 0, "II.6 P3_BIV": 0,
      "II.7 P1_BOP": 0, "II.7 P3_BIV": 0,
      "II.8 P1_BOP": 0, "II.8 P3_BIV": 0
    }
  },
  {
    riskCode: 'R7',
    variable: 'Kerusakan peralatan',
    values: {
      "II.1 P1_BOP": 0.031312109375, "II.1 P2_Durasi": 0.04985947265625, "II.1 P3_BIV": 0.0389390625,
      "II.2 P1_BOP": 0.038245703125, "II.2 P2_Durasi": 0.06199326171875, "II.2 P3_BIV": 0, "II.2 P4_Panjang Jalur": 0, "II.2 P5_Kecepatan Kapal": 0,
      "II.3 P1_BOP": 0, "II.3 P2_Durasi": 0, "II.3 P3_BIV": 0, "II.3 P4_Panjang Jalur": 0,
      "II.4 P1_BOP": 0.0510728515625, "II.4 P2_Durasi": 0.0607798828125, "II.4 P3_BIV": 0.05713974609375,
      "II.5 P1_BOP": 0.04257919921875, "II.5 P2_Durasi": 0.05228623046875, "II.5 P3_BIV": 0, "II.5 P4_Panjang Jalur": 0, "II.5 P5_Kecepatan Kapal": 0,
      "II.6 P1_BOP": 0.04864609375, "II.6 P3_BIV": 0.05713974609375,
      "II.7 P1_BOP": 0.04864609375, "II.7 P3_BIV": 0.0510728515625,
      "II.8 P1_BOP": 0.04864609375, "II.8 P3_BIV": 0.04743271484375
    }
  },
  {
    riskCode: 'R8',
    variable: 'Pemadaman listrik',
    values: {
      "II.1 P1_BOP": 0.0224234375, "II.1 P2_Durasi": 0.0280044921875, "II.1 P3_BIV": 0.031105078125,
      "II.2 P1_BOP": 0.0255240234375, "II.2 P2_Durasi": 0.0317251953125, "II.2 P3_BIV": 0, "II.2 P4_Panjang Jalur": 0, "II.2 P5_Kecepatan Kapal": 0,
      "II.3 P1_BOP": 0, "II.3 P2_Durasi": 0, "II.3 P3_BIV": 0, "II.3 P4_Panjang Jalur": 0,
      "II.4 P1_BOP": 0.035910986328125, "II.4 P2_Durasi": 0.03482578125, "II.4 P3_BIV": 0.033585546875,
      "II.5 P1_BOP": 0.0292447265625, "II.5 P2_Durasi": 0.0342056640625, "II.5 P3_BIV": 0, "II.5 P4_Panjang Jalur": 0, "II.5 P5_Kecepatan Kapal": 0,
      "II.6 P1_BOP": 0.033585546875, "II.6 P3_BIV": 0.035910986328125,
      "II.7 P1_BOP": 0.0317251953125, "II.7 P3_BIV": 0.0317251953125,
      "II.8 P1_BOP": 0.02986484375, "II.8 P3_BIV": 0.028624609375
    }
  },
  {
    riskCode: 'R9',
    variable: 'Kegagalan fasilitas komunikasi',
    values: {
      "II.1 P1_BOP": 0.0172283203125, "II.1 P2_Durasi": 0.02372734375, "II.1 P3_BIV": 0,
      "II.2 P1_BOP": 0.0231365234375, "II.2 P2_Durasi": 0.0254998046875, "II.2 P3_BIV": 0.026090625, "II.2 P4_Panjang Jalur": 0, "II.2 P5_Kecepatan Kapal": 0,
      "II.3 P1_BOP": 0, "II.3 P2_Durasi": 0, "II.3 P3_BIV": 0, "II.3 P4_Panjang Jalur": 0,
      "II.4 P1_BOP": 0.022545703125, "II.4 P2_Durasi": 0.0254998046875, "II.4 P3_BIV": 0.024908984375,
      "II.5 P1_BOP": 0.0231365234375, "II.5 P2_Durasi": 0.027272265625, "II.5 P3_BIV": 0.0266814453125, "II.5 P4_Panjang Jalur": 0, "II.5 P5_Kecepatan Kapal": 0,
      "II.6 P1_BOP": 0.0243181640625, "II.6 P3_BIV": 0.0266814453125,
      "II.7 P1_BOP": 0, "II.7 P3_BIV": 0,
      "II.8 P1_BOP": 0, "II.8 P3_BIV": 0
    }
  },
  {
    riskCode: 'R10',
    variable: 'Kemacetan Pelabuhan',
    values: {
      "II.1 P1_BOP": 0, "II.1 P2_Durasi": 0, "II.1 P3_BIV": 0,
      "II.2 P1_BOP": 0.0265783203125, "II.2 P2_Durasi": 0.03811640625, "II.2 P3_BIV": 0, "II.2 P4_Panjang Jalur": 0, "II.2 P5_Kecepatan Kapal": 0,
      "II.3 P1_BOP": 0, "II.3 P2_Durasi": 0, "II.3 P3_BIV": 0, "II.3 P4_Panjang Jalur": 0,
      "II.4 P1_BOP": 0, "II.4 P2_Durasi": 0, "II.4 P3_BIV": 0,
      "II.5 P1_BOP": 0.0306505859375, "II.5 P2_Durasi": 0.03268671875, "II.5 P3_BIV": 0, "II.5 P4_Panjang Jalur": 0, "II.5 P5_Kecepatan Kapal": 0,
      "II.6 P1_BOP": 0, "II.6 P3_BIV": 0,
      "II.7 P1_BOP": 0, "II.7 P3_BIV": 0,
      "II.8 P1_BOP": 0, "II.8 P3_BIV": 0
    }
  },
  {
    riskCode: 'R11',
    variable: 'Masalah akses darat',
    values: {
      "II.1 P1_BOP": 0, "II.1 P2_Durasi": 0, "II.1 P3_BIV": 0,
      "II.2 P1_BOP": 0, "II.2 P2_Durasi": 0, "II.2 P3_BIV": 0, "II.2 P4_Panjang Jalur": 0, "II.2 P5_Kecepatan Kapal": 0,
      "II.3 P1_BOP": 0, "II.3 P2_Durasi": 0, "II.3 P3_BIV": 0, "II.3 P4_Panjang Jalur": 0,
      "II.4 P1_BOP": 0, "II.4 P2_Durasi": 0, "II.4 P3_BIV": 0,
      "II.5 P1_BOP": 0, "II.5 P2_Durasi": 0, "II.5 P3_BIV": 0, "II.5 P4_Panjang Jalur": 0, "II.5 P5_Kecepatan Kapal": 0,
      "II.6 P1_BOP": 0, "II.6 P3_BIV": 0,
      "II.7 P1_BOP": 0, "II.7 P3_BIV": 0,
      "II.8 P1_BOP": 0, "II.8 P3_BIV": 0
    }
  },
  {
    riskCode: 'R12',
    variable: 'Kemampuan penyimpanan terbatas',
    values: {
      "II.1 P1_BOP": 0.0231390625, "II.1 P2_Durasi": 0.02659609375, "II.1 P3_BIV": 0,
      "II.2 P1_BOP": 0.023715234375, "II.2 P2_Durasi": 0.028324609375, "II.2 P3_BIV": 0, "II.2 P4_Panjang Jalur": 0, "II.2 P5_Kecepatan Kapal": 0,
      "II.3 P1_BOP": 0, "II.3 P2_Durasi": 0, "II.3 P3_BIV": 0, "II.3 P4_Panjang Jalur": 0,
      "II.4 P1_BOP": 0.0277484375, "II.4 P2_Durasi": 0.027172265625, "II.4 P3_BIV": 0,
      "II.5 P1_BOP": 0.02659609375, "II.5 P2_Durasi": 0.02890078125, "II.5 P3_BIV": 0, "II.5 P4_Panjang Jalur": 0, "II.5 P5_Kecepatan Kapal": 0,
      "II.6 P1_BOP": 0.02890078125, "II.6 P3_BIV": 0,
      "II.7 P1_BOP": 0, "II.7 P3_BIV": 0,
      "II.8 P1_BOP": 0, "II.8 P3_BIV": 0
    }
  },
  {
    riskCode: 'R13',
    variable: 'Kemampuan berlabuh tidak memadai',
    values: {
      "II.1 P1_BOP": 0, "II.1 P2_Durasi": 0, "II.1 P3_BIV": 0,
      "II.2 P1_BOP": 0.0267375, "II.2 P2_Durasi": 0.02976484375, "II.2 P3_BIV": 0, "II.2 P4_Panjang Jalur": 0, "II.2 P5_Kecepatan Kapal": 0,
      "II.3 P1_BOP": 0, "II.3 P2_Durasi": 0, "II.3 P3_BIV": 0, "II.3 P4_Panjang Jalur": 0,
      "II.4 P1_BOP": 0, "II.4 P2_Durasi": 0, "II.4 P3_BIV": 0,
      "II.5 P1_BOP": 0.02492109375, "II.5 P2_Durasi": 0.0279484375, "II.5 P3_BIV": 0, "II.5 P4_Panjang Jalur": 0, "II.5 P5_Kecepatan Kapal": 0,
      "II.6 P1_BOP": 0, "II.6 P3_BIV": 0,
      "II.7 P1_BOP": 0, "II.7 P3_BIV": 0,
      "II.8 P1_BOP": 0, "II.8 P3_BIV": 0
    }
  },
  {
    riskCode: 'R14',
    variable: 'Biaya Bunkering tidak pasti',
    values: {
      "II.1 P1_BOP": 0, "II.1 P2_Durasi": 0, "II.1 P3_BIV": 0,
      "II.2 P1_BOP": 0, "II.2 P2_Durasi": 0, "II.2 P3_BIV": 0, "II.2 P4_Panjang Jalur": 0, "II.2 P5_Kecepatan Kapal": 0,
      "II.3 P1_BOP": 0.0333578125, "II.3 P2_Durasi": 0, "II.3 P3_BIV": 0, "II.3 P4_Panjang Jalur": 0,
      "II.4 P1_BOP": 0, "II.4 P2_Durasi": 0, "II.4 P3_BIV": 0,
      "II.5 P1_BOP": 0, "II.5 P2_Durasi": 0, "II.5 P3_BIV": 0, "II.5 P4_Panjang Jalur": 0, "II.5 P5_Kecepatan Kapal": 0,
      "II.6 P1_BOP": 0, "II.6 P3_BIV": 0,
      "II.7 P1_BOP": 0, "II.7 P3_BIV": 0,
      "II.8 P1_BOP": 0, "II.8 P3_BIV": 0
    }
  },
  {
    riskCode: 'R15',
    variable: 'Kekurangan Kapal Transport',
    values: {
      "II.1 P1_BOP": 0, "II.1 P2_Durasi": 0, "II.1 P3_BIV": 0,
      "II.2 P1_BOP": 0, "II.2 P2_Durasi": 0, "II.2 P3_BIV": 0, "II.2 P4_Panjang Jalur": 0, "II.2 P5_Kecepatan Kapal": 0,
      "II.3 P1_BOP": 0.035013671875, "II.3 P2_Durasi": 0, "II.3 P3_BIV": 0, "II.3 P4_Panjang Jalur": 0,
      "II.4 P1_BOP": 0, "II.4 P2_Durasi": 0, "II.4 P3_BIV": 0,
      "II.5 P1_BOP": 0, "II.5 P2_Durasi": 0, "II.5 P3_BIV": 0, "II.5 P4_Panjang Jalur": 0, "II.5 P5_Kecepatan Kapal": 0,
      "II.6 P1_BOP": 0, "II.6 P3_BIV": 0,
      "II.7 P1_BOP": 0, "II.7 P3_BIV": 0,
      "II.8 P1_BOP": 0, "II.8 P3_BIV": 0
    }
  },
  {
    riskCode: 'R16',
    variable: 'Perkiraan permintaan tidak akurat',
    values: {
      "II.1 P1_BOP": 0, "II.1 P2_Durasi": 0, "II.1 P3_BIV": 0,
      "II.2 P1_BOP": 0, "II.2 P2_Durasi": 0, "II.2 P3_BIV": 0, "II.2 P4_Panjang Jalur": 0, "II.2 P5_Kecepatan Kapal": 0,
      "II.3 P1_BOP": 0.037625, "II.3 P2_Durasi": 0, "II.3 P3_BIV": 0, "II.3 P4_Panjang Jalur": 0,
      "II.4 P1_BOP": 0, "II.4 P2_Durasi": 0, "II.4 P3_BIV": 0,
      "II.5 P1_BOP": 0, "II.5 P2_Durasi": 0, "II.5 P3_BIV": 0, "II.5 P4_Panjang Jalur": 0, "II.5 P5_Kecepatan Kapal": 0,
      "II.6 P1_BOP": 0, "II.6 P3_BIV": 0,
      "II.7 P1_BOP": 0, "II.7 P3_BIV": 0,
      "II.8 P1_BOP": 0, "II.8 P3_BIV": 0
    }
  },
  {
    riskCode: 'R17',
    variable: 'Pemogokan Pelabuhan',
    values: {
      "II.1 P1_BOP": 0.01200625, "II.1 P2_Durasi": 0.0192279296875, "II.1 P3_BIV": 0,
      "II.2 P1_BOP": 0.01565859375, "II.2 P2_Durasi": 0.0192279296875, "II.2 P3_BIV": 0, "II.2 P4_Panjang Jalur": 0, "II.2 P5_Kecepatan Kapal": 0,
      "II.3 P1_BOP": 0, "II.3 P2_Durasi": 0, "II.3 P3_BIV": 0, "II.3 P4_Panjang Jalur": 0,
      "II.4 P1_BOP": 0.01433046875, "II.4 P2_Durasi": 0, "II.4 P3_BIV": 0,
      "II.5 P1_BOP": 0.01433046875, "II.5 P2_Durasi": 0.01698671875, "II.5 P3_BIV": 0, "II.5 P4_Panjang Jalur": 0, "II.5 P5_Kecepatan Kapal": 0,
      "II.6 P1_BOP": 0, "II.6 P3_BIV": 0,
      "II.7 P1_BOP": 0, "II.7 P3_BIV": 0,
      "II.8 P1_BOP": 0, "II.8 P3_BIV": 0
    }
  },
  {
    riskCode: 'R18',
    variable: 'Pemeriksaan Karantina Muatan Lambat',
    values: {
      "II.1 P1_BOP": 0, "II.1 P2_Durasi": 0, "II.1 P3_BIV": 0,
      "II.2 P1_BOP": 0.01648125, "II.2 P2_Durasi": 0.022575, "II.2 P3_BIV": 0, "II.2 P4_Panjang Jalur": 0, "II.2 P5_Kecepatan Kapal": 0,
      "II.3 P1_BOP": 0, "II.3 P2_Durasi": 0, "II.3 P3_BIV": 0, "II.3 P4_Panjang Jalur": 0,
      "II.4 P1_BOP": 0, "II.4 P2_Durasi": 0, "II.4 P3_BIV": 0,
      "II.5 P1_BOP": 0.01648125, "II.5 P2_Durasi": 0.01835625, "II.5 P3_BIV": 0, "II.5 P4_Panjang Jalur": 0, "II.5 P5_Kecepatan Kapal": 0,
      "II.6 P1_BOP": 0, "II.6 P3_BIV": 0,
      "II.7 P1_BOP": 0, "II.7 P3_BIV": 0,
      "II.8 P1_BOP": 0, "II.8 P3_BIV": 0
    }
  },
  {
    riskCode: 'R19',
    variable: 'Proses Bea Cukai Lama',
    values: {
      "II.1 P1_BOP": 0, "II.1 P2_Durasi": 0, "II.1 P3_BIV": 0,
      "II.2 P1_BOP": 0.023663671875, "II.2 P2_Durasi": 0.0255240234375, "II.2 P3_BIV": 0, "II.2 P4_Panjang Jalur": 0, "II.2 P5_Kecepatan Kapal": 0,
      "II.3 P1_BOP": 0, "II.3 P2_Durasi": 0, "II.3 P3_BIV": 0, "II.3 P4_Panjang Jalur": 0,
      "II.4 P1_BOP": 0, "II.4 P2_Durasi": 0, "II.4 P3_BIV": 0,
      "II.5 P1_BOP": 0.0224234375, "II.5 P2_Durasi": 0.023663671875, "II.5 P3_BIV": 0, "II.5 P4_Panjang Jalur": 0, "II.5 P5_Kecepatan Kapal": 0,
      "II.6 P1_BOP": 0, "II.6 P3_BIV": 0,
      "II.7 P1_BOP": 0, "II.7 P3_BIV": 0,
      "II.8 P1_BOP": 0, "II.8 P3_BIV": 0
    }
  },
  {
    riskCode: 'R20',
    variable: 'Sengketa Pengiriman Pelabuhan',
    values: {
      "II.1 P1_BOP": 0, "II.1 P2_Durasi": 0, "II.1 P3_BIV": 0,
      "II.2 P1_BOP": 0, "II.2 P2_Durasi": 0, "II.2 P3_BIV": 0, "II.2 P4_Panjang Jalur": 0, "II.2 P5_Kecepatan Kapal": 0,
      "II.3 P1_BOP": 0, "II.3 P2_Durasi": 0, "II.3 P3_BIV": 0, "II.3 P4_Panjang Jalur": 0,
      "II.4 P1_BOP": 0, "II.4 P2_Durasi": 0, "II.4 P3_BIV": 0,
      "II.5 P1_BOP": 0, "II.5 P2_Durasi": 0, "II.5 P3_BIV": 0, "II.5 P4_Panjang Jalur": 0, "II.5 P5_Kecepatan Kapal": 0,
      "II.6 P1_BOP": 0, "II.6 P3_BIV": 0,
      "II.7 P1_BOP": 0, "II.7 P3_BIV": 0,
      "II.8 P1_BOP": 0, "II.8 P3_BIV": 0
    }
  },
  {
    riskCode: 'R21',
    variable: 'Kurang fleksibel jadwal yang disusun',
    values: {
      "II.1 P1_BOP": 0.0230435546875, "II.1 P2_Durasi": 0.0317251953125, "II.1 P3_BIV": 0,
      "II.2 P1_BOP": 0.0242837890625, "II.2 P2_Durasi": 0.0280044921875, "II.2 P3_BIV": 0, "II.2 P4_Panjang Jalur": 0, "II.2 P5_Kecepatan Kapal": 0,
      "II.3 P1_BOP": 0, "II.3 P2_Durasi": 0, "II.3 P3_BIV": 0, "II.3 P4_Panjang Jalur": 0,
      "II.4 P1_BOP": 0.023663671875, "II.4 P2_Durasi": 0.027384375, "II.4 P3_BIV": 0,
      "II.5 P1_BOP": 0.0218033203125, "II.5 P2_Durasi": 0.0242837890625, "II.5 P3_BIV": 0, "II.5 P4_Panjang Jalur": 0, "II.5 P5_Kecepatan Kapal": 0,
      "II.6 P1_BOP": 0, "II.6 P3_BIV": 0,
      "II.7 P1_BOP": 0, "II.7 P3_BIV": 0,
      "II.8 P1_BOP": 0, "II.8 P3_BIV": 0
    }
  },
  {
    riskCode: 'R22',
    variable: 'Cuaca buruk',
    values: {
      "II.1 P1_BOP": 0.045800390625, "II.1 P2_Durasi": 0.088030615234375, "II.1 P3_BIV": 0,
      "II.2 P1_BOP": 0.059268408203125, "II.2 P2_Durasi": 0.0832369140625, "II.2 P3_BIV": 0, "II.2 P4_Panjang Jalur": 0, "II.2 P5_Kecepatan Kapal": 0,
      "II.3 P1_BOP": 0.059268408203125, "II.3 P2_Durasi": 0.08004111328125, "II.3 P3_BIV": 0.084834814453125, "II.3 P4_Panjang Jalur": 0.081639013671875,
      "II.4 P1_BOP": 0.065660009765625, "II.4 P2_Durasi": 0.068855810546875, "II.4 P3_BIV": 0,
      "II.5 P1_BOP": 0.06086630859375, "II.5 P2_Durasi": 0.072051611328125, "II.5 P3_BIV": 0, "II.5 P4_Panjang Jalur": 0, "II.5 P5_Kecepatan Kapal": 0,
      "II.6 P1_BOP": 0, "II.6 P3_BIV": 0,
      "II.7 P1_BOP": 0.052876806640625, "II.7 P3_BIV": 0,
      "II.8 P1_BOP": 0, "II.8 P3_BIV": 0
    }
  },
  {
    riskCode: 'R23',
    variable: 'Gempa bumi',
    values: {
      "II.1 P1_BOP": 0.02345380859375, "II.1 P2_Durasi": 0.03357099609375, "II.1 P3_BIV": 0,
      "II.2 P1_BOP": 0.02471845703125, "II.2 P2_Durasi": 0.032938671875, "II.2 P3_BIV": 0, "II.2 P4_Panjang Jalur": 0, "II.2 P5_Kecepatan Kapal": 0,
      "II.3 P1_BOP": 0, "II.3 P2_Durasi": 0, "II.3 P3_BIV": 0, "II.3 P4_Panjang Jalur": 0,
      "II.4 P1_BOP": 0.0266154296875, "II.4 P2_Durasi": 0.03104169921875, "II.4 P3_BIV": 0,
      "II.5 P1_BOP": 0.02724775390625, "II.5 P2_Durasi": 0.02977705078125, "II.5 P3_BIV": 0, "II.5 P4_Panjang Jalur": 0, "II.5 P5_Kecepatan Kapal": 0,
      "II.6 P1_BOP": 0.03230634765625, "II.6 P3_BIV": 0,
      "II.7 P1_BOP": 0.02851240234375, "II.7 P3_BIV": 0,
      "II.8 P1_BOP": 0.027880078125, "II.8 P3_BIV": 0
    }
  },
  {
    riskCode: 'R24',
    variable: 'Tsunami',
    values: {
      "II.1 P1_BOP": 0.0209244140625, "II.1 P2_Durasi": 0.0280337890625, "II.1 P3_BIV": 0,
      "II.2 P1_BOP": 0.022257421875, "II.2 P2_Durasi": 0.0280337890625, "II.2 P3_BIV": 0, "II.2 P4_Panjang Jalur": 0, "II.2 P5_Kecepatan Kapal": 0,
      "II.3 P1_BOP": 0.0227017578125, "II.3 P2_Durasi": 0.027589453125, "II.3 P3_BIV": 0.028478125, "II.3 P4_Panjang Jalur": 0.0262564453125,
      "II.4 P1_BOP": 0.0249234375, "II.4 P2_Durasi": 0.02670078125, "II.4 P3_BIV": 0,
      "II.5 P1_BOP": 0.0235904296875, "II.5 P2_Durasi": 0.027589453125, "II.5 P3_BIV": 0, "II.5 P4_Panjang Jalur": 0, "II.5 P5_Kecepatan Kapal": 0,
      "II.6 P1_BOP": 0.0271451171875, "II.6 P3_BIV": 0,
      "II.7 P1_BOP": 0.02314609375, "II.7 P3_BIV": 0,
      "II.8 P1_BOP": 0.024034765625, "II.8 P3_BIV": 0
    }
  },
  {
    riskCode: 'R25',
    variable: 'Kurangnya tenaga terampil',
    values: {
      "II.1 P1_BOP": 0.017240234375, "II.1 P2_Durasi": 0.023587890625, "II.1 P3_BIV": 0,
      "II.2 P1_BOP": 0.019779296875, "II.2 P2_Durasi": 0.023587890625, "II.2 P3_BIV": 0, "II.2 P4_Panjang Jalur": 0, "II.2 P5_Kecepatan Kapal": 0,
      "II.3 P1_BOP": 0.024857421875, "II.3 P2_Durasi": 0.022953125, "II.3 P3_BIV": 0, "II.3 P4_Panjang Jalur": 0,
      "II.4 P1_BOP": 0.02168359375, "II.4 P2_Durasi": 0.023587890625, "II.4 P3_BIV": 0,
      "II.5 P1_BOP": 0.021048828125, "II.5 P2_Durasi": 0.02168359375, "II.5 P3_BIV": 0, "II.5 P4_Panjang Jalur": 0, "II.5 P5_Kecepatan Kapal": 0,
      "II.6 P1_BOP": 0.01914453125, "II.6 P3_BIV": 0,
      "II.7 P1_BOP": 0.02168359375, "II.7 P3_BIV": 0,
      "II.8 P1_BOP": 0.02422265625, "II.8 P3_BIV": 0
    }
  },
  {
    riskCode: 'R26',
    variable: 'Kurangnya motivasi',
    values: {
      "II.1 P1_BOP": 0.0160466796875, "II.1 P2_Durasi": 0.0160466796875, "II.1 P3_BIV": 0,
      "II.2 P1_BOP": 0.015455859375, "II.2 P2_Durasi": 0.017819140625, "II.2 P3_BIV": 0, "II.2 P4_Panjang Jalur": 0, "II.2 P5_Kecepatan Kapal": 0,
      "II.3 P1_BOP": 0.0184099609375, "II.3 P2_Durasi": 0.01900078125, "II.3 P3_BIV": 0, "II.3 P4_Panjang Jalur": 0,
      "II.4 P1_BOP": 0.017819140625, "II.4 P2_Durasi": 0.01900078125, "II.4 P3_BIV": 0,
      "II.5 P1_BOP": 0.0166375, "II.5 P2_Durasi": 0.0184099609375, "II.5 P3_BIV": 0, "II.5 P4_Panjang Jalur": 0, "II.5 P5_Kecepatan Kapal": 0,
      "II.6 P1_BOP": 0, "II.6 P3_BIV": 0,
      "II.7 P1_BOP": 0, "II.7 P3_BIV": 0,
      "II.8 P1_BOP": 0, "II.8 P3_BIV": 0
    }
  },
  {
    riskCode: 'R27',
    variable: 'Kesehatan mental pelaut terganggu',
    values: {
      "II.1 P1_BOP": 0.01737734375, "II.1 P2_Durasi": 0.019105859375, "II.1 P3_BIV": 0,
      "II.2 P1_BOP": 0.0185296875, "II.2 P2_Durasi": 0.020258203125, "II.2 P3_BIV": 0, "II.2 P4_Panjang Jalur": 0, "II.2 P5_Kecepatan Kapal": 0,
      "II.3 P1_BOP": 0.0185296875, "II.3 P2_Durasi": 0.017953515625, "II.3 P3_BIV": 0, "II.3 P4_Panjang Jalur": 0,
      "II.4 P1_BOP": 0.0185296875, "II.4 P2_Durasi": 0.019105859375, "II.4 P3_BIV": 0,
      "II.5 P1_BOP": 0.01737734375, "II.5 P2_Durasi": 0.019105859375, "II.5 P3_BIV": 0, "II.5 P4_Panjang Jalur": 0, "II.5 P5_Kecepatan Kapal": 0,
      "II.6 P1_BOP": 0, "II.6 P3_BIV": 0,
      "II.7 P1_BOP": 0, "II.7 P3_BIV": 0,
      "II.8 P1_BOP": 0, "II.8 P3_BIV": 0
    }
  },
  {
    riskCode: 'R28',
    variable: 'Kesalahan manusia',
    values: {
      "II.1 P1_BOP": 0.0303474609375, "II.1 P2_Durasi": 0.03550859375, "II.1 P3_BIV": 0,
      "II.2 P1_BOP": 0.0362458984375, "II.2 P2_Durasi": 0.03550859375, "II.2 P3_BIV": 0, "II.2 P4_Panjang Jalur": 0, "II.2 P5_Kecepatan Kapal": 0,
      "II.3 P1_BOP": 0.0362458984375, "II.3 P2_Durasi": 0.0332966796875, "II.3 P3_BIV": 0, "II.3 P4_Panjang Jalur": 0,
      "II.4 P1_BOP": 0.034033984375, "II.4 P2_Durasi": 0.03550859375, "II.4 P3_BIV": 0,
      "II.5 P1_BOP": 0.0332966796875, "II.5 P2_Durasi": 0.034033984375, "II.5 P3_BIV": 0, "II.5 P4_Panjang Jalur": 0, "II.5 P5_Kecepatan Kapal": 0,
      "II.6 P1_BOP": 0, "II.6 P3_BIV": 0,
      "II.7 P1_BOP": 0.0332966796875, "II.7 P3_BIV": 0,
      "II.8 P1_BOP": 0.0347712890625, "II.8 P3_BIV": 0
    }
  },
  {
    riskCode: 'R29',
    variable: 'Kesejahteraan di bawah standar',
    values: {
      "II.1 P1_BOP": 0.0160437500, "II.1 P2_Durasi": 0.0187, "II.1 P3_BIV": 0,
      "II.2 P1_BOP": 0.0193640625, "II.2 P2_Durasi": 0.020028125, "II.2 P3_BIV": 0, "II.2 P4_Panjang Jalur": 0, "II.2 P5_Kecepatan Kapal": 0,
      "II.3 P1_BOP": 0.0187, "II.3 P2_Durasi": 0.0193640625, "II.3 P3_BIV": 0, "II.3 P4_Panjang Jalur": 0,
      "II.4 P1_BOP": 0.0193640625, "II.4 P2_Durasi": 0.0193640625, "II.4 P3_BIV": 0,
      "II.5 P1_BOP": 0.0180359375, "II.5 P2_Durasi": 0.0193640625, "II.5 P3_BIV": 0, "II.5 P4_Panjang Jalur": 0, "II.5 P5_Kecepatan Kapal": 0,
      "II.6 P1_BOP": 0.0193640625, "II.6 P3_BIV": 0,
      "II.7 P1_BOP": 0.0206921875, "II.7 P3_BIV": 0,
      "II.8 P1_BOP": 0, "II.8 P3_BIV": 0
    }
  },
  {
    riskCode: 'R30',
    variable: 'Keragaman bahasa dan budaya',
    values: {
      "II.1 P1_BOP": 0, "II.1 P2_Durasi": 0, "II.1 P3_BIV": 0,
      "II.2 P1_BOP": 0, "II.2 P2_Durasi": 0, "II.2 P3_BIV": 0, "II.2 P4_Panjang Jalur": 0, "II.2 P5_Kecepatan Kapal": 0,
      "II.3 P1_BOP": 0, "II.3 P2_Durasi": 0, "II.3 P3_BIV": 0, "II.3 P4_Panjang Jalur": 0,
      "II.4 P1_BOP": 0, "II.4 P2_Durasi": 0, "II.4 P3_BIV": 0,
      "II.5 P1_BOP": 0, "II.5 P2_Durasi": 0, "II.5 P3_BIV": 0, "II.5 P4_Panjang Jalur": 0, "II.5 P5_Kecepatan Kapal": 0,
      "II.6 P1_BOP": 0, "II.6 P3_BIV": 0,
      "II.7 P1_BOP": 0, "II.7 P3_BIV": 0,
      "II.8 P1_BOP": 0, "II.8 P3_BIV": 0
    }
  },
  {
    riskCode: 'R31',
    variable: 'Budaya keselamatan yang buruk',
    values: {
      "II.1 P1_BOP": 0.027379296875, "II.1 P2_Durasi": 0.0319251953125, "II.1 P3_BIV": 0,
      "II.2 P1_BOP": 0.03127578125, "II.2 P2_Durasi": 0.032574609375, "II.2 P3_BIV": 0, "II.2 P4_Panjang Jalur": 0, "II.2 P5_Kecepatan Kapal": 0,
      "II.3 P1_BOP": 0.03127578125, "II.3 P2_Durasi": 0.0280287109375, "II.3 P3_BIV": 0, "II.3 P4_Panjang Jalur": 0,
      "II.4 P1_BOP": 0.0306263671875, "II.4 P2_Durasi": 0.032574609375, "II.4 P3_BIV": 0,
      "II.5 P1_BOP": 0.029976953125, "II.5 P2_Durasi": 0.0306263671875, "II.5 P3_BIV": 0, "II.5 P4_Panjang Jalur": 0, "II.5 P5_Kecepatan Kapal": 0,
      "II.6 P1_BOP": 0.0332240234375, "II.6 P3_BIV": 0,
      "II.7 P1_BOP": 0.0319251953125, "II.7 P3_BIV": 0,
      "II.8 P1_BOP": 0.032574609375, "II.8 P3_BIV": 0
    }
  },
  {
    riskCode: 'R32',
    variable: 'Tingkat kepemimpinan keselamatan yang rendah',
    values: {
      "II.1 P1_BOP": 0.0255240234375, "II.1 P2_Durasi": 0.0280044921875, "II.1 P3_BIV": 0,
      "II.2 P1_BOP": 0.0292447265625, "II.2 P2_Durasi": 0.0292447265625, "II.2 P3_BIV": 0, "II.2 P4_Panjang Jalur": 0, "II.2 P5_Kecepatan Kapal": 0,
      "II.3 P1_BOP": 0.028624609375, "II.3 P2_Durasi": 0.027384375, "II.3 P3_BIV": 0, "II.3 P4_Panjang Jalur": 0,
      "II.4 P1_BOP": 0.027384375, "II.4 P2_Durasi": 0.028624609375, "II.4 P3_BIV": 0,
      "II.5 P1_BOP": 0.027384375, "II.5 P2_Durasi": 0.027384375, "II.5 P3_BIV": 0, "II.5 P4_Panjang Jalur": 0, "II.5 P5_Kecepatan Kapal": 0,
      "II.6 P1_BOP": 0.028624609375, "II.6 P3_BIV": 0,
      "II.7 P1_BOP": 0.0280044921875, "II.7 P3_BIV": 0,
      "II.8 P1_BOP": 0.0292447265625, "II.8 P3_BIV": 0
    }
  },
];

/**
 * Seeds or upserts all 32 risk rows into the RiskMatrix table.
 * @param {import('@prisma/client').PrismaClient} prisma
 */
async function seedRiskMatrix(prisma) {
  for (const row of RISK_ROWS) {
    await prisma.riskMatrix.upsert({
      where: { riskCode: row.riskCode },
      update: { variable: row.variable, values: row.values },
      create: row,
    });
  }
  console.log(`✅ RiskMatrix seeded/updated (${RISK_ROWS.length} risk codes)`);
}

module.exports = seedRiskMatrix;
