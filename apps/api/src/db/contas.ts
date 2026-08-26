/**
 * Saldo inicial das contas, pela linha de comando.
 *
 *   npm run conta                                    lista as contas
 *   npm run conta -- Victor --somar 1500,00          ensaio
 *   npm run conta -- Victor --somar 1500,00 --confirmo
 *   npm run conta -- Victor --definir 4108,54 --confirmo
 *
 * O saldo de uma conta é `saldo_inicial + soma dos movimentos` (§3.2), e não
 * existe coluna de saldo. Então subir o saldo de uma conta **sem** mexer em
 * outra e **sem** lançar aporte só tem um caminho honesto: corrigir o ponto
 * de partida. É para isso que este comando existe.
 *
 * Por que não tem tela: mexer no ponto de partida é conserto de carga, não
 * operação do dia. Dinheiro que entra ou sai no dia a dia é aporte, venda,
 * custo ou transferência, e cada um tem a sua tela, deixa rastro no extrato e
 * é reversível. Isto aqui não aparece no extrato — quem olhar vai ver o saldo
 * diferente e nenhuma linha explicando, e é por isso que fica num comando de
 * terminal, longe da mão de todo dia.
 *
 * Fica registrado em `evento`, com o antes e o depois.
 */

import { pool, comTransacao } from "./conexao.js";
import { brl, deNumeric, paraNumeric, reais, type Centavos } from "../dominio/dinheiro.js";
import { registrarEvento } from "../servicos/eventos.js";

const argumentos = process.argv.slice(2);
const confirmado = argumentos.includes("--confirmo");
const nome = argumentos.find((a) => !a.startsWith("--"));

function valorDe(bandeira: string): Centavos | null {
  const i = argumentos.indexOf(bandeira);
  if (i < 0) return null;
  const bruto = argumentos[i + 1];
  if (!bruto) throw new Error(`${bandeira} precisa de um valor: ${bandeira} 1500,00`);

  // Aceita "1500,00", "1.500,00" e "1500.00" — é o que a mão digita.
  const limpo = bruto.replace(/\s/g, "").replace(/\./g, ",");
  const partes = limpo.split(",");
  const centavos = partes.length > 1 && partes[partes.length - 1]!.length === 2
    ? Number(partes.slice(0, -1).join("") + partes[partes.length - 1])
    : Number(partes.join("")) * 100;

  if (!Number.isSafeInteger(centavos)) throw new Error(`valor inválido: ${bruto}`);
  return centavos;
}

interface Linha {
  id: string;
  nome: string;
  tipo: string;
  saldo_inicial: string;
  movimentos: string;
  saldo: string;
}

async function listar(): Promise<Linha[]> {
  const { rows } = await pool.query<Linha>(
    `select c.id, c.nome, c.tipo, c.saldo_inicial,
            count(m.id) as movimentos,
            c.saldo_inicial + coalesce(sum(m.valor), 0) as saldo
       from conta c
       left join movimento_caixa m on m.conta_id = c.id
      group by c.id
      order by c.tipo desc, c.nome`);

  console.log("\n  contas de caixa:\n");
  console.log(`    ${"conta".padEnd(12)}${"tipo".padEnd(10)}` +
              `${"saldo inicial".padStart(15)}${"movimentos".padStart(12)}${"saldo hoje".padStart(15)}`);
  for (const c of rows) {
    console.log(`    ${c.nome.padEnd(12)}${c.tipo.padEnd(10)}` +
                `${reais(deNumeric(c.saldo_inicial)!).padStart(15)}` +
                `${c.movimentos.padStart(12)}` +
                `${reais(deNumeric(c.saldo)!).padStart(15)}`);
  }
  console.log();
  return rows;
}

const contas = await listar();

if (!nome) {
  console.log("  Para corrigir o ponto de partida de uma conta:\n");
  console.log("    npm run conta -- Victor --somar 1500,00");
  console.log("    npm run conta -- Victor --definir 4108,54\n");
  console.log("  Sem --confirmo, só mostra o que faria.\n");
  await pool.end();
  process.exit(0);
}

const alvo = contas.find((c) => c.nome.toLowerCase() === nome.toLowerCase());
if (!alvo) {
  console.error(`\n  não achei a conta "${nome}". Use um dos nomes da lista acima.\n`);
  await pool.end();
  process.exit(1);
}

const somar = valorDe("--somar");
const definir = valorDe("--definir");
if (somar === null && definir === null) {
  console.error("\n  informe --somar ou --definir.\n");
  await pool.end();
  process.exit(1);
}
if (somar !== null && definir !== null) {
  console.error("\n  --somar e --definir não se combinam: escolha um.\n");
  await pool.end();
  process.exit(1);
}

const atual = deNumeric(alvo.saldo_inicial)!;
const novo = definir ?? atual + somar!;
const saldoHoje = deNumeric(alvo.saldo)!;
const saldoDepois = saldoHoje + (novo - atual);

console.log(`  CONTA ${alvo.nome}\n`);
console.log(`  saldo inicial   ${reais(atual).padStart(14)} → ${reais(novo).padStart(14)}`);
console.log(`  saldo hoje      ${reais(saldoHoje).padStart(14)} → ${reais(saldoDepois).padStart(14)}`);
console.log(`  movimentos      ${alvo.movimentos.padStart(14)}   (nenhum é criado ou apagado)`);

// Saldo negativo é o que o resto do sistema não deixa acontecer; deixar entrar
// por aqui seria abrir por baixo a porta que a §4.7 fecha por cima.
if (saldoDepois < 0) {
  console.error(`\n  recusado: ${alvo.nome} ficaria com ${brl(saldoDepois)}.\n`);
  await pool.end();
  process.exit(1);
}

if (!confirmado) {
  console.log("\n  nada foi gravado. Para valer, repita com --confirmo\n");
  await pool.end();
  process.exit(0);
}

await comTransacao(async (c) => {
  await c.query("update conta set saldo_inicial = $2 where id = $1", [alvo.id, paraNumeric(novo)]);
  await registrarEvento(c, null, "conta", alvo.id, "editou",
    { saldoInicial: atual }, { saldoInicial: novo });
});

console.log(`\n  ${alvo.nome}: saldo inicial agora é ${brl(novo)}.`);
console.log(`  saldo hoje: ${brl(saldoDepois)}\n`);
await pool.end();
