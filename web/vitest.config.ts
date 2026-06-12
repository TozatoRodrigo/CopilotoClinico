import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

export default defineConfig({
  plugins: [react()],
  css: {
    // Skip CSS processing in unit tests — not needed and causes PostCSS conflicts
    modules: { localsConvention: "camelCase" },
    postcss: { plugins: [] },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    css: false,
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
      "@contracts": resolve(__dirname, "../src/shared/contracts"),
    },
  },
});
