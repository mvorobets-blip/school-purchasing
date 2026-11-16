import { createOpenRouter } from "@openrouter/ai-sdk-provider";

// Кандидати на 04.11.2026 (OpenRouter GET /api/v1/models). Безкоштовні моделі з'являються й зникають:
// перед роботою запустіть `npm run ai:models` і перевірте ланцюжок живим прогоном `npm run eval`.
// Порядок = пріоритет. Лише ID із `:free`: платна модель у списку fallback оплачується за її ціною.
//   gemma-4-31b / gemma-4-26b — найкраща заявка на багатомовність і швидкі; НЕ мають structured_outputs: поля
//     повторено в промпті, а zod — ворота. Правопис назви (на проді 16.11 — «Папер А4») виправляє промпт line-v3.
//   nemotron-3.5-super-vl     — строга схема (structured_outputs); запасна: 16.11 о 13:10 UTC не відповіла за 15 с
//     (evals/reports/2026-11-16T13-10-32-724Z.md), тож першою її не ставимо. Порядок перевіряє живий eval.
export const PRODUCT_MODELS = [
  "google/gemma-4-31b-it:free",
  "google/gemma-4-26b-a4b-it:free",
  "nvidia/nemotron-3.5-super-vl:free",
] as const;

// Судді-моделі немає: назву й мету golden cases PM перевіряє код правилом «містить» (src/lib/ai/scorer.ts, ADR 0004).

// Фабрики приймають ключ параметром і НЕ читають process.env: так їх можна імпортувати в eval-скрипті.
// У коді застосунку модель бере лише src/lib/ai/openrouter.ts (server-only).
export function makeProductModel(apiKey: string | undefined) {
  const openrouter = createOpenRouter({ apiKey, appName: "School purchasing - line assistant" });
  return openrouter.chat(PRODUCT_MODELS[0], {
    // OpenRouter пробує наступну модель при помилці, ліміті постачальника або простої.
    // Платформний ліміт безкоштовних моделей (20/хв, 50/день на акаунт) ланцюжок НЕ обходить.
    models: [...PRODUCT_MODELS],
    // Без provider.require_parameters: з ним OpenRouter може відкинути Gemma (немає structured_outputs).
    // PDF без нативної підтримки за замовчуванням іде в ПЛАТНИЙ mistral-ocr; cloudflare-ai — безкоштовний.
    plugins: [{ id: "file-parser", pdf: { engine: "cloudflare-ai" } }],
    // Портативний параметр `reasoning` з AI SDK 7 цей провайдер не передає — лише його власний.
    // effort "none" (16.11): з "low" Nemotron двічі не встигала за 15 с на GC-01 (AC-AI-04 обриває запит) —
    // evals/reports/2026-11-16T13-10-32-724Z.md, 2026-11-16T13-16-15-326Z.md. Одна пропозиція рядка роздумів не потребує.
    reasoning: { effort: "none", exclude: true },
  });
}

