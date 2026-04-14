import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, Plus, Loader2, Table2, X } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonRow } from "@/components/ui/SkeletonLoader";

type Rate = Tables<"rate_matrix">;

const STRUCTURE_TYPES = ["residential", "commercial", "industrial", "infrastructure", "other"] as const;
const SOIL_TYPES = ["soil", "rock", "mixed"] as const;

const structureTypeLabels: Record<string, string> = {
  residential: "Residential",
  commercial: "Commercial",
  industrial: "Industrial",
  infrastructure: "Infrastructure",
  other: "Other",
};

const soilTypeLabels: Record<string, string> = {
  soil: "Soil",
  rock: "Rock",
  mixed: "Mixed",
};

const STRUCTURE_GRADIENT: Record<string, string> = {
  residential:    "linear-gradient(90deg,#1565C0,#2979FF)",
  commercial:     "linear-gradient(90deg,#6A1B9A,#AB47BC)",
  industrial:     "linear-gradient(90deg,#E65100,#FF8F00)",
  infrastructure: "linear-gradient(90deg,#00897B,#26A69A)",
  other:          "linear-gradient(90deg,#546E7A,#78909C)",
};

const STRUCTURE_PILL: Record<string, { bg: string; color: string }> = {
  residential:    { bg: "#EBF2FF", color: "#1565C0" },
  commercial:     { bg: "#F3E8FF", color: "#6A1B9A" },
  industrial:     { bg: "#FFF3E0", color: "#E65100" },
  infrastructure: { bg: "#E0F2F1", color: "#00897B" },
  other:          { bg: "#F1F5F9", color: "#546E7A" },
};

const emptyForm = {
  city: "", state: "", structure_type: "", soil_type: "",
  rate_per_bore: "", rate_per_metre_soil: "", rate_per_metre_rock: "",
  rate_reporting: "", rate_travel_per_km: "", minimum_charge: "",
};

