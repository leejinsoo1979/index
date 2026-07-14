import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig(({ command }) => ({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
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
  server: {
    port: 5173,
    open: false,
  },
}));
