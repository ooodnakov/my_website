import { defineConfig, devices } from "@playwright/test";

const production = process.env.PLAYWRIGHT_TEST_PRODUCTION === "1";

export default defineConfig({
  testDir: "./client/e2e",
  testMatch: ["**/terminal.spec.ts", "**/routes.spec.ts"],
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: true,
  workers: 2,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:5000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: production ? "pnpm start" : "pnpm dev",
    url: "http://127.0.0.1:5000",
    reuseExistingServer: false,
    env: { PORT: "5000" },
    timeout: 60_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
