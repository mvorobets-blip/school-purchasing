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
- Акаунти на проді (усі `*@example.test`, паролі — лише в `accounts.zip`): працівник 1 — `pm-requester@example.test`; працівник 2 і працівник 3 — `member2@example.test` (заявник того самого відділу, що й працівник 1, без поданих заявок, не схвалювач). Усі 3 AC на проді лише читають: FRM-15 закупівлю не подає.

## A. Ворота

- PR воріт: <!-- …/pull/N -->
- Зелений `quality` на `main`: <!-- …/actions/runs/N -->
- Обов'язкові перевірки в `solo-main` з <!-- дата -->: <!-- назви jobs -->

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

| AC | Де живе правило | Рівень | Чому | Тест |
|---|---|---|---|---|
| AC-…-NN | <!-- політика / функція бази / TS-модуль / сторінка --> | <!-- unit / база (PGlite) / e2e --> | … | <!-- …/blob/<sha>/tests/…#L<N> --> |

### Покриття

| Файл за AC | Рядки | Гілки | Чим доведено, якщо 0 % |
|---|---|---|---|
| <!-- src/lib/<модуль>.ts --> | … % | … % | — |
| <!-- src/app/<сторінка>/page.tsx --> | 0 % | 0 % | <!-- e2e: tests/e2e/….spec.ts --> |

### Доказ мутацією

| Мутант (файл:рядок, що змінено) | AC під загрозою | До | Тест, посилений з тексту AC | Після |
|---|---|---|---|---|
| <!-- src/lib/…/x.ts:14 `<=` → `<` --> | AC-…-NN | вижив | <!-- …/blob/<sha>/tests/…#L<N>: межа «…» з AC --> | убитий |

- Stryker: <!-- score до → після, посилання на PR з виводом -->
- SQL-мутації (`npm run mutation:sql`): <!-- таблиця з npm run mutation:sql -- --markdown (KILLED / SURVIVED / ERROR) з PR або «немає PGlite-гарнесу» -->
- Еквівалентні мутанти: <!-- який і чому (рядок міграції чи коду, що робить його еквівалентним) або «немає» -->

## C. UAT на проді

| AC | Специфікація | Тест (твердження) | Агент | Вердикт | Кадр |
|---|---|---|---|---|---|
| AC-FRM-08 | [tests/e2e/purchase.spec.ts:42](https://github.com/mvorobets-blip/school-purchasing/blob/6035e9e/tests/e2e/purchase.spec.ts#L42) | passed | Haiku: NEEDS-HUMAN → Sonnet: PASS | **PASS** (R6) | `docs/qa/uat/2026-11-03/frames/AC-FRM-08-then-1.png` |
| AC-FRM-14 | [tests/e2e/purchase.spec.ts:86](https://github.com/mvorobets-blip/school-purchasing/blob/6035e9e/tests/e2e/purchase.spec.ts#L86) | passed | Haiku: NEEDS-HUMAN → Sonnet: PASS | **PASS** (R6) | `docs/qa/uat/2026-11-03/frames/AC-FRM-14-then-1.png` |
| AC-FRM-15 | [tests/e2e/purchase.spec.ts:117](https://github.com/mvorobets-blip/school-purchasing/blob/6035e9e/tests/e2e/purchase.spec.ts#L117) | passed | Haiku: FAIL → Sonnet: PASS | **PASS** (R6) | `docs/qa/uat/2026-11-03/frames/AC-FRM-15-then-1.png` |

- Звіт: `docs/qa/uat/2026-11-03/report.md` (+ `manifest.json`, `frames/`) — прогін 03.11.2026, 13:47 (Київ), прод https://therapy-scheduling-ten.vercel.app, `/api/health` — коміт `152825c`; код тестів — `task/uat` @ `6035e9e` (позначка «+ незакомічені зміни» у звіті — лише незакомічені на момент прогону тека попереднього звіту `docs/qa/uat/`, рядок `/api/health` у цьому proof pack і локальний `fallow-baseline.txt`; код тестів і матриця — у коміті).
- Відео: вкладення в описі PR UAT (3 файли `video.webm`); трас і HTML-звіту в git немає.
- Рецензент: `claude-haiku-5-5`, суперечки — `claude-sonnet-5-5`; промпт і схема — з `materials/uat` без змін; вартість розбору $0.0968 (за цінами API, у межах підписки).
- Історія прогонів 03.11 (вердикти руками не правили): 12:58 — AC-FRM-15 NEEDS-HUMAN (R3): специфікація знімала кадр «Тоді» після переходу на «My requests» — вада тесту, виправлено (перевірка «не подано» — в окремій вкладці); 13:22 — AC-FRM-15 NEEDS-HUMAN (R4): агент процитував «Папір A4» латинською «A», а на сторінці кирилична «А»; 13:27 (після коміту матриці) — PASS 3; 13:47 (фінальний, після виправлень за незалежною перевіркою: заявка FRM-08 — лише у відділі «Primary School», як у «Дано»; повідомлення шукаємо за роллю `alert` у `main`) — PASS 3.
- Негативний контроль (`npm run uat:nc` на `6035e9e`, 13:45; `tests/e2e/negative-controls.spec.ts`, AC-FRM-14): NC-1 — у твердженні навмисно інший текст («You have no requests yet») → **FAIL** (R1; Haiku сказав PASS — на екрані справжній текст, — але впала перевірка агент не перекриває); NC-2 — у «вимозі» (анотація `ac-text`) інший текст і кнопка, тест і застосунок без змін → **NEEDS-HUMAN** (R3; Haiku NEEDS-HUMAN → Sonnet FAIL). Рядки звіту — в описі PR.
- Дані: лише читання — жоден тест нічого не подає; «Прибирання»: синтетичних `uat-*@example.test` видалено 0, лишилось 0. Акаунти — `pm-requester@example.test` (працівник 1), `member2@example.test` (працівник 2/3).

### Приймання PM

| AC | Рішення PM | Посилання |
|---|---|---|
| AC-…-NN | <!-- ✅ / ❌ / NEEDS-HUMAN → … --> | <!-- коментар-підпис або issue «Відхилення від вимог» --> |

## D. Eval рецензента

- PR з вадами (не злитий): <!-- …/pull/N -->
- Ключ і таблиця: <!-- …/pull/N#issuecomment-M -->

| # | Вада (ключ) | CodeRabbit | `/code-review high` |
|---|---|---|---|
| 1 | <!-- категорія і файл:рядок --> | <!-- знайшов / пропустив + цитата --> | <!-- знайшов / пропустив + цитата --> |
| 2 | … | … | … |
| 3 | … | … | … |
| П | приманка: <!-- що --> | <!-- хибна тривога? цитата --> | <!-- хибна тривога? цитата --> |

- Інші знахідки: <!-- слушна / шум, по рядку на кожну -->
- Правило, що закриває пропуск: <!-- рядок в AGENTS.md чи path instruction, …/commit/<sha> -->
- Повторний прогін: <!-- хто, результат, цитата, …/pull/N#issuecomment-M -->
