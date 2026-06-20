import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { publicApi } from "@/lib/apiClient";
import { Loader2, CheckCircle2, Calendar, MapPin, AlertTriangle } from "lucide-react";

type TokenData = {
  id: string;
  mobilisation_id: string;
  enquiry_id: string;
  status: string;
  expires_at: string;
  mobilisation?: {
    mobilisation_date: string;
    mobilisation_time: string | null;
    site_contact_name: string | null;
  };
  enquiry?: {
    ref_number: string;
    site_city: string;
    site_address: string | null;
  };
  client?: {
    name: string;
  };
};

export default function ConfirmMobilization() {
  const [params] = useSearchParams();
  const token = params.get("t");

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<TokenData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [done, setDone] = useState(false);
  const [showAlternate, setShowAlternate] = useState(false);
  const [altDate, setAltDate] = useState("");
  const [altNotes, setAltNotes] = useState("");

  useEffect(() => {
    if (!token) {
      setError("No confirmation token provided.");
      setLoading(false);
      return;
    }

    (async () => {
      let row: TokenData | null = null;
      try {
        row = await publicApi.get<TokenData | null>("/public/mob-confirmation", { token });
      } catch {
        row = null;
      }

      if (!row) {
        setError("Invalid or expired confirmation link.");
        setLoading(false);
        return;
      }

      const tokenRow = row;

      if (tokenRow.status !== "pending") {
        setData(tokenRow);
        setDone(true);
        setLoading(false);
        return;
      }

      if (new Date(tokenRow.expires_at) < new Date()) {
        setError("This confirmation link has expired. Please contact us.");
        setLoading(false);
        return;
      }

      setData(tokenRow);
      setLoading(false);
    })();
  }, [token]);

  const handleConfirm = async () => {
    if (!data || !token) return;
    setConfirming(true);
    try {
      const r = await publicApi.post<{ ok?: boolean; error?: string } | null>("/public/mob-confirmation/confirm", { token });
      if (!r?.ok) {
        setError(r?.error === "expired" ? "This confirmation link has expired. Please contact us." : "Something went wrong. Please try again.");
        return;
      }
      setDone(true);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setConfirming(false);
    }
  };

  const handleAlternate = async () => {
    if (!data || !token || !altDate) return;
    setConfirming(true);
    try {
      const r = await publicApi.post<{ ok?: boolean } | null>("/public/mob-confirmation/propose-alternate", {
        token,
        date: altDate,
        notes: altNotes || null,
      });
      if (!r?.ok) {
        setError("Something went wrong. Please try again.");
        return;
      }
      setDone(true);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setConfirming(false);
    }
  };

  const card = {
    background: "#FFFFFF",
    borderRadius: "20px",
    boxShadow: "0 8px 40px rgba(0,0,0,0.08)",
    maxWidth: "480px",
    width: "100%",
    overflow: "hidden" as const,
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "linear-gradient(135deg, #0A1929 0%, #1565C0 100%)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
      }}
    >
      <div style={card}>
        <div style={{ background: "#0A1929", padding: "24px 28px" }}>
          <h1 style={{ fontFamily: "Sora, sans-serif", fontWeight: 700, fontSize: "20px", color: "white", margin: 0 }}>
            Mobilisation Portal
          </h1>
          <p style={{ color: "rgba(255,255,255,0.6)", fontSize: "13px", margin: "4px 0 0" }}>
            Mobilisation Confirmation
          </p>
        </div>

        <div style={{ padding: "28px" }}>
          {loading && (
            <div style={{ textAlign: "center", padding: "40px 0" }}>
              <Loader2 className="h-8 w-8 animate-spin mx-auto" style={{ color: "#1565C0" }} />
              <p style={{ color: "#546E7A", fontSize: "14px", marginTop: "12px" }}>Verifying your link…</p>
            </div>
          )}

          {error && (
            <div style={{ textAlign: "center", padding: "40px 0" }}>
              <AlertTriangle className="h-10 w-10 mx-auto" style={{ color: "#B91C1C" }} />
              <p style={{ color: "#B91C1C", fontSize: "14px", marginTop: "12px", fontWeight: 600 }}>{error}</p>
            </div>
          )}

          {done && !error && (
            <div style={{ textAlign: "center", padding: "40px 0" }}>
              <CheckCircle2 className="h-12 w-12 mx-auto" style={{ color: "#15673A" }} />
              <p style={{ fontFamily: "Sora, sans-serif", fontWeight: 700, fontSize: "18px", color: "#0A1929", marginTop: "16px" }}>
                {data?.status === "confirmed" || (!showAlternate && data?.status !== "alternate_proposed")
                  ? "Mobilisation Confirmed!"
                  : "Alternate Date Proposed"}
              </p>
              <p style={{ color: "#546E7A", fontSize: "13px", marginTop: "8px" }}>
                Thank you. Our team has been notified.
              </p>
            </div>
          )}

          {!loading && !error && !done && data && (
            <>
              <p style={{ fontSize: "14px", color: "#0A1929", marginBottom: "20px" }}>
                Dear <strong>{data.client?.name}</strong>, please confirm the mobilisation details below:
              </p>

              <div style={{ background: "#F0F4F8", borderRadius: "12px", padding: "16px", marginBottom: "20px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px" }}>
                  <Calendar style={{ width: "16px", height: "16px", color: "#1565C0" }} />
                  <span style={{ fontSize: "14px", fontWeight: 600, color: "#0A1929" }}>
                    {new Date(data.mobilisation?.mobilisation_date ?? "").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                  </span>
                </div>
                {data.mobilisation?.mobilisation_time && (
                  <p style={{ fontSize: "13px", color: "#546E7A", marginLeft: "24px", marginBottom: "6px" }}>
                    Time: {data.mobilisation.mobilisation_time}
                  </p>
                )}
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <MapPin style={{ width: "16px", height: "16px", color: "#1565C0" }} />
                  <span style={{ fontSize: "13px", color: "#546E7A" }}>
                    {data.enquiry?.site_address || data.enquiry?.site_city}
                  </span>
                </div>
                <p style={{ fontSize: "13px", fontFamily: "JetBrains Mono, monospace", color: "#546E7A", marginTop: "8px" }}>
                  Ref: {data.enquiry?.ref_number}
                </p>
              </div>

              {!showAlternate ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  <button
                    onClick={handleConfirm}
                    disabled={confirming}
                    style={{
                      width: "100%",
                      padding: "14px",
                      borderRadius: "12px",
                      fontSize: "14px",
                      fontWeight: 700,
                      color: "white",
                      background: "linear-gradient(135deg,#15673A,#22C55E)",
                      border: "none",
                      cursor: confirming ? "wait" : "pointer",
                      opacity: confirming ? 0.7 : 1,
                      boxShadow: "0 4px 12px rgba(21,103,58,0.3)",
                    }}
                  >
                    {confirming ? "Confirming…" : "Confirm Mobilisation"}
                  </button>
                  <button
                    onClick={() => setShowAlternate(true)}
                    style={{
                      width: "100%",
                      padding: "12px",
                      borderRadius: "12px",
                      fontSize: "13px",
                      fontWeight: 600,
                      color: "#92400E",
                      background: "#FEF3C7",
                      border: "1px solid #FCD34D",
                      cursor: "pointer",
                    }}
                  >
                    Propose Alternate Date
                  </button>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  <div>
                    <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#0A1929", marginBottom: "6px" }}>
                      Preferred Date *
                    </label>
                    <input
                      type="date"
                      value={altDate}
                      onChange={(e) => setAltDate(e.target.value)}
                      style={{
                        width: "100%",
                        padding: "10px 14px",
                        borderRadius: "10px",
                        border: "1.5px solid #E0E7EF",
                        fontSize: "13px",
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#0A1929", marginBottom: "6px" }}>
                      Notes (optional)
                    </label>
                    <textarea
                      value={altNotes}
                      onChange={(e) => setAltNotes(e.target.value)}
                      placeholder="Reason for alternate date..."
                      rows={2}
                      style={{
                        width: "100%",
                        padding: "10px 14px",
                        borderRadius: "10px",
                        border: "1.5px solid #E0E7EF",
                        fontSize: "13px",
                        resize: "none",
                      }}
                    />
                  </div>
                  <button
                    onClick={handleAlternate}
                    disabled={confirming || !altDate}
                    style={{
                      width: "100%",
                      padding: "14px",
                      borderRadius: "12px",
                      fontSize: "14px",
                      fontWeight: 700,
                      color: "white",
                      background: "linear-gradient(135deg,#E65100,#FF8F00)",
                      border: "none",
                      cursor: confirming || !altDate ? "not-allowed" : "pointer",
                      opacity: confirming || !altDate ? 0.6 : 1,
                    }}
                  >
                    {confirming ? "Submitting…" : "Submit Alternate Date"}
                  </button>
                  <button
                    onClick={() => setShowAlternate(false)}
                    style={{
                      width: "100%",
                      padding: "10px",
                      borderRadius: "10px",
                      fontSize: "13px",
                      fontWeight: 500,
                      color: "#546E7A",
                      background: "#F0F4F8",
                      border: "none",
                      cursor: "pointer",
                    }}
                  >
                    Back
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
