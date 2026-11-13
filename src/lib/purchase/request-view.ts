import type { createClient } from "@/lib/supabase/server";

type Client = Awaited<ReturnType<typeof createClient>>;

// Дані сторінки заявки /requests/[id]. Що видно, вирішує база (RLS і функції private.*): немає заявки у відповіді —
// «forbidden» (не розрізняємо «немає» й «чужа», AC-FRM-08, AC-APR-03); помилка будь-якого запиту, крім необов'язкової
// перевірки «чи може вирішити», — «error» (DESIGN.md §6: повідомлення, а не порожня таблиця).
export type RequestView =
  | { status: "forbidden" }
  | { status: "error" }
  | {
      status: "ok";
      request: {
        number: number;
        author_id: string;
        purchase_type: string;
        status: string;
        reject_reason: string | null;
        return_reason: string | null;
      };
      authorName: string;
      departmentName: string;
      lines: { position: number; name: string; purpose: string; quantity: number; price: number; status: string | null }[];
      history: { kind: string; actor_name: string | null; created_at: string }[];
      historyFailed: boolean;
      canDecide: boolean;
    };

export async function loadRequestView(supabase: Client, id: string): Promise<RequestView> {
  const { data: request, error } = await supabase
    .from("purchase_requests")
    // select("*"): поки db-deploy не додав нову колонку (return_reason), сторінка не падає (рев'ю CodeRabbit, PR 61).
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) return { status: "error" };
  if (!request) return { status: "forbidden" };

  // Автор — ім'я, без імені в профілі — email, і лише якщо заявку дозволено бачити (private.request_author_names;
  // AC-APR-08, 09); ролі, відділів і дозволів автора сторінка не читає (AC-APR-10).
  // Разом з рештою запитів, а не перед ними: вони незалежні (/code-review WS9 — на один послідовний запит менше).
  const [authorRes, linesRes, deptRes, historyRes, decideRes] = await Promise.all([
    supabase.rpc("request_author_names", { p_request_ids: [id] }),
    supabase
      .from("purchase_request_lines")
      .select("position, name, purpose, quantity, price, status")
      .eq("request_id", id)
      .order("position"),
    supabase.from("departments").select("name").eq("id", request.department_id).maybeSingle(),
    // Історія — лише якщо заявку видно (private.request_history: та сама умова, що RLS заявки; AC-HIST-10).
    supabase.rpc("request_history", { p_request_id: id }),
    // Чи може людина вирішити заявку (схвалювач відділу, не автор, «Awaiting approval») — лише так / ні від бази.
    supabase.rpc("can_decide_purchase", { p_request_id: id }),
  ]);
  // Помилка історії не ховає заявку: розділ «History» покаже власне повідомлення (рев'ю CodeRabbit, PR 59).
  if (authorRes.error || linesRes.error || deptRes.error) return { status: "error" };

  return {
    status: "ok",
    request: { ...request, return_reason: request.return_reason ?? null },
    authorName: authorRes.data?.[0]?.author_name ?? "—",
    departmentName: deptRes.data?.name ?? "—",
    lines: linesRes.data ?? [],
    history: historyRes.data ?? [],
    historyFailed: Boolean(historyRes.error),
    // Помилка цієї перевірки не ламає сторінку: тоді просто без кнопок (рішення однаково перевіряє база).
    canDecide: !decideRes.error && decideRes.data === true,
  };
}
