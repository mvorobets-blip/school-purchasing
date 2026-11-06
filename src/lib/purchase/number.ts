// Номер заявки «PUR-» і число (глосарій «Продукту», AC-HIST-01); число видає база — purchase_requests.number.
export function formatRequestNumber(n: number): string {
  return `PUR-${n}`;
}
