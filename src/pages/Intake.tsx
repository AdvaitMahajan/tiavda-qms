import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import {
  Home, Building2, Factory, Landmark, CheckCircle2, AlertTriangle,
  Minus, Plus, Loader2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type TokenData = {
  id: string;
  status: string | null;
  expires_at: string;
  client_id: string | null;
};

type FormData = {
  site_address: string;
  site_city: string;
  site_state: string;
  site_pincode: string;
  structure_type: string;
  num_bores: number;
  expected_depth_m: string;
  num_floors: number;
  basement_floors: number;
  soil_type_hint: string;
  remarks: string;
};

const STRUCTURE_TYPES = [
  { value: "residential", label: "Residential", icon: Home },
  { value: "commercial", label: "Commercial", icon: Building2 },
  { value: "industrial", label: "Industrial", icon: Factory },
  { value: "infrastructure", label: "Infrastructure", icon: Landmark },
] as const;

const initialForm: FormData = {
  site_address: "", site_city: "", site_state: "", site_pincode: "",
  structure_type: "", num_bores: 1, expected_depth_m: "",
  num_floors: 0, basement_floors: 0, soil_type_hint: "", remarks: "",
};

function Stepper({ value, onChange, min, max }: { value: number; onChange: (v: number) => void; min: number; max: number }) {
  return (
    <div className="flex items-center gap-3">
      <button type="button" onClick={() => onChange(Math.max(min, value - 1))}
        className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card text-foreground hover:bg-muted/20 disabled:opacity-40"
        disabled={value <= min}><Minus className="h-4 w-4" /></button>
      <span className="w-10 text-center font-mono text-lg font-semibold">{value}</span>
      <button type="button" onClick={() => onChange(Math.min(max, value + 1))}
        className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card text-foreground hover:bg-muted/20 disabled:opacity-40"
        disabled={value >= max}><Plus className="h-4 w-4" /></button>
    </div>
  );
}

function ProgressIndicator({ current, completed }: { current: number; completed: number[] }) {
  return (
    <div className="flex items-center justify-center gap-0 mb-8">
      {[1, 2, 3].map((s, i) => (
        <div key={s} className="flex items-center">
          <div className={cn(
            "flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold transition-colors",
            s === current && "bg-navy text-white",
            completed.includes(s) && s !== current && "bg-green text-white",
            !completed.includes(s) && s !== current && "border-2 border-border text-muted-foreground bg-card"
          )}>{completed.includes(s) && s !== current ? "✓" : s}</div>
          {i < 2 && <div className={cn("h-0.5 w-12 sm:w-20", completed.includes(s) ? "bg-green" : "bg-border")} />}
        </div>
      ))}
    </div>
  );
}

function ErrorCard({ title, message }: { title: string; message: string }) {
  return (
    <div className="flex min-h-screen flex-col">
      <div className="bg-navy px-6 py-6">
        <h1 className="font-heading text-xl font-bold text-white">Tiavda Enterprises</h1>
      </div>
      <div className="flex flex-1 items-center justify-center bg-surface p-6">
        <div className="w-full max-w-md rounded-xl border border-border bg-card p-8 text-center shadow-lg">
          <AlertTriangle className="mx-auto mb-4 h-12 w-12 text-amber" />
          <h2 className="mb-2 font-heading text-xl font-bold text-navy">{title}</h2>
          <p className="text-sm text-muted-foreground">{message}</p>
        </div>
      </div>
    </div>
  );
}

export default function Intake() {
  const [searchParams] = useSearchParams();
  const tokenStr = searchParams.get("t");

  const [tokenData, setTokenData] = useState<TokenData | null>(null);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState(1);
  const [direction, setDirection] = useState(1);
  const [form, setForm] = useState<FormData>(initialForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [refNumber, setRefNumber] = useState("");

  useEffect(() => {
    async function validate() {
      if (!tokenStr) { setTokenError("invalid"); setLoading(false); return; }
      const { data, error } = await supabase
        .from("intake_tokens").select("id, status, expires_at, client_id")
        .eq("token", tokenStr).maybeSingle();
      if (error || !data) setTokenError("invalid");
      else if (data.status === "used") setTokenError("used");
      else if (new Date(data.expires_at) < new Date()) setTokenError("expired");
      else setTokenData(data);
      setLoading(false);
    }
    validate();
  }, [tokenStr]);

  const updateForm = useCallback((patch: Partial<FormData>) => {
    setForm((prev) => ({ ...prev, ...patch }));
  }, []);

  const validateStep = (s: number): boolean => {
    const errs: Record<string, string> = {};
    if (s === 1) {
      if (!form.site_address.trim()) errs.site_address = "Site address is required";
      if (!form.site_city.trim()) errs.site_city = "City is required";
      if (form.site_pincode && !/^\d*$/.test(form.site_pincode)) errs.site_pincode = "Pincode must be numeric";
    }
    if (s === 2) {
      if (!form.structure_type) errs.structure_type = "Please select a structure type";
      if (form.num_bores < 1) errs.num_bores = "At least 1 bore required";
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const goNext = () => { if (!validateStep(step)) return; setDirection(1); setStep((s) => Math.min(3, s + 1)); };
  const goBack = () => { setDirection(-1); setStep((s) => Math.max(1, s - 1)); };

  const handleSubmit = async () => {
    if (!validateStep(step) || !tokenData) return;
    setSubmitting(true);
    try {
      const { data: sub, error: subErr } = await supabase.from("intake_submissions").insert({
        token_id: tokenData.id,
        site_address: form.site_address.trim(),
        site_city: form.site_city.trim(),
        site_state: form.site_state.trim() || null,
        site_pincode: form.site_pincode.trim() || null,
        structure_type: form.structure_type as any,
        num_floors: form.num_floors,
        basement_floors: form.basement_floors,
        num_bores: form.num_bores,
        expected_depth_m: form.expected_depth_m ? Number(form.expected_depth_m) : null,
        soil_type_hint: (form.soil_type_hint || null) as any,
        remarks: form.remarks.trim() || null,
        client_id: tokenData.client_id,
      }).select("id").single();
      if (subErr) throw subErr;

      await supabase.from("intake_tokens").update({ status: "used", used_at: new Date().toISOString() }).eq("id", tokenData.id);

      const { data: enq, error: enqErr } = await supabase.from("enquiries").insert({
        client_id: tokenData.client_id!,
        site_city: form.site_city.trim(),
        site_address: form.site_address.trim(),
        structure_type: form.structure_type as any,
        num_bores: form.num_bores,
        expected_depth_m: form.expected_depth_m ? Number(form.expected_depth_m) : null,
        soil_type_hint: (form.soil_type_hint || null) as any,
        remarks: form.remarks.trim() || null,
        submission_id: sub.id,
      }).select("ref_number").single();
      if (enqErr) throw enqErr;

      setRefNumber(enq.ref_number);
      setSubmitted(true);
    } catch (err: any) {
      toast.error(err.message || "Submission failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="flex min-h-screen items-center justify-center bg-surface"><Loader2 className="h-8 w-8 animate-spin text-navy" /></div>;
  if (tokenError === "invalid") return <ErrorCard title="Invalid Link" message="This link is invalid. Please contact Tiavda Enterprises at +91 8605811117." />;
  if (tokenError === "used") return <ErrorCard title="Already Submitted" message="This form has already been submitted. Thank you!" />;
  if (tokenError === "expired") return <ErrorCard title="Link Expired" message="This link has expired. Please contact Tiavda Enterprises at +91 8605811117." />;

  if (submitted) {
    return (
      <div className="flex min-h-screen flex-col">
        <div className="bg-navy px-6 py-6"><h1 className="font-heading text-xl font-bold text-white">Tiavda Enterprises</h1></div>
        <div className="flex flex-1 items-center justify-center bg-surface p-6">
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-8 text-center shadow-lg">
            <CheckCircle2 className="mx-auto mb-4 h-16 w-16 text-green" />
            <h2 className="mb-2 font-heading text-2xl font-bold text-navy">Submitted Successfully!</h2>
            <p className="mb-1 text-sm text-muted-foreground">Your Reference Number:</p>
            <p className="font-mono text-2xl font-bold text-navy">{refNumber}</p>
            <p className="mt-4 text-sm text-muted-foreground">Our team will contact you shortly.</p>
          </div>
        </div>
      </div>
    );
  }

  const completedSteps = Array.from({ length: step - 1 }, (_, i) => i + 1);
  const slideVariants = {
    enter: (d: number) => ({ x: d > 0 ? 300 : -300, opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (d: number) => ({ x: d > 0 ? -300 : 300, opacity: 0 }),
  };

  return (
    <div className="flex min-h-screen flex-col">
      <div className="bg-navy px-6 py-6">
        <h1 className="font-heading text-xl font-bold text-white">Tiavda Enterprises</h1>
        <p className="text-sm text-white/60">Project Information Form</p>
      </div>
      <div className="flex flex-1 justify-center bg-surface p-4 sm:p-8">
        <div className="w-full max-w-2xl">
          <ProgressIndicator current={step} completed={completedSteps} />
          <div className="overflow-hidden rounded-xl border border-border bg-card p-6 shadow-sm">
            <AnimatePresence mode="wait" custom={direction}>
              <motion.div key={step} custom={direction} variants={slideVariants} initial="enter" animate="center" exit="exit" transition={{ duration: 0.25 }}>
                {step === 1 && (
                  <div className="space-y-5">
                    <h2 className="font-heading text-lg font-semibold text-navy">Site Details</h2>
                    <div>
                      <label className="mb-1.5 block text-sm font-medium">Site Address <span className="text-destructive">*</span></label>
                      <Textarea placeholder="Full site address including landmark" value={form.site_address} onChange={(e) => updateForm({ site_address: e.target.value })} rows={3} />
                      {errors.site_address && <p className="mt-1 text-xs text-destructive">{errors.site_address}</p>}
                    </div>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                      <div>
                        <label className="mb-1.5 block text-sm font-medium">City <span className="text-destructive">*</span></label>
                        <Input value={form.site_city} onChange={(e) => updateForm({ site_city: e.target.value })} />
                        {errors.site_city && <p className="mt-1 text-xs text-destructive">{errors.site_city}</p>}
                      </div>
                      <div>
                        <label className="mb-1.5 block text-sm font-medium">State</label>
                        <Input value={form.site_state} onChange={(e) => updateForm({ site_state: e.target.value })} />
                      </div>
                      <div>
                        <label className="mb-1.5 block text-sm font-medium">Pincode</label>
                        <Input value={form.site_pincode} onChange={(e) => updateForm({ site_pincode: e.target.value.replace(/\D/g, "").slice(0, 6) })} inputMode="numeric" />
                        {errors.site_pincode && <p className="mt-1 text-xs text-destructive">{errors.site_pincode}</p>}
                      </div>
                    </div>
                  </div>
                )}
                {step === 2 && (
                  <div className="space-y-5">
                    <h2 className="font-heading text-lg font-semibold text-navy">Project Details</h2>
                    <div>
                      <label className="mb-2 block text-sm font-medium">Structure Type <span className="text-destructive">*</span></label>
                      <div className="grid grid-cols-2 gap-3">
                        {STRUCTURE_TYPES.map(({ value, label, icon: Icon }) => (
                          <button key={value} type="button" onClick={() => updateForm({ structure_type: value })}
                            className={cn("flex flex-col items-center gap-2 rounded-xl border-2 p-4 transition-all",
                              form.structure_type === value ? "border-navy bg-navy/5" : "border-border bg-card hover:border-navy/40")}>
                            <Icon className={cn("h-7 w-7", form.structure_type === value ? "text-navy" : "text-muted-foreground")} />
                            <span className={cn("text-sm font-medium", form.structure_type === value ? "text-navy" : "text-foreground")}>{label}</span>
                          </button>
                        ))}
                      </div>
                      {errors.structure_type && <p className="mt-1 text-xs text-destructive">{errors.structure_type}</p>}
                    </div>
                    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                      <div><label className="mb-2 block text-sm font-medium">Number of Bores <span className="text-destructive">*</span></label>
                        <Stepper value={form.num_bores} onChange={(v) => updateForm({ num_bores: v })} min={1} max={100} /></div>
                      <div><label className="mb-1.5 block text-sm font-medium">Expected Depth (metres)</label>
                        <Input type="number" min={1} max={500} placeholder="e.g. 15" value={form.expected_depth_m} onChange={(e) => updateForm({ expected_depth_m: e.target.value })} /></div>
                      <div><label className="mb-2 block text-sm font-medium">Floors above ground</label>
                        <Stepper value={form.num_floors} onChange={(v) => updateForm({ num_floors: v })} min={0} max={50} /></div>
                      <div><label className="mb-2 block text-sm font-medium">Basement floors</label>
                        <Stepper value={form.basement_floors} onChange={(v) => updateForm({ basement_floors: v })} min={0} max={10} /></div>
                    </div>
                  </div>
                )}
                {step === 3 && (
                  <div className="space-y-5">
                    <h2 className="font-heading text-lg font-semibold text-navy">Additional Information</h2>
                    <div>
                      <label className="mb-2 block text-sm font-medium">Soil Type (optional)</label>
                      <div className="flex gap-2">
                        {(["soil", "rock", "mixed"] as const).map((t) => (
                          <button key={t} type="button" onClick={() => updateForm({ soil_type_hint: form.soil_type_hint === t ? "" : t })}
                            className={cn("rounded-lg border px-5 py-2 text-sm font-medium capitalize transition-colors",
                              form.soil_type_hint === t ? "border-navy bg-navy text-white" : "border-border bg-card text-foreground hover:border-navy/40")}>{t}</button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="mb-1.5 block text-sm font-medium">Remarks</label>
                      <Textarea placeholder="Any additional notes about the site or project" value={form.remarks} onChange={(e) => updateForm({ remarks: e.target.value })} rows={4} />
                    </div>
                    <Button onClick={handleSubmit} disabled={submitting} className="w-full bg-gold text-white font-medium hover:bg-gold/90">
                      {submitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Submitting…</> : "Submit Project Information"}
                    </Button>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
            <div className="mt-6 flex justify-between">
              {step > 1 ? <Button variant="outline" onClick={goBack}>Back</Button> : <div />}
              {step < 3 && <Button onClick={goNext} className="bg-navy text-white hover:bg-navy/90 ml-auto">Next</Button>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
