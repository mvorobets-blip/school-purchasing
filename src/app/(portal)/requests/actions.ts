"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/org/current-user";
import { messageFor } from "@/lib/org/messages";
import { parseLines } from "@/lib/purchase/form";
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
  return "Could not submit the purchase. Try again.";
}

// Подання закупівлі. Права (відділ, тип, рядки) перевіряє private.submit_purchase у базі: дію можна викликати напряму,
// тож перевірка в UI — лише зручність (AC-FRM-02, AC-FRM-04). Помилка лишає обрані відділ і тип у формі (AC-FRM-06);
// успіх — «Мої заявки» з «Purchase submitted» (AC-FRM-11).
export async function submitPurchase(
  _prev: SubmitPurchaseState,
  formData: FormData,
): Promise<SubmitPurchaseState> {
  const departmentId = String(formData.get("departmentId") ?? "");
  const purchaseType = String(formData.get("purchaseType") ?? "");
  const keep = { departmentId, purchaseType };

  // getCurrentUser — getClaims() і роль з profiles; неактивний чи гість отримує відмову без запису.
  const user = await getCurrentUser();
  if (!user) return { status: "error", message: messageFor("FORBIDDEN"), ...keep };

  const lines = parseLines(formData);
  if (lines.length === 0) return { status: "error", message: messageFor("NO_LINES"), ...keep };

  const supabase = await createClient();
  const { error } = await supabase.rpc("submit_purchase", {
    p_department_id: departmentId,
    p_purchase_type: purchaseType,
    p_lines: lines,
  });
  if (error) return { status: "error", message: errorMessage(error), ...keep };

  revalidatePath("/requests");
  redirect("/requests?ok=SUBMITTED");
}
