import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/apiClient";
import { toast } from "sonner";
import { Users, Pencil, UserPlus, Trash2, Plus } from "lucide-react";
import { cardStyle, SettingsCardHeader } from "@/components/settings/SettingsComponents";
import { ROLE_LABELS, ROLE_COLORS, type UserRole } from "@/lib/permissions";
import type { CreateLoginPrefill } from "@/components/settings/TeamManagement";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";

type TeamMember = {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  responsibility: string | null;
  app_role: string | null;
  city: string | null;
  profile_id: string | null;
  is_active: boolean;
};

type MemberForm = {
  full_name: string;
  phone: string;
  email: string;
  responsibility: string;
  app_role: UserRole;
  city: string;
};

const EMPTY_FORM: MemberForm = {
  full_name: "", phone: "", email: "", responsibility: "", app_role: "viewer", city: "",
};

const ROLE_OPTIONS = Object.keys(ROLE_LABELS) as UserRole[];

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "10px 14px", border: "1.5px solid #E0E7EF", borderRadius: "10px",
  fontSize: "14px", color: "#0A1929", background: "#FAFBFC", outline: "none",
};
const labelStyle: React.CSSProperties = {
  fontSize: "12px", fontWeight: 600, color: "#546E7A", textTransform: "uppercase",
  letterSpacing: "0.06em", display: "block", marginBottom: "6px",
};

/**
 * The operations team directory: who does what and how to reach them. Full CRUD
 * (add / edit / remove). A member has no login until they are given one — either
 * via the row's "Create login" or from Team Management — at which point
 * profile_id links the two.
 */
