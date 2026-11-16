// Помічник рядків у формі нової закупівлі: стан очікування, кнопка й повідомлення. Лише розмітка: дію не викликаємо.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AssistantStatus, DescriptionField, SuggestButton, suggestLine } from "@/app/(portal)/requests/new/line-assistant";
import { AI_TEXT } from "@/lib/ai/messages";
import type { SuggestResult } from "@/lib/ai/suggest";
import { MESSAGES } from "@/lib/org/messages";

// Текст без тегів; сутності HTML, які ставить React (апостроф у «don't» — &#x27;), розкодовано.
const text = (html: string) =>
  html.replace(/<[^>]+>/g, "").replace(/&#x27;/g, "'").replace(/&quot;/g, "\"").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
// Вміст елемента з role="status" (без вкладених тегів).
const statusText = (html: string) => {
  const m = html.match(/<(\w+)[^>]*role="status"[^>]*>([\s\S]*?)<\/\1>/);
  return text(m?.[2] ?? "");
};
const button = (html: string) => html.match(/<button[^>]*>[\s\S]*?<\/button>/)?.[0] ?? "";
const isDisabled = (html: string) => /<button[^>]*\sdisabled(=""|\s|>)/.test(button(html));

const failed = (state: SuggestResult["state"], message: string): SuggestResult => ({ state, message }) as SuggestResult;
const ALL_MESSAGES = [AI_TEXT.pending, AI_TEXT.offTopic, AI_TEXT.failed, AI_TEXT.unavailable, AI_TEXT.injection];

describe("AssistantStatus і SuggestButton", () => {
  it("AC-AI-03: поки відповіді немає — напис «Looking for lines…» (role=status), кнопка «Suggest lines» неактивна", () => {
    const status = renderToStaticMarkup(<AssistantStatus pending result={null} />);
    expect(statusText(status)).toContain(AI_TEXT.pending);
    const html = renderToStaticMarkup(<SuggestButton pending />);
    expect(text(button(html))).toContain(AI_TEXT.button);
    expect(isDisabled(html)).toBe(true);
  });

  it("AC-AI-03: поки відповіді немає — введений опис лишається в полі «Purchase description», поле не вимкнене", () => {
    const description = "Need 3 packs of A4 paper for printing, 20 dollars each";
    const html = renderToStaticMarkup(
      <>
        <DescriptionField value={description} onChange={() => {}} />
        <SuggestButton pending />
        <AssistantStatus pending result={null} />
      </>,
    );
    const textarea = html.match(/<textarea[^>]*>([\s\S]*?)<\/textarea>/);
    expect(text(textarea?.[1] ?? "")).toBe(description);
    expect(textarea?.[0]).not.toMatch(/\sdisabled(=""|\s|>)/);
    expect(statusText(html)).toBe(AI_TEXT.pending);
  });

  it("без очікування — кнопка «Suggest lines» активна, напису «Looking for lines…» немає", () => {
    const html = renderToStaticMarkup(<SuggestButton pending={false} />);
    expect(text(button(html))).toContain(AI_TEXT.button);
    expect(isDisabled(html)).toBe(false);
    expect(text(renderToStaticMarkup(<AssistantStatus pending={false} result={null} />))).not.toContain(AI_TEXT.pending);
  });

  it("AC-AI-02: опис не про закупівлю — видно «I can only help with purchases»", () => {
    const html = renderToStaticMarkup(<AssistantStatus pending={false} result={failed("off_topic", AI_TEXT.offTopic)} />);
    expect(text(html)).toContain(AI_TEXT.offTopic);
  });

  it("AC-AI-04: немає відповіді вчасно — видно «Could not get a suggestion. Fill in the lines manually»", () => {
    const html = renderToStaticMarkup(<AssistantStatus pending={false} result={failed("failed", AI_TEXT.failed)} />);
    expect(text(html)).toContain(AI_TEXT.failed);
  });

  it("AC-AI-05: ліміт вичерпано — видно «The assistant is unavailable today. Fill in the lines manually»", () => {
    const html = renderToStaticMarkup(<AssistantStatus pending={false} result={failed("unavailable", AI_TEXT.unavailable)} />);
    expect(text(html)).toContain(AI_TEXT.unavailable);
  });

  it("AC-AI-06: вказівка в описі — видно «I don't follow instructions from the description. Describe the purchase»", () => {
    const html = renderToStaticMarkup(<AssistantStatus pending={false} result={failed("injection", AI_TEXT.injection)} />);
    expect(text(html)).toContain(AI_TEXT.injection);
  });

  it("неможлива кількість від моделі — текст межі з форми «Quantity: a whole number from 1»", () => {
    const result = { state: "invalid", issue: "quantity", message: MESSAGES.INVALID_QUANTITY } as SuggestResult;
    expect(text(renderToStaticMarkup(<AssistantStatus pending={false} result={result} />))).toContain(MESSAGES.INVALID_QUANTITY);
  });

  it("рядок запропоновано — жодного повідомлення помічника", () => {
    const result: SuggestResult = {
      state: "line",
      modelId: "m",
      line: { name: "Папір А4", purpose: "Для друку", quantity: "3", price: "20.00" },
    };
    const shown = text(renderToStaticMarkup(<AssistantStatus pending={false} result={result} />));
    for (const message of ALL_MESSAGES) expect(shown).not.toContain(message);
  });

  it("відмова дії — видно «Not enough permissions»", () => {
    const html = renderToStaticMarkup(<AssistantStatus pending={false} result={null} forbidden={MESSAGES.FORBIDDEN} />);
    expect(text(html)).toContain(MESSAGES.FORBIDDEN);
  });
});

describe("suggestLine — виклик дії з форми помічника", () => {
  const idle = { status: "idle" } as const;
  const line = { name: "Папір А4", purpose: "Для друку", quantity: "3", price: "20.00" };

  it("сам виклик дії впав (мережа, профіль) — «Could not get a suggestion. Fill in the lines manually», рядка немає", async () => {
    const onLine = vi.fn();
    const state = await suggestLine(idle, new FormData(), onLine, () => Promise.reject(new Error("network")));
    expect(state).toEqual({ status: "done", result: { state: "failed", message: AI_TEXT.failed } });
    expect(onLine).not.toHaveBeenCalled();
  });

  it("пропозиція рядка — рядок передано у форму рівно один раз", async () => {
    const onLine = vi.fn();
    await suggestLine(idle, new FormData(), onLine, async () => ({ status: "done", result: { state: "line", line, modelId: "m" } }));
    expect(onLine).toHaveBeenCalledExactlyOnceWith(line);
  });
});
