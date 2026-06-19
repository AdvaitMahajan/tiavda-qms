import { useAuth } from "@/hooks/useAuth";
import type { UserRole } from "@/lib/permissions";

export function useRole() {
  const { profile } = useAuth();
  const role: UserRole = (profile?.role as UserRole) ?? "viewer";
  const isAdmin = role === "super_admin" || role === "admin";
  return {
    role,
    isAdmin,
    isSuperAdmin: role === "super_admin",
    isMobLead: role === "mobilization_lead",
    isViewer: role === "viewer",
    canManageTeam: isAdmin,
    // Mobilization leads are scoped to the Mobilisation section only (BRD §9).
    // The Mobilisation tab renders independently of this flag, so disabling it
    // here removes their general enquiry editing / Kanban drag / quotation edits
    // without blocking their actual mobilization workflow.
    canEditEnquiry: isAdmin,
    canEditClients: isAdmin,
    canViewSettings: isAdmin,
    canAssignEnquiry: isAdmin,
    canEditQuotation: isAdmin,
    canEditPayments: isAdmin,
  };
}
