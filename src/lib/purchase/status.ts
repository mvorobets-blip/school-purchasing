// Статуси заявки: зріз 2 — «Очікує схвалення», «Схвалено», «Відхилено»; зріз 3 — «Частково схвалено»,
// «Повернено на доопрацювання» (вимога 63; англійські тексти — таблиця вимоги 49, AC-LANG-06, AC-LANG-09).
export type PurchaseStatus = "pending" | "approved" | "rejected" | "partially_approved" | "returned";

// Статус завжди з текстом; колір лише підсилює (PM «Вигляд і тон»; DESIGN.md — токени status-*).
export const STATUS_LABEL: Record<PurchaseStatus, string> = {
  pending: "Awaiting approval",
  approved: "Approved",
  rejected: "Rejected",
  partially_approved: "Partially approved",
  returned: "Returned for revision",
};

export const STATUS_CLASS: Record<PurchaseStatus, string> = {
  pending: "bg-status-pending text-status-pending-foreground",
  approved: "bg-status-approved text-status-approved-foreground",
  rejected: "bg-status-rejected text-status-rejected-foreground",
  partially_approved: "bg-status-partial text-status-partial-foreground",
  returned: "bg-status-returned text-status-returned-foreground",
};

export function isPurchaseStatus(value: string): value is PurchaseStatus {
  return Object.hasOwn(STATUS_LABEL, value);
}

// Статус рядка після рішення (AC-DEC-01): «Approved» / «Rejected»; до рішення — без статусу.
export type LineStatus = "approved" | "rejected";
export const LINE_STATUS_LABEL: Record<LineStatus, string> = { approved: "Approved", rejected: "Rejected" };
