import { describe, expect, it } from "vitest";
import { quoteInAria } from "../../scripts/uat/lib.mjs";
import { haikuReasonOf } from "../../scripts/uat/combine.mjs";

// Свідомі відхилення від файлів курсу в конвеєрі UAT (відгук викладача на WS8: закріпити тестом, щоб оновлення
// матеріалів курсу не прибрало їх непомітно). Технічні тести — без AC ID.
describe("quoteInAria: кирилично-латинські двійники (fold, PR 44)", () => {
  const aria = '- cell "Папір А4"\n- text: "Status: Awaiting approval"';

  it("цитата з латинською A збігається з кириличною А на сторінці", () => {
    expect(quoteInAria("Папір A4", aria)).toBe(true);
  });

  it("інше слово не збігається: fold зводить лише літери-двійники", () => {
    expect(quoteInAria("Папір A5", aria)).toBe(false);
    expect(quoteInAria("Ручка A4", aria)).toBe(false);
  });

  it("регістр не зводиться: «awaiting approval» з малої — not-met (правило 4 рецензента)", () => {
    expect(quoteInAria("Status: Awaiting approval", aria)).toBe(true);
    expect(quoteInAria("status: awaiting approval", aria)).toBe(false);
  });
});

describe("haikuReasonOf: причина Haiku у звіті UAT (зауваження PM 6, PR 67)", () => {
  it("не PASS — нотатка й незараховані частини «Тоді»", () => {
    const reason = haikuReasonOf(
      { verdict: "FAIL", notes: "Інша мова", then_parts: [{ part: "статус", observable: "visible", status: "not-met", quoted_text: "Awaiting approval" }] },
      "",
    );
    expect(reason).toBe("Інша мова; «статус» — not-met («Awaiting approval»)");
  });

  it("PASS — цитати, яких немає на сторінці", () => {
    const v = { verdict: "PASS", notes: "", then_parts: [{ part: "статус", observable: "visible", status: "met", quoted_text: "Approved; Rejected" }] };
    expect(haikuReasonOf(v, '- text: "Approved"')).toBe("PASS, але цитат немає на сторінці: «Rejected»");
  });

  it("немає вердикту — так і сказано", () => {
    expect(haikuReasonOf(null, "")).toBe("вердикту немає (рецензент не відповів за схемою)");
  });
});
