import { spawnSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { repoRoot } from "./run-script";

// scripts/db-url-ref.sh — ref проєкту Supabase для запобіжників db-deploy-staging і db-deploy (ci.yml, WS11).
// Технічні тести — без AC ID. Рядки вигадані, паролі не справжні.
const REF = "rnawhejsgqhgbtjajjmb";
const ref = (url: string) =>
  spawnSync("sh", [path.join(repoRoot, "scripts", "db-url-ref.sh")], { env: { NODE_ENV: "test", PATH: process.env.PATH ?? "", SUPABASE_DB_URL: url }, encoding: "utf8" })
    .stdout.trim();

describe("db-url-ref.sh", () => {
  it("Session pooler Supabase: ref з імені користувача; postgres:// і postgresql://, з портом і без", () => {
    expect(ref(`postgresql://postgres.${REF}:pw@aws-0-eu-west-1.pooler.supabase.com:5432/postgres`)).toBe(REF);
    expect(ref(`postgres://postgres.${REF}:pw@aws-1-eu-west-1.pooler.supabase.com/postgres`)).toBe(REF);
  });

  it("пряме підключення: ref з хоста db.<ref>.supabase.co", () => {
    expect(ref(`postgresql://postgres:pw@db.${REF}.supabase.co:5432/postgres`)).toBe(REF);
  });

  it("правильний ref в імені, але чужий хост — нічого (запобіжник зупинить db push; CodeRabbit, PR 89)", () => {
    expect(ref(`postgres://postgres.${REF}:pw@db.example.test:5432/postgres`)).toBe("");
    expect(ref(`postgres://postgres.${REF}:pw@pooler.supabase.com.evil.example.test:5432/postgres`)).toBe("");
    expect(ref(`postgres://postgres:pw@db.${REF}.supabase.co.evil.example.test:5432/postgres`)).toBe("");
  });

  it("«@» у паролі не плутає хост: береться останній «@»", () => {
    expect(ref(`postgres://postgres.${REF}:p@ss@aws-0-eu-west-1.pooler.supabase.com:5432/postgres`)).toBe(REF);
    expect(ref(`postgres://postgres.${REF}:p@db.example.test@x:5432/postgres`)).toBe("");
  });

  it("порожньо, не Postgres, короткий ref — нічого", () => {
    expect(ref("")).toBe("");
    expect(ref(`https://${REF}.supabase.co`)).toBe("");
    expect(ref("postgres://postgres.short:pw@aws-0-eu-west-1.pooler.supabase.com:5432/postgres")).toBe("");
  });
});
