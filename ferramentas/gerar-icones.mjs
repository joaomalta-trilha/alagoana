/**
 * Gera os ícones do sistema a partir da logomarca.
 *
 *   node ferramentas/gerar-icones.mjs
 *
 * A fonte é `referencia/logo-alagoana.png`, o arquivo que a loja mandou:
 * 1000×1000, RGB de 8 bits, monograma branco sobre #011DB7. Fica versionado
 * para que a origem do desenho seja rastreável — antes daqui, o ícone era um
 * "A" que este script desenhava por distância a segmentos de reta, e ninguém
 * saberia dizer de onde veio.
 *
 * Sem dependência nova: decodifica, reamostra e codifica PNG com o `zlib` que
 * já vem no Node. Um punhado de ícones não justifica uma cadeia de build de
 * imagens, e biblioteca de imagem é superfície de ataque que este projeto não
 * precisa ter.
 *
 * Escreve em `apps/web/public`:
 *
 *   icone-32.png    aba do navegador — reduzir 192 para 16 no navegador borra
 *   icone-192.png   atalho na tela inicial
 *   icone-512.png   splash e loja; também serve de `maskable`
 *   marca.png       só o monograma, fundo transparente
 *
 * `marca.png` é usada como máscara CSS: a cor vem da folha de estilo, então o
 * mesmo arquivo serve o monograma branco sobre a barra azul e o azul sobre o
 * branco do login. Dois PNGs de cores diferentes sairiam do ar um do outro no
 * dia em que a marca mudasse.
 */

import { deflateSync, inflateSync } from "node:zlib";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const FONTE = join(RAIZ, "referencia/logo-alagoana.png");
const DESTINO = join(RAIZ, "apps/web/public");

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

/** `canais` é 3 (RGB) ou 4 (RGBA). `pixels` já vem com o byte de filtro. */
function png(largura, altura, pixels, canais) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(largura, 0);
  ihdr.writeUInt32BE(altura, 4);
  ihdr[8] = 8;                       // 8 bits por canal
  ihdr[9] = canais === 4 ? 6 : 2;    // 6 = RGBA, 2 = RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pedaco("IHDR", ihdr),
    pedaco("IDAT", deflateSync(pixels, { level: 9 })),
    pedaco("IEND", Buffer.alloc(0)),
  ]);
}

/**
 * Decodifica PNG de 8 bits sem entrelace: RGB, RGBA ou paleta.
 *
 * São os formatos das duas fontes. A paleta entrou porque a logo horizontal
 * veio assim — com `tRNS`, que é onde mora a transparência nesse formato.
 * Qualquer outra combinação é recusada em vez de virar imagem errada: um
 * ícone torto passaria despercebido até alguém abrir o celular.
 */
function lerPng(caminho) {
  const b = readFileSync(caminho);
  const assinatura = "89504e470d0a1a0a";
  if (b.subarray(0, 8).toString("hex") !== assinatura) {
    throw new Error(`${caminho} não é um PNG.`);
  }

  const largura = b.readUInt32BE(16);
  const altura = b.readUInt32BE(20);
  const profundidade = b[24];
  const tipoDeCor = b[25];
  const entrelace = b[28];

  if (profundidade !== 8 || ![2, 3, 6].includes(tipoDeCor) || entrelace !== 0) {
    throw new Error(
      `${caminho}: esperava PNG de 8 bits RGB, RGBA ou paleta sem entrelace — ` +
      `veio profundidade ${profundidade}, tipo ${tipoDeCor}, entrelace ${entrelace}.`);
  }

  // Em paleta há 1 byte por pixel no fluxo; a cor vem da PLTE e o alfa da tRNS.
  const canais = tipoDeCor === 6 ? 4 : tipoDeCor === 3 ? 1 : 3;
  const partes = [];
  let plte = null, trns = null;
  for (let i = 8; i < b.length;) {
    const n = b.readUInt32BE(i);
    const tipo = b.subarray(i + 4, i + 8).toString("ascii");
    if (tipo === "IDAT") partes.push(b.subarray(i + 8, i + 8 + n));
    else if (tipo === "PLTE") plte = b.subarray(i + 8, i + 8 + n);
    else if (tipo === "tRNS") trns = b.subarray(i + 8, i + 8 + n);
    i += 12 + n;
  }
  if (tipoDeCor === 3 && !plte) throw new Error(`${caminho}: paleta sem PLTE.`);

  const cru = inflateSync(Buffer.concat(partes));
  const passo = largura * canais;
  const px = Buffer.alloc(altura * passo);

  // Desfaz os cinco filtros por linha da especificação do PNG.
  for (let y = 0; y < altura; y++) {
    const filtro = cru[y * (passo + 1)];
    const linha = cru.subarray(y * (passo + 1) + 1, (y + 1) * (passo + 1));
    for (let x = 0; x < passo; x++) {
      const a = x >= canais ? px[y * passo + x - canais] : 0;
      const c = y > 0 ? px[(y - 1) * passo + x] : 0;
      const d = y > 0 && x >= canais ? px[(y - 1) * passo + x - canais] : 0;
      let v = linha[x];
      if (filtro === 1) v += a;
      else if (filtro === 2) v += c;
      else if (filtro === 3) v += (a + c) >> 1;
      else if (filtro === 4) {
        const p = a + c - d;
        const pa = Math.abs(p - a), pb = Math.abs(p - c), pc = Math.abs(p - d);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? c : d;
      }
      px[y * passo + x] = v & 0xff;
    }
  }

  if (tipoDeCor !== 3) return { largura, altura, canais, px };

  // Expande a paleta para RGBA, para o resto do arquivo lidar com um formato
  // só. Índice sem entrada na tRNS é opaco, como manda a especificação.
  const rgba = Buffer.alloc(largura * altura * 4);
  for (let p = 0, q = 0; p < px.length; p++, q += 4) {
    const indice = px[p];
    rgba[q] = plte[indice * 3];
    rgba[q + 1] = plte[indice * 3 + 1];
    rgba[q + 2] = plte[indice * 3 + 2];
    rgba[q + 3] = trns && indice < trns.length ? trns[indice] : 255;
  }
  return { largura, altura, canais: 4, px: rgba };
}

