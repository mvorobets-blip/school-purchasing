// Playwright globalSetup (лише на розгорнутій адресі, UAT_BASE_URL): до проєкту setup, тобто до першого запису в базу
// (синтетичні користувачі uat-*@example.test), звіряє ref Supabase цілі з .env.local — scripts/uat/target.mjs (R03, WS11).
import { assertSameDatabase } from "../../../scripts/uat/target.mjs";

export default async function targetGuard() {
  const base = process.env.UAT_BASE_URL?.replace(/\/+$/, "");
  if (!base) return;
  const ref = await assertSameDatabase(base);
  console.log(`UAT: база цілі й .env.local — той самий проєкт Supabase (${ref})`);
}
