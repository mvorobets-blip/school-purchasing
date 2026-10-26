#!/usr/bin/env node
// Архітектурне правило «авторизація лише через getClaims()» (ADR docs/decisions/0003-server-auth-via-get-claims.md).
// getSession() читає сесію з cookie без перевірки підпису JWT — на сервері їй вірити не можна. Тому в коді застосунку
// жодного getSession: ні виклику, ні посилання (const f = supabase.auth.getSession). Пропускаємо лише коментарі, що
// починаються на початку рядка (`//`, `/* … */`) — там можна пояснити, чому getSession не використовуємо. Усе інше перевіряємо,
// зокрема код із коментарем у кінці рядка: краще зайва тривога, ніж пропущений виклик (`//` трапляється й у JSX-тексті,
// URL чи regex, тож «вирізати коментарі» в середині рядка ненадійно).
// Шукає в src/. Якщо теки src/ немає — у app/, components/ і lib/ кореня.
// Використання: node scripts/check-no-get-session.mjs [--root <dir>]
// Код виходу: 0 — порушень немає, 1 — є порушення, 2 — немає чого перевіряти (ні src/, ні app/, components/, lib/)
// або теку чи файл не вдалося прочитати.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const args = process.argv.slice(2);
const rootIdx = args.indexOf("--root");
const root = rootIdx >= 0 ? args[rootIdx + 1] : process.cwd();

const isDir = (p) => {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
};

const hasSrc = isDir(join(root, "src"));
const BASES = hasSrc ? ["src"] : ["app", "components", "lib"].filter((d) => isDir(join(root, d)));
if (BASES.length === 0) {
  console.error(`check-no-get-session: у ${root} немає ні src/, ні app/, components/, lib/ — вкажіть --root <корінь проєкту>.`);
  process.exit(2);
}
const SKIP_DIRS = new Set(["node_modules", ".next", ".git"]);
const EXT = /\.(tsx?|jsx?|mjs|cjs)$/;

function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch (error) {
    // Непрочитана тека — не «порушень немає»: інакше скрипт сказав би OK, не перевіривши файли.
    console.error(`check-no-get-session: не вдалося прочитати теку ${dir}: ${error.message}`);
    process.exit(2);
  }
  for (const name of entries) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (EXT.test(name)) out.push(full);
  }
  return out;
}

// Код кожного рядка без коментарів, що починаються на початку рядка: `// …` і `/* … */`, зокрема багаторядкових
// (стан «всередині /* … */» тримаємо між рядками; `*` на початку пропускаємо лише всередині справжнього коментаря).
// Код після `*/` перевіряємо; коментар посеред коду не вирізаємо — краще зайва тривога, ніж пропущений виклик.
// Межа рядкового правила: рядок тексту багаторядкового template literal, що починається з `//`, буде пропущено
// (розрізнити його з коментарем може лише TS-лексер); у коді проєкту таких конструкцій немає.
function codeLines(text) {
  let inBlock = false;
  return text.split(/\r?\n/).map((line) => {
    let rest = line;
    for (;;) {
      if (inBlock) {
        const end = rest.indexOf("*/");
        if (end < 0) return "";
        rest = rest.slice(end + 2);
        inBlock = false;
      }
      const t = rest.trimStart();
      if (t.startsWith("//")) return "";
      if (!t.startsWith("/*")) return rest;
      inBlock = true;
      rest = t.slice(2);
    }
  });
}

function readSource(file, rel) {
  try {
    return readFileSync(file, "utf8");
  } catch (error) {
    console.error(`check-no-get-session: не вдалося прочитати файл ${rel}: ${error.message}`);
    process.exit(2);
  }
}

const problems = [];

for (const file of BASES.flatMap((b) => walk(join(root, b)))) {
  const rel = relative(root, file).split(sep).join("/");
  codeLines(readSource(file, rel)).forEach((code, i) => {
    if (/\bgetSession\b/.test(code)) {
      problems.push(`${rel}:${i + 1}  getSession — на сервері не перевіряє підпис JWT; використовуйте supabase.auth.getClaims()`);
    }
  });
}

if (!hasSrc) console.log(`check-no-get-session: теки src/ немає — перевіряю ${BASES.map((b) => `${b}/`).join(", ")}.`);
if (problems.length === 0) {
  console.log("check-no-get-session: OK — авторизація лише через getClaims().");
  process.exit(0);
}
for (const p of problems) console.log(p);
console.log(`\ncheck-no-get-session: ${problems.length} порушень. Правило — docs/decisions/0003-server-auth-via-get-claims.md.`);
process.exit(1);
