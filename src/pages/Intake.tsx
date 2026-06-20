import { useState, useEffect, useCallback } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { PUBLIC_SUPABASE_CLIENT_NAME } from "@/integrations/supabase/publicClient";
import { publicApi } from "@/lib/apiClient";
import { getPublicStorageUrl } from "@/lib/storage";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import {
  Home, Building2, Factory, Landmark, HelpCircle, CheckCircle, AlertTriangle,
  Minus, Plus, Loader2, ArrowLeft, Upload, X, FileIcon,
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
  contact_person: string;
  gst_number: string;
  site_address: string;
  site_city: string;
  site_state: string;
  site_pincode: string;
  google_maps_url: string;
  structure_type: string;
  num_bores: number;
  expected_depth_m: string;
  num_floors: number;
  basement_floors: number;
  height_of_basements: string;
  num_podiums: number;
  plot_fenced: string;
  soil_type_hint: string;
  distance_km: string;
  soil_fraction: string;
  site_access_types: string[];
  water_available: string;
  electricity_available: string;
  security_arrangement: string;
  permissions_obtained: string;
  water_quantity: string;
  safety_required: boolean;
  safety_requirements: string;
  architect_name: string;
  architect_phone: string;
  architect_address: string;
  rcc_consultant_name: string;
  rcc_consultant_phone: string;
  rcc_consultant_address: string;
  remarks: string;
  demobilization_consent: boolean;
  site_access: string;
};

type SubmitIntakeRpcResult = {
  ref_number?: string | null;
  enquiry_id?: string | null;
  submission_id?: string | null;
  error?: string | null;
};

const STRUCTURE_TYPES = [
  { value: "residential", label: "Residential", icon: Home },
  { value: "commercial", label: "Commercial", icon: Building2 },
  { value: "industrial", label: "Industrial", icon: Factory },
  { value: "infrastructure", label: "Infrastructure", icon: Landmark },
  { value: "other", label: "Other", icon: HelpCircle },
] as const;

const initialForm: FormData = {
  contact_person: "", gst_number: "",
  site_address: "", site_city: "", site_state: "", site_pincode: "", google_maps_url: "",
  structure_type: "", num_bores: 1, expected_depth_m: "",
  num_floors: 0, basement_floors: 0, height_of_basements: "", num_podiums: 0, plot_fenced: "",
  soil_type_hint: "",
  distance_km: "", soil_fraction: "0.7",
  site_access: "", site_access_types: [], water_available: "", electricity_available: "",
  security_arrangement: "", permissions_obtained: "", water_quantity: "",
  safety_required: false, safety_requirements: "",
  architect_name: "", architect_phone: "", architect_address: "",
  rcc_consultant_name: "", rcc_consultant_phone: "", rcc_consultant_address: "",
  remarks: "", demobilization_consent: false,
};

const SITE_ACCESS_OPTIONS = [
  "Main road access", "Internal road only", "Narrow lane",
  "Unpaved/kutcha road", "Requires crane entry", "Restricted hours",
];

const WATER_QUANTITY_OPTIONS = [
  { value: "sufficient", label: "Sufficient (500+ liters/day)" },
  { value: "limited", label: "Limited (needs tanker backup)" },
  { value: "none", label: "No water available on site" },
];

const SOIL_FRACTION_OPTIONS = [
  { value: "1.0", label: "100% Soil / 0% Rock" },
  { value: "0.7", label: "70% Soil / 30% Rock" },
  { value: "0.5", label: "50% Soil / 50% Rock" },
  { value: "0.3", label: "30% Soil / 70% Rock" },
  { value: "0.0", label: "0% Soil / 100% Rock" },
];

const MAPS_URL_PATTERN = /^https?:\/\/(www\.)?(google\.(com|co\.\w+)\/maps|goo\.gl\/maps|maps\.app\.goo\.gl|maps\.google\.com)/;

function isValidMapsUrl(url: string): boolean {
  return MAPS_URL_PATTERN.test(url.trim());
}