export function TeamDirectory({ onCreateLogin }: { onCreateLogin?: (p: CreateLoginPrefill) => void } = {}) {
  const queryClient = useQueryClient();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null); // null = adding
  const [form, setForm] = useState<MemberForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const { data: members = [], isLoading } = useQuery({
    queryKey: ["team-directory"],
    queryFn: () => apiClient.get<TeamMember[]>("/team-members"),
  });

  const openAdd = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  };

  const openEdit = (m: TeamMember) => {
    setEditingId(m.id);
    setForm({
      full_name: m.full_name ?? "",
      phone: m.phone ?? "",
      email: m.email ?? "",
      responsibility: m.responsibility ?? "",
      app_role: (m.app_role && m.app_role in ROLE_LABELS ? m.app_role : "viewer") as UserRole,
      city: m.city ?? "",
    });
    setDialogOpen(true);
  };

  const save = async () => {
    if (!form.full_name.trim()) { toast.error("Name is required"); return; }
    if (form.email.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email.trim())) {
      toast.error("Enter a valid email address");
      return;
    }
    setSaving(true);
    const payload = {
      full_name: form.full_name.trim(),
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      responsibility: form.responsibility.trim() || null,
      app_role: form.app_role,
      city: form.city.trim() || null,
    };
    try {
      if (editingId) {
        await apiClient.patch(`/team-members/${editingId}`, payload);
        toast.success("Team member updated");
      } else {
        await apiClient.post("/team-members", payload);
        toast.success("Team member added");
      }
      setDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ["team-directory"] });
    } catch (e) {
      toast.error((e as Error).message || "Could not save");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (m: TeamMember) => {
    if (!window.confirm(`Remove ${m.full_name} from the team directory? This does not delete their login if they have one.`)) return;
    setDeletingId(m.id);
    try {
      await apiClient.del(`/team-members/${m.id}`);
      toast.success(`Removed ${m.full_name}`);
      queryClient.invalidateQueries({ queryKey: ["team-directory"] });
    } catch (e) {
      toast.error((e as Error).message || "Could not remove");
    } finally {
      setDeletingId(null);
    }
  };

  const iconBtn: React.CSSProperties = {
    border: "1px solid #E0E7EF", background: "white", color: "#546E7A",
    borderRadius: "8px", padding: "6px 8px", cursor: "pointer",
    display: "flex", alignItems: "center",
  };

  return (
    <div style={cardStyle}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <SettingsCardHeader Icon={Users} iconBg="#E0F2F1" iconColor="#00695C" title="Team Directory" />
        <button
          onClick={openAdd}
          style={{
            marginRight: 24, display: "flex", alignItems: "center", gap: 6,
            background: "linear-gradient(135deg,#00695C,#00897B)", color: "white", border: "none",
            borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer",
            whiteSpace: "nowrap",
          }}
        >
          <Plus style={{ width: 14, height: 14 }} /> Add Member
        </button>
      </div>
      <p style={{ fontSize: "13px", color: "#546E7A", padding: "8px 24px 12px" }}>
        Your operations team and what they are responsible for. Add an email to a member, then create a
        login for them.
      </p>
      <div style={{ padding: "0 24px 20px" }}>
        {isLoading ? (
          <div style={{ fontSize: "13px", color: "#94A3B8" }}>Loading…</div>
        ) : members.length === 0 ? (
          <div style={{ fontSize: "13px", color: "#94A3B8" }}>No team members yet. Use “Add Member” to create one.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {members.map((m) => {
              const roleKey = (m.app_role ?? "viewer") as UserRole;
              const rc = ROLE_COLORS[roleKey] ?? ROLE_COLORS.viewer;
              return (
                <div
                  key={m.id}
                  style={{
                    border: "1px solid #E0E7EF", borderRadius: "12px", padding: "12px 14px",
                    display: "flex", flexWrap: "wrap", alignItems: "center", gap: "10px",
                    background: m.is_active ? "#FFFFFF" : "#F8FAFC",
                  }}
                >
                  <div style={{ flex: "1 1 220px", minWidth: 0 }}>
                    <div style={{ fontSize: "14px", fontWeight: 600, color: "#0A1929" }}>{m.full_name}</div>
                    <div style={{ fontSize: "12px", color: "#546E7A" }}>
                      {[m.responsibility, m.city].filter(Boolean).join(" · ")}
                    </div>
                  </div>

                  <span
                    style={{
                      background: rc.bg, color: rc.color, border: `1px solid ${rc.border}`,
                      padding: "3px 10px", borderRadius: "999px", fontSize: "12px", fontWeight: 600, whiteSpace: "nowrap",
                    }}
                  >
                    {ROLE_LABELS[roleKey] ?? m.app_role}
                  </span>

                  {m.phone && (
                    <a href={`tel:${m.phone}`} style={{ fontSize: "13px", color: "#1565C0", fontFamily: "JetBrains Mono, monospace", whiteSpace: "nowrap" }}>
                      {m.phone}
                    </a>
                  )}

                  <span style={{ fontSize: "13px", color: m.email ? "#0A1929" : "#B45309", flex: "1 1 180px", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>
                    {m.email || "Email pending"}
                  </span>

                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                    {m.profile_id ? (
                      <span style={{ fontSize: "12px", fontWeight: 600, whiteSpace: "nowrap", color: "#15673A" }}>Has login</span>
                    ) : onCreateLogin && m.email ? (
                      <button
                        onClick={() =>
                          onCreateLogin({
                            full_name: m.full_name,
                            email: m.email!,
                            role: roleKey,
                            team_member_id: m.id,
                          })
                        }
                        title="Create a login for this member"
                        style={{
                          display: "flex", alignItems: "center", gap: "4px", whiteSpace: "nowrap",
                          padding: "5px 10px", borderRadius: "8px", fontSize: "12px", fontWeight: 600,
                          cursor: "pointer", border: "none",
                          background: "linear-gradient(135deg,#1565C0,#2979FF)", color: "white",
                        }}
                      >
                        <UserPlus style={{ width: 12, height: 12 }} /> Create login
                      </button>
                    ) : (
                      <span style={{ fontSize: "12px", fontWeight: 600, whiteSpace: "nowrap", color: "#94A3B8" }} title={m.email ? undefined : "Add an email first"}>
                        No login yet
                      </span>
                    )}

                    <button onClick={() => openEdit(m)} title="Edit" style={iconBtn}>
                      <Pencil style={{ width: 14, height: 14 }} />
                    </button>
                    <button
                      onClick={() => remove(m)}
                      disabled={deletingId === m.id}
                      title="Remove"
                      style={{ ...iconBtn, color: "#C62828", background: "#FEF2F2", borderColor: "#FECACA", opacity: deletingId === m.id ? 0.5 : 1 }}
                    >
                      <Trash2 style={{ width: 14, height: 14 }} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add / Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent style={{ borderRadius: "20px", padding: "32px", boxShadow: "0 24px 64px rgba(0,0,0,0.2)" }}>
          <DialogHeader>
            <DialogTitle style={{ fontFamily: "Sora, sans-serif", color: "#0A1929", fontSize: "18px", fontWeight: 700, display: "flex", alignItems: "center", gap: "8px" }}>
              <Users style={{ width: "20px", height: "20px", color: "#00695C" }} />
              {editingId ? "Edit Team Member" : "Add Team Member"}
            </DialogTitle>
            <DialogDescription style={{ color: "#546E7A", fontSize: "13px" }}>
              This is a contact record. It becomes a login only when you create one for them.
            </DialogDescription>
          </DialogHeader>
          <div style={{ display: "flex", flexDirection: "column", gap: "14px", marginTop: "8px" }}>
            <div>
              <label style={labelStyle}>Full Name *</label>
              <input value={form.full_name} onChange={(e) => setForm((p) => ({ ...p, full_name: e.target.value }))} placeholder="e.g. Prajact Sarwate" style={inputStyle} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              <div>
                <label style={labelStyle}>Phone</label>
                <input value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} placeholder="+91XXXXXXXXXX" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>City</label>
                <input value={form.city} onChange={(e) => setForm((p) => ({ ...p, city: e.target.value }))} placeholder="e.g. Mumbai" style={inputStyle} />
              </div>
            </div>
            <div>
              <label style={labelStyle}>Email</label>
              <input type="email" value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} placeholder="name@company.com" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Responsibility</label>
              <input value={form.responsibility} onChange={(e) => setForm((p) => ({ ...p, responsibility: e.target.value }))} placeholder="e.g. Execution Head" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Role (used when a login is created)</label>
              <select value={form.app_role} onChange={(e) => setForm((p) => ({ ...p, app_role: e.target.value as UserRole }))} style={{ ...inputStyle, cursor: "pointer" }}>
                {ROLE_OPTIONS.map((r) => (
                  <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                ))}
              </select>
            </div>
          </div>
          <DialogFooter style={{ marginTop: "8px" }}>
            <button onClick={() => setDialogOpen(false)} className="px-4 py-2 rounded-lg text-sm font-medium" style={{ background: "#F0F4F8", color: "#546E7A", border: "1px solid #E0E7EF" }}>
              Cancel
            </button>
            <button disabled={saving} onClick={save} className="px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50" style={{ background: "linear-gradient(135deg,#00695C,#00897B)", color: "white" }}>
              {saving ? "Saving…" : editingId ? "Save Changes" : "Add Member"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
