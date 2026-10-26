import { describe, expect, it } from "vitest";
import {
  departmentOptions,
  emptyLineFields,
  initialDepartment,
  invalidNumberFields,
  isBlockedNumberKey,
  parseLines,
  purchaseTypeOptions,
  submitBlocked,
} from "@/lib/purchase/form";

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

  it("AC-FRM-03: без ролі admin і без дозволу — лише «Purchasing department»", () => {
    expect(purchaseTypeOptions("requester", []).map((o) => o.label)).toEqual(["Purchasing department"]);
    expect(purchaseTypeOptions("approver", ["card_expense"]).map((o) => o.label)).toEqual(["Purchasing department"]);
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

describe("поведінка форми закупівлі", () => {
  const opt = (value: string) => ({ value, label: value });

  it("відділ обрано заздалегідь лише коли варіант один", () => {
    expect(initialDepartment([opt("d1")])).toBe("d1");
    expect(initialDepartment([opt("d1"), opt("d2")])).toBe("");
    expect(initialDepartment([])).toBe("");
  });

  it("порожні поля частково заповненого рядка; повністю порожній рядок — без підсвітки", () => {
    expect(emptyLineFields({ name: "Папір А4", purpose: "", quantity: " ", price: "" })).toEqual(["purpose", "quantity", "price"]);
    expect(emptyLineFields({ name: "Папір А4", purpose: "Друк", quantity: "3", price: "20" })).toEqual([]);
    expect(emptyLineFields({ name: "", purpose: "", quantity: "", price: "" })).toEqual([]);
  });

  it("після відмови в правах Submit вимкнено для тих самих відділу й типу", () => {
    const refused = { departmentId: "d1", purchaseType: "self_purchase" };
    expect(submitBlocked(refused, { departmentId: "d1", purchaseType: "self_purchase" })).toBe(true);
    expect(submitBlocked(refused, { departmentId: "d2", purchaseType: "self_purchase" })).toBe(false);
    expect(submitBlocked(refused, { departmentId: "d1", purchaseType: "purchasing_department" })).toBe(false);
    expect(submitBlocked(null, { departmentId: "d1", purchaseType: "self_purchase" })).toBe(false);
  });
});

describe("числа в рядку закупівлі", () => {
  const line = (quantity: string, price: string) => ({ name: "Папір А4", purpose: "Друк", quantity, price });

  it("кількість > 0 і ціна ≥ 0 — допустимі; ціна 0 і дробова кількість теж", () => {
    expect(invalidNumberFields(line("3", "20.00"))).toEqual([]);
    expect(invalidNumberFields(line("1.5", "0"))).toEqual([]);
  });

  it("кількість 0 чи від'ємна, ціна від'ємна, не число — неможливі; порожні поля тут не рахуємо", () => {
    expect(invalidNumberFields(line("0", "20"))).toEqual(["quantity"]);
    expect(invalidNumberFields(line("-2", "-1"))).toEqual(["quantity", "price"]);
    expect(invalidNumberFields(line("abc", "Infinity"))).toEqual(["quantity", "price"]);
    expect(invalidNumberFields(line("1", "10000000000"))).toEqual(["price"]);
    expect(invalidNumberFields(line("1", "9999999999.99"))).toEqual([]);
    expect(invalidNumberFields(line("", ""))).toEqual([]);
  });

  it("мінус, плюс і експоненту в кількість і ціну не набрати з клавіатури", () => {
    expect(["-", "+", "e", "E"].every(isBlockedNumberKey)).toBe(true);
    expect(isBlockedNumberKey("5")).toBe(false);
  });
});
