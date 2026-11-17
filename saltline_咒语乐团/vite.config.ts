import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  base: "./",
  build: {
    chunkSizeWarningLimit: 2400,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("@dimforge/rapier")) return "physics";
          if (id.includes("/node_modules/three/")) return "three-engine";
          if (/node_modules\/(react|react-dom|scheduler)\//.test(id))
            return "react-ui";
        },
      },
    },
  },
  server: { host: "127.0.0.1", port: 5174, strictPort: true },
});
