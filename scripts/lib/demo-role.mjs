// Роль демо-користувача для npm run users:demo (scripts/create-demo-users.mjs).
// admin — з supabase/demo-users.json (цю роль задає людина; тригер її не чіпає). requester / approver рахує база:
// private.sync_role (міграція 20261021213618_department_setup.sql) — approver, якщо людина схвалює хоча б один відділ.
// Скрипт повторює це правило, а не пише роль із JSON: інакше повторний запуск розходився б із членством у відділах
// (схвалювач ставав би requester, а знятий схвалювач — approver). Роль у JSON для не-admin — довідкова.

export const ROLES = ["requester", "approver", "admin"];

/** Роль для profiles.role: admin — з JSON; інакше approver, якщо людина схвалює хоча б один відділ. */
export function demoRole(jsonRole, approvesAnyDepartment) {
  if (!ROLES.includes(jsonRole)) throw new Error(`невідома роль «${jsonRole}» (можна: ${ROLES.join(", ")})`);
  if (jsonRole === "admin") return "admin";
  return approvesAnyDepartment ? "approver" : "requester";
}
