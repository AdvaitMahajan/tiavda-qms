import { useState } from "react";
import { DollarSign, FileText, Layers } from "lucide-react";
import { Navigate } from "react-router-dom";
import { RATE_KEYS } from "@/lib/quotationEngine";
import { useSettings } from "@/hooks/useSettings";
import { useRole } from "@/hooks/useRole";
import { cardStyle, SettingsCardHeader, PremiumInput } from "@/components/settings/SettingsComponents";
import { collectBoqRateKeys } from "@/lib/templateRegistry";
import { DEFAULT_TEMPLATES } from "@/lib/templateDefaults";

const BOQ_RATES = collectBoqRateKeys(DEFAULT_TEMPLATES);

const NOTE_KEYS = Array.from({ length: 10 }, (_, i) => `quotation_note_${i + 1}`);
const CONSULTANCY_NOTE_KEYS = Array.from({ length: 5 }, (_, i) => `consultancy_note_${i + 1}`);
const CONSULTANCY_ITEM_KEYS = Array.from({ length: 5 }, (_, i) => `consultancy_item_${i + 1}_desc`);
const BOQ1_NOTE_KEYS = Array.from({ length: 8 }, (_, i) => `boq1_note_${i + 1}`);
const BOQ2_NOTE_KEYS = Array.from({ length: 5 }, (_, i) => `boq2_note_${i + 1}`);
const BOQ3_NOTE_KEYS = Array.from({ length: 10 }, (_, i) => `boq3_note_${i + 1}`);

const SAVE_KEYS = [
  ...RATE_KEYS,
  ...BOQ_RATES,
  "gst_rate",
  ...NOTE_KEYS,
  "quotation_payment_terms",
  "quotation_footer_text",
  ...CONSULTANCY_NOTE_KEYS,
  ...CONSULTANCY_ITEM_KEYS,
  "consultancy_payment_terms",
  ...BOQ1_NOTE_KEYS,
  "boq1_payment_terms",
  ...BOQ2_NOTE_KEYS,
  "boq2_payment_terms",
  ...BOQ3_NOTE_KEYS,
  "boq3_payment_terms",
  "quotation_validity_days",
];

const DEFAULTS: Record<string, string> = {
  ...Object.fromEntries(RATE_KEYS.map((k) => [k, ""])),
  ...Object.fromEntries(BOQ_RATES.map((k) => [k, ""])),
  gst_rate: "18",
  ...Object.fromEntries(NOTE_KEYS.map((k) => [k, ""])),
  quotation_payment_terms: "",
  quotation_footer_text: "",
  ...Object.fromEntries(CONSULTANCY_NOTE_KEYS.map((k) => [k, ""])),
  ...Object.fromEntries(CONSULTANCY_ITEM_KEYS.map((k) => [k, ""])),
  consultancy_payment_terms: "",
  ...Object.fromEntries(BOQ1_NOTE_KEYS.map((k) => [k, ""])),
  boq1_payment_terms: "",
  ...Object.fromEntries(BOQ2_NOTE_KEYS.map((k) => [k, ""])),
  boq2_payment_terms: "",
  ...Object.fromEntries(BOQ3_NOTE_KEYS.map((k) => [k, ""])),
  boq3_payment_terms: "",
  quotation_validity_days: "30",
};

const TABS = [
  { id: "original", label: "Original SI", color: "#1565C0" },
  { id: "boq1", label: "BOQ Type 1", color: "#00897B" },
  { id: "boq2", label: "BOQ Type 2", color: "#6A1B9A" },
  { id: "boq3", label: "BOQ Type 3", color: "#E65100" },
] as const;

