"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/org/current-user";
import { messageFor } from "@/lib/org/messages";
import { hasTooLongLine, isTextLengthError, LINE_TOO_LONG, parseLines } from "@/lib/purchase/form";
import { createClient } from "@/lib/supabase/server";

export type SubmitPurchaseState = {
  status: "idle" | "error";
  message: string;
  departmentId: string;
  purchaseType: string;
};

type RpcError = { code?: string; message?: string } | null;

function errorMessage(error: RpcError): string {
  if (error?.code === "42501" || error?.message?.includes("FORBIDDEN")) return messageFor("FORBIDDEN");
  if (error?.message?.includes("NO_LINES")) return messageFor("NO_LINES");
  if (error?.message?.includes("INVALID_LINE")) return messageFor("INVALID_LINE");
  if (error?.message?.includes("INVALID_QUANTITY")) return messageFor("INVALID_QUANTITY");
  if (error?.message?.includes("INVALID_PRICE")) return messageFor("INVALID_PRICE");
  if (isTextLengthError(error)) return LINE_TOO_LONG;
  return "Could not submit the purchase. Try again.";
}

// Спільне для першого й повторного подання: відділ і тип з форми (лишаються після помилки, AC-FRM-06; при повторному
// поданні поля заблоковані й не надсилаються — тоді порожні, а дія їх і не використовує), користувач
// (getCurrentUser — getClaims() і роль з profiles; гість чи неактивний — відмова без запису) і рядки форми. Межі чисел
// (кількість — ціле від 1, ціна від 0 — припущення PM у вимозі 64) перевіряє база: INVALID_QUANTITY / INVALID_PRICE.
type Prepared =
  | { error: SubmitPurchaseState }
  | { keep: { departmentId: string; purchaseType: string }; lines: ReturnType<typeof parseLines> };

async function prepare(formData: FormData): Promise<Prepared> {
  const keep = {
    departmentId: String(formData.get("departmentId") ?? ""),
    purchaseType: String(formData.get("purchaseType") ?? ""),
  };
  const fail = (message: string): Prepared => ({ error: { status: "error", message, ...keep } });
  const user = await getCurrentUser();
  if (!user) return fail(messageFor("FORBIDDEN"));
  const lines = parseLines(formData);
  if (lines.length === 0) return fail(messageFor("NO_LINES"));
  if (hasTooLongLine(lines)) return fail(LINE_TOO_LONG);
  return { keep, lines };
}

// Після виклику бази: помилка — повідомлення з введеним у формі; успіх — оновити сторінки й перейти далі.
function finish(
  error: RpcError,
  keep: { departmentId: string; purchaseType: string },
  paths: string[],
  to: string,
): SubmitPurchaseState {
  if (error) return { status: "error", message: errorMessage(error), ...keep };
  for (const path of paths) revalidatePath(path);
  redirect(to);
}

// Подання закупівлі. Права (відділ, тип, рядки) перевіряє private.submit_purchase у базі: дію можна викликати напряму,
// тож перевірка в UI — лише зручність (AC-FRM-02, AC-FRM-04). Помилка лишає обрані відділ і тип у формі (AC-FRM-06);
// успіх — «Мої заявки» з «Purchase submitted» (AC-FRM-11).
export async function submitPurchase(
  _prev: SubmitPurchaseState,
  formData: FormData,
): Promise<SubmitPurchaseState> {
  const prepared = await prepare(formData);
  if ("error" in prepared) return prepared.error;
  const { keep, lines } = prepared;

  const supabase = await createClient();
  const { error } = await supabase.rpc("submit_purchase", {
    p_department_id: keep.departmentId,
    p_purchase_type: keep.purchaseType,
    p_lines: lines,
  });
  return finish(error, keep, ["/requests"], "/requests?ok=SUBMITTED");
}

// Повторне подання поверненої заявки (AC-DEC-07). Хто може (автор, статус «Returned for revision») і рядки перевіряє
// private.resubmit_purchase тими самими правилами, що й перше подання; відділ і тип не змінюються (#66), номер — той
// самий (#68). Помилка лишає введене у формі; успіх — сторінка заявки з «Purchase submitted».
export async function resubmitPurchase(
  requestId: string,
  _prev: SubmitPurchaseState,
  formData: FormData,
): Promise<SubmitPurchaseState> {
  const prepared = await prepare(formData);
  if ("error" in prepared) return prepared.error;
  const { keep, lines } = prepared;

  const supabase = await createClient();
  const { error } = await supabase.rpc("resubmit_purchase", { p_request_id: requestId, p_lines: lines });
  return finish(error, keep, ["/requests", "/approvals"], `/requests/${requestId}?ok=RESUBMITTED`);
}
