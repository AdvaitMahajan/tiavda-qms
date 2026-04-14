import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import { AlertTriangle, Plus, Loader2, Table2 } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonRow } from "@/components/ui/SkeletonLoader";

type Rate = Tables<"rate_matrix">;

const STRUCTURE_TYPES = ["residential", "commercial", "industrial", "infrastructure", "other"] as const;
const SOIL_TYPES = ["soil", "rock", "mixed"] as const;

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

  const tableStyle = {
    background: "#FFFFFF",
    borderRadius: "16px",
    boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
    border: "1px solid #E0E7EF",
    overflow: "hidden" as const,
  };

  return (
    <div className="min-h-screen space-y-6" style={{ background: "#F0F4F8" }}>
      {/* Header card */}
      <div
        style={{
          background: "#FFFFFF",
          borderRadius: "16px",
          padding: "20px 24px",
          border: "1px solid #E0E7EF",
          boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "16px",
        }}
      >
        <div>
          <h1 className="font-bold" style={{ fontFamily: "Sora, sans-serif", fontSize: "24px", color: "#0A1929" }}>
            Rate Matrix
          </h1>
          <p className="text-sm mt-0.5" style={{ color: "#546E7A" }}>
            {loading ? "Loading…" : `${rates.length} active rates`}
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <button
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all"
              style={{
                background: "linear-gradient(135deg,#1565C0,#2979FF)",
                color: "white",
                boxShadow: "0 4px 12px rgba(21,101,192,0.3)",
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
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1.5 block" style={{ fontSize: "11px", fontWeight: 600, color: "#546E7A", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    City <span style={{ color: "#C62828" }}>*</span>
                  </label>
                  <Input value={form.city} onChange={(e) => updateForm({ city: e.target.value })} style={{ borderColor: "#E0E7EF", borderRadius: "10px" }} />
                  {errors.city && <p className="mt-1 text-xs" style={{ color: "#C62828" }}>{errors.city}</p>}
                </div>
                <div>
                  <label className="mb-1.5 block" style={{ fontSize: "11px", fontWeight: 600, color: "#546E7A", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    State
                  </label>
                  <Input value={form.state} onChange={(e) => updateForm({ state: e.target.value })} style={{ borderColor: "#E0E7EF", borderRadius: "10px" }} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1.5 block" style={{ fontSize: "11px", fontWeight: 600, color: "#546E7A", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    Structure Type <span style={{ color: "#C62828" }}>*</span>
                  </label>
                  <Select value={form.structure_type} onValueChange={(v) => updateForm({ structure_type: v })}>
                    <SelectTrigger style={{ borderColor: "#E0E7EF", borderRadius: "10px" }}><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>{STRUCTURE_TYPES.map((t) => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}</SelectContent>
                  </Select>
                  {errors.structure_type && <p className="mt-1 text-xs" style={{ color: "#C62828" }}>{errors.structure_type}</p>}
                </div>
                <div>
                  <label className="mb-1.5 block" style={{ fontSize: "11px", fontWeight: 600, color: "#546E7A", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    Soil Type <span style={{ color: "#C62828" }}>*</span>
                  </label>
                  <Select value={form.soil_type} onValueChange={(v) => updateForm({ soil_type: v })}>
                    <SelectTrigger style={{ borderColor: "#E0E7EF", borderRadius: "10px" }}><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>{SOIL_TYPES.map((t) => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}</SelectContent>
                  </Select>
                  {errors.soil_type && <p className="mt-1 text-xs" style={{ color: "#C62828" }}>{errors.soil_type}</p>}
                </div>
              </div>
              {[
                ["rate_per_bore", "Rate Per Bore ₹", true],
                ["rate_per_metre_soil", "Rate Per Metre Soil ₹", true],
                ["rate_per_metre_rock", "Rate Per Metre Rock ₹", true],
                ["rate_reporting", "Rate Reporting ₹", true],
                ["rate_travel_per_km", "Rate Travel Per Km ₹", false],
                ["minimum_charge", "Minimum Charge ₹", false],
              ].map(([key, label, req]) => (
                <div key={key as string}>
                  <label className="mb-1.5 block" style={{ fontSize: "11px", fontWeight: 600, color: "#546E7A", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    {label as string} {req ? <span style={{ color: "#C62828" }}>*</span> : ""}
                  </label>
                  <Input
                    type="number"
                    min={1}
                    value={form[key as keyof typeof form]}
                    onChange={(e) => updateForm({ [key as string]: e.target.value })}
                    style={{ borderColor: "#E0E7EF", borderRadius: "10px" }}
                  />
                  {errors[key as string] && <p className="mt-1 text-xs" style={{ color: "#C62828" }}>{errors[key as string]}</p>}
                </div>
              ))}
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

      {missingCities.length > 0 && (
        <div
          className="flex items-start gap-3 rounded-xl p-4"
          style={{ background: "#FFF3E0", border: "1px solid #FFCC80" }}
        >
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" style={{ color: "#E65100" }} />
          <p className="text-sm" style={{ color: "#0A1929" }}>
            <span className="font-semibold">Missing rates for:</span>{" "}
            {missingCities.join(", ")}. Quotations cannot be generated for these cities.
          </p>
        </div>
      )}

      {loading ? (
        <div style={tableStyle}>
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
          <div key={city} className="space-y-2">
            <h2 className="font-bold text-lg" style={{ fontFamily: "Sora, sans-serif", color: "#0A1929" }}>{city}</h2>
            <div style={tableStyle}>
              <Table>
                <TableHeader>
                  <TableRow style={{ background: "#F8FAFC" }}>
                    {["Structure Type", "Soil Type", "Per Bore ₹", "Per Metre Soil ₹", "Per Metre Rock ₹", "Reporting ₹", "Min Charge ₹", "Actions"].map((h, i) => (
                      <TableHead
                        key={h}
                        className={i >= 2 && i <= 6 ? "text-right" : ""}
                        style={{ fontSize: "10px", color: "#546E7A", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600 }}
                      >
                        {h}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cityRates.map((r) => (
                    <TableRow
                      key={r.id}
                      className="transition-colors duration-100"
                      style={{ borderBottom: "1px solid #F0F4F8" }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "#F8FAFC"; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                    >
                      <TableCell className="capitalize" style={{ color: "#0A1929" }}>{r.structure_type}</TableCell>
                      <TableCell className="capitalize" style={{ color: "#546E7A" }}>{r.soil_type}</TableCell>
                      <TableCell className="text-right font-mono" style={{ color: "#0A1929" }}>{inr(r.rate_per_bore)}</TableCell>
                      <TableCell className="text-right font-mono" style={{ color: "#0A1929" }}>{inr(r.rate_per_metre_soil)}</TableCell>
                      <TableCell className="text-right font-mono" style={{ color: "#0A1929" }}>{inr(r.rate_per_metre_rock)}</TableCell>
                      <TableCell className="text-right font-mono" style={{ color: "#0A1929" }}>{inr(r.rate_reporting)}</TableCell>
                      <TableCell className="text-right font-mono" style={{ color: "#0A1929" }}>{inr(r.minimum_charge)}</TableCell>
                      <TableCell>
                        <button
                          onClick={() => deactivate(r.id)}
                          className="px-3 py-1 rounded-lg text-xs font-semibold transition-all"
                          style={{ border: "1px solid #FFCDD2", color: "#C62828", background: "transparent" }}
                          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "#FFEBEE"; }}
                          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                        >
                          Deactivate
                        </button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
