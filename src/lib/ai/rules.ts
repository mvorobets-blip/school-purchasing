import injectionPatterns from "./injection-patterns.json";
import { normalizeText } from "./text";
import { invalidNumberFields } from "@/lib/purchase/form";
import type { LineSuggestion } from "./schema";

// Правила, які перевіряє КОД, а не лише промпт (зріз 4): модель пропонує, сервер перевіряє.

// Вказівки помічнику в описі (AC-AI-06, golden cases № 11, 12): перший рубіж — до виклику моделі, тому з будь-якою
// моделлю (і без неї) «Ігноруй інструкції…» не дає рядка. Другий рубіж — статус injection у відповіді моделі.
// Шаблони навмисно вузькі: дієслово-команда разом зі словом про правила / інструкції / промпт або прохання пароля;
// звичайний опис покупки (навіть «інструкція до принтера») сюди не потрапляє. Шаблони — дані в injection-patterns.json.
const INJECTION_PATTERNS: readonly RegExp[] = injectionPatterns.patterns.map((p) => new RegExp(p, "iu"));

// Перед перевіркою текст нормалізуємо (незалежне рев'ю PR 76): NFKC зводить повноширинні й стилізовані літери до
// звичайних, \p{Cf} прибирає невидимі символи (zero-width space, м'який перенос), а схожі кирилично-латинські літери
// перевіряємо в обидва боки. Це звужує обхід, а не гарантує: другий рубіж — статус injection у відповіді моделі.
const TO_LATIN = new Map(Object.entries(injectionPatterns.homoglyphs));
const TO_CYRILLIC = new Map([...TO_LATIN].map(([cyr, lat]) => [lat, cyr]));
const fold = (text: string, map: ReadonlyMap<string, string>) => [...text].map((ch) => map.get(ch) ?? ch).join("");

function variants(text: string): string[] {
  const clean = normalizeText(text);
  return [clean, fold(clean, TO_LATIN), fold(clean, TO_CYRILLIC)];
}

export function looksLikeInjection(text: string): boolean {
  return variants(text).some((v) => INJECTION_PATTERNS.some((re) => re.test(v)));
}

export type FormLine = { name: string; purpose: string; quantity: string; price: string };

// Межі рядка — як у формі й у базі (припущення PM у #64 і #71): кількість — ціле число від 1, ціна — від 0.
// Невідоме поле (null) — порожнє поле форми, а не помилка межі: людина доповнює й сама подає (припущення до питання PM #79).
export function checkLine(
  s: LineSuggestion,
): { kind: "line"; line: FormLine } | { kind: "invalid"; issue: "quantity" | "price" } {
  if (s.quantity !== null && !(Number.isInteger(s.quantity) && s.quantity >= 1)) return { kind: "invalid", issue: "quantity" };
  if (s.price !== null && !(Number.isFinite(s.price) && s.price >= 0)) return { kind: "invalid", issue: "price" };
  const line: FormLine = {
    name: s.name?.trim() ?? "",
    purpose: s.purpose?.trim() ?? "",
    quantity: s.quantity === null ? "" : s.quantity.toFixed(0),
    // Ціну округлюємо до центів так само, як колонка numeric(12, 2) у базі (форма показує те, що збережеться).
    price: s.price === null ? "" : s.price.toFixed(2),
  };
  // Верхні межі — ті самі, що у формі й у базі (private.validate_purchase_lines): кількість до 2 147 483 647, ціна
  // менша за 10 000 000 000 після округлення. Окремого правила тут не тримаємо — та сама функція, що позначає поля форми.
  const bad = invalidNumberFields(line);
  if (bad.includes("quantity")) return { kind: "invalid", issue: "quantity" };
  if (bad.includes("price")) return { kind: "invalid", issue: "price" };
  return { kind: "line", line };
}
