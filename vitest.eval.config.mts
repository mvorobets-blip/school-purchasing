import { existsSync } from "node:fs";
import { defineConfig } from "vitest/config";

// `npm run eval` — живий прогін golden cases на безкоштовних моделях. Ніколи не частина `npm test` / CI:
// основний vitest.config.mts бере лише *.test.ts(x), а цей — лише evals/**/*.eval.ts.
// Основа — vitest.eval.config.mts набору курсу; .env.local читає Node (process.loadEnvFile), а не `loadEnv` з vite:
// vite — непряма залежність, і fallow позначив би її як неоголошену.
if (existsSync(".env.local")) process.loadEnvFile(".env.local");

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
    include: ["evals/**/*.eval.ts"],
    fileParallelism: false, // по одному запиту: безкоштовний тариф — 20 запитів/хв
    testTimeout: 120_000,
    hookTimeout: 30_000,
    expect: { requireAssertions: true },
  },
});
