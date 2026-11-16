import type { FormLine } from "./rules";
import type { SuggestResult } from "./suggest";

// Один golden case PM (ValiaBihun/2026-quitcode-dream-team#70): вхід → очікуване. Формат — tests/fixtures/golden/cases.json.
// «Поля» PM — точні значення (стан, кількість, ціна, повідомлення); «текст» назви й мети — правило «містить»
// (без урахування регістру). Тому суддя-модель не потрібна: усе перевіряє код, і живий eval не витрачає зайвих запитів.
export type GoldenCase = {
  id: string;
  input: string;
  expected: {
    state: SuggestResult["state"];
    quantity?: number;
    price?: number;
    nameContains?: string;
    purposeContains?: string;
    issue?: "quantity" | "price";
    message?: string;
  };
};

export function scoreCase(expected: GoldenCase["expected"], result: SuggestResult): { pass: boolean; mismatches: string[] } {
  const mismatches: string[] = [];
  if (result.state !== expected.state) mismatches.push(`state: expected ${expected.state}, got ${result.state}`);
  mismatches.push(...(result.state === "line" ? lineMismatches(expected, result.line) : messageMismatches(expected, result)));
  return { pass: mismatches.length === 0, mismatches };
}

// «Поля» PM — точні числа; «текст» назви й мети — правило «містить» без урахування регістру.
function lineMismatches(expected: GoldenCase["expected"], line: FormLine): string[] {
  const out: string[] = [];
  if (expected.quantity !== undefined && Number(line.quantity) !== expected.quantity) {
    out.push(`quantity: expected ${expected.quantity}, got «${line.quantity}»`);
  }
  if (expected.price !== undefined && Number(line.price) !== expected.price) out.push(`price: expected ${expected.price}, got «${line.price}»`);
  if (!contains(line.name, expected.nameContains)) out.push(`name: «${line.name}» does not contain «${expected.nameContains}»`);
  if (!contains(line.purpose, expected.purposeContains)) {
    out.push(`purpose: «${line.purpose}» does not contain «${expected.purposeContains}»`);
  }
  return out;
}

function messageMismatches(expected: GoldenCase["expected"], result: Exclude<SuggestResult, { state: "line" }>): string[] {
  const out: string[] = [];
  if (expected.message !== undefined && result.message !== expected.message) {
    out.push(`message: expected «${expected.message}», got «${result.message}»`);
  }
  if (expected.issue !== undefined && result.issue !== expected.issue) out.push(`issue: expected ${expected.issue}, got ${result.issue ?? "—"}`);
  return out;
}

const contains = (text: string, part: string | undefined) => !part || text.toLowerCase().includes(part.toLowerCase());

// Частка успіху (pass rate) прогону golden cases.
export function passRate(results: readonly { pass: boolean }[]): { passed: number; total: number; rate: number } {
  const passed = results.filter((r) => r.pass).length;
  return { passed, total: results.length, rate: results.length ? passed / results.length : 0 };
}
