// Суми рядків і заявки в центах (src/lib/purchase/money.ts): без похибки чисел з рухомою комою.
import { describe, expect, it } from "vitest";
import { formatCents, lineSumCents, totalCents } from "@/lib/purchase/money";
import { formatRequestNumber } from "@/lib/purchase/number";

describe("суми заявки", () => {
  it("AC-HIST-02: рядки 3 × 20.00 і 2 × 15.50 — суми рядків 60.00 і 31.00, сума заявки 91.00", () => {
    const lines = [
      { quantity: 3, price: "20.00" },
      { quantity: 2, price: "15.50" },
    ];
    expect(lines.map((l) => formatCents(lineSumCents(l.quantity, l.price)))).toEqual(["60.00", "31.00"]);
    expect(formatCents(totalCents(lines))).toBe("91.00");
  });

  it("числа й рядки з бази дають ту саму суму (numeric приходить і як number, і як string)", () => {
    expect(lineSumCents(3, 20)).toBe(BigInt(6000));
    expect(lineSumCents("3", "20.00")).toBe(BigInt(6000));
    expect(lineSumCents(2, 15.5)).toBe(BigInt(3100));
  });

  it("без похибки рухомої коми: 3 × 0.10 = 0.30, 7 × 19.99 = 139.93", () => {
    expect(lineSumCents(3, "0.10")).toBe(BigInt(30));
    expect(formatCents(lineSumCents(3, 0.1))).toBe("0.30");
    expect(formatCents(lineSumCents(7, 19.99))).toBe("139.93");
    expect(formatCents(totalCents([{ quantity: 1, price: 0.1 }, { quantity: 1, price: 0.2 }]))).toBe("0.30");
  });

  it("результат — ціле число центів", () => {
    for (const [q, p] of [[3, 0.1], [7, 19.99], [1, 1.005], [13, 0.07]] as const) {
      expect(typeof lineSumCents(q, p)).toBe("bigint");
    }
  });

  it("нуль і порожня заявка — 0.00", () => {
    expect(formatCents(0)).toBe("0.00");
    expect(formatCents(lineSumCents(2, "0"))).toBe("0.00");
    expect(totalCents([])).toBe(BigInt(0));
  });

  it("formatCents: два знаки після крапки", () => {
    expect(formatCents(9100)).toBe("91.00");
    expect(formatCents(5)).toBe("0.05");
    expect(formatCents(6000)).toBe("60.00");
  });

  it("найбільші допустимі значення (кількість 2 147 483 647 × ціна 9 999 999 999.99) — сума точна до цента", () => {
    expect(formatCents(lineSumCents(2147483647, "9999999999.99"))).toBe("21474836469978525163.53");
    expect(formatCents(totalCents([
      { quantity: 2147483647, price: "9999999999.99" },
      { quantity: 1, price: "0.01" },
    ]))).toBe("21474836469978525163.54");
  });

  it("дробова кількість зі старих рядків (зріз 2) рахується без помилки", () => {
    expect(formatCents(lineSumCents("1.5", "20.00"))).toBe("30.00");
  });

  // Рев'ю CodeRabbit (PR 58): добуток дробової кількості й ціни — десятковою арифметикою, округлення до центу один раз.
  it("дробова кількість × ціна — точно: 1.005 × 1.00 = 1.01, 1.005 × 1 (number) = 1.01, 0.333 × 3.00 = 1.00", () => {
    expect(formatCents(lineSumCents("1.005", "1.00"))).toBe("1.01");
    expect(formatCents(lineSumCents(1.005, 1))).toBe("1.01");
    expect(formatCents(lineSumCents("0.333", "3.00"))).toBe("1.00");
  });

  it("значення з пробілами по краях читаються; не число — помилка, а не мовчазна неправильна сума", () => {
    expect(formatCents(lineSumCents(" 2 ", " 1.50 "))).toBe("3.00");
    for (const bad of ["abc", "1.5x", "x1.5", "-1", ""]) {
      expect(() => lineSumCents(bad, "1.00")).toThrow(/Not a decimal/);
    }
  });

  // Рев'ю: numeric із Supabase приходить як number, а String(n) дає експонентний запис для n < 1e-6 і n ≥ 1e21
  // (String(1e-7) === "1e-7"). Такі кількості можуть лишитися в старих рядках зрізу 2 — читаємо їх точно.
  it("експонентний запис числа читається точно: 1e-7 × 20.00 = 0, 2e-3 × 1000.00 = 2.00, 1e21 × 1.00 = 1e23 центів", () => {
    expect(String(1e-7)).toBe("1e-7");
    expect(lineSumCents(1e-7, "20.00")).toBe(BigInt(0));
    expect(lineSumCents("2e-3", "1000.00")).toBe(BigInt(200));
    expect(lineSumCents(1e21, "1.00")).toBe(BigInt("100000000000000000000000"));
    expect(formatCents(lineSumCents(1.5e-5, "100000.00"))).toBe("1.50");
  });

  it("експонентний запис не відкриває дорогу сміттю: «abc», «-1», «1e» — помилка", () => {
    for (const bad of ["abc", "-1", "1e"]) {
      expect(() => lineSumCents(bad, "1.00")).toThrow(/Not a decimal/);
    }
  });
});

describe("номер заявки", () => {
  it("formatRequestNumber: «PUR-» і число", () => {
    expect(formatRequestNumber(1)).toBe("PUR-1");
    expect(formatRequestNumber(2)).toBe("PUR-2");
    expect(formatRequestNumber(1042)).toBe("PUR-1042");
  });
});
