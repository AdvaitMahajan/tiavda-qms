import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn, formatDate } from "@/lib/utils";
import {
  Phone, Mail, MapPin, AlertTriangle, Link as LinkIcon, Copy, Check,
  RefreshCw, ArrowLeft, Pencil,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { StatusBadge } from "@/components/ui/StatusBadge";

function validateIndianMobile(phone: string): boolean {
  const cleaned = phone.replace(/[\s-]/g, "");
  return /^(\+91)?[6-9]\d{9}$/.test(cleaned);
}
function normalizePhone(phone: string): string {
  const cleaned = phone.replace(/[\s-]/g, "");
  if (/^\d{10}$/.test(cleaned)) return "+91" + cleaned;
  return cleaned;
}

export default function ClientDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState<Record<string, string>>({});
  const [editErrors, setEditErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [generatingLink, setGeneratingLink] = useState(false);

  const { data: client, isLoading: clientLoading } = useQuery({
    queryKey: ["client", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("clients").select("*").eq("id", id!).single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  const { data: activeToken, refetch: refetchToken } = useQuery({
    queryKey: ["intake-token", id],
    queryFn: async () => {
      const { data } = await supabase.from("intake_tokens").select("*")
        .eq("client_id", id!).eq("status", "active")
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      return data;
    },
    enabled: !!id,
  });

  const { data: enquiries = [] } = useQuery({
    queryKey: ["client-enquiries", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("enquiries").select("*")
        .eq("client_id", id!).is("deleted_at", null).order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  useEffect(() => {
    if (client) {
      setEditForm({
        name: client.name || "", phone: client.phone || "", email: client.email || "",
        company: client.company || "", city: client.city || "", state: client.state || "",
        whatsapp_number: client.whatsapp_number || "", notes: client.notes || "",
      });
    }
  }, [client]);

  const intakeLink = activeToken ? `${window.location.origin}/intake?t=${activeToken.token}` : null;

  const copyLink = () => {
    if (intakeLink) { navigator.clipboard.writeText(intakeLink); setCopied(true); setTimeout(() => setCopied(false), 2000); }
  };

  const generateToken = async () => {
    setGeneratingLink(true);
    try {
      if (activeToken) await supabase.from("intake_tokens").update({ status: "expired" }).eq("id", activeToken.id);
      const arr = new Uint8Array(24);
      crypto.getRandomValues(arr);
      const token = btoa(String.fromCharCode(...arr)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from("intake_tokens").insert({
        token, client_id: id!, created_by: user!.id,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      });
      if (error) throw error;
      toast.success("Intake link generated");
      refetchToken();
    } catch (err: any) { toast.error(err.message); }
    finally { setGeneratingLink(false); }
  };

  const handleEditSave = async () => {
    const errs: Record<string, string> = {};
    if (!editForm.name?.trim()) errs.name = "Required";
    if (!editForm.phone?.trim()) errs.phone = "Required";
    else if (!validateIndianMobile(editForm.phone)) errs.phone = "Invalid number";
    if (!editForm.city?.trim()) errs.city = "Required";
    if (editForm.whatsapp_number?.trim() && !validateIndianMobile(editForm.whatsapp_number)) errs.whatsapp_number = "Invalid number";
    setEditErrors(errs);
    if (Object.keys(errs).length) return;

    setSaving(true);
    const { error } = await supabase.from("clients").update({
      name: editForm.name.trim(), phone: normalizePhone(editForm.phone),
      email: editForm.email?.trim() || null, company: editForm.company?.trim() || null,
      city: editForm.city.trim(), state: editForm.state?.trim() || null,
      whatsapp_number: editForm.whatsapp_number?.trim() ? normalizePhone(editForm.whatsapp_number) : null,
      notes: editForm.notes?.trim() || null,
    }).eq("id", id!);
    setSaving(false);
    if (error) { toast.error(error.message); }
    else { toast.success("Client updated"); setEditOpen(false); queryClient.invalidateQueries({ queryKey: ["client", id] }); }
  };

  if (clientLoading) return <div className="py-20 text-center text-muted-foreground">Loading…</div>;
  if (!client) return (
    <div className="flex flex-col items-center py-20">
      <p className="mb-4 text-lg font-medium">Client not found</p>
      <Button variant="outline" onClick={() => navigate("/clients")}><ArrowLeft className="mr-2 h-4 w-4" /> Back to Clients</Button>
    </div>
  );

  return (
    <div className="space-y-6 min-h-screen" style={{ background: "#F0F4F8" }}>
      {/* Header */}
      <div
        style={{
          background: "#FFFFFF",
          borderRadius: "16px",
          padding: "24px",
          border: "1px solid #E0E7EF",
          boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
        }}
      >
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <button
                onClick={() => navigate("/clients")}
                className="flex items-center gap-1 text-sm transition-colors"
                style={{ color: "#546E7A" }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "#0A1929"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "#546E7A"; }}
              >
                <ArrowLeft className="h-4 w-4" /> Clients
              </button>
            </div>
            <h1 className="font-bold text-2xl" style={{ fontFamily: "Sora, sans-serif", color: "#0A1929" }}>{client.name}</h1>
            {client.company && <p className="text-sm italic mt-0.5" style={{ color: "#546E7A" }}>{client.company}</p>}
            <div className="mt-3 flex flex-wrap items-center gap-4 text-sm">
              <a href={`tel:${client.phone}`} className="flex items-center gap-1.5 hover:underline" style={{ color: "#1565C0" }}><Phone className="h-4 w-4" />{client.phone}</a>
              {client.email && <a href={`mailto:${client.email}`} className="flex items-center gap-1.5 hover:underline" style={{ color: "#1565C0" }}><Mail className="h-4 w-4" />{client.email}</a>}
              <span className="flex items-center gap-1.5" style={{ color: "#546E7A" }}><MapPin className="h-4 w-4" />{client.city}{client.state ? `, ${client.state}` : ""}</span>
            </div>
          </div>
          <button
            onClick={() => setEditOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition-all"
            style={{ border: "1.5px solid #E0E7EF", color: "#546E7A", background: "#FAFBFC" }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "#F0F4F8"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "#FAFBFC"; }}
          >
            <Pencil className="h-3.5 w-3.5" /> Edit
          </button>
        </div>
      </div>

      {client.email_bounced && (
        <div className="flex items-center gap-3 rounded-lg border border-amber/30 bg-amber/5 px-4 py-3 text-sm text-amber">
          <AlertTriangle className="h-5 w-5 shrink-0" /> Email address has bounced — please update the email.
        </div>
      )}
      {client.whatsapp_invalid && (
        <div className="flex items-center gap-3 rounded-lg border border-amber/30 bg-amber/5 px-4 py-3 text-sm text-amber">
          <AlertTriangle className="h-5 w-5 shrink-0" /> WhatsApp number is invalid — please update.
        </div>
      )}

      {/* Intake Link */}
      <div style={{ background: "#FFFFFF", borderRadius: "16px", padding: "24px", border: "1px solid #E0E7EF", boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}>
        <h2 className="mb-4 flex items-center gap-2 font-semibold text-lg" style={{ fontFamily: "Sora, sans-serif", color: "#0A1929" }}><LinkIcon className="h-5 w-5" /> Intake Form Link</h2>
        {intakeLink ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 rounded-lg bg-surface px-3 py-2">
              <code className="flex-1 truncate text-sm font-mono">{intakeLink}</code>
              <Button variant="ghost" size="sm" onClick={copyLink}>
                {copied ? <><Check className="mr-1 h-4 w-4 text-green" /> Copied!</> : <><Copy className="mr-1 h-4 w-4" /> Copy</>}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">Expires: {formatDate(activeToken!.expires_at)}</p>
            <div className="flex gap-2 flex-wrap">
              <Button variant="outline" size="sm" onClick={generateToken} disabled={generatingLink}>
                <RefreshCw className={cn("mr-1.5 h-3.5 w-3.5", generatingLink && "animate-spin")} /> Regenerate
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate(`/intake?t=${activeToken!.token}`)}
                style={{ borderColor: "#2E7FC1", color: "#2E7FC1" }}
              >
                Fill Form on Behalf of Client
              </Button>
            </div>
          </div>
        ) : (
          <div>
            <p className="mb-3 text-sm text-muted-foreground">No active link. Generate one to share with the client.</p>
            <Button onClick={generateToken} disabled={generatingLink} className="bg-navy text-white hover:bg-navy/90">
              {generatingLink ? "Generating…" : "Generate Intake Link"}
            </Button>
          </div>
        )}
      </div>

      {/* Enquiry History */}
      <div style={{ background: "#FFFFFF", borderRadius: "16px", padding: "24px", border: "1px solid #E0E7EF", boxShadow: "0 2px 8px rgba(0,0,0,0.06)", overflow: "hidden" }}>
        <h2 className="mb-4 font-semibold text-lg" style={{ fontFamily: "Sora, sans-serif", color: "#0A1929" }}>Enquiry History</h2>
        {enquiries.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No enquiries yet for this client.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ref #</TableHead><TableHead>Date</TableHead><TableHead>Status</TableHead>
                  <TableHead>Bores</TableHead><TableHead>City</TableHead><TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {enquiries.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="font-mono text-sm">{e.ref_number}</TableCell>
                    <TableCell className="text-sm">{formatDate(e.enquiry_date)}</TableCell>
                    <TableCell>
                      <StatusBadge status={e.status} />
                    </TableCell>
                    <TableCell>{e.num_bores}</TableCell>
                    <TableCell>{e.site_city}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => navigate(`/enquiries/${e.id}`)}>View</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Edit Panel */}
      <Sheet open={editOpen} onOpenChange={setEditOpen}>
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
            <SheetTitle style={{ fontFamily: "Sora, sans-serif", color: "#0A1929" }}>Edit Client</SheetTitle>
          </SheetHeader>
          <div className="mt-6 space-y-4 px-1 pb-6">
            <EditField label="Full Name" required value={editForm.name} onChange={(v) => setEditForm((p) => ({ ...p, name: v }))} error={editErrors.name} />
            <EditField label="Phone Number" required value={editForm.phone} onChange={(v) => setEditForm((p) => ({ ...p, phone: v }))} error={editErrors.phone}
              onBlur={() => { if (editForm.phone) setEditForm((p) => ({ ...p, phone: normalizePhone(editForm.phone) })); }} />
            <EditField label="Email" value={editForm.email} onChange={(v) => setEditForm((p) => ({ ...p, email: v }))} type="email" />
            <EditField label="Company Name" value={editForm.company} onChange={(v) => setEditForm((p) => ({ ...p, company: v }))} />
            <EditField label="City" required value={editForm.city} onChange={(v) => setEditForm((p) => ({ ...p, city: v }))} error={editErrors.city} />
            <EditField label="State" value={editForm.state} onChange={(v) => setEditForm((p) => ({ ...p, state: v }))} />
            <EditField label="WhatsApp Number (if different from phone)" value={editForm.whatsapp_number} onChange={(v) => setEditForm((p) => ({ ...p, whatsapp_number: v }))} error={editErrors.whatsapp_number}
              onBlur={() => { if (editForm.whatsapp_number) setEditForm((p) => ({ ...p, whatsapp_number: normalizePhone(editForm.whatsapp_number) })); }} />
            <div>
              <label className="mb-1.5 block" style={{ fontSize: "11px", fontWeight: 600, color: "#546E7A", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Notes
              </label>
              <Textarea value={editForm.notes} onChange={(e) => setEditForm((p) => ({ ...p, notes: e.target.value }))} rows={3} style={{ borderColor: "#E0E7EF", borderRadius: "10px" }} />
            </div>
          </div>
          <div style={{ background: "#F8FAFC", borderTop: "1px solid #E0E7EF", margin: "0 -24px -24px", padding: "16px 24px" }}>
            <button
              onClick={handleEditSave}
              disabled={saving}
              className="w-full py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-50"
              style={{
                background: "linear-gradient(135deg,#1565C0,#2979FF)",
                color: "white",
                boxShadow: "0 4px 12px rgba(21,101,192,0.3)",
              }}
            >
              {saving ? "Saving…" : "Save Changes"}
            </button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function EditField({ label, required, value, onChange, error, type = "text", onBlur }: {
  label: string; required?: boolean; value: string; onChange: (v: string) => void; error?: string; type?: string; onBlur?: () => void;
}) {
  return (
    <div>
      <label className="mb-1.5 block" style={{ fontSize: "11px", fontWeight: 600, color: "#546E7A", textTransform: "uppercase", letterSpacing: "0.05em" }}>
        {label} {required && <span style={{ color: "#C62828" }}>*</span>}
      </label>
      <Input type={type} value={value || ""} onChange={(e) => onChange(e.target.value)} onBlur={onBlur} style={{ borderColor: "#E0E7EF", borderRadius: "10px", fontSize: "14px" }} />
      {error && <p className="mt-1 text-xs" style={{ color: "#C62828" }}>{error}</p>}
    </div>
  );
}
