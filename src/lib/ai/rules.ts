import injectionPatterns from "./injection-patterns.json";
import type { LineSuggestion } from "./schema";

// Правила, які перевіряє КОД, а не лише промпт (зріз 4): модель пропонує, сервер перевіряє.

// Вказівки помічнику в описі (AC-AI-06, golden cases № 11, 12): перший рубіж — до виклику моделі, тому з будь-якою
// моделлю (і без неї) «Ігноруй інструкції…» не дає рядка. Другий рубіж — статус injection у відповіді моделі.
// Шаблони навмисно вузькі: дієслово-команда разом зі словом про правила / інструкції / промпт або прохання пароля;
// звичайний опис покупки (навіть «інструкція до принтера») сюди не потрапляє. Шаблони — дані в injection-patterns.json.
const INJECTION_PATTERNS: readonly RegExp[] = injectionPatterns.patterns.map((p) => new RegExp(p, "iu"));

export function looksLikeInjection(text: string): boolean {
  return INJECTION_PATTERNS.some((re) => re.test(text));
}

export type FormLine = { name: string; purpose: string; quantity: string; price: string };

// Межі рядка — як у формі й у базі (припущення PM у #64 і #71): кількість — ціле число від 1, ціна — від 0.
// Невідоме поле (null) — порожнє поле форми, а не помилка межі: людина доповнює й сама подає (припущення до питання PM #79).
export function checkLine(
  s: LineSuggestion,
): { kind: "line"; line: FormLine } | { kind: "invalid"; issue: "quantity" | "price" } {
  if (s.quantity !== null && !(Number.isInteger(s.quantity) && s.quantity >= 1)) return { kind: "invalid", issue: "quantity" };
  if (s.price !== null && !(Number.isFinite(s.price) && s.price >= 0)) return { kind: "invalid", issue: "price" };
  return {
    kind: "line",
    line: {
      name: s.name?.trim() ?? "",
      purpose: s.purpose?.trim() ?? "",
      quantity: s.quantity === null ? "" : String(s.quantity),
      price: s.price === null ? "" : s.price.toFixed(2),
    },
  };
}
