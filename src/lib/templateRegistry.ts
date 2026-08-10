// How a line item's quantity is derived from the borehole parameters.
// Mirrors the conventions in quotationEngine.buildLineItems so the BOQ templates
// price the same physical work the same way the engine does (resolves the
// "two Type-1 implementations diverge" risk).
//   per_bore      → numBores
//   per_move      → max(0, numBores - 1)        (borehole-to-borehole shifts)
//   soil_meters   → numBores × (depth × soil%)
//   rock_meters   → numBores × (depth × rock%)
//   total_meters  → numBores × depth
//   spt           → numBores × floor(soilDepth / 1.5)
//   uds           → numBores × floor(soilDepth / 3)
//   { tier }      → numBores × max(0, min(depth, to) - from)   (depth-banded boring)
export type QtyDriver =
  | "per_bore"
  | "per_move"
  | "soil_meters"
  | "rock_meters"
  | "total_meters"
  | "spt"
  | "uds"
  | { tier: { from: number; to: number } };

export type QtyParams = {
  numBores: number;
  depthPerBore: number;
  soilFraction?: number; // 0..1, default 0.7
};

export type TemplateLineItemDef = {
  description: string;
  unit: string;
  defaultQty?: number;
  defaultRate?: number;
  rateKey?: string;
  subsection?: string;
  is_qro?: boolean;
  /** If set (and params are provided), the quantity is auto-calculated from boreholes. */
  qtyDriver?: QtyDriver;
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function computeDriverQty(driver: QtyDriver, p: QtyParams): number {
  const B = p.numBores;
  const D = p.depthPerBore;
  const sf = p.soilFraction ?? 0.7;
  const soilDepth = round2(D * sf);
  const rockDepth = round2(D * (1 - sf));
  if (typeof driver === "object") {
    const { from, to } = driver.tier;
    return round2(B * Math.max(0, Math.min(D, to) - from));
  }
  switch (driver) {
    case "per_bore": return B;
    case "per_move": return Math.max(0, B - 1);
    case "soil_meters": return round2(B * soilDepth);
    case "rock_meters": return round2(B * rockDepth);
    case "total_meters": return round2(B * D);
    case "spt": return B * Math.floor(soilDepth / 1.5);
    case "uds": return B * Math.floor(soilDepth / 3);
    default: return 0;
  }
}

export type TemplateSectionDef = {
  key: string;
  label: string;
  items: TemplateLineItemDef[];
};

export type TemplateLayout = {
  title: string;
  hasRemarks: boolean;
  hasSummaryPage: boolean;
  hasCompanyInfo: boolean;
  hasProjectHeader: boolean;
  taxDisplay: "split_cgst_sgst" | "single_gst" | "summary_sheet";
  showPaymentTermsOnPdf: boolean;
  showBankingOnPdf: boolean;
};

export type TemplateDefinition = {
  id: string;
  name: string;
  description: string;
  sections: TemplateSectionDef[];
  layout: TemplateLayout;
  defaultNotes: string[];
  defaultPaymentTerms: string;
};

export type CompanyInfo = {
  name: string;
  gstNumber: string;
  panNumber: string;
  address: string;
  /** Contact details for the letterhead header. */
  email: string;
  phone: string;
  state: string;
  bankAccountName: string;
  bankName: string;
  bankAccountNumber: string;
  bankAccountType: string;
  bankBranch: string;
  bankIfsc: string;
};

export type ProjectHeader = {
  project: string;
  client: string;
  title: string;
  revision: string;
  date: string;
};

export const TEMPLATE_IDS = {
  ORIGINAL_SI: "original_si",
  BOQ_TYPE_1: "boq_type_1",
  BOQ_TYPE_2: "boq_type_2",
  BOQ_TYPE_3: "boq_type_3",
} as const;

export const TEMPLATE_LABELS: Record<string, string> = {
  [TEMPLATE_IDS.ORIGINAL_SI]: "Original Template",
  [TEMPLATE_IDS.BOQ_TYPE_1]: "BOQ Type 1",
  [TEMPLATE_IDS.BOQ_TYPE_2]: "BOQ Type 2",
  [TEMPLATE_IDS.BOQ_TYPE_3]: "BOQ Type 3",
};

export const TEMPLATE_DESCRIPTIONS: Record<string, string> = {
  [TEMPLATE_IDS.ORIGINAL_SI]: "Auto-generated from bores, depth & soil parameters",
  [TEMPLATE_IDS.BOQ_TYPE_1]: "Standard SI BOQ — field works, detailed lab tests, report",
  [TEMPLATE_IDS.BOQ_TYPE_2]: "Foundation Pile BOQ — topography survey + SI with remarks",
  [TEMPLATE_IDS.BOQ_TYPE_3]: "Regional BOQ — summary page, company info, depth tiers",
};

export function buildTemplateLineItems(
  template: TemplateDefinition,
  rates?: Record<string, number>,
  params?: QtyParams,
): Array<{
  id: string;
  section: string;
  subsection?: string;
  description: string;
  unit: string;
  qty: number;
  rate: number;
  amount: number;
  remark?: string;
  is_qro?: boolean;
}> {
  const items: Array<{
    id: string;
    section: string;
    subsection?: string;
    description: string;
    unit: string;
    qty: number;
    rate: number;
    amount: number;
    remark?: string;
    is_qro?: boolean;
  }> = [];

  for (const section of template.sections) {
    for (const item of section.items) {
      // Nothing is hardcoded. Quantities come ONLY from the borehole drivers (which
      // are themselves blank until bores/depth are entered); non-driven and QRO lines
      // start at 0 for the estimator to fill in. Rates come ONLY from Quotation Config
      // — an unconfigured rate is ₹0 (forces a deliberate entry), never a code default.
      // The templates' defaultQty/defaultRate remain as documentation only; they are
      // intentionally not used so a fresh BOQ never carries invented figures.
      const qty = !item.is_qro && item.qtyDriver && params
        ? computeDriverQty(item.qtyDriver, params)
        : 0;
      const settingsRate = item.rateKey && rates ? rates[item.rateKey] : undefined;
      const rate = settingsRate !== undefined && settingsRate > 0 ? settingsRate : 0;
      items.push({
        id: crypto.randomUUID(),
        section: section.key,
        subsection: item.subsection,
        description: item.description,
        unit: item.unit,
        qty,
        rate,
        amount: qty * rate,
        is_qro: item.is_qro,
      });
    }
  }

  return items;
}

export function collectBoqRateKeys(templates: TemplateDefinition[]): string[] {
  const keys = new Set<string>();
  for (const tmpl of templates) {
    for (const section of tmpl.sections) {
      for (const item of section.items) {
        if (item.rateKey) keys.add(item.rateKey);
      }
    }
  }
  return [...keys];
}

export function getCompanyInfoFromSettings(
  settings: Record<string, string>,
): CompanyInfo {
  return {
    name: settings.company_name ?? "",
    gstNumber: settings.gst_number ?? "",
    panNumber: settings.company_pan ?? "",
    address: settings.company_address ?? "",
    email: settings.admin_email ?? "",
    phone: settings.admin_whatsapp ?? "",
    state: settings.company_state ?? "",
    bankAccountName: settings.bank_account_name ?? "",
    bankName: settings.bank_name ?? "",
    bankAccountNumber: settings.bank_account_number ?? "",
    bankAccountType: settings.bank_account_type ?? "Current",
    bankBranch: settings.bank_branch ?? "",
    bankIfsc: settings.bank_ifsc ?? "",
  };
}

export function isBoqTemplate(templateType: string): boolean {
  return (
    templateType === TEMPLATE_IDS.BOQ_TYPE_1 ||
    templateType === TEMPLATE_IDS.BOQ_TYPE_2 ||
    templateType === TEMPLATE_IDS.BOQ_TYPE_3
  );
}
