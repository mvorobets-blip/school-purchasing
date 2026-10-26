import { purchaseTypeAccess } from "@/lib/org/permissions";
import type { Role } from "@/lib/org/roles";

export type PurchaseType = "purchasing_department" | "self_purchase";
export type Option = { value: string; label: string };
export type PurchaseLine = { name: string; purpose: string; quantity: string; price: string };

export const PURCHASE_TYPE_LABEL: Record<PurchaseType, string> = {
  purchasing_department: "Відділ закупівель",
  self_purchase: "Самостійна закупівля",
};

// Відділи у формі: адміністратор — усі (AC-ORG-22, AC-ORG-29); інші — лише ті, де вони заявники (AC-FRM-01).
// Порожній список для не-адміністратора — форма показує пояснення замість полів (AC-FRM-05).
export function departmentOptions(
  role: Role,
  memberDepartmentIds: readonly string[],
  departments: readonly { id: string; name: string }[],
): Option[] {
  return departments
    .filter((d) => role === "admin" || memberDepartmentIds.includes(d.id))
    .map((d) => ({ value: d.id, label: d.name }))
    .sort((a, b) => a.label.localeCompare(b.label, "uk"));
}

// Типи закупівлі: «Відділ закупівель» — завжди; «Самостійна закупівля» — з дозволом або адміністратору
// (AC-FRM-03, AC-ORG-23). Те саме правило, що й «Мої дозволи» у профілі.
export function purchaseTypeOptions(role: Role, permissions: readonly string[]): Option[] {
  const allowed = new Set(purchaseTypeAccess(role, permissions).filter((t) => t.allowed).map((t) => t.label));
  return (Object.keys(PURCHASE_TYPE_LABEL) as PurchaseType[])
    .filter((type) => allowed.has(PURCHASE_TYPE_LABEL[type]))
    .map((type) => ({ value: type, label: PURCHASE_TYPE_LABEL[type] }));
}

// Рядки з форми: поля name.N, purpose.N, quantity.N, price.N. Повністю порожні рядки відкидаємо;
// частково заповнений рядок лишається — його відхилить база (INVALID_LINE), а не тиха втрата даних.
export function parseLines(formData: FormData): PurchaseLine[] {
  const indexes = new Set<string>();
  for (const key of formData.keys()) {
    const match = /^(name|purpose|quantity|price)\.(\d+)$/.exec(key);
    if (match) indexes.add(match[2]);
  }
  return [...indexes]
    .sort((a, b) => Number(a) - Number(b))
    .map((i) => ({
      name: String(formData.get(`name.${i}`) ?? "").trim(),
      purpose: String(formData.get(`purpose.${i}`) ?? "").trim(),
      quantity: String(formData.get(`quantity.${i}`) ?? "").trim(),
      price: String(formData.get(`price.${i}`) ?? "").trim(),
    }))
    .filter((l) => l.name || l.purpose || l.quantity || l.price);
}
