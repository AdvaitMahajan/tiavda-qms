import { useEffect, useRef, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { apiClient } from "@/lib/apiClient";
import { DRIVE_REDIRECT_URI } from "@/components/settings/DriveConnect";
import { Loader2 } from "lucide-react";

/**
 * Where Google returns after Drive consent. The one-time code is handed to the
 * API, which exchanges it for a refresh token — the exchange needs the client
 * secret, so it cannot happen in the browser. `state` carries the org id.
 */
export default function GoogleOAuthCallback() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [message, setMessage] = useState("Finishing Google sign-in…");
  const ran = useRef(false); // StrictMode double-invoke would burn the one-time code

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    const code = params.get("code");
    const orgId = params.get("state");
    const denied = params.get("error");

    if (denied) { setMessage(`Google sign-in was cancelled (${denied}).`); return; }
    if (!code || !orgId) { setMessage("Missing code or organisation — start again from the Admin Console."); return; }

    apiClient
      .post<{ success: boolean; account_email?: string | null }>(`/admin/orgs/${orgId}/drive/connect`, {
        code,
        redirect_uri: DRIVE_REDIRECT_URI,
      })
      .then((r) => {
        setMessage(`Connected${r.account_email ? ` as ${r.account_email}` : ""}. Returning…`);
        setTimeout(() => navigate("/admin", { replace: true }), 1200);
      })
      .catch((e: Error) => setMessage(e.message || "Could not complete the connection."));
  }, [params, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: "#F0F4F8" }}>
      <div className="rounded-xl bg-white p-6 max-w-md w-full text-center" style={{ border: "1px solid #E0E7EF" }}>
        <Loader2 className="h-5 w-5 animate-spin mx-auto mb-3" style={{ color: "#1565C0" }} />
        <p className="text-sm" style={{ color: "#0A1929" }}>{message}</p>
        <button
          onClick={() => navigate("/admin", { replace: true })}
          className="text-[13px] mt-4 underline"
          style={{ color: "#546E7A" }}
        >
          Back to Admin Console
        </button>
      </div>
    </div>
  );
}
