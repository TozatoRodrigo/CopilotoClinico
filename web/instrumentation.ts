export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { init } = await import("@sentry/nextjs");
    const dsn = process.env.SENTRY_DSN;
    if (dsn) {
      init({ dsn, environment: process.env.NODE_ENV ?? "development", tracesSampleRate: 0 });
    }
  }
}