const BOQ_RATE_LABELS: Record<string, string> = {
  boq_mobilisation: "Mobilisation & Demobilisation",
  boq_rig_setting: "Setting & Shifting of Rig",
  boq_boring_soil_per_m: "Boring in Soil (per RM)",
  boq_boring_rock_per_m: "Drilling in Rock (per RM)",
  boq_boring_10_20m: "Boring 10–20m Depth (per RM)",
  boq_boring_20_30m: "Boring 20–30m Depth (per RM)",
  boq_boring_refusal: "Boring Beyond Refusal (per RM)",
  boq_spt_per_test: "SPT Per Test",
  boq_uds_per_sample: "UDS Per Sample",
  boq_water_sample_collection: "Water Sample Collection",
  boq_soil_sample_collection: "Soil Sample Collection",
  boq_core_boxes: "Core Boxes",
  boq_water_tanker: "Water Tanker Supply",
  boq_bore_refilling: "Bore Refilling & Restoration",
  boq_temp_benchmark: "Temporary Benchmarks",
  boq_topographic_survey: "Topographic Survey (per Sqm)",
  boq_utility_survey: "Utility Survey",
  boq_cad_drawings: "CAD Drawings Preparation",
  boq_lab_grain_size: "Lab — Grain Size Analysis",
  boq_lab_atterberg: "Lab — Atterberg Limits (LL+PL)",
  boq_lab_ll: "Lab — Liquid Limit",
  boq_lab_pl: "Lab — Plastic Limit",
  boq_lab_sl: "Lab — Shrinkage Limit",
  boq_lab_unit_weight_sg: "Lab — Unit Weight & Specific Gravity",
  boq_lab_in_situ_density: "Lab — In-situ Dry Density",
  boq_lab_sg_soil: "Lab — Specific Gravity of Soil",
  boq_lab_triaxial_uu: "Lab — Triaxial (UU)",
  boq_lab_chemical_soil: "Lab — Chemical Analysis (Soil)",
  boq_lab_nmc: "Lab — Natural Moisture Content",
  boq_lab_consolidation: "Lab — Consolidation Test",
  boq_lab_direct_shear: "Lab — Direct Shear Test",
  boq_lab_ucs_soil: "Lab — UCS of Soil",
  boq_lab_rock_density: "Lab — Rock Dry Density",
  boq_lab_rock_water_absorption: "Lab — Rock Water Absorption",
  boq_lab_rock_porosity: "Lab — Rock Porosity",
  boq_lab_rock_sg: "Lab — Rock Specific Gravity",
  boq_lab_rock_ucs: "Lab — Rock UCS / Point Load",
  boq_lab_rock_elasticity: "Lab — Rock Modulus of Elasticity",
  boq_lab_rock_poisson: "Lab — Rock Poisson's Ratio",
  boq_lab_rock_triaxial: "Lab — Rock Triaxial Compression",
  boq_lab_chemical_water: "Lab — Chemical Analysis (Water)",
  boq_lab_comprehensive: "Lab — Comprehensive Package",
  boq_geotechnical_report: "Geotechnical Report",
  boq_report_with_lab: "Report + Lab (Bundled)",
  boq_labour_accommodation: "Labour Accommodation",
  boq_field_cbr: "Field CBR Test",
  boq_electrical_resistivity: "Electrical Resistivity Test",
  boq_third_party_inspection: "Third Party Inspection",
  boq_workers_insurance: "Workers Insurance (WCP)",
  boq_mob_demob_labour: "Mob/Demob Labour Charges",
};

const BOQ1_RATE_SECTIONS: { label: string; keys: string[] }[] = [
  {
    label: "Field Works",
    keys: [
      "boq_mobilisation", "boq_rig_setting", "boq_boring_soil_per_m", "boq_boring_rock_per_m",
      "boq_spt_per_test", "boq_uds_per_sample", "boq_water_sample_collection",
      "boq_core_boxes", "boq_water_tanker",
    ],
  },
  {
    label: "Laboratory — Soil",
    keys: [
      "boq_lab_grain_size", "boq_lab_atterberg", "boq_lab_unit_weight_sg",
      "boq_lab_triaxial_uu", "boq_lab_chemical_soil", "boq_lab_nmc",
      "boq_lab_consolidation", "boq_lab_direct_shear",
    ],
  },
  {
    label: "Laboratory — Rock",
    keys: [
      "boq_lab_rock_density", "boq_lab_rock_water_absorption", "boq_lab_rock_porosity",
      "boq_lab_rock_sg", "boq_lab_rock_ucs", "boq_lab_rock_elasticity",
      "boq_lab_rock_poisson", "boq_lab_rock_triaxial",
    ],
  },
  {
    label: "Laboratory — Water",
    keys: ["boq_lab_chemical_water"],
  },
  {
    label: "Report & Misc",
    keys: ["boq_geotechnical_report", "boq_labour_accommodation"],
  },
];

