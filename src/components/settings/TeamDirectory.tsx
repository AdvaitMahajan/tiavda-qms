import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/apiClient";
import { toast } from "sonner";
import { Users, Check, X, Pencil, UserPlus } from "lucide-react";
import { cardStyle, SettingsCardHeader } from "@/components/settings/SettingsComponents";
import { ROLE_LABELS, ROLE_COLORS, type UserRole } from "@/lib/permissions";
import type { CreateLoginPrefill } from "@/components/settings/TeamManagement";

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

/**
 * The operations team directory: who does what and how to reach them. Exists
 * before logins do — a member has no account until their email address is known
 * and they are invited from Team Management, at which point profile_id links
 * the two.
 */
export function TeamDirectory({ onCreateLogin }: { onCreateLogin?: (p: CreateLoginPrefill) => void } = {}) {
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [emailDraft, setEmailDraft] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: members = [], isLoading } = useQuery({
    queryKey: ["team-directory"],
    queryFn: () => apiClient.get<TeamMember[]>("/team-members"),
  });

  const saveEmail = async (m: TeamMember) => {
    const email = emailDraft.trim();
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      toast.error("Enter a valid email address");
      return;
    }
    setSaving(true);
    try {
      await apiClient.patch(`/team-members/${m.id}`, { email: email || null });
      toast.success(`Saved email for ${m.full_name}`);
      setEditingId(null);
      queryClient.invalidateQueries({ queryKey: ["team-directory"] });
    } catch (e) {
      toast.error((e as Error).message || "Could not save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={cardStyle}>
      <SettingsCardHeader Icon={Users} iconBg="#E0F2F1" iconColor="#00695C" title="Team Directory" />
      <p style={{ fontSize: "13px", color: "#546E7A", padding: "8px 24px 12px" }}>
        Your operations team and what they are responsible for. Add an email to a member, then invite
        them from Team Management to give them a login.
      </p>
      <div style={{ padding: "0 24px 20px" }}>
        {isLoading ? (
          <div style={{ fontSize: "13px", color: "#94A3B8" }}>Loading…</div>
        ) : members.length === 0 ? (
          <div style={{ fontSize: "13px", color: "#94A3B8" }}>No team members recorded yet.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {members.map((m) => {
              const roleKey = (m.app_role ?? "viewer") as UserRole;
              const rc = ROLE_COLORS[roleKey] ?? ROLE_COLORS.viewer;
              const isEditing = editingId === m.id;
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

                  {/* Email — the missing piece until the client sends them */}
                  <div style={{ flex: "1 1 240px", display: "flex", alignItems: "center", gap: "6px" }}>
                    {isEditing ? (
                      <>
                        <input
                          value={emailDraft}
                          onChange={(e) => setEmailDraft(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && saveEmail(m)}
                          placeholder="name@company.com"
                          autoFocus
                          style={{
                            flex: 1, minWidth: 0, padding: "6px 10px", fontSize: "13px",
                            border: "1.5px solid #1565C0", borderRadius: "8px", outline: "none",
                          }}
                        />
                        <button onClick={() => saveEmail(m)} disabled={saving} title="Save"
                          style={{ border: "none", background: "#15673A", color: "white", borderRadius: "8px", padding: "6px 8px", cursor: "pointer" }}>
                          <Check style={{ width: 14, height: 14 }} />
                        </button>
                        <button onClick={() => setEditingId(null)} title="Cancel"
                          style={{ border: "1px solid #E0E7EF", background: "white", color: "#546E7A", borderRadius: "8px", padding: "6px 8px", cursor: "pointer" }}>
                          <X style={{ width: 14, height: 14 }} />
                        </button>
                      </>
                    ) : (
                      <>
                        <span style={{ fontSize: "13px", color: m.email ? "#0A1929" : "#B45309", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>
                          {m.email || "Email pending"}
                        </span>
                        <button
                          onClick={() => { setEditingId(m.id); setEmailDraft(m.email ?? ""); }}
                          title="Set email"
                          style={{ border: "1px solid #E0E7EF", background: "white", color: "#546E7A", borderRadius: "8px", padding: "6px 8px", cursor: "pointer" }}
                        >
                          <Pencil style={{ width: 14, height: 14 }} />
                        </button>
                      </>
                    )}
                  </div>

                  {m.profile_id ? (
                    <span style={{ fontSize: "12px", fontWeight: 600, whiteSpace: "nowrap", color: "#15673A" }}>
                      Has login
                    </span>
                  ) : onCreateLogin && m.email ? (
                    <button
                      onClick={() =>
                        onCreateLogin({
                          full_name: m.full_name,
                          email: m.email!,
                          role: (m.app_role && m.app_role in ROLE_LABELS ? m.app_role : "viewer") as UserRole,
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
                    <span
                      style={{ fontSize: "12px", fontWeight: 600, whiteSpace: "nowrap", color: "#94A3B8" }}
                      title={m.email ? undefined : "Add an email first"}
                    >
                      No login yet
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
