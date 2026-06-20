import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { formatDate } from "@/lib/utils";
import { createIntakeToken, getIntakeUrl, sendIntakeLink } from "@/lib/intakeTokenUtils";
import { Link2, Copy, Check, Send, RefreshCw, Clock, CheckCircle2, AlertTriangle } from "lucide-react";

const btn = {
  base: { borderRadius: "8px", padding: "8px 12px", fontSize: "13px", fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: "5px", border: "1px solid #E0E7EF", background: "#F0F4F8", color: "#0A1929" } as const,
  primary: { borderRadius: "8px", padding: "9px 16px", fontSize: "13px", fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: "6px", border: "none", color: "white", background: "linear-gradient(135deg,#1565C0,#2979FF)", boxShadow: "0 4px 12px rgba(21,101,192,0.25)" } as const,
};

/** Per-enquiry intake form link — generate / copy / send / fill-on-behalf,
 * all bound to THIS enquiry so parallel enquiries stay correctly mapped. */
export function IntakeLinkCard({ enquiryId, clientId, refNumber }: { enquiryId: string; clientId: string; refNumber: string }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(false);

  const tokenQuery = (status: string, _orderCol: string) => ({
    queryKey: [`enq-intake-${status}`, enquiryId],
    queryFn: () => apiClient.get<any | null>("/intake-tokens", { enquiry_id: enquiryId, status }),
    enabled: !!enquiryId,
    refetchOnMount: "always" as const,
  });

  const { data: activeToken, refetch: refetchActive } = useQuery(tokenQuery("active", "created_at"));
  const { data: usedToken, refetch: refetchUsed } = useQuery(tokenQuery("used", "used_at"));
  const { data: expiredToken, refetch: refetchExpired } = useQuery(tokenQuery("expired", "created_at"));

  const timeExpired = activeToken ? new Date(activeToken.expires_at) < new Date() : false;
  const effectiveActive = activeToken && !timeExpired ? activeToken : null;
  const link = effectiveActive ? getIntakeUrl(effectiveActive.token) : null;

  const refreshAll = () => Promise.all([refetchActive(), refetchUsed(), refetchExpired()]);

  const generate = async () => {
    if (!user) return;
    setBusy(true);
    try {
      await createIntakeToken(clientId, user.id, enquiryId);
      toast.success("Intake form link generated for this enquiry");
      await refreshAll();
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  };

  const send = async () => {
    if (!effectiveActive) return;
    setSending(true);
    try {
      const r = await sendIntakeLink(clientId, effectiveActive.token, refNumber);
      if (r.emailSent || r.whatsappSent) toast.success("Intake link sent to the client.");
      else toast.warning("Could not send — share the link manually (check client email/WhatsApp).");
    } catch (e: any) { toast.error(e.message); }
    finally { setSending(false); }
  };

  const copy = () => { if (link) { navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 2000); } };

  const card: React.CSSProperties = { background: "white", borderRadius: "16px", padding: "20px 24px", border: "1px solid #E0E7EF", boxShadow: "0 2px 8px rgba(0,0,0,0.06)", marginBottom: "20px" };

  return (
    <div style={card}>
      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "4px" }}>
        <div style={{ width: "32px", height: "32px", borderRadius: "10px", background: "#EBF2FF", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Link2 style={{ width: "16px", height: "16px", color: "#1565C0" }} />
        </div>
        <span style={{ fontWeight: 700, fontSize: "16px", color: "#0A1929", fontFamily: "Sora, sans-serif" }}>
          Intake Form — {refNumber}
        </span>
      </div>

      {link ? (
        <div>
          <div style={{ background: "#F8FAFC", border: "1px solid #E0E7EF", borderRadius: "10px", padding: "10px 14px", fontFamily: "JetBrains Mono, monospace", fontSize: "12px", color: "#546E7A", wordBreak: "break-all", marginTop: "12px" }}>
            {link}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "12px", color: "#546E7A", marginTop: "8px" }}>
            <Clock style={{ width: "12px", height: "12px" }} /> Expires {formatDate(effectiveActive!.expires_at)}
          </div>
          <div style={{ display: "flex", gap: "8px", marginTop: "12px", flexWrap: "wrap" }}>
            <button onClick={copy} style={btn.base}>{copied ? <><Check className="w-3.5 h-3.5" /> Copied!</> : <><Copy className="w-3.5 h-3.5" /> Copy</>}</button>
            <button onClick={send} disabled={sending} style={btn.base}>{sending ? <><Send className="w-3.5 h-3.5 animate-pulse" /> Sending…</> : <><Send className="w-3.5 h-3.5" /> Send to Client</>}</button>
            <button onClick={generate} disabled={busy} style={btn.base}><RefreshCw className={busy ? "w-3.5 h-3.5 animate-spin" : "w-3.5 h-3.5"} /> Regenerate</button>
            <button onClick={() => navigate(`/intake?t=${effectiveActive!.token}`)} style={btn.primary}>Fill on Behalf</button>
          </div>
        </div>
      ) : usedToken ? (
        <div style={{ marginTop: "12px" }}>
          <div style={{ background: "#ECFDF5", border: "1px solid #A7F3D0", borderRadius: "10px", padding: "12px 14px", display: "flex", alignItems: "center", gap: "10px" }}>
            <CheckCircle2 style={{ width: "18px", height: "18px", color: "#15673A", flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: "13px", fontWeight: 600, color: "#15673A" }}>Intake Form Submitted</div>
              <div style={{ fontSize: "12px", color: "#546E7A", marginTop: "2px" }}>Submitted on {formatDate(usedToken.used_at!)} — link used and closed.</div>
            </div>
          </div>
          <button onClick={generate} disabled={busy} style={{ ...btn.primary, marginTop: "12px" }}>
            {busy ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Generating…</> : <><RefreshCw className="w-3.5 h-3.5" /> Generate New Link</>}
          </button>
        </div>
      ) : (expiredToken || timeExpired) ? (
        <div style={{ marginTop: "12px" }}>
          <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: "10px", padding: "12px 14px", display: "flex", alignItems: "center", gap: "10px" }}>
            <AlertTriangle style={{ width: "18px", height: "18px", color: "#B91C1C", flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: "13px", fontWeight: 600, color: "#B91C1C" }}>Intake Link Expired</div>
              <div style={{ fontSize: "12px", color: "#546E7A", marginTop: "2px" }}>The client did not fill the form in time. Generate a new one.</div>
            </div>
          </div>
          <button onClick={generate} disabled={busy} style={{ ...btn.primary, marginTop: "12px" }}>
            {busy ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Generating…</> : <><Send className="w-3.5 h-3.5" /> Generate New Link</>}
          </button>
        </div>
      ) : (
        <div style={{ marginTop: "12px" }}>
          <p style={{ fontSize: "13px", color: "#546E7A", marginBottom: "12px" }}>No intake link for this enquiry yet. Generate one to collect site details from the client.</p>
          <button onClick={generate} disabled={busy} style={btn.primary}>
            {busy ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Generating…</> : "Generate Intake Link"}
          </button>
        </div>
      )}
    </div>
  );
}
