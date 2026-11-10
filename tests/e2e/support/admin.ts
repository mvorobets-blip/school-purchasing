// Синтетичні дані UAT і прибирання за ними — секретним ключем Supabase (обходить RLS).
// Лише в тестах і лише на машині розробника (.env.local) або в CI на одноразовому локальному стеку (e2e.yml).
// У GitHub Secrets SUPABASE_SECRET_KEY не додаємо. Без ключа (прогін лише AC, що нічого не пишуть,
// --grep-invert '@writes') цей файл нічого не робить: cleanup.teardown.ts не реєструє тест.
// check:boundary сканує src/, тож цей файл його не порушує; у src/ секретний ключ читає лише src/lib/supabase/admin.ts.
// Ніколи не друкуємо значення ключів і паролів — лише адреси синтетичних користувачів.
//
// Джерело: демо-репо курсу, tests/e2e/support/admin.ts (тег ws8-03-uat). Демо-специфічні помічники (createEmployee
// з підрозділом і посадою, isBlockedDay, leaveRequestsOf) прибрано — подивіться їх у демо як зразок для своїх.
import { randomBytes } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * ВАШЕ: рядки синтетичного користувача, які треба видалити ДО deleteUser, — таблиці з FK на користувача без
 * on delete cascade (інакше Auth відповідає «Database error deleting user»). У демо: leave_requests.employee_id.
 * Якщо таких таблиць немає (або всі FK — cascade), лишіть порожнім.
 */
// Наші: події історії, де синтетичний користувач — дійова особа (actor_id, restrict), і його заявки (author_id,
// restrict; рядки й події заявки — cascade). Порядок важливий: спершу події, потім заявки.
const OWNED_ROWS: { table: string; column: string }[] = [
  { table: "purchase_request_events", column: "actor_id" },
  { table: "purchase_requests", column: "author_id" },
];

/** Лише такі адреси прибирання має право видалити: uat-<run>[-<суфікс>]@example.test. */
export const UAT_EMAIL = /^uat-[0-9a-z-]+@example\.test$/;

export function uatEmail(suffix?: string): string {
  const run = process.env.UAT_RUN ?? "manual";
  const email = `uat-${run}${suffix ? `-${suffix}` : ""}@example.test`;
  if (!UAT_EMAIL.test(email)) throw new Error(`Синтетична адреса має вигляд uat-…@example.test, а не ${email}`);
  return email;
}

export const randomPassword = () => `Uat-${randomBytes(12).toString("base64url")}`;

export function hasAdminKey(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SECRET_KEY);
}

/** Клієнт із секретним ключем — для ваших помічників синтетичних даних (створити користувача, прочитати рядок). */
export function adminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secret) {
    throw new Error("Для синтетичних даних UAT потрібні NEXT_PUBLIC_SUPABASE_URL і SUPABASE_SECRET_KEY (.env.local)");
  }
  return createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function listUatUsers(supabase: SupabaseClient): Promise<{ id: string; email: string }[]> {
  const found: { id: string; email: string }[] = [];
  for (let page = 1; ; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    for (const u of data.users) if (u.email && UAT_EMAIL.test(u.email)) found.push({ id: u.id, email: u.email });
    if (data.users.length < 1000) return found;
  }
}

const CLEANUP_LOG = "test-results/uat-cleanup.jsonl";

