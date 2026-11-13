# Tasks

Вертикальні задачі: кожна — міграція / RLS + server action + сторінка + тести відмов. Одна задача — одна гілка
`task/<коротко>` і один PR «Реалізація»; задачі йдуть ланцюжком (кожна гілка від злитої попередньої — міграції
по черзі). У кожній задачі: тести спершу — в окремій сесії агента (червоні до коду); доказ, що тест відмови може впасти
(SQL-мутант `npm run mutation:sql` або Stryker); рядки `docs/conformance.md` у тому самому PR; незалежне рев'ю перед
merge; CodeRabbit (або `/code-review high`) з відповіддю на кожну знахідку. Перевірка: `npm test` (PGlite
`tests/db/*.test.ts`), `npm run ac:coverage`, `npm run check:design`, `npx fallow audit --base origin/main`.

## 1. Номер заявки, суми, межі рядків — `task/request-number-sums`

- [x] 1.1 Міграція `<ts>_request_number_and_line_limits.sql`: номер, послідовність, backfill за датою подання;
  `private.validate_purchase_lines`; `submit_purchase` з номером і межами (`design.md`, задача 1).
- [x] 1.2 Номер `PUR-n` у «My requests», «Awaiting decision», на сторінці заявки; `src/lib/purchase/money.ts` (центи);
  на сторінці — «Sum, USD» і «Total».
- [x] 1.3 Форма: кількість — ціле від 1 («Quantity: a whole number from 1»), ціна — від 0 («Price: a number from 0»);
  тест зрізу 2 «дробова кількість допустима» змінюється (свідома зміна поведінки — в описі PR).
- [x] 1.4 Тести: PGlite — AC-HIST-01 (порожня база: `PUR-1`, `PUR-2`), backfill за датою, номер не повторюється;
  unit — AC-HIST-02 (3×20.00, 2×15.50 → 60.00, 31.00, 91.00); регресійні без AC ID — межі кількості й ціни в базі й формі,
  сума понад `Number.MAX_SAFE_INTEGER` (найбільші допустимі кількість і ціна — точно до цента, BigInt).
- [x] 1.5 Мутанти: номер не з послідовності; кількість 1.5 пропущено → тести червоні.
  Done when: AC-HIST-01, AC-HIST-02 «реалізовано»; `db-deploy` застосував міграцію.

## 2. Історія «Submitted» і доступ до неї — `task/request-history`

- [x] 2.1 Міграція `<ts>_request_history.sql`: `purchase_request_events` (RLS, лише `select`), подію «submitted» пише
  тригер `purchase_requests_submitted_event` (`private.add_submitted_event`, після `insert` заявки), а не
  `submit_purchase`, як планували (PR 59; уточнено за зауваженням PM 8, приймання 12.11); backfill,
  `private.request_history` з ім'ям чи email.
- [x] 2.2 Розділ «History» на сторінці заявки: «Submitted · <ім'я> · 05.11.2026, 14:32» (`America/New_York`, 24 год,
  без позначки поясу — #74); `src/lib/purchase/date.ts` — `formatSubmittedAt`.
- [x] 2.3 Тести: PGlite — AC-HIST-10 (схвалювач іншого відділу: подій 0, статус не змінився; прямий `insert`/`update`
  події відхилено), AC-HIST-06 (подія з автором і часом); unit — формат часу (зокрема перехід на літній час);
  сторінка — AC-HIST-10 (`ForbiddenCard`, «History» немає); регресійні — історію бачать схвалювач відділу заявки й
  адміністратор (PGlite) і розділ «History» на сторінці для того, кому видно заявку.
- [x] 2.4 Мутанти: політика `select` подій без перевірки видимості заявки → AC-HIST-10 червоний.
  Done when: AC-HIST-06, AC-HIST-10 «реалізовано».

## 3. Часткове схвалення — `task/partial-approval`

