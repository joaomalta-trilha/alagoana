/*
 * Service worker — o mínimo que torna o app instalável e abrível.
 *
 * Regra única e deliberada: **`/api` nunca é cacheado.** Este é um sistema de
 * dinheiro; devolver um saldo velho porque a rede oscilou seria pior do que
 * dizer que está sem conexão. O que fica em cache é só o casco — HTML, JS,
 * CSS, ícones — para o app abrir na tela do celular sem esperar a rede.
 *
 * Sem rede e sem dado, o app mostra o erro de carregamento de cada tela. É
 * honesto: sem servidor não há número para mostrar.
 */

const CASCO = "alagoana-casco-v1";
const ESSENCIAIS = [
  "/", "/manifest.webmanifest",
  "/icone-32.png", "/icone-192.png", "/icone-512.png",
  // O monograma da barra superior: sem ele no cache, o app offline abre
  // com um quadrado vazio no lugar da marca.
  "/marca.png",
];

self.addEventListener("install", (evento) => {
  evento.waitUntil(
    caches.open(CASCO)
      .then((cache) => cache.addAll(ESSENCIAIS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (evento) => {
  evento.waitUntil(
    caches.keys()
      .then((nomes) => Promise.all(nomes.filter((n) => n !== CASCO).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (evento) => {
  const url = new URL(evento.request.url);

  if (evento.request.method !== "GET" || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;   // dado vem sempre da rede

  // Navegação: rede primeiro, cache como rede de segurança. Assim uma versão
  // nova do app aparece no primeiro carregamento com rede, e não no segundo.
  if (evento.request.mode === "navigate") {
    evento.respondWith(
      fetch(evento.request)
        .then((resposta) => {
          const copia = resposta.clone();
          void caches.open(CASCO).then((cache) => cache.put("/", copia));
          return resposta;
        })
        .catch(() => caches.match("/").then((r) => r ?? Response.error())),
    );
    return;
  }

  // Estáticos com hash no nome: cache primeiro, porque o conteúdo nunca muda
  // sob o mesmo nome.
  evento.respondWith(
    caches.match(evento.request).then((emCache) => emCache ?? fetch(evento.request).then((resposta) => {
      if (resposta.ok) {
        const copia = resposta.clone();
        void caches.open(CASCO).then((cache) => cache.put(evento.request, copia));
      }
      return resposta;
    })),
  );
});
