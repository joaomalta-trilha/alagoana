import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import "./estilos.css";
import "./estilos-desktop.css";

createRoot(document.getElementById("raiz")!).render(
  <StrictMode><App /></StrictMode>,
);

// O service worker só entra na build. Em desenvolvimento ele serviria arquivo
// velho e faria o Vite parecer quebrado.
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js");
  });
}
