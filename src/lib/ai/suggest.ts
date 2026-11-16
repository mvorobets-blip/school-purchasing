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

// 15 секунд чекання відповіді до повідомлення (AC-AI-04, припущення PM у #71).
export const SUGGEST_TIMEOUT_MS = 15_000;

const failed = (): SuggestResult => ({ state: "failed", message: AI_TEXT.failed });
const unavailable = (): SuggestResult => ({ state: "unavailable", message: AI_TEXT.unavailable });

export async function proposeLine(text: string, model: LanguageModel | null, opts: SuggestOptions = {}): Promise<SuggestResult> {
  const early = precheck(text, model);
  if (early || !model) return early ?? unavailable();
  const answer = await askModel(text, model, opts);
  return "state" in answer ? answer : interpret(answer.suggestion, answer.modelId);
}

// Перевірки до виклику моделі: немає ключа — «недоступний сьогодні» (технічний запасний шлях, не AC); вказівки в описі —
// одразу відмова (AC-AI-06), тож «ігноруй інструкції» не дає рядка з жодною моделлю; порожній опис — збій без виклику.
function precheck(text: string, model: LanguageModel | null): SuggestResult | null {
  if (!model) return unavailable();
  if (looksLikeInjection(text)) return { state: "injection", message: AI_TEXT.injection };
  return text.trim() ? null : failed();
}

// Один виклик моделі: схема zod, без повторів (безкоштовний ліміт, AC-AI-05), таймаут 15 с (AC-AI-04).
async function askModel(
  text: string,
  model: LanguageModel,
  opts: SuggestOptions,
): Promise<{ suggestion: LineSuggestion; modelId: string } | SuggestResult> {
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
    return { suggestion: result.output, modelId: result.response.modelId };
  } catch (error) {
    // Модель відповіла JSON у Markdown-огорожі (```json … ```) — розбираємо сам JSON і перевіряємо тією самою схемою;
    // відповідь не за схемою лишається збоєм (AC-AI-04).
    const noObject = NoObjectGeneratedError.isInstance(error) ? error : null;
    const recovered = noObject ? parseFenced(noObject.text) : null;
    return recovered ? { suggestion: recovered, modelId: noObject?.response?.modelId ?? "unknown" } : classifyFailure(error);
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
export function classifyFailure(error: unknown): SuggestResult {
  const cause = RetryError.isInstance(error) ? error.lastError : error;
  if (NoObjectGeneratedError.isInstance(cause)) return failed();
  if (APICallError.isInstance(cause)) {
    const code = cause.statusCode === 200 ? (cause.data as { code?: unknown } | undefined)?.code : cause.statusCode;
    if (code === 429 || code === "429") return unavailable();
  }
  return failed();
}

