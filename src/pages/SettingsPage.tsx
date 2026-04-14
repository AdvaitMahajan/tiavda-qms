import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import {
  Building2, CreditCard, Zap, User, Wifi,
  LogOut, MessageSquare, Mail,
} from "lucide-react";

// ─── Style constants ────────────────────────────────────────────────────────

const cardStyle = {
  background: "white",
  borderRadius: "16px",
  border: "1px solid #E0E7EF",
  boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
  overflow: "hidden",
  marginBottom: "20px",
} as const;

const cardHeaderStyle = {
  padding: "16px 24px",
  borderBottom: "1px solid #F0F4F8",
  background: "linear-gradient(135deg, #F8FAFC, #F0F4F8)",
  display: "flex",
  alignItems: "center",
  gap: "10px",
} as const;

const labelStyle = {
  display: "block",
  fontSize: "11px",
  fontWeight: 600,
  color: "#546E7A",
  textTransform: "uppercase" as const,
  letterSpacing: "0.06em",
  marginBottom: "6px",
} as const;

const baseInputStyle = {
  width: "100%",
  padding: "10px 14px",
  border: "1.5px solid #E0E7EF",
  borderRadius: "10px",
  fontSize: "14px",
  color: "#0A1929",
  background: "#FAFBFC",
  transition: "all 150ms",
  outline: "none",
} as const;

// ─── Sub-components ──────────────────────────────────────────────────────────

function CardHeader({
  iconBg,
  iconColor,
  Icon,
  title,
}: {
  iconBg: string;
  iconColor: string;
  Icon: React.ElementType;
  title: string;
}) {
  return (
    <div style={cardHeaderStyle}>
      <div
        style={{
          width: "28px",
          height: "28px",
          borderRadius: "8px",
          background: iconBg,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Icon style={{ width: "14px", height: "14px", color: iconColor }} />
      </div>
      <span style={{ fontWeight: 600, fontSize: "14px", color: "#0A1929" }}>{title}</span>
    </div>
  );
}

function PremiumInput({
  label,
  value,
  onChange,
  placeholder,
  helper,
  type = "text",
  as: inputAs = "input",
  children,
  font,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  helper?: string;
  type?: string;
  as?: "input" | "textarea" | "select";
  children?: React.ReactNode;
  font?: "mono";
}) {
  const [focused, setFocused] = useState(false);

  const dynamicStyle = {
    ...baseInputStyle,
    border: focused ? "1.5px solid #1565C0" : "1.5px solid #E0E7EF",
    boxShadow: focused ? "0 0 0 3px rgba(21,101,192,0.1)" : "none",
    background: focused ? "white" : "#FAFBFC",
    fontFamily: font === "mono" ? "JetBrains Mono, monospace" : undefined,
  };

  return (
    <div>
      <label style={labelStyle}>{label}</label>
      {inputAs === "textarea" ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={2}
          style={{ ...dynamicStyle, resize: "none" as const }}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
        />
      ) : inputAs === "select" ? (
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={dynamicStyle}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
        >
          {children}
        </select>
      ) : (
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          style={dynamicStyle}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
        />
      )}
      {helper && (
        <p style={{ fontSize: "11px", color: "#546E7A", marginTop: "4px" }}>{helper}</p>
      )}
    </div>
  );
}

function Toggle({
  enabled,
  onChange,
}: {
  enabled: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!enabled)}
      style={{
        width: "44px",
        height: "24px",
        borderRadius: "12px",
        background: enabled ? "linear-gradient(135deg,#1565C0,#2979FF)" : "#CBD5E1",
        border: "none",
        cursor: "pointer",
        position: "relative",
        transition: "background 200ms",
        flexShrink: 0,
      }}
    >
      <div
        style={{
          position: "absolute",
          top: "2px",
          left: enabled ? "22px" : "2px",
          width: "20px",
          height: "20px",
          borderRadius: "50%",
          background: "white",
          boxShadow: "0 2px 4px rgba(0,0,0,0.2)",
          transition: "left 200ms",
        }}
      />
    </button>
  );
}

// ─── All setting keys ────────────────────────────────────────────────────────

const BUNDLE_SAVE_KEYS = [
  "company_name",
  "company_state",
  "gst_number",
  "company_address",
  "admin_email",
  "admin_whatsapp",
  "bank_account_name",
  "bank_name",
  "bank_account_number",
  "bank_account_type",
  "bank_ifsc",
  "bank_branch",
  "bank_upi",
] as const;

