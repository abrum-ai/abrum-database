// UI preview without a Station: swaps @abrum/react for an in-memory mock.
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const at = (path: string) => new URL(path, import.meta.url).pathname;

export default defineConfig({
  root: at("."),
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: [
      { find: /^@abrum\/react$/, replacement: at("./abrum-react-mock.tsx") },
      { find: "@abrum/generated", replacement: at("../generated/twins.ts") },
      { find: "@", replacement: at("../src") },
    ],
  },
  server: { host: "127.0.0.1", port: 5189, strictPort: true },
});
