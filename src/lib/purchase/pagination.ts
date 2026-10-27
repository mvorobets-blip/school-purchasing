// Сторінки списків заявок: по 50 рядків (щільні списки — DESIGN.md §4), номер сторінки — ?page=N. Запит до бази бере
// лише рядки сторінки (.range) і загальну кількість (count: "exact"), тож нічого не обрізається мовчки на межі
// відповіді PostgREST.
export const PAGE_SIZE = 50;

// ?page= з адреси → номер сторінки від 1; усе інше (порожньо, 0, «abc», масив) — перша сторінка.
export function pageFromParam(value: string | string[] | undefined): number {
  const n = typeof value === "string" ? Number(value) : NaN;
  return Number.isInteger(n) && n >= 1 ? n : 1;
}

// Межі .range(from, to) для сторінки (обидві включно).
export function pageRange(page: number): { from: number; to: number } {
  const from = (page - 1) * PAGE_SIZE;
  return { from, to: from + PAGE_SIZE - 1 };
}

export function pageCount(total: number): number {
  return Math.max(1, Math.ceil(total / PAGE_SIZE));
}
