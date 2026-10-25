import { describe, expect, it } from "vitest";
import { initials, purchaseTypeAccess, requestTypeAccess } from "@/lib/org/permissions";

const allowed = (list: { label: string; allowed: boolean }[]) => list.filter((t) => t.allowed).map((t) => t.label);

describe("типи заявок і закупівлі у власному профілі", () => {
  it("працівник без дозволів: лише «Закупівля», «Відшкодування» і «Відділ закупівель»", () => {
    expect(allowed(requestTypeAccess("requester", []))).toEqual(["Закупівля", "Відшкодування"]);
    expect(allowed(purchaseTypeAccess("requester", []))).toEqual(["Відділ закупівель"]);
  });

  it("дозвіл додає саме свій тип", () => {
    expect(allowed(requestTypeAccess("approver", ["card_expense"]))).toContain("Витрата карткою");
    expect(allowed(requestTypeAccess("approver", ["card_expense"]))).not.toContain("Запит на чек");
    expect(allowed(purchaseTypeAccess("requester", ["self_purchase"]))).toContain("Самостійна закупівля");
  });

  it("адміністратор без окремих дозволів має всі типи", () => {
    expect(requestTypeAccess("admin", []).every((t) => t.allowed)).toBe(true);
    expect(purchaseTypeAccess("admin", []).every((t) => t.allowed)).toBe(true);
  });
});

describe("ініціали для аватара", () => {
  it("з повного імені, з email або «?»", () => {
    expect(initials("Олена Петренко", null)).toBe("ОП");
    expect(initials(null, "member1@example.test")).toBe("ME");
    expect(initials(null, "first.last@example.test")).toBe("FL");
    expect(initials(null, null)).toBe("?");
  });
});
