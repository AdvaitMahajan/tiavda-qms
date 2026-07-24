import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/apiClient";
import type { Tables } from "@/integrations/supabase/types";
import { sendNotification } from "@/lib/notifications";
import { toast } from "sonner";
import { cn, formatDate, relativeTime, clientDisplayName } from "@/lib/utils";
import { createIntakeToken } from "@/lib/intakeTokenUtils";
import {
  Phone, Mail, MapPin, AlertTriangle, Link2, Copy, Check,
  RefreshCw, ArrowLeft, Pencil, Clock, BarChart2, Send, CheckCircle2,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { StatusBadge } from "@/components/ui/StatusBadge";

function avatarGradient(name: string): string {
  const c = (name?.[0] ?? "?").toUpperCase();
  if (c >= "A" && c <= "F") return "linear-gradient(135deg,#1565C0,#2979FF)";
  if (c >= "G" && c <= "L") return "linear-gradient(135deg,#6A1B9A,#AB47BC)";
  if (c >= "M" && c <= "R") return "linear-gradient(135deg,#00897B,#26A69A)";
  return "linear-gradient(135deg,#E65100,#FF8F00)";
}

function validateIndianMobile(phone: string): boolean {
  const cleaned = phone.replace(/[\s-]/g, "");
  return /^(\+91)?[6-9]\d{9}$/.test(cleaned);
}
function normalizePhone(phone: string): string {
  const cleaned = phone.replace(/[\s-]/g, "");
  if (/^\d{10}$/.test(cleaned)) return "+91" + cleaned;
  return cleaned;
}

export default function ClientDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState<Record<string, string>>({});
  const [editErrors, setEditErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [generatingLink, setGeneratingLink] = useState(false);
  const [viewHover, setViewHover] = useState<string | null>(null);

  const { data: client, isLoading: clientLoading } = useQuery({
    queryKey: ["client", id],
    queryFn: () => apiClient.get<Tables<"clients">>(`/clients/${id}`),
    enabled: !!id,
  });

  const { data: activeToken, refetch: refetchToken } = useQuery({
    queryKey: ["intake-token", id],
    queryFn: () => apiClient.get<Tables<"intake_tokens"> | null>("/intake-tokens", { client_id: id, status: "active" }),
    enabled: !!id,
    refetchOnMount: "always",
  });

  const { data: lastUsedToken, refetch: refetchUsed } = useQuery({
    queryKey: ["intake-token-used", id],
    queryFn: () => apiClient.get<Tables<"intake_tokens"> | null>("/intake-tokens", { client_id: id, status: "used" }),
    enabled: !!id,
    refetchOnMount: "always",
  });

  const { data: lastExpiredToken, refetch: refetchExpired } = useQuery({
    queryKey: ["intake-token-expired", id],
    queryFn: () => apiClient.get<Tables<"intake_tokens"> | null>("/intake-tokens", { client_id: id, status: "expired" }),
    enabled: !!id,
  });

  // Check if "active" token is actually time-expired
  const isActiveTokenTimeExpired = activeToken ? new Date(activeToken.expires_at) < new Date() : false;
  const effectiveActiveToken = activeToken && !isActiveTokenTimeExpired ? activeToken : null;
  const intakeLinkEffective = effectiveActiveToken ? `${window.location.origin}/intake?t=${effectiveActiveToken.token}` : null;

  const [sendingLink, setSendingLink] = useState(false);
  const sendLinkToClient = async () => {
    if (!effectiveActiveToken || !client) return;
    setSendingLink(true);
    try {
      const intakeUrl = `${window.location.origin}/intake?t=${effectiveActiveToken.token}`;
      let sent = false;
      if (client.email) {
        await sendNotification({
          to: client.email,
          template: "intake_link",
          params: { client_name: client.name, intake_url: intakeUrl },
        });
        sent = true;
      }
      const waNum = (client as any).whatsapp_number || client.phone;
      if (waNum) {
        const waNumber = waNum.startsWith("+") ? waNum : `+91${waNum.replace(/\D/g, "")}`;
        await apiClient.post("/integrations/whatsapp", {
          phone_number: waNumber,
          template_name: "qms_intake_form",
          parameters: [
            { name: "client_name", value: client.name },
            { name: "ref_number", value: "Intake Form" },
            { name: "link", value: intakeUrl },
          ],
        });
        sent = true;
      }
      toast.success(sent ? "Intake link sent to client!" : "No email or phone on file");
    } catch (err: any) {
      toast.error(err.message || "Failed to send");
    } finally {
      setSendingLink(false);
    }
  };

  const { data: enquiries = [] } = useQuery({
    queryKey: ["client-enquiries", id],
    queryFn: () => apiClient.get<Tables<"enquiries">[]>("/enquiries", { client_id: id }),
    enabled: !!id,
  });

  useEffect(() => {
    if (client) {
      setEditForm({
        name: client.name || "", phone: client.phone || "", email: client.email || "",
        company: client.company || "", city: client.city || "", state: client.state || "",
        whatsapp_number: client.whatsapp_number || "", notes: client.notes || "",
        gst_number: (client as any).gst_number || "",
      });
    }
  }, [client]);

  const intakeLink = intakeLinkEffective;

  const copyLink = () => {
    if (intakeLink) { navigator.clipboard.writeText(intakeLink); setCopied(true); setTimeout(() => setCopied(false), 2000); }
  };

  const generateToken = async () => {
    setGeneratingLink(true);
    try {
      // Bind the intake link to the client's open soil-investigation enquiry so the
      // submission attaches to the RIGHT enquiry (not a fuzzy most-recent guess).
      const targets = await apiClient.get<{ id: string }[]>("/enquiries", {
        client_id: id,
        service_type: "soil_investigation",
        status: "new,intake_pending",
      });
      await createIntakeToken(id!, "", targets[0]?.id ?? undefined);
      toast.success("New intake form link generated");
      await Promise.all([refetchToken(), refetchUsed(), refetchExpired()]);
    } catch (err: any) { toast.error(err.message); }
    finally { setGeneratingLink(false); }
  };

  const handleEditSave = async () => {
    const errs: Record<string, string> = {};
    if (!editForm.name?.trim()) errs.name = "Required";
    if (!editForm.company?.trim()) errs.company = "Required";
    if (!editForm.phone?.trim()) errs.phone = "Required";
    else if (!validateIndianMobile(editForm.phone)) errs.phone = "Invalid number";
    if (!editForm.city?.trim()) errs.city = "Required";
    if (editForm.whatsapp_number?.trim() && !validateIndianMobile(editForm.whatsapp_number)) errs.whatsapp_number = "Invalid number";
    setEditErrors(errs);
    if (Object.keys(errs).length) return;

    setSaving(true);
    try {
      await apiClient.patch(`/clients/${id}`, {
        name: editForm.name.trim(), phone: normalizePhone(editForm.phone),
        email: editForm.email?.trim() || null, company: editForm.company?.trim() || null,
        city: editForm.city.trim(), state: editForm.state?.trim() || null,
        whatsapp_number: editForm.whatsapp_number?.trim() ? normalizePhone(editForm.whatsapp_number) : null,
        notes: editForm.notes?.trim() || null,
      });
      toast.success("Client updated"); setEditOpen(false); queryClient.invalidateQueries({ queryKey: ["client", id] });
    } catch (e) {
      toast.error((e as Error)?.message || "Failed to update client");
    } finally {
      setSaving(false);
    }
  };

  if (clientLoading) return <div className="py-20 text-center text-muted-foreground">Loading…</div>;
  if (!client) return (
    <div className="flex flex-col items-center py-20">
      <p className="mb-4 text-lg font-medium">Client not found</p>
      <Button variant="outline" onClick={() => navigate("/clients")}><ArrowLeft className="mr-2 h-4 w-4" /> Back to Clients</Button>
    </div>
  );

  // Overview stats
  const lastActivity = enquiries.length > 0
    ? relativeTime(enquiries[0].created_at)
    : relativeTime(client.created_at);

  const mostRecentStatus = enquiries.length > 0 ? enquiries[0].status : null;

  return (
    <div style={{ background: "#F0F4F8", padding: "24px", minHeight: "100vh" }}>

      {/* Hero card — dark gradient */}
      <div
        style={{
          background: "linear-gradient(135deg, #0A1929 0%, #1565C0 100%)",
          borderRadius: "20px", padding: "32px", marginBottom: "20px",
          color: "white", boxShadow: "0 8px 32px rgba(10,25,41,0.25)",
          position: "relative", overflow: "hidden",
        }}
      >
        {/* Decorative circle */}
        <div style={{
          position: "absolute", width: "200px", height: "200px", borderRadius: "50%",
          background: "rgba(255,255,255,0.04)", top: "-60px", right: "-60px", pointerEvents: "none",
        }} />

        {/* Breadcrumb */}
        <button
          onClick={() => navigate("/clients")}
          style={{
            display: "flex", alignItems: "center", gap: "6px",
            color: "rgba(255,255,255,0.6)", fontSize: "13px", background: "none",
            border: "none", cursor: "pointer", padding: 0, transition: "color 150ms",
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "white"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.6)"; }}
        >
          <ArrowLeft className="w-4 h-4" /> Clients
        </button>

        {/* Edit button */}
        <button
          onClick={() => setEditOpen(true)}
          style={{
            position: "absolute", top: "24px", right: "24px",
            background: "rgba(255,255,255,0.12)", color: "white",
            border: "1px solid rgba(255,255,255,0.2)",
            borderRadius: "10px", padding: "7px 16px",
            fontSize: "13px", fontWeight: 500,
            backdropFilter: "blur(10px)", cursor: "pointer",
            display: "flex", alignItems: "center", gap: "6px",
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.2)"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.12)"; }}
        >
          <Pencil className="w-3.5 h-3.5" /> Edit
        </button>

        {/* Avatar + name */}
        <div style={{ display: "flex", alignItems: "center", gap: "16px", marginTop: "16px" }}>
          <div style={{
            width: "56px", height: "56px", borderRadius: "50%",
            background: avatarGradient(clientDisplayName(client)),
            display: "flex", alignItems: "center", justifyContent: "center",
            fontFamily: "Sora, sans-serif", fontWeight: 700, fontSize: "22px", color: "white",
            flexShrink: 0, border: "3px solid rgba(255,255,255,0.2)",
          }}>
            {clientDisplayName(client)[0]?.toUpperCase() ?? "?"}
          </div>
          <div>
            <div style={{ fontFamily: "Sora, sans-serif", fontWeight: 700, fontSize: "26px", color: "white" }}>
              {clientDisplayName(client)}
            </div>
            {client.company && (
              <div style={{ color: "rgba(255,255,255,0.6)", fontSize: "13px", marginTop: "2px" }}>{client.name}</div>
            )}
          </div>
        </div>

        {/* Contact row */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: "24px", marginTop: "16px" }}>
          <a
            href={`tel:${client.phone}`}
            style={{ display: "flex", alignItems: "center", gap: "8px", color: "rgba(255,255,255,0.85)", fontSize: "13px", textDecoration: "none" }}
          >
            <Phone style={{ width: "16px", height: "16px", color: "rgba(255,255,255,0.5)" }} />
            {client.phone}
          </a>
          {client.email && (
            <a
              href={`mailto:${client.email}`}
              style={{ display: "flex", alignItems: "center", gap: "8px", color: "rgba(255,255,255,0.85)", fontSize: "13px", textDecoration: "none" }}
            >
              <Mail style={{ width: "16px", height: "16px", color: "rgba(255,255,255,0.5)" }} />
              {client.email}
            </a>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "rgba(255,255,255,0.85)", fontSize: "13px" }}>
            <MapPin style={{ width: "16px", height: "16px", color: "rgba(255,255,255,0.5)" }} />
            {client.city}{client.state ? `, ${client.state}` : ""}
          </div>
        </div>
      </div>

      {/* Alert banners */}
      {client.email_bounced && (
        <div style={{ display: "flex", alignItems: "center", gap: "12px", borderRadius: "10px", border: "1px solid #FFCC80", background: "#FFF8E1", padding: "12px 16px", marginBottom: "16px", fontSize: "13px", color: "#E65100" }}>
          <AlertTriangle className="h-4 w-4 shrink-0" /> Email address has bounced — please update the email.
        </div>
      )}
      {client.whatsapp_invalid && (
        <div style={{ display: "flex", alignItems: "center", gap: "12px", borderRadius: "10px", border: "1px solid #FFCC80", background: "#FFF8E1", padding: "12px 16px", marginBottom: "16px", fontSize: "13px", color: "#E65100" }}>
          <AlertTriangle className="h-4 w-4 shrink-0" /> WhatsApp number is invalid — please update.
        </div>
      )}

      {/* Two-column grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px", marginBottom: "20px" }}>

        {/* Left: Intake Form Link */}
        <div style={{
          background: "white", borderRadius: "16px", padding: "24px",
          border: "1px solid #E0E7EF", boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
        }}>
          {/* Title row */}
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "4px" }}>
            <div style={{
              width: "32px", height: "32px", borderRadius: "50%", background: "#EBF2FF",
              display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
            }}>
              <Link2 style={{ width: "15px", height: "15px", color: "#1565C0" }} />
            </div>
            <span style={{ fontWeight: 600, fontSize: "15px", color: "#0A1929", fontFamily: "Sora, sans-serif" }}>Intake Form Link</span>
          </div>

          {/* Priority: an ACTIVE link always wins (so a freshly generated link for a
              new/parallel enquiry shows immediately, even if an earlier form was filled). */}
          {intakeLink ? (
            <div>
              {/* Link display */}
              <div style={{
                background: "#F8FAFC", border: "1px solid #E0E7EF", borderRadius: "10px",
                padding: "10px 14px", fontFamily: "JetBrains Mono, monospace",
                fontSize: "12px", color: "#546E7A", wordBreak: "break-all", marginTop: "12px",
              }}>
                {intakeLink}
              </div>
              {/* Expiry */}
              <div style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "12px", color: "#546E7A", marginTop: "8px" }}>
                <Clock style={{ width: "12px", height: "12px" }} />
                Expires {formatDate(effectiveActiveToken!.expires_at)}
              </div>
              {/* Buttons */}
              <div style={{ display: "flex", gap: "8px", marginTop: "12px", flexWrap: "wrap" }}>
                <button
                  onClick={copyLink}
                  style={{ background: "#F0F4F8", color: "#0A1929", border: "1px solid #E0E7EF", borderRadius: "8px", padding: "8px 12px", fontSize: "13px", fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: "5px" }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "#E3EAF2"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "#F0F4F8"; }}
                >
                  {copied ? <><Check className="w-3.5 h-3.5" /> Copied!</> : <><Copy className="w-3.5 h-3.5" /> Copy</>}
                </button>
                <button
                  onClick={sendLinkToClient}
                  disabled={sendingLink}
                  style={{ background: "#F0F4F8", color: "#0A1929", border: "1px solid #E0E7EF", borderRadius: "8px", padding: "8px 12px", fontSize: "13px", fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: "5px" }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "#E3EAF2"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "#F0F4F8"; }}
                >
                  {sendingLink ? <><Send className="w-3.5 h-3.5 animate-pulse" /> Sending…</> : <><Send className="w-3.5 h-3.5" /> Send to Client</>}
                </button>
                <button
                  onClick={generateToken}
                  disabled={generatingLink}
                  style={{ background: "#F0F4F8", color: "#0A1929", border: "1px solid #E0E7EF", borderRadius: "8px", padding: "8px 12px", fontSize: "13px", fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: "5px" }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "#E3EAF2"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "#F0F4F8"; }}
                >
                  <RefreshCw className={cn("w-3.5 h-3.5", generatingLink && "animate-spin")} /> Regenerate
                </button>
                <button
                  onClick={() => navigate(`/intake?t=${effectiveActiveToken!.token}`)}
                  style={{ background: "linear-gradient(135deg,#1565C0,#2979FF)", color: "white", border: "none", borderRadius: "8px", padding: "8px 12px", fontSize: "13px", fontWeight: 600, cursor: "pointer", boxShadow: "0 4px 12px rgba(21,101,192,0.25)" }}
                >
                  Fill on Behalf
                </button>
              </div>
            </div>
          ) : lastUsedToken ? (
            /* State 2: Most recent form was submitted (and no active link right now) */
            <div style={{ marginTop: "12px" }}>
              <div style={{
                background: "#ECFDF5", border: "1px solid #A7F3D0", borderRadius: "10px",
                padding: "12px 14px", display: "flex", alignItems: "center", gap: "10px",
              }}>
                <CheckCircle2 style={{ width: "18px", height: "18px", color: "#15673A", flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: "13px", fontWeight: 600, color: "#15673A" }}>Intake Form Submitted</div>
                  <div style={{ fontSize: "12px", color: "#546E7A", marginTop: "2px" }}>
                    Submitted on {formatDate(lastUsedToken.used_at!)} — this link has been used and closed.
                  </div>
                </div>
              </div>
              <p style={{ fontSize: "12px", color: "#546E7A", margin: "12px 0 8px" }}>
                Generate a fresh link to collect intake for a new / parallel enquiry from this client.
              </p>
              <button
                onClick={generateToken}
                disabled={generatingLink}
                style={{ background: "linear-gradient(135deg,#1565C0,#2979FF)", color: "white", border: "none", borderRadius: "8px", padding: "9px 16px", fontSize: "13px", fontWeight: 600, cursor: "pointer", boxShadow: "0 4px 12px rgba(21,101,192,0.25)", display: "flex", alignItems: "center", gap: "6px" }}
              >
                {generatingLink ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Generating…</> : <><RefreshCw className="w-3.5 h-3.5" /> Generate New Intake Form</>}
              </button>
            </div>
          ) : (lastExpiredToken || isActiveTokenTimeExpired) ? (
            /* State 3: Link expired (time-expired or status=expired) */
            <div style={{ marginTop: "12px" }}>
              <div style={{
                background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: "10px",
                padding: "12px 14px", display: "flex", alignItems: "center", gap: "10px",
              }}>
                <AlertTriangle style={{ width: "18px", height: "18px", color: "#B91C1C", flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: "13px", fontWeight: 600, color: "#B91C1C" }}>Intake Link Expired</div>
                  <div style={{ fontSize: "12px", color: "#546E7A", marginTop: "2px" }}>
                    Client did not fill the form. Link expired on {formatDate((isActiveTokenTimeExpired ? activeToken! : lastExpiredToken!).expires_at)}.
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", gap: "8px", marginTop: "12px" }}>
                <button
                  onClick={generateToken}
                  disabled={generatingLink}
                  style={{ background: "linear-gradient(135deg,#1565C0,#2979FF)", color: "white", border: "none", borderRadius: "8px", padding: "9px 16px", fontSize: "13px", fontWeight: 600, cursor: "pointer", boxShadow: "0 4px 12px rgba(21,101,192,0.25)", display: "flex", alignItems: "center", gap: "6px" }}
                >
                  {generatingLink ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Generating…</> : <><Send className="w-3.5 h-3.5" /> Generate & Send New Link</>}
                </button>
              </div>
            </div>
          ) : (
            /* State 4: No link ever generated */
            <div style={{ marginTop: "12px" }}>
              <p style={{ fontSize: "13px", color: "#546E7A", marginBottom: "12px" }}>No intake link generated yet. Generate one to share with the client.</p>
              <button
                onClick={generateToken}
                disabled={generatingLink}
                style={{ background: "linear-gradient(135deg,#1565C0,#2979FF)", color: "white", border: "none", borderRadius: "8px", padding: "9px 16px", fontSize: "13px", fontWeight: 600, cursor: "pointer", boxShadow: "0 4px 12px rgba(21,101,192,0.25)", display: "flex", alignItems: "center", gap: "6px" }}
              >
                {generatingLink ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Generating…</> : "Generate Intake Link"}
              </button>
            </div>
          )}
        </div>

        {/* Right: Client Overview */}
        <div style={{
          background: "white", borderRadius: "16px", padding: "24px",
          border: "1px solid #E0E7EF", boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
        }}>
          {/* Title row */}
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px" }}>
            <div style={{
              width: "32px", height: "32px", borderRadius: "50%", background: "#EBF2FF",
              display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
            }}>
              <BarChart2 style={{ width: "15px", height: "15px", color: "#1565C0" }} />
            </div>
            <span style={{ fontWeight: 600, fontSize: "15px", color: "#0A1929", fontFamily: "Sora, sans-serif" }}>Client Overview</span>
          </div>

          {/* Stat rows */}
          {[
            { label: "Total Enquiries", value: String(enquiries.length) },
            { label: "Last Activity", value: lastActivity },
            { label: "Quote Value", value: "—" },
          ].map((row, idx) => (
            <div
              key={row.label}
              style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "10px 0",
                borderBottom: idx < 2 ? "1px solid #F0F4F8" : "none",
              }}
            >
              <span style={{ fontSize: "13px", color: "#546E7A" }}>{row.label}</span>
              <span style={{ fontSize: "13px", fontWeight: 600, color: "#0A1929" }}>{row.value}</span>
            </div>
          ))}
          {/* Status row */}
          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            padding: "10px 0",
            borderBottom: (client.lead_source || client.service_type_interest) ? "1px solid #F0F4F8" : "none",
          }}>
            <span style={{ fontSize: "13px", color: "#546E7A" }}>Latest Status</span>
            {mostRecentStatus ? (
              <StatusBadge status={mostRecentStatus} />
            ) : (
              <span style={{ fontSize: "13px", fontWeight: 600, color: "#0A1929" }}>—</span>
            )}
          </div>

          {/* Lead info */}
          {(client.lead_source || client.service_type_interest || client.requirement_notes) && (
            <>
              <div style={{ marginTop: "12px", marginBottom: "8px" }}>
                <span style={{ fontSize: "12px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "#94A3B8" }}>Lead Info</span>
              </div>
              {[
                { label: "Lead Source", value: client.lead_source?.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase()) },
                { label: "Service Interest", value: client.service_type_interest === "soil_investigation" ? "Soil Investigation" : client.service_type_interest === "consultancy" ? "Consultancy" : null },
                { label: "Requirement", value: client.requirement_notes },
              ].filter((r) => r.value).map((row, idx, arr) => (
                <div
                  key={row.label}
                  style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: "8px 0",
                    borderBottom: idx < arr.length - 1 ? "1px solid #F0F4F8" : "none",
                  }}
                >
                  <span style={{ fontSize: "13px", color: "#546E7A" }}>{row.label}</span>
                  <span style={{ fontSize: "13px", fontWeight: 500, color: "#0A1929", maxWidth: "60%", textAlign: "right" }}>{row.value}</span>
                </div>
              ))}
            </>
          )}
        </div>
      </div>

      {/* Enquiry History — full width */}
      <div style={{
        background: "white", borderRadius: "16px", padding: "24px",
        border: "1px solid #E0E7EF", boxShadow: "0 2px 8px rgba(0,0,0,0.06)", overflow: "hidden",
      }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px" }}>
          <h2 style={{ fontFamily: "Sora, sans-serif", fontWeight: 600, fontSize: "15px", color: "#0A1929", margin: 0 }}>
            Enquiry History
          </h2>
          <span style={{
            background: "#EBF2FF", color: "#1565C0", border: "1px solid #BFDBFE",
            borderRadius: "20px", padding: "2px 10px", fontSize: "12px", fontWeight: 700,
          }}>
            {enquiries.length}
          </span>
        </div>

        {enquiries.length === 0 ? (
          <p style={{ textAlign: "center", padding: "32px 0", fontSize: "13px", color: "#94A3B8" }}>
            No enquiries yet for this client.
          </p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#F8FAFC", borderBottom: "2px solid #E0E7EF" }}>
                {["Ref #", "Date", "Type", "Status", "Bores", "City", "Action"].map((h) => (
                  <th
                    key={h}
                    className="text-left"
                    style={{
                      fontSize: "12px", fontWeight: 600, textTransform: "uppercase",
                      letterSpacing: "0.1em", padding: "12px 16px", color: "#546E7A",
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {enquiries.map((enq) => (
                <tr
                  key={enq.id}
                  style={{ borderBottom: "1px solid #F0F4F8", cursor: "pointer", transition: "background 100ms" }}
                  onClick={() => navigate(`/enquiries/${enq.id}`)}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "#F8FAFC"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                >
                  <td style={{ padding: "12px 16px", fontFamily: "JetBrains Mono, monospace", fontSize: "13px", color: "#0A1929", fontWeight: 600 }}>
                    {enq.ref_number}
                  </td>
                  <td style={{ padding: "12px 16px", fontSize: "13px", color: "#546E7A" }}>
                    {formatDate(enq.enquiry_date)}
                  </td>
                  <td style={{ padding: "12px 16px" }}>
                    {(enq as any).service_type === "consultancy" ? (
                      <span style={{ background: "#EDE7F6", color: "#7B1FA2", fontSize: "12px", fontWeight: 700, padding: "2px 8px", borderRadius: "6px" }}>Consultancy</span>
                    ) : (
                      <span style={{ background: "#E3F2FD", color: "#1565C0", fontSize: "12px", fontWeight: 700, padding: "2px 8px", borderRadius: "6px" }}>Soil Investigation</span>
                    )}
                  </td>
                  <td style={{ padding: "12px 16px" }}>
                    <StatusBadge status={enq.status} />
                  </td>
                  <td style={{ padding: "12px 16px", fontSize: "13px", color: "#546E7A" }}>
                    {enq.num_bores ?? "—"}
                  </td>
                  <td style={{ padding: "12px 16px", fontSize: "13px", color: "#546E7A" }}>
                    {enq.site_city}
                  </td>
                  <td style={{ padding: "12px 16px" }}>
                    <button
                      style={{
                        background: viewHover === enq.id ? "#E3EAF2" : "#F0F4F8",
                        color: "#0A1929", border: "1px solid #E0E7EF",
                        borderRadius: "8px", padding: "5px 14px", fontSize: "13px", fontWeight: 600,
                        cursor: "pointer", transition: "all 150ms",
                      }}
                      onMouseEnter={() => setViewHover(enq.id)}
                      onMouseLeave={() => setViewHover(null)}
                      onClick={(e) => { e.stopPropagation(); navigate(`/enquiries/${enq.id}`); }}
                    >
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Edit Panel */}
      <Sheet open={editOpen} onOpenChange={setEditOpen}>
        <SheetContent
          className="overflow-y-auto sm:max-w-md"
          style={{ boxShadow: "-8px 0 40px rgba(0,0,0,0.15)" }}
        >
          <SheetHeader
            style={{
              background: "linear-gradient(135deg,#F8FAFC,#F0F4F8)",
              margin: "-24px -24px 0",
              padding: "24px",
              borderBottom: "1px solid #E0E7EF",
            }}
          >
            <SheetTitle style={{ fontFamily: "Sora, sans-serif", color: "#0A1929" }}>Edit Client</SheetTitle>
          </SheetHeader>
          <div className="mt-6 space-y-4 px-1 pb-6">
            <EditField label="Full Name" required value={editForm.name} onChange={(v) => setEditForm((p) => ({ ...p, name: v }))} error={editErrors.name} />
            <EditField label="Phone Number" required value={editForm.phone} onChange={(v) => setEditForm((p) => ({ ...p, phone: v }))} error={editErrors.phone}
              onBlur={() => { if (editForm.phone) setEditForm((p) => ({ ...p, phone: normalizePhone(editForm.phone) })); }} />
            <EditField label="Email" value={editForm.email} onChange={(v) => setEditForm((p) => ({ ...p, email: v }))} type="email" />
            <EditField label="Company Name" required value={editForm.company} onChange={(v) => setEditForm((p) => ({ ...p, company: v }))} error={editErrors.company} />
            <EditField label="GST Number" value={editForm.gst_number} onChange={(v) => setEditForm((p) => ({ ...p, gst_number: v.toUpperCase() }))} placeholder="e.g. 27AABCT1332L1ZD" />
            <EditField label="City" required value={editForm.city} onChange={(v) => setEditForm((p) => ({ ...p, city: v }))} error={editErrors.city} />
            <EditField label="State" value={editForm.state} onChange={(v) => setEditForm((p) => ({ ...p, state: v }))} />
            <EditField label="WhatsApp Number (if different from phone)" value={editForm.whatsapp_number} onChange={(v) => setEditForm((p) => ({ ...p, whatsapp_number: v }))} error={editErrors.whatsapp_number}
              onBlur={() => { if (editForm.whatsapp_number) setEditForm((p) => ({ ...p, whatsapp_number: normalizePhone(editForm.whatsapp_number) })); }} />
            <div>
              <label className="mb-1.5 block" style={{ fontSize: "12px", fontWeight: 600, color: "#546E7A", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Notes
              </label>
              <Textarea value={editForm.notes} onChange={(e) => setEditForm((p) => ({ ...p, notes: e.target.value }))} rows={3} style={{ borderColor: "#E0E7EF", borderRadius: "10px" }} />
            </div>
          </div>
          <div style={{ background: "#F8FAFC", borderTop: "1px solid #E0E7EF", margin: "0 -24px -24px", padding: "16px 24px" }}>
            <button
              onClick={handleEditSave}
              disabled={saving}
              className="w-full py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-50"
              style={{
                background: "linear-gradient(135deg,#1565C0,#2979FF)",
                color: "white",
                boxShadow: "0 4px 12px rgba(21,101,192,0.3)",
              }}
            >
              {saving ? "Saving…" : "Save Changes"}
            </button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function EditField({ label, required, value, onChange, error, type = "text", onBlur, placeholder }: {
  label: string; required?: boolean; value: string; onChange: (v: string) => void; error?: string; type?: string; onBlur?: () => void; placeholder?: string;
}) {
  return (
    <div>
      <label className="mb-1.5 block" style={{ fontSize: "12px", fontWeight: 600, color: "#546E7A", textTransform: "uppercase", letterSpacing: "0.05em" }}>
        {label} {required && <span style={{ color: "#C62828" }}>*</span>}
      </label>
      <Input type={type} value={value || ""} onChange={(e) => onChange(e.target.value)} onBlur={onBlur} placeholder={placeholder} style={{ borderColor: "#E0E7EF", borderRadius: "10px", fontSize: "14px" }} />
      {error && <p className="mt-1 text-[13px]" style={{ color: "#C62828" }}>{error}</p>}
    </div>
  );
}
