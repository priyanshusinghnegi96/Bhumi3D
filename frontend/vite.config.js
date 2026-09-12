import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  define: {
    CESIUM_BASE_URL: JSON.stringify("/cesiumStatic/"),
  },

  plugins: [
    react(),
  ],
});