const BOQ2_RATE_SECTIONS: { label: string; keys: string[] }[] = [
  {
    label: "Survey & Field Works",
    keys: [
      "boq_mobilisation", "boq_temp_benchmark", "boq_topographic_survey",
      "boq_utility_survey", "boq_cad_drawings", "boq_rig_setting",
      "boq_boring_soil_per_m", "boq_boring_rock_per_m",
      "boq_spt_per_test", "boq_uds_per_sample", "boq_water_sample_collection",
      "boq_soil_sample_collection", "boq_core_boxes", "boq_water_tanker", "boq_bore_refilling",
    ],
  },
  {
    label: "Laboratory Tests",
    keys: [
      "boq_lab_nmc", "boq_lab_ll", "boq_lab_pl", "boq_lab_sl",
      "boq_lab_grain_size", "boq_lab_in_situ_density", "boq_lab_sg_soil",
      "boq_lab_ucs_soil", "boq_lab_consolidation", "boq_lab_triaxial_uu",
      "boq_lab_direct_shear", "boq_lab_chemical_soil", "boq_lab_chemical_water",
      "boq_lab_rock_water_absorption", "boq_lab_rock_density",
    ],
  },
  {
    label: "Report",
    keys: ["boq_geotechnical_report"],
  },
];

const BOQ3_RATE_SECTIONS: { label: string; keys: string[] }[] = [
  {
    label: "Boring Works",
    keys: [
      "boq_mobilisation", "boq_boring_soil_per_m", "boq_boring_10_20m",
      "boq_boring_20_30m", "boq_boring_refusal", "boq_boring_rock_per_m",
    ],
  },
  {
    label: "Field Tests",
    keys: ["boq_field_cbr", "boq_electrical_resistivity"],
  },
  {
    label: "Report & Lab",
    keys: ["boq_report_with_lab", "boq_lab_comprehensive"],
  },
  {
    label: "Miscellaneous",
    keys: [
      "boq_third_party_inspection", "boq_workers_insurance", "boq_mob_demob_labour",
    ],
  },
];

function RateSection({ sections, s, set }: { sections: { label: string; keys: string[] }[]; s: Record<string, string>; set: (key: string) => (v: string) => void }) {
  return (
    <>
      {sections.map((section) => (
        <div key={section.label} style={{ marginBottom: "16px" }}>
          <div style={{
            fontSize: "13px", fontWeight: 700, color: "#0A1929",
            textTransform: "uppercase", letterSpacing: "0.06em",
            padding: "8px 0 6px", borderBottom: "1px solid #E0E7EF", marginBottom: "10px",
          }}>
            {section.label}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {section.keys.map((key) => (
              <PremiumInput
                key={key}
                label={BOQ_RATE_LABELS[key] ?? key}
                value={s[key] ?? ""}
                onChange={set(key)}
                type="number"
                placeholder="Use template default"
                font="mono"
              />
            ))}
          </div>
        </div>
      ))}
    </>
  );
}

