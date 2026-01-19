import { defineConfig } from "vite";
import { resolve } from "path";
// TODO: vite-plugin-dts 추가 후 활성화
// import dts from "vite-plugin-dts";

export default defineConfig({
  // plugins: [dts()],  // TypeScript 선언 파일 생성 (추후 활성화)
  build: {
    lib: {
      entry: resolve(__dirname, "src/index.ts"),
      name: "EchoPixelCore",
      formats: ["es", "cjs"],
      fileName: (format) => `index.${format === "es" ? "js" : "cjs"}`,
    },
    rollupOptions: {
      // React는 peer dependency로 외부화
      external: ['react', 'react-dom'],
      output: {
        globals: {
          react: 'React',
          'react-dom': 'ReactDOM',
        },
      },
    },
    sourcemap: true,
    minify: false,
  },
});
