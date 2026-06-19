import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Eye, EyeOff, CheckCircle } from "lucide-react";

export default function ResetPassword() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [pwFocused, setPwFocused] = useState(false);
  const [cfFocused, setCfFocused] = useState(false);

  useEffect(() => {
    supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setSessionReady(true);
      }
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setSessionReady(true);
    });
  }, []);

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) { toast.error("Password must be at least 6 characters"); return; }
    if (password !== confirm) { toast.error("Passwords do not match"); return; }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) {
      toast.error(error.message);
    } else {
      setDone(true);
      toast.success("Password updated successfully");
      setTimeout(() => navigate("/dashboard", { replace: true }), 2000);
    }
  };

  const inputStyle = (focused: boolean) => ({
    border: focused ? "1.5px solid #1565C0" : "1.5px solid #E0E7EF",
    background: focused ? "#FAFBFF" : "#FAFBFC",
    color: "#0A1929",
    outline: "none",
    boxShadow: focused ? "0 0 0 3px rgba(21,101,192,0.1)" : "none",
  });

  return (
    <div
      className="flex min-h-screen items-center justify-center relative overflow-hidden"
      style={{ background: "linear-gradient(135deg, #0A1929 0%, #0F2A47 50%, #1A3A5C 100%)" }}
    >
      <div
        style={{
          position: "absolute", top: "-120px", right: "-120px",
          width: "400px", height: "400px", borderRadius: "50%",
          background: "rgba(21,101,192,0.15)", pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "absolute", bottom: "-80px", left: "-80px",
          width: "300px", height: "300px", borderRadius: "50%",
          background: "rgba(255,143,0,0.08)", pointerEvents: "none",
        }}
      />

      <div
        className="relative z-10 w-full"
        style={{
          maxWidth: "480px",
          background: "#FFFFFF",
          borderRadius: "24px",
          padding: "56px",
          boxShadow: "0 32px 80px rgba(0,0,0,0.35)",
          margin: "24px",
        }}
      >
        {done ? (
          <div className="text-center">
            <CheckCircle className="mx-auto mb-4" style={{ width: "48px", height: "48px", color: "#00897B" }} />
            <h1 className="font-bold text-xl mb-2" style={{ fontFamily: "Sora, sans-serif", color: "#0A1929" }}>
              Password Updated
            </h1>
            <p className="text-sm" style={{ color: "#546E7A" }}>
              Redirecting to dashboard…
            </p>
          </div>
        ) : !sessionReady ? (
          <div className="text-center">
            <Loader2 className="mx-auto mb-4 animate-spin" style={{ width: "32px", height: "32px", color: "#1565C0" }} />
            <p className="text-sm" style={{ color: "#546E7A" }}>
              Verifying your reset link…
            </p>
          </div>
        ) : (
          <>
            <h1
              className="text-center font-bold text-xl mb-2"
              style={{ fontFamily: "Sora, sans-serif", color: "#0A1929" }}
            >
              Set New Password
            </h1>
            <p className="text-center text-sm mb-10" style={{ color: "#94A3B8" }}>
              Enter your new password below
            </p>

            <form onSubmit={handleReset} className="space-y-5">
              <div>
                <label
                  className="mb-2 block"
                  style={{ fontSize: "13px", fontWeight: 600, color: "#546E7A", textTransform: "uppercase", letterSpacing: "0.05em" }}
                >
                  New Password
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    placeholder="Min 6 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onFocus={() => setPwFocused(true)}
                    onBlur={() => setPwFocused(false)}
                    required
                    minLength={6}
                    className="w-full px-4 py-3 pr-11 text-sm rounded-xl transition-all"
                    style={inputStyle(pwFocused)}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((p) => !p)}
                    className="absolute right-3 top-1/2 -translate-y-1/2"
                    style={{ color: "#94A3B8", background: "none", border: "none", cursor: "pointer", padding: "2px" }}
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <div>
                <label
                  className="mb-2 block"
                  style={{ fontSize: "13px", fontWeight: 600, color: "#546E7A", textTransform: "uppercase", letterSpacing: "0.05em" }}
                >
                  Confirm Password
                </label>
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="Re-enter password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  onFocus={() => setCfFocused(true)}
                  onBlur={() => setCfFocused(false)}
                  required
                  minLength={6}
                  className="w-full px-4 py-3 text-sm rounded-xl transition-all"
                  style={inputStyle(cfFocused)}
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-60 flex items-center justify-center gap-2"
                style={{
                  background: "linear-gradient(135deg,#1565C0,#2979FF)",
                  color: "white",
                  boxShadow: "0 4px 16px rgba(21,101,192,0.35)",
                  marginTop: "12px",
                }}
              >
                {loading ? <><Loader2 className="h-4 w-4 animate-spin" />Updating…</> : "Update Password"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
