import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/apiClient";
import { formatDate } from "@/lib/utils";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Building2, Plus, Users, Mail, MessageSquare, FolderOpen, ShieldCheck, Ban } from "lucide-react";

type Org = {
  id: string; name: string; slug: string | null; status: string; plan: string | null;
  created_at: string; user_count: number;
};
type Member = { id: string; email: string; full_name: string | null; role: string; is_active: boolean; created_at: string };
type IntegrationStatus = Record<
  "email" | "whatsapp" | "drive",
  { configured: boolean; is_active: boolean; config: Record<string, string> }
>;

export default function AdminConsole() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [manageOrg, setManageOrg] = useState<Org | null>(null);

  const { data: orgs = [], isLoading } = useQuery({
    queryKey: ["admin-orgs"],
    queryFn: () => apiClient.get<Org[]>("/admin/orgs"),
  });

  // ── Create org ──
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const createOrg = useMutation({
    mutationFn: () => apiClient.post("/admin/orgs", { name: name.trim(), slug: slug.trim() || undefined }),
    onSuccess: () => {
      toast.success("Organization created");
      qc.invalidateQueries({ queryKey: ["admin-orgs"] });
      setShowCreate(false); setName(""); setSlug("");
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
          <h1 className="font-bold text-2xl" style={{ fontFamily: "Sora, sans-serif", color: "#0A1929" }}>
            Platform Admin
          </h1>
          <p className="mt-1 text-sm" style={{ color: "#546E7A" }}>
            Manage client organizations, their first admin, and their integration keys. (Metadata only — client business data is not visible here.)
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)} className="bg-blue text-white hover:bg-blue/90">
          <Plus className="mr-1 h-4 w-4" /> New Organization
        </Button>
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
                      <Badge className={org.status === "suspended" ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"}>
                        {org.status}
                      </Badge>
                    </div>
                    <div className="text-[13px] text-muted-foreground flex items-center gap-3">
                      <span className="flex items-center gap-1"><Users className="h-3 w-3" /> {org.user_count} users</span>
                      {org.slug && <span className="font-mono">{org.slug}</span>}
                      <span>Created {formatDate(org.created_at)}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <Button variant="outline" size="sm" onClick={() => setManageOrg(org)}>Manage</Button>
                  <Button
                    variant="outline" size="sm"
                    onClick={() => toggleSuspend.mutate(org)}
                    className={org.status === "suspended" ? "text-green-700" : "text-red-700"}
                  >
                    {org.status === "suspended" ? <ShieldCheck className="h-3.5 w-3.5 mr-1" /> : <Ban className="h-3.5 w-3.5 mr-1" />}
                    {org.status === "suspended" ? "Reactivate" : "Suspend"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create org dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader><DialogTitle>New Organization</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Name *</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Acme Geotech" /></div>
            <div><Label>Slug (optional)</Label><Input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="acme-geotech" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={() => createOrg.mutate()} disabled={!name.trim() || createOrg.isPending}>Create</Button>
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

  // create admin/user
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("super_admin");
  const createUser = useMutation({
    mutationFn: () =>
      apiClient.post(`/admin/orgs/${org.id}/users`, {
        email: email.trim(), full_name: fullName.trim(), password: password.trim(), role,
      }),
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
              <Button
                className="w-full"
                disabled={!email.trim() || !fullName.trim() || password.trim().length < 6 || createUser.isPending}
                onClick={() => createUser.mutate()}
              >
                {createUser.isPending ? "Creating…" : "Create User"}
              </Button>
            </div>
          </section>

          {/* Integrations */}
          <section>
            <h3 className="font-semibold text-sm mb-2">Integrations</h3>
            <div className="space-y-3">
              <IntegrationForm
                orgId={org.id} provider="email" label="Email (Brevo)" icon={Mail}
                status={integrations?.email}
                configFields={[{ key: "sender_email", label: "Sender Email" }, { key: "sender_name", label: "Sender Name" }]}
                secretFields={[{ key: "api_key", label: "Brevo API Key" }]}
              />
              <IntegrationForm
                orgId={org.id} provider="whatsapp" label="WhatsApp (WATI)" icon={MessageSquare}
                status={integrations?.whatsapp}
                configFields={[{ key: "base_url", label: "WATI Base URL" }]}
                secretFields={[{ key: "api_token", label: "WATI API Token" }]}
              />
              <IntegrationForm
                orgId={org.id} provider="drive" label="Google Drive" icon={FolderOpen}
                status={integrations?.drive}
                configFields={[{ key: "root_folder_id", label: "Root Folder ID" }]}
                secretFields={[{ key: "service_account_b64", label: "Service Account (base64 JSON)" }]}
              />
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
              <Input
                defaultValue={status?.config?.[f.key] ?? ""}
                onChange={(e) => setConfig((c) => ({ ...c, [f.key]: e.target.value }))}
              />
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
