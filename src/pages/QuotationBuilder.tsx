import { useState, useEffect, useMemo, useCallback } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { apiClient } from "@/lib/apiClient";
import { useRole } from "@/hooks/useRole";
import { toast } from "sonner";
import { ArrowLeft, Plus, Trash2, Eye, Save, RefreshCw, Loader2, Download } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import {
  buildLineItems,
  computeTotalsWithDiscount,
  parseExtendedData,
  RATE_KEYS,
  SECTION_LABELS,
  type LineItem as SectionedLineItem,
  type DiscountConfig,
  type SiteConditions,
  type CityCustomRow,
  type RateBasis,
} from "@/lib/quotationEngine";
import { DEFAULT_CONSULTANCY_ITEMS } from "@/lib/consultancyEngine";
import QuotationPDF from "@/components/QuotationPDF";
import ConsultancyPDF from "@/components/ConsultancyPDF";
import BOQTemplatePDF from "@/components/BOQTemplatePDF";
import SiteConditionsPanel from "@/components/quotation/SiteConditionsPanel";
import SiteVisitContext from "@/components/quotation/SiteVisitContext";
import { pdf } from "@react-pdf/renderer";
import {
  TEMPLATE_IDS,
  TEMPLATE_LABELS,
  TEMPLATE_DESCRIPTIONS,
  isBoqTemplate,
  buildTemplateLineItems,
  getCompanyInfoFromSettings,
  collectBoqRateKeys,
  type ProjectHeader,
} from "@/lib/templateRegistry";
import { getTemplateById, DEFAULT_TEMPLATES } from "@/lib/templateDefaults";

type BuilderItem = {
  id: string;
  section?: string;
  subsection?: string;
  description: string;
  unit: string;
  qty: number;
  rate: number;
  amount: number;
  remark?: string;
  is_qro?: boolean;
};

type Enquiry = {
  id: string;
  ref_number: string;
  service_type: string;
  site_city: string;
  structure_type: string | null;
  num_bores: number | null;
  expected_depth_m: number | null;
  soil_type_hint: string | null;
  remarks: string | null;
  consultancy_data: any;
  client_id: string;
  status: string;
};

/** Response of GET /city-rates/resolve — see server/src/modules/city-rates. */
type CityRateResolution = {
  matched: "city" | "state" | "none";
  city: string | null;
  state?: string | null;
  overrides: Record<string, number>;
  bases: Record<string, string>;
  customRows: CityCustomRow[];
  unpriced: string[];
};

const MOBILISATION_RATE_KEY = "rate_mobilisation_per_bore";

type Client = {
  id: string;
  name: string;
  company: string | null;
  phone: string;
  email: string | null;
  city: string;
};

const round2 = (n: number) => Math.round(n * 100) / 100;
const uid = () => crypto.randomUUID();

const inputStyle = (focused: boolean) => ({
  width: "100%",
  padding: "8px 12px",
  border: `1.5px solid ${focused ? "#1565C0" : "#E0E7EF"}`,
  borderRadius: "10px",
  fontSize: "13px",
  color: "#0A1929",
  background: focused ? "white" : "#FAFBFC",
  outline: "none",
  transition: "all 150ms",
  boxShadow: focused ? "0 0 0 3px rgba(21,101,192,0.1)" : "none",
});

function SmallInput({
  value,
  onChange,
  type = "text",
  style,
  placeholder,
}: {
  value: string | number;
  onChange: (v: string) => void;
  type?: string;
  style?: React.CSSProperties;
  placeholder?: string;
}) {
  const [f, setF] = useState(false);
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      onFocus={() => setF(true)}
      onBlur={() => setF(false)}
      style={{
        padding: "7px 10px",
        border: `1px solid ${f ? "#1565C0" : "#E0E7EF"}`,
        borderRadius: "6px",
        fontSize: "14px",
        color: "#0A1929",
        background: f ? "white" : "#FAFBFC",
        outline: "none",
        transition: "all 150ms",
        ...style,
      }}
    />
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label
      style={{
        display: "block",
        fontSize: "13px",
        fontWeight: 600,
        color: "#546E7A",
        textTransform: "uppercase",
        letterSpacing: "0.06em",
        marginBottom: "5px",
      }}
    >
      {children}
    </label>
  );
}

function FieldInput({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  helper,
  min,
  max,
  step,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  helper?: string;
  min?: number;
  max?: number;
  step?: number;
}) {
  const [f, setF] = useState(false);
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        min={min}
        max={max}
        step={step}
        onFocus={() => setF(true)}
        onBlur={() => setF(false)}
        style={inputStyle(f)}
      />
      {helper && <p style={{ fontSize: "13px", color: "#546E7A", marginTop: "3px" }}>{helper}</p>}
    </div>
  );
}

const COST_FACTOR_MAP: Record<string, keyof SiteConditions> = {
  "Water tanker required": "waterAvailable",
  "Generator required": "electricityAvailable",
  "Security arrangement needed": "securityAvailable",
  "Difficult terrain access": "accessClear",
};

function buildSiteConditions(
  extended: ReturnType<typeof parseExtendedData>,
  visit: any | null,
): SiteConditions {
  const sc: SiteConditions = {
    waterAvailable: extended.waterAvailable,
    electricityAvailable: extended.electricityAvailable,
    securityAvailable: extended.securityArrangement,
    accessClear: true,
    permissionsObtained: extended.permissionsObtained,
    safetyRequirements: extended.safetyRequirements ?? "",
  };

  if (visit) {
    if (visit.water_confirmed === false) sc.waterAvailable = false;
    if (visit.water_confirmed === true && sc.waterAvailable === undefined) sc.waterAvailable = true;
    if (visit.access_confirmed === false) sc.accessClear = false;
    if (visit.security_confirmed === false) sc.securityAvailable = false;

    sc.siteVisitFeasibility = visit.feasibility ?? undefined;
    sc.siteVisitRecommendations = visit.recommendations ?? undefined;

    const obs = visit.observations;
    sc.siteVisitObservations = typeof obs === "object" && obs ? (obs.text ?? JSON.stringify(obs)) : (obs ?? undefined);

    const factors: string[] = Array.isArray(visit.cost_factors) ? visit.cost_factors : [];
    sc.siteVisitCostFactors = factors;

    for (const f of factors) {
      const key = COST_FACTOR_MAP[f];
      if (key === "waterAvailable") sc.waterAvailable = false;
      else if (key === "electricityAvailable") sc.electricityAvailable = false;
      else if (key === "securityAvailable") sc.securityAvailable = false;
      else if (key === "accessClear") sc.accessClear = false;
    }
  }

  return sc;
}