export default function RateMatrix() {
  const [rates, setRates] = useState<Rate[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [missingCities, setMissingCities] = useState<string[]>([]);
  const [deactivateHover, setDeactivateHover] = useState<string | null>(null);

  const fetchRates = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("rate_matrix")
      .select("*")
      .eq("is_active", true)
      .order("city")
      .order("structure_type");
    if (error) toast.error(error.message);
    else setRates(data ?? []);
    setLoading(false);
  };

  const checkCoverage = async () => {
    const [enqRes, rateRes] = await Promise.all([
      supabase.from("enquiries").select("site_city").is("deleted_at", null),
      supabase.from("rate_matrix").select("city").eq("is_active", true),
    ]);
    const enqCities = new Set((enqRes.data ?? []).map((r) => r.site_city.toLowerCase().trim()));
    const rateCities = new Set((rateRes.data ?? []).map((r) => r.city.toLowerCase().trim()));
    const missing = [...enqCities].filter((c) => !rateCities.has(c));
    setMissingCities(missing);
  };

  useEffect(() => { fetchRates(); checkCoverage(); }, []);

  const grouped = useMemo(() => {
    const map: Record<string, Rate[]> = {};
    rates.forEach((r) => { (map[r.city] ??= []).push(r); });
    return map;
  }, [rates]);

  const updateForm = (patch: Partial<typeof emptyForm>) => setForm((p) => ({ ...p, ...patch }));

  const handleSave = async () => {
    const errs: Record<string, string> = {};
    if (!form.city.trim()) errs.city = "Required";
    if (!form.structure_type) errs.structure_type = "Required";
    if (!form.soil_type) errs.soil_type = "Required";
    if (!form.rate_per_bore) errs.rate_per_bore = "Required";
    if (!form.rate_per_metre_soil) errs.rate_per_metre_soil = "Required";
    if (!form.rate_per_metre_rock) errs.rate_per_metre_rock = "Required";
    if (!form.rate_reporting) errs.rate_reporting = "Required";
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("rate_matrix").insert({
      city: form.city.trim(),
      state: form.state.trim() || null,
      structure_type: form.structure_type as any,
      soil_type: form.soil_type as any,
      rate_per_bore: Number(form.rate_per_bore),
      rate_per_metre_soil: Number(form.rate_per_metre_soil),
      rate_per_metre_rock: Number(form.rate_per_metre_rock),
      rate_reporting: Number(form.rate_reporting),
      rate_travel_per_km: form.rate_travel_per_km ? Number(form.rate_travel_per_km) : null,
      minimum_charge: form.minimum_charge ? Number(form.minimum_charge) : null,
      created_by: user!.id,
      is_active: true,
    });
    setSaving(false);
    if (error) {
      if (error.code === "23505") toast.error("An active rate already exists for this city, structure type, and soil type combination.");
      else toast.error(error.message);
      return;
    }
    toast.success("Rate added successfully");
    setOpen(false);
    setForm(emptyForm);
    fetchRates();
    checkCoverage();
  };

  const deactivate = async (id: string) => {
    const { error } = await supabase.from("rate_matrix").update({
      is_active: false,
      effective_to: new Date().toISOString().slice(0, 10),
    }).eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Rate deactivated"); fetchRates(); checkCoverage(); }
  };

  const inr = (n: number | null) => n != null ? formatCurrency(n) : "—";

  const formLabel = (text: string, required?: boolean) => (
    <label style={{ display: "block", marginBottom: "6px", fontSize: "11px", fontWeight: 600, color: "#546E7A", textTransform: "uppercase" as const, letterSpacing: "0.05em" }}>
      {text} {required && <span style={{ color: "#C62828" }}>*</span>}
    </label>
  );

  return (
    <div style={{ background: "#F0F4F8", minHeight: "100vh", padding: "24px" }}>

      {/* Header card — dark gradient */}
      <div
        style={{
          background: "linear-gradient(135deg, #0A1929 0%, #1565C0 100%)",
          borderRadius: "20px", padding: "28px 32px", marginBottom: "24px",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          boxShadow: "0 8px 32px rgba(10,25,41,0.25)", flexWrap: "wrap", gap: "16px",
        }}
      >
        <div>
          <h1 style={{ fontFamily: "Sora, sans-serif", fontWeight: 700, fontSize: "28px", color: "white", margin: 0 }}>
            Rate Matrix
          </h1>
          <p style={{ color: "rgba(255,255,255,0.6)", fontSize: "13px", marginTop: "4px" }}>
            Configure pricing rates by city and project type
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          {missingCities.length > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: "8px", background: "rgba(255,243,224,0.15)", border: "1px solid rgba(255,204,2,0.4)", borderRadius: "10px", padding: "7px 14px" }}>
              <AlertTriangle style={{ width: "14px", height: "14px", color: "#FFB300", flexShrink: 0 }} />
              <span style={{ fontSize: "12px", color: "#FFB300", fontWeight: 500 }}>
                {missingCities.length} city gap{missingCities.length > 1 ? "s" : ""}
              </span>
            </div>
          )}
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <button
                style={{
                  background: "linear-gradient(135deg, #FF8F00, #FFB300)",
                  color: "white", border: "none", borderRadius: "10px",
                  padding: "9px 18px", fontSize: "13px", fontWeight: 600,
                  cursor: "pointer", display: "flex", alignItems: "center", gap: "6px",
                  boxShadow: "0 4px 16px rgba(255,143,0,0.4)", whiteSpace: "nowrap",
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.transform = "translateY(-1px)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.transform = "translateY(0)"; }}
              >
                <Plus className="h-4 w-4" /> Add Rate
              </button>
            </DialogTrigger>
            <DialogContent
              className="max-w-lg max-h-[90vh] overflow-y-auto"
              style={{ borderRadius: "20px", padding: "32px", boxShadow: "0 24px 64px rgba(0,0,0,0.2)" }}
            >
              <DialogHeader>
                <DialogTitle style={{ fontFamily: "Sora, sans-serif", color: "#0A1929", fontSize: "18px", fontWeight: 700, marginBottom: "8px" }}>
                  Add Rate
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                {/* Row 1: City full width */}
                <div>
                  {formLabel("City", true)}
                  <Input value={form.city} onChange={(e) => updateForm({ city: e.target.value })} style={{ borderColor: "#E0E7EF", borderRadius: "10px" }} />
                  {errors.city && <p className="mt-1 text-xs" style={{ color: "#C62828" }}>{errors.city}</p>}
                </div>
                {/* Row 2: Structure Type | Soil Type */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    {formLabel("Structure Type", true)}
                    <Select value={form.structure_type} onValueChange={(v) => updateForm({ structure_type: v })}>
                      <SelectTrigger style={{ borderColor: "#E0E7EF", borderRadius: "10px" }}><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>{STRUCTURE_TYPES.map((t) => <SelectItem key={t} value={t} className="capitalize">{structureTypeLabels[t]}</SelectItem>)}</SelectContent>
                    </Select>
                    {errors.structure_type && <p className="mt-1 text-xs" style={{ color: "#C62828" }}>{errors.structure_type}</p>}
                  </div>
                  <div>
                    {formLabel("Soil Type", true)}
                    <Select value={form.soil_type} onValueChange={(v) => updateForm({ soil_type: v })}>
                      <SelectTrigger style={{ borderColor: "#E0E7EF", borderRadius: "10px" }}><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>{SOIL_TYPES.map((t) => <SelectItem key={t} value={t} className="capitalize">{soilTypeLabels[t]}</SelectItem>)}</SelectContent>
                    </Select>
                    {errors.soil_type && <p className="mt-1 text-xs" style={{ color: "#C62828" }}>{errors.soil_type}</p>}
                  </div>
                </div>
                {/* Row 3: Rate Per Bore | Rate Reporting */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    {formLabel("Rate Per Bore ₹", true)}
                    <Input type="number" min={1} value={form.rate_per_bore} onChange={(e) => updateForm({ rate_per_bore: e.target.value })} style={{ borderColor: "#E0E7EF", borderRadius: "10px" }} />
                    {errors.rate_per_bore && <p className="mt-1 text-xs" style={{ color: "#C62828" }}>{errors.rate_per_bore}</p>}
                  </div>
                  <div>
                    {formLabel("Rate Reporting ₹", true)}
                    <Input type="number" min={1} value={form.rate_reporting} onChange={(e) => updateForm({ rate_reporting: e.target.value })} style={{ borderColor: "#E0E7EF", borderRadius: "10px" }} />
                    {errors.rate_reporting && <p className="mt-1 text-xs" style={{ color: "#C62828" }}>{errors.rate_reporting}</p>}
                  </div>
                </div>
                {/* Row 4: Rate Per Metre Soil | Rate Per Metre Rock */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    {formLabel("Per Metre Soil ₹", true)}
                    <Input type="number" min={1} value={form.rate_per_metre_soil} onChange={(e) => updateForm({ rate_per_metre_soil: e.target.value })} style={{ borderColor: "#E0E7EF", borderRadius: "10px" }} />
                    {errors.rate_per_metre_soil && <p className="mt-1 text-xs" style={{ color: "#C62828" }}>{errors.rate_per_metre_soil}</p>}
                  </div>
                  <div>
                    {formLabel("Per Metre Rock ₹", true)}
                    <Input type="number" min={1} value={form.rate_per_metre_rock} onChange={(e) => updateForm({ rate_per_metre_rock: e.target.value })} style={{ borderColor: "#E0E7EF", borderRadius: "10px" }} />
                    {errors.rate_per_metre_rock && <p className="mt-1 text-xs" style={{ color: "#C62828" }}>{errors.rate_per_metre_rock}</p>}
                  </div>
                </div>
                {/* Row 5: Travel Per Km | Minimum Charge */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    {formLabel("Travel Per Km ₹")}
                    <Input type="number" min={0} value={form.rate_travel_per_km} onChange={(e) => updateForm({ rate_travel_per_km: e.target.value })} style={{ borderColor: "#E0E7EF", borderRadius: "10px" }} />
                  </div>
                  <div>
                    {formLabel("Minimum Charge ₹")}
                    <Input type="number" min={0} value={form.minimum_charge} onChange={(e) => updateForm({ minimum_charge: e.target.value })} style={{ borderColor: "#E0E7EF", borderRadius: "10px" }} />
                  </div>
                </div>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="w-full py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                  style={{
                    background: "linear-gradient(135deg,#1565C0,#2979FF)",
                    color: "white",
                    boxShadow: "0 4px 12px rgba(21,101,192,0.3)",
                  }}
                >
                  {saving ? <><Loader2 className="h-4 w-4 animate-spin" />Saving…</> : "Save Rate"}
                </button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Coverage warning banner */}
      {missingCities.length > 0 && (
        <div
          style={{
            background: "linear-gradient(135deg,#FFF3E0,#FFF8E1)",
            border: "1px solid #FFCC02", borderRadius: "12px",
            padding: "12px 16px", display: "flex", alignItems: "center", gap: "10px",
            marginBottom: "20px",
          }}
        >
          <AlertTriangle style={{ width: "16px", height: "16px", color: "#E65100", flexShrink: 0 }} />
          <p style={{ fontSize: "13px", color: "#E65100", fontWeight: 500, margin: 0 }}>
            Missing rates for: <strong>{missingCities.join(", ")}</strong>. Quotations cannot be generated for these cities.
          </p>
        </div>
      )}

      {loading ? (
        <div style={{ background: "white", borderRadius: "16px", border: "1px solid #E0E7EF", overflow: "hidden" }}>
          {Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)}
        </div>
      ) : rates.length === 0 ? (
        <EmptyState
          icon={Table2}
          title="No rates configured yet."
          subtitle="Add your first rate to start generating quotations."
        />
      ) : (
        Object.entries(grouped).map(([city, cityRates]) => (
          <div key={city}>
            {/* City header */}
            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "12px", marginTop: "24px" }}>
              <div style={{
                background: "linear-gradient(135deg,#0A1929,#1565C0)",
                color: "white", borderRadius: "10px",
                padding: "6px 14px", fontSize: "12px", fontWeight: 700,
                fontFamily: "Sora, sans-serif",
              }}>
                {city}
              </div>
              <div style={{ flex: 1, height: "1px", background: "#E0E7EF" }} />
              <span style={{ fontSize: "11px", color: "#546E7A" }}>
                {cityRates.length} rate{cityRates.length > 1 ? "s" : ""}
              </span>
            </div>

            {/* Rate cards grid */}
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(380px, 1fr))",
              gap: "12px",
              marginBottom: "8px",
              width: "100%",
            }}>
              {cityRates.map((r) => {
                const pill = STRUCTURE_PILL[r.structure_type] ?? STRUCTURE_PILL.other;
                return (
                  <div
                    key={r.id}
                    style={{
                      background: "white", borderRadius: "14px",
                      border: "1px solid #E0E7EF",
                      boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
                      overflow: "hidden", transition: "all 200ms", position: "relative",
                      width: "100%",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.boxShadow = "0 8px 24px rgba(0,0,0,0.1)";
                      e.currentTarget.style.transform = "translateY(-2px)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.05)";
                      e.currentTarget.style.transform = "translateY(0)";
                    }}
                  >
                    {/* Top accent band */}
                    <div style={{ height: "4px", background: STRUCTURE_GRADIENT[r.structure_type] ?? STRUCTURE_GRADIENT.other }} />

                    {/* Card body */}
                    <div style={{ padding: "16px" }}>
                      {/* Top row: pills + deactivate */}
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", justifyContent: "space-between" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                          <span
                            className="text-[10px] font-semibold px-2.5 py-1 rounded-full uppercase tracking-wide"
                            style={{ background: pill.bg, color: pill.color }}
                          >
                            {structureTypeLabels[r.structure_type] ?? r.structure_type}
                          </span>
                          <span
                            className="text-[10px] font-semibold px-2.5 py-1 rounded-full uppercase tracking-wide"
                            style={{ background: "#F1F5F9", color: "#546E7A" }}
                          >
                            {soilTypeLabels[r.soil_type] ?? r.soil_type}
                          </span>
                        </div>
                        <button
                          onClick={() => deactivate(r.id)}
                          style={{
                            background: "none", border: "none", cursor: "pointer", padding: "2px 6px",
                            fontSize: "11px", fontWeight: 500,
                            color: deactivateHover === r.id ? "#C62828" : "#94A3B8",
                            display: "flex", alignItems: "center", gap: "4px",
                            transition: "color 150ms", flexShrink: 0,
                          }}
                          onMouseEnter={() => setDeactivateHover(r.id)}
                          onMouseLeave={() => setDeactivateHover(null)}
                          title="Deactivate this rate"
                        >
                          <X style={{ width: "12px", height: "12px" }} /> Deactivate
                        </button>
                      </div>

                      {/* Rates 2×2 grid */}
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginTop: "12px" }}>
                        {[
                          { label: "Per Bore",          value: r.rate_per_bore },
                          { label: "Per Metre (Soil)",  value: r.rate_per_metre_soil },
                          { label: "Per Metre (Rock)",  value: r.rate_per_metre_rock },
                          { label: "Reporting",         value: r.rate_reporting },
                        ].map((cell) => (
                          <div key={cell.label} style={{ background: "#F8FAFC", borderRadius: "8px", padding: "10px 12px" }}>
                            <div
                              className="text-[10px] uppercase tracking-wide"
                              style={{ color: "#546E7A" }}
                            >
                              {cell.label}
                            </div>
                            <div
                              className="text-base font-bold font-mono mt-0.5"
                              style={{ color: "#0A1929" }}
                            >
                              {inr(cell.value)}
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Optional: min charge / travel */}
                      {(r.minimum_charge != null || r.rate_travel_per_km != null) && (
                        <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
                          {r.rate_travel_per_km != null && (
                            <div style={{ background: "#F8FAFC", borderRadius: "8px", padding: "8px 12px", flex: 1 }}>
                              <div className="text-[10px] uppercase tracking-wide" style={{ color: "#546E7A" }}>Travel/km</div>
                              <div className="text-sm font-bold font-mono mt-0.5" style={{ color: "#0A1929" }}>{inr(r.rate_travel_per_km)}</div>
                            </div>
                          )}
                          {r.minimum_charge != null && (
                            <div style={{ background: "#F8FAFC", borderRadius: "8px", padding: "8px 12px", flex: 1 }}>
                              <div className="text-[10px] uppercase tracking-wide" style={{ color: "#546E7A" }}>Min Charge</div>
                              <div className="text-sm font-bold font-mono mt-0.5" style={{ color: "#0A1929" }}>{inr(r.minimum_charge)}</div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