// ------------------------------------------------------------ reamostra

/**
 * Reduz por média da área de origem — filtro de caixa.
 *
 * Pegar o pixel mais próximo serrilharia a diagonal do monograma, que é
 * quase toda a marca. A média de 1000px para 32px olha ~1000 pixels por
 * destino e chega numa borda suave sem biblioteca nenhuma.
 */
function reduzir(img, largura, altura, canais) {
  const saida = Buffer.alloc(altura * (1 + largura * canais));
  const escalaX = img.largura / largura;
  const escalaY = img.altura / altura;

  for (let y = 0; y < altura; y++) {
    const inicio = y * (1 + largura * canais);
    saida[inicio] = 0;                                   // filtro "none"
    const y0 = Math.floor(y * escalaY), y1 = Math.ceil((y + 1) * escalaY);

    for (let x = 0; x < largura; x++) {
      const x0 = Math.floor(x * escalaX), x1 = Math.ceil((x + 1) * escalaX);
      const soma = [0, 0, 0, 0];
      let n = 0;

      for (let sy = y0; sy < y1; sy++) {
        for (let sx = x0; sx < x1; sx++) {
          const p = (sy * img.largura + sx) * img.canais;
          soma[0] += img.px[p];
          soma[1] += img.px[p + 1];
          soma[2] += img.px[p + 2];
          soma[3] += img.canais === 4 ? img.px[p + 3] : 255;
          n++;
        }
      }

      const destino = inicio + 1 + x * canais;
      for (let c = 0; c < canais; c++) saida[destino + c] = Math.round(soma[c] / n);
    }
  }
  return saida;
}

// ------------------------------------------------------ marca recortada

const FUNDO = [0x01, 0x1d, 0xb7];    // o azul da logomarca, medido no arquivo
const MARCA = [0xff, 0xff, 0xff];

/**
 * Troca o fundo por transparência, deixando só o monograma.
 *
 * A imagem tem duas cores e o anti-serrilhado entre elas. Projetar cada pixel
 * sobre a reta que liga fundo e marca dá exatamente a cobertura do traço —
 * nada de limiar, que comeria a suavidade da diagonal.
 */
function recortar(img) {
  const eixo = MARCA.map((m, i) => m - FUNDO[i]);
  const tamanho = eixo.reduce((a, e) => a + e * e, 0);
  const saida = { largura: img.largura, altura: img.altura, canais: 4, px: Buffer.alloc(img.largura * img.altura * 4) };

  for (let p = 0, q = 0; p < img.px.length; p += img.canais, q += 4) {
    let projecao = 0;
    for (let c = 0; c < 3; c++) projecao += (img.px[p + c] - FUNDO[c]) * eixo[c];
    const alfa = Math.max(0, Math.min(1, projecao / tamanho));

    saida.px[q] = MARCA[0];
    saida.px[q + 1] = MARCA[1];
    saida.px[q + 2] = MARCA[2];
    saida.px[q + 3] = Math.round(alfa * 255);
  }
  return saida;
}

