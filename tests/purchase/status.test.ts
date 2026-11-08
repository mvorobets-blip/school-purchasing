import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { StatusBadge } from "@/components/portal/status-badge";
import * as status from "@/lib/purchase/status";

// Статуси зрізу 3: підписи — дослівно з таблиці PM (requirements/49-…md), колір — токени status-partial / status-returned.
const badge = (value: string) => renderToStaticMarkup(createElement(StatusBadge, { status: value }));

describe("статуси заявки зрізу 3", () => {
  it("AC-LANG-09: нові статуси підписано «Partially approved» і «Returned for revision»", () => {
    expect(status.STATUS_LABEL).toMatchObject({
      partially_approved: "Partially approved",
      returned: "Returned for revision",
    });
  });

  it("AC-LANG-09: бейдж статусу показує текст «Partially approved» / «Returned for revision», а не лише колір", () => {
    expect(badge("partially_approved")).toMatch(/data-testid="purchase-status"[^>]*>Partially approved</);
    expect(badge("returned")).toMatch(/data-testid="purchase-status"[^>]*>Returned for revision</);
  });

  it("нові статуси впізнає isPurchaseStatus, колір — лише токени status-partial і status-returned", () => {
    expect(status.isPurchaseStatus("partially_approved")).toBe(true);
    expect(status.isPurchaseStatus("returned")).toBe(true);
    expect(status.isPurchaseStatus("draft")).toBe(false);
    expect(status.STATUS_CLASS).toMatchObject({
      partially_approved: "bg-status-partial text-status-partial-foreground",
      returned: "bg-status-returned text-status-returned-foreground",
    });
    expect(badge("partially_approved")).toContain("bg-status-partial");
    expect(badge("returned")).toContain("bg-status-returned");
  });

  // Колір кожного статусу — свій токен (DESIGN.md §2); статус завжди з текстом, колір лише підсилює.
  it("кожен статус має власний токен кольору (зокрема статуси зрізу 2)", () => {
    expect(status.STATUS_CLASS).toEqual({
      pending: "bg-status-pending text-status-pending-foreground",
      approved: "bg-status-approved text-status-approved-foreground",
      rejected: "bg-status-rejected text-status-rejected-foreground",
      partially_approved: "bg-status-partial text-status-partial-foreground",
      returned: "bg-status-returned text-status-returned-foreground",
    });
  });

  it("підписи статусу рядка — «Approved» і «Rejected»", () => {
    expect((status as Record<string, unknown>).LINE_STATUS_LABEL).toEqual({ approved: "Approved", rejected: "Rejected" });
  });
});
