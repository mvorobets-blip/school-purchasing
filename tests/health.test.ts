// D0: /api/health відрізняє «база відповіла» від «база недоступна, призупинена чи ключ хибний».
import { describe, expect, it } from "vitest";
import { classifyDbProbe } from "@/lib/health";

describe("classifyDbProbe (/api/health)", () => {
  it("рахує базу живою, коли запит пройшов або Postgres відмовив у правах (42501)", () => {
    expect(classifyDbProbe({ status: 200, error: null })).toEqual({ db: "ok", reason: "" });
    expect(classifyDbProbe({ status: 401, error: { code: "42501", message: "permission denied for table profiles" } })).toEqual({
      db: "ok",
      reason: "",
    });
    expect(classifyDbProbe({ status: 400, error: { code: "PGRST100", message: "bad filter" } }).db).toBe("ok");
  });

  it("повідомляє «paused», коли Supabase відповідає 540 (безкоштовний проєкт призупинено)", () => {
    expect(classifyDbProbe({ status: 540, error: { message: "project paused" } })).toEqual({ db: "down", reason: "paused" });
  });

  it("повідомляє про хибний публічний ключ", () => {
    expect(classifyDbProbe({ status: 401, error: { message: "Invalid API key" } })).toEqual({
      db: "down",
      reason: "invalid-api-key",
    });
  });

  it("рахує базу нездоровою для SQLSTATE з'єднання, ресурсів і зупинки (08, 53, 57)", () => {
    expect(classifyDbProbe({ status: 500, error: { code: "53300", message: "too many connections" } })).toEqual({
      db: "down",
      reason: "status-500-53300",
    });
    expect(classifyDbProbe({ status: 503, error: { code: "57P03", message: "cannot connect now" } }).db).toBe("down");
    expect(classifyDbProbe({ status: 500, error: { code: "08006", message: "connection failure" } }).db).toBe("down");
  });

  it("рахує базу нездоровою, коли таблиці чи колонки запиту перевірки немає (42P01, 42703)", () => {
    expect(classifyDbProbe({ status: 404, error: { code: "42P01", message: 'relation "public.profiles" does not exist' } })).toEqual({
      db: "down",
      reason: "status-404-42P01",
    });
    expect(classifyDbProbe({ status: 400, error: { code: "42703", message: "column profiles.id does not exist" } }).db).toBe("down");
  });

  it("повідомляє код, коли PostgREST не дістає до бази або мережі немає", () => {
    expect(classifyDbProbe({ status: 503, error: { code: "PGRST002", message: "schema cache" } })).toEqual({
      db: "down",
      reason: "status-503-PGRST002",
    });
    expect(classifyDbProbe({ status: 0, error: { message: "fetch failed" } })).toEqual({ db: "down", reason: "status-0" });
    // 5xx з порожнім тілом: supabase-js віддає error === null.
    expect(classifyDbProbe({ status: 500, error: null })).toEqual({ db: "down", reason: "status-500" });
    expect(classifyDbProbe({ status: 500, error: { code: "PGRSTX00", message: "connection library error" } })).toEqual({
      db: "down",
      reason: "status-500-PGRSTX00",
    });
    // PGRST121 (не розібрано JSON у RAISE) — база відповіла.
    expect(classifyDbProbe({ status: 500, error: { code: "PGRST121", message: "could not parse RAISE" } }).db).toBe("ok");
  });
});
