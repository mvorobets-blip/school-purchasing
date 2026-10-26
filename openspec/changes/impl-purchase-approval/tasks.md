# Tasks

Вертикальні задачі: кожна — міграція / RLS + server action + сторінка + тести відмов. Одна задача — одна гілка
`task/<коротко>` і один PR «Реалізація»; задачі 1–3 — ланцюжком (кожна гілка від попередньої). Кожна закінчується
рядком «Done when» з AC ID. Перевірка: `npm test` (зокрема тести бази на PGlite `tests/db/*.test.ts`),
`npm run ac:coverage`, `npm run check:design`, ручна перевірка на проді демо-користувачами після `db-deploy`.

## 1. Форма закупівлі й «Мої заявки» — `task/purchase-form`

- [x] 1.1 PGlite (перший PR задачі): `@electric-sql/pglite@0.5.8`, `tests/db/supabase-pglite.ts` (з демо курсу,
  адаптовано: без підрозділів і посад, `asAnon`).
- [x] 1.2 Міграція `<ts>_purchase_requests.sql`: таблиці, RLS, `private.is_approver_of`, `private.submit_purchase` +
  обгортка (`design.md`, «Дані й RLS»).
- [x] 1.3 Дія `submitPurchase`; сторінки `/requests/new`, `/requests`, `/requests/[id]`; розділ «Requests» у бічній
  панелі; `src/lib/purchase/form.ts` (варіанти відділів і типів, розбір рядків).
- [x] 1.4 Тести: бази — FRM-02, 04, 06, 07, 08, 09, 10, 12, 13 (відмова + дані не змінились; прямий `insert` в
  `purchase_requests` відхилено — ADR 0002); чисті функції — FRM-01, 03, 05, 14 (порожній стан «Мої заявки»);
  дія — FRM-06, 11, 02.
- [x] 1.5 Мутаційна перевірка: локально для кожного відмовного AC (таблиця в описі PR); у CI — щонайменше 2 червоні
  прогони на комітах `mutation: …` із посиланнями.
  Done when: AC-FRM-01 … AC-FRM-14 «реалізовано» в `docs/conformance.md`; `db-deploy` застосував міграцію.

## 2. Англійський інтерфейс і вхід деактивованого — `task/english-ui`

- [x] 2.1 Усі написи інтерфейсу, повідомлення, статуси, типи й ролі — англійською за таблицею PM; `lang="en"`;
  `DESIGN.md` — мова інтерфейсу.
- [x] 2.2 Тести: AC-LANG-01 (скан `src/` на кирилицю поза коментарями — мутація: одне українське слово → червоний),
  LANG-02 … 06, 08; оновлені тексти в чинних тестах (ID без змін).
- [x] 2.3 Вхід деактивованого працівника: `signOut` і «Account deactivated. Contact your administrator» (частина
  AC-ORG-12; рядок матриці лишається «відкладено» до задачі 4.1 `impl-department-setup`); тести з назвою `AC-ORG-12: …`.
- [x] 2.4 Мутаційна перевірка (локально, таблиця в описі PR): одне українське слово в `src/` → AC-LANG-01 червоний;
  прибрати перевірку `is_active` після входу → тест AC-ORG-12 червоний; змінити текст у `messages.ts` → AC-LANG-03/05
  червоні.
  Done when: AC-LANG-01 … 06, AC-LANG-08 «реалізовано».

## 3. Рішення схвалювача — `task/approval`

- [x] 3.1 Міграція `<ts>_purchase_decisions.sql`: `private.decide_purchase` + обгортка.
- [x] 3.2 Дія `decidePurchase`; сторінка `/approvals` «Awaiting decision»; «Approve» / «Reject» з причиною в діалозі;
  причина відхилення на сторінці заявки; пункт панелі лише схвалювачам.
- [x] 3.3 Тести бази APR-01 … 07 (+ повторне рішення й прямий `update` статусу відхилено); дія — APR-02, 03, 06, 07.
- [x] 3.4 AC-FRM-15: повідомлення «Fill in all line fields» для рядка з незаповненим полем (перевірка в
  `private.submit_purchase` — з задачі 1); тести бази й дії. У цій задачі, бо відповідь PM
  (ValiaBihun/2026-quitcode-dream-team#60) прийшла після задач 1–2, а повідомлення — англійською.
- [x] 3.5 `supabase/demo-users.json`: `pm-requester@example.test`, `pm-approver@example.test`, `pm-admin@example.test`.
- [x] 3.6 Мутаційна перевірка (таблиця в описі PR).
  Done when: AC-APR-01 … AC-APR-07 і AC-FRM-15 «реалізовано»; `db-deploy` застосував міграцію.

## 4. ADR і друге правило архітектури — `task/adr-rules`

- [ ] 4.1 `docs/decisions/0002-privileged-writes-via-db-functions.md` — запис лише функціями бази;
  `docs/decisions/0003-server-auth-via-get-claims.md` — авторизація лише `getClaims()` (статус, дата, AC, контекст,
  рішення, ≥ 2 варіанти з «чому ні», наслідки, «Як перевіряємо»).
- [ ] 4.2 `scripts/check-no-get-session.mjs` + job «Авторизація лише через getClaims()» в
  `.github/workflows/architecture.yml`; доказ — червоний прогін на коміті `mutation: …` з `getSession()` → revert.
  Done when: AC-FRM-02, AC-FRM-04, AC-FRM-06, AC-FRM-09, AC-FRM-15, AC-APR-03 … AC-APR-07, AC-ORG-12 — рішення про них
  описано в ADR 0002 і 0003, обидва злито; job зелений на `main`; посилання на червоний прогін в описі PR.

## 5. Прод, акаунти PM, знімки за ролями

- [ ] 5.1 Після merge задачі 3 — `npm run users:demo`, відділ і схвалювач для акаунтів PM на проді; паролі — PM особисто.
- [ ] 5.2 Знімки `docs/img/ws7-role-<role>-<page>.png` (головна сторінка ролі + одна відмова) — в останньому PR задачі.
- [ ] 5.3 `docs/conformance.md` — чесний рядок для кожного AC зрізу 2; `archive` цієї зміни — в останньому PR задачі.
  Done when: AC-FRM-01 … 15, AC-APR-01 … 07, AC-LANG-01 … 06 і AC-LANG-08 мають статус у `docs/conformance.md`
  (реалізовано або відкладено з причиною); `npm run ac:coverage` — OK.

## 6. Головна за ролями й зручність форми (поза AC, DESIGN.md)

Дизайн-робота понад AC зрізу: нових правил продукту, прав і даних не додає (лише те, що RLS уже віддає).

- [x] 6.1 `task/home-dashboard` — головна за ролями (працівник: статуси й останні заявки; схвалювач: «N requests
  awaiting your decision»; адміністратор: заявки школи, «Needs attention»); лічильник «Awaiting decision» у бічній
  панелі; дати подання — один формат на головній, «My requests» і «Awaiting decision», час `America/New_York`
  (припущення PM у вимогах 47 і 48);
  `DESIGN.md` — розділ «Головна».
- [x] 6.2 `task/form-ux` — форма закупівлі: введені рядки лишаються після помилки, помилка над формою, порожні поля
  рядка підсвічено після «Fill in all line fields» (AC-FRM-15), відділ не обрано заздалегідь, коли їх кілька,
  «Submit» вимкнено після «Not enough permissions», доки не змінено відділ чи тип.
  Done when: AC-FRM-06, AC-FRM-15 — їхня поведінка не змінюється (дизайн-робота понад зріз, без нових правил);
  обидва PR злито; тести допоміжних функцій зелені; знімки в описах PR.
