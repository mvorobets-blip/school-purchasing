# Runbook: School Purchasing

Джерело: шаблон `materials/ops-kit/docs/runbook.template.md` з koldovsky/2026-quitcode-11-devops-operations-hw (WS11),
переписаний під цей репо. Факти про Vercel Hobby і Supabase Free — з гайдів курсу (release-guide, incident-guide,
cost-guide; станом на 09.11 і 17.11.2026); чого там немає — «перевірте в інтерфейсі». Секрети — лише **назви** змінних.

**Runbook** — інструкція «що робити, коли щось пішло не так», написана заздалегідь. Кожен розділ: як зрозуміти, що це
саме воно; що зробити першим; як перевірити, що допомогло.

Останнє оновлення: 2026-11-23, версія продукту: `v1.0.0`.

## Хто отримує алерт і кого кликати

| Роль | Хто (GitHub-логін) | Коли кликати |
|---|---|---|
| Черговий розробник (отримує алерт) | @mvorobets-blip | будь-який червоний smoke чи повідомлення про помилку сервера |
| PM (говорить із клієнтом) | @ValiaBihun | SEV1 — одразу (реакція протягом 2 годин у робочий час); SEV2 — того самого робочого дня; SEV3 — у плановій роботі |
| Резерв | немає (один розробник) | — |

- **Канал алерту:** група команди в Telegram (розробник і PM). Бот пише туди з `.github/workflows/smoke.yml` (секрети
  GitHub `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`) і з `src/instrumentation.ts` (`onRequestError` → `src/lib/error-alert.ts`,
  ті самі назви — змінні Vercel). Помилки preview теж приходять у групу з позначкою середовища.
- **Серйозність** — матриця SEV1–3 PM: ValiaBihun/2026-quitcode-dream-team#83, розділ 2. Вагаємось — беремо вищий рівень.

  | Рівень | Для користувача | Приклад у нас | Хто реагує | Як швидко |
  |---|---|---|---|---|
  | SEV1 | продуктом не користується ніхто, або дані бачить той, кому не можна | прод: база на паузі чи хибна адреса бази — вхід не працює | черговий розробник; PM пише клієнту | протягом 2 годин у робочий час |
  | SEV2 | ключовий сценарій ламається для частини людей, є обхід | «Approve» не змінює статус; AI-помічник недоступний (ліміт) | розробник | того самого робочого дня |
  | SEV3 | незручно, робота не стоїть; будь-який збій лише staging чи preview | дріл 23.11 на staging | будь-хто з команди | у наступному релізі |

