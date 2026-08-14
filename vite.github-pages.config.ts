import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("./github-pages", import.meta.url));
const projectRoot = fileURLToPath(new URL("./", import.meta.url));

export default defineConfig({
  root,
  base: "/jikeoro-web-proto/",
  publicDir: fileURLToPath(new URL("./public", import.meta.url)),
  plugins: [react()],
  build: {
    outDir: fileURLToPath(new URL("./docs", import.meta.url)),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        home: `${root}/index.html`,
        map: `${root}/map/index.html`,
        my: `${root}/my/index.html`,
        admin: `${root}/admin/index.html`,
        adminLogin: `${root}/admin/login/index.html`,
      },
    },
  },
  resolve: { alias: { "@": projectRoot } },
});
