import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/apiClient";
import type { Tables } from "@/integrations/supabase/types";
import { ROLE_LABELS, type UserRole } from "@/lib/permissions";

interface Props {
  value: string | null;
  onChange: (userId: string | null) => void;
  /** Single role (kept for existing callers). */
  filterRole?: UserRole;
  /** Any of these roles — use for capability groups (e.g. everyone who can mobilise). */
  filterRoles?: UserRole[];
  disabled?: boolean;
}

export function AssigneeDropdown({ value, onChange, filterRole, filterRoles, disabled }: Props) {
  // Fetch all active profiles and narrow on the client: the API's role filter
  // takes a single value, and a capability group spans several roles.
  const { data: allProfiles = [], isLoading } = useQuery({
    queryKey: ["active-profiles"],
    queryFn: () => apiClient.get<Tables<"profiles">[]>("/profiles", { is_active: true }),
  });

  const allowed = filterRoles ?? (filterRole ? [filterRole] : null);
  const profiles = allowed
    ? allProfiles.filter((p) => allowed.includes(p.role as UserRole))
    : allProfiles;

  // An empty list is almost always "nobody holds this role yet" rather than a
  // broken control — say so instead of silently showing only "Unassigned".
  const emptyHint =
    !isLoading && profiles.length === 0
      ? allowed
        ? `No active users with the required role (${allowed.map((r) => ROLE_LABELS[r]).join(", ")}). Add them in Settings → Team Management.`
        : "No active users yet. Add them in Settings → Team Management."
      : null;

  return (
    <div>
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        disabled={disabled}
        style={{
          width: "100%",
          padding: "8px 12px",
          border: "1.5px solid #E0E7EF",
          borderRadius: "8px",
          fontSize: "13px",
          color: value ? "#0A1929" : "#94A3B8",
          background: "#FAFBFC",
          cursor: disabled ? "default" : "pointer",
          opacity: disabled ? 0.6 : 1,
        }}
      >
        <option value="">Unassigned</option>
        {profiles.map((p) => {
          const role = p.role as UserRole;
          return (
            <option key={p.id} value={p.id}>
              {p.full_name || p.email.split("@")[0]} — {ROLE_LABELS[role] ?? role}
            </option>
          );
        })}
      </select>
      {emptyHint && (
        <p style={{ marginTop: 6, fontSize: 12, color: "#B45309" }}>{emptyHint}</p>
      )}
    </div>
  );
}
