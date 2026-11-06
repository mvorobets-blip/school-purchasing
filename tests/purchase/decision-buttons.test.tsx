// Кнопки рішення з позначеними рядками (AC-DEC-01): позиції йдуть у форму схвалення прихованими полями rejectLine,
// основна кнопка — «Partially approve». Лише розмітка: дію не викликаємо.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DecisionButtons } from "@/app/(portal)/approvals/decision-buttons";
const ID = "11111111-1111-4111-8111-111111111111";

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
});
