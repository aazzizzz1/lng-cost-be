/**
 * Jetty & Dolphins Design Calculation Engine
 * Converts all Excel formulas (BS 6349-4, OCIMF, PIANC 2002) to JS
 *
 * Sheets covered: Settings, Calc_Berthing, Select_Fender, Calc_Mooring,
 *                 Select_QRH, Select_Pile, QTO, CAPEX_Dolphin, CAPEX_Jetty,
 *                 Check_Summary
 */

const prisma = require('../config/db');

// ─── HELPERS ───────────────────────────────────────────────
function cosd(deg) { return Math.cos((deg * Math.PI) / 180); }
function round2(n) { return Math.round(n * 100) / 100; }

/**
 * Load all JD settings as a key→value object
 */
async function loadSettings() {
  const rows = await prisma.jdSetting.findMany();
  const s = {};
  for (const r of rows) s[r.key] = r.value;
  return s;
}

/**
 * Lookup Cb by ShipType from the jd_cb_defaults table
 */
async function lookupCb(shipType) {
  const row = await prisma.jdCbDefault.findUnique({ where: { shipType } });
  return row ? row.cb : 0.72; // fallback
}

/**
 * Lookup Vb from jd_berthing_velocities (PIANC 2002)
 * Returns the MAX velocity in the matching condition column range
 */
async function lookupVb(displacement, condition) {
  const rows = await prisma.jdBerthingVelocity.findMany({
    orderBy: { deltaMin: 'asc' },
  });
  for (const r of rows) {
    if (displacement >= r.deltaMin && displacement < r.deltaMax) {
      switch (condition) {
        case 'Favourable':  return r.favMax;
        case 'Moderate':    return r.modMax;
        case 'Unfavourable': return r.unfMax;
        default:            return r.modMax;
      }
    }
  }
  // If beyond table range, return last row values
  const last = rows[rows.length - 1];
  if (!last) return 0.15;
  switch (condition) {
    case 'Favourable':  return last.favMax;
    case 'Moderate':    return last.modMax;
    case 'Unfavourable': return last.unfMax;
    default:            return last.modMax;
  }
}

/**
 * Auto-select fender from catalog: first fender with energyKj >= E_per
 */
async function selectFender(ePer) {
  const fender = await prisma.jdFenderCatalog.findFirst({
    where: { energyKj: { gte: ePer } },
    orderBy: { energyKj: 'asc' },
  });
  return fender;
}

/**
 * Auto-select QRH from catalog: first hook with classSwlKn >= swlReq
 */
async function selectQrh(swlReqKn) {
  const qrh = await prisma.jdQrhCatalog.findFirst({
    where: { classSwlKn: { gte: swlReqKn } },
    orderBy: { classSwlKn: 'asc' },
  });
  return qrh;
}

/**
 * Auto-select pile from catalog: first pile with mCapKnm >= mbDemand
 */
async function selectPile(mbDemand) {
  const pile = await prisma.jdPileCatalog.findFirst({
    where: { mCapKnm: { gte: mbDemand } },
    orderBy: { mCapKnm: 'asc' },
  });
  return pile;
}

/**
 * Load a unit rate by rateId
 */
async function getRate(rateId) {
  const r = await prisma.jdUnitRate.findUnique({ where: { rateId } });
  return r ? r.rateIdr : 0;
}

/**
 * Load all unit rates as a rateId→rateIdr object
 */
async function loadAllRates() {
  const rows = await prisma.jdUnitRate.findMany();
  const m = {};
  for (const r of rows) m[r.rateId] = r.rateIdr;
  return m;
}

