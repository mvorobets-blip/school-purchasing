// Мутанти для scripts/mutation-check.mjs (npm run mutation:sql). Мутант = одне правило з AC, навмисно зламане.
// Джерело формату — демо-репо курсу, scripts/mutants.mjs (тег ws8-02-tests); там 11 SQL- і 2 TS-мутанти.
// Поля:
//   id, kind ("sql" | "ts"), ac (який AC це правило доводить), what (що зламано — людською мовою);
//   file — що мутуємо; tests — файли тестів, які мають довести правило (саме їх і запускаємо);
//   find — рядок або RegExp, що трапляється у файлі РІВНО один раз (надійніше за номери рядків, які зсуваються);
//   replace — заміна (вставляється буквально: «$$» у plpgsql лишається «$$»);
//   expect: "survive" + reason — лише для еквівалентного мутанта (поведінка не змінюється) з посиланням на те,
//   що робить його еквівалентним (рядок міграції, інший тест). Без reason скрипт мутант не приймає.
// Новий AC з відмовою, правило якого живе в SQL (політика, grant, функція, тригер), — новий мутант тут.
//
// P1 і P2 курсу (перевірка гарнесу на profiles через tests/db/profiles-db.test.ts) прибрано: PGlite-гарнес у репо вже
// є (tests/db/supabase-pglite.ts), а мутанти нижче — на правила наших AC (walkthrough-dev WS8, крок 4.4; промпт P05).
// AC-FRM-14 правила в SQL не має (порожній стан сторінки «My requests») — його доводить UAT.
const PURCHASE = "supabase/migrations/20261025184732_purchase_requests.sql";
// Жива версія private.submit_purchase (create or replace поверх PURCHASE).
const SUBMIT = "supabase/migrations/20261027132703_submit_purchase_rounded_price_limit.sql";
const PURCHASE_DB = "tests/db/purchase.test.ts";

export const mutants = [
  // ── AC-FRM-08: заявник того ж відділу не бачить чужої закупівлі, статус не змінюється ────────────────────────
  {
    id: "S1", kind: "sql", ac: "AC-FRM-08", file: PURCHASE, tests: [PURCHASE_DB],
    what: "політика purchase_requests_select_visible: будь-який активний користувач бачить усі заявки",
    find: "      author_id = (select auth.uid())\n      or (select private.is_admin())\n      or (select private.is_approver_of(department_id))",
    replace: "      true",
  },
  {
    id: "S2", kind: "sql", ac: "AC-FRM-08", file: PURCHASE, tests: [PURCHASE_DB],
    what: "політика purchase_request_lines_select_visible: рядки видно без перевірки, чи видно заявку",
    find: "    and exists (select 1 from public.purchase_requests as r where r.id = request_id)",
    replace: "    and true",
  },
  {
    id: "S3", kind: "sql", ac: "AC-FRM-08", file: PURCHASE, tests: [PURCHASE_DB],
    what: "grant: authenticated отримує UPDATE на заявки (без політики UPDATE RLS рядків не змінює, але «без grant update» порушено — тест чекає permission denied)",
    find: "grant select on table public.purchase_requests to authenticated;",
    replace: "grant select, update on table public.purchase_requests to authenticated;",
  },
  {
    id: "S10", kind: "sql", ac: "AC-FRM-08", file: PURCHASE, tests: [PURCHASE_DB],
    what: "private.is_approver_of: будь-який член відділу вважається схвалювачем (прибрано m.is_approver)",
    find: "m.profile_id = (select auth.uid()) and m.is_approver\n",
    replace: "m.profile_id = (select auth.uid())\n",
  },
  {
    id: "S11", kind: "sql", ac: "AC-FRM-08", file: PURCHASE, tests: [PURCHASE_DB],
    what: "private.is_approver_of: схвалювач будь-якого відділу бачить заявки всіх відділів (прибрано відділ)",
    find: "where m.department_id = p_department_id and m.profile_id = (select auth.uid())",
    replace: "where m.profile_id = (select auth.uid())",
  },
  // ── AC-FRM-15: рядок, де не заповнено назву, мету, кількість чи ціну, — INVALID_LINE, закупівлю не подано ─────
  {
    id: "S4", kind: "sql", ac: "AC-FRM-15", file: SUBMIT, tests: [PURCHASE_DB],
    what: "submit_purchase: перевірку порожніх полів рядка прибрано повністю",
    find: "    if coalesce(btrim(v_line ->> 'name'), '') = ''\n      or coalesce(btrim(v_line ->> 'purpose'), '') = ''\n      or coalesce(btrim(v_line ->> 'quantity'), '') = ''\n      or coalesce(btrim(v_line ->> 'price'), '') = '' then",
    replace: "    if false then",
  },
  {
    id: "S5", kind: "sql", ac: "AC-FRM-15", file: SUBMIT, tests: [PURCHASE_DB],
    what: "submit_purchase: порожню назву рядка не перевіряємо",
    find: "    if coalesce(btrim(v_line ->> 'name'), '') = ''\n      or coalesce(btrim(v_line ->> 'purpose'), '') = ''",
    replace: "    if coalesce(btrim(v_line ->> 'purpose'), '') = ''",
  },
  {
    id: "S6", kind: "sql", ac: "AC-FRM-15", file: SUBMIT, tests: [PURCHASE_DB],
    what: "submit_purchase: порожню мету рядка не перевіряємо",
    find: "\n      or coalesce(btrim(v_line ->> 'purpose'), '') = ''",
    replace: "",
  },
  {
    id: "S7", kind: "sql", ac: "AC-FRM-15", file: SUBMIT, tests: [PURCHASE_DB],
    what: "submit_purchase: порожню кількість рядка не перевіряємо",
    find: "\n      or coalesce(btrim(v_line ->> 'quantity'), '') = ''",
    replace: "",
  },
  {
    id: "S8", kind: "sql", ac: "AC-FRM-15", file: SUBMIT, tests: [PURCHASE_DB],
    what: "submit_purchase: порожню ціну рядка не перевіряємо",
    find: "\n      or coalesce(btrim(v_line ->> 'price'), '') = '' then",
    replace: " then",
  },
  {
    id: "S9", kind: "sql", ac: "AC-FRM-15", file: SUBMIT, tests: [PURCHASE_DB],
    what: "submit_purchase: мета з самих пробілів вважається заповненою (без btrim)",
    find: "      or coalesce(btrim(v_line ->> 'purpose'), '') = ''",
    replace: "      or coalesce(v_line ->> 'purpose', '') = ''",
  },
];

