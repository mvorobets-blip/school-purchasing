// Дата подання заявки в усіх списках («26 Oct»): київський час (школа в Києві), англійський інтерфейс.
export function formatSubmitted(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Europe/Kyiv" });
}