export default function QuotationConfigPage() {
  const { isAdmin } = useRole();
  const { settings: s, set, loading, saving, hasChanges, saveAll, saveOne } = useSettings(
    SAVE_KEYS, DEFAULTS,
  );
  const [activeTab, setActiveTab] = useState<string>("original");

  if (!isAdmin) return <Navigate to="/dashboard" replace />;

  if (loading) {
    return (
      <div style={{ background: "#F0F4F8", minHeight: "100vh", padding: "24px" }}>
        <div
          style={{ background: "linear-gradient(135deg, #0A1929 0%, #1565C0 100%)", borderRadius: "20px", height: "96px", marginBottom: "24px" }}
          className="animate-pulse"
        />
        {[1, 2, 3].map((i) => (
          <div key={i} className="animate-pulse" style={{ background: "white", borderRadius: "16px", height: 280, marginBottom: "20px" }} />
        ))}
      </div>
    );
  }

  return (
    <div className="p-3 sm:p-6" style={{ background: "#F0F4F8", minHeight: "100vh" }}>
      {/* ── Gradient Header ── */}
      <div
        className="flex flex-wrap items-center justify-between gap-4"
        style={{
          background: "linear-gradient(135deg, #0A1929 0%, #1565C0 100%)",
          borderRadius: "20px",
          padding: "24px",
          marginBottom: "24px",
          boxShadow: "0 8px 32px rgba(10,25,41,0.25)",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div style={{ position: "absolute", top: "-80px", right: "-80px", width: "300px", height: "300px", borderRadius: "50%", background: "rgba(255,255,255,0.04)", pointerEvents: "none" }} />
        <div style={{ position: "relative", zIndex: 1 }}>
          <h1 style={{ fontFamily: "Sora, sans-serif", fontWeight: 700, fontSize: "28px", color: "white", margin: 0 }}>
            Quotation Configuration
          </h1>
          <p style={{ fontSize: "14px", color: "rgba(255,255,255,0.6)", marginTop: "4px", marginBottom: 0 }}>
            Rates, notes, and terms for all quotation templates
          </p>
        </div>
        <button
          onClick={saveAll}
          disabled={saving || !hasChanges}
          style={{
            position: "relative", zIndex: 1,
            background: "linear-gradient(135deg, #FF8F00, #FFB300)",
            color: "white", border: "none", borderRadius: "12px",
            padding: "12px 24px", fontWeight: 700, fontSize: "14px",
            cursor: hasChanges ? "pointer" : "default",
            opacity: hasChanges ? 1 : 0.7,
            transition: "opacity 200ms", fontFamily: "inherit",
          }}
        >
          {saving ? "Saving…" : "Save All Settings"}
        </button>
      </div>

      {/* ── Template Tabs ── */}
      <div style={{ display: "flex", gap: "4px", marginBottom: "20px", overflowX: "auto", paddingBottom: "4px" }}>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: "10px 20px",
              borderRadius: "12px",
              border: activeTab === tab.id ? `2px solid ${tab.color}` : "2px solid transparent",
              background: activeTab === tab.id ? `${tab.color}12` : "white",
              color: activeTab === tab.id ? tab.color : "#546E7A",
              fontWeight: 700,
              fontSize: "14px",
              cursor: "pointer",
              whiteSpace: "nowrap",
              transition: "all 150ms",
              boxShadow: activeTab === tab.id ? `0 2px 8px ${tab.color}20` : "0 1px 3px rgba(0,0,0,0.06)",
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Global settings ── */}
      <div style={{ ...cardStyle, marginBottom: "20px" }}>
        <div style={{ padding: "16px 24px", display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "13px", fontWeight: 600, color: "#0A1929" }}>GST Rate</span>
            <input
              type="number"
              min={0}
              max={100}
              value={s.gst_rate || "18"}
              onChange={(e) => set("gst_rate")(e.target.value)}
              style={{
                width: "60px", padding: "6px 8px", border: "1.5px solid #E0E7EF",
                borderRadius: "8px", fontSize: "14px", color: "#0A1929", background: "#FAFBFC",
                textAlign: "center", fontFamily: "JetBrains Mono, monospace",
              }}
            />
            <span style={{ fontSize: "13px", color: "#546E7A" }}>%</span>
          </div>
          <div style={{ height: "24px", width: "1px", background: "#E0E7EF" }} />
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "13px", fontWeight: 600, color: "#0A1929" }}>Quotation Validity</span>
            <input
              type="number"
              min={1}
              max={365}
              value={s.quotation_validity_days || "30"}
              onChange={(e) => saveOne("quotation_validity_days", e.target.value)}
              style={{
                width: "60px", padding: "6px 8px", border: "1.5px solid #E0E7EF",
                borderRadius: "8px", fontSize: "14px", color: "#0A1929", background: "#FAFBFC",
                textAlign: "center", fontFamily: "JetBrains Mono, monospace",
              }}
            />
            <span style={{ fontSize: "13px", color: "#546E7A" }}>days</span>
          </div>
        </div>
      </div>

      {/* ── TAB: Original SI ── */}
      {activeTab === "original" && (
        <>
          <div style={cardStyle}>
            <SettingsCardHeader Icon={DollarSign} iconBg="#E8F5E9" iconColor="#00897B" title="Soil Investigation Rates" />
            <p style={{ fontSize: "13px", color: "#546E7A", padding: "8px 24px 12px" }}>
              Default rates used when generating SI quotation variants. All values in INR.
            </p>
            <div style={{ padding: "0 24px 20px", display: "flex", flexDirection: "column", gap: "16px" }}>
              <div style={{ fontSize: "13px", fontWeight: 700, color: "#0A1929", textTransform: "uppercase", letterSpacing: "0.06em", paddingBottom: "4px", borderBottom: "1px solid #E0E7EF" }}>
                A. Field Work
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <PremiumInput label="Mobilisation (per bore)" value={s.rate_mobilisation_per_bore ?? ""} onChange={set("rate_mobilisation_per_bore")} type="number" font="mono" />
                <PremiumInput label="Drilling — Soil (per m)" value={s.rate_drilling_soil_per_m ?? ""} onChange={set("rate_drilling_soil_per_m")} type="number" font="mono" />
                <PremiumInput label="Drilling — Rock (per m)" value={s.rate_drilling_rock_per_m ?? ""} onChange={set("rate_drilling_rock_per_m")} type="number" font="mono" />
                <PremiumInput label="SPT (per test)" value={s.rate_spt_per_test ?? ""} onChange={set("rate_spt_per_test")} type="number" font="mono" />
                <PremiumInput label="UDS (per sample)" value={s.rate_uds_per_sample ?? ""} onChange={set("rate_uds_per_sample")} type="number" font="mono" />
                <PremiumInput label="Core Cutting — Rock (per m)" value={s.rate_core_cutting_per_m ?? ""} onChange={set("rate_core_cutting_per_m")} type="number" font="mono" />
                <PremiumInput label="Water Sample" value={s.rate_water_sample ?? ""} onChange={set("rate_water_sample")} type="number" font="mono" />
              </div>

              <div style={{ fontSize: "13px", fontWeight: 700, color: "#0A1929", textTransform: "uppercase", letterSpacing: "0.06em", paddingBottom: "4px", borderBottom: "1px solid #E0E7EF", marginTop: "8px" }}>
                B. Laboratory Testing
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <PremiumInput label="Lab — Soil (per sample)" value={s.rate_lab_soil_per_sample ?? ""} onChange={set("rate_lab_soil_per_sample")} type="number" font="mono" />
                <PremiumInput label="Lab — Rock (per sample)" value={s.rate_lab_rock_per_sample ?? ""} onChange={set("rate_lab_rock_per_sample")} type="number" font="mono" />
                <PremiumInput label="Lab — Water (per sample)" value={s.rate_lab_water_per_sample ?? ""} onChange={set("rate_lab_water_per_sample")} type="number" font="mono" />
              </div>

              <div style={{ fontSize: "13px", fontWeight: 700, color: "#0A1929", textTransform: "uppercase", letterSpacing: "0.06em", paddingBottom: "4px", borderBottom: "1px solid #E0E7EF", marginTop: "8px" }}>
                C. Miscellaneous & D. Report
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <PremiumInput label="Travel (per km)" value={s.rate_travel_per_km ?? ""} onChange={set("rate_travel_per_km")} type="number" font="mono" />
                <PremiumInput label="Miscellaneous (lump sum)" value={s.rate_misc_lumpsum ?? ""} onChange={set("rate_misc_lumpsum")} type="number" font="mono" />
                <PremiumInput label="Report Writing (per bore)" value={s.rate_reporting_per_bore ?? ""} onChange={set("rate_reporting_per_bore")} type="number" font="mono" />
                <PremiumInput label="Boring Log (per bore)" value={s.rate_boring_log_per_bore ?? ""} onChange={set("rate_boring_log_per_bore")} type="number" font="mono" />
              </div>

              <div style={{ fontSize: "13px", fontWeight: 700, color: "#0A1929", textTransform: "uppercase", letterSpacing: "0.06em", paddingBottom: "4px", borderBottom: "1px solid #E0E7EF", marginTop: "8px" }}>
                Conditional Items
              </div>
              <p style={{ fontSize: "13px", color: "#546E7A", margin: "-8px 0 4px" }}>Auto-added based on intake form &amp; site visit conditions</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <PremiumInput label="Equipment Setup (per move)" value={s.rate_setup_per_move ?? ""} onChange={set("rate_setup_per_move")} type="number" font="mono" helper="Added when bores > 1" />
                <PremiumInput label="Water Arrangement (LS)" value={s.rate_water_arrangement ?? ""} onChange={set("rate_water_arrangement")} type="number" font="mono" helper="Added when client can't provide water" />
                <PremiumInput label="TPA / Safety (LS)" value={s.rate_safety_arrangement ?? ""} onChange={set("rate_safety_arrangement")} type="number" font="mono" helper="Added when safety requirements exist" />
                <PremiumInput label="Generator / Power (LS)" value={s.rate_generator_arrangement ?? ""} onChange={set("rate_generator_arrangement")} type="number" font="mono" helper="Added when electricity not available" />
                <PremiumInput label="Security Arrangement (LS)" value={s.rate_security_arrangement ?? ""} onChange={set("rate_security_arrangement")} type="number" font="mono" helper="Added when security not available" />
                <PremiumInput label="Access Surcharge (LS)" value={s.rate_access_arrangement ?? ""} onChange={set("rate_access_arrangement")} type="number" font="mono" helper="Added when site access is difficult" />
              </div>
            </div>
          </div>

          <div style={cardStyle}>
            <SettingsCardHeader Icon={FileText} iconBg="#F3E8FF" iconColor="#6A1B9A" title="SI Notes & Terms" />
            <p style={{ fontSize: "13px", color: "#546E7A", padding: "8px 24px 12px" }}>
              Notes and payment terms printed on generated SI quotation PDFs
            </p>
            <div style={{ padding: "0 24px 20px", display: "flex", flexDirection: "column", gap: "12px" }}>
              {NOTE_KEYS.map((key, i) => (
                <PremiumInput key={key} label={`Note ${i + 1}`} value={s[key] ?? ""} onChange={set(key)} />
              ))}
              <PremiumInput label="Payment Terms" value={s.quotation_payment_terms ?? ""} onChange={set("quotation_payment_terms")} helper="Displayed on the PDF below the total" />
              <PremiumInput label="Footer Text" value={s.quotation_footer_text} onChange={set("quotation_footer_text")} helper="Appears at the bottom of the PDF" />
            </div>
          </div>

          <div style={cardStyle}>
            <SettingsCardHeader Icon={FileText} iconBg="#EDE7F6" iconColor="#7B1FA2" title="Consultancy Settings" />
            <p style={{ fontSize: "13px", color: "#546E7A", padding: "8px 24px 12px" }}>
              Default line items, notes, and payment terms for consultancy quotations
            </p>
            <div style={{ padding: "0 24px 20px", display: "flex", flexDirection: "column", gap: "12px" }}>
              <div style={{ fontSize: "13px", fontWeight: 700, color: "#0A1929", textTransform: "uppercase", letterSpacing: "0.06em", paddingBottom: "4px", borderBottom: "1px solid #E0E7EF" }}>
                Default Line Items
              </div>
              {CONSULTANCY_ITEM_KEYS.map((key, i) => (
                <PremiumInput key={key} label={`Item ${i + 1} Description`} value={s[key] ?? ""} onChange={set(key)} />
              ))}

              <div style={{ fontSize: "13px", fontWeight: 700, color: "#0A1929", textTransform: "uppercase", letterSpacing: "0.06em", paddingBottom: "4px", borderBottom: "1px solid #E0E7EF", marginTop: "8px" }}>
                Notes & Terms
              </div>
              {CONSULTANCY_NOTE_KEYS.map((key, i) => (
                <PremiumInput key={key} label={`Consultancy Note ${i + 1}`} value={s[key] ?? ""} onChange={set(key)} />
              ))}
              <PremiumInput label="Consultancy Payment Terms" value={s.consultancy_payment_terms ?? ""} onChange={set("consultancy_payment_terms")} helper="Displayed on consultancy PDF below the total" />
            </div>
          </div>
        </>
      )}

      {/* ── TAB: BOQ Type 1 ── */}
      {activeTab === "boq1" && (
        <>
          <div style={cardStyle}>
            <SettingsCardHeader Icon={DollarSign} iconBg="#E0F2F1" iconColor="#00897B" title="BOQ Type 1 — Rates" />
            <p style={{ fontSize: "13px", color: "#546E7A", padding: "8px 24px 12px" }}>
              Standard SI BOQ — field works, detailed lab tests, report. All values in ₹.
            </p>
            <div style={{ padding: "0 24px 20px" }}>
              <RateSection sections={BOQ1_RATE_SECTIONS} s={s} set={set} />
            </div>
          </div>

          <div style={cardStyle}>
            <SettingsCardHeader Icon={FileText} iconBg="#E0F2F1" iconColor="#00897B" title="BOQ Type 1 — Notes & Terms" />
            <p style={{ fontSize: "13px", color: "#546E7A", padding: "8px 24px 12px" }}>
              Notes and payment terms printed on BOQ Type 1 PDF
            </p>
            <div style={{ padding: "0 24px 20px", display: "flex", flexDirection: "column", gap: "12px" }}>
              {BOQ1_NOTE_KEYS.map((key, i) => (
                <PremiumInput key={key} label={`Note ${i + 1}`} value={s[key] ?? ""} onChange={set(key)} />
              ))}
              <PremiumInput label="Payment Terms" value={s.boq1_payment_terms ?? ""} onChange={set("boq1_payment_terms")} helper="Displayed on the BOQ Type 1 PDF" />
            </div>
          </div>
        </>
      )}

      {/* ── TAB: BOQ Type 2 ── */}
      {activeTab === "boq2" && (
        <>
          <div style={cardStyle}>
            <SettingsCardHeader Icon={DollarSign} iconBg="#F3E8FF" iconColor="#6A1B9A" title="BOQ Type 2 — Rates" />
            <p style={{ fontSize: "13px", color: "#546E7A", padding: "8px 24px 12px" }}>
              Foundation Pile BOQ — topography survey + SI with remarks. All values in ₹.
            </p>
            <div style={{ padding: "0 24px 20px" }}>
              <RateSection sections={BOQ2_RATE_SECTIONS} s={s} set={set} />
            </div>
          </div>

          <div style={cardStyle}>
            <SettingsCardHeader Icon={FileText} iconBg="#F3E8FF" iconColor="#6A1B9A" title="BOQ Type 2 — Notes & Terms" />
            <p style={{ fontSize: "13px", color: "#546E7A", padding: "8px 24px 12px" }}>
              Notes and payment terms printed on BOQ Type 2 PDF
            </p>
            <div style={{ padding: "0 24px 20px", display: "flex", flexDirection: "column", gap: "12px" }}>
              {BOQ2_NOTE_KEYS.map((key, i) => (
                <PremiumInput key={key} label={`Note ${i + 1}`} value={s[key] ?? ""} onChange={set(key)} />
              ))}
              <PremiumInput label="Payment Terms" value={s.boq2_payment_terms ?? ""} onChange={set("boq2_payment_terms")} helper="Displayed on the BOQ Type 2 PDF" />
            </div>
          </div>
        </>
      )}

      {/* ── TAB: BOQ Type 3 ── */}
      {activeTab === "boq3" && (
        <>
          <div style={cardStyle}>
            <SettingsCardHeader Icon={DollarSign} iconBg="#FFF3E0" iconColor="#E65100" title="BOQ Type 3 — Rates" />
            <p style={{ fontSize: "13px", color: "#546E7A", padding: "8px 24px 12px" }}>
              Regional BOQ — summary page, company info, depth tiers. All values in ₹.
            </p>
            <div style={{ padding: "0 24px 20px" }}>
              <RateSection sections={BOQ3_RATE_SECTIONS} s={s} set={set} />
            </div>
          </div>

          <div style={cardStyle}>
            <SettingsCardHeader Icon={FileText} iconBg="#FFF3E0" iconColor="#E65100" title="BOQ Type 3 — Notes & Terms" />
            <p style={{ fontSize: "13px", color: "#546E7A", padding: "8px 24px 12px" }}>
              Notes and payment terms printed on BOQ Type 3 PDF
            </p>
            <div style={{ padding: "0 24px 20px", display: "flex", flexDirection: "column", gap: "12px" }}>
              {BOQ3_NOTE_KEYS.map((key, i) => (
                <PremiumInput key={key} label={`Note ${i + 1}`} value={s[key] ?? ""} onChange={set(key)} />
              ))}
              <PremiumInput label="Payment Terms" value={s.boq3_payment_terms ?? ""} onChange={set("boq3_payment_terms")} helper="Displayed on the BOQ Type 3 PDF" />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
