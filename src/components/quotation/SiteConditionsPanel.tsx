import { useState } from "react";
import { Droplets, Zap, Shield, Route, HardHat, ChevronDown, ChevronUp } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import type { SiteConditions } from "@/lib/quotationEngine";

type ConditionKey = "waterAvailable" | "electricityAvailable" | "securityAvailable" | "accessClear";

type ConditionDef = {
  key: ConditionKey;
  label: string;
  rateKey: string;
  icon: React.ElementType;
  offLabel: string;
};

const CONDITIONS: ConditionDef[] = [
  { key: "waterAvailable", label: "Water", rateKey: "rate_water_arrangement", icon: Droplets, offLabel: "Water Arrangement" },
  { key: "electricityAvailable", label: "Electricity", rateKey: "rate_generator_arrangement", icon: Zap, offLabel: "Generator / Power" },
  { key: "securityAvailable", label: "Security", rateKey: "rate_security_arrangement", icon: Shield, offLabel: "Security Arrangement" },
  { key: "accessClear", label: "Site Access", rateKey: "rate_access_arrangement", icon: Route, offLabel: "Difficult Access Surcharge" },
];

type Props = {
  conditions: SiteConditions;
  costOverrides: Record<string, number>;
  defaultRates: Record<string, number>;
  onConditionChange: (key: ConditionKey, value: boolean) => void;
  onSafetyChange: (value: string) => void;
  onCostOverrideChange: (rateKey: string, value: number) => void;
};

function ConditionSource({ source }: { source: "intake" | "site_visit" | "manual" }) {
  const colors = {
    intake: { bg: "#E8F5E9", text: "#2E7D32" },
    site_visit: { bg: "#E3F2FD", text: "#1565C0" },
    manual: { bg: "#FFF8E1", text: "#F57F17" },
  };
  const labels = { intake: "Intake", site_visit: "Site Visit", manual: "Manual" };
  const c = colors[source];
  return (
    <span
      style={{
        fontSize: "12px", fontWeight: 700, textTransform: "uppercase",
        letterSpacing: "0.06em", padding: "2px 6px", borderRadius: "4px",
        background: c.bg, color: c.text,
      }}
    >
      {labels[source]}
    </span>
  );
}

