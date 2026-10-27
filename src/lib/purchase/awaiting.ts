import { cache } from "react";
import { pageCount, pageRange } from "@/lib/purchase/pagination";
import { createClient } from "@/lib/supabase/server";

export type AwaitingRequest = { id: string; department_id: string; purchase_type: string; created_at: string };
export type AwaitingDecision = {
  departmentIds: string[];
  requests: AwaitingRequest[]; // рядки сторінки page (найстаріші спершу); порожньо, якщо сторінки немає
  total: number; // усього заявок на рішення — для лічильника й «Showing … of N»
  failed: boolean;
};

// Заявки на рішення поточного користувача: подані в його відділи, де він схвалювач, крім власних (AC-APR-01).
// Ті самі умови, що й на /approvals. Спершу точна кількість (лише count, без рядків), потім — рядки сторінки page
// (по 50), і лише якщо така сторінка існує: запит за межами діапазону PostgREST відхиляє (416), а сторінка має
// перенаправити на останню. Порядок — дата, потім id: сталий між сторінками, коли дати однакові.
// cache(): бічна панель (лічильник) і головна в одному запиті читають один раз.
export const getAwaitingDecision = cache(async (userId: string, page: number = 1): Promise<AwaitingDecision> => {
  const supabase = await createClient();
  const { data: memberships, error } = await supabase
    .from("department_members")
    .select("department_id")
    .eq("profile_id", userId)
    .eq("is_approver", true);
  if (error) return { departmentIds: [], requests: [], total: 0, failed: true };

  const departmentIds = memberships.map((m) => m.department_id);
  if (departmentIds.length === 0) return { departmentIds, requests: [], total: 0, failed: false };

  const { count, error: countError } = await supabase
    .from("purchase_requests")
    .select("id", { count: "exact", head: true })
    .in("department_id", departmentIds)
    .eq("status", "pending")
    .neq("author_id", userId);
  if (countError) return { departmentIds, requests: [], total: 0, failed: true };
  const total = count ?? 0;
  if (total === 0 || page > pageCount(total)) return { departmentIds, requests: [], total, failed: false };

  const { from, to } = pageRange(page);
  const { data: requests, error: requestsError } = await supabase
    .from("purchase_requests")
    .select("id, department_id, purchase_type, created_at")
    .in("department_id", departmentIds)
    .eq("status", "pending")
    .neq("author_id", userId)
    .order("created_at")
    .order("id")
    .range(from, to);
  return { departmentIds, requests: requests ?? [], total, failed: Boolean(requestsError) };
});
