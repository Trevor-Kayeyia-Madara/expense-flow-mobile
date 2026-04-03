import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  // Use relative asset paths so `dist/` can be opened from any path (or even via file://)
  // without breaking CSS/JS links.
  base: "./",
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      // Avoid service worker caching headaches during local development.
      devOptions: { enabled: false },
      manifest: {
        name: "ExpenseFlow",
        short_name: "ExpenseFlow",
        start_url: ".",
        scope: ".",
        display: "standalone",
        background_color: "#0b1220",
        theme_color: "#0b1220"
      }
    })
  ],
  server: { port: 5173 }
});
