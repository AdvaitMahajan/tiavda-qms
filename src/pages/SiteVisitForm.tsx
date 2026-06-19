import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { supabasePublic } from "@/integrations/supabase/publicClient";
import {
  MapPin, CheckCircle2, Droplets, ShieldCheck, Lock, Fence,
  Loader2, ClipboardCheck, AlertTriangle, User, Phone, Mail, Building2,
} from "lucide-react";

const FEASIBILITY_OPTIONS = [
  { value: "feasible", label: "Feasible", color: "#15673A", bg: "#DCFCE7" },
  { value: "conditional", label: "Conditional", color: "#92400E", bg: "#FEF3C7" },
  { value: "not_feasible", label: "Not Feasible", color: "#B91C1C", bg: "#FEE2E2" },
] as const;

const COST_FACTOR_PRESETS = [
  "Difficult terrain access",
  "Water tanker required",
  "Rock coring expected",
  "Extended depth drilling",
  "Security arrangement needed",
  "Generator required",
  "Basement level access",
  "High water table",
];

type VisitData = {
  id: string;
  visit_date: string;
  status: string;
  token: string;
  enquiry_id: string;
  observations: any;
  recommendations: string | null;
  cost_factors: any;
  feasibility: string | null;
  water_confirmed: boolean | null;
  access_confirmed: boolean | null;
  security_confirmed: boolean | null;
  fencing_confirmed: boolean | null;
};

type EnquiryData = {
  ref_number: string;
  site_address: string | null;
  site_city: string;
  structure_type: string | null;
  num_bores: number | null;
  expected_depth_m: number | null;
  soil_type_hint: string | null;
  remarks: string | null;
  clients: {
    name: string;
    phone: string;
    email: string | null;
    company: string | null;
  };
};

