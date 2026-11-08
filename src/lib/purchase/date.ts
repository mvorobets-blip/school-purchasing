// Дата подання заявки в усіх списках: формат як у першому зрізі («25.10.2026», лише цифри) — вимога 49 не змінює
// форматів дат («лишаються за попередніми вимогами»); час America/New_York — припущення PM у вимогах 47 і 48.
export function formatSubmitted(iso: string): string {
  return new Date(iso).toLocaleDateString("uk-UA", { timeZone: "America/New_York" });
}

// Дата й час запису історії (AC-HIST-06): «05.11.2026, 14:32» — дата як у списках, час 24-годинний, без позначки
// часового поясу, за America/New_York (відповідь PM на ValiaBihun/2026-quitcode-dream-team#74).
const SUBMITTED_AT = new Intl.DateTimeFormat("en-GB", {
  timeZone: "America/New_York",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

export function formatSubmittedAt(iso: string): string {
  const part = Object.fromEntries(SUBMITTED_AT.formatToParts(new Date(iso)).map((p) => [p.type, p.value]));
  return `${part.day}.${part.month}.${part.year}, ${part.hour}:${part.minute}`;
}
