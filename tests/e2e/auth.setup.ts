// Вхід кожної ролі один раз за прогін → playwright/.auth/<role>.json (у .gitignore: там живі cookie сесії).
// Тести ролей беруть стан через test.use({ storageState: "playwright/.auth/<role>.json" }).
// У цьому проєкті запис вимкнено (playwright.config.ts: setup — video, trace і screenshot "off"): тут вводиться пароль.
//
// Змінні з паролями (лише назви; значення — у .env.local локально або в secrets CI, ніколи в коді):
//   DEMO_USER_PASSWORD           — спільний пароль акаунтів із supabase/demo-users.json (npm run users:demo);
//   UAT_PASSWORD_<РОЛЬ>          — необов'язково: окремий пароль для ролі, напр. UAT_PASSWORD_ADMIN.
//
// Джерело: демо-репо курсу, tests/e2e/auth.setup.ts (тег ws8-03-uat). ROLES — наші акаунти на проді (D0.5, accounts.zip)
// для 3 AC WS8: requester — працівник 1 (автор заявки, AC-FRM-08; AC-FRM-15); requester2 — працівник 2/3 того самого
// відділу, не схвалювач і без поданих заявок (AC-FRM-08, AC-FRM-14). Обидва з supabase/demo-users.json.
import { expect, test as setup } from "@playwright/test";
import { signIn } from "./support/uat";

const ROLES = {
  requester: "pm-requester@example.test",
  requester2: "member2@example.test",
} as const;

for (const [role, email] of Object.entries(ROLES)) {
  setup(`вхід: ${role}`, async ({ page }) => {
    const password = process.env[`UAT_PASSWORD_${role.toUpperCase()}`] ?? process.env.DEMO_USER_PASSWORD;
    expect(password, `немає пароля для ролі ${role}: DEMO_USER_PASSWORD або UAT_PASSWORD_${role.toUpperCase()}`).toBeTruthy();
    await signIn(page, email, password!);
    // Наш портал показує email того, хто увійшов, унизу бічної панелі (src/components/portal/app-sidebar.tsx).
    await expect(page.getByText(email, { exact: true }).first()).toBeVisible();
    await page.context().storageState({ path: `playwright/.auth/${role}.json` });
  });
}
