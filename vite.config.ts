/// <reference types="vitest/config" />
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import * as path from "node:path";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: false,
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      pwaAssets: {
        config: true,
        image: "public/pwa.png",
        overrideManifestIcons: true,
        includeHtmlHeadLinks: false,
      },
      manifest: {
        name: "AtoiTalk",
        short_name: "AtoiTalk",
        description: "AtoiTalk chat application",
        theme_color: "#09090b",
        background_color: "#09090b",
        display: "standalone",
        display_override: ["window-controls-overlay", "standalone", "minimal-ui"],
        orientation: "portrait",
        scope: "/",
        start_url: "/chat",
        categories: ["social", "communication"],
        lang: "en",
      },
      injectManifest: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,webp,woff2}"],
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    include: ["src/**/*.test.{ts,tsx}"],
    globals: true,
    environment: "jsdom",
    setupFiles: ["./test/setup.ts"],
    css: false,
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/*.test.{ts,tsx}", "src/**/__tests__/**", "src/**/*.d.ts", "src/types/**"],
      reporter: ["text-summary", "json-summary", "json", "html"],
      thresholds: { lines: 90, statements: 90, functions: 90, branches: 90 },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          "admin-bundle": [
            "./src/pages/admin/dashboard.tsx",
            "./src/pages/admin/users.tsx",
            "./src/layouts/admin-layout.tsx",
          ],
        },
      },
    },
  },
});
