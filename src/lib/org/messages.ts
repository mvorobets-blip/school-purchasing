// Тексти повідомлень — дослівно з вимог PM (requirements/2-…, 39-…, 40-…, 47-…, 48-…).
export const MESSAGES = {
  NOT_REQUESTER: "Add the employee to the department as a requester first",
  FORBIDDEN: "Not enough permissions",
  LAST_ADMIN: "At least one active administrator must remain",
  DUPLICATE_DEPARTMENT: "A department with this name already exists",
  NO_APPROVER: "No approver",
  NO_DEPARTMENTS: "You have not been added to any department. Contact your administrator.",
  NO_LINES: "Add at least one line",
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