// ─── MAIN CALCULATION ENGINE ──────────────────────────────
async function runFullCalculation(input) {
  const S = await loadSettings();
  const rates = await loadAllRates();

  // ── 1. RESOLVE INPUTS ─────────────────────────────────
  const lpp = input.lpp || input.loa * (S.lpp_ratio || 0.97);
  const cb = input.cbOverride || await lookupCb(input.shipType);
  const tugAssist = input.tugAssist !== false;

  const condition = input.berthingCondition ||
    (tugAssist ? (S.cond_if_tug_YES === 1 ? 'Moderate' : 'Moderate') : 'Unfavourable');
  // Settings store condition as string; map from key
  const conditionResolved = input.berthingCondition || (tugAssist ? 'Moderate' : 'Unfavourable');

  const gAngle = input.gAngle != null ? input.gAngle :
    (tugAssist ? (S.g_default_tug_YES || 3) : (S.g_default_tug_NO || 10));

  const rOverL = S.r_over_l_default || 0.25;
  const rRadius = input.rRadius || rOverL * lpp;

  // Displacement auto-calc
  const lngDensity = S.lng_density || 0.46;
  const dwtCargoRatio = S.dwt_cargo_ratio || 1.05;
  const lightshipFraction = S.lightship_fraction || 0.18;
  const displacement = input.displacement ||
    (input.cargoCapacity * lngDensity * dwtCargoRatio / (1 - lightshipFraction));

  const vb = input.vbOverride || await lookupVb(displacement, conditionResolved);
  const freeboard = input.freeboard || (S.freeboard_default || 8);
  const csResolved = input.csOverride != null ? input.csOverride : (S.cs_rubber || 0.9);
  const ccResolved = input.ccOverride != null ? input.ccOverride : (S.cc_open_piled || 1);
  const nEff = input.nEff || (S.n_eff_default || 1);

  const resolvedInputs = {
    lUsed: round2(lpp),
    cbResolved: round2(cb),
    conditionResolved,
    gResolvedDeg: round2(gAngle),
    rResolvedM: round2(rRadius),
    vbResolvedMs: round2(vb),
    freeboardResolved: round2(freeboard),
    csResolved: round2(csResolved),
    ccResolved: round2(ccResolved),
  };

  // ── 2. CALC BERTHING (BS 6349-4) ─────────────────────
  const beam = input.beam;
  const draft = input.draft;

  // CM = 1 + 2D/B  (BS 6349-4 §4.7.2)
  const CM = 1 + (2 * draft) / beam;

  // K = (0.19*Cb + 0.11) * Lpp  (BS 6349-4 §4.7.3)
  const K = (0.19 * cb + 0.11) * lpp;

  // CE = (K² + R²cos²γ) / (K² + R²)  (BS 6349-4 §4.7.3)
  const K2 = K * K;
  const R2 = rRadius * rRadius;
  const CE = (K2 + R2 * Math.pow(cosd(gAngle), 2)) / (K2 + R2);

  const Cs = csResolved;
  const Cc = ccResolved;

  // E_eff = 0.5 * CM * Δ * Vb² * CE * Cs * Cc  [ton, m/s → kJ]
  const E_eff = 0.5 * CM * displacement * Math.pow(vb, 2) * CE * Cs * Cc / 1000;
  const gammaE = S.gamma_e || 1.1;
  const E_design = gammaE * E_eff;

  const berthingResult = {
    CM: round2(CM),
    K: round2(K),
    CE: round2(CE),
    Cs: round2(Cs),
    Cc: round2(Cc),
    E_eff_kj: round2(E_eff),
    E_design_kj: round2(E_design),
    gammaE,
    displacement: round2(displacement),
  };

  // ── 3. SELECT FENDER ──────────────────────────────────
  const ePer = E_design / nEff;
  const fender = await selectFender(ePer);
  const utilLimit = S.util_limit || 0.9;
  const fenderUtilisation = fender ? ePer / fender.energyKj : 0;

  const fenderResult = {
    ePer_kj: round2(ePer),
    nEff,
    fenderId: fender?.fenderId || 'N/A',
    type: fender?.type || 'N/A',
    energyRated_kj: fender ? round2(fender.energyKj) : 0,
    reaction_kn: fender ? round2(fender.reactionKn) : 0,
    costPerUnit_idr: fender?.costIdr || 0,
    utilisation: round2(fenderUtilisation),
    utilisationPct: round2(fenderUtilisation * 100) + '%',
    status: fender && fenderUtilisation <= utilLimit ? 'OK' : 'FAIL',
  };

  // ── 4. CALC MOORING (OCIMF) ──────────────────────────
  const knotsToMs = S.knots_to_ms || 0.5144;
  const rhoAir = S.rho_air || 1.23;
  const rhoWater = S.rho_water || 1025;
  const cdWind = S.cd_wind || 1.3;
  const cdCurrent = S.cd_current || 0.7;
  const sfQrh = S.sf_qrh || 1.35;
  const nLinesDefault = S.n_lines_default || 4;

  const vw = input.windSpeedKnots * knotsToMs;
  const vc = input.currentSpeedKnots * knotsToMs;
  const loa = input.loa;
  const aw = input.awOverride || loa * freeboard; // m²
  const ac = input.acOverride || loa * draft;      // m²

  // Environmental forces (kN)
  const fWind = 0.5 * rhoAir * cdWind * aw * Math.pow(vw, 2) / 1000;
  const fCurrent = 0.5 * rhoWater * cdCurrent * ac * Math.pow(vc, 2) / 1000;

  let fWave = 0;
  if (input.waveDriftMode === 'User_Input' && input.fWaveUser != null) {
    fWave = input.fWaveUser;
  } else if (input.waveDriftMode === 'k_Wave') {
    const hs = input.hs || 0.5;
    let kWave = S.k_wave_moderate || 1;
    if (input.exposureClass === 'Sheltered') kWave = S.k_wave_sheltered || 0.5;
    if (input.exposureClass === 'Exposed') kWave = S.k_wave_exposed || 2;
    fWave = kWave * Math.pow(hs, 2) * loa / 1000;
  }

  const fTotal = fWind + fCurrent + fWave;
  const nLines = input.nLines || nLinesDefault;
  const tLine = fTotal / nLines;
  const swlReqKn = sfQrh * tLine;
  const swlReqTon = swlReqKn / 9.80665;

  const mooringResult = {
    vw_ms: round2(vw),
    vc_ms: round2(vc),
    aw_m2: round2(aw),
    ac_m2: round2(ac),
    fWind_kn: round2(fWind),
    fCurrent_kn: round2(fCurrent),
    fWave_kn: round2(fWave),
    fTotal_kn: round2(fTotal),
    nLines,
    tLine_kn: round2(tLine),
    swlReq_kn: round2(swlReqKn),
    swlReq_ton: round2(swlReqTon),
  };

  // ── 5. SELECT QRH ─────────────────────────────────────
  const qrh = await selectQrh(swlReqKn);
  const qrhResult = {
    swlReq_kn: round2(swlReqKn),
    classSwl_kn: qrh?.classSwlKn || 0,
    swl_ton: qrh?.swlTon || 0,
    costPerUnit_idr: qrh?.costIdr || 0,
    typeSupplier: qrh?.typeSupplier || 'N/A',
    specLabel: qrh ? `QRH ${qrh.classSwlKn} kN / ${qrh.swlTon} ton` : 'N/A',
  };

  // ── 6. SELECT PILE ────────────────────────────────────
  const fenderReaction = fenderResult.reaction_kn;
  const leverArm = input.leverArmH || 12;
  const nPilesPerBd = input.nPilesPerBd || 14;
  const etaGroup = S.eta_group || 1;
  const mbPerPile = (fenderReaction * leverArm) / nPilesPerBd;
  const mbDemand = mbPerPile / etaGroup;

  const pile = await selectPile(mbDemand);

  const waterDepth = input.waterDepth;
  const penetration = input.penetrationDepth || 10;
  const scour = S.scour_allowance || 1;
  const tolDriving = S.tol_driving || 0.5;
  const segmentLength = S.segment_length || 12;
  const lPile = waterDepth + penetration + scour + tolDriving;
  const segmentsPerPile = Math.ceil(lPile / segmentLength);

  const pileUC = pile ? mbDemand / pile.mCapKnm : 999;

  const pileResult = {
    fenderReaction_kn: round2(fenderReaction),
    leverArm_m: leverArm,
    nPilesPerBd,
    mbPerPile_knm: round2(mbPerPile),
    mbDemand_knm: round2(mbDemand),
    pileD_mm: pile?.dMm || 0,
    pileT_mm: pile?.tMm || 0,
    mCap_knm: pile ? round2(pile.mCapKnm) : 0,
    mass_kgm: pile ? round2(pile.massKgM) : 0,
    uc: round2(pileUC),
    status: pile && pileUC <= 1.0 ? 'OK' : 'FAIL',
    specLabel: pile ? `D${pile.dMm}×${pile.tMm}mm  M_cap=${Math.round(pile.mCapKnm)} kN·m` : 'N/A',
    waterDepth_m: waterDepth,
    penetration_m: penetration,
    lPile_m: round2(lPile),
    segmentsPerPile,
  };

  // ── 7. QTO (Quantity Take-Off) ────────────────────────
  const nBD = input.nBreastingDolphins || 4;
  const nMD = input.nMooringDolphins || 4;
  const nPilesPerMd = input.nPilesPerMd || 11;
  const nFendersPerBd = input.nFendersPerBd || 2;
  const qrhPerMd = S.jumlah_qrh_per_md || 2;
  const anodePerPile = S.anode_per_pile || 1;
  const pilecapVolPerPile = S.pilecap_vol_per_pile || 0.8;
  const rhoVPilecap = S.rho_v_pilecap || 0.02;
  const rhoVSlab = S.rho_v_slab || 0.01;
  const rebarDensity = S.rebar_density || 7.85;
  const infillDepth = S.infill_depth || 1.5;
  const guardrailBdPerim = S.guardrail_bd_perim || 2;
  const guardrailTrestle = S.guardrail_trestle || 2;
  const panjangSisiBD = S.panjang_sisi_bd || 10;
  const panjangSisiMD = S.panjang_sisi_md || 7;
  const pileMass = pile ? pile.massKgM : 254.1;
  const pileDMm = pile ? pile.dMm : 660;
  const projectDuration = input.projectDuration || 12;

  // --- Piles ---
  const nPilesBdTotal = nBD * nPilesPerBd;
  const nPilesMdTotal = nMD * nPilesPerMd;
  const nPilesAll = nPilesBdTotal + nPilesMdTotal;
  const steelPileBd = nPilesBdTotal * lPile * pileMass / 1000;
  const steelPileMd = nPilesMdTotal * lPile * pileMass / 1000;
  const steelPileTotal = steelPileBd + steelPileMd;

  // --- Concrete & Rebar (Dolphins) ---
  const bdCapL = input.bdPileCapLength || 7;
  const bdCapW = input.bdPileCapWidth || 7;
  const bdCapH = input.bdPileCapHeight || 1.5;
  const mdCapL = input.mdPileCapLength || 6;
  const mdCapW = input.mdPileCapWidth || 6;
  const mdCapH = input.mdPileCapHeight || 1.5;

  const pilecapConcBd = nBD * bdCapL * bdCapW * bdCapH;
  const pilecapConcMd = nMD * mdCapL * mdCapW * mdCapH;
  const pilecapRebarBd = pilecapConcBd * rhoVPilecap * rebarDensity;
  const pilecapRebarMd = pilecapConcMd * rhoVPilecap * rebarDensity;

  const pileAreaM2 = Math.PI * Math.pow(pileDMm / 1000, 2) / 4;
  const infillBd = nPilesBdTotal * pileAreaM2 * infillDepth;
  const infillMd = nPilesMdTotal * pileAreaM2 * infillDepth;

  // --- Trestle (active only for Jetty_Dolphins) ---
  const isJetty = input.conceptType === 'Jetty_Dolphins';
  const trestleLength = isJetty ? (input.trestleLength || 600) : 0;
  const nTrestleBents = trestleLength > 0 ? Math.floor(trestleLength / (segmentLength || 12)) : 0;
  const nTrestlePiles = nTrestleBents * 2;
  const steelPileTrestle = nTrestlePiles * lPile * pileMass / 1000;
  const slabThk = S.slab_thk || 0.2;
  const slabConcTrestle = 4 * slabThk * trestleLength; // width 4m
  const slabRebarTrestle = slabConcTrestle * rhoVSlab * rebarDensity;
  const guardrailTrestleM = trestleLength * guardrailTrestle;

  // --- Marine Equipment ---
  const fenderTotal = nBD * nFendersPerBd;
  const qrhTotal = nMD * qrhPerMd;
  const anodeBd = nPilesBdTotal * anodePerPile;
  const anodeMd = nPilesMdTotal * anodePerPile;
  const anodeTotal = anodeBd + anodeMd;
  const guardrailBdM = nBD * 4 * panjangSisiBD;
  const guardrailMdM = nMD * 4 * panjangSisiMD;

  // --- Infill Rebar & Formwork ---
  const infillRebarBd = infillBd * rhoVPilecap * rebarDensity;
  const infillRebarMd = infillMd * rhoVPilecap * rebarDensity;
  const infillFormworkBd = nPilesBdTotal; // 1 per pile
  const infillFormworkMd = nPilesMdTotal;

  // --- Insitu Pilecap Formwork ---
  const formworkFactorCap = S.formwork_factor_cap || 3.5;
  const formworkPilecapBd = pilecapConcBd * formworkFactorCap;
  const formworkPilecapMd = pilecapConcMd * formworkFactorCap;

  // --- Jetty Head QTO ---
  const jhL = input.jettyHeadLength || 30;
  const jhW = input.jettyHeadWidth || 15;
  const jhSlabThk = S.jh_slab_thk || 0.2;
  const jhBeamDepth = S.jh_beam_depth || 0.8;
  const jhBeamWidth = S.jh_beam_width || 1.2;
  const jhBeamSpacing = S.jh_beam_spacing || 3;
  const jhPilecapThk = S.jh_pilecap_thk || 1.2;
  const jhPilecapWidth = S.jh_pilecap_width || 5;

  const pilecapType = 'Insitu'; // from settings
  const slabType = 'Precast';
  const beamType = 'Precast';
  const precastRebarRatio = S.precast_rebar_ratio || 0.016;
  const insituRebarRatio = S.insitu_rebar_ratio || 0.02;
  const formworkFactorSlab = S.formwork_factor_slab || 2;
  const formworkFactorBeam = S.formwork_factor_beam || 4.5;

  // JH pile groups
  const jhPileGroupA = 3;
  const jhPileGroupB = 3;
  const jhTotalPiles = jhPileGroupA * jhPileGroupB;
  const steelPileJh = jhTotalPiles * lPile * pileMass / 1000;

  const jhSlabConc = jhL * jhW * jhSlabThk;
  const jhSlabRebarRatio = slabType === 'Precast' ? precastRebarRatio : insituRebarRatio;
  const jhSlabRebar = jhSlabConc * jhSlabRebarRatio * rebarDensity;
  const jhSlabFormwork = slabType === 'Precast' ? 0 : jhSlabConc * formworkFactorSlab;

  const nBeams = Math.floor(jhW / jhBeamSpacing);
  const jhBeamConc = nBeams * jhL * jhBeamWidth * jhBeamDepth;
  const jhBeamRebarRatio = beamType === 'Precast' ? precastRebarRatio : insituRebarRatio;
  const jhBeamRebar = jhBeamConc * jhBeamRebarRatio * rebarDensity;
  const jhBeamFormwork = beamType === 'Precast' ? 0 : jhBeamConc * formworkFactorBeam;

  const jhPilecapConc = jhTotalPiles * jhPilecapWidth * jhPilecapWidth * jhPilecapThk;
  const jhPilecapRebarRatio = pilecapType === 'Precast' ? precastRebarRatio : insituRebarRatio;
  const jhPilecapRebar = jhPilecapConc * jhPilecapRebarRatio * rebarDensity;
  const jhPilecapFormwork = pilecapType === 'Precast' ? 0 : jhPilecapConc * formworkFactorCap;

  const jhInfill = jhTotalPiles * pileAreaM2 * infillDepth;
  const jhGuardrail = 2 * (jhL + jhW);
  const jhSplashZone = jhTotalPiles * 3;
  const jhPdaTest = Math.max(1, Math.ceil(jhTotalPiles * 0.05));
  const jhAnode = jhTotalPiles * anodePerPile;

  // --- Precast/Insitu Adaptive (Jetty Head slab & beam) ---
  const slabConc = jhSlabConc;
  const slabRebar = jhSlabRebar;
  const slabFormwork = jhSlabFormwork;
  const beamConc = jhBeamConc;
  const beamRebar = jhBeamRebar;
  const beamFormwork = jhBeamFormwork;

  // --- Time-based ---
  const accommodationMonths = projectDuration;
  const waterSupplyMonths = projectDuration;
  const electricityMonths = projectDuration;

  // --- PDA Tests ---
  const pdaTestBd = Math.max(1, Math.ceil(nPilesBdTotal * 0.05));
  const pdaTestMd = Math.max(1, Math.ceil(nPilesMdTotal * 0.05));
  const pdaTestTotal = pdaTestBd + pdaTestMd;

  // --- Splash Zone & Corner Protection ---
  const splashZoneBd = nPilesBdTotal * 3;
  const splashZoneMd = nPilesMdTotal * 3;
  const cornerProtBd = nBD * 4 * 1;    // 4 corners × 1m per BD
  const cornerProtMd = nMD * 4 * 0.8;  // 4 corners × 0.8m per MD

  // --- Marine Equipment (Jetty Head) ---
  const dockingSpeedSensor = nBD;
  const longRangeLaser = nBD;
  const waveTideGauge = 1;
  const navAidMd = nMD;
  const navAidJh = isJetty ? 2 : 0;
  const loadingArm = isJetty ? 1 : 0;
  const fireMonitor = isJetty ? 2 : 0;
  const floodLight = (nBD + nMD) * 2;
  const serviceBuilding = isJetty ? 1 : 0;
  const marineBuoy = nMD;
  const catwalkCount = 3;

  const qto = {
    piles: {
      nPilesBdTotal, nPilesMdTotal, nPilesAll,
      lPile_m: round2(lPile),
      steelPileBd_ton: round2(steelPileBd),
      steelPileMd_ton: round2(steelPileMd),
      steelPileTotal_ton: round2(steelPileTotal),
    },
    concreteRebar: {
      pilecapConcBd_m3: round2(pilecapConcBd),
      pilecapConcMd_m3: round2(pilecapConcMd),
      pilecapRebarBd_ton: round2(pilecapRebarBd),
      pilecapRebarMd_ton: round2(pilecapRebarMd),
      infillBd_m3: round2(infillBd),
      infillMd_m3: round2(infillMd),
    },
    infillRebarFormwork: {
      infillRebarBd_ton: round2(infillRebarBd),
      infillRebarMd_ton: round2(infillRebarMd),
      infillFormworkBd_unit: infillFormworkBd,
      infillFormworkMd_unit: infillFormworkMd,
    },
    insituPilecapFormwork: {
      formworkPilecapBd_m2: round2(formworkPilecapBd),
      formworkPilecapMd_m2: round2(formworkPilecapMd),
    },
    trestle: isJetty ? {
      trestleLength_m: trestleLength,
      nTrestleBents, nTrestlePiles,
      steelPileTrestle_ton: round2(steelPileTrestle),
      slabConcTrestle_m3: round2(slabConcTrestle),
      slabRebarTrestle_ton: round2(slabRebarTrestle),
      guardrailTrestle_m: round2(guardrailTrestleM),
    } : null,
    marineEquipment: {
      fenderTotal, qrhTotal,
      anodeBd, anodeMd, anodeTotal,
      guardrailBd_m: round2(guardrailBdM),
      guardrailMd_m: round2(guardrailMdM),
    },
    timeBased: {
      projectDuration_bln: projectDuration,
      bargeMonths: projectDuration,
      pmMonths: projectDuration,
      engineerMonths: projectDuration,
      accommodationMonths, waterSupplyMonths, electricityMonths,
    },
    pdaTest: { pdaTestBd, pdaTestMd, pdaTestTotal },
    splashZone: {
      splashZoneBd_m: splashZoneBd,
      splashZoneMd_m: splashZoneMd,
      cornerProtBd_m: round2(cornerProtBd),
      cornerProtMd_m: round2(cornerProtMd),
    },
    emergencyLadder: { bd: nBD, md: nMD },
    marineEquipmentJh: isJetty ? {
      dockingSpeedSensor, longRangeLaser, waveTideGauge,
      navAidMd, navAidJh, loadingArm, fireMonitor,
      floodLight, serviceBuilding, marineBuoy, catwalkCount,
    } : null,
    precastInsituAdaptive: isJetty ? {
      slabConc_m3: round2(slabConc),
      slabRebar_ton: round2(slabRebar),
      slabFormwork_m2: round2(slabFormwork),
      beamConc_m3: round2(beamConc),
      beamRebar_ton: round2(beamRebar),
      beamFormwork_m2: round2(beamFormwork),
    } : null,
    jettyHead: isJetty ? {
      jhPileGroupA, jhPileGroupB, jhTotalPiles,
      steelPileJh_ton: round2(steelPileJh),
      jhSlabConc_m3: round2(jhSlabConc),
      jhSlabRebar_ton: round2(jhSlabRebar),
      jhSlabFormwork_m2: round2(jhSlabFormwork),
      jhBeamConc_m3: round2(jhBeamConc),
      jhBeamRebar_ton: round2(jhBeamRebar),
      jhBeamFormwork_m2: round2(jhBeamFormwork),
      jhPilecapConc_m3: round2(jhPilecapConc),
      jhPilecapRebar_ton: round2(jhPilecapRebar),
      jhPilecapFormwork_m2: round2(jhPilecapFormwork),
      jhInfill_m3: round2(jhInfill),
      jhGuardrail_m: round2(jhGuardrail),
      jhSplashZone_m: jhSplashZone,
      jhPdaTest, jhAnode,
      jhCornerProt_m: 4,
      safetyGuardrailJh_m: round2(jhL * jhW), // per spreadsheet: Length x Width
      pemasanganGuardrailJh_m: round2(jhL * jhW),
    } : null,
  };

  // ── 8. CAPEX ──────────────────────────────────────────
  const R = (id) => rates[id] || 0;

  function buildCapexDolphin() {
    const items = [];
    let no = 0;

    const add = (itemName, spec, qty, satuan, rateIdr, rateId, kategori, subKategori, aaceClass) => {
      no++;
      items.push({
        no, item: itemName, specification: spec,
        qty: round2(qty), satuan, rateIdr: round2(rateIdr),
        totalCostIdr: round2(qty * rateIdr),
        kategori, subKategori, aaceClass: aaceClass || 5, rateId,
      });
    };

    // PEKERJAAN PERSIAPAN
    add('Survey Batimetri & Topografi', '1 Ls', 1, 'Ls', R('GEN-003'), 'GEN-003', 'Eng & Manajemen', 'Jasa Konsultasi', 5);
    add('Perizinan & AMDAL', '1 Ls', 1, 'Ls', R('GEN-004'), 'GEN-004', 'Eng & Manajemen', 'Perizinan', 5);
    add('Kantor Proyek / Direksi Keet', 'Asumsi 60 m²', isJetty ? 120 : 60, 'm²', R('GEN-006'), 'GEN-006', 'Konstruksi', 'Pekerjaan Persiapan', 5);
    add('Pembangunan Temporary Access', '1 Ls', 1, 'Ls', R('GEN-005'), 'GEN-005', 'Konstruksi', 'Pekerjaan Persiapan', 5);
    add('Stockyard (asumsi 500 m²)', 'Asumsi 500 m²', 500, 'm²', R('GEN-009'), 'GEN-009', 'Konstruksi', 'Pekerjaan Persiapan', 5);
    add('Fabrication Yard (300 m²)', 'Asumsi 300 m²', 300, 'm²', R('GEN-010'), 'GEN-010', 'Konstruksi', 'Pekerjaan Persiapan', 5);
    add('Operasional Kantor Proyek', `${projectDuration}`, projectDuration, 'Bulan', R('GEN-007'), 'GEN-007', 'Eng & Manajemen', 'Pekerjaan Persiapan', 5);
    add('Pembuatan Papan Nama Proyek', '1 unit', 1, 'unit', R('GEN-008'), 'GEN-008', 'Konstruksi', 'Pekerjaan Persiapan', 5);
    add('Mob Demob Equipment, Material, Man Power', '1 Ls', 1, 'Ls', R('GEN-001'), 'GEN-001', 'Konstruksi', 'Pekerjaan Persiapan', 5);
    add('Sewa Barge + Crane (Bulanan)', `${projectDuration}`, projectDuration, 'Bulan', R('GEN-002'), 'GEN-002', 'Konstruksi', 'Mobilisasi', 5);
    add('Radio / Alat Komunikasi', '12 unit', 12, 'unit', R('GEN-011'), 'GEN-011', 'Eng & Manajemen', 'Alat Komunikasi', 5);
    add('Safety tool, Equipments & Safety Document', '1 Ls', 1, 'Ls', R('GEN-015'), 'GEN-015', 'Konstruksi', 'K3 & Keselamatan', 5);
    add('Accomodation During Project', `${projectDuration}`, projectDuration, 'Bln', R('GEN-012'), 'GEN-012', 'Eng & Manajemen', 'Indirect Cost', 5);
    add('Penyediaan Air & Listrik', `${projectDuration}`, projectDuration, 'Bln', (R('GEN-013') || 8500000) + (R('GEN-014') || 15000000), 'GEN-013', 'Konstruksi', 'Utilitas', 5);

    // PROJECT MANAGEMENT
    add('Project Manager', `${projectDuration}`, projectDuration, 'Bulan', R('MGT-001'), 'MGT-001', 'Eng & Manajemen', 'Jasa Konsultasi', 5);
    add('Civil Engineer', `${projectDuration}`, projectDuration, 'Bulan', R('MGT-002'), 'MGT-002', 'Eng & Manajemen', 'Jasa Konsultasi', 5);
    add('Mechanical/Marine Engineer', `${projectDuration}`, projectDuration, 'Bulan', R('MGT-002'), 'MGT-002', 'Eng & Manajemen', 'Jasa Konsultasi', 5);
    add('HSSE Officer', `${projectDuration}`, projectDuration, 'Bulan', R('MGT-003'), 'MGT-003', 'Eng & Manajemen', 'Jasa Konsultasi', 5);
    add('QA/QC Engineer', `${projectDuration}`, projectDuration, 'Bulan', R('MGT-004'), 'MGT-004', 'Eng & Manajemen', 'Jasa Konsultasi', 5);
    add('Site/Construction Manager', `${projectDuration}`, projectDuration, 'Bulan', R('MGT-005'), 'MGT-005', 'Eng & Manajemen', 'Jasa Konsultasi', 6);
    add('Planning Engineer / Scheduler', `${projectDuration}`, projectDuration, 'Bulan', R('MGT-006'), 'MGT-006', 'Eng & Manajemen', 'Jasa Konsultasi', 7);
    add('Cost Control Engineer', `${projectDuration}`, projectDuration, 'Bulan', R('MGT-007'), 'MGT-007', 'Eng & Manajemen', 'Jasa Konsultasi', 8);
    add('Document Controller', `${projectDuration}`, projectDuration, 'Bulan', R('MGT-008'), 'MGT-008', 'Eng & Manajemen', 'Jasa Konsultasi', 9);

    // STRUKTUR BREASTING DOLPHIN
    add('Steel Pipe Pile Breasting Dolphin', pileResult.specLabel, steelPileBd, 'ton', R('STR-001'), 'STR-001', 'Material & Equipment', 'Pipa Baja', 5);
    add('Jasa Pemancangan Breasting Dolphin', `${nPilesBdTotal} piles`, steelPileBd, 'ton', R('STR-002'), 'STR-002', 'Konstruksi', 'Pekerjaan Pemancangan', 5);
    add('Beton Pile Cap BD (C35)', 'Grade C35', pilecapConcBd, 'm³', R('STR-009'), 'STR-009', 'Material & Equipment', 'Material Sipil', 5);
    add('Pekerjaan Beton Pile Cap BD', 'incl bekisting + curing', pilecapConcBd, 'm³', R('STR-004'), 'STR-004', 'Konstruksi', 'Pekerjaan Sipil', 5);
    add('Rebar Pile Cap BD (BJTS 420)', 'BJTS 420 / ASTM A615 Gr60', pilecapRebarBd, 'ton', R('STR-005'), 'STR-005', 'Material & Equipment', 'Material Sipil', 5);
    add('Infill Pile Head Beton BD (C35)', 'Grade C35, infill 1.5m', infillBd, 'm³', R('STR-008'), 'STR-008', 'Material & Equipment', 'Material Sipil', 5);
    add('Infill Pile Head Reinforcement BD', 'BJTS 420 / ASTM A615 Gr60', infillRebarBd, 'ton', R('STR-005'), 'STR-005', 'Material & Equipment', 'Material Sipil', 5);
    add('Fender', fenderResult.fenderId + ' ' + fenderResult.type, fenderTotal, 'unit', fenderResult.costPerUnit_idr, 'EQP-FENDER', 'Material & Equipment', 'Marine Equipment', 5);
    add('Safety Guardrail BD (incl. support)', 'Galvanized ASTM A36', guardrailBdM, 'm', R('STR-006'), 'STR-006', 'Material & Equipment', 'Perlengkapan', 5);
    add('Pemasangan Guardrail BD', 'labour', guardrailBdM, 'm', R('STR-012'), 'STR-012', 'Konstruksi', 'Pekerjaan Sipil', 5);
    add('Splash zone protection BD', 'HDPE Wrap', splashZoneBd, 'm', R('STR-010'), 'STR-010', 'Material & Equipment', 'Perlengkapan', 5);
    add('Emergency ladder BD', 'per dolphin', nBD, 'unit', R('MEP-001'), 'MEP-001', 'Material & Equipment', 'Perlengkapan', 5);
    add('PDA Test BD', 'min 5% piles', pdaTestBd, 'test', R('STR-013'), 'STR-013', 'Konstruksi', 'QC & Testing', 5);
    add('Docking speed sensor', 'per BD', nBD, 'unit', R('MEP-003'), 'MEP-003', 'Material & Equipment', 'Marine Equipment', 5);
    add('Long range laser sensor', 'per BD', nBD, 'unit', R('MEP-004'), 'MEP-004', 'Material & Equipment', 'Marine Equipment', 5);
    add('Wave and tide laser', 'per lokasi', 1, 'unit', R('MEP-005'), 'MEP-005', 'Material & Equipment', 'Marine Equipment', 5);
    add('Cathodic Protection — Anode BD', 'Al-Zn Bracelet Anode', anodeBd, 'unit', R('STR-007'), 'STR-007', 'Material & Equipment', 'Proteksi Korosi', 5);
    add('Insitu Pilecap Formwork BD', 'bekisting konvensional', formworkPilecapBd, 'm²', R('STR-014'), 'STR-014', 'Konstruksi', 'Pekerjaan Sipil', 5);
    add('Infill Formwork BD', 'circular formwork per pile', infillFormworkBd, 'unit', R('STR-015'), 'STR-015', 'Konstruksi', 'Pekerjaan Sipil', 5);

    // STRUKTUR MOORING DOLPHIN
    add('Steel Pipe Pile Mooring Dolphin', pileResult.specLabel, steelPileMd, 'ton', R('STR-001'), 'STR-001', 'Material & Equipment', 'Pipa Baja', 5);
    add('Jasa Pemancangan Mooring Dolphin', `${nPilesMdTotal} piles`, steelPileMd, 'ton', R('STR-002'), 'STR-002', 'Konstruksi', 'Pekerjaan Pemancangan', 5);
    add('Beton Pile Cap MD (C35)', 'Grade C35', pilecapConcMd, 'm³', R('STR-009'), 'STR-009', 'Material & Equipment', 'Material Sipil', 5);
    add('Pekerjaan Beton Pile Cap MD', 'incl bekisting', pilecapConcMd, 'm³', R('STR-004'), 'STR-004', 'Konstruksi', 'Pekerjaan Sipil', 5);
    add('Rebar Pile Cap MD (BJTS 420)', 'BJTS 420 / ASTM A615 Gr60', pilecapRebarMd, 'ton', R('STR-005'), 'STR-005', 'Material & Equipment', 'Material Sipil', 5);
    add('Insitu Pilecap Formwork MD', 'bekisting konvensional', formworkPilecapMd, 'm²', R('STR-014'), 'STR-014', 'Konstruksi', 'Pekerjaan Sipil', 5);
    add('Infill Pile Head Beton MD', 'Grade C35, infill 1.5m', infillMd, 'm³', R('STR-008'), 'STR-008', 'Material & Equipment', 'Material Sipil', 5);
    add('Infill Pile Head Reinforcement MD', 'BJTS 420', infillRebarMd, 'ton', R('STR-005'), 'STR-005', 'Material & Equipment', 'Material Sipil', 5);
    add('Infill Pile Head Formwork MD', 'circular formwork per pile', infillFormworkMd, 'unit', R('STR-015'), 'STR-015', 'Konstruksi', 'Pekerjaan Sipil', 5);
    add('Quick Release Hook (QRH)', qrhResult.specLabel, qrhTotal, 'unit', qrhResult.costPerUnit_idr, 'EQP-QRH', 'Material & Equipment', 'Marine Equipment', 5);
    add('Safety Guardrail MD', 'Galvanized ASTM A36', guardrailMdM, 'm', R('STR-006'), 'STR-006', 'Material & Equipment', 'Perlengkapan', 5);
    add('Pemasangan Guardrail MD', 'labour', guardrailMdM, 'm', R('STR-012'), 'STR-012', 'Konstruksi', 'Pekerjaan Sipil', 5);
    add('Splash zone protection MD', 'HDPE Wrap per meter pile', splashZoneMd, 'm', R('STR-010'), 'STR-010', 'Material & Equipment', 'Perlengkapan', 5);
    add('Corner protection MD', 'ASTM A36 galvanis', cornerProtMd, 'm', R('STR-011'), 'STR-011', 'Material & Equipment', 'Perlengkapan', 5);
    add('Emergency ladder MD', 'per dolphin', nMD, 'unit', R('MEP-001'), 'MEP-001', 'Material & Equipment', 'Perlengkapan', 5);
    add('PDA Test MD', 'min 5% piles', pdaTestMd, 'test', R('STR-013'), 'STR-013', 'Konstruksi', 'QC & Testing', 5);
    add('Navigation aid MD', 'solar + light', nMD, 'unit', R('MEP-002'), 'MEP-002', 'Material & Equipment', 'Marine Equipment', 5);
    add('Cathodic Protection — Anode MD', 'Al-Zn Bracelet Anode', anodeMd, 'unit', R('STR-007'), 'STR-007', 'Material & Equipment', 'Proteksi Korosi', 5);

    // CATWALK
    add('Catwalk Structure', 'Catwalk', catwalkCount, 'unit', R('MEP-011'), 'MEP-011', 'Material & Equipment', 'Marine Equipment', 5);

    return items;
  }

  function buildCapexJettyHead() {
    if (!isJetty) return [];
    const items = [];
    let no = 0;
    const add = (itemName, spec, qty, satuan, rateIdr, rateId, kategori, subKategori, aaceClass) => {
      no++;
      items.push({
        no, item: itemName, specification: spec,
        qty: round2(qty), satuan, rateIdr: round2(rateIdr),
        totalCostIdr: round2(qty * rateIdr),
        kategori, subKategori, aaceClass: aaceClass || 5, rateId,
      });
    };

    // JETTY HEAD STRUCTURE
    add('Steel Pipe Pile Jetty Head', pileResult.specLabel, steelPileJh, 'ton', R('STR-001'), 'STR-001', 'Material & Equipment', 'Pipa Baja', 5);
    add('Jasa Pemancangan Jetty Head', `${jhTotalPiles} piles`, steelPileJh, 'ton', R('STR-002'), 'STR-002', 'Konstruksi', 'Pekerjaan Pemancangan', 5);
    add('Beton Pile Cap JH', 'Grade C35', jhPilecapConc, 'm³', R('STR-009'), 'STR-009', 'Material & Equipment', 'Material Sipil', 5);
    add('Precast Slab Concrete Jetty Head', 'incl bekisting', jhSlabConc, 'm³', R('STR-004'), 'STR-004', 'Konstruksi', 'Pekerjaan Sipil', 5);
    add('Precast Slab Reinforcement JH', 'BJTS 420 / ASTM A615 Gr60', jhSlabRebar, 'ton', R('STR-005'), 'STR-005', 'Material & Equipment', 'Material Sipil', 5);
    add('Precast Beam Concrete JH', 'incl bekisting', jhBeamConc, 'm³', R('STR-004'), 'STR-004', 'Konstruksi', 'Pekerjaan Sipil', 5);
    add('Precast Beam Reinforcement JH', 'BJTS 420 / ASTM A615 Gr60', jhBeamRebar, 'ton', R('STR-005'), 'STR-005', 'Material & Equipment', 'Material Sipil', 5);
    add('Precast Pilecap Concrete JH', 'incl bekisting', jhPilecapConc, 'm³', R('STR-004'), 'STR-004', 'Konstruksi', 'Pekerjaan Sipil', 5);
    add('Precast Pilecap Reinforcement JH', 'BJTS 420 / ASTM A615 Gr60', jhPilecapRebar, 'ton', R('STR-005'), 'STR-005', 'Material & Equipment', 'Material Sipil', 5);
    add('Pilecap Formwork JH', pilecapType, jhPilecapFormwork, 'm²', R('STR-014'), 'STR-014', 'Konstruksi', 'Pekerjaan Sipil', 5);
    add('Infill Pile Head Beton JH', 'Grade C35, infill 1.5m', jhInfill, 'm³', R('STR-008'), 'STR-008', 'Material & Equipment', 'Material Sipil', 5);
    add('Safety Guardrail JH', 'Galvanized ASTM A36', jhGuardrail, 'm', R('STR-006'), 'STR-006', 'Material & Equipment', 'Perlengkapan', 5);
    add('Pemasangan Guardrail JH', 'labour', jhGuardrail, 'm', R('STR-012'), 'STR-012', 'Konstruksi', 'Pekerjaan Sipil', 5);
    add('Splash zone protection JH', 'HDPE', jhSplashZone, 'm', R('STR-010'), 'STR-010', 'Material & Equipment', 'Perlengkapan', 5);
    add('PDA Test JH', 'min 5% piles', jhPdaTest, 'test', R('STR-013'), 'STR-013', 'Konstruksi', 'QC & Testing', 5);
    add('Cathodic Protection — Anode JH', 'Al-Zn Bracelet Anode', jhAnode, 'unit', R('STR-007'), 'STR-007', 'Material & Equipment', 'Proteksi Korosi', 5);
    add('Loading arm', '1 unit', loadingArm, 'NOS', R('MEP-006'), 'MEP-006', 'Material & Equipment', 'Marine Equipment', 5);
    add('Fire monitor', 'dry powder/foam', fireMonitor, 'NOS', R('MEP-007'), 'MEP-007', 'Material & Equipment', 'Marine Equipment', 5);
    add('Flood light', 'per tiang', floodLight, 'NOS', R('MEP-008'), 'MEP-008', 'Material & Equipment', 'Perlengkapan', 5);
    add('Service building', '1 unit', serviceBuilding, 'NOS', R('MEP-009'), 'MEP-009', 'Material & Equipment', 'Bangunan', 5);
    add('Marine Buoy', 'per unit lengkap', marineBuoy, 'NOS', R('MEP-010'), 'MEP-010', 'Material & Equipment', 'Marine Equipment', 5);
    add('Navigation Aid JH', 'solar + light', navAidJh, 'NOS', R('MEP-002'), 'MEP-002', 'Material & Equipment', 'Marine Equipment', 5);

    return items;
  }

  function buildCapexTrestle() {
    if (!isJetty) return [];
    const items = [];
    let no = 0;
    const add = (itemName, spec, qty, satuan, rateIdr, rateId, kategori, subKategori, aaceClass) => {
      no++;
      items.push({
        no, item: itemName, specification: spec,
        qty: round2(qty), satuan, rateIdr: round2(rateIdr),
        totalCostIdr: round2(qty * rateIdr),
        kategori, subKategori, aaceClass: aaceClass || 5, rateId,
      });
    };

    add('Steel Pipe Pile Trestle', pileResult.specLabel, steelPileTrestle, 'ton', R('STR-001'), 'STR-001', 'Material & Equipment', 'Pipa Baja', 5);
    add('Jasa Pemancangan Trestle', `${nTrestlePiles} piles`, steelPileTrestle, 'ton', R('STR-002'), 'STR-002', 'Konstruksi', 'Pekerjaan Pemancangan', 5);
    add('Beton Slab Trestle (C35)', 'Grade C35, t=200mm', slabConcTrestle, 'm³', R('STR-003'), 'STR-003', 'Material & Equipment', 'Material Sipil', 5);
    add('Pekerjaan Beton Slab Trestle', 'incl bekisting', slabConcTrestle, 'm³', R('STR-004'), 'STR-004', 'Konstruksi', 'Pekerjaan Sipil', 5);
    add('Rebar Slab Trestle', 'BJTS 420', slabRebarTrestle, 'ton', R('STR-005'), 'STR-005', 'Material & Equipment', 'Material Sipil', 5);
    add('Safety Guardrail Trestle (2 sisi)', 'Galvanized ASTM A36', guardrailTrestleM, 'm', R('STR-006'), 'STR-006', 'Material & Equipment', 'Perlengkapan', 5);
    add('Pemasangan Guardrail Trestle', 'labour', guardrailTrestleM, 'm', R('STR-012'), 'STR-012', 'Konstruksi', 'Pekerjaan Sipil', 5);

    return items;
  }

  const capexDolphin = buildCapexDolphin();
  const capexJettyHead = buildCapexJettyHead();
  const capexTrestle = buildCapexTrestle();

  const allCapexItems = [...capexDolphin, ...capexJettyHead, ...capexTrestle];
  const subtotalDirectCost = allCapexItems.reduce((s, i) => s + i.totalCostIdr, 0);
  const epcRate = S.rate_epc || 0.10;
  const pmcRate = S.rate_pmc || 0.03;
  const epcFee = subtotalDirectCost * epcRate;
  const pmcFee = (subtotalDirectCost + epcFee) * pmcRate;
  const grandTotalIdr = subtotalDirectCost + epcFee + pmcFee;
  const usdRate = input.usdRate || 16300;
  const grandTotalUsd = grandTotalIdr / usdRate;

  const capexSummary = {
    conceptType: input.conceptType,
    subtotalDirectCost_idr: round2(subtotalDirectCost),
    epcFee_idr: round2(epcFee),
    epcRate,
    pmcFee_idr: round2(pmcFee),
    pmcRate,
    grandTotal_idr: round2(grandTotalIdr),
    grandTotal_usd: round2(grandTotalUsd),
    usdRate,
  };

  // ── 9. CHECK SUMMARY ─────────────────────────────────
  const checkSummary = {
    eEff: { value: round2(E_eff), status: 'OK' },
    eDesign: { value: round2(E_design), status: 'OK' },
    fenderUC: {
      value: round2(fenderUtilisation),
      limit: utilLimit,
      status: fenderUtilisation <= utilLimit ? 'OK' : 'FAIL',
    },
    pileUC: {
      value: round2(pileUC),
      limit: 1.0,
      status: pileUC <= 1.0 ? 'OK' : 'FAIL',
    },
    fTotalMooring: { value: round2(fTotal), status: 'OK' },
    swlReqQrh: {
      value: round2(swlReqKn),
      status: qrh ? 'OK' : 'FAIL',
      label: qrhResult.specLabel,
    },
    waterDepthCoverage: {
      value: waterDepth,
      limit: draft + 1.5,
      status: waterDepth >= draft + 1.5 ? 'OK' : 'WARNING',
    },
  };

  return {
    resolvedInputs,
    berthing: berthingResult,
    fender: fenderResult,
    mooring: mooringResult,
    qrh: qrhResult,
    pile: pileResult,
    qto,
    capex: {
      dolphinItems: capexDolphin,
      jettyHeadItems: capexJettyHead,
      trestleItems: capexTrestle,
      summary: capexSummary,
    },
    checkSummary,
  };
}

module.exports = {
  runFullCalculation,
  loadSettings,
  lookupCb,
  lookupVb,
  selectFender,
  selectQrh,
  selectPile,
  loadAllRates,
};
