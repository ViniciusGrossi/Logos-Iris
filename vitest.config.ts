import { defineConfig } from "vitest/config";
import path from "node:path";

// ponytail: testes desta feature são puro TS (lógica de Service/Adapter), sem CSS. postcss.config.mjs
// usa a sintaxe shorthand do Next.js (string de nome de plugin), que o loader nativo do Vite não
// resolve (espera instância/função de plugin) — não é bug do config, é convenção Next-only. Em vez
// de reescrever o config do build real, a config de teste só ignora descoberta de postcss.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  css: {
    postcss: { plugins: [] },
  },
  test: {
    environment: "node",
    css: false,
  },
});
