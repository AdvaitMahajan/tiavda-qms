import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/hooks/useAuth";
import { useRole } from "@/hooks/useRole";
import { toast } from "sonner";
import { Users, UserPlus, Shield, KeyRound } from "lucide-react";
import { cardStyle, SettingsCardHeader } from "@/components/settings/SettingsComponents";
import { ROLE_LABELS, ROLE_COLORS, type UserRole } from "@/lib/permissions";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";

const ALL_ROLES: UserRole[] = ["super_admin", "admin", "mobilization_lead", "viewer"];

export function TeamManagement() {
  const { user } = useAuth();
  const { canManageTeam, isSuperAdmin } = useRole();
  const queryClient = useQueryClient();

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteForm, setInviteForm] = useState({ email: "", full_name: "", password: "", role: "viewer" as UserRole });
  const [inviting, setInviting] = useState(false);

  const [resetOpen, setResetOpen] = useState(false);
  const [resetTarget, setResetTarget] = useState<{ id: string; email: string; name: string } | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [resetting, setResetting] = useState(false);

  const { data: members = [], isLoading } = useQuery({
    queryKey: ["team-members"],
    queryFn: () => apiClient.get<any[]>("/team"),
  });

  const handleInvite = async () => {
    if (!inviteForm.email.trim() || !inviteForm.full_name.trim()) {
      toast.error("Email and name are required");
      return;
    }
    if (!inviteForm.password.trim() || inviteForm.password.trim().length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    setInviting(true);
    try {
      await apiClient.post("/team/users", {
        email: inviteForm.email.trim(),
        full_name: inviteForm.full_name.trim(),
        password: inviteForm.password.trim(),
        role: inviteForm.role,
      });
      toast.success(`Account created for ${inviteForm.email}`);
      setInviteOpen(false);
      setInviteForm({ email: "", full_name: "", password: "", role: "viewer" });
      queryClient.invalidateQueries({ queryKey: ["team-members"] });
    } catch (err: any) {
      toast.error(err.message || "Failed to invite user");
    } finally {
      setInviting(false);
    }
  };

  const handleRoleChange = async (profileId: string, newRole: UserRole) => {
    if (profileId === user?.id) {
      toast.error("You cannot change your own role");
      return;
    }
    try {
      await apiClient.patch(`/profiles/${profileId}`, { role: newRole });
      toast.success("Role updated");
      queryClient.invalidateQueries({ queryKey: ["team-members"] });
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const handleToggleActive = async (profileId: string, currentlyActive: boolean) => {
    if (profileId === user?.id) {
      toast.error("You cannot deactivate yourself");
      return;
    }
    try {
      await apiClient.patch(`/profiles/${profileId}`, { is_active: !currentlyActive });
      toast.success(currentlyActive ? "User deactivated" : "User reactivated");
      queryClient.invalidateQueries({ queryKey: ["team-members"] });
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const handleResetPassword = async () => {
    if (!resetTarget || !resetPassword.trim() || resetPassword.trim().length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    setResetting(true);
    try {
      await apiClient.post(`/team/users/${resetTarget.id}/reset-password`, {
        password: resetPassword.trim(),
      });
      toast.success(`Password reset for ${resetTarget.email}`);
      setResetOpen(false);
      setResetTarget(null);
      setResetPassword("");
    } catch (err: any) {
      toast.error(err.message || "Failed to reset password");
    } finally {
      setResetting(false);
    }
  };

  if (!canManageTeam) return null;

  const assignableRoles = isSuperAdmin ? ALL_ROLES : ALL_ROLES.filter((r) => r !== "super_admin");

  return (
    <>
      <div style={cardStyle}>
        <SettingsCardHeader Icon={Users} iconBg="#EDE7F6" iconColor="#7B1FA2" title="Team Management" />
        <div style={{ padding: "16px 24px 20px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
            <p style={{ fontSize: "13px", color: "#546E7A", margin: 0 }}>
              Manage team members and their roles
            </p>
            <button
              onClick={() => setInviteOpen(true)}
              style={{
                background: "linear-gradient(135deg,#1565C0,#2979FF)", color: "white",
                border: "none", borderRadius: "8px", padding: "8px 14px",
                fontSize: "13px", fontWeight: 600, cursor: "pointer",
                display: "flex", alignItems: "center", gap: "6px",
                boxShadow: "0 2px 8px rgba(21,101,192,0.25)",
              }}
            >
              <UserPlus style={{ width: "14px", height: "14px" }} /> Create User
            </button>
          </div>

          {isLoading ? (
            <div className="space-y-3">
              {[1, 2].map((i) => (
                <div key={i} className="animate-pulse" style={{ background: "#F8FAFC", borderRadius: "10px", height: "56px" }} />
              ))}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {members.map((m) => {
                const r = (m.role as UserRole) ?? "viewer";
                const rc = ROLE_COLORS[r];
                const isMe = m.id === user?.id;
                return (
                  <div
                    key={m.id}
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      gap: "12px", padding: "12px 14px", borderRadius: "10px",
                      background: m.is_active ? "#FAFBFC" : "#F8F8F8",
                      border: "1px solid #E0E7EF",
                      opacity: m.is_active ? 1 : 0.6,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "12px", flex: 1, minWidth: 0 }}>
                      <div style={{
                        width: "36px", height: "36px", borderRadius: "10px",
                        background: "linear-gradient(135deg,#1565C0,#2979FF)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontWeight: 700, fontSize: "14px", color: "white", flexShrink: 0,
                      }}>
                        {(m.full_name?.[0] ?? m.email[0]).toUpperCase()}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: "13px", fontWeight: 600, color: "#0A1929", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {m.full_name || m.email.split("@")[0]}
                          {isMe && <span style={{ fontSize: "12px", color: "#546E7A", marginLeft: "6px" }}>(you)</span>}
                        </div>
                        <div style={{ fontSize: "12px", color: "#546E7A", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {m.email}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
                      {isMe ? (
                        <span style={{
                          background: rc.bg, color: rc.color, border: `1px solid ${rc.border}`,
                          fontSize: "12px", fontWeight: 600, padding: "3px 8px", borderRadius: "6px",
                        }}>
                          {ROLE_LABELS[r]}
                        </span>
                      ) : (
                        <select
                          value={r}
                          onChange={(e) => handleRoleChange(m.id, e.target.value as UserRole)}
                          style={{
                            padding: "4px 8px", border: "1.5px solid #E0E7EF", borderRadius: "6px",
                            fontSize: "12px", color: "#0A1929", background: "#FAFBFC", cursor: "pointer",
                          }}
                        >
                          {assignableRoles.map((role) => (
                            <option key={role} value={role}>{ROLE_LABELS[role]}</option>
                          ))}
                        </select>
                      )}

                      {!isMe && (
                        <>
                          <button
                            onClick={() => {
                              setResetTarget({ id: m.id, email: m.email, name: m.full_name || m.email });
                              setResetPassword("");
                              setResetOpen(true);
                            }}
                            title="Reset password"
                            style={{
                              padding: "4px 8px", borderRadius: "6px", fontSize: "12px", fontWeight: 600,
                              cursor: "pointer", border: "1px solid #E0E7EF",
                              background: "#EBF5FF", color: "#1565C0",
                              display: "flex", alignItems: "center", gap: "3px",
                            }}
                          >
                            <KeyRound style={{ width: "10px", height: "10px" }} /> Reset
                          </button>
                          <button
                            onClick={() => handleToggleActive(m.id, m.is_active)}
                            style={{
                              padding: "4px 8px", borderRadius: "6px", fontSize: "12px", fontWeight: 600,
                              cursor: "pointer", border: "1px solid #E0E7EF",
                              background: m.is_active ? "#FEF2F2" : "#E8F5E9",
                              color: m.is_active ? "#C62828" : "#00897B",
                            }}
                          >
                            {m.is_active ? "Deactivate" : "Reactivate"}
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Invite Dialog */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent style={{ borderRadius: "20px", padding: "32px", boxShadow: "0 24px 64px rgba(0,0,0,0.2)" }}>
          <DialogHeader>
            <DialogTitle style={{ fontFamily: "Sora, sans-serif", color: "#0A1929", fontSize: "18px", fontWeight: 700, display: "flex", alignItems: "center", gap: "8px" }}>
              <Shield style={{ width: "20px", height: "20px", color: "#1565C0" }} />
              Create Team Member
            </DialogTitle>
            <DialogDescription style={{ color: "#546E7A", fontSize: "13px" }}>
              Create a login account with email and password.
            </DialogDescription>
          </DialogHeader>
          <div style={{ display: "flex", flexDirection: "column", gap: "14px", marginTop: "8px" }}>
            <div>
              <label style={{ fontSize: "12px", fontWeight: 600, color: "#546E7A", textTransform: "uppercase", letterSpacing: "0.06em", display: "block", marginBottom: "6px" }}>Full Name</label>
              <input
                value={inviteForm.full_name}
                onChange={(e) => setInviteForm((p) => ({ ...p, full_name: e.target.value }))}
                placeholder="e.g. Rajesh Kumar"
                style={{ width: "100%", padding: "10px 14px", border: "1.5px solid #E0E7EF", borderRadius: "10px", fontSize: "14px", color: "#0A1929", background: "#FAFBFC", outline: "none" }}
              />
            </div>
            <div>
              <label style={{ fontSize: "12px", fontWeight: 600, color: "#546E7A", textTransform: "uppercase", letterSpacing: "0.06em", display: "block", marginBottom: "6px" }}>Email Address</label>
              <input
                type="email"
                value={inviteForm.email}
                onChange={(e) => setInviteForm((p) => ({ ...p, email: e.target.value }))}
                placeholder="rajesh@company.com"
                style={{ width: "100%", padding: "10px 14px", border: "1.5px solid #E0E7EF", borderRadius: "10px", fontSize: "14px", color: "#0A1929", background: "#FAFBFC", outline: "none" }}
              />
            </div>
            <div>
              <label style={{ fontSize: "12px", fontWeight: 600, color: "#546E7A", textTransform: "uppercase", letterSpacing: "0.06em", display: "block", marginBottom: "6px" }}>Password</label>
              <input
                type="password"
                value={inviteForm.password}
                onChange={(e) => setInviteForm((p) => ({ ...p, password: e.target.value }))}
                placeholder="Min 6 characters"
                style={{ width: "100%", padding: "10px 14px", border: "1.5px solid #E0E7EF", borderRadius: "10px", fontSize: "14px", color: "#0A1929", background: "#FAFBFC", outline: "none" }}
              />
            </div>
            <div>
              <label style={{ fontSize: "12px", fontWeight: 600, color: "#546E7A", textTransform: "uppercase", letterSpacing: "0.06em", display: "block", marginBottom: "6px" }}>Role</label>
              <select
                value={inviteForm.role}
                onChange={(e) => setInviteForm((p) => ({ ...p, role: e.target.value as UserRole }))}
                style={{ width: "100%", padding: "10px 14px", border: "1.5px solid #E0E7EF", borderRadius: "10px", fontSize: "14px", color: "#0A1929", background: "#FAFBFC", cursor: "pointer" }}
              >
                {assignableRoles.map((role) => (
                  <option key={role} value={role}>{ROLE_LABELS[role]}</option>
                ))}
              </select>
            </div>
          </div>
          <DialogFooter style={{ marginTop: "8px" }}>
            <button
              onClick={() => setInviteOpen(false)}
              className="px-4 py-2 rounded-lg text-sm font-medium"
              style={{ background: "#F0F4F8", color: "#546E7A", border: "1px solid #E0E7EF" }}
            >
              Cancel
            </button>
            <button
              disabled={inviting}
              onClick={handleInvite}
              className="px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
              style={{ background: "linear-gradient(135deg,#1565C0,#2979FF)", color: "white" }}
            >
              {inviting ? "Creating…" : "Create Account"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset Password Dialog */}
      <Dialog open={resetOpen} onOpenChange={(open) => { setResetOpen(open); if (!open) { setResetTarget(null); setResetPassword(""); } }}>
        <DialogContent style={{ borderRadius: "20px", padding: "32px", boxShadow: "0 24px 64px rgba(0,0,0,0.2)" }}>
          <DialogHeader>
            <DialogTitle style={{ fontFamily: "Sora, sans-serif", color: "#0A1929", fontSize: "18px", fontWeight: 700, display: "flex", alignItems: "center", gap: "8px" }}>
              <KeyRound style={{ width: "20px", height: "20px", color: "#1565C0" }} />
              Reset Password
            </DialogTitle>
            <DialogDescription style={{ color: "#546E7A", fontSize: "13px" }}>
              Set a new password for <strong style={{ color: "#0A1929" }}>{resetTarget?.name}</strong> ({resetTarget?.email})
            </DialogDescription>
          </DialogHeader>
          <div style={{ display: "flex", flexDirection: "column", gap: "14px", marginTop: "8px" }}>
            <div>
              <label style={{ fontSize: "12px", fontWeight: 600, color: "#546E7A", textTransform: "uppercase", letterSpacing: "0.06em", display: "block", marginBottom: "6px" }}>New Password</label>
              <input
                type="password"
                value={resetPassword}
                onChange={(e) => setResetPassword(e.target.value)}
                placeholder="Min 6 characters"
                style={{ width: "100%", padding: "10px 14px", border: "1.5px solid #E0E7EF", borderRadius: "10px", fontSize: "14px", color: "#0A1929", background: "#FAFBFC", outline: "none" }}
              />
            </div>
          </div>
          <DialogFooter style={{ marginTop: "8px" }}>
            <button
              onClick={() => setResetOpen(false)}
              className="px-4 py-2 rounded-lg text-sm font-medium"
              style={{ background: "#F0F4F8", color: "#546E7A", border: "1px solid #E0E7EF" }}
            >
              Cancel
            </button>
            <button
              disabled={resetting}
              onClick={handleResetPassword}
              className="px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
              style={{ background: "linear-gradient(135deg,#1565C0,#2979FF)", color: "white" }}
            >
              {resetting ? "Resetting…" : "Reset Password"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
