// Кнопки рішення з позначеними рядками (AC-DEC-01): позиції йдуть у форму схвалення прихованими полями rejectLine,
// основна кнопка — «Partially approve». Лише розмітка: дію не викликаємо.
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DecisionButtons } from "@/app/(portal)/approvals/decision-buttons";
import { MESSAGES, messageFor } from "@/lib/org/messages";
const ID = "11111111-1111-4111-8111-111111111111";

// Стан дії схвалення в розмітці: за замовчуванням — справжній useActionState (idle); тест може підставити стан після
// відповіді дії (forced). Власних модулів не мокаємо (правило ESLint): щоб довести, що варіант Alert обирає
// messageFor("FORBIDDEN"), а не рядок, вписаний у компонент, тест на час перевірки змінює сам текст у MESSAGES.
const FORBIDDEN_TEXT = "Доступ заборонено (тест)";
const ORIGINAL_FORBIDDEN = MESSAGES.FORBIDDEN;
const messages = MESSAGES as Record<keyof typeof MESSAGES, string>;
const actionState = vi.hoisted(() => ({ forced: null as null | { status: string; message: string } }));
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useActionState: ((...args: Parameters<typeof actual.useActionState>) =>
      actionState.forced ? [actionState.forced, () => {}, false] : actual.useActionState(...args)) as typeof actual.useActionState,
  };
});

describe("DecisionButtons", () => {
  it("AC-DEC-01: позначено рядок 2 — у формі приховане rejectLine=2, кнопка «Partially approve»", () => {
    const html = renderToStaticMarkup(<DecisionButtons requestId={ID} label="PUR-1" rejectedPositions={[2]} />);
    expect(html).toMatch(/<input type="hidden" name="rejectLine" value="2"\/?>/);
    expect(html).toContain("Partially approve");
  });

  it("без позначених — «Approve», прихованих rejectLine немає (список «Awaiting decision» як у зрізі 2)", () => {
    const html = renderToStaticMarkup(<DecisionButtons requestId={ID} label="PUR-1" />);
    expect(html).not.toContain('name="rejectLine"');
    expect(html).toMatch(/>Approve</);
    expect(html).not.toContain("Partially approve");
  });

  // Задача 4: «Return for revision» — другорядна дія (outline) з причиною в діалозі; основною лишається «Approve».
  it("кнопка «Return for revision» — другорядна (outline), основна суцільна кнопка — «Approve»", () => {
    const html = renderToStaticMarkup(<DecisionButtons requestId={ID} label="PUR-1" />);
    const buttons = [...html.matchAll(/<button[^>]*>[\s\S]*?<\/button>/g)].map((m) => m[0]);
    const byText = (text: string) => buttons.find((b) => b.replace(/<[^>]+>/g, "").trim() === text) ?? "";
    const returnButton = byText("Return for revision");
    expect(returnButton).not.toBe("");
    expect(returnButton).toContain("border-input");
    expect(returnButton).not.toContain("bg-primary");
    expect(byText("Approve")).toContain("bg-primary");
    // Суцільна індиго-кнопка — одна на екран (DESIGN.md).
    expect(buttons.filter((b) => b.includes("bg-primary"))).toHaveLength(1);
  });

  it("після рефакторингу в ReasonDialog «Reject» лишився незворотною дією (destructive), підписи тригерів різні", () => {
    const html = renderToStaticMarkup(<DecisionButtons requestId={ID} label="PUR-1" />);
    const reject = [...html.matchAll(/<button[^>]*>[\s\S]*?<\/button>/g)].map((m) => m[0]).find((b) => b.replace(/<[^>]+>/g, "").trim() === "Reject") ?? "";
    expect(reject).toContain("border-destructive");
    expect(html).toContain('aria-label="Return for revision: PUR-1"');
    expect(html).toContain('aria-label="Reject: PUR-1"');
  });

  afterEach(() => {
    actionState.forced = null;
    messages.FORBIDDEN = ORIGINAL_FORBIDDEN;
  });

  // Рев'ю: варіант повідомлення про відмову — за messageFor("FORBIDDEN"), а не за літералом «Not enough permissions».
  it("відмова з текстом messageFor(\"FORBIDDEN\") — нейтральне повідомлення (Alert default), не червоне", () => {
    messages.FORBIDDEN = FORBIDDEN_TEXT;
    expect(messageFor("FORBIDDEN")).toBe(FORBIDDEN_TEXT);
    actionState.forced = { status: "error", message: messageFor("FORBIDDEN") };
    const html = renderToStaticMarkup(<DecisionButtons requestId={ID} label="PUR-1" />);
    const alerts = [...html.matchAll(/<div[^>]*data-slot="alert"[^>]*>[\s\S]*?<\/div>/g)].map((m) => m[0]);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toContain(FORBIDDEN_TEXT);
    expect(alerts[0]).toContain('data-testid="decision-message"');
    expect(alerts[0]).toContain("text-card-foreground");
    expect(alerts[0]).not.toContain("text-destructive");
  });

  it("інша помилка схвалення — червоне повідомлення (Alert destructive)", () => {
    actionState.forced = { status: "error", message: "All lines are rejected: reject the whole request" };
    const html = renderToStaticMarkup(<DecisionButtons requestId={ID} label="PUR-1" />);
    const alert = html.match(/<div[^>]*data-slot="alert"[^>]*>[\s\S]*?<\/div>/)?.[0] ?? "";
    expect(alert).toContain("All lines are rejected");
    expect(alert).toContain("text-destructive");
  });
});
