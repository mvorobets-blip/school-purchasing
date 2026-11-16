import { describe, expect, it } from "vitest";
import { markedLineFields, needsSuggestedHint, suggestedLineKey, withMarkedSuggestion, withSuggestedLine } from "@/lib/purchase/form";

// Пропозиція помічника AI у рядки форми (зріз 4, відповідь PM на #82): перший порожній рядок — заповнити, інакше — додати в кінець.
const suggested = { name: "Папір А4", purpose: "Для друку", quantity: "3", price: "20.00" };
const blank = { key: 1, name: "", purpose: "", quantity: "", price: "" };

describe("поле, якого в описі немає (відповідь PM на #79)", () => {
  const noPrice = { name: "Маркер", purpose: "Для дошки", quantity: "4", price: "" };

  it("AC-AI-01: опис без ціни — рядок у формі, а порожнє поле «Price» позначено одразу", () => {
    const [line] = withMarkedSuggestion([blank], noPrice);
    expect(line).toEqual({ ...noPrice, key: 1, suggested: true });
    expect(markedLineFields(line, false)).toEqual(["price"]);
  });

  it("AC-AI-01: людина заповнила ціну — позначку знято; рядок без пропозиції не позначено до «Submit»", () => {
    const [line] = withMarkedSuggestion([blank], noPrice);
    expect(markedLineFields({ ...line, price: "1.50" }, false)).toEqual([]);
    expect(markedLineFields(noPrice, false)).toEqual([]);
  });

  it("AC-AI-01: під рядком пропозиції з порожнім полем — підказка (для aria-describedby); поле заповнено — підказки немає", () => {
    const [line] = withMarkedSuggestion([blank], noPrice);
    expect(needsSuggestedHint(line)).toBe(true);
    expect(needsSuggestedHint({ ...line, price: "1.50" })).toBe(false);
    expect(needsSuggestedHint({ ...noPrice, key: 3 } as never)).toBe(false);
  });

  it("AC-AI-01: друга пропозиція не знімає позначку з першої — обидва порожні поля позначено", () => {
    const noQuantity = { name: "Скотч", purpose: "", quantity: "", price: "3.00" };
    const lines = withMarkedSuggestion(withMarkedSuggestion([blank], noPrice), noQuantity);
    expect(lines.map((l) => markedLineFields(l, false))).toEqual([["price"], ["purpose", "quantity"]]);
  });

  it("AC-AI-01: людина заповнила рядок 1 під час очікування — позначка на рядку 2, куди лягла пропозиція", () => {
    const typed = { ...blank, name: "Ручка", purpose: "Для учнів", quantity: "10", price: "0.50" };
    const lines = withMarkedSuggestion([typed], noPrice);
    expect(lines).toEqual([typed, { ...noPrice, key: 2, suggested: true }]);
    expect(lines.map((l) => markedLineFields(l, false))).toEqual([[], ["price"]]);
  });

  it("AC-AI-01: порожніх рядків немає — пропозиція отримує новий ключ max + 1", () => {
    const filled = { key: 3, name: "Маркер", purpose: "Для дошки", quantity: "4", price: "1.50" };
    expect(suggestedLineKey([filled])).toBe(4);
    expect(withSuggestedLine([filled], suggested).at(-1)?.key).toBe(4);
  });
});

describe("withSuggestedLine", () => {
  it("AC-AI-01: на порожній формі — рівно один рядок, і це пропозиція", () => {
    expect(withSuggestedLine([blank], suggested)).toEqual([{ ...suggested, key: 1 }]);
  });

  it("AC-AI-01: форма вже має заповнений рядок — пропозицію додано в кінець, введене не загублено", () => {
    const filled = { key: 1, name: "Маркер", purpose: "Для дошки", quantity: "4", price: "1.50" };
    expect(withSuggestedLine([filled], suggested)).toEqual([filled, { ...suggested, key: 2 }]);
  });

  it("AC-AI-01: заповнений рядок і порожній після нього — пропозиція заповнює порожній, а не додає новий", () => {
    const filled = { key: 1, name: "Маркер", purpose: "Для дошки", quantity: "4", price: "1.50" };
    expect(withSuggestedLine([filled, { ...blank, key: 5 }], suggested)).toEqual([filled, { ...suggested, key: 5 }]);
  });
});
