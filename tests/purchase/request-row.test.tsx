// Рядок заявки на головній (RequestRow): автор одразу бачить, що виправити в поверненій заявці, — причину повернення
// під рядком (вимога 63, крок 3; рев'ю CodeRabbit, PR 61). Регресійний тест без AC ID: AC-DEC-04 доводить статус.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RequestRow } from "@/components/portal/dashboard";

const row = (status: string, reasons: { rejectReason?: string | null; returnReason?: string | null } = {}) =>
  renderToStaticMarkup(
    <RequestRow href="/requests/r1" title="Папір А4" more={1} meta="Початкова школа · Purchasing department" status={status} {...reasons} />,
  );

describe("рядок заявки на головній", () => {
  it("повернена заявка — «Returned for revision» і причина повернення під рядком", () => {
    const html = row("returned", { returnReason: "Уточніть кількість" });
    expect(html).toMatch(/data-testid="purchase-status"[^>]*>Returned for revision</);
    expect(html).toContain("Return reason: Уточніть кількість");
  });

  it("причину повернення не показано в заявки з іншим статусом; відхилена — причина відхилення", () => {
    expect(row("pending", { returnReason: "Уточніть кількість" })).not.toContain("Return reason");
    const rejected = row("rejected", { rejectReason: "Немає бюджету", returnReason: "Уточніть кількість" });
    expect(rejected).toContain("Rejection reason: Немає бюджету");
    expect(rejected).not.toContain("Return reason");
  });
});
