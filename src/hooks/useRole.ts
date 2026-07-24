import { useAuth } from "@/hooks/useAuth";
import {
  ADMIN_ROLES,
  BILLING_ROLES,
  MOBILISING_ROLES,
  QUOTING_ROLES,
  type UserRole,
} from "@/lib/permissions";

export function useRole() {
  const { profile } = useAuth();
  const role: UserRole = (profile?.role as UserRole) ?? "viewer";
  const isAdmin = ADMIN_ROLES.includes(role);
  // Capability groups mirror the server gates. Each is a strict superset of
  // admin, so admins keep every permission they had before the operations
  // roles existed.
  const canQuote = QUOTING_ROLES.includes(role);
  const canBill = BILLING_ROLES.includes(role);
  const canMobilise = MOBILISING_ROLES.includes(role);

  return {
    role,
    isAdmin,
    isSuperAdmin: role === "super_admin",
    isMobLead: role === "mobilization_lead",
    isViewer: role === "viewer",
    canQuote,
    canBill,
    canMobilise,
    canManageTeam: isAdmin,
    // Mobilisation/execution roles stay scoped to their own workflow (BRD §9).
    // The Mobilisation tab renders independently of these flags, so keeping
    // them admin-only removes general enquiry editing / Kanban drag without
    // blocking the on-site workflow.
    canEditEnquiry: isAdmin,
    canEditClients: isAdmin,
    canViewSettings: isAdmin,
    canAssignEnquiry: isAdmin,
    // Contract & Planning prices the work; Accounts and Report/Bill handle money.
    canEditQuotation: canQuote,
    canEditPayments: canBill,
  };
}
