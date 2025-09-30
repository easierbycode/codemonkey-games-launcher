import { defineConfig } from "vite";
import fresh from "jsr:@fresh/plugin-vite@^1.0.4";

export default defineConfig({
  plugins: [fresh()],
});