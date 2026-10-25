#!/usr/bin/env node
// Архітектурне правило «авторизація лише через getClaims()» (ADR docs/decisions/0003-server-auth-via-get-claims.md).
// getSession() читає сесію з cookie без перевірки підпису JWT — на сервері їй вірити не можна. Тому в коді застосунку
// жодного getSession: ні виклику, ні посилання (const f = supabase.auth.getSession). Коментарі не перевіряємо — там
// можна пояснити, чому getSession не використовуємо.
// Шукає в src/. Якщо теки src/ немає — у app/, components/ і lib/ кореня.
// Використання: node scripts/check-no-get-session.mjs [--root <dir>]
// Код виходу: 0 — порушень немає, 1 — є порушення, 2 — немає чого перевіряти (ні src/, ні app/, components/, lib/).

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
  } catch {
    return out;
  }
  for (const name of entries) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (EXT.test(name)) out.push(full);
  }
  return out;
}

// Прибирає коментарі `// …` і `/* … */`, зберігаючи переноси рядків (номери рядків не зсуваються).
// Рядкові літерали пропускаємо як є, щоб `"https://…"` не сприйняти за коментар.
function stripComments(text) {
  let out = "";
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    const next = text[i + 1];
    if (c === "/" && next === "/") {
      while (i < text.length && text[i] !== "\n") i++;
    } else if (c === "/" && next === "*") {
      i += 2;
      while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) {
        if (text[i] === "\n") out += "\n";
        i++;
      }
      i += 2;
    } else if (c === '"' || c === "'" || c === "`") {
      const quote = c;
      out += c;
      i++;
      while (i < text.length && text[i] !== quote) {
        if (text[i] === "\\") {
          out += text[i];
          i++;
        }
        out += text[i];
        i++;
      }
      out += text[i] ?? "";
      i++;
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

const problems = [];

for (const file of BASES.flatMap((b) => walk(join(root, b)))) {
  const rel = relative(root, file).split(sep).join("/");
  stripComments(readFileSync(file, "utf8"))
    .split(/\r?\n/)
    .forEach((line, i) => {
      if (/\bgetSession\b/.test(line)) {
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
