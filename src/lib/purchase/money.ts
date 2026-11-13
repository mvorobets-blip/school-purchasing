// Суми заявки (AC-HIST-02): долари США, 2 знаки, округлення до центів; сума рядка = кількість × ціна; сума заявки —
// сума всіх рядків, зокрема відхилених (припущення PM у вимозі 64, відповідь на #65). Рахуємо цілими центами в BigInt:
// межі бази дозволяють кількість до 2 147 483 647 і ціну до 9 999 999 999.99, а їхній добуток у центах (~2·10²¹)
// не вміщується точно в number (Number.MAX_SAFE_INTEGER ≈ 9·10¹⁵).
type Amount = number | string;

// Десяткове число з бази (numeric приходить і як number, і як string) — точно: ціле значення й кількість знаків після
// крапки, без арифметики з рухомою комою.
// Число з бази JS друкує з експонентою, коли воно < 1e-6 чи ≥ 1e21 («1e-7», «1e+21»); такі кількості можуть лишитись у
// рядках зрізу 2 (тоді база вимагала лише > 0). Експоненту зсуваємо в scale — точно, без рухомої коми (/code-review WS9).
function decimal(value: Amount): { digits: bigint; scale: number } {
  const match = /^(\d+)(?:\.(\d*))?(?:e([+-]\d+))?$/i.exec(String(value).trim());
  if (!match) throw new Error(`Not a decimal: ${value}`);
  const fraction = match[2] ?? "";
  const digits = BigInt(match[1] + fraction);
  // JS друкує експоненту завжди зі знаком («1e-7», «1e+21»), тож знак обов'язковий. Від'ємний scale — ціле число з нулями.
  const scale = fraction.length - Number(match[3] ?? 0);
  return { digits: digits * pow10(Math.max(0, -scale)), scale: Math.max(0, scale) };
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
