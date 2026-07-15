import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// https://vite.dev/config/
export default defineConfig({
  base: "./", // 相对路径，适配 GitHub Pages 子路径部署
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      workbox: { maximumFileSizeToCacheInBytes: 6 * 1024 * 1024 },
      manifest: {
        name: "直播间工资结算",
        short_name: "直播工资",
        description: "抖音/小红书直播间营收截图 → 工资结算与月报",
        theme_color: "#0b1220",
        background_color: "#0b1220",
        display: "standalone",
        start_url: "./",
        icons: [
          { src: "favicon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
});
