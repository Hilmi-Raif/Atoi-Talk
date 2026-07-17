/// <reference types="vitest/config" />
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import * as path from "node:path";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: "auto",
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
      workbox: {
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        globPatterns: ["**/*.{js,css,html,ico,png,svg,webp,woff2}"],
        navigateFallbackDenylist: [/^\/api\//],
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./test/setup.ts"],
    css: false,
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
