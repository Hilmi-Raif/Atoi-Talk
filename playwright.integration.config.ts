import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e/integration",
  testMatch:
    process.env.E2E_CAPTCHA_MISMATCH === "true"
      ? "captcha-mismatch.spec.ts"
      : process.env.E2E_CAPTCHA_ENABLED === "true"
        ? "captcha-enabled.spec.ts"
        : "realtime.spec.ts",
  timeout: 90000,
  expect: { timeout: 15000 },
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: [["list"], ["html", { outputFolder: "playwright-report/integration", open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:4174",
    serviceWorkers: "block",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "integration-chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "pnpm build && pnpm preview --host 127.0.0.1 --port 4174 --strictPort",
    url: "http://127.0.0.1:4174",
    reuseExistingServer: false,
    env: {
      VITE_API_BASE_URL: "http://127.0.0.1:18080",
      VITE_WS_URL: "ws://127.0.0.1:18081/ws",
      VITE_PUSH_ENABLED: "false",
      VITE_DEBUG_LOGS: "false",
      VITE_CAPTCHA_ENABLED: process.env.E2E_CAPTCHA_ENABLED === "true" ? "true" : "false",
      VITE_TURNSTILE_SITE_KEY: "1x00000000000000000000AA",
    },
    timeout: 120000,
  },
});
