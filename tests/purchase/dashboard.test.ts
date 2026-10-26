import { describe, expect, it } from "vitest";
import { countByStatus, lineSummaries, pendingByDepartment } from "@/lib/purchase/dashboard";
import { formatSubmitted } from "@/lib/purchase/date";

describe("головна: підрахунки", () => {
  it("рахує заявки за статусами, невідомий статус пропускає", () => {
    const rows = [{ status: "pending" }, { status: "approved" }, { status: "pending" }, { status: "draft" }];
    expect(countByStatus(rows)).toEqual({ pending: 2, approved: 1, rejected: 0 });
    expect(countByStatus([])).toEqual({ pending: 0, approved: 0, rejected: 0 });
  });

  it("підсумок позицій: перша за порядком і скільки ще", () => {
    const summaries = lineSummaries([
      { request_id: "a", position: 2, name: "Ручки" },
      { request_id: "a", position: 1, name: "Папір А4" },
      { request_id: "a", position: 3, name: "Скріпки" },
      { request_id: "b", position: 1, name: "Маркери" },
    ]);
    expect(summaries.get("a")).toEqual({ first: "Папір А4", more: 2 });
    expect(summaries.get("b")).toEqual({ first: "Маркери", more: 0 });
    expect(summaries.has("c")).toBe(false);
  });

  it("дата подання — формат першого зрізу за часом America/New_York (припущення PM)", () => {
    // 22:30 UTC 25 жовтня — у Нью-Йорку ще 25 жовтня (18:30); 05:00 UTC 26 жовтня — уже 26 жовтня (01:00).
    expect(formatSubmitted("2026-10-25T22:30:00Z")).toBe("25.10.2026");
    expect(formatSubmitted("2026-10-26T05:00:00Z")).toBe("26.10.2026");
  });

  it("заявки «Очікує схвалення» за відділами, рішення не рахує", () => {
    const byDept = pendingByDepartment([
      { status: "pending", department_id: "d1" },
      { status: "pending", department_id: "d1" },
      { status: "approved", department_id: "d1" },
      { status: "rejected", department_id: "d2" },
    ]);
    expect(byDept.get("d1")).toBe(2);
    expect(byDept.has("d2")).toBe(false);
  });
});
