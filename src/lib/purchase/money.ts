// Суми заявки (AC-HIST-02): долари США, 2 знаки, округлення до центів; сума рядка = кількість × ціна; сума заявки —
// сума всіх рядків, зокрема відхилених (припущення PM у вимозі 64, відповідь на #65). Рахуємо цілими центами в BigInt:
// межі бази дозволяють кількість до 2 147 483 647 і ціну до 9 999 999 999.99, а їхній добуток у центах (~2·10²¹)
// не вміщується точно в number (Number.MAX_SAFE_INTEGER ≈ 9·10¹⁵).
type Amount = number | string;

// Ціна з бази — numeric(12, 2): у центах (≤ 10¹²) вона точна й у number, тож Math.round прибирає лише похибку 0.1 + 0.2.
const priceCents = (price: Amount) => BigInt(Math.round(Number(price) * 100));

export function lineSumCents(quantity: Amount, price: Amount): bigint {
  const q = Number(quantity);
  // Дробова кількість може лишитись у рядках зрізу 2 на проді (межу «ціле від 1» тримає лише функція подання).
  if (!Number.isInteger(q)) return BigInt(Math.round(q * Number(priceCents(price))));
  return BigInt(q) * priceCents(price);
}

export function totalCents(lines: readonly { quantity: Amount; price: Amount }[]): bigint {
  return lines.reduce((sum, l) => sum + lineSumCents(l.quantity, l.price), BigInt(0));
}

// «60.00» — без символу валюти: валюту показує заголовок «Sum, USD» (погоджено в design.md). Від'ємних сум не буває:
// кількість — від 1, ціна — від 0 (межі перевіряє база).
export function formatCents(cents: bigint | number): string {
  const value = BigInt(cents);
  return `${value / BigInt(100)}.${String(value % BigInt(100)).padStart(2, "0")}`;
}
