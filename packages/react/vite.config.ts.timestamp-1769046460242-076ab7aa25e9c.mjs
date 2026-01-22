// vite.config.ts
import { defineConfig } from "file:///C:/Users/amagr/project/echopixel/node_modules/.pnpm/vite@5.4.21_@types+node@20.19.30/node_modules/vite/dist/node/index.js";
import { resolve } from "path";
import react from "file:///C:/Users/amagr/project/echopixel/node_modules/.pnpm/@vitejs+plugin-react@4.7.0_vite@5.4.21_@types+node@20.19.30_/node_modules/@vitejs/plugin-react/dist/index.js";
import dts from "file:///C:/Users/amagr/project/echopixel/node_modules/.pnpm/vite-plugin-dts@4.5.4_@types+node@20.19.30_rollup@4.55.1_typescript@5.9.3_vite@5.4.21_@types+node@20.19.30_/node_modules/vite-plugin-dts/dist/index.mjs";
var __vite_injected_original_dirname = "C:\\Users\\amagr\\project\\echopixel\\packages\\react";
var vite_config_default = defineConfig({
  plugins: [
    react(),
    dts({
      include: ["src/**/*"],
      outDir: "dist",
      rollupTypes: true
      // 모든 타입을 하나의 index.d.ts로 번들
    })
  ],
  build: {
    lib: {
      entry: resolve(__vite_injected_original_dirname, "src/index.ts"),
      name: "EchoPixelReact",
      formats: ["es", "cjs"],
      fileName: (format) => `index.${format === "es" ? "js" : "cjs"}`
    },
    rollupOptions: {
      // React와 core는 외부화
      external: ["react", "react-dom", "react/jsx-runtime", "@echopixel/core"],
      output: {
        globals: {
          react: "React",
          "react-dom": "ReactDOM",
          "react/jsx-runtime": "jsxRuntime",
          "@echopixel/core": "EchoPixelCore"
        }
      }
    },
    sourcemap: true,
    minify: false
  }
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCJDOlxcXFxVc2Vyc1xcXFxhbWFnclxcXFxwcm9qZWN0XFxcXGVjaG9waXhlbFxcXFxwYWNrYWdlc1xcXFxyZWFjdFwiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9maWxlbmFtZSA9IFwiQzpcXFxcVXNlcnNcXFxcYW1hZ3JcXFxccHJvamVjdFxcXFxlY2hvcGl4ZWxcXFxccGFja2FnZXNcXFxccmVhY3RcXFxcdml0ZS5jb25maWcudHNcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfaW1wb3J0X21ldGFfdXJsID0gXCJmaWxlOi8vL0M6L1VzZXJzL2FtYWdyL3Byb2plY3QvZWNob3BpeGVsL3BhY2thZ2VzL3JlYWN0L3ZpdGUuY29uZmlnLnRzXCI7aW1wb3J0IHsgZGVmaW5lQ29uZmlnIH0gZnJvbSBcInZpdGVcIjtcclxuaW1wb3J0IHsgcmVzb2x2ZSB9IGZyb20gXCJwYXRoXCI7XHJcbmltcG9ydCByZWFjdCBmcm9tIFwiQHZpdGVqcy9wbHVnaW4tcmVhY3RcIjtcclxuaW1wb3J0IGR0cyBmcm9tIFwidml0ZS1wbHVnaW4tZHRzXCI7XHJcblxyXG5leHBvcnQgZGVmYXVsdCBkZWZpbmVDb25maWcoe1xyXG4gIHBsdWdpbnM6IFtcclxuICAgIHJlYWN0KCksXHJcbiAgICBkdHMoe1xyXG4gICAgICBpbmNsdWRlOiBbXCJzcmMvKiovKlwiXSxcclxuICAgICAgb3V0RGlyOiBcImRpc3RcIixcclxuICAgICAgcm9sbHVwVHlwZXM6IHRydWUsIC8vIFx1QkFBOFx1QjRFMCBcdUQwQzBcdUM3ODVcdUM3NDQgXHVENTU4XHVCMDk4XHVDNzU4IGluZGV4LmQudHNcdUI4NUMgXHVCQzg4XHVCNEU0XHJcbiAgICB9KSxcclxuICBdLFxyXG4gIGJ1aWxkOiB7XHJcbiAgICBsaWI6IHtcclxuICAgICAgZW50cnk6IHJlc29sdmUoX19kaXJuYW1lLCBcInNyYy9pbmRleC50c1wiKSxcclxuICAgICAgbmFtZTogXCJFY2hvUGl4ZWxSZWFjdFwiLFxyXG4gICAgICBmb3JtYXRzOiBbXCJlc1wiLCBcImNqc1wiXSxcclxuICAgICAgZmlsZU5hbWU6IChmb3JtYXQpID0+IGBpbmRleC4ke2Zvcm1hdCA9PT0gXCJlc1wiID8gXCJqc1wiIDogXCJjanNcIn1gLFxyXG4gICAgfSxcclxuICAgIHJvbGx1cE9wdGlvbnM6IHtcclxuICAgICAgLy8gUmVhY3RcdUM2NDAgY29yZVx1QjI5NCBcdUM2NzhcdUJEODBcdUQ2NTRcclxuICAgICAgZXh0ZXJuYWw6IFtcInJlYWN0XCIsIFwicmVhY3QtZG9tXCIsIFwicmVhY3QvanN4LXJ1bnRpbWVcIiwgXCJAZWNob3BpeGVsL2NvcmVcIl0sXHJcbiAgICAgIG91dHB1dDoge1xyXG4gICAgICAgIGdsb2JhbHM6IHtcclxuICAgICAgICAgIHJlYWN0OiBcIlJlYWN0XCIsXHJcbiAgICAgICAgICBcInJlYWN0LWRvbVwiOiBcIlJlYWN0RE9NXCIsXHJcbiAgICAgICAgICBcInJlYWN0L2pzeC1ydW50aW1lXCI6IFwianN4UnVudGltZVwiLFxyXG4gICAgICAgICAgXCJAZWNob3BpeGVsL2NvcmVcIjogXCJFY2hvUGl4ZWxDb3JlXCIsXHJcbiAgICAgICAgfSxcclxuICAgICAgfSxcclxuICAgIH0sXHJcbiAgICBzb3VyY2VtYXA6IHRydWUsXHJcbiAgICBtaW5pZnk6IGZhbHNlLFxyXG4gIH0sXHJcbn0pO1xyXG4iXSwKICAibWFwcGluZ3MiOiAiO0FBQTZVLFNBQVMsb0JBQW9CO0FBQzFXLFNBQVMsZUFBZTtBQUN4QixPQUFPLFdBQVc7QUFDbEIsT0FBTyxTQUFTO0FBSGhCLElBQU0sbUNBQW1DO0FBS3pDLElBQU8sc0JBQVEsYUFBYTtBQUFBLEVBQzFCLFNBQVM7QUFBQSxJQUNQLE1BQU07QUFBQSxJQUNOLElBQUk7QUFBQSxNQUNGLFNBQVMsQ0FBQyxVQUFVO0FBQUEsTUFDcEIsUUFBUTtBQUFBLE1BQ1IsYUFBYTtBQUFBO0FBQUEsSUFDZixDQUFDO0FBQUEsRUFDSDtBQUFBLEVBQ0EsT0FBTztBQUFBLElBQ0wsS0FBSztBQUFBLE1BQ0gsT0FBTyxRQUFRLGtDQUFXLGNBQWM7QUFBQSxNQUN4QyxNQUFNO0FBQUEsTUFDTixTQUFTLENBQUMsTUFBTSxLQUFLO0FBQUEsTUFDckIsVUFBVSxDQUFDLFdBQVcsU0FBUyxXQUFXLE9BQU8sT0FBTyxLQUFLO0FBQUEsSUFDL0Q7QUFBQSxJQUNBLGVBQWU7QUFBQTtBQUFBLE1BRWIsVUFBVSxDQUFDLFNBQVMsYUFBYSxxQkFBcUIsaUJBQWlCO0FBQUEsTUFDdkUsUUFBUTtBQUFBLFFBQ04sU0FBUztBQUFBLFVBQ1AsT0FBTztBQUFBLFVBQ1AsYUFBYTtBQUFBLFVBQ2IscUJBQXFCO0FBQUEsVUFDckIsbUJBQW1CO0FBQUEsUUFDckI7QUFBQSxNQUNGO0FBQUEsSUFDRjtBQUFBLElBQ0EsV0FBVztBQUFBLElBQ1gsUUFBUTtBQUFBLEVBQ1Y7QUFDRixDQUFDOyIsCiAgIm5hbWVzIjogW10KfQo=
