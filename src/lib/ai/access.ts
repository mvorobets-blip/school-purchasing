import type { Role } from "@/lib/org/roles";

// Хто користується помічником рядків (зріз 4): лише автор заявки з ролями `requester` чи `approver` (#71,
// «Користувачі й ролі»). Перелік ДОЗВОЛЕНИХ ролей, а не «усі, крім admin»: нова роль не отримає помічника мовчки
// (зауваження PM під час приймання 16.11). Одне правило для сторінки (показ блоку) і дії (відмова до виклику моделі).
const ASSISTANT_ROLES: readonly Role[] = ["requester", "approver"];

export function canUseAssistant(role: Role): boolean {
  return ASSISTANT_ROLES.includes(role);
}
