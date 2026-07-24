import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/hooks/useAuth";
import { useSettings } from "@/hooks/useSettings";
import {
  Building2, CreditCard, Zap, User, Wifi,
  LogOut, MessageSquare, Mail, Users,
} from "lucide-react";
import {
  cardStyle, SettingsCardHeader, PremiumInput, Toggle,
  AutoRuleRow, InlineNumberConfig, TestButton,
} from "@/components/settings/SettingsComponents";
import { TeamManagement } from "@/components/settings/TeamManagement";
import { ROLE_LABELS, ROLE_COLORS, type UserRole } from "@/lib/permissions";

// ─── Setting keys for this page ──────────────────────────────────────────────

const BUNDLE_KEYS = [
  "company_name", "company_state", "gst_number", "company_pan", "company_address",
  "admin_email", "admin_whatsapp",
  "bank_account_name", "bank_name", "bank_account_number",
  "bank_account_type", "bank_ifsc", "bank_branch", "bank_upi",
] as const;

const AUTOMATION_KEYS = [
  "auto_followup_after_quote", "auto_followup_days",
  "auto_followup_no_response", "auto_followup_no_response_days",
  "auto_payment_reminder", "auto_payment_reminder_days",
  "weekly_summary_email", "weekly_summary_day",
  "auto_followup_digest", "followup_digest_recipients",
] as const;

const DEFAULTS: Record<string, string> = {
  company_name: "", company_state: "", gst_number: "", company_pan: "", company_address: "",
  admin_email: "", admin_whatsapp: "",
  bank_account_name: "", bank_name: "", bank_account_number: "",
  bank_account_type: "Current", bank_ifsc: "", bank_branch: "", bank_upi: "",
  auto_followup_after_quote: "true", auto_followup_days: "3",
  auto_followup_no_response: "true", auto_followup_no_response_days: "4",
  auto_payment_reminder: "false", auto_payment_reminder_days: "2",
  weekly_summary_email: "false", weekly_summary_day: "Monday",
  auto_followup_digest: "true", followup_digest_recipients: "",
};

// ─── Main component ───────────────────────────────────────────────────────────