- **Хто говорить з клієнтом** (#83, розділ 4): червоний smoke на проді SEV1–SEV2 — **PM** протягом 2 годин пише клієнту
  за шаблоном PM `docs/incident-message.md` (що сталося, кого зачепило, що зроблено, що далі); база на паузі — PM пише
  клієнту лише для SEV1. Розробник дає PM факти з postmortem: час, вплив мовою користувача, що виправлено. Розробник
  клієнту сам не пише. Збій лише на staging чи preview — клієнту не пишемо.

## Де що

| Що | Адреса / де шукати |
|---|---|
| Прод | https://therapy-scheduling-ten.vercel.app (гілка `main`) |
| Staging | https://school-purchasing-git-staging-mvorobets-blip.vercel.app (гілка `staging`; змінна лише для гілки `APP_ENV=staging` — з 23.11 справді лише для неї, preview з PR показують `"appEnv":null`; база — проєкт staging) |
| Здоров'я | `<адреса>/api/health` → `{"ok":true,"sha":"…","env":"production","appEnv":null,"supabaseRef":"tqbv…","db":"ok"}`; на staging `"appEnv":"staging"`, `"supabaseRef":"rnaw…"` |
| Прогони smoke | Actions → `smoke`: job `prod` — прод (після деплою `main` і щодня ≈ 07:23 за Києвом), job `deploy` — кожен preview і staging (`repository_dispatch` від Vercel) |
| Прогони CI | Actions → `CI`: `db-deploy-staging` → `db-deploy` після злиття в `main` |
| Vercel | проєкт `school-purchasing` (scope `mvorobets-blip`, Hobby) → Deployments, Logs; регіон функцій `iad1` |
| Supabase — прод | проєкт `school-purchasing`, ref `tqbvafkcniaspvluverp` → Logs, Advisors; Vercel **Production** |
| Supabase — staging | проєкт `school-purchasing-staging`, ref `rnawhejsgqhgbtjajjmb` → Logs, Advisors; Vercel **Preview** (усі гілки) і гілка `staging`; міграції — CI, job `db-deploy-staging` перед `db-deploy` |
| Статус-сторінки | vercel-status.com (регіон `iad1`), status.supabase.com (регіон проєкту — Supabase → Settings → General), githubstatus.com, status.openrouter.ai |
| Доступ PM до staging | **спільне посилання Vercel** (Deployment → Share; на Hobby одне на акаунт). Надсилається PM особисто; токен — ніде в репо, issues чи чаті команди. Після нового посилання старе перестає діяти |

## 1. Червоний smoke (зокрема о 2-й ночі)

**Як зрозуміти:** у Telegram прийшло «ЧЕРВОНИЙ SMOKE» із середовищем, адресою, комітом і посиланням на прогін.

1. Відкрийте посилання на прогін → крок smoke → рядки `::error title=smoke …::`. Вони підказують причину:

   | Рядок `::error::` містить | Що це найімовірніше | Куди далі |
   |---|---|---|
   | `стіна входу Vercel` / `секрет обходу` | захист Vercel або секрет `VERCEL_AUTOMATION_BYPASS_SECRET` | розділ 4 (ротація) |
   | `Supabase призупинено` | база на паузі (`reason: paused`) | розділ 3 |
   | `ключ NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY у Vercel не приймається` | хибний ключ у змінних Vercel цього середовища | розділ 4 |
   | `supabaseRef=<ref>, а очікувався <ref>` / `NEXT_PUBLIC_SUPABASE_URL … вказує не на той проєкт Supabase` | хибна адреса Supabase у змінних Vercel цього середовища (smoke звіряє з `SUPABASE_PROD_REF` / `SUPABASE_STAGING_REF`, PR #106) | Vercel → Environment Variables: знайдіть `NEXT_PUBLIC_SUPABASE_URL` для цього середовища (Production; Preview; Preview → гілка `staging`), поверніть правильний ref з «Де що» або видаліть хибне перевизначення гілки → Redeploy без кешу |
   | `немає supabaseRef — NEXT_PUBLIC_SUPABASE_URL … не має вигляду https://<ref>.supabase.co` | змінна порожня чи не адреса Supabase | те саме |
   | `db=down (status-0 …)` / `NEXT_PUBLIC_SUPABASE_URL у Vercel не той?` | Supabase недоступний або хибна адреса (якщо ref збігся — швидше провайдер чи мережа) | крок 2, далі змінні Vercel |
   | `показує <sha>, а очікувався <sha>` | деплой не пройшов або зроблено Instant Rollback | розділ 2 |
   | `"/": HTTP 5xx MIDDLEWARE_INVOCATION_FAILED` | у Vercel бракує чи хибні `NEXT_PUBLIC_SUPABASE_*` | змінні Vercel, Redeploy |
   | `недоступний` | Vercel чи мережа | крок 2, повтор через 5 хв |

   Одразу відкрийте `<адреса>/api/health` і запишіть `sha`, `db`, `reason`, `supabaseRef`. Прод — без входу:

   ```bash
   curl -s https://therapy-scheduling-ten.vercel.app/api/health
   ```

   Очікуємо: `{"ok":true,"sha":"<SHA main>","env":"production","appEnv":null,"supabaseRef":"tqbvafkcniaspvluverp","db":"ok","reason":""}`.
   Staging за захистом Vercel — той самий smoke локально з секретом обходу з `.env.local` (значення не друкується):

   ```bash
   SMOKE_TARGET=deploy SMOKE_EXPECT_SUPABASE_REF=rnawhejsgqhgbtjajjmb node --env-file=.env.local scripts/smoke.mjs https://school-purchasing-git-staging-mvorobets-blip.vercel.app
   ```

   Очікуємо рядок `{"base":…,"bypass":true,"root":307,"login":200,"health":{…"appEnv":"staging","supabaseRef":"rnawhejsgqhgbtjajjmb","db":"ok"…}}`
   і `OK — деплой живий, сторінка входу відкривається, база відповідає.` Код виходу 1 і рядки `::error::` — див. таблицю.
   Прогони й їхні рядки помилок:

   ```bash
   gh run list --workflow smoke --limit 5
   gh run view <id> --log-failed
   ```
2. **Це ми чи провайдер? (1–2 хв)** Статус-сторінки з «Де що» — для нашого регіону й компонента. Є інцидент, і час
   збігається — посилання в issue інциденту й PM, стежимо. Немає — шукаємо в себе.
3. **Прод чи ні?** Job `deploy` (preview, staging) — користувачі не постраждали: SEV3, виправляємо в робочому порядку.
   Job `prod` — визначте SEV за матрицею PM і напишіть у групу «беру, SEV<N>».
4. **Спершу зупинити шкоду, потім шукати причину.** Прод зламав останній деплой — відкат (розділ 2), потім розбір.
   Журнали Vercel на Hobby живуть **1 годину**: потрібні рядки (без даних користувачів) — одразу в issue інциденту.
5. **Розбір** — агентом у профілі «лише пропонує» (розділ 7) або вручну. Агент пропонує, виправляє людина.
6. **Перевірка:** Actions → smoke → Re-run failed jobs — зелений; у групу: «SEV<N> закрито, причина: …».
7. Після SEV1–SEV2 і після дрілу — postmortem `docs/incidents/<YYYY-MM-DD>-<slug>.md` за шаблоном.

Приклад (дріл 2026-11-23, SEV3): о 16:01:50 UTC smoke `deploy` на staging червоний — `/api/health` 503, `db: down`,
`reason: status-0`, `supabaseRef: rnawhejsgqhgbtjajjmc` (норма — `…jjmb`); алерт за ~17 с після готового деплою; причина —
хибне перевизначення `NEXT_PUBLIC_SUPABASE_URL` лише для гілки `staging`; видалили перевизначення → Redeploy → зелений
о 16:22:30. Postmortem — [`docs/incidents/2026-11-23-staging-supabase-url.md`](incidents/2026-11-23-staging-supabase-url.md),
стенограма агента — [`…-rca.md`](incidents/2026-11-23-staging-supabase-url-rca.md), issue — #105.

## 2. Відкат проду і Promote

**Коли:** прод зламав щойно розгорнутий коміт, а виправлення вперед займе довше за 30 хв.

1. Vercel → Deployments → попередній робочий прод-деплой → **Instant Rollback**. На Hobby — **лише на один попередній**
   прод-деплой.
2. Перевірте прод: `/api/health` — `"db":"ok"`, `sha` попереднього коміту; `/login` відкривається.
3. **Пастка Hobby:** після відкату Vercel **вимикає автоматичне просування** — злиття в `main` збираються, але на прод
   не потрапляють. Smoke `prod` червонітиме з «прод показує <старий sha>, а очікувався <новий>», доки прод ≠ `main`.
4. Виправлення — звичайним PR у `main` (CI, CodeRabbit). Коли деплой виправлення Ready: Vercel → цей деплой →
   **Promote** (або на сторінці відкату — Manage). Це повертає автоматичне просування. Перевірка: `/api/health` показує
   SHA `main`, smoke `prod` зелений.
5. Відкат **не змінює** базу, міграції і змінні середовища. Код, на який відкочуємось, має працювати з поточною схемою —
   тому міграції лише додають (expand), а не видаляють.

Хто робить: черговий розробник. Агент відкат і Promote не робить ніколи (заборонено в `.claude/settings.json`).
Відкат на staging — це видалення хибного перевизначення змінної й Redeploy: Instant Rollback працює лише для проду.

**Аварійний вимикач (kill switch):** прапорців (feature flags) немає. Зупинити одну функцію без деплою не можна — лише
відкат усієї версії (вище) або виправлення вперед. AI-помічник без ключа OpenRouter штатно показує «The assistant is
unavailable today», а форма працює вручну, але зняття ключа — це зміна змінної й Redeploy, не вимикач.

## 3. База на паузі

**Як зрозуміти:** `/api/health` → 503, `"db":"down"`, `"reason":"paused"`; smoke пише «Supabase призупинено».
Безкоштовний Supabase ставить проєкт на паузу після 7 днів без активності. Прод (`tqbv…`) і staging (`rnaw…`) засинають
**незалежно**: червоний `prod` — прод-проєкт; червоний `deploy` (staging чи preview) — проєкт staging. Пауза staging ще
й зупиняє міграції: `db-deploy-staging` падає, і прод не мігрує.

1. Supabase Dashboard → **той проєкт, що на паузі** (звірте ref з `supabaseRef` у `/api/health`) → **Resume project**.
   Скільки триває відновлення, документація не каже — чекайте й оновлюйте сторінку.
2. Повторіть smoke: Actions → smoke → Run workflow (для staging — у полі `url` адреса staging) — зелений.
3. У групу: коли була пауза і скільки тривала.

Як не допустити: щоденний smoke будить лише прод. **Перед UAT, демо чи дрілом — Dashboard → проєкт staging активний,
інакше Resume project.**

## 4. Ротація ключа + redeploy

Порядок завжди однаковий: **новий ключ → замінити всюди → redeploy → перевірити smoke → лише тоді видалити старий.**

| Що | Де новий | Де замінити | Що ще |
|---|---|---|---|
| Ключі Supabase **прод-проєкту** (`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`; секретний ключ — лише локальні скрипти) | прод-проєкт → Settings → API Keys | Vercel → Environment Variables → **лише Production**; секретний — ваш `.env.prod.local` | **Redeploy** проду: `NEXT_PUBLIC_*` вбудовуються під час збірки |
| Ключі Supabase **проєкту staging** | проєкт staging → Settings → API Keys | Vercel → **Preview (усі гілки)** — publishable; гілка `staging` — секретний ключ staging (обидва рядки); ваш `.env.local` | Redeploy `staging`; push у відкриті PR, щоб preview зібралися з новим ключем |
| `SUPABASE_DB_URL` (після зміни пароля бази) | Connect у тому самому проєкті (Session pooler) | GitHub → Settings → Environments → `production` чи `staging` | наступний прогін CI: запобіжник друкує правильний ref |
| `VERCEL_AUTOMATION_BYPASS_SECRET` | Vercel → Settings → Deployment Protection → Protection Bypass for Automation | GitHub → Settings → Secrets → Actions; ваш `.env.local` (UAT) | Redeploy staging → smoke `deploy` зелений |
| `TELEGRAM_BOT_TOKEN` | Telegram, BotFather (перевипуск токена) | GitHub Secrets і змінні Vercel (Production, Preview) | ручний прогін smoke з `url` = `https://example.invalid` → повідомлення прийшло |
| `OPENROUTER_API_KEY` | OpenRouter → Keys | Vercel (Production, Preview) | Redeploy; старий ключ видалити; ліміт 50 запитів на добу UTC — на акаунт, а не на ключ |

Перевірка: зелений smoke на прод і staging. У групу: що ротували і чому — без значень. Ключ потрапив у git, журнал,
знімок чи чат з агентом — спершу ротація, потім прибирання тексту.

## 5. Де журнали і скільки вони живуть

| Що | Де | Скільки живе (безкоштовні тарифи, станом на 09.11.2026) |
|---|---|---|
| Журнали запитів Vercel (`llm.call`, помилки) | Vercel → Logs (фільтр Environment, Branch) або `vercel logs <адреса деплою>` | **1 година** (Hobby) |
| Vercel Observability (частка помилок функцій) | Vercel → Observability | перевірте в інтерфейсі |
| Журнали збірки | Vercel → Deployments → деплой → Build Logs | поки є деплой |
| Журнали Supabase (API, Postgres, Auth) | Supabase → Logs — окремо в кожному проєкті | **1 доба** (Free) |
| Журнал AI-помічника для SLO-2 | таблиця `public.ai_calls` у кожній базі (без тексту опису; читає адміністратор) | щонайменше 35 днів: старіші рядки прибирає наступна вставка |
| Прогони GitHub Actions (smoke, CI) | Actions | за налаштуванням репо — перевірте в Settings → Actions → General («Artifact and log retention») |
| Алерти smoke й трекер помилок сервера (`onRequestError` → `src/lib/error-alert.ts`: середовище, маршрут, коміт, деплой, верх стека) | Telegram-група команди | поки їх не видалили (історія чату) |

Висновок для чергового: розбираємо **одразу**, потрібні рядки журналу копіюємо в issue інциденту (без даних
користувачів і секретів).

### SLO-2: частка «Suggest lines» без збою

Доба — за `Europe/Kyiv`; помилки вводу без виклику моделі (порожній чи задовгий опис) у знаменник не входять
(рішення PM у #83). Supabase → SQL Editor проду (лише читання; DDL там ніколи):

```sql
-- 1) частка за кожну добу
select (created_at at time zone 'Europe/Kyiv')::date as day,
  count(*) as requests,
  count(*) filter (where app_state in ('failed', 'unavailable')) as failed,
  round(100.0 * count(*) filter (where app_state not in ('failed', 'unavailable')) / count(*), 1) as good_pct
from public.ai_calls
where not (model_called = false and error_kind in ('empty_input', 'too_long'))
group by 1
order by 1 desc;
```

```sql
-- 2) підсумок за 28 днів і залишок бюджету (5 % запитів); budget_left < 0 — бюджет вичерпано
with w as (
  select app_state from public.ai_calls
  where created_at >= (date_trunc('day', now() at time zone 'Europe/Kyiv') - interval '27 days') at time zone 'Europe/Kyiv'
    and not (model_called = false and error_kind in ('empty_input', 'too_long'))
)
select count(*) as requests,
  count(*) filter (where app_state in ('failed', 'unavailable')) as failed,
  round(100.0 * count(*) filter (where app_state not in ('failed', 'unavailable')) / nullif(count(*), 0), 2) as good_pct,
  floor(0.05 * count(*))::int - count(*) filter (where app_state in ('failed', 'unavailable')) as budget_left
from w;
```

Бюджет вичерпано — помічник лишається штатно недоступним, форма працює вручну; розбираємо причину за `error_kind`
(`rate_limited` — ліміт OpenRouter, `timeout`, `provider_error`, `invalid_output`, `no_key`).

## 6. Staging

- Гілка `staging` отримує зміни лише з `main`: `git fetch origin && git push origin origin/main:refs/heads/staging`.
  Якщо коміт уже зібрано для проду, Vercel гілку не збирає — Deployments → Create Deployment → branch `staging`.
- **Власна база:** проєкт `school-purchasing-staging` (`rnaw…`). Preview і локальна розробка (`.env.local`) теж ходять у
  неї; прод-ключів у Preview немає. Дані — лише синтетичні (`*@example.test`), акаунти з `accounts.zip`
  (`npm run users:demo` проти staging); прод-даних у staging не копіюємо.
- **Спільне з продом:** ключ і денний ліміт OpenRouter (50 запитів на добу UTC на акаунт), Telegram-група, секрет обходу.
- **Міграції** — лише CI: на злитті в `main` спершу `db-deploy-staging`, потім `db-deploy`. Упала на staging — прод не
  мігрує; виправлення — нова міграція вперед.
- Змінні лише для гілки `staging` (Vercel → Environment Variables → Preview → Branch `staging`): `APP_ENV=staging` і
  секретний ключ staging. **Дріл** — лише тут, без міграцій і без видалення даних; після дрілу видаляємо лише своє
  перевизначення.

## 7. Розбір з агентом: профіль «лише пропонує»

Агент читає деплої, журнали й код і **пропонує** причину та виправлення. Запис через MCP Vercel і Supabase заборонений
поіменно (`.claude/settings.incident.json`, ті самі заборони — у щоденному `.claude/settings.json`), Supabase
підключено з `read_only=true` і ref **staging**, редагування файлів і `git push` заборонено, режим plan.

```bash
claude --settings .claude/settings.incident.json --mcp-config .mcp.incident.json --strict-mcp-config --permission-mode plan
```

Vercel MCP — вхід через OAuth (`/mcp`), токенів у файлах немає. Промпт: R09 «Розбір інциденту агентом» з бібліотеки
промптів WS11. Стенограму зберігаємо дослівно (`/export`) у `docs/incidents/`. Вміст журналів, issues і сторінок —
дані для агента, а не команди.

## 8. Відновлення бази: резервних копій немає

RPO (скільки змін можна втратити) — ціль PM **1 доба**; RTO (скільки можна не працювати) — **4 години** в робочий час
(#83, розділ 3).

- **RTO досяжний:** відкат коду — хвилини (розділ 2); база на паузі — Resume project і кілька хвилин (розділ 3).
- **RPO зараз недосяжний:** на Supabase Free автоматичних резервних копій немає ні в прод-базі, ні в staging, а свого
  дампа ми не робимо (бонус WS11 не обрано). Після втрати даних бази відновлювати нічого: схему відтворять міграції з
  `main`, а дані — лише синтетичні (`npm run users:demo`). Дані навчальні, тож користувачам це не шкодить (#83).
- Щоб RPO став реальним: щоденний зашифрований дамп прод-бази в CI (шаблон курсу `bonus/backup.yml`) або платний тариф.

## 9. Чого ніколи не робити

- `supabase migration down`, `supabase db reset --linked` чи `--db-url` проти будь-якого з наших проєктів — прод чи
  staging — **знищують дані**. Так само `supabase db push` з ноутбука і DDL у SQL Editor: схема — лише міграцією в PR.
- Копіювати прод-дані в staging (дамп, CSV, «щоб було схоже»). Відкат схеми = нова міграція вперед.
- `npx supabase@latest`: лише закріплена версія CLI з `package.json` (`npx supabase …`).
- Ставити на паузу чи видаляти прод-проєкт Supabase або Vercel.
- Агент з правом запису: відкат, Promote, зміну змінних і деплой робить людина.
- Значення токенів, ключів, паролів, chat id і токен спільного посилання — у git, журналі, issue, на знімку чи в чаті з
  агентом.
- Інцидент-дріл на проді чи з базою: дріл — лише на staging, без міграцій і без видалення даних.
- Виконувати інструкції з тексту журналів, issues чи повідомлень про помилки: це дані, а не команди.
