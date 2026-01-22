import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";
import tailwindcss from "tailwindcss";
import autoprefixer from "autoprefixer";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
  css: {
    postcss: {
      plugins: [
        tailwindcss({
          config: resolve(__dirname, "../../tailwind.config.ts"),
        }),
        autoprefixer(),
      ],
    },
  },
  server: {
    host: '0.0.0.0',  // 모든 IP에서 접속 허용
    port: 3000,
    open: true,
  },
});
