import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { workspaceIdentity } from "./scripts/workspace-identity.mjs";
import { previewPort } from "./scripts/preview-port.mjs";

export default defineConfig({
  server: { host: "127.0.0.1", port: previewPort, strictPort: true },
  optimizeDeps: { entries: ["index.html"] },
  plugins: [workspaceIdentity, react(), tailwindcss()],
  test: {
    include: ["tests/**/*.test.{js,jsx}"],
    environment: "jsdom",
    setupFiles: "./tests/setup.js",
  },
});
