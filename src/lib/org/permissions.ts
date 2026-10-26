import type { Role } from "./roles";

// Дозволи з таблиці employee_permissions (перевірка в базі — employee_permissions_permission_check).
export type Permission = "card_expense" | "check_request" | "vendor_bill" | "self_purchase";

export type TypeAccess = { label: string; allowed: boolean };

// Матриця прав «Продукту»: «Закупівля» й «Відшкодування» — усім; три інші типи заявок і «Самостійна закупівля» —
// лише з дозволом, адміністратору — завжди; «Відділ закупівель» — завжди (глосарій, питання PM #44).
const PERMISSION_TYPES: { permission: Permission; label: string }[] = [
  { permission: "card_expense", label: "Card expense" },
  { permission: "check_request", label: "Check request" },
  { permission: "vendor_bill", label: "Vendor invoice" },
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
    { label: "Self-purchase", allowed: role === "admin" || permissions.includes("self_purchase") },
  ];
}

// Ініціали для аватара: з повного імені (перші літери двох слів) або з email.
export function initials(fullName: string | null, email: string | null): string {
  const source = fullName?.trim() || email?.split("@")[0] || "";
  const parts = source.split(/[\s._-]+/).filter(Boolean);
  const letters = parts.length > 1 ? parts[0][0] + parts[1][0] : source.slice(0, 2);
  return letters.toUpperCase() || "?";
}
