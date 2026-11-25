import type { Role } from "./roles";

// Дозволи з таблиці employee_permissions (перевірка в базі — employee_permissions_permission_check).
export const PERMISSIONS = ["card_expense", "check_request", "vendor_bill", "self_purchase"] as const;
export type Permission = (typeof PERMISSIONS)[number];

// Назви дозволів в інтерфейсі (таблиця вимоги 49): три типи заявок і тип закупівлі «Самостійна закупівля».
export const PERMISSION_LABEL: Record<Permission, string> = {
  card_expense: "Card expense",
  check_request: "Check request",
  vendor_bill: "Vendor invoice",
  self_purchase: "Self-purchase",
};

export type TypeAccess = { label: string; allowed: boolean };

// Матриця прав «Продукту»: «Закупівля» й «Відшкодування» — усім; три інші типи заявок і «Самостійна закупівля» —
// лише з дозволом, адміністратору — завжди; «Відділ закупівель» — завжди (глосарій, питання PM #44).
const PERMISSION_TYPES: { permission: Permission; label: string }[] = [
  { permission: "card_expense", label: PERMISSION_LABEL.card_expense },
  { permission: "check_request", label: PERMISSION_LABEL.check_request },
  { permission: "vendor_bill", label: PERMISSION_LABEL.vendor_bill },
];

export function requestTypeAccess(role: Role, permissions: readonly string[]): TypeAccess[] {
  const has = (p: Permission) => role === "admin" || permissions.includes(p);
  return [
    { label: "Purchase", allowed: true },
    { label: "Reimbursement", allowed: true },
    ...PERMISSION_TYPES.map((t) => ({ label: t.label, allowed: has(t.permission) })),
  ];
}

export function purchaseTypeAccess(role: Role, permissions: readonly string[]): TypeAccess[] {
  return [
    { label: "Purchasing department", allowed: true },
    { label: PERMISSION_LABEL.self_purchase, allowed: role === "admin" || permissions.includes("self_purchase") },
  ];
}

// Ініціали для аватара: з повного імені (перші літери двох слів) або з email.
export function initials(fullName: string | null, email: string | null): string {
  const source = fullName?.trim() || email?.split("@")[0] || "";
  const parts = source.split(/[\s._-]+/).filter(Boolean);
  const letters = parts.length > 1 ? parts[0][0] + parts[1][0] : source.slice(0, 2);
  return letters.toUpperCase() || "?";
}
