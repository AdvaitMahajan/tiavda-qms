export type LineItem = {
  section: string;
  description: string;
  unit: string;
  qty: number;
  rate: number;
  amount: number;
  remark?: string;
  is_qro?: boolean;
  subsection?: string;
};

export type Variant = "standard" | "conservative" | "extended" | "minimal";

export type SiteConditions = {
  waterAvailable?: boolean;
  electricityAvailable?: boolean;
  securityAvailable?: boolean;
  accessClear?: boolean;
  permissionsObtained?: boolean;
  safetyRequirements?: string;
  siteVisitCostFactors?: string[];
  siteVisitFeasibility?: string;
  siteVisitObservations?: string;
  siteVisitRecommendations?: string;
};

export const RATE_KEYS = [
  "rate_mobilisation_per_bore",
  "rate_drilling_soil_per_m",
  "rate_drilling_rock_per_m",
  "rate_spt_per_test",
  "rate_uds_per_sample",
  "rate_core_box",
  "rate_water_sample",
  "rate_lab_soil_per_sample",
  "rate_lab_rock_per_sample",
  "rate_lab_water_per_sample",
  "rate_travel_per_km",
  "rate_reporting_per_bore",
  "rate_boring_log_per_bore",
  "rate_misc_lumpsum",
  "rate_setup_per_move",
  "rate_water_arrangement",
  "rate_safety_arrangement",
  "rate_generator_arrangement",
  "rate_security_arrangement",
  "rate_access_arrangement",
] as const;



const VARIANT_MULTIPLIERS: Record<Variant, { drilling: number; lab: number }> = {
  standard: { drilling: 1.0, lab: 1.0 },
  conservative: { drilling: 1.15, lab: 1.15 },
  extended: { drilling: 1.3, lab: 1.3 },
  minimal: { drilling: 0.85, lab: 0.85 },
};

