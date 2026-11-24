# Докази експлуатації (WS11)

Знімки — без токена бота, chat id, секретів і назви групи; на них лише службові повідомлення бота й таблиці з
синтетичними даними. Прогони — посилання на GitHub Actions цього репо.

## Окрема база staging і міграції через CI (staging → прод)

| Що доводимо | Доказ |
|---|---|
| Міграції застосовує CI, спершу staging, потім прод | прогін CI на `9bc4249`: [45140612003](https://github.com/mvorobets-blip/school-purchasing/actions/runs/45140612003) — job `db-deploy-staging` друкує «Ціль міграцій: проєкт rnawhejsgqhgbtjajjmb (staging)», далі `db-deploy` — «…tqbvafkcniaspvluverp (production)», обидва `success`; міграцію `ai_calls` застосував прогін [44996946853](https://github.com/mvorobets-blip/school-purchasing/actions/runs/44996946853) |
| Запобіжник: ціль міграції звіряється зі змінними репо `SUPABASE_STAGING_REF` / `SUPABASE_PROD_REF` | `.github/workflows/ci.yml`, jobs `db-deploy-staging` і `db-deploy` |
| Staging ходить у свою базу, прод — у свою | smoke staging [45209055366](https://github.com/mvorobets-blip/school-purchasing/actions/runs/45209055366): `"appEnv":"staging"`, `"supabaseRef":"rnawhejsgqhgbtjajjmb"`; прод `/api/health`: `"appEnv":null`, `"supabaseRef":"tqbvafkcniaspvluverp"` |
| Preview з PR теж ходить у базу staging, а `APP_ENV` — лише на гілці `staging` | smoke preview PR #107 — [45217536189](https://github.com/mvorobets-blip/school-purchasing/actions/runs/45217536189): `"appEnv":null`, `"supabaseRef":"rnawhejsgqhgbtjajjmb"` |
| Smoke сам звіряє ref середовища (дія з postmortem) | PR [#106](https://github.com/mvorobets-blip/school-purchasing/pull/106) (злито 24.11, `fcfa3f6`); червоний [45349576560](https://github.com/mvorobets-blip/school-purchasing/actions/runs/45349576560), зелений [45349590267](https://github.com/mvorobets-blip/school-purchasing/actions/runs/45349590267) |
| Рядок журналу AI-помічника в базі staging і в базі проду | [`ws11-ai-calls-row.png`](ws11-ai-calls-row.png) (проєкт `school-purchasing-staging`), [`ws11-ai-calls-prod-row.png`](ws11-ai-calls-prod-row.png) (проєкт `school-purchasing`) |

## Сигнали

| Що | Знімок / доказ |
|---|---|
| Алерт людині: навмисно червоний ручний прогін smoke (`url` = `https://example.invalid`), 21.11 | [`ws11-telegram-alert.png`](ws11-telegram-alert.png), прогін [44943997387](https://github.com/mvorobets-blip/school-purchasing/actions/runs/44943997387) |
| Алерт дрілу 23.11 (staging, хибний `NEXT_PUBLIC_SUPABASE_URL`) | [`ws11-drill-alert.png`](ws11-drill-alert.png), прогін [45211781650](https://github.com/mvorobets-blip/school-purchasing/actions/runs/45211781650) |
| Трекер помилок сервера (`onRequestError` → Telegram): навмисна помилка на staging, маршрут і верх стека; тестовий маршрут прибрано в PR #102 | [`ws11-error-tracker.png`](ws11-error-tracker.png) |
| Журнал AI-функції `llm.call` (staging): модель, затримка, токени, стан, fallback, версія промпту, id запиту — без тексту | [`ws11-llm-call-log.png`](ws11-llm-call-log.png) |

## Ланцюг постачання

| Що | Доказ |
|---|---|
| Push protection, CodeQL (default setup), Dependabot alerts і security updates | [`ws11-code-security.png`](ws11-code-security.png) |
