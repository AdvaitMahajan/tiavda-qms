import { useState, useEffect, useCallback } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { PUBLIC_SUPABASE_CLIENT_NAME, supabasePublic } from "@/integrations/supabase/publicClient";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import {
  Home, Building2, Factory, Landmark, CheckCircle, AlertTriangle,
  Minus, Plus, Loader2, ArrowLeft,
} from "lucide-react";
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

type SubmitIntakeRpcResult = {
  ref_number?: string | null;
  enquiry_id?: string | null;
  error?: string | null;
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

async function getPublicClientDebugContext() {
  const { data, error } = await supabasePublic.auth.getSession();
  if (error) {
    console.warn("[Intake] Unable to inspect public client session state", {
      client: PUBLIC_SUPABASE_CLIENT_NAME,
      error: error.message,
    });
  }
  return {
    client: PUBLIC_SUPABASE_CLIENT_NAME,
    hasSession: Boolean(data.session),
    sessionUserId: data.session?.user.id ?? null,
  };
}

function Stepper({ value, onChange, min, max }: { value: number; onChange: (v: number) => void; min: number; max: number }) {
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        className="flex h-9 w-9 items-center justify-center rounded-xl transition-all disabled:opacity-40"
        style={{ border: "1.5px solid #E0E7EF", background: "#FAFBFC" }}
        onMouseEnter={(e) => { if (value > min) (e.currentTarget as HTMLElement).style.background = "#F0F4F8"; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "#FAFBFC"; }}
      >
        <Minus className="h-4 w-4" style={{ color: "#546E7A" }} />
      </button>
      <span className="w-10 text-center font-mono text-lg font-semibold" style={{ color: "#0A1929" }}>{value}</span>
      <button
        type="button"
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        className="flex h-9 w-9 items-center justify-center rounded-xl transition-all disabled:opacity-40"
        style={{ border: "1.5px solid #E0E7EF", background: "#FAFBFC" }}
        onMouseEnter={(e) => { if (value < max) (e.currentTarget as HTMLElement).style.background = "#F0F4F8"; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "#FAFBFC"; }}
      >
        <Plus className="h-4 w-4" style={{ color: "#546E7A" }} />
      </button>
    </div>
  );
}

