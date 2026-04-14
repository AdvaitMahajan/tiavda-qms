import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Loader2 } from "lucide-react";

export default function Login() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState<"email" | "otp">("email");
  const [loading, setLoading] = useState(false);
  const [emailFocused, setEmailFocused] = useState(false);

  useEffect(() => {
    if (!authLoading && user) {
      navigate("/dashboard", { replace: true });
    }
  }, [user, authLoading, navigate]);

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setLoading(true);
    const { error } = await supabase.auth.signInWithOtp({ email });
    setLoading(false);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("OTP sent to your email");
      setStep("otp");
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otp.length !== 8) return;
    setLoading(true);
    const { error } = await supabase.auth.verifyOtp({
      email,
      token: otp,
      type: "email",
    });
    setLoading(false);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Welcome!");
      navigate("/dashboard", { replace: true });
    }
  };

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
          maxWidth: "400px",
          background: "#FFFFFF",
          borderRadius: "24px",
          padding: "48px",
          boxShadow: "0 32px 80px rgba(0,0,0,0.35)",
          margin: "24px",
        }}
      >
        {/* Logo tile */}
        <div className="flex justify-center mb-6">
          <div
            className="flex items-center justify-center rounded-2xl font-bold text-white text-xl"
            style={{
              width: "64px",
              height: "64px",
              background: "linear-gradient(135deg, #0A1929 0%, #1565C0 100%)",
              boxShadow: "0 8px 24px rgba(21,101,192,0.4)",
              fontFamily: "Sora, sans-serif",
            }}
          >
            TQ
          </div>
        </div>

        <h1
          className="text-center font-bold text-2xl mb-1"
          style={{ fontFamily: "Sora, sans-serif", color: "#0A1929" }}
        >
          Welcome back
        </h1>
        <p className="text-center text-sm mb-8" style={{ color: "#546E7A" }}>
          Sign in to Tiavda QMS
        </p>

        {step === "email" ? (
          <form onSubmit={handleSendOtp} className="space-y-4">
            <div>
              <label
                className="mb-1.5 block"
                style={{ fontSize: "11px", fontWeight: 600, color: "#546E7A", textTransform: "uppercase", letterSpacing: "0.05em" }}
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
                className="w-full px-3.5 py-2.5 text-sm rounded-xl transition-all"
                style={{
                  border: emailFocused ? "1.5px solid #1565C0" : "1.5px solid #E0E7EF",
                  background: emailFocused ? "#FAFBFF" : "#FAFBFC",
                  color: "#0A1929",
                  outline: "none",
                  boxShadow: emailFocused ? "0 0 0 3px rgba(21,101,192,0.1)" : "none",
                }}
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl text-sm font-semibold transition-all disabled:opacity-60 flex items-center justify-center gap-2"
              style={{
                background: "linear-gradient(135deg,#1565C0,#2979FF)",
                color: "white",
                boxShadow: "0 4px 16px rgba(21,101,192,0.35)",
                marginTop: "8px",
              }}
              onMouseEnter={(e) => { if (!loading) (e.currentTarget as HTMLElement).style.transform = "translateY(-1px)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.transform = "translateY(0)"; }}
            >
              {loading ? <><Loader2 className="h-4 w-4 animate-spin" />Sending…</> : "Send OTP"}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerify} className="space-y-4">
            <p className="text-sm text-center" style={{ color: "#546E7A" }}>
              Enter the 8-digit code sent to{" "}
              <strong style={{ color: "#0A1929" }}>{email}</strong>
            </p>
            <div className="flex justify-center py-2">
              <InputOTP maxLength={8} value={otp} onChange={setOtp}>
                <InputOTPGroup>
                  <InputOTPSlot index={0} />
                  <InputOTPSlot index={1} />
                  <InputOTPSlot index={2} />
                  <InputOTPSlot index={3} />
                  <InputOTPSlot index={4} />
                  <InputOTPSlot index={5} />
                  <InputOTPSlot index={6} />
                  <InputOTPSlot index={7} />
                </InputOTPGroup>
              </InputOTP>
            </div>
            <button
              type="submit"
              disabled={loading || otp.length !== 8}
              className="w-full py-3 rounded-xl text-sm font-semibold transition-all disabled:opacity-60 flex items-center justify-center gap-2"
              style={{
                background: "linear-gradient(135deg,#00897B,#26A69A)",
                color: "white",
                boxShadow: "0 4px 16px rgba(0,137,123,0.35)",
              }}
              onMouseEnter={(e) => { if (!loading && otp.length === 8) (e.currentTarget as HTMLElement).style.transform = "translateY(-1px)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.transform = "translateY(0)"; }}
            >
              {loading ? <><Loader2 className="h-4 w-4 animate-spin" />Verifying…</> : "Verify & Enter"}
            </button>
            <button
              type="button"
              onClick={() => { setStep("email"); setOtp(""); }}
              className="w-full text-center text-sm transition-colors"
              style={{ color: "#546E7A" }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "#0A1929"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "#546E7A"; }}
            >
              ← Change email
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
