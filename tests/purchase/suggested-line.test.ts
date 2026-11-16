import { describe, expect, it } from "vitest";
import { emptyLineFields, suggestedLineKey, withSuggestedLine } from "@/lib/purchase/form";

// Пропозиція помічника AI у рядки форми (зріз 4, відповідь PM на #82): перший порожній рядок — заповнити, інакше — додати в кінець.
const suggested = { name: "Папір А4", purpose: "Для друку", quantity: "3", price: "20.00" };
const blank = { key: 1, name: "", purpose: "", quantity: "", price: "" };

describe("поле, якого в описі немає (відповідь PM на #79)", () => {
  it("AC-AI-01: опис без ціни — рядок у формі, а порожнє поле «Price» позначено одразу (форма позначає порожні поля рядка пропозиції)", () => {
    const noPrice = { name: "Маркер", purpose: "Для дошки", quantity: "4", price: "" };
    const key = suggestedLineKey([blank]);
    const line = withSuggestedLine([blank], noPrice).find((l) => l.key === key);
    expect(line).toEqual({ ...noPrice, key: 1 });
    expect(emptyLineFields(line!)).toEqual(["price"]);
  });

  it("порожніх рядків немає — пропозиція отримує новий ключ, і саме цей рядок позначатиметься", () => {
    const filled = { key: 3, name: "Маркер", purpose: "Для дошки", quantity: "4", price: "1.50" };
    expect(suggestedLineKey([filled])).toBe(4);
    expect(withSuggestedLine([filled], suggested).at(-1)?.key).toBe(4);
  });
});

describe("withSuggestedLine", () => {
  it("AC-AI-01: на порожній формі — рівно один рядок, і це пропозиція", () => {
    expect(withSuggestedLine([blank], suggested)).toEqual([{ ...suggested, key: 1 }]);
  });

  it("форма вже має заповнений рядок — пропозицію додано в кінець, введене не загублено", () => {
    const filled = { key: 1, name: "Маркер", purpose: "Для дошки", quantity: "4", price: "1.50" };
    expect(withSuggestedLine([filled], suggested)).toEqual([filled, { ...suggested, key: 2 }]);
  });

  it("заповнений рядок і порожній після нього — пропозиція заповнює порожній, а не додає новий", () => {
    const filled = { key: 1, name: "Маркер", purpose: "Для дошки", quantity: "4", price: "1.50" };
    expect(withSuggestedLine([filled, { ...blank, key: 5 }], suggested)).toEqual([filled, { ...suggested, key: 5 }]);
  });
});
