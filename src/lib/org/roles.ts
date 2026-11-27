// Ролі застосунку. «Правило ролей» (requirements/product.md) рахує лише база: тригер private.sync_role,
// доводить tests/db/org-roles.test.ts.
export type Role = "requester" | "approver" | "admin";

// Назви ролей в інтерфейсі — з глосарію «Продукту»; ідентифікатор ролі лишається без змін.
export const ROLE_LABEL: Record<Role, string> = {
  requester: "Requester",
  approver: "Approver",
  admin: "Administrator",
};
