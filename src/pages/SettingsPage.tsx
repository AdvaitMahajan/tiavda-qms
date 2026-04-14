import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Loader2, Settings, LogOut, Mail, MessageSquare, FolderOpen, Database } from "lucide-react";

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
        .from("app_settings")
        .select("key, value")
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

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="font-heading text-2xl font-bold text-foreground">Settings</h1>

      {/* Company Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Settings className="h-5 w-5" /> Company Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div><Label>Company Name</Label><Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} /></div>
          <div>
            <Label>Registered State</Label>
            <Input value={companyState} onChange={(e) => setCompanyState(e.target.value)} />
            <p className="text-xs text-muted-foreground mt-1">Used for GST calculation — CGST+SGST for same state, IGST otherwise</p>
          </div>
          <div><Label>Admin Email</Label><Input type="email" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} /></div>
          <div>
            <Label>Admin WhatsApp</Label>
            <Input value={adminWhatsapp} onChange={(e) => setAdminWhatsapp(e.target.value)} placeholder="+91XXXXXXXXXX" />
          </div>
          <div>
            <Label>Bank Details for Payments</Label>
            <Textarea value={bankDetails} onChange={(e) => setBankDetails(e.target.value)} placeholder="NEFT to HDFC A/C XXXXXXXXXX, IFSC: HDFCXXXXXXX" rows={3} />
          </div>
          <Button onClick={handleSave} disabled={saving} className="bg-blue text-white hover:bg-blue/90">
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Save Settings
          </Button>
        </CardContent>
      </Card>

      {/* Account */}
      <Card>
        <CardHeader><CardTitle>Account</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Logged in as</Label>
            <p className="text-sm text-muted-foreground">{user?.email ?? "Unknown"}</p>
          </div>
          <Button variant="outline" className="text-red-600 border-red-300 hover:bg-red-50" onClick={handleSignOut}>
            <LogOut className="mr-2 h-4 w-4" /> Sign Out
          </Button>
        </CardContent>
      </Card>

      {/* Integration Status */}
      <Card>
        <CardHeader><CardTitle>Integration Status</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {[
            { name: "SendGrid Email", icon: Mail, status: "Configured", color: "bg-green-100 text-green-700" },
            { name: "WATI WhatsApp", icon: MessageSquare, status: "Pending template approval", color: "bg-amber-100 text-amber-700" },
            { name: "Google Drive", icon: FolderOpen, status: "Setup required", color: "bg-slate-100 text-slate-600" },
            { name: "Supabase Storage", icon: Database, status: "Configured", color: "bg-green-100 text-green-700" },
          ].map((int) => (
            <div key={int.name} className="flex items-center justify-between py-2">
              <div className="flex items-center gap-2">
                <int.icon className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">{int.name}</span>
              </div>
              <Badge className={int.color}>{int.status}</Badge>
            </div>
          ))}
          <Separator />
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => toast.info("Test email functionality will be available after Edge Functions are deployed.")}>
              Test Email
            </Button>
            <Button variant="outline" size="sm" onClick={() => toast.info("Test WhatsApp functionality will be available after Edge Functions are deployed.")}>
              Test WhatsApp
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
