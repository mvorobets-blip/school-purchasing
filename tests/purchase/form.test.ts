import { describe, expect, it } from "vitest";
import { departmentOptions, parseLines, purchaseTypeOptions } from "@/lib/purchase/form";

const DEPARTMENTS = [
  { id: "d-primary", name: "Початкова школа" },
  { id: "d-high", name: "Вища школа" },
  { id: "d-office", name: "Офіс" },
];

describe("варіанти у формі закупівлі", () => {
  it("AC-FRM-01: у виборі відділу лише відділи, де працівник заявник", () => {
    const options = departmentOptions("requester", ["d-primary", "d-office"], DEPARTMENTS);
    expect(options.map((o) => o.label)).toEqual(["Офіс", "Початкова школа"]);
    expect(options.map((o) => o.label)).not.toContain("Вища школа");
  });

  it("AC-FRM-03: без ролі admin і без дозволу — лише «Відділ закупівель»", () => {
    expect(purchaseTypeOptions("requester", []).map((o) => o.label)).toEqual(["Відділ закупівель"]);
    expect(purchaseTypeOptions("approver", ["card_expense"]).map((o) => o.label)).toEqual(["Відділ закупівель"]);
  });

  it("AC-FRM-05: працівник без жодного відділу не отримує варіантів відділу", () => {
    expect(departmentOptions("requester", [], DEPARTMENTS)).toEqual([]);
  });

  it("з дозволом і для адміністратора доступні обидва типи; адміністратору — усі відділи", () => {
    expect(purchaseTypeOptions("requester", ["self_purchase"]).map((o) => o.value)).toEqual([
      "purchasing_department",
      "self_purchase",
    ]);
    expect(purchaseTypeOptions("admin", []).map((o) => o.value)).toHaveLength(2);
    expect(departmentOptions("admin", [], DEPARTMENTS)).toHaveLength(3);
  });
});

describe("рядки з форми", () => {
  const fd = (entries: Record<string, string>) => {
    const f = new FormData();
    for (const [k, v] of Object.entries(entries)) f.set(k, v);
    return f;
  };

  it("збирає рядки за номером і відкидає повністю порожні", () => {
    const lines = parseLines(
      fd({
        "name.1": "Папір А4",
        "purpose.1": "Для друку",
        "quantity.1": "3",
        "price.1": "20.00",
        "name.2": "",
        "purpose.2": "",
        "quantity.2": "",
        "price.2": "",
      }),
    );
    expect(lines).toEqual([{ name: "Папір А4", purpose: "Для друку", quantity: "3", price: "20.00" }]);
  });

  it("частково заповнений рядок лишається — його відхилить база", () => {
    expect(parseLines(fd({ "name.1": "Папір А4", "purpose.1": "", "quantity.1": "", "price.1": "" }))).toHaveLength(1);
  });
});