// Приклади з демо (інша схема — у вашому репо цих файлів немає, тож не розкоментовуйте як є):
//
// SQL, межа з AC — діапазон напіввідкритий, останній день заявки не рахується:
//   { id: "L2", kind: "sql", ac: "AC-LEAVE-11", file: RULES, tests: [LEAVE_DB],
//     what: "перетин: діапазон НОВОЇ заявки напіввідкритий [початок, кінець)",
//     find: "pg_catalog.daterange(p_start_date, p_end_date, '[]')",
//     replace: "pg_catalog.daterange(p_start_date, p_end_date, '[)')" },
//
// SQL, політика послаблена до true (а не видалена: без політики RLS забороняє все, і тест відмови лишився б зеленим):
//   { id: "L5", kind: "sql", ac: "передумова AC-LEAVE-04/10", file: LEAVE, tests: [LEAVE_DB],
//     what: "blocked_days: insert дозволено будь-кому з входом, а не лише адміністратору",
//     find: "on public.blocked_days for insert to authenticated\n  with check ((select private.current_app_role()) = 'admin');",
//     replace: "on public.blocked_days for insert to authenticated\n  with check (true);" },
//
// Еквівалентний мутант — лише з reason, що посилається на рядок, який робить його зайвим:
//   { id: "L6", kind: "sql", ac: "AC-LEAVE-06/07", file: RECORDS, tests: [LEAVE_DB],
//     what: "політика рішень: прибрано role = 'manager'", expect: "survive",
//     reason: "еквівалентний: з 20261018000000_manager_helpers_require_role.sql private.is_division_manager() сама " +
//       "перевіряє current_app_role() = 'manager'", find: "…", replace: "…" },
//
// TS, точковий мутант на межі з AC (повний перебір TS — npm run mutation:ts, Stryker):
//   { id: "T1", kind: "ts", ac: "AC-LEAVE-11", file: "src/lib/leave/calendar.ts", tests: ["tests/leave/calendar.test.ts"],
//     what: "rangesOverlap: <= → <", find: "b.startDate <= a.endDate", replace: "b.startDate < a.endDate" },
