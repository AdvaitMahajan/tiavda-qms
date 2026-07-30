import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { forbidden, unauthorized } from '../lib/errors';
import type { Role } from './auth';

/**
 * Role predicates mirror the database's RLS helpers exactly so the API enforces
 * the same permissions that RLS used to:
 *   is_editor()      -> super_admin | admin           (writes to quotations, payments, rate_matrix, settings)
 *   is_not_viewer()  -> anyone except viewer          (writes to enquiries, clients, follow_ups, etc.)
 */
export const isEditor = (role: Role): boolean => role === 'super_admin' || role === 'admin';
export const isNotViewer = (role: Role): boolean => role !== 'viewer';
export const isSuperAdmin = (role: Role): boolean => role === 'super_admin';

/**
 * Capability groups for the operations roles. Each is a strict SUPERSET of the
 * editor set, so super_admin/admin never lose access they already had — adding
 * a role can only widen permissions, never narrow them.
 */
export const canQuote = (role: Role): boolean => isEditor(role) || role === 'planning';
export const canBill = (role: Role): boolean =>
  isEditor(role) || role === 'accounts' || role === 'reporting';
export const canMobilise = (role: Role): boolean =>
  isEditor(role) || role === 'mobilization_lead' || role === 'execution_head' || role === 'execution';
/** "Manager" — approves site expenses. */
export const isManager = (role: Role): boolean => isEditor(role) || role === 'execution_head';

export function requireRole(...allowed: Role[]): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.auth) return next(unauthorized());
    if (!allowed.includes(req.auth.role)) {
      return next(forbidden(`Requires role: ${allowed.join(', ')}`));
    }
    next();
  };
}

export const requireEditor: RequestHandler = (req, _res, next) => {
  if (!req.auth) return next(unauthorized());
  if (!isEditor(req.auth.role)) return next(forbidden('Requires admin privileges'));
  next();
};

/** Manager gate — Admin / Execution Head (e.g. approving site expenses). */
export const requireManager: RequestHandler = (req, _res, next) => {
  if (!req.auth) return next(unauthorized());
  if (!isManager(req.auth.role)) return next(forbidden('Requires manager privileges'));
  next();
};

/** Mobilisation/site actions — the assigned team can record, admins always can. */
export const requireMobiliser: RequestHandler = (req, _res, next) => {
  if (!req.auth) return next(unauthorized());
  if (!canMobilise(req.auth.role)) return next(forbidden('Requires mobilisation privileges'));
  next();
};

/** Quotations, rate matrix and pricing config. */
export const requireQuoting: RequestHandler = (req, _res, next) => {
  if (!req.auth) return next(unauthorized());
  if (!canQuote(req.auth.role)) return next(forbidden('Requires quotation privileges'));
  next();
};

/** Payments, invoicing and final billing. */
export const requireBilling: RequestHandler = (req, _res, next) => {
  if (!req.auth) return next(unauthorized());
  if (!canBill(req.auth.role)) return next(forbidden('Requires billing privileges'));
  next();
};

export const requireNotViewer: RequestHandler = (req, _res, next) => {
  if (!req.auth) return next(unauthorized());
  if (!isNotViewer(req.auth.role)) return next(forbidden('Viewers cannot perform this action'));
  next();
};

export const requireSuperAdmin: RequestHandler = (req, _res, next) => {
  if (!req.auth) return next(unauthorized());
  if (!isSuperAdmin(req.auth.role)) return next(forbidden('Requires super admin'));
  next();
};

/** Platform owner gate — for the cross-org /admin/* console routes. */
export const requirePlatformAdmin: RequestHandler = (req, _res, next) => {
  if (!req.auth) return next(unauthorized());
  if (!req.auth.isPlatformAdmin) return next(forbidden('Requires platform admin'));
  next();
};

/**
 * Hard feature gate. The platform owner toggles features per org; if the caller's
 * org does not have `key` enabled, the API refuses (403) regardless of the UI.
 * Mount after authenticate on the routers a feature governs.
 */
export function requireFeature(key: string): RequestHandler {
  return (req, _res, next) => {
    if (!req.auth) return next(unauthorized());
    if (req.auth.features?.[key]) return next();
    return next(forbidden(`The "${key}" feature is not enabled for your organization`));
  };
}
