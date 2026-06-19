export type UserRole = "super_admin" | "admin" | "mobilization_lead" | "viewer";

export const ROLE_LABELS: Record<UserRole, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  mobilization_lead: "Mobilisation Lead",
  viewer: "Viewer",
};

export const ROLE_COLORS: Record<UserRole, { bg: string; color: string; border: string }> = {
  super_admin: { bg: "#FFF3E0", color: "#E65100", border: "#FFCC80" },
  admin: { bg: "#EBF2FF", color: "#1565C0", border: "#BFDBFE" },
  mobilization_lead: { bg: "#E8F5E9", color: "#00897B", border: "#A5D6A7" },
  viewer: { bg: "#F0F4F8", color: "#546E7A", border: "#E0E7EF" },
};