/**
 * Corta a moldura vazia em volta do monograma.
 *
 * Sem isto o arquivo guardaria o quadro inteiro de 1000px com o desenho no
 * meio, ocupando uns 65% dele — e o selo da barra, que mostra 70% da própria
 * caixa, acabaria exibindo 70% de 65%. A marca saía pequena demais, e foi
 * assim que ela apareceu na primeira tentativa.
 *
 * Com `quadrado`, sai centrado no maior lado — é o que o selo precisa, para o
 * `contain` da máscara não espremer o desenho numa caixa quadrada. Sem ele,
 * sai na caixa justa do desenho, que é o que a logo horizontal precisa.
 */
function aparar(img, { quadrado = true } = {}) {
  let x0 = img.largura, y0 = img.altura, x1 = -1, y1 = -1;
  for (let y = 0; y < img.altura; y++) {
    for (let x = 0; x < img.largura; x++) {
      if (img.px[(y * img.largura + x) * 4 + 3] > 8) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) throw new Error("a marca saiu vazia — confira as cores de FUNDO e MARCA.");

  let largura = x1 - x0 + 1, altura = y1 - y0 + 1;
  let inicioX = x0, inicioY = y0;
  if (quadrado) {
    const lado = Math.max(largura, altura);
    inicioX = Math.round((x0 + x1) / 2 - lado / 2);
    inicioY = Math.round((y0 + y1) / 2 - lado / 2);
    largura = altura = lado;
  }

  const saida = { largura, altura, canais: 4, px: Buffer.alloc(largura * altura * 4) };
  for (let y = 0; y < altura; y++) {
    for (let x = 0; x < largura; x++) {
      const sx = inicioX + x, sy = inicioY + y;
      if (sx < 0 || sy < 0 || sx >= img.largura || sy >= img.altura) continue;
      img.px.copy(saida.px, (y * largura + x) * 4,
                  (sy * img.largura + sx) * 4, (sy * img.largura + sx) * 4 + 4);
    }
  }
  return saida;
}

// ------------------------------------------------------------------ gerar

const logo = lerPng(FONTE);
console.log(`  fonte: ${logo.largura}×${logo.altura}, ${logo.canais} canais`);

mkdirSync(DESTINO, { recursive: true });

for (const lado of [32, 192, 512]) {
  const arquivo = join(DESTINO, `icone-${lado}.png`);
  writeFileSync(arquivo, png(lado, lado, reduzir(logo, lado, lado, 3), 3));
  console.log(`  ${arquivo.replace(RAIZ + "/", "")}`);
}

const marca = aparar(recortar(logo));
const arquivoMarca = join(DESTINO, "marca.png");
writeFileSync(arquivoMarca, png(128, 128, reduzir(marca, 128, 128, 4), 4));
console.log(`  ${arquivoMarca.replace(RAIZ + "/", "")}  (${marca.largura}×${marca.altura} recortado)`);

// ------------------------------------------------------ logo horizontal

/**
 * A logo por extenso, para o cabeçalho.
 *
 * A fonte já vem branca sobre transparente, então o alfa dela **é** o
 * desenho — não há o que recortar por cor, só a moldura vazia a aparar.
 *
 * Sai como máscara, igual à `marca.png`: a cor vem da folha de estilo. Hoje
 * ela só aparece branca sobre a barra azul, mas no dia em que precisar
 * aparecer escura sobre fundo claro é uma linha de CSS, não um arquivo novo.
 *
 * 120px de altura é três vezes o que o cabeçalho mostra — o suficiente para
 * tela retina sem carregar um arquivo grande à toa.
 */
const ALTURA_DA_LOGO = 120;

const horizontal = aparar(lerPng(join(RAIZ, "referencia/logo-alagoana-horizontal.png")),
                          { quadrado: false });
const larguraDaLogo = Math.round(horizontal.largura / horizontal.altura * ALTURA_DA_LOGO);
const arquivoLogo = join(DESTINO, "logo.png");
writeFileSync(arquivoLogo, png(larguraDaLogo, ALTURA_DA_LOGO,
  reduzir(horizontal, larguraDaLogo, ALTURA_DA_LOGO, 4), 4));
console.log(`  ${arquivoLogo.replace(RAIZ + "/", "")}  (${larguraDaLogo}×${ALTURA_DA_LOGO}, ` +
            `proporção ${(horizontal.largura / horizontal.altura).toFixed(2)}:1)`);