export default function SiteVisitForm() {
  const [params] = useSearchParams();
  const token = params.get("t");

  const [loading, setLoading] = useState(true);
  const [visit, setVisit] = useState<VisitData | null>(null);
  const [enquiry, setEnquiry] = useState<EnquiryData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const [feasibility, setFeasibility] = useState("feasible");
  const [waterConfirmed, setWaterConfirmed] = useState(false);
  const [accessConfirmed, setAccessConfirmed] = useState(false);
  const [securityConfirmed, setSecurityConfirmed] = useState(false);
  const [fencingConfirmed, setFencingConfirmed] = useState(false);
  const [observationNotes, setObservationNotes] = useState("");
  const [recommendations, setRecommendations] = useState("");
  const [selectedCostFactors, setSelectedCostFactors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!token) {
      setError("Invalid link. No token provided.");
      setLoading(false);
      return;
    }
    loadVisit(token);
  }, [token]);

  async function loadVisit(t: string) {
    try {
      const { data: row, error: svErr } = await supabasePublic.rpc("get_site_visit", { p_token: t });
      const sv = row as unknown as (VisitData & { enquiry?: EnquiryData & { client?: EnquiryData["clients"] } }) | null;

      if (svErr || !sv) {
        setError("This site visit link is invalid or has expired.");
        setLoading(false);
        return;
      }

      if (sv.status === "completed") {
        setError("This site visit has already been completed.");
        setLoading(false);
        return;
      }

      if (sv.status === "cancelled") {
        setError("This site visit has been cancelled.");
        setLoading(false);
        return;
      }

      setVisit(sv as VisitData);

      if (sv.observations?.notes) setObservationNotes(sv.observations.notes);
      if (sv.recommendations) setRecommendations(sv.recommendations);
      if (sv.cost_factors) setSelectedCostFactors(sv.cost_factors as string[]);
      if (sv.feasibility) setFeasibility(sv.feasibility);
      if (sv.water_confirmed) setWaterConfirmed(true);
      if (sv.access_confirmed) setAccessConfirmed(true);
      if (sv.security_confirmed) setSecurityConfirmed(true);
      if (sv.fencing_confirmed) setFencingConfirmed(true);

      // The RPC nests enquiry (with client) inside the result.
      if (sv.enquiry) {
        const e = sv.enquiry;
        setEnquiry({ ...e, clients: (e.client ?? e.clients) as EnquiryData["clients"] } as EnquiryData);
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const toggleCostFactor = (factor: string) => {
    setSelectedCostFactors((prev) =>
      prev.includes(factor) ? prev.filter((f) => f !== factor) : [...prev, factor]
    );
  };

  const handleSubmit = async () => {
    if (!visit) return;
    setSaving(true);
    try {
      const { data: res, error: updateErr } = await supabasePublic.rpc("submit_site_visit", {
        p_token: token!,
        p_feasibility: feasibility,
        p_water: waterConfirmed,
        p_access: accessConfirmed,
        p_security: securityConfirmed,
        p_fencing: fencingConfirmed,
        p_observations: observationNotes,
        p_recommendations: recommendations,
        p_cost_factors: selectedCostFactors,
      });
      const r = res as { ok?: boolean } | null;
      if (updateErr || !r?.ok) throw new Error(updateErr?.message || "submit failed");

      setSubmitted(true);
    } catch (err: any) {
      alert(err.message || "Failed to submit. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#F0F4F8" }}>
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: "#1565C0" }} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: "#F0F4F8" }}>
        <div className="text-center max-w-md">
          <AlertTriangle className="mx-auto mb-4 h-12 w-12" style={{ color: "#E65100" }} />
          <h2 className="text-lg font-semibold mb-2" style={{ fontFamily: "Sora, sans-serif", color: "#0A1929" }}>
            {error}
          </h2>
          <p className="text-sm" style={{ color: "#546E7A" }}>
            Contact the office if you believe this is an error.
          </p>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: "#F0F4F8" }}>
        <div className="text-center max-w-md">
          <div
            className="mx-auto mb-4 h-16 w-16 rounded-full flex items-center justify-center"
            style={{ background: "#DCFCE7" }}
          >
            <CheckCircle2 className="h-8 w-8" style={{ color: "#15673A" }} />
          </div>
          <h2 className="text-xl font-bold mb-2" style={{ fontFamily: "Sora, sans-serif", color: "#0A1929" }}>
            Site Visit Report Submitted
          </h2>
          <p className="text-sm mb-1" style={{ color: "#546E7A" }}>
            Thank you! Your observations for <strong>{enquiry?.ref_number}</strong> have been recorded.
          </p>
          <p className="text-[13px]" style={{ color: "#94A3B8" }}>
            You can close this page now.
          </p>
        </div>
      </div>
    );
  }

  const visitDate = visit ? new Date(visit.visit_date).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : "";

  return (
    <div className="min-h-screen" style={{ background: "#F0F4F8" }}>
      {/* Header */}
      <div style={{ background: "linear-gradient(135deg,#0A1929,#0F2A47)", padding: "24px 16px" }}>
        <div className="max-w-lg mx-auto">
          <p className="text-[13px] font-semibold tracking-widest uppercase mb-1" style={{ color: "#64B5F6" }}>
            Global Geo Consultancy
          </p>
          <h1 className="text-xl font-bold text-white" style={{ fontFamily: "Sora, sans-serif" }}>
            Site Visit Report
          </h1>
          <p className="text-sm mt-1" style={{ color: "#90CAF9" }}>
            {enquiry?.ref_number} &middot; {visitDate}
          </p>
        </div>
      </div>

      <div className="max-w-lg mx-auto p-4 space-y-4 pb-8">
        {/* Site & Client Details (read-only) */}
        {enquiry && (
          <div style={{ background: "#FFFFFF", borderRadius: "16px", border: "1px solid #E0E7EF", padding: "16px" }}>
            <p className="text-[12px] font-semibold uppercase tracking-wide mb-3" style={{ color: "#546E7A" }}>
              Site & Client Details
            </p>

            <div className="space-y-2.5">
              <div className="flex items-start gap-2.5">
                <MapPin style={{ width: "15px", height: "15px", color: "#1565C0", flexShrink: 0, marginTop: "2px" }} />
                <div>
                  <p className="text-sm font-medium" style={{ color: "#0A1929" }}>{enquiry.site_address || enquiry.site_city}</p>
                  <p className="text-[13px]" style={{ color: "#546E7A" }}>{enquiry.site_city}</p>
                </div>
              </div>

              <div className="flex items-center gap-2.5">
                <User style={{ width: "15px", height: "15px", color: "#1565C0", flexShrink: 0 }} />
                <div>
                  <p className="text-sm font-medium" style={{ color: "#0A1929" }}>{enquiry.clients.name}</p>
                  {enquiry.clients.company && (
                    <p className="text-[13px]" style={{ color: "#546E7A" }}>{enquiry.clients.company}</p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2.5">
                <Phone style={{ width: "15px", height: "15px", color: "#1565C0", flexShrink: 0 }} />
                <a href={`tel:${enquiry.clients.phone}`} className="text-sm" style={{ color: "#1565C0" }}>
                  {enquiry.clients.phone}
                </a>
              </div>

              {enquiry.clients.email && (
                <div className="flex items-center gap-2.5">
                  <Mail style={{ width: "15px", height: "15px", color: "#1565C0", flexShrink: 0 }} />
                  <a href={`mailto:${enquiry.clients.email}`} className="text-sm" style={{ color: "#1565C0" }}>
                    {enquiry.clients.email}
                  </a>
                </div>
              )}

              <div className="flex items-center gap-2.5">
                <Building2 style={{ width: "15px", height: "15px", color: "#1565C0", flexShrink: 0 }} />
                <p className="text-sm" style={{ color: "#0A1929" }}>
                  {enquiry.structure_type ? enquiry.structure_type.charAt(0).toUpperCase() + enquiry.structure_type.slice(1) : "—"}
                  {enquiry.num_bores ? ` · ${enquiry.num_bores} bore(s)` : ""}
                  {enquiry.expected_depth_m ? ` · ${enquiry.expected_depth_m}m depth` : ""}
                  {enquiry.soil_type_hint ? ` · ${enquiry.soil_type_hint}` : ""}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Feasibility Assessment */}
        <div style={{ background: "#FFFFFF", borderRadius: "16px", border: "1px solid #E0E7EF", padding: "16px" }}>
          <p className="text-[12px] font-semibold uppercase tracking-wide mb-3" style={{ color: "#546E7A" }}>
            Feasibility Assessment *
          </p>
          <div className="flex gap-2">
            {FEASIBILITY_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setFeasibility(opt.value)}
                className="flex-1 py-3 rounded-xl text-sm font-semibold transition-all"
                style={{
                  background: feasibility === opt.value ? opt.bg : "#F0F4F8",
                  color: feasibility === opt.value ? opt.color : "#546E7A",
                  border: feasibility === opt.value ? `2px solid ${opt.color}` : "2px solid transparent",
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Site Confirmations */}
        <div style={{ background: "#FFFFFF", borderRadius: "16px", border: "1px solid #E0E7EF", padding: "16px" }}>
          <p className="text-[12px] font-semibold uppercase tracking-wide mb-3" style={{ color: "#546E7A" }}>
            Site Confirmations
          </p>
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: "Water Available", icon: Droplets, checked: waterConfirmed, set: setWaterConfirmed },
              { label: "Access Clear", icon: MapPin, checked: accessConfirmed, set: setAccessConfirmed },
              { label: "Security OK", icon: ShieldCheck, checked: securityConfirmed, set: setSecurityConfirmed },
              { label: "Fencing OK", icon: Fence, checked: fencingConfirmed, set: setFencingConfirmed },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.label}
                  onClick={() => item.set(!item.checked)}
                  className="flex items-center gap-2 px-3 py-3 rounded-xl text-sm font-medium transition-all"
                  style={{
                    background: item.checked ? "#DCFCE7" : "#F0F4F8",
                    color: item.checked ? "#15673A" : "#546E7A",
                    border: item.checked ? "1.5px solid #86EFAC" : "1.5px solid #E0E7EF",
                  }}
                >
                  <Icon style={{ width: "16px", height: "16px" }} />
                  {item.label}
                  {item.checked && <CheckCircle2 style={{ width: "14px", height: "14px", marginLeft: "auto" }} />}
                </button>
              );
            })}
          </div>
        </div>

        {/* Cost Factors */}
        <div style={{ background: "#FFFFFF", borderRadius: "16px", border: "1px solid #E0E7EF", padding: "16px" }}>
          <p className="text-[12px] font-semibold uppercase tracking-wide mb-3" style={{ color: "#546E7A" }}>
            Cost Factors (select all that apply)
          </p>
          <div className="flex flex-wrap gap-2">
            {COST_FACTOR_PRESETS.map((factor) => (
              <button
                key={factor}
                onClick={() => toggleCostFactor(factor)}
                className="text-sm px-3 py-2 rounded-full font-medium transition-all"
                style={{
                  background: selectedCostFactors.includes(factor) ? "#FEF3C7" : "#F0F4F8",
                  color: selectedCostFactors.includes(factor) ? "#92400E" : "#546E7A",
                  border: selectedCostFactors.includes(factor) ? "1.5px solid #FCD34D" : "1.5px solid #E0E7EF",
                }}
              >
                {factor}
              </button>
            ))}
          </div>
        </div>

        {/* Observations */}
        <div style={{ background: "#FFFFFF", borderRadius: "16px", border: "1px solid #E0E7EF", padding: "16px" }}>
          <p className="text-[12px] font-semibold uppercase tracking-wide mb-2" style={{ color: "#546E7A" }}>
            Observations
          </p>
          <textarea
            value={observationNotes}
            onChange={(e) => setObservationNotes(e.target.value)}
            placeholder="Water table level, soil conditions, access road status, nearby structures..."
            rows={4}
            className="w-full rounded-xl text-sm"
            style={{ border: "1.5px solid #E0E7EF", padding: "12px 14px", resize: "none", background: "#FAFBFC" }}
          />
        </div>

        {/* Recommendations */}
        <div style={{ background: "#FFFFFF", borderRadius: "16px", border: "1px solid #E0E7EF", padding: "16px" }}>
          <p className="text-[12px] font-semibold uppercase tracking-wide mb-2" style={{ color: "#546E7A" }}>
            Recommendations
          </p>
          <textarea
            value={recommendations}
            onChange={(e) => setRecommendations(e.target.value)}
            placeholder="Suggested bore depth, equipment type, access arrangements, special precautions..."
            rows={3}
            className="w-full rounded-xl text-sm"
            style={{ border: "1.5px solid #E0E7EF", padding: "12px 14px", resize: "none", background: "#FAFBFC" }}
          />
        </div>

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={saving}
          className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl text-base font-semibold transition-all disabled:opacity-50"
          style={{
            background: "linear-gradient(135deg,#15673A,#22C55E)",
            color: "white",
            boxShadow: "0 6px 20px rgba(21,103,58,0.35)",
          }}
        >
          {saving ? (
            <><Loader2 className="h-5 w-5 animate-spin" /> Submitting...</>
          ) : (
            <><ClipboardCheck className="h-5 w-5" /> Submit Site Visit Report</>
          )}
        </button>

        <p className="text-center text-[13px]" style={{ color: "#94A3B8" }}>
          Your observations will be recorded in the QMS system.
        </p>
      </div>
    </div>
  );
}
