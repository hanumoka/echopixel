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
      // 워크스페이스 패키지를 소스 파일로 직접 참조 (dev 모드 race condition 해결)
      "@echopixel/core": resolve(__dirname, "../../packages/core/src/index.ts"),
      "@echopixel/react": resolve(__dirname, "../../packages/react/src/index.ts"),
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
