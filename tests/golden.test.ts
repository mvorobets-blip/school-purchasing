import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it } from "vitest";
import { AI_TEXT } from "@/lib/ai/messages";
import { LINE_PROMPT_VERSION } from "@/lib/ai/prompts/line";
import { scoreCase, type GoldenCase } from "@/lib/ai/scorer";
import { proposeLine } from "@/lib/ai/suggest";
import casesJson from "./fixtures/golden/cases.json";
import recordedJson from "./fixtures/golden/recorded.json";

// Офлайн-реплей golden cases PM (issue ValiaBihun/2026-quitcode-dream-team#70, набір WS10: № 1, 5, 6, 7, 8, 9, 11–14):
// без мережі й без ключа, тож працює в CI. Перевіряє КОД навколо моделі (правила ін'єкції, межа <document>, схема,
// межі кількості й ціни, тексти, оцінювач), а НЕ якість моделі — її міряє живий прогін `npm run eval`.
// expected у cases.json — лише з колонки PM «Очікуваний результат». recorded.json — справжні відповіді моделі з живого
// прогону `RECORD=1 npm run eval` (2026-11-16, промпт — LINE_PROMPT_VERSION, зараз line-v4; тест нижче не дає лишити записи іншої версії); для GC-11, 12 записів немає — ін'єкцію ловить код.

type Recording = { modelId: string; recordedAt: string; promptVersion?: string; text: string };
const cases = casesJson as (GoldenCase & { note?: string })[];
const recorded = recordedJson as Record<string, Recording>;

const usage = {
  inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 20, text: 20, reasoning: undefined },
};

// Модель, що «відповідає» записаним текстом кейсу; для кейсу без запису виклик моделі — помилка тесту.
function replay(id: string) {
  const rec = recorded[id];
  return new MockLanguageModelV4({
    modelId: rec?.modelId ?? "no-recording",
    doGenerate: async () => {
      if (!rec) throw new Error(`модель викликано для ${id}, але запису в recorded.json немає`);
      return { content: [{ type: "text", text: rec.text }], finishReason: { unified: "stop", raw: undefined }, usage, warnings: [] };
    },
  });
}

// Текст, який дійшов до моделі в повідомленні користувача (інструкції можуть самі згадувати <document>).
const userPrompt = (model: MockLanguageModelV4) =>
  JSON.stringify(model.doGenerateCalls[0].prompt.filter((m) => m.role === "user"));

const byIds = (...ids: string[]) => cases.filter((c) => ids.includes(c.id));
const modelCalled = (c: GoldenCase) => c.expected.state !== "injection";

describe("golden cases, офлайн-реплей", () => {
  it("набір WS10 — рівно 10 кейсів PM: GC-01, 05, 06, 07, 08, 09, 11, 12, 13, 14", () => {
    expect(cases.map((c) => c.id)).toEqual(["GC-01", "GC-05", "GC-06", "GC-07", "GC-08", "GC-09", "GC-11", "GC-12", "GC-13", "GC-14"]);
  });

  it.each(byIds("GC-01", "GC-13", "GC-14"))("AC-AI-01: golden $id", async (c) => {
    const model = replay(c.id);
    const result = await proposeLine(c.input, model);
    expect(result).toMatchObject({ state: "line", modelId: recorded[c.id].modelId });
    expect(scoreCase(c.expected, result).mismatches).toEqual([]);
    // Недовірений опис дійшов до моделі загорнутим як дані.
    expect(model.doGenerateCalls).toHaveLength(1);
    expect(userPrompt(model)).toContain("<document>");
    expect(userPrompt(model)).toContain(c.input);
  });

  it.each(byIds("GC-08", "GC-09"))("AC-AI-02: golden $id", async (c) => {
    const result = await proposeLine(c.input, replay(c.id));
    expect(result).toMatchObject({ state: "off_topic", message: AI_TEXT.offTopic });
    expect(result).not.toHaveProperty("line");
    expect(scoreCase(c.expected, result).mismatches).toEqual([]);
  });

  it.each(byIds("GC-11", "GC-12"))("AC-AI-06: golden $id", async (c) => {
    const model = replay(c.id);
    const result = await proposeLine(c.input, model);
    expect(result).toMatchObject({ state: "injection", message: AI_TEXT.injection });
    expect(result).not.toHaveProperty("line");
    expect(scoreCase(c.expected, result).mismatches).toEqual([]);
    // Вказівку зловив код — модель (і денний ліміт) не витрачено.
    expect(model.doGenerateCalls).toHaveLength(0);
  });

  // Кейси № 5–7 PM привʼязала до AC-AI-01 (відповідь на ValiaBihun/2026-quitcode-dream-team#78).
  it.each(byIds("GC-05", "GC-06", "GC-07"))("AC-AI-01: golden $id (межі кількості й ціни)", async (c) => {
    const result = await proposeLine(c.input, replay(c.id));
    expect(result).toMatchObject({ state: "invalid", issue: c.expected.issue });
    expect(result).not.toHaveProperty("line");
    expect(scoreCase(c.expected, result).mismatches).toEqual([]);
  });

  it("кожен golden case, де модель викликається, має запис поточної версії промпту", () => {
    const missing = cases.filter(modelCalled).map((c) => c.id).filter((id) => !recorded[id]);
    expect(missing).toEqual([]);
    const stale = Object.entries(recorded)
      .filter(([, r]) => r.promptVersion !== LINE_PROMPT_VERSION)
      .map(([id]) => id);
    // Змінили LINE_PROMPT_VERSION — перезапишіть записи живим прогоном (RECORD=1).
    expect(stale).toEqual([]);
    // Ін'єкції ловить код до моделі: запис для них був би мертвим.
    const dead = cases.filter((c) => !modelCalled(c) && recorded[c.id]).map((c) => c.id);
    expect(dead).toEqual([]);
  });
});

describe("оцінювач golden cases", () => {
  const line = { state: "line" as const, modelId: "m", line: { name: "Папір А4", purpose: "Для друку", quantity: "3", price: "20.00" } };

  it("рядок, що відповідає очікуваному (регістр «містить» не важливий, числа — за значенням), — pass без розбіжностей", () => {
    expect(scoreCase({ state: "line", quantity: 3, price: 20, nameContains: "ПАПІР", purposeContains: "друк" }, line)).toEqual({
      pass: true,
      mismatches: [],
    });
  });

  it("інша кількість, ціна, назва чи стан — fail з розбіжностями", () => {
    expect(scoreCase({ state: "line", quantity: 2 }, line).pass).toBe(false);
    expect(scoreCase({ state: "line", price: 20.01 }, line).pass).toBe(false);
    expect(scoreCase({ state: "line", nameContains: "крейд" }, line).pass).toBe(false);
    expect(scoreCase({ state: "line", purposeContains: "урок" }, line).pass).toBe(false);
    const wrongState = scoreCase({ state: "off_topic", message: AI_TEXT.offTopic }, line);
    expect(wrongState.pass).toBe(false);
    expect(wrongState.mismatches.length).toBeGreaterThan(0);
  });

  it("інше повідомлення чи issue — fail", () => {
    const invalid = { state: "invalid" as const, issue: "quantity" as const, message: "Quantity: a whole number from 1" };
    expect(scoreCase({ state: "invalid", issue: "price" }, invalid).pass).toBe(false);
    expect(scoreCase({ state: "invalid", issue: "quantity", message: "Price: a number from 0" }, invalid).pass).toBe(false);
    expect(scoreCase({ state: "invalid", issue: "quantity", message: "Quantity: a whole number from 1" }, invalid).pass).toBe(true);
  });
});
