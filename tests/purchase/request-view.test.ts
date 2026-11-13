import { beforeEach, describe, expect, it } from "vitest";
import { loadRequestView } from "@/lib/purchase/request-view";

// loadRequestView — дані сторінки заявки (і сторінки редагування). Суворий підмінений клієнт: відповідає лише на
// точні запити (таблиця, колонки, фільтр, порядок, аргументи rpc); будь-який інший запит — помилка тесту. Так тест
// доводить, ЩО саме запитано, а не лише що сторінка щось показала (Stryker, задача 5). Регресійні тести без AC ID.
const ID = "11111111-1111-4111-8111-111111111111";
const REQUEST = { id: ID, number: 7, author_id: "a1", department_id: "d1", purchase_type: "purchasing_department", status: "returned", reject_reason: null, return_reason: "Уточніть кількість" };
const LINES = [{ position: 1, name: "Папір А4", purpose: "Друк", quantity: 3, price: 20, status: null }];
const HISTORY = [{ kind: "submitted", actor_name: "Андрій Демо-Перший", created_at: "2026-11-05T19:32:00Z" }];

type Res = { data: unknown; error: unknown };
const BOOM = { data: null, error: { message: "boom" } };
let answers: Record<string, Res>;
const asked: string[] = [];

function answer(key: string): Res {
  asked.push(key);
  if (!(key in answers)) throw new Error(`неочікуваний запит: ${key}`);
  return answers[key];
}

function from(table: string) {
  const parts = [`from ${table}`];
  const builder = {
    select: (columns: string) => (parts.push(`select ${columns}`), builder),
    eq: (column: string, value: unknown) => (parts.push(`eq ${column}=${String(value)}`), builder),
    order: (column: string) => (parts.push(`order ${column}`), builder),
    maybeSingle: () => (parts.push("maybeSingle"), builder),
    then: (resolve: (v: Res) => void, reject: (e: unknown) => void) => {
      try {
        resolve(answer(parts.join(" · ")));
      } catch (e) {
        reject(e);
      }
    },
  };
  return builder;
}

const client = {
  from,
  rpc: async (fn: string, args: unknown) => answer(`rpc ${fn} ${JSON.stringify(args)}`),
} as unknown as Parameters<typeof loadRequestView>[0];

const Q = {
  request: `from purchase_requests · select * · eq id=${ID} · maybeSingle`,
  author: `rpc request_author_names {"p_request_ids":["${ID}"]}`,
  lines: `from purchase_request_lines · select position, name, purpose, quantity, price, status · eq request_id=${ID} · order position`,
  dept: "from departments · select name · eq id=d1 · maybeSingle",
  history: `rpc request_history {"p_request_id":"${ID}"}`,
  decide: `rpc can_decide_purchase {"p_request_id":"${ID}"}`,
};

describe("loadRequestView", () => {
  beforeEach(() => {
    asked.length = 0;
    answers = {
      [Q.request]: { data: REQUEST, error: null },
      [Q.author]: { data: [{ request_id: ID, author_name: "Андрій Демо-Перший" }], error: null },
      [Q.lines]: { data: LINES, error: null },
      [Q.dept]: { data: { name: "Початкова школа" }, error: null },
      [Q.history]: { data: HISTORY, error: null },
      [Q.decide]: { data: true, error: null },
    };
  });

  it("усе завантажено — заявка, автор, відділ, рядки, історія й «може вирішити» з точних запитів", async () => {
    expect(await loadRequestView(client, ID)).toEqual({
      status: "ok",
      request: REQUEST,
      authorName: "Андрій Демо-Перший",
      departmentName: "Початкова школа",
      lines: LINES,
      history: HISTORY,
      historyFailed: false,
      canDecide: true,
    });
    expect(asked.sort()).toEqual(Object.values(Q).sort());
  });

  it("заявки немає у відповіді (чужа) — forbidden, нічого більше не запитано", async () => {
    answers[Q.request] = { data: null, error: null };
    expect(await loadRequestView(client, ID)).toEqual({ status: "forbidden" });
    expect(asked).toEqual([Q.request]);
  });

  it("помилка запиту заявки — error, нічого більше не запитано", async () => {
    answers[Q.request] = BOOM;
    expect(await loadRequestView(client, ID)).toEqual({ status: "error" });
    expect(asked).toEqual([Q.request]);
  });

  it.each([
    ["автора", "author"],
    ["рядків", "lines"],
    ["відділу", "dept"],
  ] as const)("помилка запиту %s — error", async (_what, key) => {
    answers[Q[key]] = BOOM;
    expect(await loadRequestView(client, ID)).toEqual({ status: "error" });
  });

  it("помилка історії не ховає заявку — historyFailed, історія порожня", async () => {
    answers[Q.history] = BOOM;
    const view = await loadRequestView(client, ID);
    expect(view).toMatchObject({ status: "ok", history: [], historyFailed: true });
  });

  it("помилка чи не-true від can_decide_purchase — без кнопок рішення", async () => {
    answers[Q.decide] = BOOM;
    expect(await loadRequestView(client, ID)).toMatchObject({ status: "ok", canDecide: false });
    answers[Q.decide] = { data: "true", error: null };
    expect(await loadRequestView(client, ID)).toMatchObject({ status: "ok", canDecide: false });
  });

  it("порожні відповіді — «—» замість автора й відділу, без рядків, без історії; return_reason до міграції — null", async () => {
    answers[Q.request] = { data: { ...REQUEST, return_reason: undefined }, error: null };
    answers[Q.author] = { data: [], error: null };
    answers[Q.lines] = { data: null, error: null };
    answers[Q.dept] = { data: null, error: null };
    answers[Q.history] = { data: null, error: null };
    expect(await loadRequestView(client, ID)).toMatchObject({
      status: "ok",
      request: { ...REQUEST, return_reason: null },
      authorName: "—",
      departmentName: "—",
      lines: [],
      history: [],
    });
    answers[Q.author] = { data: null, error: null };
    expect(await loadRequestView(client, ID)).toMatchObject({ status: "ok", authorName: "—" });
  });

  // Рев'ю: автор (request_author_names) запитується разом з рядками, відділом, історією й can_decide_purchase в одному
  // Promise.all, а не окремо перед ними — сторінка не чекає зайвий мережевий обмін.
  it("автор запитується паралельно з рядками, відділом, історією й can_decide_purchase — усі п'ять стартують до відповіді автора", async () => {
    const AUTHOR_RESOLVED = "відповідь автора";
    const slowAuthorClient = {
      from,
      rpc: (fn: string, args: unknown) => {
        const key = `rpc ${fn} ${JSON.stringify(args)}`;
        if (fn !== "request_author_names") return Promise.resolve(answer(key));
        const res = answer(key);
        // Відповідь автора — лише в наступній макрозадачі: до неї встигають стартувати всі запити одного Promise.all.
        return new Promise<Res>((resolve) =>
          setTimeout(() => {
            asked.push(AUTHOR_RESOLVED);
            resolve(res);
          }, 0),
        );
      },
    } as unknown as Parameters<typeof loadRequestView>[0];

    expect(await loadRequestView(slowAuthorClient, ID)).toMatchObject({ status: "ok", authorName: "Андрій Демо-Перший" });
    const resolvedAt = asked.indexOf(AUTHOR_RESOLVED);
    expect(resolvedAt).toBeGreaterThan(-1);
    const startedBefore = asked.slice(0, resolvedAt);
    expect(startedBefore.sort()).toEqual([Q.author, Q.decide, Q.dept, Q.history, Q.lines, Q.request].sort());
  });
});

