export type UserRole =
  | "super_admin"
  | "admin"
  | "mobilization_lead"
  // Operations roles — mirror the user_role enum and the server Role type.
  | "execution_head"
  | "execution"
  | "planning"
  | "reporting"
  | "accounts"
  | "viewer";

export const ROLE_LABELS: Record<UserRole, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  mobilization_lead: "Mobilisation Lead",
  execution_head: "Execution Head",
  execution: "Execution",
  planning: "Contract & Planning",
  reporting: "Report & Bill Preparation",
  accounts: "Accounts",
  viewer: "Viewer",
};

export const ROLE_COLORS: Record<UserRole, { bg: string; color: string; border: string }> = {
  super_admin: { bg: "#FFF3E0", color: "#E65100", border: "#FFCC80" },
  admin: { bg: "#EBF2FF", color: "#1565C0", border: "#BFDBFE" },
  mobilization_lead: { bg: "#E8F5E9", color: "#00897B", border: "#A5D6A7" },
  execution_head: { bg: "#E0F2F1", color: "#00695C", border: "#80CBC4" },
  execution: { bg: "#E0F7FA", color: "#00838F", border: "#80DEEA" },
  planning: { bg: "#F3E8FF", color: "#6A1B9A", border: "#D8B4FE" },
  reporting: { bg: "#FEF3C7", color: "#92400E", border: "#FDE68A" },
  accounts: { bg: "#DCFCE7", color: "#15673A", border: "#86EFAC" },
  viewer: { bg: "#F0F4F8", color: "#546E7A", border: "#E0E7EF" },
};

/**
 * Capability groups — mirrors server/src/middleware/roles.ts. Each is a strict
 * SUPERSET of admin, so adding a role can only widen access and never narrows
 * what super_admin/admin already had.
 */
export const ADMIN_ROLES: UserRole[] = ["super_admin", "admin"];
/** Quotations, rate matrix, pricing config. */
export const QUOTING_ROLES: UserRole[] = [...ADMIN_ROLES, "planning"];
/** Payments, invoicing, final billing, job completion. */
export const BILLING_ROLES: UserRole[] = [...ADMIN_ROLES, "accounts", "reporting"];
/** Mobilisation scheduling and site execution. */
export const MOBILISING_ROLES: UserRole[] = [
  ...ADMIN_ROLES,
  "mobilization_lead",
  "execution_head",
  "execution",
];
