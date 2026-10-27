import { purchaseTypeAccess } from "@/lib/org/permissions";
import type { Role } from "@/lib/org/roles";

export type PurchaseType = "purchasing_department" | "self_purchase";
export type Option = { value: string; label: string };
export type PurchaseLine = { name: string; purpose: string; quantity: string; price: string };

export const PURCHASE_TYPE_LABEL: Record<PurchaseType, string> = {
  purchasing_department: "Purchasing department",
  self_purchase: "Self-purchase",
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

// ── Поведінка форми (зручність, не права: права перевіряє база) ──

// Відділ обрано заздалегідь лише тоді, коли варіант один: інакше легко подати не в той відділ.
export function initialDepartment(departments: readonly Option[]): string {
  return departments.length === 1 ? departments[0].value : "";
}

const LINE_FIELDS = ["name", "purpose", "quantity", "price"] as const;
export type LineField = (typeof LINE_FIELDS)[number];

// Порожні поля частково заповненого рядка — їх підсвічуємо після «Fill in all line fields» (AC-FRM-15).
// Повністю порожній рядок не підсвічуємо: parseLines його відкидає.
export function emptyLineFields(line: PurchaseLine): LineField[] {
  const filled = LINE_FIELDS.filter((f) => line[f].trim() !== "");
  if (filled.length === 0) return [];
  return LINE_FIELDS.filter((f) => line[f].trim() === "");
}

// Після «Not enough permissions» кнопка «Submit» вимкнена, доки людина не змінить відділ чи тип,
// для яких прийшла відмова (повторне подання того самого лише повторить відмову).
export function submitBlocked(
  refused: { departmentId: string; purchaseType: string } | null,
  current: { departmentId: string; purchaseType: string },
): boolean {
  return refused !== null && refused.departmentId === current.departmentId && refused.purchaseType === current.purchaseType;
}

// Технічні межі довжини тексту (припущення розробника, PM меж не задавав): ті самі check у базі —
// міграція 20261027142924_purchase_text_limits.sql.
export const LINE_TEXT_LIMIT = 200; // назва й мета рядка
export const REASON_LIMIT = 500; // причина відхилення

// Повідомлення про задовгий текст — власний текст розробника (PM меж і тексту не задавав; відгук PM на рев'ю WS7, #3):
// поле maxLength не дає набрати більше, тож людина бачить його лише при прямому виклику дії. Довжину рахуємо в символах
// Unicode, як char_length у базі.
export const LINE_TOO_LONG = `Name and purpose can be up to ${LINE_TEXT_LIMIT} characters`;
export const REASON_TOO_LONG = `The reason can be up to ${REASON_LIMIT} characters`;
export const textLength = (text: string) => [...text].length;
export const hasTooLongLine = (lines: readonly PurchaseLine[]) =>
  lines.some((l) => textLength(l.name) > LINE_TEXT_LIMIT || textLength(l.purpose) > LINE_TEXT_LIMIT);
// Відмова check-обмеження довжини в базі (…_name_length, …_purpose_length, …_reject_reason_length).
export const isTextLengthError = (error: { code?: string; message?: string } | null) =>
  error?.code === "23514" && /_length\b/.test(error.message ?? "");

// Межа ціни: колонка numeric(12, 2) округлює до копійок, і від 9 999 999 999.995 ціна стає 10 000 000 000.00.
// Ту саму межу (після округлення) перевіряє private.submit_purchase — міграція
// 20261027132703_submit_purchase_rounded_price_limit.sql — і відповідає INVALID_LINE; тут позначаємо поле заздалегідь.
const PRICE_LIMIT = 9_999_999_999.995;

// Кількість > 0, ціна від 0 і менша за PRICE_LIMIT, лише скінченні числа — ті самі межі перевіряє база
// (private.submit_purchase). Порожні поля — справа emptyLineFields; тут лише заповнені, але неможливі значення.
export function invalidNumberFields(line: PurchaseLine): LineField[] {
  const bad: LineField[] = [];
  const quantity = line.quantity.trim();
  const price = line.price.trim();
  if (quantity !== "" && !(Number.isFinite(Number(quantity)) && Number(quantity) > 0)) bad.push("quantity");
  if (price !== "" && !(Number.isFinite(Number(price)) && Number(price) >= 0 && Number(price) < PRICE_LIMIT)) bad.push("price");
  return bad;
}

// input type="number" дозволяє «-», «+» і експоненту «e»; у кількості й ціні їх не буває, тож їх не набираємо.
export function isBlockedNumberKey(key: string): boolean {
  return key === "-" || key === "+" || key === "e" || key === "E";
}
