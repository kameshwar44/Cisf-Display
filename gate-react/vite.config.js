import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base "./" lets the built dist/ folder be served from any path.
// In development, API calls and camera images go to the gate server.
const GATE_SERVER = process.env.GATE_SERVER || "http://localhost:4000";

export default defineConfig({
  plugins: [react()],
  base: "./",
  server: {
    proxy: {
      "/api": GATE_SERVER,
      "/uploads": GATE_SERVER,
      "/faces": GATE_SERVER,
    },
  },
});
