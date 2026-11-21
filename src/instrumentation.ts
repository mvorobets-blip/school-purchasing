// Трекер помилок сервера (WS11, трек B): Next.js викликає onRequestError на кожну необроблену помилку сервера.
// Уся логіка й правила «що не надсилаємо» — у src/lib/error-alert.ts. Тут лише змінні середовища: їх читаємо під час
// виклику, а не імпорту, щоб Redeploy зі зміненими змінними Vercel діяв без змін коду.
import type { Instrumentation } from "next";
import { createThrottle, reportServerError } from "@/lib/error-alert";

const shouldSend = createThrottle();

export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  await reportServerError(error, request, context, {
    env: {
      TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
      TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID,
      APP_ENV: process.env.APP_ENV,
      VERCEL_ENV: process.env.VERCEL_ENV,
      VERCEL_GIT_COMMIT_REF: process.env.VERCEL_GIT_COMMIT_REF,
      VERCEL_GIT_COMMIT_SHA: process.env.VERCEL_GIT_COMMIT_SHA,
      VERCEL_DEPLOYMENT_ID: process.env.VERCEL_DEPLOYMENT_ID,
    },
    fetch,
    now: Date.now,
    shouldSend,
  });
};
