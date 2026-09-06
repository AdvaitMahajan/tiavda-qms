import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/apiClient";
import { DriveConnect } from "@/components/settings/DriveConnect";
import { formatDate } from "@/lib/utils";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Building2, Plus, Users, Mail, MessageSquare, FolderOpen, ShieldCheck, Ban, Layers, UserCheck, TrendingUp } from "lucide-react";

type Features = Record<string, boolean>;
type Org = {
  id: string; name: string; slug: string | null; status: string; plan: string | null;
  features: Features; limits: Record<string, unknown>; created_at: string; user_count: number;
};
type Member = { id: string; email: string; full_name: string | null; role: string; is_active: boolean; created_at: string };
type IntegrationStatus = Record<
  "email" | "whatsapp" | "drive",
  { configured: boolean; is_active: boolean; config: Record<string, string> }
>;

const PLANS = ["starter", "pro", "enterprise"] as const;
const PLAN_DEFAULTS: Record<string, Features> = {
  starter: { quotations: true, payments: false, site_visits: false, comms: false },
  pro: { quotations: true, payments: true, site_visits: true, comms: false },
  enterprise: { quotations: true, payments: true, site_visits: true, comms: true },
};
const FEATURES: { key: string; label: string }[] = [
  { key: "quotations", label: "Quotations & Rate Matrix" },
  { key: "payments", label: "Payments & Accounts" },
  { key: "site_visits", label: "Site Visits & Mobilisation" },
  { key: "comms", label: "Email / WhatsApp / Drive" },
];

