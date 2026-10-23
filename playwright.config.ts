import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  use: { baseURL: "http://127.0.0.1:4173", headless: true },
  webServer: [
    {
      command: "VITE_DEMO_MODE=true npm run dev -- --port 4173",
      url: "http://127.0.0.1:4173",
      reuseExistingServer: false,
    },
    {
      command:
        "VITE_DEMO_MODE=true npm run build && npx vite preview --host 127.0.0.1 --port 4174",
      url: "http://127.0.0.1:4174",
      reuseExistingServer: false,
    },
  ],
  projects: [
    {
      name: "desktop",
      testMatch: "dashboard.spec.ts",
      use: { viewport: { width: 1440, height: 1000 } },
    },
    {
      name: "mobile",
      testMatch: "dashboard.spec.ts",
      use: { viewport: { width: 390, height: 844 } },
    },
    {
      name: "production",
      testMatch: "production.spec.ts",
      use: { baseURL: "http://127.0.0.1:4174" },
    },
  ],
});
