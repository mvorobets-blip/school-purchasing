// Дата подання заявки в усіх списках: формат як у першому зрізі («25.10.2026», лише цифри) — вимога 49 не змінює
// форматів дат («лишаються за попередніми вимогами»); час America/New_York — припущення PM у вимогах 47 і 48.
export function formatSubmitted(iso: string): string {
  return new Date(iso).toLocaleDateString("uk-UA", { timeZone: "America/New_York" });
}