function Kpi({ icon: Icon, label, value, color, bg }: { icon: any; label: string; value: string | number; color: string; bg: string }) {
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        <div className="flex items-center justify-center rounded-xl flex-shrink-0" style={{ width: 40, height: 40, background: bg }}>
          <Icon className="h-5 w-5" style={{ color }} />
        </div>
        <div>
          <div className="text-[12px] font-semibold uppercase tracking-wide" style={{ color: "#546E7A" }}>{label}</div>
          <div className="font-sora text-xl font-bold" style={{ color: "#0A1929" }}>{value}</div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function AdminConsole() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [manageOrg, setManageOrg] = useState<Org | null>(null);

  const { data: orgs = [], isLoading } = useQuery({
    queryKey: ["admin-orgs"],
    queryFn: () => apiClient.get<Org[]>("/admin/orgs"),
  });

  const kpis = useMemo(() => {
    const total = orgs.length;
    const active = orgs.filter((o) => o.status === "active").length;
    const suspended = orgs.filter((o) => o.status === "suspended").length;
    const users = orgs.reduce((s, o) => s + (o.user_count ?? 0), 0);
    const weekAgo = Date.now() - 7 * 86400000;
    const newThisWeek = orgs.filter((o) => new Date(o.created_at).getTime() >= weekAgo).length;
    return { total, active, suspended, users, newThisWeek };
  }, [orgs]);

  // ── Create org + (optional) first admin ──
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [plan, setPlan] = useState<string>("pro");
  const [features, setFeatures] = useState<Features>(PLAN_DEFAULTS.pro);
  const [adminName, setAdminName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");

  const resetCreate = () => {
    setName(""); setSlug(""); setPlan("pro"); setFeatures(PLAN_DEFAULTS.pro);
    setAdminName(""); setAdminEmail(""); setAdminPassword("");
  };

  const createOrg = useMutation({
    mutationFn: async () => {
      const org = await apiClient.post<{ id: string }>("/admin/orgs", { name: name.trim(), slug: slug.trim() || undefined, plan, features });
      if (adminEmail.trim() && adminName.trim() && adminPassword.trim().length >= 6) {
        await apiClient.post(`/admin/orgs/${org.id}/users`, {
          email: adminEmail.trim(), full_name: adminName.trim(), password: adminPassword.trim(), role: "super_admin",
        });
      }
      return org;
    },
    onSuccess: () => {
      toast.success("Organization created");
      qc.invalidateQueries({ queryKey: ["admin-orgs"] });
      setShowCreate(false); resetCreate();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const toggleSuspend = useMutation({
    mutationFn: (org: Org) =>
      apiClient.patch(`/admin/orgs/${org.id}`, { status: org.status === "suspended" ? "active" : "suspended" }),
    onSuccess: () => { toast.success("Updated"); qc.invalidateQueries({ queryKey: ["admin-orgs"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-bold text-2xl" style={{ fontFamily: "Sora, sans-serif", color: "#0A1929" }}>Platform Admin</h1>
          <p className="mt-1 text-sm" style={{ color: "#546E7A" }}>
            Manage client organizations, their plans &amp; features, first admin, and integration keys. (Metadata only — client business data is not visible here.)
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)} className="text-white hover:opacity-90" style={{ background: "#1565C0" }}>
          <Plus className="mr-1 h-4 w-4" /> New Organization
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Kpi icon={Building2} label="Organizations" value={kpis.total} color="#1565C0" bg="#EBF2FF" />
        <Kpi icon={ShieldCheck} label="Active" value={kpis.active} color="#15673A" bg="#DCFCE7" />
        <Kpi icon={Ban} label="Suspended" value={kpis.suspended} color="#B91C1C" bg="#FEE2E2" />
        <Kpi icon={Users} label="Total Users" value={kpis.users} color="#6A1B9A" bg="#F3E8FF" />
        <Kpi icon={TrendingUp} label="New (7d)" value={kpis.newThisWeek} color="#E65100" bg="#FFF3E0" />
      </div>

      {isLoading ? (
        <div className="space-y-3">{[1, 2].map((i) => <div key={i} className="h-20 bg-muted/30 animate-pulse rounded-lg" />)}</div>
      ) : orgs.length === 0 ? (
        <Card><CardContent className="p-10 text-center text-sm text-muted-foreground">
          No organizations yet. Create your first client org to get started.
        </CardContent></Card>
      ) : (
        <div className="space-y-3">
          {orgs.map((org) => (
            <Card key={org.id}>
              <CardContent className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex items-center justify-center rounded-lg flex-shrink-0" style={{ width: 40, height: 40, background: "#EBF2FF" }}>
                    <Building2 className="h-5 w-5" style={{ color: "#1565C0" }} />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm" style={{ color: "#0A1929" }}>{org.name}</span>
                      <Badge className={org.status === "suspended" ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"}>{org.status}</Badge>
                      {org.plan && <Badge variant="secondary" className="capitalize">{org.plan}</Badge>}
                    </div>
                    <div className="text-[13px] text-muted-foreground flex items-center gap-3 flex-wrap">
                      <span className="flex items-center gap-1"><Users className="h-3 w-3" /> {org.user_count} users</span>
                      <span className="flex items-center gap-1"><Layers className="h-3 w-3" /> {FEATURES.filter((f) => org.features?.[f.key]).length}/{FEATURES.length} features</span>
                      <span>Created {formatDate(org.created_at)}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <Button variant="outline" size="sm" onClick={() => setManageOrg(org)}>Manage</Button>
                  <Button variant="outline" size="sm" onClick={() => toggleSuspend.mutate(org)} className={org.status === "suspended" ? "text-green-700" : "text-red-700"}>
                    {org.status === "suspended" ? <ShieldCheck className="h-3.5 w-3.5 mr-1" /> : <Ban className="h-3.5 w-3.5 mr-1" />}
                    {org.status === "suspended" ? "Reactivate" : "Suspend"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create org wizard */}
      <Dialog open={showCreate} onOpenChange={(o) => { setShowCreate(o); if (!o) resetCreate(); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>New Organization</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Organization Name *</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Acme Geotech" /></div>
            <div><Label>Slug (optional)</Label><Input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="acme-geotech" /></div>
            <div>
              <Label>Plan</Label>
              <Select value={plan} onValueChange={(p) => { setPlan(p); setFeatures(PLAN_DEFAULTS[p] ?? features); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{PLANS.map((p) => <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="mb-1.5 block">Features</Label>
              <div className="space-y-2 rounded-lg p-3" style={{ border: "1px solid #E0E7EF" }}>
                {FEATURES.map((f) => (
                  <div key={f.key} className="flex items-center justify-between">
                    <span className="text-[13px]">{f.label}</span>
                    <Switch checked={!!features[f.key]} onCheckedChange={(v) => setFeatures((s) => ({ ...s, [f.key]: v }))} />
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-lg p-3" style={{ border: "1px solid #E0E7EF", background: "#FAFBFC" }}>
              <div className="text-[13px] font-semibold mb-2 flex items-center gap-1.5"><UserCheck className="h-4 w-4" /> First Admin (optional — can add later)</div>
              <div className="space-y-2">
                <Input value={adminName} onChange={(e) => setAdminName(e.target.value)} placeholder="Admin full name" />
                <Input type="email" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} placeholder="admin@client.com" />
                <Input type="password" value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} placeholder="Password (min 6 chars)" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={() => createOrg.mutate()} disabled={!name.trim() || createOrg.isPending}>
              {createOrg.isPending ? "Creating…" : "Create Organization"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {manageOrg && <ManageOrgSheet org={manageOrg} onClose={() => setManageOrg(null)} />}
    </div>
  );
}

function ManageOrgSheet({ org, onClose }: { org: Org; onClose: () => void }) {
  const qc = useQueryClient();
  const { data: members = [] } = useQuery({
    queryKey: ["admin-org-members", org.id],
    queryFn: () => apiClient.get<Member[]>(`/admin/orgs/${org.id}/users`),
  });
  const { data: integrations } = useQuery({
    queryKey: ["admin-org-integrations", org.id],
    queryFn: () => apiClient.get<IntegrationStatus>(`/admin/orgs/${org.id}/integrations`),
  });

  // Plan & features editor
  const [plan, setPlan] = useState<string>(org.plan ?? "pro");
  const [features, setFeatures] = useState<Features>({
    quotations: org.features?.quotations !== false,
    payments: !!org.features?.payments,
    site_visits: !!org.features?.site_visits,
    comms: !!org.features?.comms,
  });
  const savePlan = useMutation({
    mutationFn: () => apiClient.patch(`/admin/orgs/${org.id}`, { plan, features }),
    onSuccess: () => { toast.success("Plan & features updated"); qc.invalidateQueries({ queryKey: ["admin-orgs"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  // create user
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("super_admin");
  const createUser = useMutation({
    mutationFn: () => apiClient.post(`/admin/orgs/${org.id}/users`, { email: email.trim(), full_name: fullName.trim(), password: password.trim(), role }),
    onSuccess: () => {
      toast.success(`User created for ${org.name}`);
      qc.invalidateQueries({ queryKey: ["admin-org-members", org.id] });
      qc.invalidateQueries({ queryKey: ["admin-orgs"] });
      setEmail(""); setFullName(""); setPassword(""); setRole("super_admin");
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="overflow-y-auto sm:max-w-lg">
        <SheetHeader><SheetTitle>{org.name}</SheetTitle></SheetHeader>
        <div className="space-y-6 mt-6">
          {/* Plan & Features */}
          <section className="rounded-lg p-3" style={{ border: "1px solid #E0E7EF" }}>
            <h3 className="font-semibold text-sm mb-2 flex items-center gap-2"><Layers className="h-4 w-4" /> Plan &amp; Features</h3>
            <div className="mb-2">
              <Label className="text-[12px]">Plan</Label>
              <Select value={plan} onValueChange={(p) => { setPlan(p); setFeatures(PLAN_DEFAULTS[p] ?? features); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{PLANS.map((p) => <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              {FEATURES.map((f) => (
                <div key={f.key} className="flex items-center justify-between">
                  <span className="text-[13px]">{f.label}</span>
                  <Switch checked={!!features[f.key]} onCheckedChange={(v) => setFeatures((s) => ({ ...s, [f.key]: v }))} />
                </div>
              ))}
            </div>
            <Button className="w-full mt-3" size="sm" disabled={savePlan.isPending} onClick={() => savePlan.mutate()}>
              {savePlan.isPending ? "Saving…" : "Save Plan & Features"}
            </Button>
          </section>

          {/* Members */}
          <section>
            <h3 className="font-semibold text-sm mb-2 flex items-center gap-2"><Users className="h-4 w-4" /> Members ({members.length})</h3>
            <div className="space-y-1.5">
              {members.map((m) => (
                <div key={m.id} className="flex items-center justify-between text-[13px] p-2 rounded-md" style={{ background: "#F8FAFC" }}>
                  <div className="min-w-0">
                    <div className="font-medium truncate" style={{ color: "#0A1929" }}>{m.full_name || m.email}</div>
                    <div className="text-muted-foreground truncate">{m.email}</div>
                  </div>
                  <Badge variant="secondary" className="capitalize">{m.role.replace("_", " ")}</Badge>
                </div>
              ))}
              {members.length === 0 && <p className="text-[13px] text-muted-foreground">No members yet — create the first admin below.</p>}
            </div>
          </section>

          {/* Create user */}
          <section className="rounded-lg p-3" style={{ border: "1px solid #E0E7EF" }}>
            <h3 className="font-semibold text-sm mb-2">{members.length === 0 ? "Create First Admin" : "Add User"}</h3>
            <div className="space-y-2.5">
              <div><Label>Full Name</Label><Input value={fullName} onChange={(e) => setFullName(e.target.value)} /></div>
              <div><Label>Email</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
              <div><Label>Password</Label><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Min 6 characters" /></div>
              <div>
                <Label>Role</Label>
                <Select value={role} onValueChange={setRole}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="super_admin">Super Admin</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="mobilization_lead">Mobilization Lead</SelectItem>
                    <SelectItem value="viewer">Viewer</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button className="w-full" disabled={!email.trim() || !fullName.trim() || password.trim().length < 6 || createUser.isPending} onClick={() => createUser.mutate()}>
                {createUser.isPending ? "Creating…" : "Create User"}
              </Button>
            </div>
          </section>

          {/* Integrations */}
          <section>
            <h3 className="font-semibold text-sm mb-2">Integrations</h3>
            <div className="space-y-3">
              <IntegrationForm orgId={org.id} provider="email" label="Email (Brevo)" icon={Mail} status={integrations?.email}
                configFields={[{ key: "sender_email", label: "Sender Email" }, { key: "sender_name", label: "Sender Name" }]}
                secretFields={[{ key: "api_key", label: "Brevo API Key" }]} />
              <IntegrationForm orgId={org.id} provider="whatsapp" label="WhatsApp (WATI)" icon={MessageSquare} status={integrations?.whatsapp}
                configFields={[{ key: "base_url", label: "WATI Base URL" }]}
                secretFields={[{ key: "api_token", label: "WATI API Token" }]} />
              <DriveConnect orgId={org.id} />
            </div>
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function IntegrationForm({
  orgId, provider, label, icon: Icon, status, configFields, secretFields,
}: {
  orgId: string; provider: "email" | "whatsapp" | "drive"; label: string; icon: any;
  status?: { configured: boolean; is_active: boolean; config: Record<string, string> };
  configFields: { key: string; label: string }[];
  secretFields: { key: string; label: string }[];
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [config, setConfig] = useState<Record<string, string>>({});
  const [secrets, setSecrets] = useState<Record<string, string>>({});

  const save = useMutation({
    mutationFn: () =>
      apiClient.put(`/admin/orgs/${orgId}/integrations/${provider}`, {
        config: Object.fromEntries(Object.entries(config).filter(([, v]) => v !== "")),
        secrets: Object.fromEntries(Object.entries(secrets).filter(([, v]) => v !== "")),
        is_active: true,
      }),
    onSuccess: () => {
      toast.success(`${label} saved`);
      qc.invalidateQueries({ queryKey: ["admin-org-integrations", orgId] });
      setOpen(false); setSecrets({});
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="rounded-lg p-3" style={{ border: "1px solid #E0E7EF" }}>
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 text-[13px] font-medium"><Icon className="h-4 w-4 text-muted-foreground" /> {label}</span>
        <div className="flex items-center gap-2">
          <Badge className={status?.configured ? (status.is_active ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700") : "bg-slate-200 text-slate-600"}>
            {status?.configured ? (status.is_active ? "Active" : "Inactive") : "Not configured"}
          </Badge>
          <Button variant="outline" size="sm" onClick={() => setOpen((v) => !v)}>{open ? "Close" : "Set keys"}</Button>
        </div>
      </div>
      {open && (
        <div className="space-y-2.5 mt-3">
          {configFields.map((f) => (
            <div key={f.key}>
              <Label className="text-[12px]">{f.label}</Label>
              <Input defaultValue={status?.config?.[f.key] ?? ""} onChange={(e) => setConfig((c) => ({ ...c, [f.key]: e.target.value }))} />
            </div>
          ))}
          {secretFields.map((f) => (
            <div key={f.key}>
              <Label className="text-[12px]">{f.label}</Label>
              <Input type="password" placeholder="••••••" onChange={(e) => setSecrets((s) => ({ ...s, [f.key]: e.target.value }))} />
            </div>
          ))}
          <Button className="w-full" size="sm" disabled={save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? "Saving…" : "Save"}
          </Button>
        </div>
      )}
    </div>
  );
}
