import { defineConfig } from "vite";
import { resolve } from "path";
import react from "@vitejs/plugin-react";
import dts from "vite-plugin-dts";

export default defineConfig({
  plugins: [
    react(),
    dts({
      include: ["src/**/*"],
      outDir: "dist",
      rollupTypes: true, // 모든 타입을 하나의 index.d.ts로 번들
    }),
  ],
  build: {
    lib: {
      entry: resolve(__dirname, "src/index.ts"),
      name: "EchoPixelReact",
      formats: ["es", "cjs"],
      fileName: (format) => `index.${format === "es" ? "js" : "cjs"}`,
    },
    rollupOptions: {
      // React와 core는 외부화
      external: ["react", "react-dom", "react/jsx-runtime", "@echopixel/core"],
      output: {
        globals: {
          react: "React",
          "react-dom": "ReactDOM",
          "react/jsx-runtime": "jsxRuntime",
          "@echopixel/core": "EchoPixelCore",
        },
      },
    },
    sourcemap: true,
    minify: false,
  },
});
