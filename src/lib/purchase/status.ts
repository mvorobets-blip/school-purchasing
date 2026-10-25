export type PurchaseStatus = "pending" | "approved" | "rejected";

// Статус завжди з текстом; колір лише підсилює (PM «Вигляд і тон»; DESIGN.md — токени status-*).
export const STATUS_LABEL: Record<PurchaseStatus, string> = {
  pending: "Очікує схвалення",
  approved: "Схвалено",
  rejected: "Відхилено",
};

export const STATUS_CLASS: Record<PurchaseStatus, string> = {
  pending: "bg-status-pending text-status-pending-foreground",
  approved: "bg-status-approved text-status-approved-foreground",
  rejected: "bg-status-rejected text-status-rejected-foreground",
};

export function isPurchaseStatus(value: string): value is PurchaseStatus {
  return value === "pending" || value === "approved" || value === "rejected";
}