function r(rates: Record<string, number>, key: string): number {
  return rates[key] ?? 0;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** How a City Rate Matrix row derives its quantity. Mirrors templateRegistry's QtyDriver. */
export type RateBasis = 'lump_sum' | 'per_bore' | 'soil_meters' | 'rock_meters' | 'per_metre_total';

export interface CityCustomRow {
  label: string;
  basis: string;
  unit: string | null;
  rate: number;
  /** 'si' | 'boq' | 'both' — which quotation formats this row belongs in. */
  applies_to?: string;
}

export function buildLineItems(params: {
  numBores: number;
  depthPerBore: number;
  soilFraction?: number;
  distanceKm?: number;
  rates: Record<string, number>;
  variant: Variant;
  siteConditions?: SiteConditions;
  costOverrides?: Record<string, number>;
  /** City Rate Matrix: how the mobilisation row is charged (default keeps legacy per-bore). */
  mobilisationBasis?: RateBasis;
  /** City Rate Matrix: custom activities (no engine rate key) appended as line items. */
  cityCustomRows?: CityCustomRow[];
  /** @deprecated Use siteConditions instead */
  extendedData?: { waterAvailable?: boolean; safetyRequirements?: string };
}): LineItem[] {
  const {
    numBores,
    depthPerBore,
    soilFraction = 0.7,
    distanceKm = 50,
    rates,
    variant,
    mobilisationBasis = 'per_bore',
    cityCustomRows = [],
  } = params;

  const rockFraction = round2(1 - soilFraction);
  const mul = VARIANT_MULTIPLIERS[variant];
  const B = numBores;
  const D = depthPerBore;
  const soilDepth = round2(D * soilFraction);
  const rockDepth = round2(D * rockFraction);

  const items: LineItem[] = [];

  // Quantity for a City Rate Matrix basis.
  const qtyForBasis = (basis: string): number => {
    switch (basis) {
      case "lump_sum": return 1;
      case "per_bore": return B;
      case "soil_meters": return round2(B * soilDepth);
      case "rock_meters": return round2(B * rockDepth);
      case "per_metre_total": return round2(B * D);
      default: return 1;
    }
  };

  // ── Section A: Field Work ──
  // Mobilisation basis is configurable via the City Rate Matrix: the client's sheet
  // quotes it as a flat per-city amount (lump sum), while the legacy default charged
  // it per bore. Default stays per-bore so existing behaviour is unchanged.
  const mobRate = r(rates, "rate_mobilisation_per_bore");
  const mobQty = qtyForBasis(mobilisationBasis);
  items.push({
    section: "A",
    description: "Mobilisation & De-mobilisation",
    unit: mobilisationBasis === "lump_sum" ? "Lump sum" : "per bore",
    qty: mobQty,
    rate: mobRate,
    amount: round2(mobQty * mobRate),
  });

  if (B > 1) {
    const setupRate = r(rates, "rate_setup_per_move");
    const setupQty = B - 1;
    items.push({
      section: "A",
      description: "Shifting (borehole to borehole)",
      unit: "per move",
      qty: setupQty,
      rate: setupRate,
      amount: round2(setupQty * setupRate),
    });
  }

  const soilDrillRate = round2(r(rates, "rate_drilling_soil_per_m") * mul.drilling);
  const soilDrillQty = round2(B * soilDepth);
  items.push({
    section: "A",
    description: "Drilling in Soil",
    unit: "RM",
    qty: soilDrillQty,
    rate: soilDrillRate,
    amount: round2(soilDrillQty * soilDrillRate),
  });

  const rockDrillRate = round2(r(rates, "rate_drilling_rock_per_m") * mul.drilling);
  const rockDrillQty = round2(B * rockDepth);
  items.push({
    section: "A",
    description: "Drilling in Rock",
    unit: "RM",
    qty: rockDrillQty,
    rate: rockDrillRate,
    amount: round2(rockDrillQty * rockDrillRate),
  });

  const sptRate = r(rates, "rate_spt_per_test");
  const sptQty = B * Math.floor(soilDepth / 1.5);
  items.push({
    section: "A",
    description: "SPT (Standard Penetration Test)",
    unit: "per test",
    qty: sptQty,
    rate: sptRate,
    amount: round2(sptQty * sptRate),
  });

  const udsRate = r(rates, "rate_uds_per_sample");
  const udsQty = B * Math.floor(soilDepth / 3);
  items.push({
    section: "A",
    description: "UDS (Undisturbed Samples)",
    unit: "per sample",
    qty: udsQty,
    rate: udsRate,
    amount: round2(udsQty * udsRate),
  });

  // Core Cutting item removed per client change request (2026-08).

  const waterRate = r(rates, "rate_water_sample");
  items.push({
    section: "A",
    description: "Water Sample Collection",
    unit: "per bore",
    qty: B,
    rate: waterRate,
    amount: round2(B * waterRate),
  });

  // ── Section B: Lab Testing ──
  const labSoilRate = round2(r(rates, "rate_lab_soil_per_sample") * mul.lab);
  const labSoilQty = B * Math.ceil(soilDepth / 1.5);
  items.push({
    section: "B",
    description: "Lab Testing — UDS Samples",
    unit: "per sample",
    qty: labSoilQty,
    rate: labSoilRate,
    amount: round2(labSoilQty * labSoilRate),
  });

  const labRockRate = round2(r(rates, "rate_lab_rock_per_sample") * mul.lab);
  const labRockQty = B * Math.ceil(rockDepth / 1.5);
  items.push({
    section: "B",
    description: "Lab Testing — Rock Samples",
    unit: "per sample",
    qty: labRockQty,
    rate: labRockRate,
    amount: round2(labRockQty * labRockRate),
  });

  const labWaterRate = r(rates, "rate_lab_water_per_sample");
  items.push({
    section: "B",
    description: "Lab Testing — Water Samples",
    unit: "per sample",
    qty: B,
    rate: labWaterRate,
    amount: round2(B * labWaterRate),
  });

  // ── Section C: Miscellaneous ──
  const travelRate = r(rates, "rate_travel_per_km");
  items.push({
    section: "C",
    description: "Travel / Conveyance",
    unit: "km",
    qty: distanceKm,
    rate: travelRate,
    amount: round2(distanceKm * travelRate),
  });

  // Core Box (Misc). Client change request: manual quantity — the estimator enters
  // the number of core boxes on the quotation; starts at 0.
  const coreBoxRate = r(rates, "rate_core_box");
  items.push({
    section: "C",
    description: "Core Box",
    unit: "Nos",
    qty: 0,
    rate: coreBoxRate,
    amount: 0,
  });

  const miscRate = r(rates, "rate_misc_lumpsum");
  items.push({
    section: "C",
    description: "Miscellaneous (Safety / DG Set etc.)",
    unit: "LS",
    qty: 1,
    rate: miscRate,
    amount: round2(miscRate),
  });

  const sc = params.siteConditions;
  const co = params.costOverrides;
  const waterFlag = sc ? sc.waterAvailable : params.extendedData?.waterAvailable;
  const safetyFlag = sc ? sc.safetyRequirements : params.extendedData?.safetyRequirements;

  if (waterFlag === false) {
    const rateVal = co?.["rate_water_arrangement"] ?? r(rates, "rate_water_arrangement");
    items.push({
      section: "C",
      description: "Water Arrangement (Client not providing water)",
      unit: "LS",
      qty: 1,
      rate: rateVal,
      amount: round2(rateVal),
    });
  }

  if (sc?.electricityAvailable === false) {
    const rateVal = co?.["rate_generator_arrangement"] ?? r(rates, "rate_generator_arrangement");
    items.push({
      section: "C",
      description: "Generator / Power Arrangement",
      unit: "LS",
      qty: 1,
      rate: rateVal,
      amount: round2(rateVal),
    });
  }

  if (sc?.securityAvailable === false) {
    const rateVal = co?.["rate_security_arrangement"] ?? r(rates, "rate_security_arrangement");
    items.push({
      section: "C",
      description: "Security Arrangement",
      unit: "LS",
      qty: 1,
      rate: rateVal,
      amount: round2(rateVal),
    });
  }

  if (sc?.accessClear === false) {
    const rateVal = co?.["rate_access_arrangement"] ?? r(rates, "rate_access_arrangement");
    items.push({
      section: "C",
      description: "Difficult Access Surcharge",
      unit: "LS",
      qty: 1,
      rate: rateVal,
      amount: round2(rateVal),
    });
  }

  if (safetyFlag) {
    const rateVal = co?.["rate_safety_arrangement"] ?? r(rates, "rate_safety_arrangement");
    items.push({
      section: "C",
      description: "TPA / Safety Arrangement",
      unit: "LS",
      qty: 1,
      rate: rateVal,
      amount: round2(rateVal),
    });
  }

  // ── Section D: Report ──
  // Client change request: Report is a lump sum (unit L.S., qty 1) — a flat
  // report fee, no longer scaled by bore count.
  const reportRate = r(rates, "rate_reporting_per_bore");
  items.push({
    section: "D",
    description: "Report Writing & Submission",
    unit: "L.S.",
    qty: 1,
    rate: reportRate,
    amount: round2(reportRate),
  });

  const boringLogRate = r(rates, "rate_boring_log_per_bore");
  items.push({
    section: "D",
    description: "Boring Log Preparation",
    unit: "per bore",
    qty: B,
    rate: boringLogRate,
    amount: round2(B * boringLogRate),
  });

  // ── City Rate Matrix: custom activities (rows with no engine rate key) ──
  // Appended to Field Work so city-specific extras (e.g. "Barricading", "Ferry
  // charges") price automatically from the matrix.
  for (const row of cityCustomRows) {
    const qty = qtyForBasis(row.basis);
    items.push({
      section: "A",
      description: row.label,
      unit: row.unit || (row.basis === "lump_sum" ? "Lump sum" : "Nos"),
      qty,
      rate: row.rate,
      amount: round2(qty * row.rate),
    });
  }

  return items;
}

export const SECTION_LABELS: Record<string, string> = {
  A: "Field Work",
  B: "Laboratory Testing",
  C: "Miscellaneous",
  D: "Report",
};

export function computeTotals(items: LineItem[]): {
  subtotal: number;
  sections: Record<string, number>;
} {
  const sections: Record<string, number> = {};
  let subtotal = 0;
  for (const item of items) {
    subtotal += item.amount;
    sections[item.section] = (sections[item.section] ?? 0) + item.amount;
  }
  return { subtotal: round2(subtotal), sections };
}

export type DiscountConfig = {
  type: "percentage" | "flat" | null;
  value: number;
};

export function computeTotalsWithDiscount(
  items: { amount: number; section?: string }[],
  discount: DiscountConfig,
  gstRate: number,
): {
  subtotal: number;
  sections: Record<string, number>;
  discountAmount: number;
  netAmount: number;
  gstAmount: number;
  grandTotal: number;
} {
  const sections: Record<string, number> = {};
  let subtotal = 0;
  for (const item of items) {
    subtotal += item.amount;
    if (item.section) {
      sections[item.section] = (sections[item.section] ?? 0) + item.amount;
    }
  }
  subtotal = round2(subtotal);

  const discountAmount =
    discount.type === "percentage"
      ? round2(subtotal * discount.value / 100)
      : discount.type === "flat"
        ? round2(Math.min(discount.value, subtotal))
        : 0;

  const netAmount = round2(subtotal - discountAmount);
  const gstAmount = round2(netAmount * gstRate / 100);
  const grandTotal = round2(netAmount + gstAmount);

  return { subtotal, sections, discountAmount, netAmount, gstAmount, grandTotal };
}

export function parseExtendedData(remarks: string | null): {
  visibleRemarks: string;
  distanceKm?: number;
  soilFraction?: number;
  siteAccess?: string;
  waterAvailable?: boolean;
  electricityAvailable?: boolean;
  securityArrangement?: boolean;
  permissionsObtained?: boolean;
  safetyRequirements?: string;
  architectName?: string;
  architectPhone?: string;
  rccConsultantName?: string;
  rccConsultantPhone?: string;
} {
  if (!remarks) return { visibleRemarks: "" };
  const marker = "---EXTENDED_DATA---";
  const idx = remarks.indexOf(marker);
  if (idx === -1) return { visibleRemarks: remarks };
  const visibleRemarks = remarks.slice(0, idx).trim();
  try {
    const json = JSON.parse(remarks.slice(idx + marker.length).trim());
    // The intake form persists snake_case keys (water_available, safety_requirements,
    // …), but every consumer reads camelCase. Map them so intake site-conditions
    // actually flow into the quotation engine. (Spread first for back-compat with
    // any code that reads the raw keys.)
    return {
      visibleRemarks,
      ...json,
      distanceKm: json.distanceKm ?? json.distance_km,
      soilFraction: json.soilFraction ?? json.soil_fraction,
      siteAccess: json.siteAccess ?? json.site_access,
      waterAvailable: json.waterAvailable ?? json.water_available,
      electricityAvailable: json.electricityAvailable ?? json.electricity_available,
      securityArrangement: json.securityArrangement ?? json.security_arrangement,
      permissionsObtained: json.permissionsObtained ?? json.permissions_obtained,
      safetyRequirements:
        json.safetyRequirements ??
        json.safety_requirements ??
        (json.safety_required ? "Special safety requirements flagged at intake" : undefined),
      architectName: json.architectName ?? json.architect_name,
      architectPhone: json.architectPhone ?? json.architect_phone,
      rccConsultantName: json.rccConsultantName ?? json.rcc_consultant_name,
      rccConsultantPhone: json.rccConsultantPhone ?? json.rcc_consultant_phone,
    };
  } catch {
    return { visibleRemarks };
  }
}
