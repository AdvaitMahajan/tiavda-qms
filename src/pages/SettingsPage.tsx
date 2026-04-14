import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Loader2, Settings, LogOut, Mail, MessageSquare } from "lucide-react";

export default function SettingsPage() {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [companyName, setCompanyName] = useState("");
  const [companyState, setCompanyState] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminWhatsapp, setAdminWhatsapp] = useState("");
  const [bankDetails, setBankDetails] = useState("");

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("app_settings").select("key, value")
        .in("key", ["company_name", "company_state", "admin_email", "admin_whatsapp", "bank_details"]);
      const map = new Map(data?.map((d) => [d.key, d.value]) ?? []);
      setCompanyName(map.get("company_name") ?? "");
      setCompanyState(map.get("company_state") ?? "");
      setAdminEmail(map.get("admin_email") ?? "");
      setAdminWhatsapp(map.get("admin_whatsapp") ?? "");
      setBankDetails(map.get("bank_details") ?? "");
      setLoading(false);
    })();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    const entries = [
      { key: "company_name", value: companyName },
      { key: "company_state", value: companyState },
      { key: "admin_email", value: adminEmail },
      { key: "admin_whatsapp", value: adminWhatsapp },
      { key: "bank_details", value: bankDetails },
    ];
    for (const entry of entries) {
      const { error } = await supabase.from("app_settings").upsert(
        { key: entry.key, value: entry.value, updated_at: new Date().toISOString() },
        { onConflict: "key" }
      );
      if (error) { toast.error(`Failed to save ${entry.key}: ${error.message}`); setSaving(false); return; }
    }
    toast.success("Settings saved.");
    setSaving(false);
  };

  const handleSignOut = async () => {
    await signOut();
    navigate("/login");
  };

  if (loading) return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-40" />
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-3 space-y-4">
          <Skeleton className="h-[400px] rounded-2xl" />
        </div>
        <div className="lg:col-span-2 space-y-4">
          <Skeleton className="h-32 rounded-2xl" />
          <Skeleton className="h-64 rounded-2xl" />
        </div>
      </div>
    </div>
  );

  const inputClass = "w-full px-3 py-2.5 border border-[#CBD5E1] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1B5EA0] focus:border-transparent transition-all";

  return (
    <div className="space-y-6">
      <h1 className="font-sora text-[1.875rem] font-bold" style={{ color: "#0F2A47" }}>Settings</h1>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
        {/* Left column — Company Settings */}
        <div className="lg:col-span-3">
          <div className="bg-white rounded-2xl p-6 border border-[#CBD5E1]">
            <h2 className="font-sora text-lg font-semibold text-[#0F2A47] flex items-center gap-2 mb-5">
              <Settings className="h-5 w-5" /> Company Settings
            </h2>
            <div className="space-y-5">
              <div>
                <Label>Company Name</Label>
                <input value={companyName} onChange={(e) => setCompanyName(e.target.value)} className={`mt-1.5 ${inputClass}`} />
              </div>
              <div>
                <Label>Registered State</Label>
                <input value={companyState} onChange={(e) => setCompanyState(e.target.value)} className={`mt-1.5 ${inputClass}`} />
                <p className="text-xs text-muted-foreground mt-1">Used for GST calculation — CGST+SGST for same state, IGST otherwise</p>
              </div>
              <div>
                <Label>Admin Email</Label>
                <input type="email" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} className={`mt-1.5 ${inputClass}`} />
              </div>
              <div>
                <Label>Admin WhatsApp</Label>
                <input value={adminWhatsapp} onChange={(e) => setAdminWhatsapp(e.target.value)} placeholder="+91XXXXXXXXXX" className={`mt-1.5 ${inputClass}`} />
              </div>
              <div>
                <Label>Bank Details for Payments</Label>
                <Textarea value={bankDetails} onChange={(e) => setBankDetails(e.target.value)} placeholder="NEFT to HDFC A/C XXXXXXXXXX, IFSC: HDFCXXXXXXX" rows={3} className={`mt-1.5 ${inputClass} resize-none`} />
              </div>
              <button
                onClick={handleSave}
                disabled={saving}
                className="w-full bg-[#1B5EA0] text-white rounded-lg py-2.5 font-medium hover:opacity-90 transition-opacity active:scale-95 disabled:opacity-60"
              >
                {saving ? <span className="flex items-center justify-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Saving…</span> : "Save Settings"}
              </button>
            </div>
          </div>
        </div>

        {/* Right column */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-2xl p-6 border border-[#CBD5E1]">
            <h2 className="font-sora text-lg font-semibold text-[#0F2A47] mb-4">Account</h2>
            <div className="space-y-4">
              <div>
                <p className="text-xs text-[#64748B]">Logged in as</p>
                <p className="text-sm font-medium mt-0.5">{user?.email ?? "Unknown"}</p>
              </div>
              <Button variant="outline" className="text-red-600 border-red-300 hover:bg-red-50" onClick={handleSignOut}>
                <LogOut className="mr-2 h-4 w-4" /> Sign Out
              </Button>
            </div>
          </div>

          <div className="bg-white rounded-2xl p-6 border border-[#CBD5E1]">
            <h2 className="font-sora text-lg font-semibold text-[#0F2A47] mb-4">Connections</h2>
            <div className="space-y-3">
              <div className="flex items-center justify-between py-2 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-slate-400" />
                  <span className="text-sm font-medium text-slate-700">WhatsApp</span>
                </div>
                <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-amber-100 text-amber-700">
                  Pending template approval
                </span>
              </div>
              <div className="flex items-center justify-between py-2">
                <div className="flex items-center gap-2">
                  <Mail className="w-4 h-4 text-slate-400" />
                  <span className="text-sm font-medium text-slate-700">Email</span>
                </div>
                <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-green-100 text-green-700">
                  Configured
                </span>
              </div>
              <Separator />
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => toast.info("Test email functionality will be available after Edge Functions are deployed.")}>
                  Test Email
                </Button>
                <Button variant="outline" size="sm" onClick={() => toast.info("Test WhatsApp functionality will be available after Edge Functions are deployed.")}>
                  Test WhatsApp
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