function ProgressIndicator({ current, completed }: { current: number; completed: number[] }) {
  return (
    <div className="flex items-center justify-center gap-0 mb-8">
      {[1, 2, 3].map((s, i) => {
        const isActive = s === current;
        const isComplete = completed.includes(s) && s !== current;
        return (
          <div key={s} className="flex items-center">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-full text-sm font-semibold transition-all"
              style={{
                background: isActive
                  ? "linear-gradient(135deg,#1565C0,#2979FF)"
                  : isComplete
                  ? "linear-gradient(135deg,#00897B,#26A69A)"
                  : "#FFFFFF",
                color: isActive || isComplete ? "white" : "#546E7A",
                border: isActive || isComplete ? "none" : "2px solid #E0E7EF",
                boxShadow: isActive ? "0 4px 16px rgba(21,101,192,0.35)" : isComplete ? "0 4px 12px rgba(0,137,123,0.25)" : "none",
              }}
            >
              {isComplete ? <CheckCircle style={{ width: "16px", height: "16px" }} /> : s}
            </div>
            {i < 2 && (
              <div
                className="h-0.5 w-14 sm:w-20 transition-all"
                style={{ background: completed.includes(s) ? "#00897B" : "#E0E7EF" }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function ErrorCard({ title, message }: { title: string; message: string }) {
  return (
    <div className="flex min-h-screen flex-col">
      <div
        style={{ background: "linear-gradient(135deg,#0A1929,#1565C0)", padding: "20px 24px" }}
      >
        <h1 className="font-bold text-xl text-white" style={{ fontFamily: "Sora, sans-serif" }}>
          Tiavda Enterprises
        </h1>
        <p className="text-sm" style={{ color: "rgba(255,255,255,0.6)" }}>Project Information Form</p>
      </div>
      <div className="flex flex-1 items-center justify-center p-6" style={{ background: "#F0F4F8" }}>
        <div
          className="w-full max-w-md text-center"
          style={{ background: "#FFFFFF", borderRadius: "20px", padding: "40px", boxShadow: "0 8px 32px rgba(0,0,0,0.1)", border: "1px solid #E0E7EF" }}
        >
          <AlertTriangle className="mx-auto mb-4 h-12 w-12" style={{ color: "#E65100" }} />
          <h2 className="mb-2 font-bold text-xl" style={{ fontFamily: "Sora, sans-serif", color: "#0A1929" }}>{title}</h2>
          <p className="text-sm" style={{ color: "#546E7A" }}>{message}</p>
        </div>
      </div>
    </div>
  );
}

export default function Intake() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
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
  const [submittedEnquiryId, setSubmittedEnquiryId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setIsAdmin(!!data.session);
    });
  }, []);

  useEffect(() => {
    async function validate() {
      if (!tokenStr) { setTokenError("invalid"); setLoading(false); return; }
      const { data, error } = await supabasePublic
        .from("intake_tokens").select("id, status, expires_at, client_id")
        .eq("token", tokenStr).maybeSingle();
      if (error || !data) setTokenError("invalid");
      else if (data.status === "used") setTokenError("used");
      else if (new Date(data.expires_at) < new Date()) setTokenError("expired");
      else if (!data.client_id) {
        console.error("[Intake] Token is missing client_id and cannot create an enquiry", {
          client: PUBLIC_SUPABASE_CLIENT_NAME,
          tokenId: data.id,
          status: data.status,
        });
        setTokenError("invalid");
      }
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
    if (!validateStep(step) || !tokenData || !tokenStr) return;
    setSubmitting(true);
    try {
      const clientDebug = await getPublicClientDebugContext();
      const rpcPayload = {
        p_token: tokenStr,
        p_site_address: form.site_address.trim(),
        p_site_city: form.site_city.trim(),
        p_site_state: form.site_state.trim() || null,
        p_site_pincode: form.site_pincode.trim() || null,
        p_structure_type: form.structure_type,
        p_num_floors: form.num_floors,
        p_basement_floors: form.basement_floors,
        p_num_bores: form.num_bores,
        p_expected_depth_m: form.expected_depth_m ? Number(form.expected_depth_m) : null,
        p_soil_type_hint: form.soil_type_hint || null,
        p_remarks: form.remarks.trim() || null,
      };

      console.log("[Intake] RPC submit_intake_form", {
        ...clientDebug,
        fn: "submit_intake_form",
        data: rpcPayload,
      });

      const { data, error } = await (supabasePublic as typeof supabasePublic & {
        rpc: (
          fn: string,
          args: Record<string, unknown>,
        ) => Promise<{
          data: SubmitIntakeRpcResult | SubmitIntakeRpcResult[] | null;
          error: { message?: string } | null;
        }>;
      }).rpc("submit_intake_form", rpcPayload);

      if (error) throw error;

      const result = Array.isArray(data) ? data[0] : data;

      if (!result) throw new Error("Submission failed. Please try again.");
      if (result.error) throw new Error(result.error);
      if (!result.ref_number) throw new Error("Submission succeeded but no reference number was returned.");

      setRefNumber(result.ref_number);
      if (result.enquiry_id) setSubmittedEnquiryId(result.enquiry_id);

      supabase.rpc("notify_admin_intake", {
        p_enquiry_id: result.enquiry_id ?? "",
        p_ref_number: result.ref_number,
        p_client_name: "Client",
        p_city: form.site_city,
      } as any).catch((err: any) => console.warn("Admin notification failed:", err));

      setSubmitted(true);
    } catch (err: any) {
      toast.error(err.message || "Submission failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return (
    <div className="flex min-h-screen items-center justify-center" style={{ background: "#F0F4F8" }}>
      <Loader2 className="h-8 w-8 animate-spin" style={{ color: "#1565C0" }} />
    </div>
  );
  if (tokenError === "invalid") return <ErrorCard title="Invalid Link" message="This link is invalid. Please contact Tiavda Enterprises at +91 8605811117." />;
  if (tokenError === "used") return <ErrorCard title="Already Submitted" message="This form has already been submitted. Thank you!" />;
  if (tokenError === "expired") return <ErrorCard title="Link Expired" message="This link has expired. Please contact Tiavda Enterprises at +91 8605811117." />;

  // ── Success screen ──
  if (submitted) {
    return (
      <div className="flex min-h-screen flex-col">
        {/* Header band */}
        <div style={{ background: "linear-gradient(135deg,#0A1929,#1565C0)", padding: "20px 24px" }}>
          <h1 className="font-bold text-xl text-white" style={{ fontFamily: "Sora, sans-serif" }}>Tiavda Enterprises</h1>
          <p className="text-sm" style={{ color: "rgba(255,255,255,0.6)" }}>Project Information Form</p>
        </div>
        <div
          className="flex flex-1 items-center justify-center p-6"
          style={{ background: "linear-gradient(135deg,#F0F4F8 0%,#E8EEF5 100%)" }}
        >
          <div
            className="w-full max-w-md text-center"
            style={{ background: "#FFFFFF", borderRadius: "20px", padding: "48px", boxShadow: "0 8px 40px rgba(0,0,0,0.1)", border: "1px solid #E0E7EF" }}
          >
            {/* Success icon */}
            <div className="flex justify-center mb-6">
              <div
                className="flex items-center justify-center rounded-full"
                style={{
                  width: "72px",
                  height: "72px",
                  background: "linear-gradient(135deg,#00897B,#26A69A)",
                  boxShadow: "0 8px 24px rgba(0,137,123,0.35)",
                }}
              >
                <CheckCircle style={{ width: "36px", height: "36px", color: "white" }} />
              </div>
            </div>
            <h2 className="mb-2 font-bold text-2xl" style={{ fontFamily: "Sora, sans-serif", color: "#0A1929" }}>
              Submitted Successfully!
            </h2>
            <p className="mb-1 text-sm" style={{ color: "#546E7A" }}>Your Reference Number:</p>
            <p
              className="text-3xl font-bold gradient-text"
              style={{ fontFamily: "JetBrains Mono, monospace" }}
            >
              {refNumber}
            </p>
            <p className="mt-4 text-sm" style={{ color: "#546E7A" }}>Our team will contact you shortly.</p>
            {isAdmin && (
              <div className="mt-6 flex gap-3 justify-center flex-wrap">
                <button
                  onClick={() => navigate("/dashboard")}
                  className="px-4 py-2.5 rounded-xl text-sm font-semibold transition-all"
                  style={{ background: "linear-gradient(135deg,#0A1929,#1565C0)", color: "white", boxShadow: "0 4px 12px rgba(10,25,41,0.3)" }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.transform = "translateY(-1px)"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.transform = "translateY(0)"; }}
                >
                  Go to Dashboard
                </button>
                {submittedEnquiryId && (
                  <button
                    onClick={() => navigate("/enquiries/" + submittedEnquiryId)}
                    className="px-4 py-2.5 rounded-xl text-sm font-semibold transition-all"
                    style={{ border: "1.5px solid #1565C0", color: "#1565C0", background: "transparent" }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "#EBF2FF"; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                  >
                    View Enquiry
                  </button>
                )}
              </div>
            )}
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
      {/* Admin mode banner */}
      {isAdmin && (
        <div className="bg-white border-b px-6 py-3 flex items-center gap-3" style={{ borderBottomColor: "#E0E7EF" }}>
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 text-sm transition-colors"
            style={{ color: "#546E7A" }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "#0A1929"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "#546E7A"; }}
          >
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
          <span className="text-sm" style={{ color: "#546E7A" }}>Filling form on behalf of client</span>
          <span
            className="ml-auto text-xs px-2 py-1 rounded-full"
            style={{ background: "#FFF3E0", color: "#E65100" }}
          >
            Admin Mode
          </span>
        </div>
      )}

      {/* Header band */}
      <div style={{ background: "linear-gradient(135deg,#0A1929,#1565C0)", padding: "20px 24px" }}>
        <h1 className="font-bold text-xl text-white" style={{ fontFamily: "Sora, sans-serif" }}>
          Tiavda Enterprises
        </h1>
        <p className="text-sm" style={{ color: "rgba(255,255,255,0.6)" }}>Project Information Form</p>
      </div>

      {/* Main content */}
      <div
        className="flex flex-1 justify-center p-4 sm:p-8"
        style={{ background: "linear-gradient(135deg,#F0F4F8 0%,#E8EEF5 100%)" }}
      >
        <div className="w-full" style={{ maxWidth: "680px" }}>
          <ProgressIndicator current={step} completed={completedSteps} />

          {/* Form card */}
          <div
            style={{
              background: "#FFFFFF",
              borderRadius: "20px",
              padding: "32px",
              boxShadow: "0 4px 24px rgba(0,0,0,0.08)",
              border: "1px solid #E0E7EF",
            }}
          >
            <AnimatePresence mode="wait" custom={direction}>
              <motion.div
                key={step}
                custom={direction}
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.25 }}
              >
                {step === 1 && (
                  <div className="space-y-5">
                    <h2 className="font-bold text-xl" style={{ fontFamily: "Sora, sans-serif", color: "#0A1929" }}>
                      Site Details
                    </h2>
                    <div>
                      <label className="mb-1.5 block" style={{ fontSize: "11px", fontWeight: 600, color: "#546E7A", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                        Site Address <span style={{ color: "#C62828" }}>*</span>
                      </label>
                      <Textarea
                        placeholder="Full site address including landmark"
                        value={form.site_address}
                        onChange={(e) => updateForm({ site_address: e.target.value })}
                        rows={3}
                        style={{ borderColor: "#E0E7EF", borderRadius: "10px" }}
                      />
                      {errors.site_address && <p className="mt-1 text-xs" style={{ color: "#C62828" }}>{errors.site_address}</p>}
                    </div>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                      <div>
                        <label className="mb-1.5 block" style={{ fontSize: "11px", fontWeight: 600, color: "#546E7A", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                          City <span style={{ color: "#C62828" }}>*</span>
                        </label>
                        <Input value={form.site_city} onChange={(e) => updateForm({ site_city: e.target.value })} style={{ borderColor: "#E0E7EF", borderRadius: "10px" }} />
                        {errors.site_city && <p className="mt-1 text-xs" style={{ color: "#C62828" }}>{errors.site_city}</p>}
                      </div>
                      <div>
                        <label className="mb-1.5 block" style={{ fontSize: "11px", fontWeight: 600, color: "#546E7A", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                          State
                        </label>
                        <Input value={form.site_state} onChange={(e) => updateForm({ site_state: e.target.value })} style={{ borderColor: "#E0E7EF", borderRadius: "10px" }} />
                      </div>
                      <div>
                        <label className="mb-1.5 block" style={{ fontSize: "11px", fontWeight: 600, color: "#546E7A", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                          Pincode
                        </label>
                        <Input
                          value={form.site_pincode}
                          onChange={(e) => updateForm({ site_pincode: e.target.value.replace(/\D/g, "").slice(0, 6) })}
                          inputMode="numeric"
                          style={{ borderColor: "#E0E7EF", borderRadius: "10px" }}
                        />
                        {errors.site_pincode && <p className="mt-1 text-xs" style={{ color: "#C62828" }}>{errors.site_pincode}</p>}
                      </div>
                    </div>
                  </div>
                )}

                {step === 2 && (
                  <div className="space-y-5">
                    <h2 className="font-bold text-xl" style={{ fontFamily: "Sora, sans-serif", color: "#0A1929" }}>
                      Project Details
                    </h2>
                    <div>
                      <label className="mb-2 block" style={{ fontSize: "11px", fontWeight: 600, color: "#546E7A", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                        Structure Type <span style={{ color: "#C62828" }}>*</span>
                      </label>
                      <div className="grid grid-cols-2 gap-3">
                        {STRUCTURE_TYPES.map(({ value, label, icon: Icon }) => {
                          const isSelected = form.structure_type === value;
                          return (
                            <button
                              key={value}
                              type="button"
                              onClick={() => updateForm({ structure_type: value })}
                              className="flex flex-col items-center gap-2 rounded-2xl p-4 transition-all relative"
                              style={{
                                border: isSelected ? "2px solid #1565C0" : "2px solid #E0E7EF",
                                background: isSelected ? "#EBF2FF" : "#FFFFFF",
                              }}
                              onMouseEnter={(e) => {
                                if (!isSelected) {
                                  (e.currentTarget as HTMLElement).style.borderColor = "#1565C0";
                                  (e.currentTarget as HTMLElement).style.background = "#F0F6FF";
                                }
                              }}
                              onMouseLeave={(e) => {
                                if (!isSelected) {
                                  (e.currentTarget as HTMLElement).style.borderColor = "#E0E7EF";
                                  (e.currentTarget as HTMLElement).style.background = "#FFFFFF";
                                }
                              }}
                            >
                              {isSelected && (
                                <span
                                  className="absolute top-2 right-2 flex items-center justify-center rounded-full w-5 h-5"
                                  style={{ background: "#1565C0" }}
                                >
                                  <CheckCircle style={{ width: "12px", height: "12px", color: "white" }} />
                                </span>
                              )}
                              <Icon
                                className="h-7 w-7"
                                style={{ color: isSelected ? "#1565C0" : "#546E7A" }}
                              />
                              <span
                                className="text-sm font-medium"
                                style={{ color: isSelected ? "#1565C0" : "#0A1929" }}
                              >
                                {label}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                      {errors.structure_type && <p className="mt-1 text-xs" style={{ color: "#C62828" }}>{errors.structure_type}</p>}
                    </div>
                    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                      <div>
                        <label className="mb-2 block" style={{ fontSize: "11px", fontWeight: 600, color: "#546E7A", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                          Number of Bores <span style={{ color: "#C62828" }}>*</span>
                        </label>
                        <Stepper value={form.num_bores} onChange={(v) => updateForm({ num_bores: v })} min={1} max={100} />
                      </div>
                      <div>
                        <label className="mb-1.5 block" style={{ fontSize: "11px", fontWeight: 600, color: "#546E7A", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                          Expected Depth (metres)
                        </label>
                        <Input
                          type="number"
                          min={1}
                          max={500}
                          placeholder="e.g. 15"
                          value={form.expected_depth_m}
                          onChange={(e) => updateForm({ expected_depth_m: e.target.value })}
                          style={{ borderColor: "#E0E7EF", borderRadius: "10px" }}
                        />
                      </div>
                      <div>
                        <label className="mb-2 block" style={{ fontSize: "11px", fontWeight: 600, color: "#546E7A", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                          Floors above ground
                        </label>
                        <Stepper value={form.num_floors} onChange={(v) => updateForm({ num_floors: v })} min={0} max={50} />
                      </div>
                      <div>
                        <label className="mb-2 block" style={{ fontSize: "11px", fontWeight: 600, color: "#546E7A", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                          Basement floors
                        </label>
                        <Stepper value={form.basement_floors} onChange={(v) => updateForm({ basement_floors: v })} min={0} max={10} />
                      </div>
                    </div>
                  </div>
                )}

                {step === 3 && (
                  <div className="space-y-5">
                    <h2 className="font-bold text-xl" style={{ fontFamily: "Sora, sans-serif", color: "#0A1929" }}>
                      Additional Information
                    </h2>
                    <div>
                      <label className="mb-2 block" style={{ fontSize: "11px", fontWeight: 600, color: "#546E7A", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                        Soil Type (optional)
                      </label>
                      <div className="flex gap-2">
                        {(["soil", "rock", "mixed"] as const).map((t) => {
                          const isSelected = form.soil_type_hint === t;
                          return (
                            <button
                              key={t}
                              type="button"
                              onClick={() => updateForm({ soil_type_hint: form.soil_type_hint === t ? "" : t })}
                              className="rounded-xl px-5 py-2 text-sm font-medium capitalize transition-all"
                              style={{
                                border: isSelected ? "none" : "1.5px solid #E0E7EF",
                                background: isSelected ? "linear-gradient(135deg,#0A1929,#1565C0)" : "#FFFFFF",
                                color: isSelected ? "white" : "#0A1929",
                              }}
                              onMouseEnter={(e) => {
                                if (!isSelected) {
                                  (e.currentTarget as HTMLElement).style.borderColor = "#1565C0";
                                  (e.currentTarget as HTMLElement).style.background = "#EBF2FF";
                                }
                              }}
                              onMouseLeave={(e) => {
                                if (!isSelected) {
                                  (e.currentTarget as HTMLElement).style.borderColor = "#E0E7EF";
                                  (e.currentTarget as HTMLElement).style.background = "#FFFFFF";
                                }
                              }}
                            >
                              {t}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <div>
                      <label className="mb-1.5 block" style={{ fontSize: "11px", fontWeight: 600, color: "#546E7A", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                        Remarks
                      </label>
                      <Textarea
                        placeholder="Any additional notes about the site or project"
                        value={form.remarks}
                        onChange={(e) => updateForm({ remarks: e.target.value })}
                        rows={4}
                        style={{ borderColor: "#E0E7EF", borderRadius: "10px" }}
                      />
                    </div>
                    <button
                      onClick={handleSubmit}
                      disabled={submitting}
                      className="w-full py-3 rounded-xl text-sm font-semibold transition-all disabled:opacity-60 flex items-center justify-center gap-2"
                      style={{
                        background: "linear-gradient(135deg,#FF8F00,#FFB300)",
                        color: "white",
                        boxShadow: "0 4px 16px rgba(255,143,0,0.35)",
                      }}
                      onMouseEnter={(e) => { if (!submitting) (e.currentTarget as HTMLElement).style.transform = "translateY(-1px)"; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.transform = "translateY(0)"; }}
                    >
                      {submitting
                        ? <><Loader2 className="h-4 w-4 animate-spin" />Submitting…</>
                        : "Submit Project Information"
                      }
                    </button>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>

            {/* Navigation buttons */}
            <div className="mt-6 flex justify-between">
              {step > 1 ? (
                <button
                  onClick={goBack}
                  className="px-4 py-2 rounded-xl text-sm font-medium transition-all"
                  style={{ border: "1.5px solid #E0E7EF", color: "#546E7A", background: "transparent" }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "#F0F4F8"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                >
                  Back
                </button>
              ) : (
                <div />
              )}
              {step < 3 && (
                <button
                  onClick={goNext}
                  className="ml-auto px-6 py-2.5 rounded-xl text-sm font-semibold transition-all"
                  style={{
                    background: "linear-gradient(135deg,#1565C0,#2979FF)",
                    color: "white",
                    boxShadow: "0 4px 12px rgba(21,101,192,0.3)",
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.transform = "translateY(-1px)"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.transform = "translateY(0)"; }}
                >
                  Next
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
