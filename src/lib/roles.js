import { createContext, useContext } from 'react';

export const VALID_ROLES = ['superadmin', 'admin', 'user'];

export const ROLE_LABELS = {
  superadmin: 'Super Operator',
  admin: 'Operator',
  user: 'User Mobile',
};

export function getSessionRole(session) {
  return session?.user?.app_metadata?.role ?? null;
}

export function getRoleLabel(role) {
  return ROLE_LABELS[role] ?? 'Tidak ada akses';
}

export function canAccessDashboard(role) {
  return role === 'admin' || role === 'superadmin';
}

export function isSuperadmin(role) {
  return role === 'superadmin';
}

export const RoleContext = createContext({ role: null, session: null });

export function useRole() {
  return useContext(RoleContext);
}
