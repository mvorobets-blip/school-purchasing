#!/usr/bin/env node
// Дані для e2e на ОДНОРАЗОВОМУ локальному стеку Supabase (.github/workflows/e2e.yml) — та сама картина, що на проді
// для специфікацій tests/e2e/purchase.spec.ts (див. шапку файлу й tests/e2e/auth.setup.ts):
//   відділ «Primary School»: member1 і pm-requester — заявники, не схвалювачі; у member1 — заявка «Awaiting approval»;
//   відділ «Secondary school»: member2 — заявник без жодної заявки.
// supabase/seed.sql цього не створює: користувачі з'являються лише після npm run users:demo.
// Запуск — після users:demo: node --env-file=.env.local scripts/e2e-fixtures.mjs. Лише локальний стек: на будь-якій
// іншій адресі скрипт відмовляється працювати (прод-базу не чіпаємо). Ідемпотентно. Значень ключів не друкує.
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;
if (!url || !secretKey) {
  console.error("Не задано NEXT_PUBLIC_SUPABASE_URL або SUPABASE_SECRET_KEY (.env.local локального стеку).");
  process.exit(1);
}
if (!["localhost", "127.0.0.1"].includes(new URL(url).hostname)) {
  console.error("e2e-fixtures — лише для локального стеку Supabase (localhost / 127.0.0.1), не для проду.");
  process.exit(1);
}

const supabase = createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });

const must = ({ data, error }, what) => {
  if (error) throw new Error(`${what}: ${error.message}`);
  return data;
};

async function profileId(email) {
  const rows = must(await supabase.from("profiles").select("id").eq("email", email), `профіль ${email}`);
  if (!rows.length) throw new Error(`немає профілю ${email} — спершу npm run users:demo`);
  return rows[0].id;
}

async function department(name) {
  const found = must(await supabase.from("departments").select("id").eq("name", name), `відділ ${name}`);
  if (found.length) return found[0].id;
  return must(await supabase.from("departments").insert({ name }).select("id").single(), `створення відділу ${name}`).id;
}

async function requester(departmentId, profile) {
  must(
    await supabase
      .from("department_members")
      .upsert({ department_id: departmentId, profile_id: profile, is_approver: false }, { onConflict: "department_id,profile_id" }),
    "членство у відділі",
  );
}

const primary = await department("Primary School");
const secondary = await department("Secondary school");
const member1 = await profileId("member1@example.test");
const pmRequester = await profileId("pm-requester@example.test");
const member2 = await profileId("member2@example.test");

await requester(primary, member1);
await requester(primary, pmRequester);
await requester(secondary, member2);

// Заявка member1 «Awaiting approval» у «Primary School» — «Дано» AC-FRM-08.
const pending = must(
  await supabase
    .from("purchase_requests")
    .select("id")
    .eq("author_id", member1)
    .eq("department_id", primary)
    .eq("status", "pending"),
  "заявки member1",
);
if (!pending.length) {
  const request = must(
    await supabase
      .from("purchase_requests")
      .insert({ author_id: member1, department_id: primary, purchase_type: "purchasing_department" })
      .select("id")
      .single(),
    "заявка member1",
  );
  must(
    await supabase
      .from("purchase_request_lines")
      .insert({ request_id: request.id, position: 1, name: "Зошити", purpose: "Для уроків", quantity: 10, price: 2.5 }),
    "рядок заявки member1",
  );
}

console.log("e2e-fixtures: відділи «Primary School» і «Secondary school», членства й заявка member1 — готово.");
