// Дата подання заявки в усіх списках («26 Oct»): час America/New_York — припущення PM у вимогах 47 і 48
// («Дати й час — за часом America/New_York, як у першому зрізі»); англійський інтерфейс.
export function formatSubmitted(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "America/New_York" });
}
