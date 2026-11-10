// «Дано» про роль людини у відділах — спільне для UAT зрізу 3 і негативних контролів (рев'ю CodeRabbit, PR 62):
// NC має відрізнятися від справжнього тесту лише навмисним місцем, тож передумову перевіряє той самий код.
// Окремий файл, бо support/uat.ts — з курсу (у ньому змінюємо лише signIn).
import { expect, type Page } from "@playwright/test";

/** «Дано»: людина — схвалювач рівно цього відділу (таблиця відділів у «My profile»). */
export async function approverOnlyOf(page: Page, department: string, who: string) {
  await page.goto("/profile");
  const rows = page.getByTestId("profile-departments").getByRole("row");
  const own = rows.filter({ has: page.getByRole("cell", { name: department, exact: true }) });
  await expect(own, `ПЕРЕДУМОВА НА ПРОДІ: ${who} — схвалювач відділу «${department}» (призначає адміністратор)`).toHaveCount(1);
  await expect(own.getByRole("cell").nth(1)).toHaveText("Requester and approver");
  // Схвалювач лише цього відділу: жодного іншого рядка з роллю схвалювача.
  await expect(
    rows.filter({ has: page.getByRole("cell", { name: "Requester and approver", exact: true }) }),
    `ПЕРЕДУМОВА НА ПРОДІ: ${who} схвалює лише «${department}»`,
  ).toHaveCount(1);
}
