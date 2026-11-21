import { APICallError, NoObjectGeneratedError, Output, RetryError, generateText, type LanguageModel } from "ai";
import { MESSAGES } from "@/lib/org/messages";
import { AI_TEXT } from "./messages";
import { LINE_INSTRUCTIONS, wrapDocument } from "./prompts/line";
import { checkLine, looksLikeInjection, type FormLine } from "./rules";
import { LineSuggestionSchema, type LineSuggestion } from "./schema";

// Чиста функція: модель передають параметром (застосунок — src/lib/ai/openrouter.ts, тести — MockLanguageModelV4).
// Без process.env і без "server-only", тож її імпортують тести й живий eval. Модель нічого не пише: результат лише
// заповнює форму, подає її людина (AC-AI-01).

export type SuggestResult =
  | { state: "line"; line: FormLine; modelId: string }
  | {
      state: "off_topic" | "injection" | "invalid" | "failed" | "unavailable";
      message: string;
      issue?: "quantity" | "price";
      modelId?: string;
    };

export type SuggestOptions = { timeoutMs?: number; maxRetries?: number };

// Що сталося з викликом (WS11, журнал llm.call і таблиця ai_calls): лише факти без тексту — чи викликали модель, токени
// й КОД причини збою (не текст повідомлення: у ньому може бути текст користувача чи відповідь постачальника).
export type SuggestTrace = {
  modelCalled: boolean;
  inputTokens?: number;
  outputTokens?: number;
  errorKind?: "no_key" | "empty_input" | "too_long" | "rate_limited" | "timeout" | "invalid_output" | "empty_output" | "provider_error";
};

// 15 секунд чекання відповіді до повідомлення (AC-AI-04, припущення PM у #71).
export const SUGGEST_TIMEOUT_MS = 15_000;

const failed = (): SuggestResult => ({ state: "failed", message: AI_TEXT.failed });
const unavailable = (): SuggestResult => ({ state: "unavailable", message: AI_TEXT.unavailable });

export async function proposeLine(text: string, model: LanguageModel | null, opts: SuggestOptions = {}): Promise<SuggestResult> {
  return (await proposeLineTraced(text, model, opts)).result;
}

/** proposeLine + факти виклику для журналу (WS11). Поведінка для людини та сама: result — той самий SuggestResult. */
export async function proposeLineTraced(
  text: string,
  model: LanguageModel | null,
  opts: SuggestOptions = {},
): Promise<{ result: SuggestResult; trace: SuggestTrace }> {
  const early = precheck(text, model);
  if (early || !model) {
    const result = early ?? unavailable();
    return { result, trace: { modelCalled: false, errorKind: earlyErrorKind(result, model) } };
  }
  const answer = await askModel(text, model, opts);
  if ("state" in answer) return { result: answer, trace: { modelCalled: true, errorKind: answer.errorKind } };
  const result = interpret(answer.suggestion, answer.modelId);
  const trace: SuggestTrace = { modelCalled: true, inputTokens: answer.inputTokens, outputTokens: answer.outputTokens };
  if (result.state === "failed") trace.errorKind = "empty_output";
  return { result, trace };
}

function earlyErrorKind(result: SuggestResult, model: LanguageModel | null): SuggestTrace["errorKind"] {
  if (result.state === "injection") return undefined; // відмова, не збій
  return model ? "empty_input" : "no_key";
}

// Перевірки до виклику моделі: вказівки в описі — одразу відмова (AC-AI-06) за будь-якого стану, зокрема без ключа, тож
// «ігноруй інструкції» не дає рядка з жодною моделлю; немає ключа — «недоступний сьогодні» (технічний запасний шлях,
// не AC); порожній опис — збій без виклику.
function precheck(text: string, model: LanguageModel | null): SuggestResult | null {
  if (looksLikeInjection(text)) return { state: "injection", message: AI_TEXT.injection };
  if (!model) return unavailable();
  return text.trim() ? null : failed();
}

