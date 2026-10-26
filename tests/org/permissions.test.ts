import { describe, expect, it } from "vitest";
import { initials, purchaseTypeAccess, requestTypeAccess } from "@/lib/org/permissions";

const allowed = (list: { label: string; allowed: boolean }[]) => list.filter((t) => t.allowed).map((t) => t.label);

describe("типи заявок і закупівлі у власному профілі", () => {
  it("працівник без дозволів: лише «Purchase», «Reimbursement» і «Purchasing department»", () => {
    expect(allowed(requestTypeAccess("requester", []))).toEqual(["Purchase", "Reimbursement"]);
    expect(allowed(purchaseTypeAccess("requester", []))).toEqual(["Purchasing department"]);
  });

  it("дозвіл додає саме свій тип", () => {
    expect(allowed(requestTypeAccess("approver", ["card_expense"]))).toContain("Card expense");
    expect(allowed(requestTypeAccess("approver", ["card_expense"]))).not.toContain("Check request");
    expect(allowed(purchaseTypeAccess("requester", ["self_purchase"]))).toContain("Self-purchase");
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
