import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { repoRoot } from "./run-script";

// Профіль «лише пропонує» для розбору інциденту (WS11, трек C, R08): агент читає журнали й деплої через MCP Vercel і
// Supabase, але нічого не змінює й секретів не бачить. Тест тримає правила, на які дивиться рубрика, щоб наступна правка
// налаштувань не прибрала їх непомітно. Технічні тести — без AC ID.
type Settings = { permissions: { allow?: string[]; ask?: string[]; deny?: string[]; defaultMode?: string; disableBypassPermissionsMode?: string } };
const read = <T,>(file: string) => JSON.parse(readFileSync(path.join(repoRoot, file), "utf8")) as T;

const daily = read<Settings>(".claude/settings.json").permissions;
const incident = read<Settings>(".claude/settings.incident.json").permissions;
const mcp = read<{ mcpServers: Record<string, { type: string; url: string }> }>(".mcp.incident.json").mcpServers;

// Відкат, Promote, деплой, змінні середовища (зміна й читання значень), захист і обхід захисту — R08 «Що перевірити».
const MUST_DENY = [
  "mcp__vercel__request_rollback",
  "mcp__vercel__request_promote",
  "mcp__vercel__create_deployment",
  "mcp__vercel__deploy_to_vercel",
  "mcp__vercel__create_project_env",
  "mcp__vercel__edit_project_env",
  "mcp__vercel__get_project_env",
  "mcp__vercel__update_project_deployment_protection",
  "mcp__vercel__update_project_protection_bypass",
  "mcp__vercel__patch_url_protection_bypass",
  "mcp__supabase__apply_migration",
  "mcp__supabase__pause_project",
  // Звірка зі списком /mcp перед дрілом 23.11 (275 інструментів): запис чи читання вмісту поза R08 (CodeRabbit PR 107).
  "mcp__vercel__create_ai_gateway_api_key",
  "mcp__vercel__create_ai_gateway_rule",
  "mcp__vercel__update_ai_gateway_rule",
  "mcp__vercel__create_ai_gateway_virtual_model",
  "mcp__vercel__update_ai_gateway_virtual_model",
  "mcp__vercel__upsert_ai_gateway_budget",
  "mcp__vercel__upsert_ai_gateway_budget_default",
  "mcp__vercel__fork_drive",
  "mcp__vercel__create_trace_session",
  "mcp__vercel__generate_route",
  "mcp__vercel__get_named_sandbox",
  "mcp__vercel__read_session_file",
  "mcp__vercel__artifact_query",
  "mcp__vercel__start_board_thread",
  "mcp__vercel__reply_to_board_thread",
  "mcp__vercel__react_to_board_message",
  "mcp__vercel__label_board_message",
];

describe("профіль «лише пропонує» (R08)", () => {
  for (const [name, perms] of [
    [".claude/settings.json", daily],
    [".claude/settings.incident.json", incident],
  ] as const) {
    it(`${name}: інструменти запису й розкриття секретів MCP — у deny повними назвами`, () => {
      for (const tool of MUST_DENY) expect(perms.deny).toContain(tool);
    });

    it(`${name}: жодного шаблону на кшталт mcp__vercel__* чи mcp__vercel__get_* — лише повні назви`, () => {
      const mcpRules = [...(perms.allow ?? []), ...(perms.ask ?? []), ...(perms.deny ?? [])].filter((r) => r.startsWith("mcp__"));
      expect(mcpRules.length).toBeGreaterThan(0);
      expect(mcpRules.filter((r) => r.includes("*"))).toEqual([]);
    });

    it(`${name}: інструменти, що вміють показати значення змінних чи виконати довільний SQL, — лише з питанням`, () => {
      expect(perms.ask).toEqual(expect.arrayContaining(["mcp__vercel__filter_project_envs", "mcp__supabase__execute_sql"]));
      expect(perms.allow ?? []).not.toContain("mcp__vercel__filter_project_envs");
    });

    // `vercel` без підкоманди = `vercel deploy` (`vercel --yes` розгортає), тож `*vercel deploy*` його не ловить (CodeRabbit PR 101).
    it(`${name}: виклик vercel без підкоманди (vercel, vercel --yes) — у deny для обох оболонок`, () => {
      expect(perms.deny).toEqual(
        expect.arrayContaining(["Bash(*vercel)", "Bash(*vercel -*)", "PowerShell(*vercel)", "PowerShell(*vercel -*)"]),
      );
    });

    it(`${name}: жоден інструмент не і в allow, і в deny`, () => {
      const deny = new Set(perms.deny);
      expect((perms.allow ?? []).filter((a) => deny.has(a))).toEqual([]);
    });
  }

  it("профіль дрілу: режим plan, режим «без питань» вимкнено, Edit/Write і git push заборонено", () => {
    expect(incident.defaultMode).toBe("plan");
    expect(incident.disableBypassPermissionsMode).toBe("disable");
    expect(incident.deny).toEqual(expect.arrayContaining(["Edit", "Write", "Bash(git push*)", "Read(.env*)"]));
    // `git diff --output=<файл>` пише файл попри deny на Edit/Write (CodeRabbit PR 101).
    expect(incident.deny).toEqual(expect.arrayContaining(["Bash(git diff *--output*)", "PowerShell(git diff *--output*)"]));
  });

  it(".mcp.incident.json: Supabase лише на читання й лише проєкт staging; Vercel через OAuth; токенів у файлі немає", () => {
    const supabase = new URL(mcp.supabase.url);
    expect(supabase.searchParams.get("read_only")).toBe("true");
    expect(supabase.searchParams.get("project_ref")).toBe("rnawhejsgqhgbtjajjmb"); // staging, не прод (tqbv…)
    expect(mcp.vercel.url).toBe("https://mcp.vercel.com");
    const raw = readFileSync(path.join(repoRoot, ".mcp.incident.json"), "utf8");
    expect(raw).not.toMatch(/token|apikey|api_key|authorization|bearer|sb_secret_|sbp_/i);
  });
});
