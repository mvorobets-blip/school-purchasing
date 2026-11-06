// Суми заявки (AC-HIST-02): долари США, 2 знаки, округлення до центів; сума рядка = кількість × ціна; сума заявки —
// сума всіх рядків, зокрема відхилених (припущення PM у вимозі 64, відповідь на #65). Рахуємо цілими центами, без
// похибки рухомої коми: ціна з бази — numeric(12, 2), тож центи точні після округлення.
type Amount = number | string;

const toCents = (price: Amount) => Math.round(Number(price) * 100);

export function lineSumCents(quantity: Amount, price: Amount): number {
  return Math.round(Number(quantity) * toCents(price));
}

export function totalCents(lines: readonly { quantity: Amount; price: Amount }[]): number {
  return lines.reduce((sum, l) => sum + lineSumCents(l.quantity, l.price), 0);
}

// «60.00» — без символу валюти: валюту показує заголовок «Sum, USD» (погоджено в design.md).
export function formatCents(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}
