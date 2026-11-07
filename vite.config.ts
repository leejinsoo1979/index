import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { localApi } from "./vite-plugins/local-api";
import { wikiRuntime } from "./vite-plugins/wiki-runtime";

export default defineConfig(({ command }) => ({
  plugins: [react(), tailwindcss(), wikiRuntime(), localApi()],
  resolve: {
    // Keep hooks bound to the same React instance even when Vite rebuilds its
    // dependency graph after packages are installed while the dev server runs.
    dedupe: ["react", "react-dom"],
    alias: {
      // Ported ARCHI Agent Studio (src/archi): original package names + Next.js shims.
      "@archi-web": path.resolve(__dirname, "src/archi/web"),
      "@archi/db": path.resolve(__dirname, "src/archi/db/index.ts"),
      ...Object.fromEntries(
        ["shared", "editor", "ai", "knowledge", "ontology", "security", "export", "image"].map((pkg) => [
          `@archi/${pkg}`,
          path.resolve(__dirname, `src/archi/packages/${pkg}/index.ts`),
        ]),
      ),
      "next/server": path.resolve(__dirname, "src/archi/shims/next-server.ts"),
      "next/link": path.resolve(__dirname, "src/archi/shims/next-link.tsx"),
      "next/navigation": path.resolve(__dirname, "src/archi/shims/next-navigation.ts"),
      "next/font/google": path.resolve(__dirname, "src/archi/shims/next-font-google.ts"),
      "@": path.resolve(__dirname, "src"),
      // @astryxdesign/core dist is compiled with the DEV jsx transform;
      // React's production jsx-dev-runtime exports jsxDEV=undefined, which
      // crashes the built app. Redirect to a shim in builds only.
      ...(command === "build"
        ? {
            "react/jsx-dev-runtime": path.resolve(
              __dirname,
              "src/shims/jsx-dev-runtime.ts",
            ),
          }
        : {}),
    },
  },
  optimizeDeps: {
    include: [
      "react",
      "react-dom",
      "react-dom/client",
      "react/jsx-runtime",
      "react/jsx-dev-runtime",
    ],
  },
  server: {
    // 고정 포트 — 이미 떠 있으면 다른 포트로 새 서버를 띄우지 않고 실패한다(중복 서버 방지).
    port: 5180,
    strictPort: true,
    open: false,
  },
}));
