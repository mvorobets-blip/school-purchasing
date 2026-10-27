import { describe, expect, it } from "vitest";
import { PAGE_SIZE, pageCount, pageFromParam, pageRange } from "@/lib/purchase/pagination";

describe("сторінки списків", () => {
  it("по 50 рядків; межі .range для сторінок 1 і 3", () => {
    expect(PAGE_SIZE).toBe(50);
    expect(pageRange(1)).toEqual({ from: 0, to: 49 });
    expect(pageRange(3)).toEqual({ from: 100, to: 149 });
  });

  it("?page= з адреси: неможливе значення — перша сторінка", () => {
    expect(pageFromParam("2")).toBe(2);
    for (const bad of [undefined, "", "0", "-1", "1.5", "abc", ["2"]]) expect(pageFromParam(bad)).toBe(1);
  });

  it("кількість сторінок: порожній список — одна; 50 — одна; 51 — дві", () => {
    expect([0, 50, 51, 1000].map(pageCount)).toEqual([1, 1, 2, 20]);
  });
});
