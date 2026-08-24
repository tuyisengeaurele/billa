import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: "html",
  use: {
    baseURL: "http://localhost:5173",
    trace: "on-first-retry",
  },
  expect: {
    toHaveScreenshot: {
      // Framer Motion reveal/hover transitions would otherwise make screenshots flaky.
      animations: "disabled",
    },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } }],
  webServer: [
    {
      command: "npm run dev --workspace=server",
      url: "http://localhost:4000/health",
      reuseExistingServer: !process.env.CI,
      cwd: "..",
      timeout: 60000,
    },
    {
      command: "npm run dev --workspace=client",
      url: "http://localhost:5173",
      reuseExistingServer: !process.env.CI,
      cwd: "..",
      timeout: 60000,
    },
  ],
});
