import { describe, expect, it } from "vitest";
import {
  emptyLineFields,
  hasTooLongLine,
  invalidNumberFields,
  isTextLengthError,
  LINE_TEXT_LIMIT,
  parseLines,
} from "@/lib/purchase/form";

// Регресійні тести поведінки, якої немає в жодному AC PM (тому без AC ID у назвах): межі, знайдені мутаційним
// тестуванням (Stryker) у src/lib/purchase/form.ts.

const fd = (entries: [string, string][]) => {
  const f = new FormData();
  for (const [k, v] of entries) f.append(k, v);
  return f;
};

const line = (fields: Partial<{ name: string; purpose: string; quantity: string; price: string }>) => ({
  name: "Папір А4",
  purpose: "Друк",
  quantity: "1",
  price: "20",
  ...fields,
});

describe("parseLines: рядки з форми", () => {
  it("обрізає пробіли навколо назви", () => {
    const lines = parseLines(fd([["name.1", "  Папір А4\t"], ["purpose.1", "Друк"], ["quantity.1", "1"], ["price.1", "20"]]));
    expect(lines.map((l) => l.name)).toEqual(["Папір А4"]);
  });

  it("назва, якої немає у формі, — порожній рядок", () => {
    const lines = parseLines(fd([["purpose.1", "Друк"], ["quantity.1", "1"], ["price.1", "20"]]));
    expect(lines).toEqual([{ name: "", purpose: "Друк", quantity: "1", price: "20" }]);
  });

  it("рядок з двозначним номером не губиться", () => {
    const lines = parseLines(fd([["name.10", "Папір А4"], ["purpose.10", "Друк"], ["quantity.10", "1"], ["price.10", "20"]]));
    expect(lines).toEqual([{ name: "Папір А4", purpose: "Друк", quantity: "1", price: "20" }]);
  });

  it("рядки впорядковано за номером як числом, а не за порядком полів у формі", () => {
    const lines = parseLines(
      fd([
        ["name.10", "Десятий"],
        ["name.2", "Другий"],
        ["name.11", "Одинадцятий"],
        ["name.1", "Перший"],
        ["name.3", "Третій"],
      ]),
    );
    expect(lines.map((l) => l.name)).toEqual(["Перший", "Другий", "Третій", "Десятий", "Одинадцятий"]);
  });
});

describe("emptyLineFields: підсвітка порожніх полів", () => {
  it("рядок лише з пробілів — повністю порожній, без підсвітки", () => {
    expect(emptyLineFields({ name: " ", purpose: "  ", quantity: " ", price: "\t" })).toEqual([]);
  });
});

describe("hasTooLongLine: довжина назви й мети", () => {
  const text = (n: number) => "а".repeat(n);

  it("рівно межа — можна, на символ більше — задовго (назва й мета)", () => {
    expect(hasTooLongLine([line({ name: text(LINE_TEXT_LIMIT), purpose: text(LINE_TEXT_LIMIT) })])).toBe(false);
    expect(hasTooLongLine([line({ name: text(LINE_TEXT_LIMIT + 1) })])).toBe(true);
    expect(hasTooLongLine([line({ purpose: text(LINE_TEXT_LIMIT + 1) })])).toBe(true);
  });

  it("довжину рахуємо в символах Unicode, а не в одиницях UTF-16", () => {
    const emoji = "📦".repeat(LINE_TEXT_LIMIT);
    expect(emoji.length).toBe(LINE_TEXT_LIMIT * 2);
    expect(hasTooLongLine([line({ name: emoji, purpose: emoji })])).toBe(false);
  });

  it("досить одного задовгого рядка серед кількох", () => {
    expect(hasTooLongLine([line({}), line({ purpose: text(LINE_TEXT_LIMIT + 1) })])).toBe(true);
  });
});

describe("isTextLengthError: відмова check-обмеження довжини в базі", () => {
  const checkViolation = (constraint: string) =>
    `new row for relation "purchase_request_lines" violates check constraint "${constraint}"`;

  it("немає помилки — не відмова довжини", () => {
    expect(isTextLengthError(null)).toBe(false);
  });

  it("код 23514 і обмеження …_length — відмова довжини", () => {
    expect(isTextLengthError({ code: "23514", message: checkViolation("purchase_request_lines_name_length") })).toBe(true);
    expect(isTextLengthError({ code: "23514", message: checkViolation("purchase_requests_reject_reason_length") })).toBe(true);
  });

  it("код 23514 з іншим обмеженням або без повідомлення — не відмова довжини", () => {
    expect(isTextLengthError({ code: "23514", message: checkViolation("purchase_request_lines_quantity_check") })).toBe(false);
    expect(isTextLengthError({ code: "23514" })).toBe(false);
  });

  it("інший код з …_length у повідомленні — не відмова довжини", () => {
    expect(isTextLengthError({ code: "42501", message: checkViolation("purchase_request_lines_name_length") })).toBe(false);
    expect(isTextLengthError({ message: checkViolation("purchase_request_lines_name_length") })).toBe(false);
  });
});

describe("invalidNumberFields: неможливі числа", () => {
  it("кількість лише з пробілів — порожня (справа emptyLineFields), не неможлива", () => {
    expect(invalidNumberFields(line({ quantity: "  " }))).toEqual([]);
  });

  it("ціна 9 999 999 999.995 після округлення — 10 000 000 000.00, тож неможлива; 9 999 999 999.99 — можна", () => {
    expect(invalidNumberFields(line({ price: "9999999999.995" }))).toEqual(["price"]);
    expect(invalidNumberFields(line({ price: "9999999999.99" }))).toEqual([]);
  });
});
