// Тексти повідомлень — дослівно з вимог PM (requirements/2-…, 39-…, 40-…).
export const MESSAGES = {
  NOT_REQUESTER: "Спершу додайте працівника до відділу як заявника",
  FORBIDDEN: "Недостатньо прав",
  LAST_ADMIN: "Має лишитись хоча б один активний адміністратор",
  DUPLICATE_DEPARTMENT: "Відділ з такою назвою вже є",
  NO_APPROVER: "Немає схвалювача",
} as const;

export type MessageCode = keyof typeof MESSAGES;

export function messageFor(code: MessageCode): string {
  return MESSAGES[code];
}
