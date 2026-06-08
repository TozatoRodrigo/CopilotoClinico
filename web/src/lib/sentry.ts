import * as Sentry from "@sentry/nextjs";

export function initSentry() {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!dsn || Sentry.isInitialized()) return;
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? "development",
    tracesSampleRate: 0,
  });
}

export { Sentry };