export default function SettingsPage() {
  const navigate = useNavigate();
  const { user, profile, signOut } = useAuth();
  const { settings: s, set, loading, saving, hasChanges, saveAll, saveOne } = useSettings(
    BUNDLE_KEYS, DEFAULTS, AUTOMATION_KEYS,
  );
  const [signOutHover, setSignOutHover] = useState(false);

  const handleSignOut = async () => {
    await signOut();
    navigate("/login");
  };

  if (loading) {
    return (
      <div style={{ background: "#F0F4F8", minHeight: "100vh", padding: "24px" }}>
        <div
          style={{ background: "linear-gradient(135deg, #0A1929 0%, #1565C0 100%)", borderRadius: "20px", height: "96px", marginBottom: "24px" }}
          className="animate-pulse"
        />
        <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-5">
          <div>
            {[1, 2, 3].map((i) => (
              <div key={i} className="animate-pulse" style={{ background: "white", borderRadius: "16px", height: i === 3 ? "220px" : "280px", marginBottom: "20px" }} />
            ))}
          </div>
          <div>
            {[1, 2].map((i) => (
              <div key={i} className="animate-pulse" style={{ background: "white", borderRadius: "16px", height: i === 1 ? "180px" : "200px", marginBottom: "20px" }} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  const role = (profile?.role as UserRole) ?? "viewer";
  const roleStyle = ROLE_COLORS[role];

  return (
    <div className="p-3 sm:p-6" style={{ background: "#F0F4F8", minHeight: "100vh" }}>
      {/* ── Gradient Header ── */}
      <div
        className="flex flex-wrap items-center justify-between gap-4"
        style={{
          background: "linear-gradient(135deg, #0A1929 0%, #1565C0 100%)",
          borderRadius: "20px", padding: "24px", marginBottom: "24px",
          boxShadow: "0 8px 32px rgba(10,25,41,0.25)",
          position: "relative", overflow: "hidden",
        }}
      >
        <div style={{ position: "absolute", top: "-80px", right: "-80px", width: "300px", height: "300px", borderRadius: "50%", background: "rgba(255,255,255,0.04)", pointerEvents: "none", zIndex: 0 }} />
        <div style={{ position: "relative", zIndex: 1 }}>
          <h1 style={{ fontFamily: "Sora, sans-serif", fontWeight: 700, fontSize: "28px", color: "white", margin: 0 }}>
            Settings
          </h1>
          <p style={{ fontSize: "14px", color: "rgba(255,255,255,0.6)", marginTop: "4px", marginBottom: 0 }}>
            Configure your platform preferences
          </p>
        </div>
        <button
          onClick={saveAll}
          disabled={saving || !hasChanges}
          style={{
            position: "relative", zIndex: 1,
            background: "linear-gradient(135deg, #FF8F00, #FFB300)",
            color: "white", border: "none", borderRadius: "12px",
            padding: "12px 24px", fontWeight: 700, fontSize: "14px",
            cursor: hasChanges ? "pointer" : "default",
            opacity: hasChanges ? 1 : 0.7,
            transition: "opacity 200ms", fontFamily: "inherit",
          }}
        >
          {saving ? "Saving…" : "Save All Settings"}
        </button>
      </div>

      {/* ── Two-column layout ── */}
      <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-5">

        {/* ────── LEFT COLUMN ────── */}
        <div>

          {/* ── Company Information ── */}
          <div style={cardStyle}>
            <SettingsCardHeader Icon={Building2} iconBg="#EBF2FF" iconColor="#1565C0" title="Company Information" />
            <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: "16px" }}>
              <PremiumInput label="Company Name" value={s.company_name} onChange={set("company_name")} />
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <PremiumInput label="Registered State" value={s.company_state} onChange={set("company_state")} />
                <PremiumInput label="GST Number" value={s.gst_number} onChange={set("gst_number")} helper="Used for CGST+SGST vs IGST calculation" />
                <PremiumInput label="PAN Number" value={s.company_pan} onChange={set("company_pan")} placeholder="AAAAA0000A" />
              </div>
              <PremiumInput label="Company Address" value={s.company_address} onChange={set("company_address")} as="textarea" />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <PremiumInput label="Admin Email" value={s.admin_email} onChange={set("admin_email")} type="email" />
                <PremiumInput label="Admin WhatsApp" value={s.admin_whatsapp} onChange={set("admin_whatsapp")} placeholder="+91XXXXXXXXXX" />
              </div>
            </div>
          </div>

          {/* ── Bank Details ── */}
          <div style={cardStyle}>
            <SettingsCardHeader Icon={CreditCard} iconBg="#E0F2F1" iconColor="#00897B" title="Bank Details for Payments" />
            <p style={{ fontSize: "13px", color: "#546E7A", padding: "8px 24px 12px" }}>
              These details are auto-filled in advance payment requests sent to clients
            </p>
            <div style={{ padding: "0 24px 20px", display: "flex", flexDirection: "column", gap: "16px" }}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <PremiumInput label="Account Holder Name" value={s.bank_account_name} onChange={set("bank_account_name")} />
                <PremiumInput label="Bank Name" value={s.bank_name} onChange={set("bank_name")} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <PremiumInput label="Account Number" value={s.bank_account_number} onChange={set("bank_account_number")} font="mono" />
                <PremiumInput label="Account Type" value={s.bank_account_type} onChange={set("bank_account_type")} as="select">
                  <option value="Savings">Savings</option>
                  <option value="Current">Current</option>
                  <option value="OD">OD</option>
                </PremiumInput>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <PremiumInput label="IFSC Code" value={s.bank_ifsc} onChange={(v) => set("bank_ifsc")(v.toUpperCase())} font="mono" />
                <PremiumInput label="Branch Name" value={s.bank_branch} onChange={set("bank_branch")} />
              </div>
              <PremiumInput label="UPI ID" value={s.bank_upi} onChange={set("bank_upi")} placeholder="yourname@bankname" helper="Optional — for clients who prefer UPI payment" />

              <div style={{ background: "linear-gradient(135deg, #F0F4F8, #E8EEF5)", borderRadius: "10px", padding: "14px 16px", marginTop: "4px", border: "1px solid #E0E7EF" }}>
                <div style={{ fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.1em", color: "#546E7A", marginBottom: "8px" }}>
                  Payment Instructions Preview
                </div>
                <pre style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "13px", color: "#0A1929", lineHeight: 1.8, whiteSpace: "pre-wrap", margin: 0 }}>
{`Please transfer ₹[amount] to:
Account Name: ${s.bank_account_name || "—"}
Bank: ${s.bank_name || "—"}, ${s.bank_branch || "—"}
Account No: ${s.bank_account_number || "—"} (${s.bank_account_type || "—"})
IFSC: ${s.bank_ifsc || "—"}${s.bank_upi ? `\nUPI: ${s.bank_upi}` : ""}`}
                </pre>
              </div>
            </div>
          </div>

          {/* ── Automation Rules ── */}
          <div style={cardStyle}>
            <SettingsCardHeader Icon={Zap} iconBg="#FFF3E0" iconColor="#E65100" title="Automation Rules" />
            <p style={{ fontSize: "13px", color: "#546E7A", padding: "8px 24px 4px" }}>
              Configure automatic follow-up scheduling rules
            </p>
            <div style={{ padding: "4px 24px 8px" }}>
              <AutoRuleRow
                name="Auto-schedule follow-up after quote is sent"
                description="Automatically create a follow-up 3 days after a quotation is sent to the client"
                enabled={s.auto_followup_after_quote !== "false"}
                onToggle={(v) => saveOne("auto_followup_after_quote", v ? "true" : "false")}
                isLast={false}
              >
                {s.auto_followup_after_quote !== "false" && (
                  <InlineNumberConfig prefix="Follow up after" suffix="days" value={s.auto_followup_days || "3"} onChange={(v) => saveOne("auto_followup_days", v)} min={1} max={30} />
                )}
              </AutoRuleRow>

              <AutoRuleRow
                name="Re-schedule follow-up on no response"
                description="When a follow-up outcome is marked as 'No Response', automatically schedule the next one"
                enabled={s.auto_followup_no_response !== "false"}
                onToggle={(v) => saveOne("auto_followup_no_response", v ? "true" : "false")}
                isLast={false}
              >
                {s.auto_followup_no_response !== "false" && (
                  <InlineNumberConfig prefix="Schedule next follow-up after" suffix="days" value={s.auto_followup_no_response_days || "4"} onChange={(v) => saveOne("auto_followup_no_response_days", v)} min={1} max={30} />
                )}
              </AutoRuleRow>

              <AutoRuleRow
                name="Send payment reminder if unpaid after due date"
                description="Automatically send a WhatsApp reminder if advance payment is not received within the due date"
                enabled={s.auto_payment_reminder !== "false"}
                onToggle={(v) => saveOne("auto_payment_reminder", v ? "true" : "false")}
                isLast={false}
              >
                {s.auto_payment_reminder !== "false" && (
                  <InlineNumberConfig prefix="Send reminder" suffix="days after due date" value={s.auto_payment_reminder_days || "2"} onChange={(v) => saveOne("auto_payment_reminder_days", v)} min={1} max={30} />
                )}
              </AutoRuleRow>

              {/* Job Completion (always on) */}
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "16px", padding: "16px 0", borderBottom: "1px solid #F0F4F8" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: "14px", fontWeight: 600, color: "#0A1929" }}>Send job completion reminders to team</div>
                  <div style={{ fontSize: "13px", marginTop: "4px", color: "#546E7A" }}>Send 3-day, 2-day, and 1-day reminders before site completion, report delivery, and final bill dates</div>
                </div>
                <span style={{ background: "#E8F5E9", color: "#00897B", border: "1px solid #A5D6A7", padding: "4px 10px", borderRadius: "999px", fontSize: "13px", fontWeight: 600, flexShrink: 0, whiteSpace: "nowrap" }}>Active</span>
              </div>

              <AutoRuleRow
                name="Weekly pipeline summary email"
                description="Receive a weekly email every Monday morning with your pipeline overview and pending actions"
                enabled={s.weekly_summary_email !== "false"}
                onToggle={(v) => saveOne("weekly_summary_email", v ? "true" : "false")}
                isLast={false}
              >
                {s.weekly_summary_email !== "false" && (
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "10px" }}>
                    <span style={{ fontSize: "13px", color: "#546E7A" }}>Send every</span>
                    <select
                      value={s.weekly_summary_day || "Monday"}
                      onChange={(e) => saveOne("weekly_summary_day", e.target.value)}
                      style={{ padding: "4px 8px", border: "1.5px solid #E0E7EF", borderRadius: "8px", fontSize: "13px", color: "#0A1929", background: "#FAFBFC", outline: "none", cursor: "pointer" }}
                    >
                      {["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"].map((d) => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                    </select>
                  </div>
                )}
              </AutoRuleRow>

              <AutoRuleRow
                name="Daily follow-up digest email (11:00 AM)"
                description="One email every morning listing all follow-ups due today (and anything overdue) with client, company and contact details"
                enabled={s.auto_followup_digest !== "false"}
                onToggle={(v) => saveOne("auto_followup_digest", v ? "true" : "false")}
                isLast={true}
              >
                {s.auto_followup_digest !== "false" && (
                  <DigestRecipientPicker
                    value={s.followup_digest_recipients || ""}
                    onChange={(v) => saveOne("followup_digest_recipients", v)}
                    fallbackEmail={s.admin_email}
                  />
                )}
              </AutoRuleRow>
            </div>
          </div>

          {/* ── Team Management ── */}
          <TeamManagement />
        </div>

        {/* ────── RIGHT COLUMN ────── */}
        <div>

          {/* ── Account ── */}
          <div style={cardStyle}>
            <SettingsCardHeader Icon={User} iconBg="#EBF2FF" iconColor="#1565C0" title="Account" />
            <div style={{ padding: "20px 24px 24px", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
              <div style={{
                width: "56px", height: "56px", borderRadius: "16px",
                background: "linear-gradient(135deg, #1565C0 0%, #2979FF 100%)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontFamily: "Sora, sans-serif", fontWeight: 700, fontSize: "22px", color: "white",
              }}>
                {profile?.full_name?.[0]?.toUpperCase() ?? user?.email?.[0]?.toUpperCase() ?? "U"}
              </div>

              {profile?.full_name && (
                <p style={{ fontWeight: 700, fontSize: "15px", color: "#0A1929", marginTop: "12px", marginBottom: "2px" }}>
                  {profile.full_name}
                </p>
              )}
              <p style={{ fontWeight: profile?.full_name ? 400 : 600, fontSize: profile?.full_name ? "12px" : "14px", color: profile?.full_name ? "#546E7A" : "#0A1929", marginTop: profile?.full_name ? "0" : "12px", marginBottom: "4px" }}>
                {user?.email ?? "Unknown"}
              </p>

              <span style={{
                background: roleStyle.bg, color: roleStyle.color,
                border: `1px solid ${roleStyle.border}`,
                fontSize: "13px", padding: "4px 10px", borderRadius: "999px", fontWeight: 600,
              }}>
                {ROLE_LABELS[role]}
              </span>

              <div style={{ width: "100%", marginTop: "16px", borderTop: "1px solid #F0F4F8", paddingTop: "16px" }}>
                <button
                  onClick={handleSignOut}
                  onMouseEnter={() => setSignOutHover(true)}
                  onMouseLeave={() => setSignOutHover(false)}
                  style={{
                    width: "100%", padding: "10px",
                    background: signOutHover ? "#FEE2E2" : "#FEF2F2",
                    color: "#C62828", border: "1px solid #FECACA",
                    borderRadius: "10px", fontSize: "13px", fontWeight: 600,
                    cursor: "pointer", display: "flex", alignItems: "center",
                    justifyContent: "center", gap: "6px", transition: "background 150ms",
                  }}
                >
                  <LogOut style={{ width: "14px", height: "14px" }} /> Sign Out
                </button>
              </div>
            </div>
          </div>

          {/* ── Connections ── */}
          <div style={cardStyle}>
            <SettingsCardHeader Icon={Wifi} iconBg="#F3E8FF" iconColor="#6A1B9A" title="Connections" />
            <div style={{ padding: "12px 24px 20px" }}>
              {/* WhatsApp */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 0", borderBottom: "1px solid #F0F4F8" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <div style={{ width: "32px", height: "32px", borderRadius: "10px", background: "#E8F5E9", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <MessageSquare style={{ width: "16px", height: "16px", color: "#00897B" }} />
                  </div>
                  <div>
                    <div style={{ fontSize: "14px", fontWeight: 600, color: "#0A1929" }}>WhatsApp</div>
                    <div style={{ fontSize: "13px", color: "#546E7A" }}>Client messaging</div>
                  </div>
                </div>
                <span style={{ background: "#FFF3E0", color: "#E65100", border: "1px solid #FFCC02", fontSize: "13px", fontWeight: 600, padding: "4px 10px", borderRadius: "999px", whiteSpace: "nowrap" }}>Pending Approval</span>
              </div>

              {/* Email */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 0" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <div style={{ width: "32px", height: "32px", borderRadius: "10px", background: "#EBF2FF", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Mail style={{ width: "16px", height: "16px", color: "#1565C0" }} />
                  </div>
                  <div>
                    <div style={{ fontSize: "14px", fontWeight: 600, color: "#0A1929" }}>Email</div>
                    <div style={{ fontSize: "13px", color: "#546E7A" }}>Quotations & notifications</div>
                  </div>
                </div>
                <span style={{ background: "#E8F5E9", color: "#00897B", border: "1px solid #A5D6A7", fontSize: "13px", fontWeight: 600, padding: "4px 10px", borderRadius: "999px", whiteSpace: "nowrap" }}>Connected</span>
              </div>

              <div style={{ borderTop: "1px solid #F0F4F8", paddingTop: "12px", display: "flex", gap: "8px" }}>
                <TestButton
                  label="Test Email"
                  onClick={async () => {
                    const email = s.admin_email;
                    if (!email) { (await import("sonner")).toast.error("Set Admin Email first"); return; }
                    const { toast } = await import("sonner");
                    toast.loading("Sending test email…", { id: "test-email" });
                    try {
                      await apiClient.post("/integrations/email", {
                        to: email,
                        subject: "QMS — Test Email",
                        html_body: '<div style="font-family:Arial,sans-serif;padding:32px;text-align:center;"><h2 style="color:#0F2A47;">Email is working!</h2><p style="color:#546E7A;">This is a test email from QMS.</p></div>',
                      });
                      toast.dismiss("test-email");
                      toast.success(`Test email sent to ${email}`);
                    } catch (e) {
                      toast.dismiss("test-email");
                      toast.error("Test email failed: " + (e as Error).message);
                    }
                  }}
                />
                <TestButton
                  label="Test WhatsApp"
                  onClick={async () => {
                    const phone = s.admin_whatsapp;
                    if (!phone) { (await import("sonner")).toast.error("Set Admin WhatsApp first"); return; }
                    const { toast } = await import("sonner");
                    toast.loading("Sending test WhatsApp…", { id: "test-wa" });
                    try {
                      const data = await apiClient.post<{ whatsapp_invalid?: boolean }>("/integrations/whatsapp", {
                        phone_number: phone, template_name: "qms_test_message", parameters: [{ name: "1", value: "QMS" }],
                      });
                      toast.dismiss("test-wa");
                      if (data?.whatsapp_invalid) toast.error("WhatsApp number is invalid");
                      else toast.success(`Test WhatsApp sent to ${phone}`);
                    } catch (e) {
                      toast.dismiss("test-wa");
                      toast.error("Test WhatsApp failed: " + (e as Error).message);
                    }
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Chooses which staff receive the daily follow-up digest. Stores a
 * comma-separated list of email addresses (what the cron job sends to), so a
 * recipient keeps working even if their profile is later deactivated.
 */
function DigestRecipientPicker({
  value,
  onChange,
  fallbackEmail,
}: {
  value: string;
  onChange: (v: string) => void;
  fallbackEmail?: string;
}) {
  const { data: staff = [], isLoading } = useQuery({
    queryKey: ["digest-staff"],
    queryFn: () =>
      apiClient.get<Array<{ id: string; full_name: string | null; email: string; role: string; is_active: boolean }>>(
        "/profiles",
        { is_active: true },
      ),
  });

  const selected = value.split(",").map((e) => e.trim()).filter(Boolean);
  const toggle = (email: string) => {
    const next = selected.includes(email) ? selected.filter((e) => e !== email) : [...selected, email];
    onChange(next.join(","));
  };

  return (
    <div style={{ marginTop: "10px" }}>
      <div style={{ fontSize: "13px", color: "#546E7A", marginBottom: "8px" }}>
        Send to {selected.length > 0 ? `${selected.length} selected` : "— nobody selected"}
        {selected.length === 0 && fallbackEmail ? ` (will fall back to Admin Email: ${fallbackEmail})` : ""}
      </div>
      {isLoading ? (
        <div style={{ fontSize: "13px", color: "#94A3B8" }}>Loading staff…</div>
      ) : staff.length === 0 ? (
        <div style={{ fontSize: "13px", color: "#94A3B8" }}>No active staff found.</div>
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
          {staff.map((p) => {
            const isOn = selected.includes(p.email);
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => toggle(p.email)}
                style={{
                  display: "flex", alignItems: "center", gap: "6px",
                  padding: "6px 12px", borderRadius: "999px", fontSize: "13px", fontWeight: 500,
                  cursor: "pointer",
                  border: isOn ? "1.5px solid #1565C0" : "1.5px solid #E0E7EF",
                  background: isOn ? "#EBF2FF" : "#FFFFFF",
                  color: isOn ? "#1565C0" : "#546E7A",
                }}
                title={p.email}
              >
                <span
                  style={{
                    width: 14, height: 14, borderRadius: 4, flexShrink: 0,
                    border: isOn ? "none" : "1.5px solid #CBD5E1",
                    background: isOn ? "#1565C0" : "transparent",
                    color: "white", fontSize: 10, lineHeight: "14px", textAlign: "center",
                  }}
                >
                  {isOn ? "✓" : ""}
                </span>
                {p.full_name || p.email.split("@")[0]}
                <span style={{ color: "#94A3B8", fontSize: 12 }}>{ROLE_LABELS[p.role as UserRole] ?? p.role}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
