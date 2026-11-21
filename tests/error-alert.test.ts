// WS11, трек B: трекер помилок сервера (src/lib/error-alert.ts) шле в Telegram маршрут, назву помилки, digest і рядки
// стеку — і ніколи текст помилки, заголовки, рядок запиту чи значення токена в журналі. Мережі немає: fetch підмінено.
import { describe, expect, it, vi } from "vitest";
import { alertText, createThrottle, reportServerError, SAME_ERROR_PAUSE_MS, stackFrames } from "@/lib/error-alert";

const TOKEN = "123456:test-token-not-real";
const SECRET_TEXT = "user typed: marker-7f3a@example.test";
const request = { method: "POST", path: "/requests/42?q=marker-query", headers: { cookie: "sb-session=marker-cookie" } };
const context = { routePath: "/requests/[id]", routeType: "action", routerKind: "App Router" };
const env = {
  TELEGRAM_BOT_TOKEN: TOKEN,
  TELEGRAM_CHAT_ID: "-100123",
  VERCEL_ENV: "preview",
  APP_ENV: "staging",
  VERCEL_GIT_COMMIT_REF: "staging",
  VERCEL_GIT_COMMIT_SHA: "abcdef1234567",
  VERCEL_DEPLOYMENT_ID: "dpl_test",
};

function errorWithStack() {
  const e = new Error(`${SECRET_TEXT}\nsecond line marker-7f3a`);
  e.stack = [
    `Error: ${SECRET_TEXT}`,
    "second line marker-7f3a",
    "    at decide (/Users/someone/project/.next/server/app/page.js:10:5)",
    "    at C:\\Users\\someone\\project\\src\\lib\\x.ts:3:1",
    "    at node:internal/process/task_queues:95:5",
    "    not a frame",
    "    at a (/var/task/node_modules/pkg/index.js:1:1)",
    "    at b (/var/task/.next/b.js:1:1)",
    "    at c (/var/task/.next/c.js:1:1)",
    "    at d (/var/task/.next/d.js:1:1)",
  ].join("\n");
  return Object.assign(e, { digest: "1234567890" });
}

function send(over: Partial<Parameters<typeof reportServerError>[3]> = {}) {
  const fetchMock = vi.fn(async () => new Response("{}"));
  return {
    fetchMock,
    run: (error: unknown = errorWithStack()) =>
      reportServerError(error, request, context, {
        env,
        fetch: fetchMock as unknown as typeof fetch,
        now: () => 1_000,
        shouldSend: () => true,
        ...over,
      }),
  };
}

describe("stackFrames", () => {
  it("лише рядки «at …» з файлом і рядком, до 5, шлях без імені користувача ОС, без тексту помилки", () => {
    const frames = stackFrames(errorWithStack());
    expect(frames).toHaveLength(5);
    expect(frames[0]).toBe("at decide (.next/server/app/page.js:10:5)");
    expect(frames[1]).toBe("at src/lib\\x.ts:3:1"); // Windows: префікс із іменем користувача прибрано, решта шляху як є
    expect(frames.join("\n")).not.toMatch(/someone|marker-7f3a|not a frame/);
  });

  it("абсолютний шлях поза .next/src/node_modules і шлях з пробілами — лише назва файла з рядком (CodeRabbit, PR 97)", () => {
    const e = new Error("x");
    e.stack = [
      "Error: x",
      "    at run (/Users/synthetic-user/project/dist/handler.js:10:5)",
      "    at /home/someone/my app/build/chunk 1.js:3:7",
      "    at boot (C:\\Users\\someone\\proj\\out\\main.js:1:2)",
      "    at page (/Users/synthetic-user/My Projects/app/.next/server/page.js:4:4)",
      "    at node:internal/process/task_queues:95:5",
    ].join("\n");
    const frames = stackFrames(e);
    expect(frames).toEqual([
      "at run (handler.js:10:5)",
      "at chunk 1.js:3:7",
      "at boot (main.js:1:2)",
      "at page (.next/server/page.js:4:4)",
      "at node:internal/process/task_queues:95:5",
    ]);
    expect(frames.join("\n")).not.toMatch(/synthetic-user|someone|Users|home/);
  });

  it("не Error чи без стеку — порожньо", () => {
    expect(stackFrames("boom")).toEqual([]);
    const e = new Error("x");
    e.stack = undefined;
    expect(stackFrames(e)).toEqual([]);
  });

  it("заголовок стеку не збігається з name: message — пропускає стільки ж рядків, скільки в заголовку", () => {
    const e = new Error("one");
    e.stack = "CustomPrefix one\n    at f (/var/task/.next/f.js:1:1)";
    expect(stackFrames(e)).toEqual(["at f (.next/f.js:1:1)"]);
  });

  it("помилка без тексту — заголовок лише назва", () => {
    const e = new TypeError();
    e.stack = "TypeError\n    at g (/var/task/src/g.ts:2:3)";
    expect(stackFrames(e)).toEqual(["at g (src/g.ts:2:3)"]);
  });
});