/** Усі uat-адреси, які видалив цей прогін (за журналом). */
export function deletedThisRun(): string[] {
  if (!existsSync(CLEANUP_LOG)) return [];
  const entries = readFileSync(CLEANUP_LOG, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((l) => JSON.parse(l) as { deleted: string[] });
  return [...new Set(entries.flatMap((e) => e.deleted))];
}

/** leftoverRequests — скільки рядків видалених користувачів лишилось у таблицях OWNED_ROWS (назва поля — з демо). */
export type CleanupResult = { deleted: string[]; remaining: string[]; leftoverRequests: number };

/**
 * Видаляє ВСІХ uat-*@example.test (і тих, що лишились після обірваних прогонів), а потім перевіряє:
 * жодного такого користувача й жодного їхнього рядка в OWNED_ROWS.
 */
export async function deleteUatUsers(onlyEmail?: string): Promise<CleanupResult> {
  const supabase = adminClient();
  const targets = (await listUatUsers(supabase)).filter((u) => !onlyEmail || u.email === onlyEmail);
  const deleted: string[] = [];
  for (const u of targets) {
    for (const { table, column } of OWNED_ROWS) {
      const { error: rowsError } = await supabase.from(table).delete().eq(column, u.id);
      if (rowsError) throw rowsError;
    }
    const { error } = await supabase.auth.admin.deleteUser(u.id);
    if (error) throw error;
    deleted.push(u.email);
  }
  const remaining = (await listUatUsers(supabase))
    .filter((u) => !onlyEmail || u.email === onlyEmail)
    .map((u) => u.email);
  let leftoverRequests = 0;
  for (const { table, column } of targets.length ? OWNED_ROWS : []) {
    const { count, error } = await supabase
      .from(table)
      .select("*", { count: "exact", head: true })
      .in(
        column,
        targets.map((u) => u.id),
      );
    if (error) throw error;
    leftoverRequests += count ?? 0;
  }
  // Журнал прибирань прогону: afterAll специфікацій і teardown (Playwright чистить test-results/ на старті прогону).
  mkdirSync("test-results", { recursive: true });
  appendFileSync(
    CLEANUP_LOG,
    `${JSON.stringify({ at: new Date().toISOString(), scope: onlyEmail ?? "uat-*", deleted, remaining, leftoverRequests })}\n`,
  );
  return { deleted, remaining, leftoverRequests };
}

/** Синтетичний автор UAT: новий uat-*@example.test з іменем, заявник відділу department (не схвалювач). */
export type UatAuthor = { id: string; email: string; password: string; fullName: string };

export async function createAuthor(department: string, suffix = "author"): Promise<UatAuthor> {
  const supabase = adminClient();
  const email = uatEmail(suffix);
  const password = randomPassword();
  const fullName = `UAT Author ${process.env.UAT_RUN ?? "manual"}`;
  const { data, error } = await supabase.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  const id = data.user.id;
  const { error: profileError } = await supabase.from("profiles").update({ full_name: fullName }).eq("id", id);
  if (profileError) throw profileError;
  const { data: depts, error: deptError } = await supabase.from("departments").select("id").ilike("name", department);
  if (deptError) throw deptError;
  if (depts.length !== 1) throw new Error(`ПЕРЕДУМОВА НА ПРОДІ: має бути рівно один відділ «${department}»`);
  const { error: memberError } = await supabase
    .from("department_members")
    .insert({ department_id: depts[0].id, profile_id: id, is_approver: false });
  if (memberError) throw memberError;
  return { id, email, password, fullName };
}

/** Подати закупівлю від імені автора — так само, як застосунок (rpc submit_purchase, ключ publishable). id заявки. */
export async function submitAs(
  author: UatAuthor,
  department: string,
  lines: { name: string; purpose: string; quantity: string; price: string }[],
): Promise<string> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!key) throw new Error("Для подання від імені автора потрібен NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (.env.local)");
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error: signInError } = await client.auth.signInWithPassword({ email: author.email, password: author.password });
  if (signInError) throw signInError;
  const { data: depts, error: deptError } = await client.from("departments").select("id").ilike("name", department);
  if (deptError) throw deptError;
  // Рівно один відділ із такою назвою — інакше rpc отримав би не той відділ чи порожній id (рев'ю CodeRabbit, PR 62).
  if (depts?.length !== 1) throw new Error(`ПЕРЕДУМОВА НА ПРОДІ: має бути рівно один відділ «${department}»`);
  const { data, error } = await client.rpc("submit_purchase", {
    p_department_id: depts[0].id,
    p_purchase_type: "purchasing_department",
    p_lines: lines,
  });
  if (error) throw error;
  return data as string;
}

/** Статус заявки в базі (секретний ключ): «не змінився» перевіряємо незалежно від сторінки. */
export async function requestStatus(id: string): Promise<string> {
  const { data, error } = await adminClient().from("purchase_requests").select("status").eq("id", id).single();
  if (error) throw error;
  return data.status as string;
}
