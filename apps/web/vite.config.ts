import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const PORTA_API = Number(process.env["PORT"] ?? 3000);

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Em desenvolvimento o Vite serve a interface e repassa `/api` para o
    // servidor Node. Mesma origem do ponto de vista do navegador, que é o que
    // faz o cookie `SameSite=Lax` da sessão continuar sendo enviado.
    proxy: { "/api": { target: `http://localhost:${PORTA_API}`, changeOrigin: false } },
  },
  build: { outDir: "dist", emptyOutDir: true },
});
