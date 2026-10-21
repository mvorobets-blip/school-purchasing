import type { Role } from "./roles";

export type CurrentUser = { role: Role; isActive: boolean };

// Список працівників і налаштування відділів — лише активному адміністратору (AC-ORG-09).
// Те саме правило в базі тримає private.is_admin() у політиках RLS.
export function canAccessSettings(user: CurrentUser | null): boolean {
  return user !== null && user.isActive && user.role === "admin";
}
