import { describe, expect, it, vi } from "vitest";
import {
  assertSameDatabase,
  bypassHeaders,
  fetchTargetHealth,
  isVercelHost,
  refFromSupabaseUrl,
  targetProblem,
} from "../../scripts/uat/target.mjs";

// Запобіжник UAT на розгорнутій адресі (R03 WS11): до першого запису ref Supabase цілі = ref з .env.local; заголовок
// обходу Vercel — лише з секретом і лише на *.vercel.app. Технічні тести — без AC ID. Мережі немає: fetch підмінено.
const STAGING = "rnawhejsgqhgbtjajjmb";
const PROD = "tqbvafkcniaspvluverp";
const BASE = "https://school-purchasing-git-staging-mvorobets-blip.vercel.app";
const SECRET = "bypass-test-value-not-real-0123456789";

const reply = (status: number, body: unknown) => vi.fn(async () => new Response(JSON.stringify(body), { status }));

describe("refFromSupabaseUrl", () => {
  it("ref з https://<ref>.supabase.co; інший хост, порожньо чи не адреса — null", () => {
    expect(refFromSupabaseUrl(`https://${STAGING}.supabase.co`)).toBe(STAGING);
    expect(refFromSupabaseUrl(`https://${STAGING}.supabase.co.evil.example.test`)).toBeNull();
    expect(refFromSupabaseUrl(undefined)).toBeNull();
    expect(refFromSupabaseUrl("not a url")).toBeNull();
  });
});

describe("bypassHeaders", () => {
  it("секрет і *.vercel.app — заголовок обходу й cookie обходу (приклад Playwright Vercel)", () => {
    expect(bypassHeaders(BASE, ` ${SECRET} `)).toEqual({ "x-vercel-protection-bypass": SECRET, "x-vercel-set-bypass-cookie": "true" });
  });

  it("без секрету, на чужому хості чи не адреса — без заголовків", () => {
    expect(bypassHeaders(BASE, "")).toEqual({});
    expect(bypassHeaders(BASE, undefined)).toEqual({});
    expect(bypassHeaders("https://school.example.test", SECRET)).toEqual({});
    expect(isVercelHost("not a url")).toBe(false);
  });
});

describe("targetProblem", () => {
  it("той самий ref — можна писати", () => {
    expect(targetProblem({ base: BASE, healthStatus: 200, healthRef: STAGING, localRef: STAGING })).toBeNull();
  });

  it("різні ref — зупинка з обома ref, до запису", () => {
    const problem = targetProblem({ base: BASE, healthStatus: 200, healthRef: STAGING, localRef: PROD });
    expect(problem).toContain(`базою ${STAGING}, а .env.local — з ${PROD}`);
  });

  it("немає ref у .env.local, немає supabaseRef у health, стіна Vercel, збій мережі — зупинка з причиною", () => {
    expect(targetProblem({ base: BASE, healthStatus: 200, healthRef: STAGING, localRef: null })).toContain("NEXT_PUBLIC_SUPABASE_URL");
    expect(targetProblem({ base: BASE, healthStatus: 200, healthRef: null, localRef: STAGING })).toContain("не віддає supabaseRef");
    for (const status of [401, 403, 302]) {
      expect(targetProblem({ base: BASE, healthStatus: status, healthRef: null, localRef: STAGING })).toContain("VERCEL_AUTOMATION_BYPASS_SECRET");
    }
    expect(targetProblem({ base: BASE, healthStatus: 503, healthRef: null, localRef: STAGING })).toContain("відповів 503");
    expect(targetProblem({ base: BASE, healthStatus: 0, healthRef: null, localRef: STAGING })).toContain("помилкою мережі");
  });
});

describe("fetchTargetHealth і assertSameDatabase", () => {
  it("питає /api/health цілі із заголовком обходу без автопереходу за редиректом", async () => {
    const fetchMock = reply(200, { supabaseRef: STAGING, sha: "abc1234" });
    expect(await fetchTargetHealth(BASE, SECRET, fetchMock as unknown as typeof fetch)).toEqual({ status: 200, supabaseRef: STAGING, sha: "abc1234" });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${BASE}/api/health`);
    expect(init.redirect).toBe("manual");
    expect((init.headers as Record<string, string>)["x-vercel-protection-bypass"]).toBe(SECRET);
  });

  it("не-JSON чи помилка мережі — статус і null-и, без винятку", async () => {
    const html = vi.fn(async () => new Response("<html>", { status: 401 }));
    expect(await fetchTargetHealth(BASE, "", html as unknown as typeof fetch)).toEqual({ status: 401, supabaseRef: null, sha: null });
    const down = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    expect(await fetchTargetHealth(BASE, "", down as unknown as typeof fetch)).toEqual({ status: 0, supabaseRef: null, sha: null });
  });

  it("збіг — повертає ref; розбіжність — Error «UAT зупинено», секрет у тексті не з'являється", async () => {
    const env = { NEXT_PUBLIC_SUPABASE_URL: `https://${STAGING}.supabase.co`, VERCEL_AUTOMATION_BYPASS_SECRET: SECRET };
    await expect(assertSameDatabase(BASE, env, reply(200, { supabaseRef: STAGING }) as unknown as typeof fetch)).resolves.toBe(STAGING);
    const error = await assertSameDatabase(BASE, env, reply(200, { supabaseRef: PROD }) as unknown as typeof fetch).catch((e: Error) => e);
    expect(String(error)).toContain("UAT зупинено");
    expect(String(error)).not.toContain(SECRET);
  });
});
