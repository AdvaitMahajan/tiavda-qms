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
    <div className="min-h-screen" style={{ background: "#F0F4F8" }}>
      {/* Header card */}
      <div
        style={{
          background: "#FFFFFF",
          borderRadius: "16px",
          padding: "20px 24px",
          border: "1px solid #E0E7EF",
          boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
          marginBottom: "24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "16px",
        }}
      >
        <div>
          <h1 className="font-bold" style={{ fontFamily: "Sora, sans-serif", fontSize: "24px", color: "#0A1929" }}>
            Clients
          </h1>
          <p className="text-sm mt-0.5" style={{ color: "#546E7A" }}>
            {isLoading ? "Loading…" : `${clients.length} total clients`}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: "#546E7A" }} />
            <Input
              placeholder="Search by name, phone, or city…"
              className="pl-9 w-56"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ borderColor: "#E0E7EF", fontSize: "13px" }}
            />
          </div>
          <button
            onClick={() => { setForm(emptyForm); setFormErrors({}); setPanelOpen(true); }}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all"
            style={{
              background: "linear-gradient(135deg,#1565C0,#2979FF)",
              color: "white",
              boxShadow: "0 4px 12px rgba(21,101,192,0.3)",
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.transform = "translateY(-1px)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.transform = "translateY(0)"; }}
          >
            <Plus className="h-4 w-4" /> Add Client
          </button>
        </div>
      </div>

      {isLoading ? (
        <div
          style={{
            background: "#FFFFFF",
            borderRadius: "16px",
            boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
            border: "1px solid #E0E7EF",
            overflow: "hidden",
          }}
        >
          {Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} />)}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Users}
          title={search ? "No clients match your search." : "No clients yet."}
          subtitle={!search ? "Generate an intake link to add your first client." : undefined}
        />
      ) : (
        <div
          style={{
            background: "#FFFFFF",
            borderRadius: "16px",
            boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
            border: "1px solid #E0E7EF",
            overflow: "hidden",
          }}
        >
          <Table>
            <TableHeader>
              <TableRow style={{ background: "#F8FAFC" }}>
                {["Name", "Phone", "Email", "City", "Source", "Created", "Actions"].map((h) => (
                  <TableHead
                    key={h}
                    className={h === "Actions" ? "text-right" : ""}
                    style={{ fontSize: "10px", color: "#546E7A", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600 }}
                  >
                    {h}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((c) => (
                <TableRow
                  key={c.id}
                  className="cursor-pointer transition-colors duration-100"
                  style={{ borderBottom: "1px solid #F0F4F8" }}
                  onClick={() => navigate(`/clients/${c.id}`)}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "#F8FAFC"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                >
                  <TableCell className="font-medium" style={{ color: "#0A1929" }}>{c.name}</TableCell>
                  <TableCell className="font-mono text-sm" style={{ color: "#546E7A" }}>{c.phone}</TableCell>
                  <TableCell className="text-sm" style={{ color: "#546E7A" }}>{c.email || "—"}</TableCell>
                  <TableCell style={{ color: "#546E7A" }}>{c.city}</TableCell>
                  <TableCell>
                    <Badge
                      variant="secondary"
                      className={cn("text-xs", c.source === "intake_form" ? "bg-blue-100 text-blue-700" : "bg-muted/20 text-muted-foreground")}
                    >
                      {c.source === "intake_form" ? "Form" : "Manual"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm" style={{ color: "#546E7A" }}>{formatDate(c.created_at)}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => { e.stopPropagation(); navigate(`/clients/${c.id}`); }}
                      style={{ color: "#1565C0", fontSize: "13px" }}
                    >
                      View
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Add Client Sheet */}
      <Sheet open={panelOpen} onOpenChange={setPanelOpen}>
        <SheetContent
          className="overflow-y-auto sm:max-w-md"
          style={{ boxShadow: "-8px 0 40px rgba(0,0,0,0.15)" }}
        >
          <SheetHeader
            style={{
              background: "linear-gradient(135deg,#F8FAFC,#F0F4F8)",
              margin: "-24px -24px 0",
              padding: "24px",
              borderBottom: "1px solid #E0E7EF",
            }}
          >
            <SheetTitle style={{ fontFamily: "Sora, sans-serif", color: "#0A1929" }}>Add New Client</SheetTitle>
          </SheetHeader>
          <div className="mt-6 space-y-4 px-1 pb-6">
            <Field label="Full Name" required value={form.name} onChange={(v) => updateForm({ name: v })} error={formErrors.name} />
            <Field label="Phone Number" required value={form.phone} onChange={(v) => updateForm({ phone: v })} error={formErrors.phone}
              onBlur={() => { if (form.phone) updateForm({ phone: normalizePhone(form.phone) }); }} />
            <Field label="Email" value={form.email} onChange={(v) => updateForm({ email: v })} type="email" />
            <Field label="Company Name" value={form.company} onChange={(v) => updateForm({ company: v })} />
            <Field label="City" required value={form.city} onChange={(v) => updateForm({ city: v })} error={formErrors.city} />
            <Field label="State" value={form.state} onChange={(v) => updateForm({ state: v })} />
            <Field label="WhatsApp Number (if different from phone)" value={form.whatsapp_number} onChange={(v) => updateForm({ whatsapp_number: v })} error={formErrors.whatsapp_number}
              onBlur={() => { if (form.whatsapp_number) updateForm({ whatsapp_number: normalizePhone(form.whatsapp_number) }); }} />
            <div>
              <label className="mb-1.5 block" style={{ fontSize: "11px", fontWeight: 600, color: "#546E7A", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Notes
              </label>
              <Textarea
                value={form.notes}
                onChange={(e) => updateForm({ notes: e.target.value })}
                rows={3}
                style={{ borderColor: "#E0E7EF", borderRadius: "10px" }}
              />
            </div>
          </div>
          <div
            className="px-1 pt-4"
            style={{ background: "#F8FAFC", borderTop: "1px solid #E0E7EF", margin: "0 -24px -24px", padding: "16px 24px" }}
          >
            <button
              onClick={handleSave}
              disabled={saving}
              className="w-full py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-50"
              style={{
                background: "linear-gradient(135deg,#1565C0,#2979FF)",
                color: "white",
                boxShadow: "0 4px 12px rgba(21,101,192,0.3)",
              }}
            >
              {saving ? "Saving…" : "Save Client"}
            </button>
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
      <label className="mb-1.5 block" style={{ fontSize: "11px", fontWeight: 600, color: "#546E7A", textTransform: "uppercase", letterSpacing: "0.05em" }}>
        {label} {required && <span style={{ color: "#C62828" }}>*</span>}
      </label>
      <Input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        style={{ borderColor: "#E0E7EF", borderRadius: "10px", fontSize: "14px" }}
      />
      {error && <p className="mt-1 text-xs" style={{ color: "#C62828" }}>{error}</p>}
    </div>
  );
}
