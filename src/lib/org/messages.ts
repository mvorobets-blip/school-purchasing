// Тексти повідомлень — дослівно з вимог PM (requirements/2-…, 39-…, 40-…, 47-…, 48-…).
export const MESSAGES = {
  NOT_REQUESTER: "Спершу додайте працівника до відділу як заявника",
  FORBIDDEN: "Недостатньо прав",
  LAST_ADMIN: "Має лишитись хоча б один активний адміністратор",
  DUPLICATE_DEPARTMENT: "Відділ з такою назвою вже є",
  NO_APPROVER: "Немає схвалювача",
  NO_DEPARTMENTS: "Вас не додано до жодного відділу. Зверніться до адміністратора.",
  NO_LINES: "Додайте хоча б один рядок",
  SUBMITTED: "Закупівлю подано",
  NO_REQUESTS: "Ви ще не подали жодної заявки",
  NO_REASON: "Вкажіть причину",
  NO_DECISIONS: "Заявок на рішення немає",
} as const;

export type MessageCode = keyof typeof MESSAGES;

export function messageFor(code: MessageCode): string {
  return MESSAGES[code];
}