// Один виклик моделі: схема zod, без повторів (безкоштовний ліміт, AC-AI-05), таймаут 15 с (AC-AI-04).
async function askModel(
  text: string,
  model: LanguageModel,
  opts: SuggestOptions,
): Promise<
  | { suggestion: LineSuggestion; modelId: string; inputTokens?: number; outputTokens?: number }
  | (SuggestResult & { errorKind: SuggestTrace["errorKind"] })
> {
  try {
    const result = await generateText({
      model,
      instructions: LINE_INSTRUCTIONS,
      messages: [{ role: "user", content: [{ type: "text", text: wrapDocument(text) }] }],
      output: Output.object({ name: "line", schema: LineSuggestionSchema }),
      temperature: 0,
      maxRetries: opts.maxRetries ?? 0,
      timeout: opts.timeoutMs ?? SUGGEST_TIMEOUT_MS,
    });
    return {
      suggestion: result.output,
      modelId: result.response.modelId,
      inputTokens: result.usage?.inputTokens,
      outputTokens: result.usage?.outputTokens,
    };
  } catch (error) {
    // Модель відповіла JSON у Markdown-огорожі (```json … ```) — розбираємо сам JSON і перевіряємо тією самою схемою;
    // відповідь не за схемою лишається збоєм (AC-AI-04).
    const noObject = NoObjectGeneratedError.isInstance(error) ? error : null;
    const recovered = noObject ? parseFenced(noObject.text) : null;
    if (recovered) {
      return {
        suggestion: recovered,
        modelId: noObject?.response?.modelId ?? "unknown",
        inputTokens: noObject?.usage?.inputTokens,
        outputTokens: noObject?.usage?.outputTokens,
      };
    }
    return { ...classifyFailure(error), errorKind: failureKind(error) };
  }
}

// Відповідь моделі → стан для людини; межі кількості й ціни перевіряє код (checkLine).
function interpret(suggestion: LineSuggestion, modelId: string): SuggestResult {
  if (suggestion.status === "off_topic") return { state: "off_topic", message: AI_TEXT.offTopic, modelId };
  if (suggestion.status === "injection") return { state: "injection", message: AI_TEXT.injection, modelId };
  const { name, purpose, quantity, price } = suggestion;
  if (name === null && purpose === null && quantity === null && price === null) return failed();
  const checked = checkLine(suggestion);
  if (checked.kind === "line") return { state: "line", line: checked.line, modelId };
  const message = checked.issue === "quantity" ? MESSAGES.INVALID_QUANTITY : MESSAGES.INVALID_PRICE;
  return { state: "invalid", issue: checked.issue, message, modelId };
}

function parseFenced(text: string | undefined): LineSuggestion | null {
  const body = text?.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  if (!body) return null;
  try {
    const parsed = LineSuggestionSchema.safeParse(JSON.parse(body));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

// Збій моделі → стан для людини: ліміт (429, зокрема 429 у тілі відповіді HTTP 200) — AC-AI-05; таймаут, відповідь не за
// схемою чи інша помилка постачальника — AC-AI-04 («не вдалося отримати пропозицію»).
// Код причини збою для журналу (не текст помилки). Та сама логіка, що в classifyFailure, плюс таймаут окремо.
export function failureKind(error: unknown): SuggestTrace["errorKind"] {
  const cause = RetryError.isInstance(error) ? error.lastError : error;
  if (NoObjectGeneratedError.isInstance(cause)) return "invalid_output";
  if (APICallError.isInstance(cause)) {
    const code = cause.statusCode === 200 ? (cause.data as { code?: unknown } | undefined)?.code : cause.statusCode;
    if (code === 429 || code === "429") return "rate_limited";
  }
  if (cause instanceof Error && (cause.name === "TimeoutError" || cause.name === "AbortError")) return "timeout";
  return "provider_error";
}

export function classifyFailure(error: unknown): SuggestResult {
  const cause = RetryError.isInstance(error) ? error.lastError : error;
  if (NoObjectGeneratedError.isInstance(cause)) return failed();
  if (APICallError.isInstance(cause)) {
    const code = cause.statusCode === 200 ? (cause.data as { code?: unknown } | undefined)?.code : cause.statusCode;
    if (code === 429 || code === "429") return unavailable();
  }
  return failed();
}

