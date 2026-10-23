import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
export default defineConfig({
  base: "/",
  plugins: [
    react(),
    tailwindcss(),
    {
      name: "github-pages-spa-fallback",
      enforce: "post",
      generateBundle(_options, bundle) {
        const index = bundle["index.html"];
        if (!index || index.type !== "asset") {
          this.error("Cannot create the Pages fallback without index.html.");
        }
        // Pages serves this document for missing paths, preserving the URL for
        // BrowserRouter. Root-relative assets also work on nested routes.
        this.emitFile({
          type: "asset",
          fileName: "404.html",
          source: index.source,
        });
      },
    },
  ],
});
