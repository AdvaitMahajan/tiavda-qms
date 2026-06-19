import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Search, Users, Plus, Phone, Mail, MapPin, UserPlus, Link2 } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
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

function avatarGradient(name: string): string {
  const c = (name?.[0] ?? "?").toUpperCase();
  if (c >= "A" && c <= "F") return "linear-gradient(135deg,#1565C0,#2979FF)";
  if (c >= "G" && c <= "L") return "linear-gradient(135deg,#6A1B9A,#AB47BC)";
  if (c >= "M" && c <= "R") return "linear-gradient(135deg,#00897B,#26A69A)";
  return "linear-gradient(135deg,#E65100,#FF8F00)";
}

type ClientForm = { name: string; phone: string; email: string; company: string; city: string; state: string; pincode: string; whatsapp_number: string; source: string; notes: string };
const emptyForm: ClientForm = { name: "", phone: "", email: "", company: "", city: "", state: "", pincode: "", whatsapp_number: "", source: "", notes: "" };

export default function Clients() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [panelOpen, setPanelOpen] = useState(false);
  const [form, setForm] = useState<ClientForm>(emptyForm);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [viewHover, setViewHover] = useState<string | null>(null);

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

  // Stat counts
  const now = new Date();
  const addedThisMonth = clients.filter((c) => {
    const d = new Date(c.created_at);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length;
  // TODO wire count — no has_active_intake_token field available on clients table
  const withActiveLinks = "—";

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
      pincode: form.pincode.trim() || null,
      whatsapp_number: form.whatsapp_number.trim() ? normalizePhone(form.whatsapp_number) : null,
      notes: form.notes.trim() || null, source: form.source.trim() || "manual",
    });
    setSaving(false);
    if (error) { toast.error(error.message); }
    else { toast.success("Client added"); setPanelOpen(false); setForm(emptyForm); queryClient.invalidateQueries({ queryKey: ["clients"] }); }
  };

  const updateForm = (patch: Partial<ClientForm>) => setForm((p) => ({ ...p, ...patch }));

  const openAddPanel = () => { setForm(emptyForm); setFormErrors({}); setPanelOpen(true); };

  const goldBtn: React.CSSProperties = {
    background: "linear-gradient(135deg, #FF8F00, #FFB300)",
    color: "white", border: "none", borderRadius: "10px",
    padding: "9px 18px", fontSize: "13px", fontWeight: 600,
    cursor: "pointer", display: "flex", alignItems: "center", gap: "6px",
    boxShadow: "0 4px 16px rgba(255,143,0,0.4)", whiteSpace: "nowrap",
  };

  return (
    <div style={{ background: "#F0F4F8", minHeight: "100vh", padding: "24px" }}>

      {/* Header card — dark gradient */}
      <div
        style={{
          background: "linear-gradient(135deg, #0A1929 0%, #1565C0 100%)",
          borderRadius: "20px", padding: "28px 32px", marginBottom: "24px",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          boxShadow: "0 8px 32px rgba(10,25,41,0.25)", flexWrap: "wrap", gap: "16px",
        }}
      >
        <div>
          <h1 style={{ fontFamily: "Sora, sans-serif", fontWeight: 700, fontSize: "28px", color: "white", margin: 0 }}>
            Clients
          </h1>
          <p style={{ color: "rgba(255,255,255,0.6)", fontSize: "13px", marginTop: "4px" }}>
            Manage your client relationships
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          {/* Glass search input */}
          <div style={{ position: "relative" }}>
            <Search style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", width: "14px", height: "14px", color: "rgba(255,255,255,0.4)" }} />
            <input
              className="glass-input"
              style={{
                background: "rgba(255,255,255,0.12)",
                border: "1px solid rgba(255,255,255,0.2)",
                borderRadius: "10px",
                padding: "8px 14px 8px 36px",
                color: "white", fontSize: "13px", width: "220px",
                backdropFilter: "blur(10px)",
                outline: "none",
              }}
              placeholder="Search clients..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {/* Add Client button */}
          <button onClick={openAddPanel} style={goldBtn}>
            <Plus className="w-4 h-4" /> Add Client
          </button>
        </div>
      </div>

      {/* Stats row — 3 cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "16px", marginBottom: "24px" }}>
        {/* Total Clients */}
        <div style={{
          background: "white", borderRadius: "14px", padding: "16px 20px",
          border: "1px solid #E0E7EF", boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div>
            <div style={{ fontFamily: "Sora, sans-serif", fontWeight: 700, fontSize: "28px", color: "#0A1929", lineHeight: 1 }}>{clients.length}</div>
            <div style={{ fontSize: "12px", color: "#546E7A", textTransform: "uppercase", letterSpacing: "0.08em", marginTop: "6px" }}>Total Clients</div>
          </div>
          <div style={{ width: "40px", height: "40px", borderRadius: "50%", background: "#EBF2FF", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Users style={{ width: "18px", height: "18px", color: "#1565C0" }} />
          </div>
        </div>

        {/* Added This Month */}
        <div style={{
          background: "white", borderRadius: "14px", padding: "16px 20px",
          border: "1px solid #E0E7EF", boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div>
            <div style={{ fontFamily: "Sora, sans-serif", fontWeight: 700, fontSize: "28px", color: "#0A1929", lineHeight: 1 }}>{addedThisMonth}</div>
            <div style={{ fontSize: "12px", color: "#546E7A", textTransform: "uppercase", letterSpacing: "0.08em", marginTop: "6px" }}>Added This Month</div>
          </div>
          <div style={{ width: "40px", height: "40px", borderRadius: "50%", background: "#FFF3E0", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <UserPlus style={{ width: "18px", height: "18px", color: "#E65100" }} />
          </div>
        </div>

        {/* With Active Links */}
        <div style={{
          background: "white", borderRadius: "14px", padding: "16px 20px",
          border: "1px solid #E0E7EF", boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div>
            <div style={{ fontFamily: "Sora, sans-serif", fontWeight: 700, fontSize: "28px", color: "#0A1929", lineHeight: 1 }}>{withActiveLinks}</div>
            <div style={{ fontSize: "12px", color: "#546E7A", textTransform: "uppercase", letterSpacing: "0.08em", marginTop: "6px" }}>With Active Links</div>
          </div>
          <div style={{ width: "40px", height: "40px", borderRadius: "50%", background: "#E8F5E9", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Link2 style={{ width: "18px", height: "18px", color: "#00897B" }} />
          </div>
        </div>
      </div>

      {/* Table card */}
      <div style={{
        background: "white", borderRadius: "16px", border: "1px solid #E0E7EF",
        boxShadow: "0 2px 8px rgba(0,0,0,0.06)", overflow: "hidden",
      }}>
        {isLoading ? (
          Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} />)
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Users className="w-12 h-12" style={{ color: "#CBD5E1" }} />
            <p className="font-semibold mt-4" style={{ color: "#546E7A" }}>No clients yet</p>
            <p className="text-sm mt-1" style={{ color: "#94A3B8" }}>
              {search ? "No clients match your search." : "Add your first client to get started"}
            </p>
            {!search && (
              <button onClick={openAddPanel} style={{ ...goldBtn, marginTop: "20px" }}>
                <Plus className="w-4 h-4" /> Add Client
              </button>
            )}
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#F8FAFC", borderBottom: "2px solid #E0E7EF" }}>
                {["Name", "Phone", "Email", "City", "Source", "Actions"].map((h) => (
                  <th
                    key={h}
                    className="text-left"
                    style={{
                      fontSize: "12px", fontWeight: 600, textTransform: "uppercase",
                      letterSpacing: "0.1em", padding: "14px 24px", color: "#546E7A",
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr
                  key={c.id}
                  style={{ borderBottom: "1px solid #F0F4F8", cursor: "pointer", transition: "background 100ms" }}
                  onClick={() => navigate(`/clients/${c.id}`)}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "#F8FAFC"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                >
                  {/* Name */}
                  <td style={{ padding: "14px 24px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                      <div style={{
                        width: "36px", height: "36px", borderRadius: "50%",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        color: "white", fontFamily: "Sora, sans-serif", fontWeight: 700, fontSize: "14px",
                        background: avatarGradient(c.name), flexShrink: 0,
                      }}>
                        {c.name[0]?.toUpperCase() ?? "?"}
                      </div>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: "14px", color: "#0A1929" }}>{c.name}</div>
                        <div style={{ fontSize: "13px", color: "#546E7A" }}>{c.company || c.city}</div>
                      </div>
                    </div>
                  </td>
                  {/* Phone */}
                  <td style={{ padding: "14px 24px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <Phone style={{ width: "14px", height: "14px", color: "#546E7A", flexShrink: 0 }} />
                      <span style={{ fontSize: "13px", color: "#546E7A", fontFamily: "JetBrains Mono, monospace" }}>{c.phone}</span>
                    </div>
                  </td>
                  {/* Email */}
                  <td style={{ padding: "14px 24px", maxWidth: "200px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <Mail style={{ width: "14px", height: "14px", color: "#546E7A", flexShrink: 0 }} />
                      <span style={{ fontSize: "13px", color: "#546E7A", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.email || "—"}</span>
                    </div>
                  </td>
                  {/* City */}
                  <td style={{ padding: "14px 24px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <MapPin style={{ width: "12px", height: "12px", color: "#546E7A", flexShrink: 0 }} />
                      <span style={{ fontSize: "13px", color: "#546E7A" }}>{c.city}</span>
                    </div>
                  </td>
                  {/* Source */}
                  <td style={{ padding: "14px 24px" }}>
                    {c.source === "intake_form" ? (
                      <span
                        className="text-[12px] font-semibold px-2.5 py-1 rounded-full uppercase tracking-wide"
                        style={{ background: "#EBF2FF", color: "#1565C0", border: "1px solid #BFDBFE" }}
                      >
                        Form
                      </span>
                    ) : (
                      <span
                        className="text-[12px] font-semibold px-2.5 py-1 rounded-full uppercase tracking-wide"
                        style={{ background: "#F1F5F9", color: "#546E7A", border: "1px solid #E2E8F0" }}
                      >
                        Manual
                      </span>
                    )}
                  </td>
                  {/* Actions */}
                  <td style={{ padding: "14px 24px" }}>
                    <button
                      style={{
                        background: viewHover === c.id ? "#E3EAF2" : "#F0F4F8",
                        color: "#0A1929", border: "1px solid #E0E7EF",
                        borderRadius: "8px", padding: "5px 14px", fontSize: "13px", fontWeight: 600,
                        cursor: "pointer", transition: "all 150ms",
                      }}
                      onMouseEnter={() => setViewHover(c.id)}
                      onMouseLeave={() => setViewHover(null)}
                      onClick={(e) => { e.stopPropagation(); navigate(`/clients/${c.id}`); }}
                    >
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

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
            <Field label="Pincode" value={form.pincode} onChange={(v) => updateForm({ pincode: v })} />
            <Field label="WhatsApp Number (if different from phone)" value={form.whatsapp_number} onChange={(v) => updateForm({ whatsapp_number: v })} error={formErrors.whatsapp_number}
              onBlur={() => { if (form.whatsapp_number) updateForm({ whatsapp_number: normalizePhone(form.whatsapp_number) }); }} />
            <Field label="Source (e.g. referral, website, walk-in)" value={form.source} onChange={(v) => updateForm({ source: v })} />
            <div>
              <label className="mb-1.5 block" style={{ fontSize: "12px", fontWeight: 600, color: "#546E7A", textTransform: "uppercase", letterSpacing: "0.05em" }}>
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
      <label className="mb-1.5 block" style={{ fontSize: "12px", fontWeight: 600, color: "#546E7A", textTransform: "uppercase", letterSpacing: "0.05em" }}>
        {label} {required && <span style={{ color: "#C62828" }}>*</span>}
      </label>
      <Input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        style={{ borderColor: "#E0E7EF", borderRadius: "10px", fontSize: "14px" }}
      />
      {error && <p className="mt-1 text-[13px]" style={{ color: "#C62828" }}>{error}</p>}
    </div>
  );
}
