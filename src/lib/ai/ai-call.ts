// Один запит «Suggest lines» → один рядок журналу llm.call (Runtime Logs Vercel, 1 год на Hobby) і один рядок
// public.ai_calls (база, 35 днів) — джерело SLO-2 PM ValiaBihun/2026-quitcode-dream-team#83 (WS11, трек B).
// Лише факти без тексту: стан, модель, затримка, токени, код причини, версія промпту, id запиту. Опису користувача,
// промпту й відповіді моделі тут немає — функція їх навіть не отримує.
// Запис у базу не має ламати відповідь людині: збій вставки — лише окрема подія журналу з кодом помилки Postgres.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { logEvent } from "@/lib/log";
import { isFallback, llmStateOf, logLlmCall, type AppState } from "./llm-log";
import { PRODUCT_MODELS } from "./models";
import { LINE_PROMPT_VERSION } from "./prompts/line";
import type { SuggestResult, SuggestTrace } from "./suggest";

export const SUGGEST_ROUTE = "/requests/new";

export type SuggestCall = {
  requestId: string;
  latencyMs: number;
  result: SuggestResult;
  trace: SuggestTrace;
};

/** Дані виклику → поля рядка (спільні для журналу й таблиці). Модель — та, що відповіла, інакше перша в ланцюжку. */
export function describeCall({ requestId, latencyMs, result, trace }: SuggestCall) {
  const appState: AppState = result.state;
  const primary = PRODUCT_MODELS[0];
  const answered = trace.modelCalled && result.modelId && result.modelId !== "unknown" ? result.modelId : undefined;
  return {
    requestId,
    appState,
    state: llmStateOf(appState),
    model: answered ?? primary,
    fallbackUsed: answered ? isFallback(answered, primary) : false,
    modelCalled: trace.modelCalled,
    latencyMs: Math.max(0, Math.round(latencyMs)),
    inputTokens: trace.inputTokens,
    outputTokens: trace.outputTokens,
    errorKind: trace.errorKind,
    promptVersion: LINE_PROMPT_VERSION,
  };
}

/** Пише рядок llm.call і вставляє рядок ai_calls від імені користувача (RLS: лише свій рядок). */
export async function recordSuggestCall(call: SuggestCall, supabase: SupabaseClient<Database>): Promise<void> {
  const d = describeCall(call);
  logLlmCall({ ...d, route: SUGGEST_ROUTE });
  const { error } = await supabase.from("ai_calls").insert({
    request_id: d.requestId,
    state: d.state,
    app_state: d.appState,
    error_kind: d.errorKind ?? null,
    model: d.model,
    fallback_used: d.fallbackUsed,
    model_called: d.modelCalled,
    latency_ms: d.latencyMs,
    input_tokens: d.inputTokens ?? null,
    output_tokens: d.outputTokens ?? null,
    prompt_version: d.promptVersion,
  });
  if (error) {
    // Лише код Postgres/PostgREST (напр. 42501), не error.message: повідомлення може містити значення рядка.
    logEvent("ai_calls.insert_failed", { requestId: d.requestId, code: error.code }, { requestId: "token", code: "token" }, "warn");
  }
}