describe("alertText", () => {
  it("маршрут-шаблон, тип, метод, назва, digest, середовище, гілка, деплой, коміт і стек — без тексту, query й cookie", () => {
    const text = alertText(errorWithStack(), request, context, env);
    expect(text).toContain("Environment: staging (branch staging)");
    expect(text).toContain("Route: POST /requests/[id] (action, App Router)");
    expect(text).toContain("Error: Error, digest 1234567890");
    expect(text).toContain("Deployment: dpl_test, commit abcdef1");
    expect(text).toContain("Stack (top frames):");
    expect(text).not.toMatch(/marker-7f3a|marker-query|marker-cookie|someone/);
  });

  it("без змінних Vercel — local, без гілки, «?» замість деплою; не-Error — тип значення; без стеку — без розділу стеку", () => {
    const text = alertText("boom", request, context, {});
    expect(text).toContain("Environment: local\n");
    expect(text).toContain("Error: string\n");
    expect(text).toContain("Deployment: ?, commit local");
    expect(text).not.toContain("Stack");
    expect(alertText(null, request, context, { VERCEL_ENV: "production", APP_ENV: " " })).toContain("Environment: production\n");
  });
});

describe("createThrottle", () => {
  it("той самий ключ — не частіше разу на хвилину; інший ключ — одразу", () => {
    const allow = createThrottle();
    expect(allow("a", 0)).toBe(true);
    expect(allow("a", SAME_ERROR_PAUSE_MS - 1)).toBe(false);
    expect(allow("b", 1)).toBe(true);
    expect(allow("a", SAME_ERROR_PAUSE_MS)).toBe(true);
  });
});

describe("reportServerError", () => {
  it("шле одне повідомлення в Telegram з chat_id і текстом; у тілі немає тексту помилки, query й cookie", async () => {
    const { fetchMock, run } = send();
    await run();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`https://api.telegram.org/bot${TOKEN}/sendMessage`);
    const body = JSON.parse(String(init.body));
    expect(body.chat_id).toBe("-100123");
    expect(body.text).toContain("SERVER ERROR");
    expect(String(init.body)).not.toMatch(/marker-7f3a|marker-query|marker-cookie/);
  });

  it("без токена чи chat id — нічого не шле", async () => {
    for (const over of [{ TELEGRAM_BOT_TOKEN: "" }, { TELEGRAM_CHAT_ID: undefined }]) {
      const { fetchMock, run } = send({ env: { ...env, ...over } });
      await run();
      expect(fetchMock).not.toHaveBeenCalled();
    }
  });

  it("ключ пригальмовування — маршрут і digest, а без digest — назва помилки; пригальмоване не шле", async () => {
    const keys: string[] = [];
    const { fetchMock, run } = send({ shouldSend: (key) => (keys.push(key), false) });
    await run();
    await run(new RangeError("x"));
    expect(keys).toEqual(["/requests/[id]|1234567890", "/requests/[id]|RangeError"]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("Telegram недоступний — помилку fetch ковтає й нічого не друкує (в адресі токен)", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchMock = vi.fn(async () => {
      throw new TypeError(`fetch failed https://api.telegram.org/bot${TOKEN}/sendMessage`);
    });
    await expect(
      reportServerError(errorWithStack(), request, context, {
        env,
        fetch: fetchMock as unknown as typeof fetch,
        now: () => 0,
        shouldSend: () => true,
      }),
    ).resolves.toBeUndefined();
    expect(log).not.toHaveBeenCalled();
    log.mockRestore();
  });
});
