import { defineConfig } from "@playwright/test";

const port = Number.parseInt(process.env.PLAYWRIGHT_PORT ?? "34173", 10);
const webServerCommand =
  process.env.PLAYWRIGHT_WEB_SERVER_COMMAND ?? `npx serve dist -l ${port}`;

export default defineConfig({
  testDir: "./tests",
  timeout: 60_000,
  expect: {
    timeout: 15_000,
  },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${port}`,
    headless: true,
    launchOptions: {
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
    },
  },
  webServer: {
    command: webServerCommand,
    port,
    reuseExistingServer: true,
  },
  projects: [
    {
      name: "firefox",
      use: { browserName: "firefox" },
    },
  ],
});