- [x] 3.1 Міграція `<ts>_partial_approval.sql`: статуси `partially_approved`, `returned`; статус рядка;
  `decide_purchase` з позначеними рядками (`ALL_LINES_REJECTED`).
- [x] 3.2 Сторінка заявки для схвалювача: «Reject line», «Approve» / «Partially approve», «Line status» для автора;
  `STATUS_LABEL` += «Partially approved», «Returned for revision»; токени `status-partial`, `status-returned`
  (`DESIGN.md` §9, `globals.css`, контраст в описі PR).
- [x] 3.3 Тести: PGlite — AC-DEC-01 (рядок 2 `rejected`, 1 і 3 `approved`, заявка `partially_approved`), усі позначено →
  без змін, схвалення без позначених → `approved` (регресія AC-APR-02), не схвалювач чи автор → без змін; дія й
  сторінка — AC-DEC-01, AC-LANG-09 («Partially approved» текстом).
- [x] 3.4 Мутанти: без перевірки «усі рядки» → тест червоний; `partially_approved` замість `approved` без позначених →
  AC-APR-02 червоний.
  Done when: AC-DEC-01 «реалізовано».

## 4. Повернення на доопрацювання — `task/return-for-revision`

- [x] 4.1 Міграція `<ts>_return_for_revision.sql`: `return_reason`, рішення `return` з обов'язковою причиною.
- [x] 4.2 «Return for revision» → `Dialog` з причиною (≤ 500); причина повернення на сторінці заявки поруч зі статусом.
- [x] 4.3 Тести: PGlite — AC-DEC-04 (`returned` з причиною «Уточніть кількість»), AC-DEC-06 (без причини — `NO_REASON`,
  статус `pending`), власна заявка й чужий відділ → без змін; дія — «Provide a reason»; сторінка — AC-LANG-09
  («Returned for revision» текстом).
- [x] 4.4 Мутанти: прибрати перевірку причини → AC-DEC-06 червоний.
  Done when: AC-DEC-04, AC-DEC-06, AC-LANG-09 «реалізовано».

## 5. Повторне подання — `task/resubmit`

- [x] 5.1 Міграція `<ts>_resubmit_purchase.sql`: `private.resubmit_purchase` + обгортка.
- [x] 5.2 `/requests/[id]/edit` (форма `/requests/new`, відділ і тип заблоковані), дія `resubmitPurchase`, «Edit» для
  автора поверненої заявки.
- [x] 5.3 Тести: PGlite — AC-DEC-07 (виправлено рядок 1 → `pending`, той самий відділ, номер і новий запис «Submitted»),
  не автор чи не `returned` → без змін, межі рядків як при першому поданні; дія й сторінка — AC-DEC-07.
- [x] 5.4 Мутанти: без перевірки автора → тест відмови червоний.
  Done when: AC-DEC-07 «реалізовано».

## 6. UAT, proof pack, прод — `task/uat-slice3`

- [x] 6.1 `supabase/demo-users.json`: `approver-primary@example.test`, `approver-office@example.test`; розробник
  запускає `npm run users:demo` і призначає відділи; `accounts.zip` — новий (пароль курсу вводить розробник).
- [x] 6.2 Тест UAT на кожен із 9 AC у `tests/e2e/*.spec.ts` (нові ролі в `auth.setup.ts`; AC, що пишуть дані, —
  `@writes`, `uatEmail()`, `deleteUatUsers`); розробник запускає `npm run uat` і `npm run uat:nc`.
- [x] 6.3 Звіт UAT у `docs/qa/uat/<дата>/`; proof pack — рядок на кожен із 9 AC (тест, доказ падіння, UAT, PR + SHA);
  archive `impl-purchase-history` в останньому PR зрізу.
  Done when: AC-DEC-01, AC-DEC-04, AC-DEC-06, AC-DEC-07, AC-HIST-01, AC-HIST-02, AC-HIST-06, AC-HIST-10, AC-LANG-09 —
  «реалізовано» з вердиктом UAT; proof pack без порожніх рядків.
