// Тексти повідомлень — дослівно з вимог PM (requirements/2-…, 39-…, 40-…, 47-…, 48-…;
// англійські тексти — таблиця requirements/49-…).
export const MESSAGES = {
  NOT_REQUESTER: "Add the employee to the department as a requester first",
  FORBIDDEN: "Not enough permissions",
  LAST_ADMIN: "At least one active administrator must remain",
  DUPLICATE_DEPARTMENT: "A department with this name already exists",
  NO_APPROVER: "No approver",
  NO_DEPARTMENTS: "You have not been added to any department. Contact your administrator.",
  NO_LINES: "Add at least one line",
  INVALID_LINE: "Fill in all line fields",
  // Власний текст (у таблиці PM такого випадку немає): кількість > 0, ціна ≥ 0 — погоджено з розробником після ручної перевірки.
  INVALID_NUMBER: "Quantity must be greater than 0 and price 0 or more",
  SUBMITTED: "Purchase submitted",
  NO_REQUESTS: "You have not submitted any requests yet",
  NO_REASON: "Provide a reason",
  NO_DECISIONS: "No requests awaiting your decision",
  DEACTIVATED: "Account deactivated. Contact your administrator",
} as const;

export type MessageCode = keyof typeof MESSAGES;

export function messageFor(code: MessageCode): string {
  return MESSAGES[code];
}
