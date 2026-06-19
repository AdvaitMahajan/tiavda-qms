import { useState } from "react";
import { MapPin, ChevronDown, ChevronUp, AlertTriangle, CheckCircle, Eye } from "lucide-react";

type SiteVisit = {
  id: string;
  visit_date: string;
  feasibility: string | null;
  water_confirmed: boolean | null;
  access_confirmed: boolean | null;
  security_confirmed: boolean | null;
  fencing_confirmed: boolean | null;
  observations: any;
  recommendations: string | null;
  cost_factors: any;
  status: string;
};

type Props = {
  siteVisit: SiteVisit | null;
};

const FEASIBILITY_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  feasible: { bg: "#E8F5E9", text: "#2E7D32", label: "Feasible" },
  conditional: { bg: "#FFF8E1", text: "#F57F17", label: "Conditional" },
  not_feasible: { bg: "#FFEBEE", text: "#C62828", label: "Not Feasible" },
};

function ConfirmDot({ confirmed, label }: { confirmed: boolean | null; label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
      <div
        style={{
          width: "8px",
          height: "8px",
          borderRadius: "50%",
          background: confirmed ? "#4CAF50" : confirmed === false ? "#E57373" : "#BDBDBD",
        }}
      />
      <span style={{ fontSize: "12px", color: "#546E7A" }}>{label}</span>
    </div>
  );
}

export default function SiteVisitContext({ siteVisit }: Props) {
  const [expanded, setExpanded] = useState(true);

  if (!siteVisit) {
    return (
      <div
        style={{
          background: "#FAFBFC",
          borderRadius: "12px",
          border: "1px dashed #CBD5E1",
          padding: "16px 20px",
          marginBottom: "16px",
          display: "flex",
          alignItems: "center",
          gap: "10px",
        }}
      >
        <Eye style={{ width: 16, height: 16, color: "#90A4AE" }} />
        <span style={{ fontSize: "13px", color: "#90A4AE" }}>
          No site visit completed for this enquiry
        </span>
      </div>
    );
  }

  const feasStyle = FEASIBILITY_STYLES[siteVisit.feasibility ?? ""] ?? FEASIBILITY_STYLES.conditional;
  const costFactors: string[] = Array.isArray(siteVisit.cost_factors) ? siteVisit.cost_factors : [];
  const obs = typeof siteVisit.observations === "object" && siteVisit.observations
    ? (siteVisit.observations as any).text ?? JSON.stringify(siteVisit.observations)
    : siteVisit.observations ?? "";

  return (
    <div
      style={{
        background: "white",
        borderRadius: "12px",
        border: `1px solid ${siteVisit.feasibility === "not_feasible" ? "#FFCDD2" : "#E0E7EF"}`,
        marginBottom: "16px",
        overflow: "hidden",
      }}
    >
      {siteVisit.feasibility === "not_feasible" && (
        <div
          style={{
            background: "linear-gradient(135deg, #FFEBEE, #FCE4EC)",
            padding: "10px 16px",
            display: "flex",
            alignItems: "center",
            gap: "8px",
          }}
        >
          <AlertTriangle style={{ width: 14, height: 14, color: "#C62828" }} />
          <span style={{ fontSize: "13px", fontWeight: 600, color: "#C62828" }}>
            Site visit marked as Not Feasible — review before generating quotation
          </span>
        </div>
      )}

      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          width: "100%",
          padding: "12px 16px",
          background: "linear-gradient(135deg, #F8FAFC, #F0F4F8)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          border: "none",
          borderBottom: expanded ? "1px solid #F0F4F8" : "none",
          cursor: "pointer",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <MapPin style={{ width: 14, height: 14, color: "#1565C0" }} />
          <span style={{ fontWeight: 600, fontSize: "13px", color: "#0A1929" }}>
            Site Visit
          </span>
          <span style={{ fontSize: "12px", color: "#546E7A" }}>
            {new Date(siteVisit.visit_date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span
            style={{
              fontSize: "12px",
              fontWeight: 700,
              padding: "2px 8px",
              borderRadius: "4px",
              background: feasStyle.bg,
              color: feasStyle.text,
              textTransform: "uppercase",
              letterSpacing: "0.04em",
            }}
          >
            {feasStyle.label}
          </span>
          {expanded ? <ChevronUp style={{ width: 13, height: 13, color: "#546E7A" }} /> : <ChevronDown style={{ width: 13, height: 13, color: "#546E7A" }} />}
        </div>
      </button>

      {expanded && (
        <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: "12px" }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
            <ConfirmDot confirmed={siteVisit.water_confirmed} label="Water" />
            <ConfirmDot confirmed={siteVisit.access_confirmed} label="Access" />
            <ConfirmDot confirmed={siteVisit.security_confirmed} label="Security" />
            <ConfirmDot confirmed={siteVisit.fencing_confirmed} label="Fencing" />
          </div>

          {obs && (
            <div>
              <span style={{ fontSize: "12px", fontWeight: 700, color: "#546E7A", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                Observations
              </span>
              <p style={{ fontSize: "13px", color: "#0A1929", margin: "4px 0 0", lineHeight: 1.5 }}>
                {obs}
              </p>
            </div>
          )}

          {siteVisit.recommendations && (
            <div>
              <span style={{ fontSize: "12px", fontWeight: 700, color: "#546E7A", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                Recommendations
              </span>
              <p style={{ fontSize: "13px", color: "#0A1929", margin: "4px 0 0", lineHeight: 1.5 }}>
                {siteVisit.recommendations}
              </p>
            </div>
          )}

          {costFactors.length > 0 && (
            <div>
              <span style={{ fontSize: "12px", fontWeight: 700, color: "#546E7A", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                Cost Factors
              </span>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "6px" }}>
                {costFactors.map((f, i) => (
                  <span
                    key={i}
                    style={{
                      fontSize: "12px",
                      fontWeight: 600,
                      padding: "3px 8px",
                      borderRadius: "6px",
                      background: "#FFF3E0",
                      color: "#E65100",
                      border: "1px solid #FFE0B2",
                    }}
                  >
                    {f}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
