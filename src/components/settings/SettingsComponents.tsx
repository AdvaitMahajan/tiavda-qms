import { useState, type ReactNode } from "react";

// ─── Style constants ────────────────────────────────────────────────────────

export const cardStyle = {
  background: "white",
  borderRadius: "16px",
  border: "1px solid #E0E7EF",
  boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
  overflow: "hidden",
  marginBottom: "20px",
} as const;

export const cardHeaderStyle = {
  padding: "18px 24px",
  borderBottom: "1px solid #EEF2F7",
  background: "linear-gradient(135deg, #F8FAFC, #F0F4F8)",
  display: "flex",
  alignItems: "center",
  gap: "12px",
} as const;

export const labelStyle = {
  display: "block",
  fontSize: "12px",
  fontWeight: 600,
  color: "#546E7A",
  textTransform: "uppercase" as const,
  letterSpacing: "0.06em",
  marginBottom: "6px",
} as const;

const baseInputStyle = {
  width: "100%",
  padding: "11px 14px",
  border: "1.5px solid #E0E7EF",
  borderRadius: "10px",
  fontSize: "14.5px",
  color: "#0A1929",
  background: "#FAFBFC",
  transition: "all 150ms",
  outline: "none",
} as const;

// ─── Sub-components ──────────────────────────────────────────────────────────

export function SettingsCardHeader({
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
          width: "34px",
          height: "34px",
          borderRadius: "10px",
          background: iconBg,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <Icon style={{ width: "17px", height: "17px", color: iconColor }} />
      </div>
      <span style={{ fontFamily: "Sora, sans-serif", fontWeight: 700, fontSize: "16px", color: "#0A1929" }}>{title}</span>
    </div>
  );
}

export function PremiumInput({
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
  children?: ReactNode;
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
        <p style={{ fontSize: "12px", color: "#546E7A", marginTop: "4px" }}>{helper}</p>
      )}
    </div>
  );
}

export function Toggle({
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

export function AutoRuleRow({
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
  children?: ReactNode;
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
        <div style={{ fontSize: "13px", marginTop: "4px", color: "#546E7A" }}>{description}</div>
        {children}
      </div>
      <Toggle enabled={enabled} onChange={onToggle} />
    </div>
  );
}

export function InlineNumberConfig({
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
      <span style={{ fontSize: "13px", color: "#546E7A" }}>{prefix}</span>
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
      <span style={{ fontSize: "13px", color: "#546E7A" }}>{suffix}</span>
    </div>
  );
}

export function TestButton({ label, onClick }: { label: string; onClick: () => void }) {
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
        fontSize: "13px",
        fontWeight: 600,
        cursor: "pointer",
        transition: "background 150ms",
      }}
    >
      {label}
    </button>
  );
}