export default function SiteConditionsPanel({
  conditions,
  costOverrides,
  defaultRates,
  onConditionChange,
  onSafetyChange,
  onCostOverrideChange,
}: Props) {
  const [collapsed, setCollapsed] = useState(false);

  const additionalCost = CONDITIONS.reduce((sum, cd) => {
    if (conditions[cd.key] === false) {
      sum += costOverrides[cd.rateKey] ?? defaultRates[cd.rateKey] ?? 0;
    }
    return sum;
  }, conditions.safetyRequirements ? (costOverrides["rate_safety_arrangement"] ?? defaultRates["rate_safety_arrangement"] ?? 0) : 0);

  return (
    <div
      style={{
        background: "white",
        borderRadius: "16px",
        border: "1px solid #E0E7EF",
        boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
        overflow: "hidden",
        marginTop: "16px",
      }}
    >
      <button
        onClick={() => setCollapsed(!collapsed)}
        style={{
          width: "100%",
          padding: "14px 20px",
          borderBottom: collapsed ? "none" : "1px solid #F0F4F8",
          background: "linear-gradient(135deg, #F8FAFC, #F0F4F8)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          border: "none",
          cursor: "pointer",
        }}
      >
        <span style={{ fontWeight: 600, fontSize: "13px", color: "#0A1929" }}>
          Site Conditions
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          {additionalCost > 0 && (
            <span style={{ fontSize: "12px", fontWeight: 600, color: "#D4930A" }}>
              +{formatCurrency(additionalCost)}
            </span>
          )}
          {collapsed ? <ChevronDown style={{ width: 14, height: 14, color: "#546E7A" }} /> : <ChevronUp style={{ width: 14, height: 14, color: "#546E7A" }} />}
        </div>
      </button>

      {!collapsed && (
        <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: "12px" }}>
          {CONDITIONS.map((cd) => {
            const available = conditions[cd.key] !== false;
            const Icon = cd.icon;
            const rateVal = costOverrides[cd.rateKey] ?? defaultRates[cd.rateKey] ?? 0;

            return (
              <div key={cd.key}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <Icon style={{ width: 14, height: 14, color: available ? "#2E7D32" : "#B91C1C" }} />
                    <span style={{ fontSize: "13px", fontWeight: 600, color: "#0A1929" }}>{cd.label}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <button
                      onClick={() => onConditionChange(cd.key, !available)}
                      style={{
                        width: "36px",
                        height: "20px",
                        borderRadius: "10px",
                        border: "none",
                        background: available ? "#4CAF50" : "#E57373",
                        position: "relative",
                        cursor: "pointer",
                        transition: "background 200ms",
                      }}
                    >
                      <div
                        style={{
                          width: "16px",
                          height: "16px",
                          borderRadius: "50%",
                          background: "white",
                          position: "absolute",
                          top: "2px",
                          left: available ? "18px" : "2px",
                          transition: "left 200ms",
                          boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                        }}
                      />
                    </button>
                  </div>
                </div>

                {!available && (
                  <div
                    style={{
                      marginTop: "6px",
                      marginLeft: "22px",
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                    }}
                  >
                    <span style={{ fontSize: "12px", color: "#546E7A", whiteSpace: "nowrap" }}>
                      {cd.offLabel}:
                    </span>
                    <input
                      type="number"
                      value={rateVal || ""}
                      onChange={(e) => onCostOverrideChange(cd.rateKey, parseFloat(e.target.value) || 0)}
                      placeholder="Cost (₹)"
                      style={{
                        flex: 1,
                        padding: "4px 8px",
                        border: "1px solid #E0E7EF",
                        borderRadius: "6px",
                        fontSize: "12px",
                        color: "#0A1929",
                        background: "#FAFBFC",
                        outline: "none",
                        maxWidth: "100px",
                      }}
                    />
                    <span style={{ fontSize: "12px", color: "#90A4AE" }}>LS</span>
                  </div>
                )}
              </div>
            );
          })}

          {/* Safety / TPA */}
          <div style={{ borderTop: "1px solid #F0F4F8", paddingTop: "10px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
              <HardHat style={{ width: 14, height: 14, color: conditions.safetyRequirements ? "#D4930A" : "#90A4AE" }} />
              <span style={{ fontSize: "13px", fontWeight: 600, color: "#0A1929" }}>TPA / Safety</span>
            </div>
            <input
              type="text"
              value={conditions.safetyRequirements ?? ""}
              onChange={(e) => onSafetyChange(e.target.value)}
              placeholder="e.g. TPA required, safety shoes mandatory"
              style={{
                width: "100%",
                padding: "6px 10px",
                border: "1px solid #E0E7EF",
                borderRadius: "8px",
                fontSize: "12px",
                color: "#0A1929",
                background: "#FAFBFC",
                outline: "none",
              }}
            />
            {conditions.safetyRequirements && (
              <div style={{ marginTop: "6px", display: "flex", alignItems: "center", gap: "6px" }}>
                <span style={{ fontSize: "12px", color: "#546E7A" }}>Cost:</span>
                <input
                  type="number"
                  value={costOverrides["rate_safety_arrangement"] ?? defaultRates["rate_safety_arrangement"] ?? ""}
                  onChange={(e) => onCostOverrideChange("rate_safety_arrangement", parseFloat(e.target.value) || 0)}
                  placeholder="₹"
                  style={{
                    padding: "4px 8px",
                    border: "1px solid #E0E7EF",
                    borderRadius: "6px",
                    fontSize: "12px",
                    color: "#0A1929",
                    background: "#FAFBFC",
                    outline: "none",
                    maxWidth: "100px",
                  }}
                />
                <span style={{ fontSize: "12px", color: "#90A4AE" }}>LS</span>
              </div>
            )}
          </div>

          {additionalCost > 0 && (
            <div
              style={{
                borderTop: "1px solid #F0F4F8",
                paddingTop: "10px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <span style={{ fontSize: "12px", color: "#546E7A" }}>Additional site costs</span>
              <span style={{ fontSize: "13px", fontWeight: 700, color: "#D4930A" }}>
                {formatCurrency(additionalCost)}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
