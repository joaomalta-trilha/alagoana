/**
 * Gera os ícones do PWA sem depender de nenhuma biblioteca.
 *
 *   node ferramentas/gerar-icones.mjs
 *
 * Escreve PNGs quadrados em `apps/web/public`: fundo no azul da marca e um "A"
 * branco desenhado por distância a segmentos de reta. É pouco código e nenhuma
 * dependência nova — um ícone de 192px não justifica uma cadeia de build de
 * imagens, e binário de origem desconhecida no repositório justifica menos
 * ainda.
 *
 * O desenho cabe nos 80% centrais, que é a zona segura de um ícone
 * `maskable`: o Android recorta as bordas em círculo ou losango conforme o
 * aparelho, e o que estiver fora some.
 */

import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const DESTINO = join(RAIZ, "apps/web/public");

const AZUL = [0x00, 0x32, 0xd3];
const BRANCO = [0xff, 0xff, 0xff];

// ------------------------------------------------------------------ PNG

const TABELA_CRC = Uint32Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = TABELA_CRC[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pedaco(tipo, dados) {
  const nome = Buffer.from(tipo, "ascii");
  const tamanho = Buffer.alloc(4);
  tamanho.writeUInt32BE(dados.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([nome, dados])));
  return Buffer.concat([tamanho, nome, dados, crc]);
}

function png(largura, altura, pixels) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(largura, 0);
  ihdr.writeUInt32BE(altura, 4);
  ihdr[8] = 8;    // 8 bits por canal
  ihdr[9] = 2;    // RGB, sem alfa
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pedaco("IHDR", ihdr),
    pedaco("IDAT", deflateSync(pixels, { level: 9 })),
    pedaco("IEND", Buffer.alloc(0)),
  ]);
}

// ------------------------------------------------------------- desenho

/** Distância de um ponto ao segmento AB. */
function distancia(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

const APICE = [0.5, 0.2];
const PE_ESQ = [0.235, 0.8];
const PE_DIR = [0.765, 0.8];
const TRACO = 0.088;
const BARRA = [0.6, 0.672];   // faixa horizontal do "A"

/** Cobertura do glifo em (x, y) normalizados, com uma amostragem 3×3. */
function tintaDoA(x, y, passo) {
  let dentro = 0;
  for (let sy = 0; sy < 3; sy++) {
    for (let sx = 0; sx < 3; sx++) {
      const px = x + (sx - 1) * passo / 3;
      const py = y + (sy - 1) * passo / 3;

      const naPerna =
        distancia(px, py, APICE[0], APICE[1], PE_ESQ[0], PE_ESQ[1]) < TRACO / 2 ||
        distancia(px, py, APICE[0], APICE[1], PE_DIR[0], PE_DIR[1]) < TRACO / 2;

      // A barra vai de perna a perna, na altura onde elas já se abriram.
      const proporcao = (BARRA[1] - APICE[1]) / (PE_ESQ[1] - APICE[1]);
      const limite = (APICE[0] - PE_ESQ[0]) * proporcao;
      const naBarra = py >= BARRA[0] && py <= BARRA[1] &&
        px >= APICE[0] - limite && px <= APICE[0] + limite;

      if (naPerna || naBarra) dentro++;
    }
  }
  return dentro / 9;
}

function desenhar(lado) {
  // 1 byte de filtro por linha, depois 3 bytes por pixel.
  const linhas = Buffer.alloc(lado * (1 + lado * 3));
  const passo = 1 / lado;

  for (let y = 0; y < lado; y++) {
    const inicio = y * (1 + lado * 3);
    linhas[inicio] = 0;                       // filtro "none"
    for (let x = 0; x < lado; x++) {
      const cobertura = tintaDoA((x + 0.5) * passo, (y + 0.5) * passo, passo);
      const destino = inicio + 1 + x * 3;
      for (let canal = 0; canal < 3; canal++) {
        linhas[destino + canal] = Math.round(
          AZUL[canal] * (1 - cobertura) + BRANCO[canal] * cobertura);
      }
    }
  }
  return png(lado, lado, linhas);
}

mkdirSync(DESTINO, { recursive: true });
for (const lado of [192, 512]) {
  const arquivo = join(DESTINO, `icone-${lado}.png`);
  writeFileSync(arquivo, desenhar(lado));
  console.log(`  ${arquivo.replace(RAIZ + "/", "")}`);
}
