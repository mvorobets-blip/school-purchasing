// Код відповіді функції бази (RPC) для адреси сторінки (?error=…): FORBIDDEN — 42501 чи текст FORBIDDEN, інші — текст
// помилки P0001, що дорівнює коду (NOT_REQUESTER, LAST_ADMIN, NOT_FOUND); невідомі — UNKNOWN. Порожньо — успіх.
export type RpcError = { code?: string; message?: string } | null;

export function rpcErrorCode(error: RpcError, known: readonly string[]): string {
  if (!error) return "";
  if (error.code === "42501" || error.message?.includes("FORBIDDEN")) return "FORBIDDEN";
  return known.find((code) => error.message?.includes(code)) ?? "UNKNOWN";
}
