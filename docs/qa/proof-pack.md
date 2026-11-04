# QA proof pack: зріз 2 — працівник подає закупівлю, схвалювач вирішує, інтерфейс англійською

<!--
Шаблон з koldovsky/2026-quitcode-08-quality-hw/materials/templates/proof-pack.template.md.
Покладіть у docs/qa/proof-pack.md вашого репо й заповнюйте по кроках WS8 (A → B → C → D).
Посилання — на файли на коміті (…/blob/<sha>/…#L<N>), на PR (…/pull/N) і на прогони (…/actions/runs/N).
Жодних паролів і пароля від accounts.zip. Акаунти — лише адреси *@example.test.
Цей файл — вхід для конвеєра WS9: на кожен AC видно, чим він доведений.
-->

- Прод-URL: https://therapy-scheduling-ten.vercel.app
- Вимоги: https://github.com/ValiaBihun/2026-quitcode-dream-team · джерело: issues · знімок 2026-11-02
- `/api/health` на момент UAT: sha `152825c`, db ok, env production, 03.11.2026

## 3 AC

| AC | Вид | «Тоді» (дослівно з вимоги PM) |
|---|---|---|
| AC-FRM-08 | відмова в браузері (чужі дані за прямим посиланням) | Тоді він бачить повідомлення «Недостатньо прав», даних закупівлі йому не показано, а закупівля працівника 1 лишається зі статусом «Очікує схвалення». |
| AC-FRM-14 | стан інтерфейсу (порожній стан) | Тоді він бачить повідомлення «Ви ще не подали жодної заявки», а списку заявок немає. |
| AC-FRM-15 | стан інтерфейсу (помилка) | Тоді він бачить повідомлення «Заповніть усі поля рядка», а закупівлю не подано. |

- Джерело AC: `requirements/47-pratsivnyk-podaie-zakupivliu-cherez-formu.md` (ValiaBihun/2026-quitcode-dream-team#47).
- Інтерфейс англійською (ValiaBihun/2026-quitcode-dream-team#49, таблиця текстів): на екрані «Not enough permissions», «You have not submitted any requests yet», «Fill in all line fields»; статус «Очікує схвалення» — «Awaiting approval».
- Акаунти на проді (усі `*@example.test`, паролі — лише в `accounts.zip`; як у прийманні PM): AC-FRM-08 — працівник 1 (автор) `member1@example.test`, працівник 2 `pm-requester@example.test` (заявник «Primary School», не автор і не схвалювач цього відділу); AC-FRM-14 — працівник 3 `member2@example.test` (без поданих заявок); AC-FRM-15 — працівник 1 `pm-requester@example.test`. Записів UAT не створює: AC-FRM-08 і AC-FRM-14 лише читають, AC-FRM-15 пробує подати неповний рядок і отримує відмову. (До 04.11 працівником 2 в AC-FRM-08 був `member2` — заявник іншого відділу; див. розділ C.)

## A. Ворота

- PR воріт: https://github.com/mvorobets-blip/school-purchasing/pull/43 (перед ним — виправлення знахідок тестових правил лінтера, https://github.com/mvorobets-blip/school-purchasing/pull/42)
- Зелений `quality` на `main`: https://github.com/mvorobets-blip/school-purchasing/actions/runs/41613511963 (коміт `152825c`: «Ворота: fallow audit», «Покриття: доменна підлога», «Порада: вразливі залежності» — success)
- Обов'язкові перевірки в `solo-main` з 03.11.2026: «Ворота: fallow audit», «Покриття: доменна підлога» («Порада: вразливі залежності» — не обов'язкова, як вимагає курс)

Розбір першого повного прогону `fallow` (той самий — в описі PR воріт):

| Група знахідок | Скільки | Справжня / навмисна / хибна | Дія і причина |
|---|---|---|---|
| Unused file `src/lib/supabase/client.ts` (браузерний клієнт шаблону) | 1 | справжня | виправлено: файл видалено — його ніхто не імпортує, усі виклики Supabase серверні; рядок у `AGENTS.md` оновлено |
| Unused file `tests/manual/rls-smoke.mjs` | 1 | навмисна | npm-скрипт `rls:smoke` (`node --env-file=.env.local tests/manual/rls-smoke.mjs`): ручна перевірка RLS/GRANT після `db-deploy`; тепер fallow бачить точку входу сам, без `entry` |
| Unused export `AC_ID_GLOBAL` (`scripts/lib/spec-lib.mjs`) | 1 | справжня | виправлено: константу видалено, ніде не використовується (файл з шаблону — можливий конфлікт при cherry-pick шаблону, див. опис PR) |
| `shadcn` — «dev dependency used in production» | 1 | хибна | `ignoreDependencies` з причиною: лише `@import "shadcn/tailwind.css"` у `src/app/globals.css`, Tailwind 4 збирає його під час `next build`, під час роботи пакет не потрібен (devDependency з WS7, PR #35) |
| Duplicate exports `removeRequester`, `setApprover` (`admin/departments/[id]/actions.ts` ↔ `lib/org/roles.ts`) | 1 пара | справжня | лишено з поясненням: барелів немає, імпорт не двозначний; версії в `roles.ts` — TS-модель правила ролей, яку імпортують лише тести слайсу 1 (`tests/org/roles.test.ts`, `membership.test.ts`) — розбір у кроці 4 (тести з TS-копії SQL-правила) |
| Клони `check-design-tokens.mjs` ↔ `check-server-boundary.mjs` (`590b46e1`) | 1 група | навмисна | лишено: обидва файли — матеріали курсу WS7, тримаємо без змін для оновлень курсу |
| Клони з нашим `scripts/check-no-get-session.mjs` (PR #18, ADR 0003) ↔ `check-*.mjs` (`daf1f7c3`, `b4591355`, `aa35ac66`) | 3 групи | справжня | лишено з поясненням: наш скрипт повторює обхід файлів скриптів курсу; спільну функцію виносити — змінювати файли курсу; `audit.gate: new-only` не блокує |
| Клони в наших сторінках (`admin/departments/page.tsx` ↔ `(portal)/page.tsx`, 8 рядків; ↔ `requests/page.tsx`, 13 рядків) | 2 групи | справжня (дрібна) | лишено з поясненням: однакова розмітка таблиці й порожнього стану; спільний компонент — рефакторинг поза WS8 |
| Складність у скриптах курсу (`check-design-tokens` 3, `check-server-boundary` 2, `check-spec` 3, `create-demo-users` 1) | 9 | навмисна | лишено: файли шаблону курсу й матеріалів WS7 без наших змін |
| Складність у `src/components/ui/sidebar.tsx` (`Sidebar`, `SidebarMenuButton`) | 2 | навмисна | лишено: компонент shadcn/ui (DESIGN.md: компоненти змінюються лише в цій теці), змінено лише `aria-label`/`sr-only` |
| Складність у `src/app/api/health/route.ts` (`GET`) | 1 | навмисна | лишено: файл з `materials/d0` без змін (walkthrough називає цю знахідку) |
| Складність `scripts/smoke.mjs` — у першому прогоні прихована `health.ignore` матеріалів («скрипти курсу… ви їх не змінюєте»), хоча в PR #40 ми скрипт змінили | 1 (`main`: cyclomatic 44, cognitive 45) | справжня | виправлено в цьому PR (за `/code-review`): `smoke.mjs` прибрано з `health.ignore`; `main` розбито на `rootProblem`, `loginProblem`, `parseHealth`, `fetchHealth`, `healthProblem`, `shaProblem` → `main` 5/4, найбільша функція 11 (`healthProblem`). Решта позначок — `warn` (CRAP оцінено статично: тести `tests/scripts/smoke.test.ts` запускають скрипт дочірнім процесом, v8 його не рахує); поведінка та сама — 7 тестів smoke, прогін на проді з SHA `main` (код 0) і з хибним SHA (код 1, те саме повідомлення) |
| Складність у нашому коді: `(portal)/page.tsx` (`Home`, `<arrow>`), `admin/departments/[id]/page.tsx` (`DepartmentPage`, 2 × `<arrow>`), `admin/departments/page.tsx` (`DepartmentsPage`, `<arrow>`), `requests/new/purchase-form.tsx` (`PurchaseForm`), `(portal)/layout.tsx` (`PortalLayout`), `admin/departments/[id]/actions.ts` (`errorCode`, `run`), `components/portal/app-sidebar.tsx` (`isActive`) і `scripts/check-no-get-session.mjs` (`walk`, `<arrow>`) | 14 | справжня | лишено з поясненням: сторінки з даними за роллю й форма; розбиття — рефакторинг поза WS8; сторінки доводять тести сторінок і e2e, а не покриття рядків; `new-only` не блокує |
| Прихована зв'язаність змін `approvals/page.tsx` ↔ `(portal)/layout.tsx` (100 %) | 1 пара | хибна | лишено: обидва файли вже імпортують спільний `src/lib/purchase/awaiting.ts` (`getAwaitingDecision`), тож залежність явна; сигнал — від великих squash-комітів |

Примітки: оцінки CRAP — з автоматично знайденого `coverage/coverage-final.json` (без нього fallow оцінює статично). Інформаційні розділи (hotspots, refactoring targets, health overrides) — не знахідки. Мертвих Server Actions fallow не знайшов (`unused-server-actions: error`). Повний вивід — `fallow-baseline.txt` (не комітимо).

Тестові правила лінтера (`@vitest/eslint-plugin`, `error`): 8 знахідок `no-restricted-syntax` (`vi.mock` власного модуля `@/lib/org/current-user`) виправлено окремим PR перед воротами (P08, https://github.com/mvorobets-blip/school-purchasing/pull/42) — справжній `getCurrentUser` через мок клієнта Supabase; з правилами WS8 `npm run lint` — 0.

Підлога покриття (`vitest.coverage.config.mts`, `FLOORED`): 14 доменних файлів, що вже тримають 90/85/90/90 — `health`, `theme`, `org/{access,current-user,departments,membership,messages,permissions,roles}`, `purchase/{dashboard,date,form,pagination,status}`. Поза підлогою: `purchase/awaiting` (гілки 73 %), `utils` (лише реекспорт `cn`, 0 рядків).

## B. Якість тестів

### Рівень для кожного AC

Посилання в цій таблиці закріплено на `152825c` — стан тестів **до** кроків 4.3–4.4 (тоді AC-FRM-08 —
`purchase.test.ts:138`). Нижче (покриття, мутації) номери рядків — поточні, після нових тестів: AC-FRM-08 — `:161`,
AC-FRM-15 — `:116` і `:124`.

| AC | Де живе правило | Рівень | Чому | Тест |
|---|---|---|---|---|
| AC-FRM-08 | **база:** політика RLS `purchase_requests_select_visible` ([міграція :82](https://github.com/mvorobets-blip/school-purchasing/blob/152825cf6352761066d290eb08b5640928088d0a/supabase/migrations/20261025184732_purchase_requests.sql#L82)) — заявку бачать лише автор, схвалювач її відділу й адміністратор; без `grant update` для `authenticated`. **Сторінка:** `src/app/(portal)/requests/[id]/page.tsx` — порожня відповідь бази → «Not enough permissions» | **база (PGlite)** + SQL-мутант; **e2e/UAT** — текст на екрані | відмову «X не бачить чужого» тримає RLS: її доводить лише справжній SQL (`asUser` + `asService` «статус не змінився»); TS-копія чи мок лишаються зеленими без правила. Дослівний текст на екрані — UAT | [tests/db/purchase.test.ts:138](https://github.com/mvorobets-blip/school-purchasing/blob/152825cf6352761066d290eb08b5640928088d0a/tests/db/purchase.test.ts#L138) — справжня база: `MEMBER_2` не бачить заявки й рядків, `update` — `permission denied`, статус `pending`. [tests/purchase/request-page.test.tsx:78](https://github.com/mvorobets-blip/school-purchasing/blob/152825cf6352761066d290eb08b5640928088d0a/tests/purchase/request-page.test.tsx#L78) — **мок відповіді бази** (`request = null`): доводить лише реакцію сторінки на порожню відповідь, **відмову не доводить** — як доказ AC не зараховуємо |
| AC-FRM-14 | **сторінка:** `src/app/(portal)/requests/page.tsx` — порожній стан `NO_REQUESTS` («You have not submitted any requests yet») і без таблиці, коли власних заявок 0 (фільтр `author_id` + RLS) | **e2e/UAT** (текст і стан екрана); тест сторінки — додатково | «Тоді» — дослівний текст і відсутність списку на екрані: доводить запис з проду. Правила в SQL чи TS-модулі тут немає — вибір рівня визначає сторінка | [tests/purchase/my-requests-page.test.tsx:116](https://github.com/mvorobets-blip/school-purchasing/blob/152825cf6352761066d290eb08b5640928088d0a/tests/purchase/my-requests-page.test.tsx#L116) — рендер справжньої сторінки (`renderToStaticMarkup`) з моком клієнта Supabase: текст PM і `data-testid="no-requests"` є, таблиці `my-requests` немає. Специфікація UAT — крок 5 |
| AC-FRM-15 | **правило двічі:** SQL `private.submit_purchase` — порожнє поле рядка → `INVALID_LINE` (жива версія функції — [міграція 20261027132703 :43–47](https://github.com/mvorobets-blip/school-purchasing/blob/152825cf6352761066d290eb08b5640928088d0a/supabase/migrations/20261027132703_submit_purchase_rounded_price_limit.sql#L43)); **TS:** `parseLines` лишає частково заповнений рядок (не «губить» його), `emptyLineFields` позначає порожні поля ([src/lib/purchase/form.ts:37, :66](https://github.com/mvorobets-blip/school-purchasing/blob/152825cf6352761066d290eb08b5640928088d0a/src/lib/purchase/form.ts#L37)); дія `submitPurchase` перекладає `INVALID_LINE` у «Fill in all line fields» | **обидва:** база (PGlite) + SQL-мутант; unit (TS) + Stryker; e2e/UAT — текст | кожен шар може втратити правило окремо: база — останній рубіж, TS — повідомлення й позначка полів | [tests/db/purchase.test.ts:116](https://github.com/mvorobets-blip/school-purchasing/blob/152825cf6352761066d290eb08b5640928088d0a/tests/db/purchase.test.ts#L116) — справжня база: рядок лише з назвою → `INVALID_LINE`, нової заявки немає (на `152825c` перевіряв лише рядок «є назва, решти немає», тож мутанти, що прибирають перевірку одного поля, вижили — S5–S9 у «SQL-мутаціях» нижче; посилено тестом `tests/db/purchase.test.ts:124`, тепер усі 11 SQL-мутантів убито). [tests/purchase/form.test.ts:90](https://github.com/mvorobets-blip/school-purchasing/blob/152825cf6352761066d290eb08b5640928088d0a/tests/purchase/form.test.ts#L90) — `emptyLineFields` (без AC ID). [tests/purchase/submit-purchase.test.ts:64](https://github.com/mvorobets-blip/school-purchasing/blob/152825cf6352761066d290eb08b5640928088d0a/tests/purchase/submit-purchase.test.ts#L64) — **мок `rpc`** з `INVALID_LINE`: доводить лише переклад відповіді в текст, **правило не доводить** — як доказ відмови не зараховуємо |

### Покриття

`npm run test:coverage` на гілці `task/test-quality`: код = `main` [`4b4cc2b`](https://github.com/mvorobets-blip/school-purchasing/commit/4b4cc2b), змінено лише `docs/qa/proof-pack.md`; цифри з `coverage/coverage-summary.json` (збігаються з `coverage/index.html`). Разом по
репо: інструкції 51,79 % (419/809), гілки 46,73 % (329/704), функції 44,78 % (116/259), рядки 53,69 % (356/663).
Після тестів кроків 4.3–4.4 (+17 тестів: 16 на `form.ts`, 1 тест бази — SQL Vitest-покриття не бачить): гілки 47,01 % (331/704), решта без змін — як і в демо, нові тести
вбивають мутантів, а покриття рядків не зростає.

| Файл за AC | AC | Інструкції | Рядки | Гілки | Функції | Чим доведено те, чого покриття не бачить |
|---|---|---|---|---|---|---|
| `src/lib/purchase/form.ts` | AC-FRM-15 | 100 % (50/50) | 100 % (40/40) | 95,65 % (44/46) → **100 % (46/46)** після тестів кроку 4.3 | 100 % (24/24) | unit-тести `tests/purchase/form.test.ts:75, :79, :85` (`parseLines` лишає рядок лише з назвою) і `:101` (`emptyLineFields`); що вони ловлять зміни правила — Stryker нижче («Доказ мутацією») |
| `src/lib/org/messages.ts` | AC-FRM-08, 14, 15 | 100 % (2/2) | 100 % (2/2) | — (0/0) | 100 % (1/1) | константи текстів PM («Not enough permissions», «You have not submitted any requests yet», «Fill in all line fields»); що саме ці тексти видно на екрані — UAT (усі 3 AC — PASS) |
| `src/components/portal/forbidden-card.tsx` | AC-FRM-08 | 100 % (1/1) | 100 % (1/1) | — (0/0) | 100 % (1/1) | картка відмови; вигляд і текст на екрані — UAT (AC-FRM-08, PASS) |
| `src/app/(portal)/requests/new/page.tsx` | AC-FRM-15 | 83,33 % (10/12) | 81,81 % (9/11) | 88,88 % (8/9) | 66,66 % (2/3) | сторінка, що відкриває форму; форма з повідомленням на проді — UAT (AC-FRM-15, PASS) |
| `src/app/(portal)/requests/actions.ts` (`submitPurchase`) | AC-FRM-15 | 92,59 % (25/27) | 94,73 % (18/19) | 81,81 % (18/22) | 100 % (2/2) | покрито тестом з **моком `rpc`**: рядки виконано, але правило `INVALID_LINE` тут не живе — його доводить тест бази `tests/db/purchase.test.ts:116` і SQL-мутанти (S4–S9, див. «SQL-мутації») |
| `src/app/(portal)/requests/new/purchase-form.tsx` | AC-FRM-15 | 51,02 % (25/49) | 60 % (24/40) | 49,05 % (26/53) | 28,57 % (6/21) | дослівний текст «Fill in all line fields» над формою й форма з «Папір А4» — UAT `tests/e2e/purchase.spec.ts` (AC-FRM-15, PASS 03.11) |
| `src/app/(portal)/requests/[id]/page.tsx` | AC-FRM-08 | 88 % (22/25) | 100 % (20/20) | 75 % (21/28) | 100 % (2/2) | покрито тестом сторінки з **моком відповіді бази** (`request = null`) — відмову не доводить; відмову доводить RLS-тест бази `tests/db/purchase.test.ts:161` і SQL-мутанти S1–S3, S10, S11 (див. «SQL-мутації»), текст на екрані — UAT (AC-FRM-08, PASS) |
| `src/app/(portal)/requests/page.tsx` | AC-FRM-14 | 86,95 % (20/23) | 100 % (18/18) | 70 % (14/20) | 100 % (4/4) | тест сторінки з моком клієнта Supabase + UAT на проді (AC-FRM-14, PASS) |
| `supabase/migrations/*.sql` (RLS `purchase_requests_select_visible`, `private.submit_purchase`) | AC-FRM-08, AC-FRM-15 | — | — | — | — | Vitest-покриття SQL не бачить: доводять тести бази `tests/db/purchase.test.ts:116, :124, :161` (PGlite, справжні міграції) і SQL-мутанти S1–S11 (11 з 11 убито, див. «SQL-мутації») |

Файлів з 0 % серед перелічених немає. На шляху всіх трьох AC є ще `src/lib/supabase/server.ts` — 0 % (0/6 рядків):
тести сторінок і дії підміняють клієнт Supabase моком, а справжній клієнт працює лише на проді — його доводить UAT. Високі цифри сторінок і дії — від тестів з моком бази: рядки виконано, але
відмову за правами й `INVALID_LINE` вони не доводять (див. «Рівень для кожного AC»).

### Доказ мутацією

Stryker запускали лише на AC-FRM-15 (`src/lib/purchase/form.ts`). На AC-FRM-08 і AC-FRM-14 — ні: їхні правила не в
`src/lib` — RLS-політика `purchase_requests_select_visible` (FRM-08) і сторінка `src/app/(portal)/requests/page.tsx`
(FRM-14); їх доводять тест бази з SQL-мутантом (крок 4.4) і UAT на проді.

Stryker 10.1.1, `npm run mutation:ts -- --mutate src/lib/purchase/form.ts` (конфіги курсу `stryker.config.json`,
`vitest.stryker.config.mts` без змін). Вижилі **на рядках AC-FRM-15** (`parseLines`, `emptyLineFields`); тест посилено
окремою сесією агента промптом P03 — з тексту AC, спершу червоний на кожному мутанті, потім зелений:

| Мутант (файл:рядок, що змінено) | AC під загрозою | До | Тест, посилений з тексту AC | Після |
|---|---|---|---|---|
| `form.ts:47` мета `?? ""` → `?? "Stryker was here!"` | AC-FRM-15 | вижив | `tests/purchase/form.test.ts:79` — рядок «лише з назвою «Папір А4»», полів мети, кількості й ціни у формі немає → вони порожні, підсвітити треба саме мету, кількість і ціну | убитий |
| `form.ts:48` кількість `?? ""` → `?? "Stryker was here!"` | AC-FRM-15 | вижив | те саме, `:79` | убитий |
| `form.ts:49` ціна `?? ""` → `?? "Stryker was here!"` | AC-FRM-15 | вижив | те саме, `:79` | убитий |
| `form.ts:47` мета без `.trim()` | AC-FRM-15 | вижив | `tests/purchase/form.test.ts:85` — той самий рядок, у меті, кількості й ціні лише пробіли → «без мети, кількості й ціни» | убитий |
| `form.ts:48` кількість без `.trim()` | AC-FRM-15 | вижив | те саме, `:85` | убитий |
| `form.ts:49` ціна без `.trim()` | AC-FRM-15 | вижив | те саме, `:85` | убитий |

Ці unit-тести доводять TS-частину AC-FRM-15: рядок лише з назвою не губиться, а мета, кількість і ціна — порожні й
позначені. Самі «Тоді» — повідомлення «Fill in all line fields» і «закупівлю не подано» — доводять тест бази
`tests/db/purchase.test.ts:116` (`INVALID_LINE`, нової заявки немає) і UAT на проді.

Поза межами AC (понад вимоги кроку): ще 15 мутантів на рядках без AC — 14 вижилих і 1 без покриття — убито **регресійними тестами без AC ID**
(`tests/purchase/form-regression.test.ts`, окрема сесія агента; кожен спершу червоний на своєму мутанті):
- `form.ts:40` `\d+` → `\d` (рядок з номером 10+ губився) — `:39`; `:43–44` сортування (×3) — `:44`; `:46` назва без `.trim()` і `?? ""` — `:29`, `:34`;
- `form.ts:67` `emptyLineFields` без `.trim()` (рядок лише з пробілів) — `:59`;
- `form.ts:93` `hasTooLongLine`: `some` → `every`, `>` → `>=` (межа 200 символів Unicode) — `:67`, `:73`, `:79`;
- `form.ts:96` `isTextLengthError` (×4: `?.`, `true`, `||`, код) — `:88`, `:92`, `:97`, `:102`;
- `form.ts:107` кількість без `.trim()` — `:109`; `form.ts:110` `<` → `<=` `PRICE_LIMIT` — `:113`.

- Stryker: **до** — 85,33 % (157 убито, 25 вижило, 2 без покриття з 184); **після** — **96,74 %** (178 убито, 6 вижило,
  0 без покриття). На рядках AC-FRM-15 вижилих немає. Тести: 230 → 246 (крок 4.3) → 247 (+1 тест бази, крок 4.4). Вивід — в описі [PR #46](https://github.com/mvorobets-blip/school-purchasing/pull/46).
- Вижили 6, і жоден не загрожує AC-FRM-15 (жодного Stryker не вимкнено):
  - еквівалентні (4) — у розділі нижче;
  - `form.ts:40` регулярний вираз без `^` або без `$` (2) — у `parseLines`, але AC-FRM-15 не загрожують: нерозрізнений
    вхід (ключі, яких форма не надсилає), не еквівалентні. Сміттєвий ключ лише
    додає номер рядка, а дані беруться з ключів `name.N`…; різниця — лише в порядку рядків, коли номери з нулями
    попереду («1» і «01»). Форма таких ключів не надсилає (`purchase-form.tsx`: `name.${line.key}`, `key: number`), тож
    тест закріпив би випадкову поведінку сортування, а не правило — свідомо без тесту.
- SQL-мутації (`npm run mutation:sql`, скрипти курсу `scripts/mutation-check.mjs` і `scripts/mutants.mjs`; у
  `mutation-check.mjs` за рев'ю CodeRabbit PR #46 — свідомі правки: прапорець без значення — помилка запуску (код 2),
  тимчасовий каталог прибирається за будь-якого виходу, файл відновлюється лише якщо в ньому досі мутант; гарнес —
  наш `tests/db/supabase-pglite.ts`, тож P1/P2 курсу й `profiles-db.test.ts` не брали). 11 мутантів на правила наших AC
  (AC-FRM-14 правила в SQL не має — його доводить UAT). **До — 4 з 9 убито (44 %), після — 9 з 9 (100 %); за незалежною перевіркою додано S10, S11 — убиті одразу: разом 11 з 11.**

  | Мутант | AC | Що зламано (міграція) | До | Після — який тест упав |
  |---|---|---|---|---|
  | S1 | AC-FRM-08 | `purchase_requests_select_visible` → `true` (бачать усі активні) — `20261025184732_purchase_requests.sql` | KILLED | `tests/db/purchase.test.ts:161` AC-FRM-08 (і AC-FRM-10) |
  | S2 | AC-FRM-08 | `purchase_request_lines_select_visible`: `exists (…заявка видима…)` → `true` | KILLED | `:161` AC-FRM-08 |
  | S3 | AC-FRM-08 | `grant select` → `grant select, update` на `purchase_requests` для `authenticated`. Без політики UPDATE RLS рядків не змінює (статус лишається), але правило «без `grant update`» порушено: тест чекає `permission denied` і падає, бо помилки немає | KILLED | `:161` AC-FRM-08 |
  | S10 | AC-FRM-08 | `private.is_approver_of`: прибрано `and m.is_approver` — будь-який член відділу «схвалювач» («не схвалювач» з AC) | додано після перевірки | KILLED — `:161` AC-FRM-08 |
  | S11 | AC-FRM-08 | `private.is_approver_of`: прибрано `m.department_id = p_department_id` — схвалювач іншого відділу бачить чужий | додано після перевірки | KILLED — `:161` AC-FRM-08 |
  | S4 | AC-FRM-15 | `submit_purchase`: перевірку порожніх полів рядка прибрано — `20261027132703_…price_limit.sql` | KILLED | `:116` і `:124` AC-FRM-15 |
  | S5 | AC-FRM-15 | без перевірки порожньої **назви** | SURVIVED | `:124` AC-FRM-15 (посилений) |
  | S6 | AC-FRM-15 | без перевірки порожньої **мети** | SURVIVED | `:124` |
  | S7 | AC-FRM-15 | без перевірки порожньої **кількості** | SURVIVED | `:124` |
  | S8 | AC-FRM-15 | без перевірки порожньої **ціни** | SURVIVED | `:124` |
  | S9 | AC-FRM-15 | мета з самих пробілів — «заповнена» (без `btrim`) | SURVIVED | `:124` |

  S5–S9 вижили, бо тест `:116` мав лише рядок «лише з назвою»: решта порожніх полів однаково давала `INVALID_LINE`.
  Посилено за P05 (посилення тесту — методом P03, окремою сесією агента) з вимоги специфікації «не заповнено назву, мету, кількість чи ціну»
  (`openspec/specs/purchase-form/spec.md:84`): `:124` — для кожного поля рядок, де лише воно відсутнє, порожнє чи з
  пробілів, а решта заповнені → `INVALID_LINE`, нової заявки немає. Відсутні кількість і ціна (а не `""`) потрібні для
  S7/S8: `''::numeric` і без перевірки дає `INVALID_LINE`. Після кожного прогону `git status supabase/` порожній —
  мутовану міграцію не комічено. Еквівалентних SQL-мутантів немає.
- Еквівалентні мутанти (Stryker, `form.ts`):
  - `:108` `line.price.trim()` → `line.price`: `Number(" 5 ") = 5`, `Number(" ") = 0` (допустима ціна) — результат той самий;
  - `:110` `price !== ""` → `true` і → `price !== "Stryker was here!"`: `Number("") = 0` — допустима ціна, тож порожню
    ціну не позначено ні з перевіркою, ні без неї;
  - `:96` `error.message ?? ""` → `?? "Stryker was here!"`: запасний рядок лише звіряють з `/_length\b/`, а `_length` немає
    в жодному з двох — `false` в обох випадках.

## C. UAT на проді

| AC | Специфікація | Тест (твердження) | Агент | Вердикт | Кадр |
|---|---|---|---|---|---|
| AC-FRM-08 | [tests/e2e/purchase.spec.ts:62](https://github.com/mvorobets-blip/school-purchasing/blob/018df39/tests/e2e/purchase.spec.ts#L62) | passed | Haiku: FAIL → Sonnet: PASS | **PASS** (R6) | [AC-FRM-08-then-1.png](uat/2026-11-04/frames/AC-FRM-08-then-1.png) |
| AC-FRM-14 | [tests/e2e/purchase.spec.ts:131](https://github.com/mvorobets-blip/school-purchasing/blob/018df39/tests/e2e/purchase.spec.ts#L131) | passed | Haiku: NEEDS-HUMAN → Sonnet: PASS | **PASS** (R6) | [AC-FRM-14-then-1.png](uat/2026-11-04/frames/AC-FRM-14-then-1.png) |
| AC-FRM-15 | [tests/e2e/purchase.spec.ts:172](https://github.com/mvorobets-blip/school-purchasing/blob/018df39/tests/e2e/purchase.spec.ts#L172) | passed | Haiku: FAIL → Sonnet: PASS | **PASS** (R6) | [AC-FRM-15-then-1.png](uat/2026-11-04/frames/AC-FRM-15-then-1.png) |

- **Фінальний звіт:** [docs/qa/uat/2026-11-04/report.md](uat/2026-11-04/report.md) (+ [manifest.json](uat/2026-11-04/manifest.json), `frames/`) — прогін 04.11.2026, 13:22 (Київ), прод https://therapy-scheduling-ten.vercel.app, `/api/health` — коміт `60024f5` (`main`); код тестів — `task/uat-pm-remarks` @ `018df39` (PR за зауваженнями PM; «+ незакомічені зміни» у звіті — лише тека цього звіту й локальний `fallow-baseline.txt`). Звіт 03.11 ([docs/qa/uat/2026-11-03/report.md](uat/2026-11-03/report.md), PR [#44](https://github.com/mvorobets-blip/school-purchasing/pull/44)) лишається в історії: у ньому `testsCommit` — `a8e3a60`, коміт PR #44 до squash-злиття (досяжний у PR: https://github.com/mvorobets-blip/school-purchasing/pull/44/commits/a8e3a60859e15e120dd45090a11bc012b4a12b49; на `main` той самий код — `78173b3`).
- **Дані:** записів не створює. AC-FRM-08 і AC-FRM-14 лише читають; AC-FRM-15 пробує подати неповний рядок і отримує відмову («Fill in all line fields», закупівлю не подано — нових заявок з «Папір А4» немає). «Прибирання» (teardown з `SUPABASE_SECRET_KEY` з `.env.local` — лише локально, у Vercel ключа немає) шукає синтетичних `uat-*@example.test`: видалено 0, лишилось 0, бо тести таких не створюють.
- **Акаунти** — синтетичні з `supabase/demo-users.json`, спільні з PM (як у її прийманні 03.11): `member1@example.test` — працівник 1, автор заявки «Primary School» (AC-FRM-08); `pm-requester@example.test` — заявник «Primary School», не автор і не схвалювач цього відділу (працівник 2 в AC-FRM-08, працівник 1 в AC-FRM-15); `member2@example.test` — без поданих заявок (працівник 3 в AC-FRM-14). Окремих `uat-<run>@example.test` не створюємо: усі 3 AC лише читають і не потребують нових даних.
- **«Дано» доводить тест (за зауваженням PM):** AC-FRM-08 — «My profile» працівника 2: рядок з точною назвою відділу «Primary School» і роль у ньому — точно «Requester» (не «Requester and approver»); заявка працівника 1 — у його «My requests» з «Awaiting approval». AC-FRM-14 — головна працівника 3: порожній стан «You have not submitted any requests yet» замість карток-лічильників. Це інша сторінка й інший запит, ніж «Тоді», але той самий доступ до даних (RLS, `author_id`): повністю незалежну перевірку дав би лише секретний ключ, якого UAT не має. Порушена умова — падіння в «Дано» з «ПЕРЕДУМОВА НА ПРОДІ…», а не в «Тоді». **Ця перевірка знайшла справжню прогалину:** до 04.11 працівником 2 в AC-FRM-08 був `member2` — заявник «Secondary school», тобто іншого відділу (відмову отримав би й він — саме це й зауважила PM). Тепер — `pm-requester`, заявник того самого відділу.
- **Відео:** вкладення в описі PR за зауваженнями PM (3 файли прогону 13:22 і 2 — NC прогону 13:20); трас і HTML-звіту в git немає.
- **Рецензент:** `claude-haiku-5-5`, суперечки — `claude-sonnet-5-5` (так у конвеєрі курсу: дешевший Haiku спершу, Sonnet — на суперечку); промпт і схема — з `materials/uat` без змін; розбір $0.0973 (ціни API, у межах підписки).
- **Чому Haiku не погоджувався** (нотатки Haiku з прогону 13:22, `test-results/uat/<AC>/review.claude-haiku-5-5.json`, не в git):

  | AC | Haiku | Причина (цитата з нотаток) | Sonnet |
  |---|---|---|---|
  | AC-FRM-08 | FAIL | «Текст повідомлення на кадрі англійською: «Not enough permissions», а критерій вимагає «Недостатньо прав». Різні слова — це not-met за правилом 4» | PASS |
  | AC-FRM-14 | NEEDS-HUMAN | «Розбіжність у самому критерії: у тексті PM повідомлення «Ви ще не подали жодної заявки» (українською), а … на кадрі — англійська фраза «You have not submitted any requests yet»» | PASS |
  | AC-FRM-15 | FAIL | «Текст повідомлення на кадрі англійською: «Fill in all line fields», а критерій вимагає «Заповніть усі поля рядка». Різні слова» | PASS |

  Тобто Haiku звіряє кадр дослівно з українським AC і не застосовує таблицю перекладів PM (#49, англійський інтерфейс), хоча `visible` називає англійський текст; Sonnet — застосовує. Вади застосунку чи тесту тут немає; правила вердикту (R1–R6) і промпт курсу не змінюємо. Те саме — на всіх прогонах 03.11.
- **Свідомий виняток із «файли курсу без змін» — `scripts/uat/lib.mjs`, `quoteInAria`:** при звірці цитати з aria-знімком 20 кириличних літер, що на кадрі не відрізнити від латинських (А, В, Е, І, К, М, Н, О, Р, С, Т, Х і малі), вважаються однаковими з латинськими; регістр має значення. Причина — прогони 03.11 13:22, 14:19, 14:49: Sonnet цитував «Папір A4» латинською «A», а на сторінці й у вимозі PM — кирилична «А» (U+0410), і AC-FRM-15 ставав NEEDS-HUMAN (R4) без вади. Сам текст поля перевіряє Playwright дослівно (`toHaveValue("Папір А4")`), тож латинську «A» на сторінці не пропустив би (R1). Інші свідомі правки курсу після рев'ю PR #44 — `run.mjs`, `review.mjs`, `attachRuntimeErrors` в `uat.ts` (описано в PR #44).
- **Історія прогонів** (вердикти руками не правили):
  - 03.11: 12:58 — AC-FRM-15 NEEDS-HUMAN (R3, кадр знято після переходу — вада тесту, виправлено); 13:22 — AC-FRM-15 NEEDS-HUMAN (R4, латинська «A»); 13:27 і 13:47 — PASS 3; 14:19 і 14:49 — PASS 2, AC-FRM-15 NEEDS-HUMAN (R4); 15:15 (`a8e3a60`, після `quoteInAria`) — PASS 3. PR #44 злито як `78173b3`.
  - 04.11 (за зауваженнями PM, `task/uat-pm-remarks`): 11:18 (`6d5dee8`) — AC-FRM-08 і AC-FRM-14 FAIL у «Дано» (R1): member2 — заявник «Secondary school», а не «Primary School», і на головній без заявок немає карток-лічильників (вада нового кроку «Дано»); 11:26 (`d774d44`, автор — member1, працівник 2 — pm-requester) — AC-FRM-08 FAIL у «Дано»: перевірка «не схвалювач жодного відділу» строгіша за AC (pm-requester схвалює інший відділ); 11:31 (`8aa25c5`, роль саме в «Primary School» з «My profile») — PASS 3; 13:22 (`018df39`, за `/code-review` PR #48: точна назва відділу й роль «Requester», повідомлення «Дано» про member1, NC узгоджено з AC-FRM-14) — **PASS 3**, фінальний.
- **Негативний контроль** (`npm run uat:nc` на `018df39`, 04.11 13:20; NC — копії AC-FRM-14 з тим самим «Дано» і `hidden`, відрізняються рівно одним навмисним місцем): NC-1 — у твердженні навмисно інший текст («You have no requests yet») → **FAIL** (R1; Haiku сказав PASS, але впалу перевірку агент не перекриває); NC-2 — у «вимозі» (`ac-text`) інший текст і кнопка «Create your first request», тест і застосунок без змін → **NEEDS-HUMAN** (R3; Haiku FAIL, Sonnet FAIL). Розбір $0.0445.
- **Рев'ю:** PR #44 — CodeRabbit (на `bc97386`) і `/code-review high 44`, таблиці P15 у коментарях PR #44, відповіді в кожному треді; рев'ю UAT від PM — https://github.com/mvorobets-blip/school-purchasing/pull/44#issuecomment-6605605356.

### Приймання PM

| AC | Рішення PM | Посилання |
|---|---|---|
| AC-FRM-08 | ✅ 3 — прийнято (у браузері під `pm-admin`, `member1`, `pm-requester`, `pm-approver`) | https://github.com/mvorobets-blip/school-purchasing/pull/44#issuecomment-6607154130 |
| AC-FRM-14 | ✅ 3 — прийнято (під `pm-approver`) | там само |
| AC-FRM-15 | ✅ 3 — прийнято (під `member1`) | там само |

Відхилень від вимог PM не знайшла. Приймання — на звіті 03.11 (PR #44) у браузері; прогін 04.11 змінив лише тести (акаунти, «Дано»), не продукт, тож поля «Рішення PM» у новому звіті порожні — повторне підтвердження PM попросили у відповіді на її зауваження (https://github.com/mvorobets-blip/school-purchasing/pull/44#issuecomment-6627659502). Її 7 зауважень (до тестів і звіту, не до продукту) закрито в PR #48.

## D. Eval рецензента

- PR з вадами (не злитий, закритий): https://github.com/mvorobets-blip/school-purchasing/pull/47 — гілка `task/refactor-purchase-helpers`, нейтральні назва, коміти й опис; ключ лежав поза репо до завершення обох рев'ю.
- Ключ і таблиця: https://github.com/mvorobets-blip/school-purchasing/pull/47#issuecomment-6628253643
- Рецензенти: CodeRabbit (профіль ASSERTIVE, `.coderabbit.yaml`, рев'ю на `21f8f96`) і `/code-review high 47` (без інтерактиву за gates-guide, `--setting-sources project`; модель **`claude-opus-5-5`**, 48 с, $0.48).

| # | Вада (ключ) | CodeRabbit | `/code-review high` |
|---|---|---|---|
| 1 | права в даних: `private.is_approver_of` — `security definer` **без** `set search_path = ''` (`supabase/migrations/20261104085250_purchase_helpers.sql:17–29`) | **знайшов** (Minor): «Restore `set search_path = ''` on `private.is_approver_of`… the PR removes an existing hardening setting» | **знайшов**: «recreates private.is_approver_of as a security definer function but drops `set search_path = ''`» |
| 2 | тести: AC-FRM-08 — перевірка рядків з `[MEMBER_2]` замість `[id]`, завжди порожньо (`tests/db/purchase.test.ts:141`) | **знайшов** (Minor): «параметр `request_id` тепер дорівнює `MEMBER_2`, а не `id` заявки… тест не покриває витік рядків» | **знайшов**: «binds MEMBER_2 (a profile UUID) as request_id… always returns 0 rows and no longer checks anything» |
| 3 | авторизація в дії: `createDepartment` — перевірка ролі **після** `insert` у `departments` (`src/app/(portal)/admin/departments/actions.ts:23`, `:31–32`) | **частково** (Minor): помітив як порядок повідомлень і применшив — «Дані не під загрозою: RLS-політика `departments_insert_admin` відхиляє вставку» | **знайшов**: «runs the authorization check… after the insert into departments, so the write happens before the action confirms the caller is an admin» |
| П | приманка: `private.is_active_user()` перевизначено без змін — `security definer` із `set search_path = ''`, правильні `revoke`/`grant` (`…_purchase_helpers.sql:4–15`) | хибної тривоги немає (коментаря немає) | хибної тривоги немає; лише слушне «the migration is a no-op» для цієї частини |

- Інші знахідки: `/code-review` — тест AC-ORG-09 перевіряє лише повідомлення, а не «запису не було» (`tests/org/create-department.test.ts:38`) — слушна; не-адміністратор бачить помилку назви замість «Not enough permissions» (`actions.ts:17`) — слушна (наслідки вади 3). CodeRabbit — інших немає. Ворота: першу версію вади 2 («видалене твердження») спіймав `fallow audit` (`weakened-tests (assertion-drop) [error]`) — її замінили, бо вада для eval має пройти CI.
- Правило, що закриває пропуск: рядок в `AGENTS.md` і те саме в `path_instructions` для `src/**` у `.coderabbit.yaml` — «перевірка прав, яку дія робить сама, — до будь-якого запису чи `rpc`… після запису — «must fix», навіть якщо RLS відхилить запис…» — https://github.com/mvorobets-blip/school-purchasing/pull/50 (злито як https://github.com/mvorobets-blip/school-purchasing/commit/60024f5). Перед злиттям — `/code-review high 50`: уточнено винятки (вхід/вихід, права з даних у функції бази), https://github.com/mvorobets-blip/school-purchasing/pull/50#issuecomment-6628312066.
- Повторний прогін (після `git merge main`, `09c5c2a`): https://github.com/mvorobets-blip/school-purchasing/pull/47#issuecomment-6629867295. CodeRabbit (`full review`) — ваду 3 тепер названо **«регресією безпеки даних»**: «`supabase.from("departments").insert({ name })` виконується на рядках 22–23 до `getCurrentUser()` і `canAccessSettings()`» (pre-merge check, Warning; нових inline немає — треди на тих самих рядках уже відкриті). `/code-review` — знайшов і послався на правило: «AGENTS.md lists this exact case as must-fix».

## Бонус

- UAT у CI (`.github/workflows/e2e.yml`, той самий Playwright на одноразовому Supabase в раннері, дані — `npm run e2e:fixtures`, лише localhost): https://github.com/mvorobets-blip/school-purchasing/pull/51 (продовження https://github.com/mvorobets-blip/school-purchasing/pull/49). Зелений прогін `workflow_dispatch` на `main` (`b19a894`): https://github.com/mvorobets-blip/school-purchasing/actions/runs/41822262360 — 7 тестів (3 входи, AC-FRM-08/14/15, прибирання), артефакт `e2e-41822262360-1`.
