#!/usr/bin/env node
// npm run e2e:fixtures — дані для e2e на ОДНОРАЗОВОМУ локальному стеку Supabase (.github/workflows/e2e.yml): та сама
// картина, що на проді для специфікацій tests/e2e/purchase.spec.ts (див. шапку файлу й tests/e2e/auth.setup.ts):
//   відділ «Primary School»: member1 і pm-requester — заявники, не схвалювачі; у member1 — заявка «Awaiting approval»;
//   відділ «Secondary school»: member2 — заявник без жодної заявки.
// supabase/seed.sql цього не створює: користувачі з'являються лише після npm run users:demo.
// Скрипт ВСТАНОВЛЮЄ саме цю картину (зокрема is_approver: false), а не доповнює її: він лише для одноразового стеку —
// на будь-якій адресі, крім localhost / 127.0.0.1, відмовляється працювати (прод-базу не чіпає). Повторний запуск
// нічого не дублює. Значень ключів і пароля не друкує.
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const password = process.env.DEMO_USER_PASSWORD;
if (!url || !secretKey || !publishableKey || !password) {
  console.error(
    "Не задано NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, SUPABASE_SECRET_KEY або DEMO_USER_PASSWORD (.env.local локального стеку).",
  );
  process.exit(1);
}
if (!["localhost", "127.0.0.1"].includes(new URL(url).hostname)) {
  console.error("e2e-fixtures — лише для локального стеку Supabase (localhost / 127.0.0.1), не для проду.");
  process.exit(1);
}

const noSession = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, secretKey, noSession);

const must = ({ data, error }, what) => {
  if (error) throw new Error(`${what}: ${error.message}`);
  return data;
};

async function profileId(email) {
  const rows = must(await admin.from("profiles").select("id").eq("email", email), `профіль ${email}`);
  if (!rows.length) throw new Error(`немає профілю ${email} — спершу npm run users:demo`);
  return rows[0].id;
}

// Назва відділу унікальна без урахування регістру (індекс lower(btrim(name))) — шукаємо так само.
async function department(name) {
  const found = must(await admin.from("departments").select("id").ilike("name", name), `відділ ${name}`);
  if (found.length) return found[0].id;
  return must(await admin.from("departments").insert({ name }).select("id").single(), `створення відділу ${name}`).id;
}

async function requester(departmentId, profile) {
  must(
    await admin
      .from("department_members")
      .upsert({ department_id: departmentId, profile_id: profile, is_approver: false }, { onConflict: "department_id,profile_id" }),
    "членство у відділі",
  );
}

const pendingOf = async (author, departmentId) =>
  must(
    await admin.from("purchase_requests").select("id").eq("author_id", author).eq("department_id", departmentId).eq("status", "pending"),
    "заявки",
  );

const primary = await department("Primary School");
const secondary = await department("Secondary school");
const member1 = await profileId("member1@example.test");
const pmRequester = await profileId("pm-requester@example.test");
const member2 = await profileId("member2@example.test");

await requester(primary, member1);
await requester(primary, pmRequester);
await requester(secondary, member2);

// «Дано» AC-FRM-14: у member2 немає жодної заявки — перевіряємо, а не припускаємо (стек міг бути не свіжим).
const member2Requests = must(await admin.from("purchase_requests").select("id").eq("author_id", member2), "заявки member2");
if (member2Requests.length) {
  throw new Error(`у member2@example.test є заявки (${member2Requests.length}) — перезапустіть локальний стек (supabase db reset)`);
}

// «Дано» AC-FRM-08: заявка member1 «Awaiting approval» у «Primary School». Подаємо так само, як застосунок, — від імені
// member1 через rpc submit_purchase: заявка з рядками — один атомарний запис, без «сирітської» заявки без рядків.
if (!(await pendingOf(member1, primary)).length) {
  const asMember1 = createClient(url, publishableKey, noSession);
  must(await asMember1.auth.signInWithPassword({ email: "member1@example.test", password }), "вхід member1");
  must(
    await asMember1.rpc("submit_purchase", {
      p_department_id: primary,
      p_purchase_type: "purchasing_department",
      p_lines: [{ name: "Зошити", purpose: "Для уроків", quantity: "10", price: "2.50" }],
    }),
    "заявка member1",
  );
}

console.log("e2e-fixtures: відділи «Primary School» і «Secondary school», членства й заявка member1 — готово.");
