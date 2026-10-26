import { useState, useEffect, useCallback } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { PUBLIC_SUPABASE_CLIENT_NAME } from "@/integrations/supabase/publicClient";
import { publicApi } from "@/lib/apiClient";
import { getPublicStorageUrl } from "@/lib/storage";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { CheckCircle, AlertTriangle, Loader2, ArrowLeft, Upload, X, FileIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type TokenData = {
  id: string;
  status: string | null;
  expires_at: string;
  client_id: string | null;
};

type YesNo = "" | "yes" | "no";

type FormData = {
  client_name: string;
  contact_phone: string;
  site_address: string;
  site_city: string;
  google_location: string;
  structure_type: string;
  water_available: YesNo;
  electricity_available: YesNo;
  labour_accommodation: YesNo;
  demobilisation_concerns: string;
  demobilization_consent: boolean;
};

type SubmitIntakeRpcResult = {
  ref_number?: string | null;
  enquiry_id?: string | null;
  submission_id?: string | null;
  error?: string | null;
};

// Values are the DB's structure_type enum.
const STRUCTURE_TYPES = [
  { value: "residential", label: "Residential (house / bungalow / apartment)" },
  { value: "commercial", label: "Commercial (office / shop / mall)" },
  { value: "industrial", label: "Industrial (factory / warehouse / plant)" },
  { value: "infrastructure", label: "Infrastructure (bridge / road / tank / tower)" },
  { value: "other", label: "Other" },
] as const;

const initialForm: FormData = {
  client_name: "", contact_phone: "",
  site_address: "", site_city: "", google_location: "",
  structure_type: "",
  water_available: "", electricity_available: "", labour_accommodation: "",
  demobilisation_concerns: "", demobilization_consent: false,
};

const MAPS_URL_PATTERN = /^https?:\/\/(www\.)?(google\.(com|co\.\w+)\/maps|goo\.gl\/maps|maps\.app\.goo\.gl|maps\.google\.com)/;
const COORDS_PATTERN = /^\s*(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)\s*$/;

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

/**
 * "Google Location" accepts either a Maps link or raw "lat, lng". Returns the
 * link to store and any coordinates found, or null if it is neither.
 */
function parseLocation(input: string): { url: string; coords: { lat: number; lng: number } | null } | null {
  const v = input.trim();
  const c = v.match(COORDS_PATTERN);
  if (c) {
    const lat = parseFloat(c[1]), lng = parseFloat(c[2]);
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
    return { url: `https://www.google.com/maps?q=${lat},${lng}`, coords: { lat, lng } };
  }
  if (isValidMapsUrl(v)) return { url: v, coords: extractCoordsFromMapsUrl(v) };
  return null;
}

function getPublicClientDebugContext() {
  return { client: PUBLIC_SUPABASE_CLIENT_NAME };
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
  const [form, setForm] = useState<FormData>(initialForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [refNumber, setRefNumber] = useState("");
  const [submittedEnquiryId, setSubmittedEnquiryId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [layoutFiles, setLayoutFiles] = useState<File[]>([]);

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

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!form.client_name.trim()) errs.client_name = "Client name is required";
    if (form.contact_phone.replace(/\D/g, "").length < 10) errs.contact_phone = "Enter a valid contact number";
    if (!form.site_address.trim()) errs.site_address = "Site address is required";
    if (!form.site_city.trim()) errs.site_city = "City is required";
    if (form.google_location.trim() && !parseLocation(form.google_location)) {
      errs.google_location = "Paste a Google Maps link, or coordinates like 18.5204, 73.8567";
    }
    if (!form.structure_type) errs.structure_type = "Select the type of structure";
    if (!form.water_available) errs.water_available = "Please choose Yes or No";
    if (!form.electricity_available) errs.electricity_available = "Please choose Yes or No";
    if (!form.labour_accommodation) errs.labour_accommodation = "Please choose Yes or No";
    if (!form.demobilization_consent) errs.demobilization_consent = "Please confirm to continue";
    setErrors(errs);
    if (Object.keys(errs).length) {
      toast.error("Please complete the highlighted fields");
      return false;
    }
    return true;
  };

  const handleSubmit = async () => {
    if (!validate() || !tokenData || !tokenStr) return;
    setSubmitting(true);
    try {
      const clientDebug = getPublicClientDebugContext();
      const name = form.client_name.trim();
      const phone = form.contact_phone.trim();
      // No separate column for the contact's number — keep it with the name so
      // it shows wherever the contact person does.
      const extendedData: Record<string, unknown> = {
        contact_person: phone ? `${name} — ${phone}` : name,
        water_available: form.water_available === "yes",
        electricity_available: form.electricity_available === "yes",
        // One question covers both space and permission.
        labour_accommodation_available: form.labour_accommodation === "yes",
        labour_accommodation_permission: form.labour_accommodation === "yes",
        demobilization_consent: form.demobilization_consent,
      };
      const loc = form.google_location.trim() ? parseLocation(form.google_location) : null;
      if (loc) {
        extendedData.google_maps_url = loc.url;
        if (loc.coords) {
          extendedData.latitude = loc.coords.lat;
          extendedData.longitude = loc.coords.lng;
        }
      }

      const concerns = form.demobilisation_concerns.trim();
      const remarksPayload =
        (concerns ? `Demobilisation concerns: ${concerns}\n` : "") +
        "---EXTENDED_DATA---\n" + JSON.stringify(extendedData);

      const submitPayload = {
        token: tokenStr,
        site_address: form.site_address.trim(),
        site_city: form.site_city.trim(),
        site_state: null,
        site_pincode: null,
        structure_type: form.structure_type,
        num_floors: null,
        basement_floors: null,
        // Required by the DB; the team sets the real bore count in the quotation builder.
        num_bores: 0,
        expected_depth_m: null,
        soil_type_hint: null,
        remarks: remarksPayload,
        extended: extendedData,
        client_name: name || undefined,
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
      const allUploadFiles = layoutFiles;
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
            {/* Clients have no login and take no further action here — this is a
                closing thank-you only, deliberately with no navigation. */}
            <h2 className="mb-3 font-bold text-2xl" style={{ fontFamily: "Sora, sans-serif", color: "#0A1929" }}>
              Thank you
            </h2>
            <p className="text-sm" style={{ color: "#546E7A", lineHeight: 1.6 }}>
              We&rsquo;ve received your project details.
            </p>
            <p className="mt-5 mb-1 text-[13px]" style={{ color: "#90A4AE" }}>Your reference number</p>
            <p
              className="text-2xl font-bold gradient-text"
              style={{ fontFamily: "JetBrains Mono, monospace" }}
            >
              {refNumber}
            </p>
            <p className="mt-5 text-sm" style={{ color: "#546E7A", lineHeight: 1.6 }}>
              Our team will review everything and reach out to you shortly.
              You can safely close this page.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const labelStyle = { fontSize: "12px", fontWeight: 600, color: "#546E7A", textTransform: "uppercase" as const, letterSpacing: "0.05em" };
  const fieldBorder = (key: string) => ({ borderColor: errors[key] ? "#C62828" : "#E0E7EF", borderRadius: "10px" });
  const Err = ({ k }: { k: string }) =>
    errors[k] ? <p className="mt-1 text-[13px]" style={{ color: "#C62828" }}>{errors[k]}</p> : null;
  const Req = () => <span style={{ color: "#C62828" }}>*</span>;

  const YesNoField = ({ k, label }: { k: "water_available" | "electricity_available" | "labour_accommodation"; label: string }) => (
    <div>
      <label className="mb-1.5 block" style={labelStyle}>{label} <Req /></label>
      <div className="flex gap-2">
        {(["yes", "no"] as const).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => updateForm({ [k]: v } as Partial<FormData>)}
            className="flex-1 rounded-xl py-2.5 text-sm font-semibold transition-all"
            style={{
              border: `1.5px solid ${form[k] === v ? (v === "yes" ? "#15673A" : "#B91C1C") : errors[k] ? "#C62828" : "#E0E7EF"}`,
              background: form[k] === v ? (v === "yes" ? "#DCFCE7" : "#FEE2E2") : "#FFFFFF",
              color: form[k] === v ? (v === "yes" ? "#15673A" : "#B91C1C") : "#546E7A",
            }}
          >
            {v === "yes" ? "Yes" : "No"}
          </button>
        ))}
      </div>
      <Err k={k} />
    </div>
  );

  const loc = form.google_location.trim() ? parseLocation(form.google_location) : null;

  return (
    <div className="flex min-h-screen flex-col">
      {/* Admin mode banner */}
      {isAdmin && (
        <div className="bg-white border-b px-6 py-3 flex items-center gap-3" style={{ borderBottomColor: "#E0E7EF" }}>
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 text-sm transition-colors"
            style={{ color: "#546E7A" }}
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
        <p className="text-sm" style={{ color: "rgba(255,255,255,0.6)" }}>Site Information Form — takes about 2 minutes</p>
      </div>

      {/* Main content — everything on one page */}
      <div
        className="flex flex-1 justify-center p-4 sm:p-8"
        style={{ background: "linear-gradient(135deg,#F0F4F8 0%,#E8EEF5 100%)" }}
      >
        <form
          className="w-full space-y-5"
          style={{
            maxWidth: "680px",
            background: "#FFFFFF",
            borderRadius: "20px",
            padding: "28px",
            boxShadow: "0 4px 24px rgba(0,0,0,0.08)",
            border: "1px solid #E0E7EF",
          }}
          onSubmit={(e) => { e.preventDefault(); void handleSubmit(); }}
        >
          {/* Contact details */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block" style={labelStyle}>Client Name <Req /></label>
              <Input
                value={form.client_name}
                onChange={(e) => updateForm({ client_name: e.target.value })}
                placeholder="Your name or company"
                style={fieldBorder("client_name")}
              />
              <Err k="client_name" />
            </div>
            <div>
              <label className="mb-1.5 block" style={labelStyle}>Contact Number <Req /></label>
              <Input
                value={form.contact_phone}
                onChange={(e) => updateForm({ contact_phone: e.target.value })}
                placeholder="+91 98765 43210"
                inputMode="tel"
                style={fieldBorder("contact_phone")}
              />
              <Err k="contact_phone" />
            </div>
          </div>

          {/* Site address */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <label className="mb-1.5 block" style={labelStyle}>Site Address <Req /></label>
              <Textarea
                placeholder="Full site address with landmark"
                value={form.site_address}
                onChange={(e) => updateForm({ site_address: e.target.value })}
                rows={2}
                style={fieldBorder("site_address")}
              />
              <Err k="site_address" />
            </div>
            <div>
              <label className="mb-1.5 block" style={labelStyle}>City <Req /></label>
              <Input
                value={form.site_city}
                onChange={(e) => updateForm({ site_city: e.target.value })}
                placeholder="e.g. Pune"
                style={fieldBorder("site_city")}
              />
              <Err k="site_city" />
            </div>
          </div>

          {/* Google location */}
          <div>
            <label className="mb-1.5 block" style={labelStyle}>
              Google Location <span style={{ color: "#94A3B8", fontWeight: 500 }}>(optional)</span>
            </label>
            <Input
              value={form.google_location}
              onChange={(e) => updateForm({ google_location: e.target.value })}
              placeholder="Paste Google Maps link, or coordinates e.g. 18.5204, 73.8567"
              style={fieldBorder("google_location")}
            />
            <Err k="google_location" />
            {!errors.google_location && loc?.coords && (
              <p className="mt-1 text-[12px] font-medium" style={{ color: "#15673A" }}>
                Location found: {loc.coords.lat.toFixed(6)}, {loc.coords.lng.toFixed(6)}
              </p>
            )}
          </div>

          {/* Structure type */}
          <div>
            <label className="mb-1.5 block" style={labelStyle}>Type of Structure <Req /></label>
            <select
              value={form.structure_type}
              onChange={(e) => updateForm({ structure_type: e.target.value })}
              className="w-full px-3 py-2.5 text-sm"
              style={{ ...fieldBorder("structure_type"), borderWidth: "1px", borderStyle: "solid", background: "#FFFFFF", color: form.structure_type ? "#0A1929" : "#94A3B8" }}
            >
              <option value="" disabled>Select structure type</option>
              {STRUCTURE_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
            <Err k="structure_type" />
          </div>

          {/* Site facilities */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <YesNoField k="water_available" label="Water Available" />
            <YesNoField k="electricity_available" label="Electricity Available" />
            <YesNoField k="labour_accommodation" label="Labour Stay Space & Permission" />
          </div>

          {/* Layout plan */}
          <div>
            <label className="mb-1.5 block" style={labelStyle}>
              Layout Plan <span style={{ color: "#94A3B8", fontWeight: 500 }}>(optional)</span>
            </label>
            <label
              className="flex items-center justify-center gap-2 rounded-xl p-3 cursor-pointer"
              style={{ border: "2px dashed #E0E7EF", background: "#FAFBFC" }}
            >
              <Upload style={{ width: "18px", height: "18px", color: "#546E7A" }} />
              <span className="text-[13px]" style={{ color: "#546E7A" }}>Upload PDF / JPG / PNG (max 3 files, 10MB each)</span>
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

          {/* Demobilisation */}
          <div>
            <label className="mb-1.5 block" style={labelStyle}>
              Demobilisation Concerns <span style={{ color: "#94A3B8", fontWeight: 500 }}>(optional)</span>
            </label>
            <Textarea
              placeholder="Anything we should know about removing equipment or restoring the site after work"
              value={form.demobilisation_concerns}
              onChange={(e) => updateForm({ demobilisation_concerns: e.target.value })}
              rows={2}
              style={{ borderColor: "#E0E7EF", borderRadius: "10px" }}
            />
            <label
              className="mt-3 flex items-start gap-3 rounded-xl p-3 cursor-pointer"
              style={{
                background: form.demobilization_consent ? "#DCFCE7" : "#FEF2F2",
                border: `1.5px solid ${form.demobilization_consent ? "#86EFAC" : "#FECACA"}`,
              }}
            >
              <input
                type="checkbox"
                checked={form.demobilization_consent}
                onChange={(e) => updateForm({ demobilization_consent: e.target.checked })}
                className="mt-0.5 h-4 w-4 rounded"
                style={{ accentColor: "#15673A" }}
              />
              <span className="text-[13px]" style={{ color: "#0A1929" }}>
                I confirm these details are correct. If our team reaches site and cannot start work because the
                site is not ready as stated, <strong>demobilisation and re-mobilisation charges will apply</strong>. <Req />
              </span>
            </label>
            <Err k="demobilization_consent" />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3 rounded-xl text-sm font-semibold transition-all disabled:opacity-60 flex items-center justify-center gap-2"
            style={{
              background: "linear-gradient(135deg,#FF8F00,#FFB300)",
              color: "white",
              boxShadow: "0 4px 16px rgba(255,143,0,0.35)",
            }}
          >
            {submitting ? <><Loader2 className="h-4 w-4 animate-spin" />Submitting…</> : "Submit Site Information"}
          </button>
        </form>
      </div>
    </div>
  );
}
