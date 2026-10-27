import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MESSAGES } from "@/lib/org/messages";
import { ROLE_LABEL } from "@/lib/org/roles";
import { PURCHASE_TYPE_LABEL } from "@/lib/purchase/form";
import { STATUS_LABEL } from "@/lib/purchase/status";

// Англійський інтерфейс (requirements/49-…md): тексти дослівно з таблиці PM.
const CYRILLIC = /[А-Яа-яІіЇїЄєҐґ]/;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

// Прибираємо коментарі (документація в репо — українською за правилами проєкту); лишаються рядки й JSX-текст.
function withoutComments(code: string): string {
  return code
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

describe("англійський інтерфейс", () => {
  it("AC-LANG-01: у коді інтерфейсу (src/) немає жодного українського слова поза коментарями", () => {
    const offenders = sourceFiles("src").flatMap((file) =>
      withoutComments(readFileSync(file, "utf8"))
        .split("\n")
        .map((line, i) => ({ file, line: i + 1, text: line.trim() }))
        .filter((l) => CYRILLIC.test(l.text)),
    );
    expect(offenders).toEqual([]);
  });

  it("AC-LANG-03: відмова — «Not enough permissions»", () => {
    expect(MESSAGES.FORBIDDEN).toBe("Not enough permissions");
  });

  it("AC-LANG-04: заявка без рядків — «Add at least one line»", () => {
    expect(MESSAGES.NO_LINES).toBe("Add at least one line");
  });

  it("AC-LANG-05: рішення без причини — «Provide a reason»", () => {
    expect(MESSAGES.NO_REASON).toBe("Provide a reason");
  });

  it("AC-LANG-06: статуси підписано текстом «Awaiting approval», «Approved», «Rejected»", () => {
    expect(STATUS_LABEL).toEqual({ pending: "Awaiting approval", approved: "Approved", rejected: "Rejected" });
  });

  it("AC-LANG-08: ідентифікатори ролей без змін, підписи — англійською за таблицею", () => {
    expect(Object.keys(ROLE_LABEL)).toEqual(["requester", "approver", "admin"]);
    expect(ROLE_LABEL).toEqual({ requester: "Requester", approver: "Approver", admin: "Administrator" });
  });

  it("решта текстів з таблиці PM — дослівно", () => {
    expect(PURCHASE_TYPE_LABEL).toEqual({ purchasing_department: "Purchasing department", self_purchase: "Self-purchase" });
    expect(MESSAGES).toMatchObject({
      NOT_REQUESTER: "Add the employee to the department as a requester first",
      LAST_ADMIN: "At least one active administrator must remain",
      DUPLICATE_DEPARTMENT: "A department with this name already exists",
      NO_APPROVER: "No approver",
      NO_DEPARTMENTS: "You have not been added to any department. Contact your administrator.",
      SUBMITTED: "Purchase submitted",
      NO_REQUESTS: "You have not submitted any requests yet",
      NO_DECISIONS: "No requests awaiting your decision",
    });
  });
});