export default function QuotationBuilder() {
  const { id: enquiryId, quotationId } = useParams<{ id: string; quotationId?: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { canEditQuotation } = useRole();
  const fromVersionId = searchParams.get("fromVersion");

  const [enquiry, setEnquiry] = useState<Enquiry | null>(null);
  const [client, setClient] = useState<Client | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);

  // Parameters
  const [numBores, setNumBores] = useState(3);
  const [depthPerBore, setDepthPerBore] = useState(10);
  const [soilFraction, setSoilFraction] = useState(70);
  const [distanceKm, setDistanceKm] = useState(50);
  const [variantLabel, setVariantLabel] = useState("Standard");
  const [gstType, setGstType] = useState<"igst" | "cgst_sgst">("igst");
  const [gstRate, setGstRate] = useState(0);
  const [discountType, setDiscountType] = useState<"percentage" | "flat" | "">("");
  const [discountValue, setDiscountValue] = useState("");
  const [projectScope, setProjectScope] = useState("");

  // Line items
  const [items, setItems] = useState<BuilderItem[]>([]);
  const [manuallyEdited, setManuallyEdited] = useState(false);
  const [rates, setRates] = useState<Record<string, number>>({});
  const [confirmRecalc, setConfirmRecalc] = useState(false);

  // City Rate Matrix, resolved for this enquiry's site city. `overrides` win over
  // the global app_settings rates; `customRows` are appended as extra line items.
  const [cityRates, setCityRates] = useState<CityRateResolution | null>(null);

  // Lump sum mode
  const [isLumpSum, setIsLumpSum] = useState(false);
  const [lumpSumAmount, setLumpSumAmount] = useState("");
  const [clientFormat, setClientFormat] = useState(false);
  const [clientFormatNotes, setClientFormatNotes] = useState("");

  // Site conditions & site visit
  const [siteVisit, setSiteVisit] = useState<any>(null);
  const [siteConditions, setSiteConditions] = useState<SiteConditions>({});
  const [costOverrides, setCostOverrides] = useState<Record<string, number>>({});

  // Template
  const [templateType, setTemplateType] = useState<string>(TEMPLATE_IDS.ORIGINAL_SI);
  const [projectHeaderData, setProjectHeaderData] = useState<ProjectHeader>({
    project: "", client: "", title: "", revision: "", date: "",
  });
  const [allSettings, setAllSettings] = useState<Record<string, string>>({});
  const [confirmTemplateSwitch, setConfirmTemplateSwitch] = useState<string | null>(null);

  const isSI = enquiry?.service_type !== "consultancy";
  const isBoq = isBoqTemplate(templateType);
  const currentTemplate = isBoq ? getTemplateById(templateType) : undefined;

  // Compute totals
  const discount: DiscountConfig = useMemo(
    () => ({
      type: discountType === "" ? null : discountType,
      value: parseFloat(discountValue) || 0,
    }),
    [discountType, discountValue],
  );

  const totals = useMemo(
    () => computeTotalsWithDiscount(items, discount, gstRate),
    [items, discount, gstRate],
  );

  // Fetch data on mount
  useEffect(() => {
    if (!enquiryId) return;
    (async () => {
      setLoading(true);

      let enq: any;
      try {
        enq = await apiClient.get(`/enquiries/${enquiryId}`);
      } catch {
        toast.error("Enquiry not found");
        navigate("/enquiries");
        return;
      }
      setEnquiry(enq as any);

      const cl = await apiClient.get(`/clients/${enq.client_id}`);
      setClient(cl as any);

      // Fetch rates + gst_rate + company info + BOQ notes/terms from app_settings
      const COMPANY_KEYS = [
        "company_name", "company_state", "gst_number", "company_pan",
        "company_address", "bank_account_name", "bank_name",
        "bank_account_number", "bank_account_type", "bank_branch", "bank_ifsc",
      ];
      const BOQ_RATE_KEYS = collectBoqRateKeys(DEFAULT_TEMPLATES);
      const BOQ_NOTE_KEYS = [
        ...Array.from({ length: 8 }, (_, i) => `boq1_note_${i + 1}`),
        ...Array.from({ length: 5 }, (_, i) => `boq2_note_${i + 1}`),
        ...Array.from({ length: 10 }, (_, i) => `boq3_note_${i + 1}`),
        "boq1_payment_terms", "boq2_payment_terms", "boq3_payment_terms",
        "quotation_validity_days", "quotation_footer_text",
        ...Array.from({ length: 10 }, (_, i) => `quotation_note_${i + 1}`),
        "quotation_payment_terms",
      ];
      const settingsRows = await apiClient.get<{ key: string; value: string }[]>("/settings", {
        keys: [...RATE_KEYS, ...BOQ_RATE_KEYS, ...COMPANY_KEYS, ...BOQ_NOTE_KEYS, "gst_rate"].join(","),
      });
      const settingsMap: Record<string, string> = {};
      settingsRows.forEach((r) => {
        settingsMap[r.key] = r.value;
      });
      setAllSettings(settingsMap);
      const fetchedRates: Record<string, number> = {};
      for (const key of RATE_KEYS) {
        fetchedRates[key] = parseFloat(settingsMap[key]) || 0;
      }

      // City Rate Matrix overrides the global rates for this site's city. Rows the
      // matrix manages are authoritative even when unpriced (they come back as 0),
      // so a missing city can't silently fall back to another city's price.
      const resolved = await apiClient
        .get<CityRateResolution>("/city-rates/resolve", { city: enq.site_city ?? "", state: "" })
        .catch(() => null);
      setCityRates(resolved);
      const effectiveRates = { ...fetchedRates, ...(resolved?.overrides ?? {}) };
      setRates(effectiveRates);
      setGstRate(parseFloat(settingsMap.gst_rate) || 0);

      if (resolved && resolved.unpriced.length > 0) {
        toast.warning(
          resolved.matched === "none"
            ? `No rate matrix entry for ${enq.site_city}. ${resolved.unpriced.join(", ")} are unpriced — enter them manually.`
            : `${resolved.unpriced.join(", ")} not priced for ${resolved.city} — enter manually.`,
          { duration: 8000 },
        );
      }

      // GST type (CGST+SGST vs IGST) is chosen with the manual toggle and
      // preserved on saved quotations via gst_type. (The old rate-matrix
      // city→state auto-detect was removed along with the Rate Matrix module.)

      const extended = parseExtendedData(enq.remarks);
      // Nothing is assumed: if the enquiry didn't capture bores/depth/distance, they
      // start blank (0) so no line quantities are invented — the estimator must enter
      // them. soilFraction stays a 70/30 split hint since it only affects the soil↔rock
      // apportionment once real bores/depth exist, and never fabricates a quantity.
      const B = enq.num_bores ?? 0;
      const D = enq.expected_depth_m ? Number(enq.expected_depth_m) : 0;
      const sf = extended.soilFraction ?? 0.7;
      const dk = extended.distanceKm ?? 0;

      // Fetch latest completed site visit
      const visits = await apiClient.get<any[]>("/site-visits", { enquiry_id: enquiryId });
      const visitRow = visits.find((v) => v.status === "completed") ?? null;
      setSiteVisit(visitRow);

      const initialConditions = buildSiteConditions(extended, visitRow);
      setSiteConditions(initialConditions);

      const loadQuotId = quotationId || fromVersionId;
      if (loadQuotId) {
        const quot = await apiClient.get<any>(`/quotations/${loadQuotId}`).catch(() => null);
        if (quot) {
          setNumBores(quot.num_bores ?? B);
          setDepthPerBore(quot.depth_per_bore_m ?? D);
          setSoilFraction(Math.round(sf * 100));
          setDistanceKm(dk);
          setVariantLabel(fromVersionId ? `${quot.variant_label ?? "Standard"} (Revised)` : (quot.variant_label ?? "Standard"));
          setGstType((quot.gst_type as any) ?? "igst");
          setDiscountType((quot as any).discount_type ?? "");
          setDiscountValue(
            (quot as any).discount_value != null ? String((quot as any).discount_value) : "",
          );
          setTemplateType((quot as any).template_type ?? TEMPLATE_IDS.ORIGINAL_SI);
          if ((quot as any).variant_notes) {
            try {
              const vn = JSON.parse((quot as any).variant_notes);
              if (vn.projectHeader) setProjectHeaderData(vn.projectHeader);
            } catch {}
          }
          if (enq.service_type === "consultancy") {
            const scope =
              typeof enq.consultancy_data === "object" && enq.consultancy_data
                ? (enq.consultancy_data as any).scope ?? ""
                : "";
            setProjectScope(scope);
          }
          const loadedItems: BuilderItem[] = (
            typeof quot.line_items === "string" ? JSON.parse(quot.line_items) : quot.line_items
          ).map((it: any) => ({ ...it, id: uid() }));
          setItems(loadedItems);
          setManuallyEdited(true);
        }
      } else {
        // New quotation — generate initial items
        setNumBores(B);
        setDepthPerBore(D);
        setSoilFraction(Math.round(sf * 100));
        setDistanceKm(dk);

        if (enq.service_type === "consultancy") {
          const scope =
            typeof enq.consultancy_data === "object" && enq.consultancy_data
              ? (enq.consultancy_data as any).scope ?? ""
              : "";
          setProjectScope(scope);
          setVariantLabel("Custom");
          setItems(DEFAULT_CONSULTANCY_ITEMS.map((it) => ({ ...it, id: uid() })));
        } else {
          const generated = buildLineItems({
            numBores: B,
            depthPerBore: D,
            soilFraction: sf,
            distanceKm: dk,
            rates: effectiveRates,
            variant: "standard",
            siteConditions: initialConditions,
            mobilisationBasis: (resolved?.bases?.[MOBILISATION_RATE_KEY] as RateBasis) ?? undefined,
            cityCustomRows: resolved?.customRows?.filter((r) => r.applies_to !== "boq"),
          });
          setItems(generated.map((it) => ({ ...it, id: uid() })));
        }
      }

      setLoading(false);
    })();
  }, [enquiryId, quotationId, fromVersionId, navigate]);

  // Recalculate from engine
  const buildBoqRates = useCallback(() => {
    const boqRates: Record<string, number> = {};
    for (const [k, v] of Object.entries(allSettings)) {
      if (k.startsWith("boq_")) boqRates[k] = parseFloat(v) || 0;
    }
    // City matrix wins over the global BOQ rates for any boq_* key it manages.
    for (const [k, v] of Object.entries(cityRates?.overrides ?? {})) {
      if (k.startsWith("boq_")) boqRates[k] = v;
    }
    return boqRates;
  }, [allSettings, cityRates]);

  const doRecalculate = useCallback(() => {
    if (!enquiry) return;
    // BOQ templates: rebuild quantities from boreholes using the shared drivers,
    // but PRESERVE manually-entered quantities for non-driven items (e.g. the
    // selective lab tests, which have no driver) so recalculation doesn't zero them.
    if (isBoq && currentTemplate) {
      const drivenDesc = new Set<string>();
      for (const sec of currentTemplate.sections) {
        for (const it of sec.items) if (it.qtyDriver) drivenDesc.add(it.description);
      }
      const currentByDesc = new Map(items.map((i) => [i.description, i]));
      const fresh = buildTemplateLineItems(currentTemplate, buildBoqRates(), {
        numBores,
        depthPerBore,
        soilFraction: soilFraction / 100,
      });
      const merged = fresh.map((f) => {
        if (!drivenDesc.has(f.description)) {
          const cur = currentByDesc.get(f.description);
          if (cur) return { ...f, qty: cur.qty, amount: round2(cur.qty * f.rate) };
        }
        return f;
      });
      setItems(merged);
      setManuallyEdited(false);
      setConfirmRecalc(false);
      toast.success("Quantities recalculated from boreholes (manual lab quantities preserved)");
      return;
    }
    const generated = buildLineItems({
      numBores,
      depthPerBore,
      soilFraction: soilFraction / 100,
      distanceKm,
      rates,
      variant: "standard",
      siteConditions,
      costOverrides,
      mobilisationBasis: (cityRates?.bases?.[MOBILISATION_RATE_KEY] as RateBasis) ?? undefined,
      cityCustomRows: cityRates?.customRows?.filter((r) => r.applies_to !== "boq"),
    });
    setItems(generated.map((it) => ({ ...it, id: uid() })));
    setManuallyEdited(false);
    setConfirmRecalc(false);
    toast.success("Line items recalculated from parameters");
  }, [enquiry, isBoq, currentTemplate, buildBoqRates, numBores, depthPerBore, soilFraction, distanceKm, rates, siteConditions, costOverrides, cityRates]);

  const handleRecalculate = () => {
    if (manuallyEdited) {
      setConfirmRecalc(true);
    } else {
      doRecalculate();
    }
  };

  const doTemplateSwitch = (newType: string) => {
    setTemplateType(newType);
    if (newType === TEMPLATE_IDS.ORIGINAL_SI) {
      doRecalculate();
    } else {
      const tmpl = getTemplateById(newType);
      if (tmpl) {
        setItems(buildTemplateLineItems(tmpl, buildBoqRates(), {
          numBores,
          depthPerBore,
          soilFraction: soilFraction / 100,
        }));
        setManuallyEdited(false);
      }
    }
    setConfirmTemplateSwitch(null);
    toast.success(`Switched to ${TEMPLATE_LABELS[newType]}`);
  };

  const handleTemplateChange = (newType: string) => {
    if (newType === templateType) return;
    if (manuallyEdited || items.length > 0) {
      setConfirmTemplateSwitch(newType);
    } else {
      doTemplateSwitch(newType);
    }
  };

  // Line item CRUD
  const updateItem = (id: string, field: keyof BuilderItem, value: string | number) => {
    setItems((prev) =>
      prev.map((it) => {
        if (it.id !== id) return it;
        const updated = { ...it, [field]: value };
        if (field === "qty" || field === "rate") {
          updated.amount = round2(Number(updated.qty) * Number(updated.rate));
        }
        return updated;
      }),
    );
    setManuallyEdited(true);
  };

  const removeItem = (id: string) => {
    setItems((prev) => prev.filter((it) => it.id !== id));
    setManuallyEdited(true);
  };

  const addItem = (section?: string) => {
    setItems((prev) => {
      const newItem: BuilderItem = {
        id: uid(),
        section,
        description: "",
        unit: section ? "LS" : "LS",
        qty: 1,
        rate: 0,
        amount: 0,
      };
      if (section) {
        const lastIdx = prev.map((it) => it.section).lastIndexOf(section);
        const arr = [...prev];
        arr.splice(lastIdx + 1, 0, newItem);
        return arr;
      }
      return [...prev, newItem];
    });
    setManuallyEdited(true);
  };

  // Save as draft
  const handleSave = async () => {
    if (!enquiry || !client) return;
    setSaving(true);
    try {
      const existing = await apiClient.get<Array<{ version: number; id: string; status: string }>>(
        "/quotations",
        { enquiry_id: enquiry.id },
      );
      const maxVersion = existing.length ? Math.max(...existing.map((q) => q.version)) : 0;
      const newVersion = maxVersion + 1;

      const draftIds = existing.filter((q) => q.status === "draft").map((q) => q.id);
      if (draftIds.length) {
        await apiClient.post("/quotations/supersede", { ids: draftIds });
      }

      let saveItems: any[];
      let saveTotals = totals;

      if (isLumpSum) {
        const lsAmount = parseFloat(lumpSumAmount) || 0;
        saveItems = [{ section: "A", description: `Lump Sum — ${enquiry.service_type === "soil_investigation" ? "Soil Investigation" : "Consultancy"}`, unit: "LS", qty: 1, rate: lsAmount, amount: lsAmount }];
        const gstAmt = round2(lsAmount * gstRate / 100);
        saveTotals = { subtotal: lsAmount, gstAmount: gstAmt, grandTotal: lsAmount + gstAmt, discountAmount: 0, sections: { A: lsAmount } };
      } else {
        saveItems = items.map(({ id, ...rest }) => rest);
      }

      const mobilisationCost = isSI && !isLumpSum ? (saveTotals.sections["A"] ?? 0) : null;
      const reportingCost = isSI && !isLumpSum ? (saveTotals.sections["D"] ?? 0) : null;
      const drillingCost = isSI && !isLumpSum
        ? (saveTotals.sections["A"] ?? 0) -
          (items.find((i) => i.section === "A" && i.description.includes("Mobilis"))?.amount ?? 0) -
          (items.find((i) => i.section === "A" && i.description.includes("Water Sample"))?.amount ?? 0)
        : null;
      const travelCost = !isLumpSum ? (items.find((i) => i.description.includes("Travel"))?.amount ?? null) : null;

      const variantNotesObj: any = {};
      if (clientFormat) {
        variantNotesObj.clientFormat = true;
        variantNotesObj.formatNotes = clientFormatNotes;
      }
      if (isBoq && templateType === TEMPLATE_IDS.BOQ_TYPE_2) {
        variantNotesObj.projectHeader = projectHeaderData;
      }
      const variantNotes = Object.keys(variantNotesObj).length > 0 ? JSON.stringify(variantNotesObj) : null;

      await apiClient.post("/quotations", {
        enquiry_id: enquiry.id,
        variant: "A",
        variant_label: variantLabel,
        service_type: enquiry.service_type,
        num_bores: isSI ? numBores : null,
        depth_per_bore_m: isSI ? depthPerBore : null,
        soil_type: (enquiry.soil_type_hint || "soil") as any,
        mobilisation_cost: mobilisationCost ? +mobilisationCost.toFixed(2) : null,
        drilling_cost: drillingCost ? +drillingCost.toFixed(2) : null,
        reporting_cost: reportingCost ? +reportingCost.toFixed(2) : null,
        travel_cost: travelCost ? +travelCost.toFixed(2) : null,
        subtotal: +saveTotals.subtotal.toFixed(2),
        gst_rate: gstRate,
        gst_type: gstType,
        gst_amount: +saveTotals.gstAmount.toFixed(2),
        total_amount: +saveTotals.grandTotal.toFixed(2),
        line_items: JSON.stringify(saveItems) as any,
        is_lump_sum: isLumpSum,
        discount_type: !isLumpSum && discountType ? discountType : null,
        discount_value: !isLumpSum && discountType ? parseFloat(discountValue) || null : null,
        discount_amount: !isLumpSum && saveTotals.discountAmount > 0 ? +saveTotals.discountAmount.toFixed(2) : null,
        variant_notes: variantNotes,
        template_type: templateType,
        status: "draft",
        version: newVersion,
      });

      toast.success("Quotation saved as draft");
      navigate(`/enquiries/${enquiry.id}`);
    } catch (e: any) {
      toast.error(e.message || "Failed to save quotation");
    } finally {
      setSaving(false);
    }
  };

  // PDF preview
  const handlePreviewPdf = async () => {
    if (!enquiry || !client) return;
    setGeneratingPdf(true);
    try {
      let previewItems: any[];
      let previewTotals = totals;
      if (isLumpSum) {
        const lsAmt = parseFloat(lumpSumAmount) || 0;
        previewItems = [{ section: "A", description: `Lump Sum — ${enquiry.service_type === "soil_investigation" ? "Soil Investigation" : "Consultancy"}`, unit: "LS", qty: 1, rate: lsAmt, amount: lsAmt }];
        const gstAmt = round2(lsAmt * gstRate / 100);
        previewTotals = { subtotal: lsAmt, gstAmount: gstAmt, grandTotal: lsAmt + gstAmt, discountAmount: 0, sections: { A: lsAmt } };
      } else {
        previewItems = items.map(({ id, ...rest }) => rest);
      }
      const quotObj = {
        variant_label: variantLabel,
        subtotal: previewTotals.subtotal,
        gst_amount: previewTotals.gstAmount,
        gst_rate: gstRate,
        gst_type: gstType,
        total_amount: previewTotals.grandTotal,
        mobilisation_cost: previewTotals.sections["A"] ?? 0,
        drilling_cost: 0,
        reporting_cost: previewTotals.sections["D"] ?? 0,
        line_items: previewItems,
        num_bores: numBores,
        depth_per_bore_m: depthPerBore,
        version: 1,
        is_lump_sum: isLumpSum,
        discount_type: !isLumpSum && discountType ? discountType : null,
        discount_value: !isLumpSum && discountType ? parseFloat(discountValue) || 0 : null,
        discount_amount: previewTotals.discountAmount,
        template_type: templateType,
      };

      const clientObj = {
        name: client.name,
        company: client.company,
        phone: client.phone,
        email: client.email,
        city: client.city,
      };

      const enqObj = { ref_number: enquiry.ref_number };

      const validityDays = parseInt(allSettings.quotation_validity_days ?? "30", 10) || 30;
      const footerText = allSettings.quotation_footer_text || undefined;

      let blob: Blob;
      if (isBoq && currentTemplate) {
        const boqNum = templateType === TEMPLATE_IDS.BOQ_TYPE_1 ? "1" : templateType === TEMPLATE_IDS.BOQ_TYPE_2 ? "2" : "3";
        const noteCount = boqNum === "1" ? 8 : boqNum === "2" ? 5 : 10;
        const boqNotes = Array.from({ length: noteCount }, (_, i) => allSettings[`boq${boqNum}_note_${i + 1}`]).filter(Boolean);
        const boqPayTerms = allSettings[`boq${boqNum}_payment_terms`] || undefined;

        blob = await pdf(
          <BOQTemplatePDF
            quotation={quotObj}
            client={clientObj}
            enquiry={enqObj}
            template={currentTemplate}
            companyInfo={getCompanyInfoFromSettings(allSettings)}
            projectHeader={templateType === TEMPLATE_IDS.BOQ_TYPE_2 ? projectHeaderData : undefined}
            validityDays={validityDays}
            terms={boqNotes.length > 0 ? boqNotes : undefined}
            paymentTerms={boqPayTerms}
            footerText={footerText}
          />,
        ).toBlob();
      } else if (isSI) {
        const siNotes = Array.from({ length: 10 }, (_, i) => allSettings[`quotation_note_${i + 1}`]).filter(Boolean);
        const siPayTerms = allSettings.quotation_payment_terms || undefined;
        blob = await pdf(
          <QuotationPDF
            quotation={quotObj}
            client={clientObj}
            enquiry={enqObj}
            validityDays={validityDays}
            terms={siNotes.length > 0 ? siNotes : undefined}
            paymentTerms={siPayTerms}
            footerText={footerText}
          />,
        ).toBlob();
      } else {
        blob = await pdf(
          <ConsultancyPDF
            quotation={quotObj}
            client={clientObj}
            enquiry={enqObj}
            projectScope={projectScope}
          />,
        ).toBlob();
      }

      const url = URL.createObjectURL(blob);
      setPdfPreviewUrl(url);
      setPreviewOpen(true);
    } catch (e: any) {
      toast.error("PDF generation failed: " + (e.message || "Unknown error"));
    } finally {
      setGeneratingPdf(false);
    }
  };

  // Cleanup preview URL
  useEffect(() => {
    return () => {
      if (pdfPreviewUrl) URL.revokeObjectURL(pdfPreviewUrl);
    };
  }, [pdfPreviewUrl]);

  if (loading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "#F0F4F8",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: "#1565C0" }} />
      </div>
    );
  }

  if (!enquiry || !client) return null;

  const sections = isSI
    ? [...new Set(items.filter((it) => it.section).map((it) => it.section!))].length > 0
      ? [...new Set(items.filter((it) => it.section).map((it) => it.section!))]
      : []
    : [];

  const sectionLabelsMap: Record<string, string> = { ...SECTION_LABELS };
  if (currentTemplate) {
    for (const sec of currentTemplate.sections) {
      sectionLabelsMap[sec.key] = sec.label;
    }
  }

  const showRemarks = isBoq && currentTemplate?.layout.hasRemarks;
  const gridCols = showRemarks
    ? "1fr 80px 80px 100px 110px 100px 36px"
    : "1fr 80px 80px 100px 110px 36px";

  const renderBuilderRow = (item: BuilderItem, i: number, gc: string, hasRem: boolean | undefined) => (
    <div
      key={item.id}
      style={{
        display: "grid",
        gridTemplateColumns: gc,
        gap: "0",
        padding: "4px 20px",
        borderBottom: "1px solid #F0F4F8",
        background: i % 2 === 1 ? "#FAFBFC" : "white",
        alignItems: "center",
      }}
    >
      <SmallInput
        value={item.description}
        onChange={(v) => updateItem(item.id, "description", v)}
        style={{ width: "100%" }}
      />
      <SmallInput
        value={item.unit}
        onChange={(v) => updateItem(item.id, "unit", v)}
        style={{ width: "70px" }}
      />
      {item.is_qro ? (
        <div style={{ textAlign: "center", fontSize: "13px", fontWeight: 700, color: "#D4930A", gridColumn: "span 2" }}>
          QRO
        </div>
      ) : (
        <>
          <SmallInput
            value={item.qty}
            onChange={(v) => updateItem(item.id, "qty", parseFloat(v) || 0)}
            type="number"
            style={{ width: "70px", textAlign: "right" }}
          />
          <SmallInput
            value={item.rate}
            onChange={(v) => updateItem(item.id, "rate", parseFloat(v) || 0)}
            type="number"
            style={{ width: "90px", textAlign: "right" }}
          />
        </>
      )}
      <div
        style={{
          textAlign: "right",
          fontSize: "14px",
          fontWeight: 600,
          color: item.is_qro ? "#D4930A" : "#0A1929",
          fontFamily: "JetBrains Mono, monospace",
          padding: "0 4px",
        }}
      >
        {item.is_qro ? "QRO" : formatCurrency(item.amount)}
      </div>
      {hasRem && (
        <SmallInput
          value={item.remark ?? ""}
          onChange={(v) => updateItem(item.id, "remark", v)}
          style={{ width: "90px" }}
          placeholder=""
        />
      )}
      <button
        onClick={() => removeItem(item.id)}
        style={{
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: "4px",
          color: "#B91C1C",
          opacity: 0.5,
        }}
        onMouseEnter={(e) => ((e.target as HTMLElement).style.opacity = "1")}
        onMouseLeave={(e) => ((e.target as HTMLElement).style.opacity = "0.5")}
      >
        <Trash2 style={{ width: 14, height: 14 }} />
      </button>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: "#F0F4F8" }}>
      {/* Header */}
      <div
        style={{
          background: "linear-gradient(135deg, #0A1929 0%, #1565C0 100%)",
          padding: "16px 24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          position: "sticky",
          top: 0,
          zIndex: 50,
          boxShadow: "0 4px 20px rgba(10,25,41,0.3)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <button
            onClick={() => navigate(`/enquiries/${enquiry.id}`)}
            style={{
              background: "rgba(255,255,255,0.1)",
              border: "none",
              borderRadius: "8px",
              padding: "8px",
              cursor: "pointer",
              display: "flex",
            }}
          >
            <ArrowLeft style={{ width: 18, height: 18, color: "white" }} />
          </button>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <h1
                style={{
                  fontFamily: "Sora, sans-serif",
                  fontWeight: 700,
                  fontSize: "18px",
                  color: "white",
                  margin: 0,
                }}
              >
                Quotation Builder
              </h1>
              <span
                style={{
                  background: isSI
                    ? "rgba(21,101,192,0.3)"
                    : "rgba(106,27,154,0.3)",
                  color: "white",
                  padding: "2px 10px",
                  borderRadius: "20px",
                  fontSize: "13px",
                  fontWeight: 600,
                }}
              >
                {isSI ? "Soil Investigation" : "Consultancy"}
              </span>
            </div>
            <p style={{ fontSize: "14px", color: "rgba(255,255,255,0.6)", margin: 0, marginTop: 2 }}>
              {enquiry.ref_number} &middot; {client.name} &middot; {enquiry.site_city}
              {fromVersionId && (
                <span style={{ marginLeft: "8px", background: "rgba(255,143,0,0.3)", color: "#FFB300", padding: "1px 8px", borderRadius: "12px", fontSize: "13px", fontWeight: 600 }}>
                  Revision
                </span>
              )}
              {isSI && cityRates && (
                <span
                  title={
                    cityRates.matched === "none"
                      ? "No City Rate Matrix entry for this city — matrix-managed rates are ₹0 and must be entered manually."
                      : `Rates from the City Rate Matrix${cityRates.matched === "state" ? ` (matched on state ${cityRates.state})` : ""}.`
                  }
                  style={{
                    marginLeft: "8px",
                    background: cityRates.matched === "none" ? "rgba(185,28,28,0.35)" : "rgba(21,103,58,0.4)",
                    color: cityRates.matched === "none" ? "#FCA5A5" : "#86EFAC",
                    padding: "1px 8px",
                    borderRadius: "12px",
                    fontSize: "13px",
                    fontWeight: 600,
                  }}
                >
                  {cityRates.matched === "none"
                    ? "No city rates"
                    : `Rates: ${cityRates.city}${cityRates.matched === "state" ? " (state)" : ""}`}
                </span>
              )}
            </p>
          </div>
        </div>
        <div style={{ display: "flex", gap: "10px" }}>
          <button
            onClick={handlePreviewPdf}
            disabled={generatingPdf || items.length === 0}
            style={{
              background: "rgba(255,255,255,0.15)",
              color: "white",
              border: "1px solid rgba(255,255,255,0.2)",
              borderRadius: "10px",
              padding: "8px 16px",
              fontSize: "13px",
              fontWeight: 600,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            {generatingPdf ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Eye style={{ width: 14, height: 14 }} />
            )}
            Preview PDF
          </button>
          {canEditQuotation && (
            <button
              onClick={handleSave}
              disabled={saving || items.length === 0}
              style={{
                background: "linear-gradient(135deg, #FF8F00, #FFB300)",
                color: "white",
                border: "none",
                borderRadius: "10px",
                padding: "8px 20px",
                fontSize: "13px",
                fontWeight: 700,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save style={{ width: 14, height: 14 }} />
              )}
              Save as Draft
            </button>
          )}
        </div>
      </div>

      {/* Main content — two panels */}
      <div style={{ display: "flex", gap: "20px", padding: "20px 24px", alignItems: "flex-start" }}>
        {/* LEFT PANEL */}
        <div style={{ width: "340px", flexShrink: 0, position: "sticky", top: "80px" }}>
          {/* Template Selector */}
          {isSI && (
            <div
              style={{
                background: "white",
                borderRadius: "16px",
                border: "1px solid #E0E7EF",
                boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
                overflow: "hidden",
                marginBottom: "16px",
              }}
            >
              <div
                style={{
                  padding: "14px 20px",
                  borderBottom: "1px solid #F0F4F8",
                  background: "linear-gradient(135deg, #0A1929, #1565C0)",
                }}
              >
                <span style={{ fontWeight: 600, fontSize: "13px", color: "white" }}>
                  Quotation Template
                </span>
              </div>
              <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: "6px" }}>
                {[TEMPLATE_IDS.ORIGINAL_SI, TEMPLATE_IDS.BOQ_TYPE_1, TEMPLATE_IDS.BOQ_TYPE_2, TEMPLATE_IDS.BOQ_TYPE_3].map((tid) => (
                  <button
                    key={tid}
                    onClick={() => handleTemplateChange(tid)}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "flex-start",
                      padding: "10px 14px",
                      borderRadius: "10px",
                      border: `1.5px solid ${templateType === tid ? "#1565C0" : "#E0E7EF"}`,
                      background: templateType === tid ? "#EBF2FF" : "white",
                      cursor: "pointer",
                      transition: "all 150ms",
                      width: "100%",
                      textAlign: "left",
                    }}
                  >
                    <span style={{
                      fontSize: "14px",
                      fontWeight: 700,
                      color: templateType === tid ? "#1565C0" : "#0A1929",
                    }}>
                      {TEMPLATE_LABELS[tid]}
                    </span>
                    <span style={{ fontSize: "13px", color: "#546E7A", marginTop: "2px" }}>
                      {TEMPLATE_DESCRIPTIONS[tid]}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Project Header Fields (BOQ Type 2 only) */}
          {templateType === TEMPLATE_IDS.BOQ_TYPE_2 && (
            <div
              style={{
                background: "white",
                borderRadius: "16px",
                border: "1px solid #E0E7EF",
                boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
                overflow: "hidden",
                marginBottom: "16px",
              }}
            >
              <div
                style={{
                  padding: "14px 20px",
                  borderBottom: "1px solid #F0F4F8",
                  background: "linear-gradient(135deg, #F8FAFC, #F0F4F8)",
                }}
              >
                <span style={{ fontWeight: 600, fontSize: "13px", color: "#0A1929" }}>
                  Project Header
                </span>
              </div>
              <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: "10px" }}>
                <FieldInput label="Project" value={projectHeaderData.project} onChange={(v) => setProjectHeaderData((p) => ({ ...p, project: v }))} placeholder="Project name" />
                <FieldInput label="Title" value={projectHeaderData.title} onChange={(v) => setProjectHeaderData((p) => ({ ...p, title: v }))} placeholder="Quotation title" />
                <FieldInput label="Revision" value={projectHeaderData.revision} onChange={(v) => setProjectHeaderData((p) => ({ ...p, revision: v }))} placeholder="e.g. Rev 0" />
              </div>
            </div>
          )}

          <div
            style={{
              background: "white",
              borderRadius: "16px",
              border: "1px solid #E0E7EF",
              boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: "14px 20px",
                borderBottom: "1px solid #F0F4F8",
                background: "linear-gradient(135deg, #F8FAFC, #F0F4F8)",
              }}
            >
              <span style={{ fontWeight: 600, fontSize: "13px", color: "#0A1929" }}>
                Parameters
              </span>
            </div>

            <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: "14px" }}>
              {/* Lump Sum Toggle */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingBottom: "10px", borderBottom: "1px solid #F0F4F8" }}>
                <span style={{ fontSize: "14px", fontWeight: 600, color: "#0A1929" }}>Lump Sum Mode</span>
                <button
                  onClick={() => setIsLumpSum(!isLumpSum)}
                  style={{
                    width: "36px", height: "20px", borderRadius: "10px", border: "none",
                    background: isLumpSum ? "#1565C0" : "#CBD5E1",
                    position: "relative", cursor: "pointer", transition: "background 200ms",
                  }}
                >
                  <div style={{
                    width: "16px", height: "16px", borderRadius: "50%", background: "white",
                    position: "absolute", top: "2px", left: isLumpSum ? "18px" : "2px",
                    transition: "left 200ms", boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                  }} />
                </button>
              </div>

              {isLumpSum ? (
                <div>
                  <FieldLabel>Total Lump Sum Amount</FieldLabel>
                  <SmallInput
                    type="number"
                    value={lumpSumAmount}
                    onChange={(v) => setLumpSumAmount(v)}
                    placeholder="Enter total amount (₹)"
                  />
                  {parseFloat(lumpSumAmount) > 0 && (
                    <p style={{ fontSize: "13px", color: "#15673A", marginTop: "6px", fontWeight: 600 }}>
                      Total: {formatCurrency(parseFloat(lumpSumAmount) + parseFloat(lumpSumAmount) * gstRate / 100)} (incl. GST)
                    </p>
                  )}
                </div>
              ) : isSI ? (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <FieldInput
                      label="Bores"
                      value={String(numBores)}
                      onChange={(v) => setNumBores(Math.max(1, parseInt(v) || 1))}
                      type="number"
                      min={1}
                    />
                    <FieldInput
                      label="Depth (m)"
                      value={String(depthPerBore)}
                      onChange={(v) => setDepthPerBore(Math.max(1, parseFloat(v) || 1))}
                      type="number"
                      min={1}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <FieldInput
                      label="Soil %"
                      value={String(soilFraction)}
                      onChange={(v) =>
                        setSoilFraction(Math.min(100, Math.max(0, parseInt(v) || 0)))
                      }
                      type="number"
                      min={0}
                      max={100}
                      helper={`Rock: ${100 - soilFraction}%`}
                    />
                    {!isBoq && (
                      <FieldInput
                        label="Distance (km)"
                        value={String(distanceKm)}
                        onChange={(v) => setDistanceKm(Math.max(0, parseFloat(v) || 0))}
                        type="number"
                        min={0}
                      />
                    )}
                  </div>
                  <button
                    onClick={handleRecalculate}
                    style={{
                      width: "100%",
                      padding: "9px",
                      background: "#EBF2FF",
                      color: "#1565C0",
                      border: "1px solid #BBDEFB",
                      borderRadius: "10px",
                      fontSize: "14px",
                      fontWeight: 600,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "6px",
                    }}
                  >
                    <RefreshCw style={{ width: 14, height: 14 }} />
                    {isBoq ? "Recalculate Quantities from Boreholes" : "Recalculate from Parameters"}
                  </button>
                  {isBoq && (
                    <p style={{ fontSize: "13px", color: "#546E7A", marginTop: "2px" }}>
                      Boring, SPT, UDS and per-borehole quantities auto-calculate from
                      boreholes &amp; depth. Lump-sum/LS items and selective lab tests can be
                      edited directly in the table.
                    </p>
                  )}
                </>
              ) : (
                <div>
                  <FieldLabel>Project Scope</FieldLabel>
                  <textarea
                    value={projectScope}
                    onChange={(e) => setProjectScope(e.target.value)}
                    rows={3}
                    style={{
                      ...inputStyle(false),
                      resize: "none" as const,
                    }}
                    placeholder="e.g. Structural assessment for residential building"
                  />
                </div>
              )}

              <div
                style={{
                  borderTop: "1px solid #F0F4F8",
                  paddingTop: "14px",
                  marginTop: "2px",
                }}
              >
                <FieldInput
                  label="Variant Label"
                  value={variantLabel}
                  onChange={setVariantLabel}
                  placeholder="e.g. Standard, Budget, Premium"
                />
              </div>

              <div>
                <FieldLabel>GST Type</FieldLabel>
                <div style={{ display: "flex", gap: "8px" }}>
                  {(["igst", "cgst_sgst"] as const).map((gt) => (
                    <button
                      key={gt}
                      onClick={() => setGstType(gt)}
                      style={{
                        flex: 1,
                        padding: "8px",
                        borderRadius: "8px",
                        border: `1.5px solid ${gstType === gt ? "#1565C0" : "#E0E7EF"}`,
                        background: gstType === gt ? "#EBF2FF" : "#FAFBFC",
                        color: gstType === gt ? "#1565C0" : "#546E7A",
                        fontSize: "14px",
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      {gt === "igst" ? "IGST" : "CGST + SGST"}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ borderTop: "1px solid #F0F4F8", paddingTop: "14px" }}>
                <FieldLabel>Discount</FieldLabel>
                <select
                  value={discountType}
                  onChange={(e) => {
                    setDiscountType(e.target.value as any);
                    if (!e.target.value) setDiscountValue("");
                  }}
                  style={{
                    ...inputStyle(false),
                    cursor: "pointer",
                  }}
                >
                  <option value="">No Discount</option>
                  <option value="percentage">Percentage (%)</option>
                  <option value="flat">Flat Amount (INR)</option>
                </select>
                {discountType && (
                  <div style={{ marginTop: "8px" }}>
                    <FieldInput
                      label={discountType === "percentage" ? "Discount %" : "Discount Amount (INR)"}
                      value={discountValue}
                      onChange={setDiscountValue}
                      type="number"
                      min={0}
                      max={discountType === "percentage" ? 100 : undefined}
                      placeholder={discountType === "percentage" ? "e.g. 10" : "e.g. 5000"}
                    />
                  </div>
                )}
              </div>

              {/* Client-defined format flag */}
              <div style={{ borderTop: "1px solid #F0F4F8", paddingTop: "12px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <input
                    type="checkbox"
                    checked={clientFormat}
                    onChange={(e) => setClientFormat(e.target.checked)}
                    style={{ width: "14px", height: "14px", accentColor: "#1565C0" }}
                  />
                  <span style={{ fontSize: "14px", fontWeight: 600, color: "#0A1929" }}>Client-defined format</span>
                </div>
                {clientFormat && (
                  <textarea
                    value={clientFormatNotes}
                    onChange={(e) => setClientFormatNotes(e.target.value)}
                    rows={2}
                    placeholder="Format notes (internal reference)"
                    style={{ ...inputStyle(false), marginTop: "8px", resize: "none" as const, fontSize: "13px" }}
                  />
                )}
              </div>
            </div>
          </div>

          {isSI && !isBoq && (
            <SiteConditionsPanel
              conditions={siteConditions}
              costOverrides={costOverrides}
              defaultRates={rates}
              onConditionChange={(key, value) => {
                setSiteConditions((prev) => ({ ...prev, [key]: value }));
              }}
              onSafetyChange={(value) => {
                setSiteConditions((prev) => ({ ...prev, safetyRequirements: value }));
              }}
              onCostOverrideChange={(rateKey, value) => {
                setCostOverrides((prev) => ({ ...prev, [rateKey]: value }));
              }}
            />
          )}
        </div>

        {/* RIGHT PANEL */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {isSI && !isBoq && <SiteVisitContext siteVisit={siteVisit} />}
          {/* Line items */}
          <div
            style={{
              background: "white",
              borderRadius: "16px",
              border: "1px solid #E0E7EF",
              boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
              overflow: "hidden",
              marginBottom: "20px",
            }}
          >
            <div
              style={{
                padding: "14px 20px",
                borderBottom: "1px solid #F0F4F8",
                background: "linear-gradient(135deg, #F8FAFC, #F0F4F8)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <span style={{ fontWeight: 600, fontSize: "13px", color: "#0A1929" }}>
                Line Items
              </span>
              <span style={{ fontSize: "13px", color: "#546E7A" }}>
                {items.length} items
              </span>
            </div>

            <div style={{ overflowX: "auto" }}>
              {isSI && sections.length > 0 ? (
                // Sectioned table for SI
                sections.map((sec) => {
                  const sectionItems = items.filter((it) => it.section === sec);
                  const sectionTotal = sectionItems.filter((it) => !it.is_qro).reduce((s, it) => s + it.amount, 0);
                  const subsections = [...new Set(sectionItems.filter((it) => it.subsection).map((it) => it.subsection!))];
                  return (
                    <div key={sec}>
                      <div
                        style={{
                          background: "#0F2A47",
                          padding: "8px 20px",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                        }}
                      >
                        <span
                          style={{
                            color: "white",
                            fontWeight: 700,
                            fontSize: "14px",
                            letterSpacing: "0.04em",
                          }}
                        >
                          {sec}. {(sectionLabelsMap[sec] ?? sec).toUpperCase()}
                        </span>
                        <span
                          style={{
                            color: "rgba(255,255,255,0.7)",
                            fontSize: "13px",
                            fontWeight: 600,
                          }}
                        >
                          {formatCurrency(sectionTotal)}
                        </span>
                      </div>
                      {/* Column headers */}
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: gridCols,
                          gap: "0",
                          padding: "6px 20px",
                          background: "#F8FAFC",
                          borderBottom: "1px solid #E0E7EF",
                        }}
                      >
                        <span style={colHeaderStyle}>Description</span>
                        <span style={colHeaderStyle}>Unit</span>
                        <span style={{ ...colHeaderStyle, textAlign: "right" }}>Qty</span>
                        <span style={{ ...colHeaderStyle, textAlign: "right" }}>Rate</span>
                        <span style={{ ...colHeaderStyle, textAlign: "right" }}>Amount</span>
                        {showRemarks && <span style={colHeaderStyle}>Remark</span>}
                        <span />
                      </div>
                      {/* Subsection headers + Rows */}
                      {subsections.length > 0
                        ? subsections.map((sub) => {
                            const subItems = sectionItems.filter((it) => it.subsection === sub);
                            return (
                              <div key={sub}>
                                <div style={{ background: "#E2E8F0", padding: "4px 20px 4px 28px" }}>
                                  <span style={{ fontSize: "13px", fontWeight: 700, color: "#334155" }}>{sub}</span>
                                </div>
                                {subItems.map((item, i) => renderBuilderRow(item, i, gridCols, showRemarks))}
                              </div>
                            );
                          }).concat(
                            sectionItems.filter((it) => !it.subsection).map((item, i) =>
                              renderBuilderRow(item, i, gridCols, showRemarks),
                            ),
                          )
                        : sectionItems.map((item, i) => renderBuilderRow(item, i, gridCols, showRemarks))
                      }
                      {/* Add row */}
                      <div style={{ padding: "6px 20px" }}>
                        <button
                          onClick={() => addItem(sec)}
                          style={{
                            background: "none",
                            border: "1px dashed #CBD5E1",
                            borderRadius: "6px",
                            padding: "4px 12px",
                            fontSize: "13px",
                            color: "#546E7A",
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            gap: "4px",
                          }}
                        >
                          <Plus style={{ width: 14, height: 14 }} /> Add Row
                        </button>
                      </div>
                    </div>
                  );
                })
              ) : (
                // Flat table for Consultancy
                <>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 80px 80px 100px 110px 36px",
                      gap: "0",
                      padding: "8px 20px",
                      background: "#1E293B",
                    }}
                  >
                    <span style={{ ...colHeaderStyle, color: "white" }}>Description</span>
                    <span style={{ ...colHeaderStyle, color: "white" }}>Unit</span>
                    <span style={{ ...colHeaderStyle, color: "white", textAlign: "right" }}>
                      Qty
                    </span>
                    <span style={{ ...colHeaderStyle, color: "white", textAlign: "right" }}>
                      Rate
                    </span>
                    <span style={{ ...colHeaderStyle, color: "white", textAlign: "right" }}>
                      Amount
                    </span>
                    <span />
                  </div>
                  {items.map((item, i) => (
                    <div
                      key={item.id}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 80px 80px 100px 110px 36px",
                        gap: "0",
                        padding: "4px 20px",
                        borderBottom: "1px solid #F0F4F8",
                        background: i % 2 === 1 ? "#FAFBFC" : "white",
                        alignItems: "center",
                      }}
                    >
                      <SmallInput
                        value={item.description}
                        onChange={(v) => updateItem(item.id, "description", v)}
                        style={{ width: "100%" }}
                      />
                      <SmallInput
                        value={item.unit}
                        onChange={(v) => updateItem(item.id, "unit", v)}
                        style={{ width: "70px" }}
                      />
                      <SmallInput
                        value={item.qty}
                        onChange={(v) => updateItem(item.id, "qty", parseFloat(v) || 0)}
                        type="number"
                        style={{ width: "70px", textAlign: "right" }}
                      />
                      <SmallInput
                        value={item.rate}
                        onChange={(v) => updateItem(item.id, "rate", parseFloat(v) || 0)}
                        type="number"
                        style={{ width: "90px", textAlign: "right" }}
                      />
                      <div
                        style={{
                          textAlign: "right",
                          fontSize: "14px",
                          fontWeight: 600,
                          color: "#0A1929",
                          fontFamily: "JetBrains Mono, monospace",
                          padding: "0 4px",
                        }}
                      >
                        {formatCurrency(item.amount)}
                      </div>
                      <button
                        onClick={() => removeItem(item.id)}
                        style={{
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          padding: "4px",
                          color: "#B91C1C",
                          opacity: 0.5,
                        }}
                        onMouseEnter={(e) =>
                          ((e.target as HTMLElement).style.opacity = "1")
                        }
                        onMouseLeave={(e) =>
                          ((e.target as HTMLElement).style.opacity = "0.5")
                        }
                      >
                        <Trash2 style={{ width: 14, height: 14 }} />
                      </button>
                    </div>
                  ))}
                  <div style={{ padding: "8px 20px" }}>
                    <button
                      onClick={() => addItem()}
                      style={{
                        background: "none",
                        border: "1px dashed #CBD5E1",
                        borderRadius: "6px",
                        padding: "6px 14px",
                        fontSize: "13px",
                        color: "#546E7A",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: "4px",
                      }}
                    >
                      <Plus style={{ width: 14, height: 14 }} /> Add Line Item
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Totals Card */}
          <div
            style={{
              background: "white",
              borderRadius: "16px",
              border: "1px solid #E0E7EF",
              boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
              padding: "20px 24px",
            }}
          >
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "8px",
                maxWidth: "320px",
                marginLeft: "auto",
              }}
            >
              <TotalRow label="Subtotal" value={totals.subtotal} />
              {totals.discountAmount > 0 && (
                <>
                  <TotalRow
                    label={
                      discountType === "percentage"
                        ? `Discount (${discountValue}%)`
                        : "Discount (Flat)"
                    }
                    value={-totals.discountAmount}
                    color="#B91C1C"
                  />
                  <TotalRow label="Net Amount" value={totals.netAmount} />
                </>
              )}
              {gstType === "cgst_sgst" ? (
                <>
                  <TotalRow label={`CGST @ ${gstRate / 2}%`} value={round2(totals.gstAmount / 2)} />
                  <TotalRow label={`SGST @ ${gstRate / 2}%`} value={round2(totals.gstAmount / 2)} />
                </>
              ) : (
                <TotalRow label={`IGST @ ${gstRate}%`} value={totals.gstAmount} />
              )}
              <div
                style={{
                  borderTop: "2px solid #0F2A47",
                  paddingTop: "10px",
                  marginTop: "4px",
                  display: "flex",
                  justifyContent: "space-between",
                }}
              >
                <span
                  style={{
                    fontFamily: "Sora, sans-serif",
                    fontWeight: 700,
                    fontSize: "16px",
                    color: "#0F2A47",
                  }}
                >
                  Grand Total
                </span>
                <span
                  style={{
                    fontFamily: "JetBrains Mono, monospace",
                    fontWeight: 700,
                    fontSize: "18px",
                    color: "#0F2A47",
                  }}
                >
                  {formatCurrency(totals.grandTotal)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Recalculate confirm dialog */}
      {confirmRecalc && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 100,
          }}
          onClick={() => setConfirmRecalc(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "white",
              borderRadius: "16px",
              padding: "24px",
              maxWidth: "400px",
              width: "90%",
              boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
            }}
          >
            <h3
              style={{
                fontFamily: "Sora, sans-serif",
                fontWeight: 700,
                fontSize: "16px",
                color: "#0A1929",
                margin: "0 0 8px",
              }}
            >
              Overwrite Manual Edits?
            </h3>
            <p style={{ fontSize: "13px", color: "#546E7A", margin: "0 0 20px" }}>
              Recalculating will regenerate all line items from the current parameters.
              Your manual changes will be lost.
            </p>
            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
              <button
                onClick={() => setConfirmRecalc(false)}
                style={{
                  padding: "8px 16px",
                  background: "#F0F4F8",
                  border: "1px solid #E0E7EF",
                  borderRadius: "8px",
                  fontSize: "13px",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                onClick={doRecalculate}
                style={{
                  padding: "8px 16px",
                  background: "#1565C0",
                  color: "white",
                  border: "none",
                  borderRadius: "8px",
                  fontSize: "13px",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Recalculate
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Template Switch Confirm */}
      {confirmTemplateSwitch && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 100,
          }}
          onClick={() => setConfirmTemplateSwitch(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "white",
              borderRadius: "16px",
              padding: "24px",
              maxWidth: "400px",
              width: "90%",
              boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
            }}
          >
            <h3
              style={{
                fontFamily: "Sora, sans-serif",
                fontWeight: 700,
                fontSize: "16px",
                color: "#0A1929",
                margin: "0 0 8px",
              }}
            >
              Switch Template?
            </h3>
            <p style={{ fontSize: "13px", color: "#546E7A", margin: "0 0 20px" }}>
              Switching to <strong>{TEMPLATE_LABELS[confirmTemplateSwitch]}</strong> will
              replace all current line items with the new template's defaults.
              Your manual changes will be lost.
            </p>
            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
              <button
                onClick={() => setConfirmTemplateSwitch(null)}
                style={{
                  padding: "8px 16px",
                  background: "#F0F4F8",
                  border: "1px solid #E0E7EF",
                  borderRadius: "8px",
                  fontSize: "13px",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => doTemplateSwitch(confirmTemplateSwitch)}
                style={{
                  padding: "8px 16px",
                  background: "#1565C0",
                  color: "white",
                  border: "none",
                  borderRadius: "8px",
                  fontSize: "13px",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Switch Template
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PDF Preview Modal */}
      {previewOpen && pdfPreviewUrl && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 100,
          }}
          onClick={() => setPreviewOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "white",
              borderRadius: "16px",
              width: "90%",
              maxWidth: "900px",
              height: "85vh",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
              boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
            }}
          >
            <div
              style={{
                padding: "14px 20px",
                borderBottom: "1px solid #E0E7EF",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <span style={{ fontWeight: 600, fontSize: "14px", color: "#0A1929" }}>
                PDF Preview
              </span>
              <div style={{ display: "flex", gap: "8px" }}>
                <a
                  href={pdfPreviewUrl}
                  download={`${enquiry.ref_number}-${variantLabel}.pdf`}
                  style={{
                    padding: "6px 14px",
                    background: "#1565C0",
                    color: "white",
                    borderRadius: "8px",
                    fontSize: "14px",
                    fontWeight: 600,
                    textDecoration: "none",
                    display: "flex",
                    alignItems: "center",
                    gap: "4px",
                  }}
                >
                  <Download style={{ width: 14, height: 14 }} />
                  Download
                </a>
                <button
                  onClick={() => setPreviewOpen(false)}
                  style={{
                    padding: "6px 14px",
                    background: "#F0F4F8",
                    border: "1px solid #E0E7EF",
                    borderRadius: "8px",
                    fontSize: "14px",
                    cursor: "pointer",
                  }}
                >
                  Close
                </button>
              </div>
            </div>
            <iframe
              src={pdfPreviewUrl}
              title="PDF Preview"
              style={{ flex: 1, border: "none" }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

const colHeaderStyle: React.CSSProperties = {
  fontSize: "13px",
  fontWeight: 700,
  color: "#546E7A",
  textTransform: "uppercase",
  letterSpacing: "0.06em",
};

function TotalRow({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color?: string;
}) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <span style={{ fontSize: "13px", color: color || "#546E7A" }}>{label}</span>
      <span
        style={{
          fontSize: "13px",
          fontWeight: 600,
          fontFamily: "JetBrains Mono, monospace",
          color: color || "#0A1929",
        }}
      >
        {value < 0 ? `- ${formatCurrency(Math.abs(value))}` : formatCurrency(value)}
      </span>
    </div>
  );
}
