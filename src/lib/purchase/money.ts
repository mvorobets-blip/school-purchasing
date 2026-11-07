// Суми заявки (AC-HIST-02): долари США, 2 знаки, округлення до центів; сума рядка = кількість × ціна; сума заявки —
// сума всіх рядків, зокрема відхилених (припущення PM у вимозі 64, відповідь на #65). Рахуємо цілими центами в BigInt:
// межі бази дозволяють кількість до 2 147 483 647 і ціну до 9 999 999 999.99, а їхній добуток у центах (~2·10²¹)
// не вміщується точно в number (Number.MAX_SAFE_INTEGER ≈ 9·10¹⁵).
type Amount = number | string;

// Десяткове число з бази (numeric приходить і як number, і як string) — точно: ціле значення й кількість знаків після
// крапки, без арифметики з рухомою комою.
function decimal(value: Amount): { digits: bigint; scale: number } {
  const match = /^(\d+)(?:\.(\d*))?$/.exec(String(value).trim());
  if (!match) throw new Error(`Not a decimal: ${value}`);
  const fraction = match[2] ?? "";
  return { digits: BigInt(match[1] + fraction), scale: fraction.length };
}

const TEN = BigInt(10);
const pow10 = (n: number) => TEN ** BigInt(n);

// Округлення до цілого «від половини вгору» для невід'ємних: (a + b/2) / b.
const roundDiv = (a: bigint, b: bigint) => (a + b / BigInt(2)) / b;

export function lineSumCents(quantity: Amount, price: Amount): bigint {
  // Ціна — numeric(12, 2), кількість — ціле від 1; дробова кількість може лишитись у рядках зрізу 2 на проді
  // (межу «ціле від 1» тримає лише функція подання) — тому добуток округлюємо до центу один раз, точно.
  const q = decimal(quantity);
  const p = decimal(price);
  return roundDiv(q.digits * p.digits * BigInt(100), pow10(q.scale + p.scale));
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
