import { defineConfig } from "@playwright/test";
import { previewPort } from "./scripts/preview-port.mjs";

const port = previewPort + 1;
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./browser",
  use: {
    baseURL,
    browserName: "chromium",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: `npm run preview -- --port ${port} --strictPort`,
    url: baseURL,
    reuseExistingServer: false,
  },
});
