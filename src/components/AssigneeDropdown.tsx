import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ROLE_LABELS, ROLE_COLORS, type UserRole } from "@/lib/permissions";

interface Props {
  value: string | null;
  onChange: (userId: string | null) => void;
  filterRole?: UserRole;
  disabled?: boolean;
}

export function AssigneeDropdown({ value, onChange, filterRole, disabled }: Props) {
  const { data: profiles = [] } = useQuery({
    queryKey: ["active-profiles", filterRole],
    queryFn: async () => {
      let q = supabase
        .from("profiles")
        .select("id, full_name, email, role")
        .eq("is_active", true)
        .order("full_name");
      if (filterRole) q = q.eq("role", filterRole);
      const { data } = await q;
      return data ?? [];
    },
  });

  return (
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
            {p.full_name || p.email.split("@")[0]} — {ROLE_LABELS[role]}
          </option>
        );
      })}
    </select>
  );
}
