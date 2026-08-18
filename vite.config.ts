import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { apiProxy } from "./server/vite-plugin";

export default defineConfig(({ mode }) => {
  // Threaded into the plugin rather than assigned onto process.env. Mutating
  // the global is one-way: it cannot clear a value, so a URL left over from an
  // earlier run survives every restart and the dev server keeps using it after
  // .env.local has changed. That produced a real misdiagnosis once already.
  //
  // The variables have no VITE_ prefix, so Vite will not inline them into the
  // client bundle either way.
  const { VALHALLA_URL, VALHALLA_MAX_CONTOURS } = loadEnv(mode, process.cwd(), "");

  return {
    plugins: [react(), apiProxy({ VALHALLA_URL, VALHALLA_MAX_CONTOURS })],
    build: {
      target: "es2022",
      rollupOptions: {
        output: {
          manualChunks: { maplibre: ["maplibre-gl"] },
        },
      },
    },
  };
});