const AUTOMATION_KEYS = [
  "auto_followup_after_quote",
  "auto_followup_days",
  "auto_followup_no_response",
  "auto_followup_no_response_days",
  "auto_payment_reminder",
  "auto_payment_reminder_days",
  "weekly_summary_email",
  "weekly_summary_day",
] as const;

type SettingsMap = Record<string, string>;

const DEFAULTS: SettingsMap = {
  company_name: "",
  company_state: "",
  gst_number: "",
  company_address: "",
  admin_email: "",
  admin_whatsapp: "",
  bank_account_name: "",
  bank_name: "",
  bank_account_number: "",
  bank_account_type: "Current",
  bank_ifsc: "",
  bank_branch: "",
  bank_upi: "",
  auto_followup_after_quote: "true",
  auto_followup_days: "3",
  auto_followup_no_response: "true",
  auto_followup_no_response_days: "4",
  auto_payment_reminder: "false",
  auto_payment_reminder_days: "2",
  weekly_summary_email: "false",
  weekly_summary_day: "Monday",
};

// ─── Main component ───────────────────────────────────────────────────────────

export default function SettingsPage() {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<SettingsMap>({ ...DEFAULTS });
  const [pristine, setPristine] = useState<SettingsMap>({ ...DEFAULTS });
  const [signOutHover, setSignOutHover] = useState(false);

  const hasChanges =
    JSON.stringify(
      BUNDLE_SAVE_KEYS.reduce<SettingsMap>((acc, k) => { acc[k] = settings[k] ?? ""; return acc; }, {})
    ) !==
    JSON.stringify(
      BUNDLE_SAVE_KEYS.reduce<SettingsMap>((acc, k) => { acc[k] = pristine[k] ?? ""; return acc; }, {})
    );

  // Load all settings on mount
  useEffect(() => {
    (async () => {
      const allKeys = [...BUNDLE_SAVE_KEYS, ...AUTOMATION_KEYS];
      const { data } = await supabase
        .from("app_settings")
        .select("key,value")
        .in("key", allKeys);
      const map: SettingsMap = { ...DEFAULTS };
      data?.forEach((row) => { map[row.key] = row.value ?? ""; });
      setSettings(map);
      setPristine({ ...map });
      setLoading(false);
    })();
  }, []);

  const set = (key: string) => (value: string) =>
    setSettings((prev) => ({ ...prev, [key]: value }));

  // Save all bundled company+bank settings
  const handleSaveAll = async () => {
    setSaving(true);
    for (const key of BUNDLE_SAVE_KEYS) {
      const { error } = await supabase
        .from("app_settings")
        .upsert(
          { key, value: settings[key] ?? "", updated_at: new Date().toISOString() },
          { onConflict: "key" }
        );
      if (error) {
        toast.error(`Failed to save ${key}: ${error.message}`);
        setSaving(false);
        return;
      }
    }
    setPristine({ ...settings });
    toast.success("Settings saved successfully");
    setSaving(false);
  };

  // Save a single automation toggle/value instantly
  const saveAutomationKey = async (key: string, value: string) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
    const { error } = await supabase
      .from("app_settings")
      .upsert(
        { key, value, updated_at: new Date().toISOString() },
        { onConflict: "key" }
      );
    if (error) toast.error(`Failed to update rule: ${error.message}`);
  };

  const handleSignOut = async () => {
    await signOut();
    navigate("/login");
  };

  if (loading) {
    return (
      <div style={{ background: "#F0F4F8", minHeight: "100vh", padding: "24px" }}>
        <div
          style={{
            background: "linear-gradient(135deg, #0A1929 0%, #1565C0 100%)",
            borderRadius: "20px",
            height: "96px",
            marginBottom: "24px",
          }}
          className="animate-pulse"
        />
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "20px" }}>
          <div>
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="animate-pulse"
                style={{
                  background: "white",
                  borderRadius: "16px",
                  height: i === 3 ? "220px" : "280px",
                  marginBottom: "20px",
                }}
              />
            ))}
          </div>
          <div>
            {[1, 2].map((i) => (
              <div
                key={i}
                className="animate-pulse"
                style={{
                  background: "white",
                  borderRadius: "16px",
                  height: i === 1 ? "180px" : "200px",
                  marginBottom: "20px",
                }}
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  const s = settings;

  return (
    <div style={{ background: "#F0F4F8", minHeight: "100vh", padding: "24px" }}>
      {/* ── Gradient Header ── */}
      <div
        style={{
          background: "linear-gradient(135deg, #0A1929 0%, #1565C0 100%)",
          borderRadius: "20px",
          padding: "28px 32px",
          marginBottom: "24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          boxShadow: "0 8px 32px rgba(10,25,41,0.25)",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Decorative circle */}
        <div
          style={{
            position: "absolute",
            top: "-80px",
            right: "-80px",
            width: "300px",
            height: "300px",
            borderRadius: "50%",
            background: "rgba(255,255,255,0.04)",
            pointerEvents: "none",
            zIndex: 0,
          }}
        />

        {/* Left: title */}
        <div style={{ position: "relative", zIndex: 1 }}>
          <h1
            style={{
              fontFamily: "Sora, sans-serif",
              fontWeight: 700,
              fontSize: "28px",
              color: "white",
              margin: 0,
            }}
          >
            Settings
          </h1>
          <p
            style={{
              fontSize: "14px",
              color: "rgba(255,255,255,0.6)",
              marginTop: "4px",
              marginBottom: 0,
            }}
          >
            Configure your platform preferences
          </p>
        </div>

        {/* Right: Save All button */}
        <button
          onClick={handleSaveAll}
          disabled={saving || !hasChanges}
          className={hasChanges ? "save-pending" : ""}
          style={{
            position: "relative",
            zIndex: 1,
            background: "linear-gradient(135deg, #FF8F00, #FFB300)",
            color: "white",
            border: "none",
            borderRadius: "12px",
            padding: "12px 24px",
            fontWeight: 700,
            fontSize: "14px",
            cursor: hasChanges ? "pointer" : "default",
            opacity: hasChanges ? 1 : 0.7,
            transition: "opacity 200ms",
            fontFamily: "inherit",
          }}
        >
          {saving ? "Saving…" : "Save All Settings"}
        </button>
      </div>

      {/* ── Two-column layout ── */}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "20px" }}>

        {/* ────── LEFT COLUMN ────── */}
        <div>

          {/* ── Section 1: Company Settings ── */}
          <div style={cardStyle}>
            <CardHeader
              Icon={Building2}
              iconBg="#EBF2FF"
              iconColor="#1565C0"
              title="Company Information"
            />
            <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: "16px" }}>
              {/* Row 1 */}
              <PremiumInput
                label="Company Name"
                value={s.company_name}
                onChange={set("company_name")}
              />

              {/* Row 2 */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                <PremiumInput
                  label="Registered State"
                  value={s.company_state}
                  onChange={set("company_state")}
                />
                <PremiumInput
                  label="GST Number"
                  value={s.gst_number}
                  onChange={set("gst_number")}
                  helper="Used for CGST+SGST vs IGST calculation"
                />
              </div>

              {/* Row 3 */}
              <PremiumInput
                label="Company Address"
                value={s.company_address}
                onChange={set("company_address")}
                as="textarea"
              />

              {/* Row 4 */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                <PremiumInput
                  label="Admin Email"
                  value={s.admin_email}
                  onChange={set("admin_email")}
                  type="email"
                />
                <PremiumInput
                  label="Admin WhatsApp"
                  value={s.admin_whatsapp}
                  onChange={set("admin_whatsapp")}
                  placeholder="+91XXXXXXXXXX"
                />
              </div>
            </div>
          </div>

          {/* ── Section 2: Bank Details ── */}
          <div style={cardStyle}>
            <CardHeader
              Icon={CreditCard}
              iconBg="#E0F2F1"
              iconColor="#00897B"
              title="Bank Details for Payments"
            />
            <p style={{ fontSize: "12px", color: "#546E7A", padding: "8px 24px 12px" }}>
              These details are auto-filled in advance payment requests sent to clients
            </p>
            <div style={{ padding: "0 24px 20px", display: "flex", flexDirection: "column", gap: "16px" }}>
              {/* Row 1 */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                <PremiumInput
                  label="Account Holder Name"
                  value={s.bank_account_name}
                  onChange={set("bank_account_name")}
                />
                <PremiumInput
                  label="Bank Name"
                  value={s.bank_name}
                  onChange={set("bank_name")}
                />
              </div>

              {/* Row 2 */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                <PremiumInput
                  label="Account Number"
                  value={s.bank_account_number}
                  onChange={set("bank_account_number")}
                  font="mono"
                />
                <PremiumInput
                  label="Account Type"
                  value={s.bank_account_type}
                  onChange={set("bank_account_type")}
                  as="select"
                >
                  <option value="Savings">Savings</option>
                  <option value="Current">Current</option>
                  <option value="OD">OD</option>
                </PremiumInput>
              </div>

              {/* Row 3 */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                <PremiumInput
                  label="IFSC Code"
                  value={s.bank_ifsc}
                  onChange={(v) => set("bank_ifsc")(v.toUpperCase())}
                  font="mono"
                />
                <PremiumInput
                  label="Branch Name"
                  value={s.bank_branch}
                  onChange={set("bank_branch")}
                />
              </div>

              {/* Row 4 */}
              <PremiumInput
                label="UPI ID"
                value={s.bank_upi}
                onChange={set("bank_upi")}
                placeholder="yourname@bankname"
                helper="Optional — for clients who prefer UPI payment"
              />

              {/* Preview block */}
              <div
                style={{
                  background: "linear-gradient(135deg, #F0F4F8, #E8EEF5)",
                  borderRadius: "10px",
                  padding: "14px 16px",
                  marginTop: "4px",
                  border: "1px solid #E0E7EF",
                }}
              >
                <div
                  style={{
                    fontSize: "10px",
                    textTransform: "uppercase",
                    letterSpacing: "0.1em",
                    color: "#546E7A",
                    marginBottom: "8px",
                  }}
                >
                  Payment Instructions Preview
                </div>
                <pre
                  style={{
                    fontFamily: "JetBrains Mono, monospace",
                    fontSize: "12px",
                    color: "#0A1929",
                    lineHeight: 1.8,
                    whiteSpace: "pre-wrap",
                    margin: 0,
                  }}
                >{`Please transfer ₹[amount] to:
Account Name: ${s.bank_account_name || "—"}
Bank: ${s.bank_name || "—"}, ${s.bank_branch || "—"}
Account No: ${s.bank_account_number || "—"} (${s.bank_account_type || "—"})
IFSC: ${s.bank_ifsc || "—"}${s.bank_upi ? `\nUPI: ${s.bank_upi}` : ""}`}</pre>
              </div>
            </div>
          </div>

          {/* ── Section 3: Automation Rules ── */}
          <div style={cardStyle}>
            <CardHeader
              Icon={Zap}
              iconBg="#FFF3E0"
              iconColor="#E65100"
              title="Automation Rules"
            />
            <p style={{ fontSize: "12px", color: "#546E7A", padding: "8px 24px 4px" }}>
              Configure automatic follow-up scheduling rules
            </p>
            <div style={{ padding: "4px 24px 8px" }}>

              {/* Rule 1 — auto_followup_after_quote */}
              <AutoRuleRow
                name="Auto-schedule follow-up after quote is sent"
                description="Automatically create a follow-up 3 days after a quotation is sent to the client"
                enabled={s.auto_followup_after_quote !== "false"}
                onToggle={(v) => saveAutomationKey("auto_followup_after_quote", v ? "true" : "false")}
                isLast={false}
              >
                {s.auto_followup_after_quote !== "false" && (
                  <InlineNumberConfig
                    prefix="Follow up after"
                    suffix="days"
                    value={s.auto_followup_days || "3"}
                    onChange={(v) => saveAutomationKey("auto_followup_days", v)}
                    min={1}
                    max={30}
                  />
                )}
              </AutoRuleRow>

              {/* Rule 2 — auto_followup_no_response */}
              <AutoRuleRow
                name="Re-schedule follow-up on no response"
                description="When a follow-up outcome is marked as 'No Response', automatically schedule the next one"
                enabled={s.auto_followup_no_response !== "false"}
                onToggle={(v) => saveAutomationKey("auto_followup_no_response", v ? "true" : "false")}
                isLast={false}
              >
                {s.auto_followup_no_response !== "false" && (
                  <InlineNumberConfig
                    prefix="Schedule next follow-up after"
                    suffix="days"
                    value={s.auto_followup_no_response_days || "4"}
                    onChange={(v) => saveAutomationKey("auto_followup_no_response_days", v)}
                    min={1}
                    max={30}
                  />
                )}
              </AutoRuleRow>

              {/* Rule 3 — auto_payment_reminder */}
              <AutoRuleRow
                name="Send payment reminder if unpaid after due date"
                description="Automatically send a WhatsApp reminder if advance payment is not received within the due date"
                enabled={s.auto_payment_reminder !== "false"}
                onToggle={(v) => saveAutomationKey("auto_payment_reminder", v ? "true" : "false")}
                isLast={false}
              >
                {s.auto_payment_reminder !== "false" && (
                  <InlineNumberConfig
                    prefix="Send reminder"
                    suffix="days after due date"
                    value={s.auto_payment_reminder_days || "2"}
                    onChange={(v) => saveAutomationKey("auto_payment_reminder_days", v)}
                    min={1}
                    max={30}
                  />
                )}
              </AutoRuleRow>

              {/* Rule 4 — Job Completion (no toggle) */}
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                  gap: "16px",
                  padding: "16px 0",
                  borderBottom: "1px solid #F0F4F8",
                }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: "14px", fontWeight: 600, color: "#0A1929" }}>
                    Send job completion reminders to team
                  </div>
                  <div style={{ fontSize: "12px", marginTop: "4px", color: "#546E7A" }}>
                    Send 3-day, 2-day, and 1-day reminders before site completion, report delivery, and final bill dates
                  </div>
                </div>
                <span
                  style={{
                    background: "#E8F5E9",
                    color: "#00897B",
                    border: "1px solid #A5D6A7",
                    padding: "4px 10px",
                    borderRadius: "999px",
                    fontSize: "12px",
                    fontWeight: 600,
                    flexShrink: 0,
                    whiteSpace: "nowrap",
                  }}
                >
                  Active
                </span>
              </div>

              {/* Rule 5 — weekly_summary_email */}
              <AutoRuleRow
                name="Weekly pipeline summary email"
                description="Receive a weekly email every Monday morning with your pipeline overview and pending actions"
                enabled={s.weekly_summary_email !== "false"}
                onToggle={(v) => saveAutomationKey("weekly_summary_email", v ? "true" : "false")}
                isLast={true}
              >
                {s.weekly_summary_email !== "false" && (
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "10px" }}>
                    <span style={{ fontSize: "12px", color: "#546E7A" }}>Send every</span>
                    <select
                      value={s.weekly_summary_day || "Monday"}
                      onChange={(e) => saveAutomationKey("weekly_summary_day", e.target.value)}
                      style={{
                        padding: "4px 8px",
                        border: "1.5px solid #E0E7EF",
                        borderRadius: "8px",
                        fontSize: "13px",
                        color: "#0A1929",
                        background: "#FAFBFC",
                        outline: "none",
                        cursor: "pointer",
                      }}
                    >
                      {["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"].map((d) => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                    </select>
                  </div>
                )}
              </AutoRuleRow>
            </div>
          </div>
        </div>

        {/* ────── RIGHT COLUMN ────── */}
        <div>

          {/* ── Section 4: Account ── */}
          <div style={cardStyle}>
            <CardHeader
              Icon={User}
              iconBg="#EBF2FF"
              iconColor="#1565C0"
              title="Account"
            />
            <div
              style={{
                padding: "20px 24px 24px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                textAlign: "center",
              }}
            >
              {/* Avatar */}
              <div
                style={{
                  width: "56px",
                  height: "56px",
                  borderRadius: "16px",
                  background: "linear-gradient(135deg, #1565C0 0%, #2979FF 100%)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontFamily: "Sora, sans-serif",
                  fontWeight: 700,
                  fontSize: "22px",
                  color: "white",
                }}
              >
                {user?.email ? user.email[0].toUpperCase() : "U"}
              </div>

              <p style={{ fontWeight: 600, fontSize: "14px", color: "#0A1929", marginTop: "12px", marginBottom: "4px" }}>
                {user?.email ?? "Unknown"}
              </p>

              <span
                style={{
                  background: "#EBF2FF",
                  color: "#1565C0",
                  fontSize: "12px",
                  padding: "4px 10px",
                  borderRadius: "999px",
                  fontWeight: 600,
                }}
              >
                Administrator
              </span>

              <div
                style={{
                  width: "100%",
                  marginTop: "16px",
                  borderTop: "1px solid #F0F4F8",
                  paddingTop: "16px",
                }}
              >
                <button
                  onClick={handleSignOut}
                  onMouseEnter={() => setSignOutHover(true)}
                  onMouseLeave={() => setSignOutHover(false)}
                  style={{
                    width: "100%",
                    padding: "10px",
                    background: signOutHover ? "#FEE2E2" : "#FEF2F2",
                    color: "#C62828",
                    border: "1px solid #FECACA",
                    borderRadius: "10px",
                    fontSize: "13px",
                    fontWeight: 600,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "6px",
                    transition: "background 150ms",
                  }}
                >
                  <LogOut style={{ width: "14px", height: "14px" }} />
                  Sign Out
                </button>
              </div>
            </div>
          </div>

          {/* ── Section 5: Connections ── */}
          <div style={cardStyle}>
            <CardHeader
              Icon={Wifi}
              iconBg="#F3E8FF"
              iconColor="#6A1B9A"
              title="Connections"
            />
            <div style={{ padding: "12px 24px 20px" }}>
              {/* WhatsApp row */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "12px 0",
                  borderBottom: "1px solid #F0F4F8",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <div
                    style={{
                      width: "32px",
                      height: "32px",
                      borderRadius: "10px",
                      background: "#E8F5E9",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <MessageSquare style={{ width: "16px", height: "16px", color: "#00897B" }} />
                  </div>
                  <div>
                    <div style={{ fontSize: "14px", fontWeight: 600, color: "#0A1929" }}>WhatsApp</div>
                    <div style={{ fontSize: "12px", color: "#546E7A" }}>Client messaging</div>
                  </div>
                </div>
                <span
                  style={{
                    background: "#FFF3E0",
                    color: "#E65100",
                    border: "1px solid #FFCC02",
                    fontSize: "12px",
                    fontWeight: 600,
                    padding: "4px 10px",
                    borderRadius: "999px",
                    whiteSpace: "nowrap",
                  }}
                >
                  Pending Approval
                </span>
              </div>

              {/* Email row */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "12px 0",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <div
                    style={{
                      width: "32px",
                      height: "32px",
                      borderRadius: "10px",
                      background: "#EBF2FF",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Mail style={{ width: "16px", height: "16px", color: "#1565C0" }} />
                  </div>
                  <div>
                    <div style={{ fontSize: "14px", fontWeight: 600, color: "#0A1929" }}>Email</div>
                    <div style={{ fontSize: "12px", color: "#546E7A" }}>Quotations & notifications</div>
                  </div>
                </div>
                <span
                  style={{
                    background: "#E8F5E9",
                    color: "#00897B",
                    border: "1px solid #A5D6A7",
                    fontSize: "12px",
                    fontWeight: 600,
                    padding: "4px 10px",
                    borderRadius: "999px",
                    whiteSpace: "nowrap",
                  }}
                >
                  Connected
                </span>
              </div>

              {/* Divider + test buttons */}
              <div style={{ borderTop: "1px solid #F0F4F8", paddingTop: "12px", display: "flex", gap: "8px" }}>
                <TestButton
                  label="Test Email"
                  onClick={() => toast.info("Test email — feature coming soon")}
                />
                <TestButton
                  label="Test WhatsApp"
                  onClick={() => toast.info("Test WhatsApp — feature coming soon")}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Helper sub-components ────────────────────────────────────────────────────

function AutoRuleRow({
  name,
  description,
  enabled,
  onToggle,
  isLast,
  children,
}: {
  name: string;
  description: string;
  enabled: boolean;
  onToggle: (v: boolean) => void;
  isLast: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: "16px",
        padding: "16px 0",
        borderBottom: isLast ? "none" : "1px solid #F0F4F8",
      }}
    >
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: "14px", fontWeight: 600, color: "#0A1929" }}>{name}</div>
        <div style={{ fontSize: "12px", marginTop: "4px", color: "#546E7A" }}>{description}</div>
        {children}
      </div>
      <Toggle enabled={enabled} onChange={onToggle} />
    </div>
  );
}

function InlineNumberConfig({
  prefix,
  suffix,
  value,
  onChange,
  min,
  max,
}: {
  prefix: string;
  suffix: string;
  value: string;
  onChange: (v: string) => void;
  min: number;
  max: number;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "10px" }}>
      <span style={{ fontSize: "12px", color: "#546E7A" }}>{prefix}</span>
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: "60px",
          padding: "4px 8px",
          border: "1.5px solid #E0E7EF",
          borderRadius: "8px",
          fontSize: "13px",
          color: "#0A1929",
          background: "#FAFBFC",
          outline: "none",
          textAlign: "center",
        }}
      />
      <span style={{ fontSize: "12px", color: "#546E7A" }}>{suffix}</span>
    </div>
  );
}

function TestButton({ label, onClick }: { label: string; onClick: () => void }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        padding: "8px 12px",
        background: hover ? "#E3EAF2" : "#F0F4F8",
        color: "#0A1929",
        border: "1px solid #E0E7EF",
        borderRadius: "8px",
        fontSize: "12px",
        fontWeight: 600,
        cursor: "pointer",
        transition: "background 150ms",
      }}
    >
      {label}
    </button>
  );
}
