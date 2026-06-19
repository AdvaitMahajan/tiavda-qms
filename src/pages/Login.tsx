import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Eye, EyeOff } from "lucide-react";

export default function Login() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [emailFocused, setEmailFocused] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);

  useEffect(() => {
    if (!authLoading && user) {
      navigate("/dashboard", { replace: true });
    }
  }, [user, authLoading, navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      toast.error(error.message === "Invalid login credentials" ? "Invalid email or password" : error.message);
    } else {
      toast.success("Welcome!");
      navigate("/dashboard", { replace: true });
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
      {/* Decorative circles */}
      <div
        style={{
          position: "absolute",
          top: "-120px",
          right: "-120px",
          width: "400px",
          height: "400px",
          borderRadius: "50%",
          background: "rgba(21,101,192,0.15)",
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: "-80px",
          left: "-80px",
          width: "300px",
          height: "300px",
          borderRadius: "50%",
          background: "rgba(255,143,0,0.08)",
          pointerEvents: "none",
        }}
      />

      {/* Card */}
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
        <h1
          className="text-center font-bold text-2xl mb-1"
          style={{ fontFamily: "Sora, sans-serif", color: "#0A1929" }}
        >
          Global Geotechnical Consultancy
        </h1>
        <p className="text-center text-base mb-2" style={{ color: "#546E7A", fontWeight: 500 }}>
          Welcome back
        </p>
        <p className="text-center text-sm mb-10" style={{ color: "#94A3B8" }}>
          Sign in to your account
        </p>

        <form onSubmit={handleLogin} className="space-y-5">
          <div>
            <label
              className="mb-2 block"
              style={{ fontSize: "13px", fontWeight: 600, color: "#546E7A", textTransform: "uppercase", letterSpacing: "0.05em" }}
            >
              Email address
            </label>
            <input
              type="email"
              placeholder="you@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onFocus={() => setEmailFocused(true)}
              onBlur={() => setEmailFocused(false)}
              required
              className="w-full px-4 py-3 text-sm rounded-xl transition-all"
              style={inputStyle(emailFocused)}
            />
          </div>
          <div>
            <label
              className="mb-2 block"
              style={{ fontSize: "13px", fontWeight: 600, color: "#546E7A", textTransform: "uppercase", letterSpacing: "0.05em" }}
            >
              Password
            </label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onFocus={() => setPasswordFocused(true)}
                onBlur={() => setPasswordFocused(false)}
                required
                className="w-full px-4 py-3 pr-11 text-sm rounded-xl transition-all"
                style={inputStyle(passwordFocused)}
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
          <div className="flex justify-end" style={{ marginTop: "-4px" }}>
            <button
              type="button"
              onClick={async () => {
                if (!email) { toast.error("Enter your email first"); return; }
                setLoading(true);
                const { error } = await supabase.auth.resetPasswordForEmail(email, {
                  redirectTo: `${window.location.origin}/reset-password`,
                });
                setLoading(false);
                if (error) toast.error(error.message);
                else toast.success("Password reset link sent to your email");
              }}
              className="text-[13px] transition-colors"
              style={{ color: "#1565C0", background: "none", border: "none", cursor: "pointer", padding: 0 }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.textDecoration = "underline"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.textDecoration = "none"; }}
            >
              Forgot password?
            </button>
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
            onMouseEnter={(e) => { if (!loading) (e.currentTarget as HTMLElement).style.transform = "translateY(-1px)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.transform = "translateY(0)"; }}
          >
            {loading ? <><Loader2 className="h-4 w-4 animate-spin" />Signing in…</> : "Sign In"}
          </button>
        </form>

        <p className="text-center text-[13px] mt-6" style={{ color: "#94A3B8" }}>
          Contact your administrator if you don't have an account
        </p>
      </div>
    </div>
  );
}
