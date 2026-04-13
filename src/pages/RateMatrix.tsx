import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Plus, Loader2 } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-2xl font-bold text-foreground">Rate Matrix</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="bg-blue text-white hover:bg-blue/90"><Plus className="mr-2 h-4 w-4" />Add Rate</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Add Rate</DialogTitle></DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium">City <span className="text-destructive">*</span></label>
                  <Input value={form.city} onChange={(e) => updateForm({ city: e.target.value })} />
                  {errors.city && <p className="mt-1 text-xs text-destructive">{errors.city}</p>}
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">State</label>
                  <Input value={form.state} onChange={(e) => updateForm({ state: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium">Structure Type <span className="text-destructive">*</span></label>
                  <Select value={form.structure_type} onValueChange={(v) => updateForm({ structure_type: v })}>
                    <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>{STRUCTURE_TYPES.map((t) => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}</SelectContent>
                  </Select>
                  {errors.structure_type && <p className="mt-1 text-xs text-destructive">{errors.structure_type}</p>}
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">Soil Type <span className="text-destructive">*</span></label>
                  <Select value={form.soil_type} onValueChange={(v) => updateForm({ soil_type: v })}>
                    <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>{SOIL_TYPES.map((t) => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}</SelectContent>
                  </Select>
                  {errors.soil_type && <p className="mt-1 text-xs text-destructive">{errors.soil_type}</p>}
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
                  <label className="mb-1 block text-sm font-medium">{label as string} {req ? <span className="text-destructive">*</span> : ""}</label>
                  <Input type="number" min={1} value={form[key as keyof typeof form]} onChange={(e) => updateForm({ [key as string]: e.target.value })} />
                  {errors[key as string] && <p className="mt-1 text-xs text-destructive">{errors[key as string]}</p>}
                </div>
              ))}
              <Button onClick={handleSave} disabled={saving} className="w-full bg-blue text-white hover:bg-blue/90">
                {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving…</> : "Save Rate"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {missingCities.length > 0 && (
        <div className="flex items-start gap-3 rounded-lg border border-amber bg-amber/5 p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber" />
          <p className="text-sm text-foreground">
            <span className="font-semibold">Missing rates for:</span>{" "}
            {missingCities.join(", ")}. Quotations cannot be generated for these cities.
          </p>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-blue" /></div>
      ) : rates.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-12 text-center">
          <p className="text-muted-foreground">No rates configured yet. Add your first rate to start generating quotations.</p>
        </div>
      ) : (
        Object.entries(grouped).map(([city, rows]) => (
          <div key={city} className="space-y-2">
            <h2 className="font-heading text-lg font-bold text-navy">{city}</h2>
            <div className="overflow-x-auto rounded-lg border border-border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Structure Type</TableHead>
                    <TableHead>Soil Type</TableHead>
                    <TableHead className="text-right">Per Bore ₹</TableHead>
                    <TableHead className="text-right">Per Metre Soil ₹</TableHead>
                    <TableHead className="text-right">Per Metre Rock ₹</TableHead>
                    <TableHead className="text-right">Reporting ₹</TableHead>
                    <TableHead className="text-right">Min Charge ₹</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="capitalize">{r.structure_type}</TableCell>
                      <TableCell className="capitalize">{r.soil_type}</TableCell>
                      <TableCell className="text-right font-mono">{inr(r.rate_per_bore)}</TableCell>
                      <TableCell className="text-right font-mono">{inr(r.rate_per_metre_soil)}</TableCell>
                      <TableCell className="text-right font-mono">{inr(r.rate_per_metre_rock)}</TableCell>
                      <TableCell className="text-right font-mono">{inr(r.rate_reporting)}</TableCell>
                      <TableCell className="text-right font-mono">{inr(r.minimum_charge)}</TableCell>
                      <TableCell>
                        <Button variant="outline" size="sm" onClick={() => deactivate(r.id)} className="text-destructive border-destructive/30 hover:bg-destructive/5">Deactivate</Button>
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
