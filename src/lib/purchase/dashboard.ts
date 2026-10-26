import { isPurchaseStatus, type PurchaseStatus } from "./status";

// Чисті функції для головної: лише підрахунки з даних, які RLS уже віддав користувачу (без нових прав і сум).

export type StatusCounts = Record<PurchaseStatus, number>;

export function countByStatus(rows: readonly { status: string }[]): StatusCounts {
  const counts: StatusCounts = { pending: 0, approved: 0, rejected: 0 };
  for (const r of rows) if (isPurchaseStatus(r.status)) counts[r.status] += 1;
  return counts;
}

// Номерів заявок у зрізі немає (PM: «Поза межами»), тож заявку впізнають за першою позицією: «Папір А4 + 2 more».
export type LineSummary = { first: string; more: number };

export function lineSummaries(
  lines: readonly { request_id: string; position: number; name: string }[],
): Map<string, LineSummary> {
  const byRequest = new Map<string, { position: number; name: string }[]>();
  for (const l of lines) {
    const list = byRequest.get(l.request_id) ?? [];
    list.push(l);
    byRequest.set(l.request_id, list);
  }
  const result = new Map<string, LineSummary>();
  for (const [id, list] of byRequest) {
    list.sort((a, b) => a.position - b.position);
    result.set(id, { first: list[0].name, more: list.length - 1 });
  }
  return result;
}

// Дата подання для списків головної: «26 Oct» за київським часом (школа в Києві).
export function formatSubmitted(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Europe/Kyiv" });
}

// Скільки заявок «Очікує схвалення» в кожному відділі — для «Needs attention» адміністратора
// (заявки відділу без схвалювача чекають, AC-FRM-12).
export function pendingByDepartment(rows: readonly { status: string; department_id: string }[]): Map<string, number> {
  const result = new Map<string, number>();
  for (const r of rows) {
    if (r.status === "pending") result.set(r.department_id, (result.get(r.department_id) ?? 0) + 1);
  }
  return result;
}
