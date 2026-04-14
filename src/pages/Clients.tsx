import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn, formatDate } from "@/lib/utils";
import { Search, Users, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonRow } from "@/components/ui/SkeletonLoader";

function validateIndianMobile(phone: string): boolean {
  const cleaned = phone.replace(/[\s-]/g, "");
  return /^(\+91)?[6-9]\d{9}$/.test(cleaned);
}
function normalizePhone(phone: string): string {
  const cleaned = phone.replace(/[\s-]/g, "");
  if (/^\d{10}$/.test(cleaned)) return "+91" + cleaned;
  return cleaned;
}

type ClientForm = { name: string; phone: string; email: string; company: string; city: string; state: string; whatsapp_number: string; notes: string };
const emptyForm: ClientForm = { name: "", phone: "", email: "", company: "", city: "", state: "", whatsapp_number: "", notes: "" };

export default function Clients() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [panelOpen, setPanelOpen] = useState(false);
  const [form, setForm] = useState<ClientForm>(emptyForm);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const { data: clients = [], isLoading } = useQuery({
    queryKey: ["clients"],
    queryFn: async () => {
      const { data, error } = await supabase.from("clients").select("*").is("deleted_at", null).order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const filtered = useMemo(() => {
    if (!search.trim()) return clients;
    const q = search.toLowerCase();
    return clients.filter((c) => c.name.toLowerCase().includes(q) || c.phone.toLowerCase().includes(q) || c.city.toLowerCase().includes(q));
  }, [clients, search]);

  const validateForm = (): boolean => {
    const errs: Record<string, string> = {};
    if (!form.name.trim()) errs.name = "Name is required";
    if (!form.phone.trim()) errs.phone = "Phone is required";
    else if (!validateIndianMobile(form.phone)) errs.phone = "Enter a valid Indian mobile number";
    if (!form.city.trim()) errs.city = "City is required";
    if (form.whatsapp_number.trim() && !validateIndianMobile(form.whatsapp_number)) errs.whatsapp_number = "Enter a valid Indian mobile number";
    setFormErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSave = async () => {
    if (!validateForm()) return;
    setSaving(true);
    const { error } = await supabase.from("clients").insert({
      name: form.name.trim(), phone: normalizePhone(form.phone),
      email: form.email.trim() || null, company: form.company.trim() || null,
      city: form.city.trim(), state: form.state.trim() || null,
      whatsapp_number: form.whatsapp_number.trim() ? normalizePhone(form.whatsapp_number) : null,
      notes: form.notes.trim() || null, source: "manual",
    });
    setSaving(false);
    if (error) { toast.error(error.message); }
    else { toast.success("Client added"); setPanelOpen(false); setForm(emptyForm); queryClient.invalidateQueries({ queryKey: ["clients"] }); }
  };

  const updateForm = (patch: Partial<ClientForm>) => setForm((p) => ({ ...p, ...patch }));

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="font-sora text-2xl font-bold text-[#0F2A47]">Clients</h1>
        <Button onClick={() => { setForm(emptyForm); setFormErrors({}); setPanelOpen(true); }} className="bg-blue text-white hover:bg-blue/90">
          <Plus className="mr-2 h-4 w-4" /> Add Client
        </Button>
      </div>

      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Search by name, phone, or city…" className="pl-10" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {isLoading ? (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          {Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} />)}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Users}
          title={search ? "No clients match your search." : "No clients yet."}
          subtitle={!search ? "Generate an intake link to add your first client." : undefined}
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead><TableHead>Phone</TableHead><TableHead>Email</TableHead>
                <TableHead>City</TableHead><TableHead>Source</TableHead><TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((c) => (
                <TableRow key={c.id} className="hover:bg-[#F8FAFC] transition-colors duration-100 cursor-pointer" onClick={() => navigate(`/clients/${c.id}`)}>
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell className="font-mono text-sm">{c.phone}</TableCell>
                  <TableCell className="text-sm">{c.email || "—"}</TableCell>
                  <TableCell>{c.city}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className={cn("text-xs", c.source === "intake_form" ? "bg-blue-100 text-blue-700" : "bg-muted/20 text-muted-foreground")}>
                      {c.source === "intake_form" ? "Form" : "Manual"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{formatDate(c.created_at)}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); navigate(`/clients/${c.id}`); }}>View</Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Sheet open={panelOpen} onOpenChange={setPanelOpen}>
        <SheetContent className="overflow-y-auto sm:max-w-md">
          <SheetHeader><SheetTitle className="font-sora text-[#0F2A47]">Add New Client</SheetTitle></SheetHeader>
          <div className="mt-6 space-y-4">
            <Field label="Full Name" required value={form.name} onChange={(v) => updateForm({ name: v })} error={formErrors.name} />
            <Field label="Phone Number" required value={form.phone} onChange={(v) => updateForm({ phone: v })} error={formErrors.phone}
              onBlur={() => { if (form.phone) updateForm({ phone: normalizePhone(form.phone) }); }} />
            <Field label="Email" value={form.email} onChange={(v) => updateForm({ email: v })} type="email" />
            <Field label="Company Name" value={form.company} onChange={(v) => updateForm({ company: v })} />
            <Field label="City" required value={form.city} onChange={(v) => updateForm({ city: v })} error={formErrors.city} />
            <Field label="State" value={form.state} onChange={(v) => updateForm({ state: v })} />
            <Field label="WhatsApp Number (if different from phone)" value={form.whatsapp_number} onChange={(v) => updateForm({ whatsapp_number: v })} error={formErrors.whatsapp_number}
              onBlur={() => { if (form.whatsapp_number) updateForm({ whatsapp_number: normalizePhone(form.whatsapp_number) }); }} />
            <div><label className="mb-1.5 block text-sm font-medium">Notes</label>
              <Textarea value={form.notes} onChange={(e) => updateForm({ notes: e.target.value })} rows={3} /></div>
            <Button onClick={handleSave} disabled={saving} className="w-full bg-navy text-white hover:bg-navy/90">{saving ? "Saving…" : "Save Client"}</Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function Field({ label, required, value, onChange, error, type = "text", onBlur }: {
  label: string; required?: boolean; value: string; onChange: (v: string) => void; error?: string; type?: string; onBlur?: () => void;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium">{label} {required && <span className="text-destructive">*</span>}</label>
      <Input type={type} value={value} onChange={(e) => onChange(e.target.value)} onBlur={onBlur} />
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
  );
}
