#!/usr/bin/env node
// Ручна перевірка RLS / GRANT після db-deploy (план impl-department-setup, задачі 1 і 4).
// Запуск: node --env-file=.env.local tests/manual/rls-smoke.mjs
// Входить демо-користувачами (supabase/demo-users.json, пароль DEMO_USER_PASSWORD) з ПУБЛІЧНИМ ключем, як браузер,
// і пробує заборонені дії через Data API. Значень ключів і паролів не друкує.
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const password = process.env.DEMO_USER_PASSWORD;
if (!url || !key || !password) {
  console.error("Не задано NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY або DEMO_USER_PASSWORD у .env.local.");
  process.exit(1);
}

let failed = 0;
const check = (name, ok, detail = "") => {
  if (!ok) failed++;
  console.log(`${ok ? "✔" : "✖"} ${name}${detail ? ` — ${detail}` : ""}`);
};

async function signIn(email) {
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`вхід ${email}: ${error.message}`);
  return { client, id: data.user.id };
}

// ── Не-адміністратор (requester) ──
const { client: member, id: memberId } = await signIn("member1@example.test");

const { data: someDept } = await (await signIn("admin@example.test")).client.from("departments").select("id").limit(1).single();

{
  const { error } = await member
    .from("department_members")
    .insert({ department_id: someDept.id, profile_id: memberId, is_approver: true });
  check("requester не може напряму вставити рядок у department_members", error?.code === "42501", error?.code ?? "запис пройшов!");
}
{
  const { error } = await member.from("profiles").update({ role: "admin" }).eq("id", memberId);
  check("requester не може змінити собі profiles.role", error?.code === "42501", error?.code ?? "оновлення пройшло!");
}
{
  const { error } = await member.from("profiles").update({ is_active: false }).eq("id", memberId);
  check("requester не може змінити profiles.is_active", error?.code === "42501", error?.code ?? "оновлення пройшло!");
}
{
  const { error } = await member.from("departments").insert({ name: "Перевірка RLS requester" });
  check("requester не може створити відділ", error?.code === "42501", error?.code ?? "відділ створено!");
}
{
  const { data, error } = await member.from("departments").select("id, name");
  check(
    "requester без членства не бачить чужих departments через Data API",
    !error && Array.isArray(data) && data.length === 0,
    error ? error.code : `рядків: ${data?.length}`,
  );
}
{
  const { data } = await member.from("profiles").select("id, role");
  check("requester бачить лише власний профіль", (data ?? []).every((p) => p.id === memberId), `рядків: ${data?.length}`);
  check("роль member1 після міграції — requester", (data ?? []).find((p) => p.id === memberId)?.role === "requester");
}

// ── Адміністратор ──
const { client: admin } = await signIn("admin@example.test");
{
  const { data, error } = await admin.from("departments").select("name");
  check("admin бачить усі відділи (сид міграції)", !error && (data?.length ?? 0) >= 3, error ? error.code : `рядків: ${data?.length}`);
}

console.log(failed ? `\nНевдалих перевірок: ${failed}` : "\nУсі перевірки пройдено.");
process.exit(failed ? 1 : 0);