function extractCoordsFromMapsUrl(url: string): { lat: number; lng: number } | null {
  // Pattern 1: @lat,lng,zoom in URL
  const atMatch = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (atMatch) {
    return { lat: parseFloat(atMatch[1]), lng: parseFloat(atMatch[2]) };
  }
  // Pattern 2: ?q=lat,lng or place/lat,lng
  const qMatch = url.match(/[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (qMatch) {
    return { lat: parseFloat(qMatch[1]), lng: parseFloat(qMatch[2]) };
  }
  // Pattern 3: /place/.../@lat,lng
  const placeMatch = url.match(/\/place\/[^/]+\/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (placeMatch) {
    return { lat: parseFloat(placeMatch[1]), lng: parseFloat(placeMatch[2]) };
  }
  return null;
}

function getPublicClientDebugContext() {
  return { client: PUBLIC_SUPABASE_CLIENT_NAME };
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
      {[1, 2, 3, 4].map((s, i) => {
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
            {i < 3 && (
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
          Site Investigation
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
  const [files, setFiles] = useState<File[]>([]);
  const [layoutFiles, setLayoutFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setIsAdmin(!!data.session);
    });
  }, []);

  useEffect(() => {
    async function validate() {
      if (!tokenStr) { setTokenError("invalid"); setLoading(false); return; }
      let data: { id: string; status: string; expires_at: string; client_id: string | null } | null = null;
      try {
        data = await publicApi.get("/public/intake/validate", { token: tokenStr });
      } catch {
        data = null;
      }
      if (!data) setTokenError("invalid");
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
      if (!form.contact_person.trim()) errs.contact_person = "Contact person is required";
      // GST is optional (residential / individual clients often have no GSTIN);
      // validate the format only when provided.
      if (form.gst_number.trim() && !/^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d][Z][A-Z\d]$/.test(form.gst_number.trim())) {
        errs.gst_number = "Invalid GST format (e.g. 22AAAAA0000A1Z5)";
      }
      if (!form.site_address.trim()) errs.site_address = "Site address is required";
      if (!form.google_maps_url.trim()) {
        errs.google_maps_url = "Site location (Google Maps link) is required";
      } else if (!isValidMapsUrl(form.google_maps_url)) {
        errs.google_maps_url = "Please enter a valid Google Maps link";
      }
      if (!form.site_city.trim()) errs.site_city = "City is required";
      if (form.site_pincode && !/^\d*$/.test(form.site_pincode)) errs.site_pincode = "Pincode must be numeric";
    }
    if (s === 2) {
      if (!form.structure_type) errs.structure_type = "Please select a structure type";
      if (form.num_bores < 1) errs.num_bores = "At least 1 bore required";
    }
    if (s === 4) {
      // Site photographs are required (anyone can photograph the plot); the
      // layout plan / drawing is optional (many residential clients lack one).
      if (files.length < 1) errs.files = "At least one site photograph is required";
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const goNext = () => { if (!validateStep(step)) return; setDirection(1); setStep((s) => Math.min(4, s + 1)); };
  const goBack = () => { setDirection(-1); setStep((s) => Math.max(1, s - 1)); };

  const handleSubmit = async () => {
    if (!validateStep(step) || !tokenData || !tokenStr) return;
    setSubmitting(true);
    try {
      const clientDebug = getPublicClientDebugContext();
      const extendedData: Record<string, any> = {};
      if (form.distance_km) extendedData.distance_km = Number(form.distance_km);
      if (form.soil_fraction) extendedData.soil_fraction = parseFloat(form.soil_fraction);
      if (form.site_access) extendedData.site_access = form.site_access;
      if (form.water_available) extendedData.water_available = form.water_available === "yes";
      if (form.electricity_available) extendedData.electricity_available = form.electricity_available === "yes";
      if (form.security_arrangement) extendedData.security_arrangement = form.security_arrangement === "yes";
      if (form.permissions_obtained) extendedData.permissions_obtained = form.permissions_obtained === "yes";
      if (form.contact_person.trim()) extendedData.contact_person = form.contact_person.trim();
      if (form.gst_number.trim()) extendedData.gst_number = form.gst_number.trim();
      extendedData.safety_required = form.safety_required;
      if (form.safety_required && form.safety_requirements.trim()) extendedData.safety_requirements = form.safety_requirements.trim();
      if (form.architect_name.trim()) extendedData.architect_name = form.architect_name.trim();
      if (form.architect_phone.trim()) extendedData.architect_phone = form.architect_phone.trim();
      if (form.architect_address.trim()) extendedData.architect_address = form.architect_address.trim();
      if (form.rcc_consultant_name.trim()) extendedData.rcc_consultant_name = form.rcc_consultant_name.trim();
      if (form.rcc_consultant_phone.trim()) extendedData.rcc_consultant_phone = form.rcc_consultant_phone.trim();
      if (form.rcc_consultant_address.trim()) extendedData.rcc_consultant_address = form.rcc_consultant_address.trim();
      if (form.google_maps_url.trim()) {
        extendedData.google_maps_url = form.google_maps_url.trim();
        const coords = extractCoordsFromMapsUrl(form.google_maps_url);
        if (coords) {
          extendedData.latitude = coords.lat;
          extendedData.longitude = coords.lng;
        }
      }
      if (form.height_of_basements) extendedData.height_of_basements = Number(form.height_of_basements);
      if (form.num_podiums) extendedData.num_podiums = form.num_podiums;
      if (form.plot_fenced) extendedData.plot_fenced = form.plot_fenced;
      if (form.site_access_types.length > 0) extendedData.site_access_types = form.site_access_types;
      if (form.water_quantity) extendedData.water_quantity = form.water_quantity;
      extendedData.demobilization_consent = form.demobilization_consent;

      let remarksPayload = form.remarks.trim();
      if (Object.keys(extendedData).length > 0) {
        remarksPayload = (remarksPayload ? remarksPayload + "\n" : "") +
          "---EXTENDED_DATA---\n" + JSON.stringify(extendedData);
      }

      const submitPayload = {
        token: tokenStr,
        site_address: form.site_address.trim(),
        site_city: form.site_city.trim(),
        site_state: form.site_state.trim() || null,
        site_pincode: form.site_pincode.trim() || null,
        structure_type: form.structure_type,
        num_floors: form.num_floors,
        basement_floors: form.basement_floors,
        num_bores: form.num_bores,
        expected_depth_m: form.expected_depth_m ? Number(form.expected_depth_m) : null,
        soil_type_hint: form.soil_type_hint || null,
        remarks: remarksPayload || null,
        // H8: send the structured data so the API/RPC can populate typed columns
        // (the blob in remarks is kept for back-compat with older consumers).
        extended: extendedData,
        client_name: form.contact_person || undefined,
      };

      console.log("[Intake] POST /public/intake/submit", {
        ...clientDebug,
        data: submitPayload,
      });

      const result = await publicApi.post<SubmitIntakeRpcResult>("/public/intake/submit", submitPayload);

      if (!result) throw new Error("Submission failed. Please try again.");
      if (result.error) throw new Error(result.error);
      if (!result.ref_number) throw new Error("Submission succeeded but no reference number was returned.");

      setRefNumber(result.ref_number);
      if (result.enquiry_id) setSubmittedEnquiryId(result.enquiry_id);

      // Upload attachments to the public intake-uploads bucket, then attach the
      // metadata to the submission via a scoped RPC (anon-safe; no direct table write).
      const allUploadFiles = [...files, ...layoutFiles];
      if (allUploadFiles.length > 0 && result.ref_number && result.submission_id) {
        try {
          const sitePhotos: { name: string; url: string; size: number }[] = [];
          const layoutPlans: { name: string; url: string; size: number }[] = [];

          const uploadOne = async (file: File, kind: "photos" | "layouts") => {
            const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
            const path = `intake/${result.ref_number}/${kind}/${Date.now()}_${safeName}`;
            try {
              const { signedUrl } = await publicApi.post<{ signedUrl: string }>("/public/intake/sign-upload", { token: tokenStr, path });
              const up = await fetch(signedUrl, { method: "PUT", headers: { "Content-Type": file.type || "application/octet-stream" }, body: file });
              if (!up.ok) return null;
              return { name: file.name, url: getPublicStorageUrl("intake-uploads", path), size: file.size };
            } catch {
              return null;
            }
          };

          for (const file of files) {
            const r = await uploadOne(file, "photos");
            if (r) sitePhotos.push(r);
          }
          for (const file of layoutFiles) {
            const r = await uploadOne(file, "layouts");
            if (r) layoutPlans.push(r);
          }

          if (sitePhotos.length > 0 || layoutPlans.length > 0) {
            await publicApi.post("/public/intake/attach-files", {
              submission_id: result.submission_id,
              attachments: { sitePhotos, layoutPlans },
            });
          }
        } catch (attachErr) {
          console.warn("Attachment upload failed:", attachErr);
        }
      }

      // Admin notifications (in-app + email + WhatsApp) are sent server-side by
      // POST /public/intake/submit — no client-side notify needed here.

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
  if (tokenError === "invalid") return <ErrorCard title="Invalid Link" message="This link is invalid. Please contact us at +91 8605811117." />;
  if (tokenError === "used") return <ErrorCard title="Already Submitted" message="This form has already been submitted. Thank you!" />;
  if (tokenError === "expired") return <ErrorCard title="Link Expired" message="This link has expired. Please contact us at +91 8605811117." />;

  // ── Success screen ──
  if (submitted) {
    return (
      <div className="flex min-h-screen flex-col">
        {/* Header band */}
        <div style={{ background: "linear-gradient(135deg,#0A1929,#1565C0)", padding: "20px 24px" }}>
          <h1 className="font-bold text-xl text-white" style={{ fontFamily: "Sora, sans-serif" }}>Site Investigation</h1>
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
            className="ml-auto text-[13px] px-2 py-1 rounded-full"
            style={{ background: "#FFF3E0", color: "#E65100" }}
          >
            Admin Mode
          </span>
        </div>
      )}

      {/* Header band */}
      <div style={{ background: "linear-gradient(135deg,#0A1929,#1565C0)", padding: "20px 24px" }}>
        <h1 className="font-bold text-xl text-white" style={{ fontFamily: "Sora, sans-serif" }}>
          Site Investigation
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
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div>
                        <label className="mb-1.5 block" style={{ fontSize: "12px", fontWeight: 600, color: "#546E7A", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                          Contact Person <span style={{ color: "#C62828" }}>*</span>
                        </label>
                        <Input
                          value={form.contact_person}
                          onChange={(e) => updateForm({ contact_person: e.target.value })}
                          placeholder="Site contact person name"
                          style={{ borderColor: errors.contact_person ? "#C62828" : "#E0E7EF", borderRadius: "10px" }}
                        />
                        {errors.contact_person && <p className="mt-1 text-[13px]" style={{ color: "#C62828" }}>{errors.contact_person}</p>}
                      </div>
                      <div>
                        <label className="mb-1.5 block" style={{ fontSize: "12px", fontWeight: 600, color: "#546E7A", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                          GST Number
                        </label>
                        <Input
                          value={form.gst_number}
                          onChange={(e) => updateForm({ gst_number: e.target.value.toUpperCase() })}
                          placeholder="22AAAAA0000A1Z5"
                          maxLength={15}
                          style={{ borderColor: errors.gst_number ? "#C62828" : "#E0E7EF", borderRadius: "10px" }}
                        />
                        {errors.gst_number && <p className="mt-1 text-[13px]" style={{ color: "#C62828" }}>{errors.gst_number}</p>}
                      </div>
                    </div>
                    <div>
                      <label className="mb-1.5 block" style={{ fontSize: "12px", fontWeight: 600, color: "#546E7A", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                        Site Address <span style={{ color: "#C62828" }}>*</span>
                      </label>
                      <Textarea
                        placeholder="Full site address including landmark"
                        value={form.site_address}
                        onChange={(e) => updateForm({ site_address: e.target.value })}
                        rows={3}
                        style={{ borderColor: "#E0E7EF", borderRadius: "10px" }}
                      />
                      {errors.site_address && <p className="mt-1 text-[13px]" style={{ color: "#C62828" }}>{errors.site_address}</p>}
                    </div>
                    <div>
                      <label className="mb-1.5 block" style={{ fontSize: "12px", fontWeight: 600, color: "#546E7A", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                        Google Maps Link <span style={{ color: "#C62828" }}>*</span>
                      </label>
                      <Input
                        value={form.google_maps_url}
                        onChange={(e) => updateForm({ google_maps_url: e.target.value })}
                        placeholder="Paste Google Maps URL of the site location"
                        style={{
                          borderColor: errors.google_maps_url ? "#C62828" : (form.google_maps_url.trim() && !isValidMapsUrl(form.google_maps_url) ? "#92400E" : "#E0E7EF"),
                          borderRadius: "10px",
                        }}
                      />
                      {errors.google_maps_url && <p className="mt-1 text-[13px]" style={{ color: "#C62828" }}>{errors.google_maps_url}</p>}
                      {form.google_maps_url.trim() && !isValidMapsUrl(form.google_maps_url) && (
                        <p className="mt-1 text-[12px]" style={{ color: "#92400E" }}>
                          Please enter a valid Google Maps URL (google.com/maps, goo.gl/maps, or maps.app.goo.gl)
                        </p>
                      )}
                      {form.google_maps_url.trim() && isValidMapsUrl(form.google_maps_url) && (() => {
                        const coords = extractCoordsFromMapsUrl(form.google_maps_url);
                        return coords ? (
                          <p className="mt-1 text-[12px] font-medium" style={{ color: "#15673A" }}>
                            Coordinates detected: {coords.lat.toFixed(6)}, {coords.lng.toFixed(6)}
                          </p>
                        ) : (
                          <p className="mt-1 text-[12px]" style={{ color: "#546E7A" }}>
                            Valid Maps link — coordinates will be resolved from the URL
                          </p>
                        );
                      })()}
                      {!form.google_maps_url.trim() && (
                        <p className="mt-1 text-[12px]" style={{ color: "#546E7A" }}>
                          Share the exact pin location from Google Maps for accurate site identification
                        </p>
                      )}
                    </div>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                      <div>
                        <label className="mb-1.5 block" style={{ fontSize: "12px", fontWeight: 600, color: "#546E7A", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                          City <span style={{ color: "#C62828" }}>*</span>
                        </label>
                        <Input value={form.site_city} onChange={(e) => updateForm({ site_city: e.target.value })} style={{ borderColor: "#E0E7EF", borderRadius: "10px" }} />
                        {errors.site_city && <p className="mt-1 text-[13px]" style={{ color: "#C62828" }}>{errors.site_city}</p>}
                      </div>
                      <div>
                        <label className="mb-1.5 block" style={{ fontSize: "12px", fontWeight: 600, color: "#546E7A", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                          State
                        </label>
                        <Input value={form.site_state} onChange={(e) => updateForm({ site_state: e.target.value })} style={{ borderColor: "#E0E7EF", borderRadius: "10px" }} />
                      </div>
                      <div>
                        <label className="mb-1.5 block" style={{ fontSize: "12px", fontWeight: 600, color: "#546E7A", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                          Pincode
                        </label>
                        <Input
                          value={form.site_pincode}
                          onChange={(e) => updateForm({ site_pincode: e.target.value.replace(/\D/g, "").slice(0, 6) })}
                          inputMode="numeric"
                          style={{ borderColor: "#E0E7EF", borderRadius: "10px" }}
                        />
                        {errors.site_pincode && <p className="mt-1 text-[13px]" style={{ color: "#C62828" }}>{errors.site_pincode}</p>}
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
                      <label className="mb-2 block" style={{ fontSize: "12px", fontWeight: 600, color: "#546E7A", textTransform: "uppercase", letterSpacing: "0.05em" }}>
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
                      {errors.structure_type && <p className="mt-1 text-[13px]" style={{ color: "#C62828" }}>{errors.structure_type}</p>}
                    </div>
                    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                      <div>
                        <label className="mb-2 block" style={{ fontSize: "12px", fontWeight: 600, color: "#546E7A", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                          Number of Bores <span style={{ color: "#C62828" }}>*</span>
                        </label>
                        <Stepper value={form.num_bores} onChange={(v) => updateForm({ num_bores: v })} min={1} max={100} />
                      </div>
                      <div>
                        <label className="mb-1.5 block" style={{ fontSize: "12px", fontWeight: 600, color: "#546E7A", textTransform: "uppercase", letterSpacing: "0.05em" }}>
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
                        <label className="mb-2 block" style={{ fontSize: "12px", fontWeight: 600, color: "#546E7A", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                          Floors above ground
                        </label>
                        <Stepper value={form.num_floors} onChange={(v) => updateForm({ num_floors: v })} min={0} max={50} />
                      </div>
                      <div>
                        <label className="mb-2 block" style={{ fontSize: "12px", fontWeight: 600, color: "#546E7A", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                          Basement floors
                        </label>
                        <Stepper value={form.basement_floors} onChange={(v) => updateForm({ basement_floors: v })} min={0} max={10} />
                      </div>
                      <div>
                        <label className="mb-1.5 block" style={{ fontSize: "12px", fontWeight: 600, color: "#546E7A", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                          Height of Basements (m)
                        </label>
                        <Input
                          type="number"
                          min={0}
                          placeholder="e.g. 3.5"
                          value={form.height_of_basements}
                          onChange={(e) => updateForm({ height_of_basements: e.target.value })}
                          style={{ borderColor: "#E0E7EF", borderRadius: "10px" }}
                        />
                      </div>
                      <div>
                        <label className="mb-2 block" style={{ fontSize: "12px", fontWeight: 600, color: "#546E7A", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                          Number of Podiums
                        </label>
                        <Stepper value={form.num_podiums} onChange={(v) => updateForm({ num_podiums: v })} min={0} max={10} />
                      </div>
                      <div>
                        <label className="mb-2 block" style={{ fontSize: "12px", fontWeight: 600, color: "#546E7A", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                          Is the plot fenced?
                        </label>
                        <div className="flex gap-2">
                          {["yes", "no", "partial"].map((opt) => (
                            <button
                              key={opt}
                              type="button"
                              onClick={() => updateForm({ plot_fenced: opt })}
                              className="px-4 py-2 rounded-lg text-[13px] font-semibold capitalize transition-all"
                              style={{
                                background: form.plot_fenced === opt ? "#DBEAFE" : "#F0F4F8",
                                color: form.plot_fenced === opt ? "#1565C0" : "#546E7A",
                                border: form.plot_fenced === opt ? "1.5px solid #93C5FD" : "1.5px solid #E0E7EF",
                              }}
                            >
                              {opt}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <label className="mb-1.5 block" style={{ fontSize: "12px", fontWeight: 600, color: "#546E7A", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                          Distance from Pune (km)
                        </label>
                        <Input
                          type="number"
                          min={0}
                          max={2000}
                          placeholder="e.g. 50"
                          value={form.distance_km}
                          onChange={(e) => updateForm({ distance_km: e.target.value })}
                          style={{ borderColor: "#E0E7EF", borderRadius: "10px" }}
                        />
                      </div>
                      <div>
                        <label className="mb-1.5 block" style={{ fontSize: "12px", fontWeight: 600, color: "#546E7A", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                          Soil / Rock Ratio
                        </label>
                        <select
                          value={form.soil_fraction}
                          onChange={(e) => updateForm({ soil_fraction: e.target.value })}
                          className="w-full rounded-[10px] text-sm"
                          style={{ border: "1.5px solid #E0E7EF", padding: "8px 12px", background: "#FAFBFC", color: "#0A1929" }}
                        >
                          {SOIL_FRACTION_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                )}

                {step === 3 && (
                  <div className="space-y-5">
                    <h2 className="font-bold text-xl" style={{ fontFamily: "Sora, sans-serif", color: "#0A1929" }}>
                      Site Conditions
                    </h2>
                    <div>
                      <label className="mb-2 block" style={{ fontSize: "12px", fontWeight: 600, color: "#546E7A", textTransform: "uppercase", letterSpacing: "0.05em" }}>
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
                      <label className="mb-2 block" style={{ fontSize: "12px", fontWeight: 600, color: "#546E7A", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                        Site Access (select all that apply)
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {SITE_ACCESS_OPTIONS.map((opt) => {
                          const isSelected = form.site_access_types.includes(opt);
                          return (
                            <button
                              key={opt}
                              type="button"
                              onClick={() => {
                                const updated = isSelected
                                  ? form.site_access_types.filter((a) => a !== opt)
                                  : [...form.site_access_types, opt];
                                updateForm({ site_access_types: updated });
                              }}
                              className="px-3 py-1.5 rounded-lg text-[13px] font-medium transition-all"
                              style={{
                                background: isSelected ? "#DBEAFE" : "#F0F4F8",
                                color: isSelected ? "#1565C0" : "#546E7A",
                                border: isSelected ? "1.5px solid #93C5FD" : "1.5px solid #E0E7EF",
                              }}
                            >
                              {opt}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      {([
                        ["water_available", "Water Available"],
                        ["electricity_available", "Electricity Available"],
                        ["security_arrangement", "Security Arrangement"],
                        ["permissions_obtained", "Permissions Obtained"],
                      ] as const).map(([key, label]) => (
                        <div key={key}>
                          <label className="mb-1.5 block" style={{ fontSize: "12px", fontWeight: 600, color: "#546E7A", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                            {label}
                          </label>
                          <div className="flex gap-2">
                            {["yes", "no"].map((v) => {
                              const isSelected = form[key] === v;
                              return (
                                <button
                                  key={v}
                                  type="button"
                                  onClick={() => updateForm({ [key]: form[key] === v ? "" : v })}
                                  className="flex-1 rounded-xl py-2 text-sm font-medium capitalize transition-all"
                                  style={{
                                    border: isSelected ? "none" : "1.5px solid #E0E7EF",
                                    background: isSelected
                                      ? v === "yes" ? "linear-gradient(135deg,#00897B,#26A69A)" : "linear-gradient(135deg,#C62828,#E53935)"
                                      : "#FFFFFF",
                                    color: isSelected ? "white" : "#0A1929",
                                  }}
                                >
                                  {v}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                    <div>
                      <label className="mb-1.5 block" style={{ fontSize: "12px", fontWeight: 600, color: "#546E7A", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                        Water Quantity on Site
                      </label>
                      <select
                        value={form.water_quantity}
                        onChange={(e) => updateForm({ water_quantity: e.target.value })}
                        className="w-full rounded-[10px] text-sm"
                        style={{ border: "1.5px solid #E0E7EF", padding: "8px 12px", background: "#FAFBFC", color: "#0A1929" }}
                      >
                        <option value="">Select...</option>
                        {WATER_QUANTITY_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1.5 block" style={{ fontSize: "12px", fontWeight: 600, color: "#546E7A", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                        Are there specific safety requirements?
                      </label>
                      <div className="flex gap-2">
                        {[
                          { value: true, label: "Yes" },
                          { value: false, label: "No" },
                        ].map((opt) => (
                          <button
                            key={String(opt.value)}
                            type="button"
                            onClick={() => updateForm({ safety_required: opt.value, ...(opt.value ? {} : { safety_requirements: "" }) })}
                            className="px-4 py-2 rounded-lg text-[13px] font-semibold transition-all"
                            style={{
                              background: form.safety_required === opt.value ? "#DBEAFE" : "#F0F4F8",
                              color: form.safety_required === opt.value ? "#1565C0" : "#546E7A",
                              border: form.safety_required === opt.value ? "1.5px solid #93C5FD" : "1.5px solid #E0E7EF",
                            }}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    {form.safety_required && (
                      <div>
                        <label className="mb-1.5 block" style={{ fontSize: "12px", fontWeight: 600, color: "#546E7A", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                          Safety Requirements Details
                        </label>
                        <Textarea
                          placeholder="Describe specific safety requirements or hazards"
                          value={form.safety_requirements}
                          onChange={(e) => updateForm({ safety_requirements: e.target.value })}
                          rows={2}
                          style={{ borderColor: "#E0E7EF", borderRadius: "10px" }}
                        />
                      </div>
                    )}
                  </div>
                )}

                {step === 4 && (
                  <div className="space-y-5">
                    <h2 className="font-bold text-xl" style={{ fontFamily: "Sora, sans-serif", color: "#0A1929" }}>
                      Contacts & Notes
                    </h2>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div>
                        <label className="mb-1.5 block" style={{ fontSize: "12px", fontWeight: 600, color: "#546E7A", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                          Architect Name
                        </label>
                        <Input value={form.architect_name} onChange={(e) => updateForm({ architect_name: e.target.value })} placeholder="Optional" style={{ borderColor: "#E0E7EF", borderRadius: "10px" }} />
                      </div>
                      <div>
                        <label className="mb-1.5 block" style={{ fontSize: "12px", fontWeight: 600, color: "#546E7A", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                          Architect Phone
                        </label>
                        <Input value={form.architect_phone} onChange={(e) => updateForm({ architect_phone: e.target.value })} placeholder="+91..." style={{ borderColor: "#E0E7EF", borderRadius: "10px" }} />
                      </div>
                    </div>
                    {(form.architect_name || form.architect_phone) && (
                      <div>
                        <label className="mb-1.5 block" style={{ fontSize: "12px", fontWeight: 600, color: "#546E7A", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                          Architect Address
                        </label>
                        <Textarea
                          value={form.architect_address}
                          onChange={(e) => updateForm({ architect_address: e.target.value })}
                          placeholder="Office address of the architect"
                          rows={2}
                          style={{ borderColor: "#E0E7EF", borderRadius: "10px" }}
                        />
                      </div>
                    )}
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div>
                        <label className="mb-1.5 block" style={{ fontSize: "12px", fontWeight: 600, color: "#546E7A", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                          RCC Consultant Name
                        </label>
                        <Input value={form.rcc_consultant_name} onChange={(e) => updateForm({ rcc_consultant_name: e.target.value })} placeholder="Optional" style={{ borderColor: "#E0E7EF", borderRadius: "10px" }} />
                      </div>
                      <div>
                        <label className="mb-1.5 block" style={{ fontSize: "12px", fontWeight: 600, color: "#546E7A", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                          RCC Consultant Phone
                        </label>
                        <Input value={form.rcc_consultant_phone} onChange={(e) => updateForm({ rcc_consultant_phone: e.target.value })} placeholder="+91..." style={{ borderColor: "#E0E7EF", borderRadius: "10px" }} />
                      </div>
                    </div>
                    {(form.rcc_consultant_name || form.rcc_consultant_phone) && (
                      <div>
                        <label className="mb-1.5 block" style={{ fontSize: "12px", fontWeight: 600, color: "#546E7A", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                          RCC Consultant Address
                        </label>
                        <Textarea
                          value={form.rcc_consultant_address}
                          onChange={(e) => updateForm({ rcc_consultant_address: e.target.value })}
                          placeholder="Office address of the RCC consultant"
                          rows={2}
                          style={{ borderColor: "#E0E7EF", borderRadius: "10px" }}
                        />
                      </div>
                    )}
                    {/* File Attachments */}
                    <div>
                      <label className="mb-2 block" style={{ fontSize: "12px", fontWeight: 600, color: "#546E7A", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                        Site Photographs <span style={{ color: "#C62828" }}>*</span>
                      </label>
                      {errors.files && <p className="mb-1.5 text-[13px]" style={{ color: "#C62828" }}>{errors.files}</p>}
                      <label
                        className="flex flex-col items-center gap-2 rounded-xl p-4 cursor-pointer transition-all"
                        style={{ border: "2px dashed #E0E7EF", background: "#FAFBFC" }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "#1565C0"; (e.currentTarget as HTMLElement).style.background = "#F0F6FF"; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "#E0E7EF"; (e.currentTarget as HTMLElement).style.background = "#FAFBFC"; }}
                      >
                        <Upload style={{ width: "20px", height: "20px", color: "#546E7A" }} />
                        <span className="text-[13px]" style={{ color: "#546E7A" }}>Upload site photos (JPG, PNG, HEIC — max 5 files, 10MB each)</span>
                        <input
                          type="file"
                          multiple
                          accept="image/jpeg,image/png,image/heic,image/heif,image/webp"
                          className="hidden"
                          onChange={(e) => {
                            const newFiles = Array.from(e.target.files ?? []);
                            const valid = newFiles.filter((f) => f.size <= 10 * 1024 * 1024);
                            if (valid.length < newFiles.length) toast.error("Some files exceed 10MB and were skipped.");
                            setFiles((prev) => [...prev, ...valid].slice(0, 5));
                            e.target.value = "";
                          }}
                        />
                      </label>
                      {files.length > 0 && (
                        <div className="mt-2 space-y-1.5">
                          {files.map((f, i) => (
                            <div key={i} className="flex items-center gap-3 rounded-lg px-3 py-2" style={{ background: "#F0F4F8", border: "1px solid #E0E7EF" }}>
                              <FileIcon style={{ width: "14px", height: "14px", color: "#546E7A", flexShrink: 0 }} />
                              <span className="text-[13px] flex-1 truncate" style={{ color: "#0A1929" }}>{f.name}</span>
                              <span className="text-[12px]" style={{ color: "#546E7A" }}>{(f.size / 1024).toFixed(0)}KB</span>
                              <button type="button" onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))} style={{ color: "#94A3B8" }}>
                                <X style={{ width: "12px", height: "12px" }} />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <div>
                      <label className="mb-2 block" style={{ fontSize: "12px", fontWeight: 600, color: "#546E7A", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                        Layout Plan / Drawing
                      </label>
                      <label
                        className="flex flex-col items-center gap-2 rounded-xl p-4 cursor-pointer transition-all"
                        style={{ border: "2px dashed #E0E7EF", background: "#FAFBFC" }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "#15673A"; (e.currentTarget as HTMLElement).style.background = "#F0FFF4"; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "#E0E7EF"; (e.currentTarget as HTMLElement).style.background = "#FAFBFC"; }}
                      >
                        <Upload style={{ width: "20px", height: "20px", color: "#546E7A" }} />
                        <span className="text-[13px]" style={{ color: "#546E7A" }}>Upload layout plans (PDF, JPG, PNG — max 3 files, 10MB each)</span>
                        <input
                          type="file"
                          multiple
                          accept="image/jpeg,image/png,.pdf"
                          className="hidden"
                          onChange={(e) => {
                            const newFiles = Array.from(e.target.files ?? []);
                            const valid = newFiles.filter((f) => f.size <= 10 * 1024 * 1024);
                            if (valid.length < newFiles.length) toast.error("Some files exceed 10MB and were skipped.");
                            setLayoutFiles((prev) => [...prev, ...valid].slice(0, 3));
                            e.target.value = "";
                          }}
                        />
                      </label>
                      {layoutFiles.length > 0 && (
                        <div className="mt-2 space-y-1.5">
                          {layoutFiles.map((f, i) => (
                            <div key={i} className="flex items-center gap-3 rounded-lg px-3 py-2" style={{ background: "#F0F4F8", border: "1px solid #E0E7EF" }}>
                              <FileIcon style={{ width: "14px", height: "14px", color: "#15673A", flexShrink: 0 }} />
                              <span className="text-[13px] flex-1 truncate" style={{ color: "#0A1929" }}>{f.name}</span>
                              <span className="text-[12px]" style={{ color: "#546E7A" }}>{(f.size / 1024).toFixed(0)}KB</span>
                              <button type="button" onClick={() => setLayoutFiles((prev) => prev.filter((_, j) => j !== i))} style={{ color: "#94A3B8" }}>
                                <X style={{ width: "12px", height: "12px" }} />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div>
                      <label className="mb-1.5 block" style={{ fontSize: "12px", fontWeight: 600, color: "#546E7A", textTransform: "uppercase", letterSpacing: "0.05em" }}>
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
                    <div
                      className="rounded-xl p-4"
                      style={{
                        background: form.demobilization_consent ? "#DCFCE7" : "#FEF2F2",
                        border: form.demobilization_consent ? "1.5px solid #86EFAC" : "1.5px solid #FECACA",
                      }}
                    >
                      <label className="flex items-start gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={form.demobilization_consent}
                          onChange={(e) => updateForm({ demobilization_consent: e.target.checked })}
                          className="mt-0.5 h-4 w-4 rounded"
                          style={{ accentColor: "#15673A" }}
                        />
                        <div>
                          <p className="text-sm font-semibold" style={{ color: "#0A1929" }}>
                            Demobilization Charges Consent <span style={{ color: "#C62828" }}>*</span>
                          </p>
                          <p className="text-[13px] mt-1" style={{ color: "#546E7A" }}>
                            I confirm that the site information provided above is accurate and the site will be ready for work on the agreed mobilization date. I understand and agree that if our team is mobilized to site and work cannot commence due to incorrect information, site not being ready, missing permissions, or access/water/security not being arranged as stated, then the resulting <strong>demobilization and re-mobilization costs will be charged to me/us</strong>. I also consent to the standard demobilization process (site restoration, clearing of temporary structures, boreholes, and equipment staging areas) upon completion of field work.
                          </p>
                        </div>
                      </label>
                    </div>
                    <button
                      onClick={handleSubmit}
                      disabled={submitting || !form.demobilization_consent}
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
              {step < 4 && (
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
