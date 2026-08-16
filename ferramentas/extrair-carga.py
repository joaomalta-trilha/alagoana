#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Extrai do protótipo (patio-prototipo.html) os catálogos de marca, modelo e
cor, e grava apps/api/src/db/seed/catalogo.json.

Também sabe reconstruir a frota de 16 veículos que o protótipo carrega — foi
a carga inicial até 16/08/2026, quando a loja mandou a planilha atualizada.
Hoje a frota vem de `extrair-planilha.py`, e este script **não** grava
frota.json a menos que se peça `--frota-do-prototipo`. Sem essa trava, uma
rodada distraída devolveria o banco ao retrato antigo.

Valores monetários saem em CENTAVOS INTEIROS. Nenhum float sobrevive à extração.

Correções aplicadas na importação (decididas com o cliente):
  - cores no feminino normalizadas para o masculino do catálogo
  - versão separada do modelo (Kicks S, Polo Highline)
  - "(50%)" removido do modelo do Cruze
  - 4 categorias claramente erradas corrigidas
Deliberadamente NÃO aplicadas:
  - custos lançados no veículo errado permanecem onde estão, para que as
    conferências da especificação continuem verdadeiras. Ficam registrados
    na observação do veículo.

Uso:  python3 ferramentas/extrair-carga.py [--verificar] [--frota-do-prototipo]
"""

import ast
import json
import re
import sys
import unicodedata
from datetime import date, timedelta
from decimal import Decimal
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
_VERSIONADO = RAIZ / "referencia" / "patio-prototipo.html"
# O protótipo é versionado em `referencia/`. A pasta de downloads fica como
# reserva para quem estiver conferindo um arquivo recém-recebido, ainda fora
# do repositório.
PROTOTIPO = _VERSIONADO if _VERSIONADO.exists() else Path.home() / "Downloads" / "patio-prototipo.html"
SEED = RAIZ / "apps" / "api" / "src" / "db" / "seed"
DESTINO = SEED / "frota.json"
DESTINO_CATALOGO = SEED / "catalogo.json"

# A data em que o protótipo foi congelado. Toda conferência que envolve
# "hoje" é feita contra ela, nunca contra a data real de execução.
HOJE = date(2026, 8, 8)


# --------------------------------------------------------------------------
# leitura do protótipo
# --------------------------------------------------------------------------

def ler_frota_bruta(caminho: Path) -> list[dict]:
    """Lê o array `frota` do HTML sem executar JavaScript."""
    fonte = caminho.read_text(encoding="utf-8")
    ini = fonte.index("let frota = [")
    fim = fonte.index("\n];", ini) + 2
    corpo = fonte[ini + len("let frota = "):fim]
    # chaves sem aspas -> com aspas; null -> None
    corpo = re.sub(r"(\{|,)\s*([A-Za-zçãáéíóú]+)\s*:", r"\1'\2':", corpo)
    corpo = corpo.replace("null", "None")
    return ast.literal_eval(corpo)


def centavos(valor) -> int:
    """Converte para centavos inteiros pela representação decimal exata."""
    return int((Decimal(str(valor)) * 100).to_integral_value())


def _objeto(fonte: str, nome: str) -> dict:
    """Lê um `const NOME = { ... };` do HTML como dicionário."""
    ini = fonte.index(f"const {nome} = {{")
    corpo = fonte[ini + len(f"const {nome} = "):fonte.index("\n};", ini) + 2]
    return ast.literal_eval(corpo)


def ler_catalogo(caminho: Path) -> dict:
    """Lê CATALOGO, CATALOGO_MOTO (marca -> modelos) e CORES do HTML.

    São dois catálogos de marca porque Honda e BMW existem nos dois mundos e
    significam coisas diferentes: a Honda de carro não vende CG 160. As cores
    são uma lista só — cor é cor, independente do que ela pinta.
    """
    fonte = caminho.read_text(encoding="utf-8")
    ini = fonte.index("const CORES = [")
    cores = ast.literal_eval(fonte[ini + len("const CORES = "):fonte.index("]", ini) + 1])
    return {
        "marcas": _objeto(fonte, "CATALOGO"),
        "marcasMoto": _objeto(fonte, "CATALOGO_MOTO"),
        "cores": cores,
    }


# --------------------------------------------------------------------------
# correções acordadas
# --------------------------------------------------------------------------

CORES = {"Preta": "Preto", "Branca": "Branco"}

# codigo -> (modelo corrigido, versão extraída)
MODELOS = {
    "V-01": ("Kicks", "S"),
    "V-03": ("Cruze", None),
    "V-11": ("Polo", "Highline"),
}

# (codigo, descrição, categoria errada) -> categoria correta
CATEGORIAS = {
    ("V-05", "Polimento carro", "Peças"): "Polimento",
    ("V-06", "Pintura geral (20%)", "Peças"): "Pintura",
    ("V-07", "Bateria City", "Peças"): "Bateria",
    ("V-08", "Consulta leilão, Tucson", "Combustível"): "Consulta",
}

# custos que pertencem a outro veículo, mantidos onde estão de propósito
OBSERVACOES = {
    "V-07": "Contém um lançamento de consulta de leilão de R$ 50,00 que se "
            "refere ao Polo Highline (V-11). Mantido aqui como estava na "
            "planilha, para não alterar o custo total já conhecido deste carro.",
    "V-08": "Contém um lançamento de consulta de leilão de R$ 15,00 que se "
            "refere ao Tucson (V-12). Mantido aqui como estava na planilha.",
}


def transformar(bruta: list[dict]) -> list[dict]:
    veiculos = []
    for v in bruta:
        codigo = v["id"]
        modelo, versao = MODELOS.get(codigo, (v["modelo"], None))

        custos = []
        for descricao, categoria, data, valor in v["custos"]:
            categoria = CATEGORIAS.get((codigo, descricao, categoria), categoria)
            custos.append({
                "descricao": descricao,
                "categoria": categoria,
                "data": data,             # None = custo previsto
                "valor": centavos(valor),
            })

        veiculos.append({
            "codigo": codigo,
            "marca": v["marca"],
            "modelo": modelo,
            "versao": versao,
            "ano": v["ano"],
            "cor": CORES.get(v["cor"], v["cor"]),
            "placa": v["placa"].upper(),
            "km": v["km"],
            "data_compra": v["dataCompra"],
            "valor_compra": centavos(v["compra"]),
            "valor_anuncio": centavos(v["anuncio"]) if v["anuncio"] else None,
            "fipe_compra": centavos(v["fipe"]) if v["fipe"] else None,
            # a planilha só tinha um valor de Fipe; hoje começa igual à compra
            "fipe_hoje": centavos(v["fipe"]) if v["fipe"] else None,
            "data_venda": v["dataVenda"],
            "valor_venda": centavos(v["venda"]) if v["venda"] else None,
            "origem": "compra",
            "troca_de_codigo": None,
            "observacao": OBSERVACOES.get(codigo),
            "custos": custos,
        })
    return veiculos


# --------------------------------------------------------------------------
# conferência
# --------------------------------------------------------------------------

CONTAS = [
    ("Ricardo", "socio", 3808862),
    ("Alagoana", "empresa", 5907476),
    ("Victor", "socio", 0),
    ("João", "socio", 0),
]

CAPITAL_INICIAL = [("João", 15000000), ("Victor", 7500000), ("Ricardo", 7500000)]

ESPERADO = {
    "veiculos": 16,
    "lancamentos": 195,
    "vendidos": 11,
    "em_estoque": 5,
    "faturado": 66146724,
    "lucro": 6419553,
    "investido": 59727171,
    "retorno_pct": "10,7%",
    "ciclo_medio": 75,
    "estoque_custo": 26908608,
    "caixa": 9716338,
    "patrimonio": 36624946,
}


def d(iso: str) -> date:
    return date(*map(int, iso.split("-")))


def brl(c: int) -> str:
    return f"{c // 100:,}".replace(",", ".") + f",{abs(c) % 100:02d}"


def derivar(v: dict) -> dict:
    prep = sum(c["valor"] for c in v["custos"])
    total = v["valor_compra"] + prep
    vendido = v["data_venda"] is not None
    ciclo = (d(v["data_venda"]) - d(v["data_compra"])).days if vendido \
        else (HOJE - d(v["data_compra"])).days
    return {"prep": prep, "total": total, "vendido": vendido, "ciclo": ciclo,
            "lucro": (v["valor_venda"] - total) if vendido else None}


def conferir(veiculos: list[dict]) -> bool:
    calc = {v["codigo"]: derivar(v) for v in veiculos}
    vendidos = [v for v in veiculos if calc[v["codigo"]]["vendido"]]
    estoque = [v for v in veiculos if not calc[v["codigo"]]["vendido"]]

    faturado = sum(v["valor_venda"] for v in vendidos)
    investido = sum(calc[v["codigo"]]["total"] for v in vendidos)
    lucro = faturado - investido
    ciclo_medio = round(sum(calc[v["codigo"]]["ciclo"] for v in vendidos) / len(vendidos))
    estoque_custo = sum(calc[v["codigo"]]["total"] for v in estoque)
    estoque_anuncio = sum(v["valor_anuncio"] or calc[v["codigo"]]["total"] for v in estoque)
    caixa = sum(saldo for _, _, saldo in CONTAS)
    patrimonio = caixa + estoque_custo

    obtido = {
        "veiculos": len(veiculos),
        "lancamentos": sum(len(v["custos"]) for v in veiculos),
        "vendidos": len(vendidos),
        "em_estoque": len(estoque),
        "faturado": faturado,
        "lucro": lucro,
        "investido": investido,
        "retorno_pct": f"{lucro / investido * 100:.1f}%".replace(".", ","),
        "ciclo_medio": ciclo_medio,
        "estoque_custo": estoque_custo,
        "caixa": caixa,
        "patrimonio": patrimonio,
    }

    print("\n  CONFERÊNCIA DA SEÇÃO 9\n")
    print(f"  {'':32} {'esperado':>16}  {'calculado':>16}")
    ok = True
    for chave, esperado in ESPERADO.items():
        valor = obtido[chave]
        bate = valor == esperado
        ok &= bate
        fmt = (lambda x: brl(x)) if chave in {
            "faturado", "lucro", "investido", "estoque_custo", "caixa", "patrimonio"
        } else str
        print(f"  {chave:32} {fmt(esperado):>16}  {fmt(valor):>16}   {'ok' if bate else 'DIVERGE'}")

    print(f"\n  estoque a preço de anúncio         {brl(estoque_anuncio):>16}")
    print(f"  lucro não realizado                {brl(estoque_anuncio - estoque_custo):>16}")
    print(f"  patrimônio futuro                  {brl(caixa + estoque_anuncio):>16}")

    print("\n  CONFERÊNCIA POR VEÍCULO (o que a tabela agregada não pega)\n")
    print(f"  {'cód':5} {'veículo':26} {'lanç':>5} {'compra':>13} {'preparação':>13} {'custo total':>13} {'lucro':>13}")
    for v in veiculos:
        c = calc[v["codigo"]]
        nome = f"{v['marca']} {v['modelo']}" + (f" {v['versao']}" if v["versao"] else "")
        lucro_txt = brl(c["lucro"]) if c["lucro"] is not None else "—"
        print(f"  {v['codigo']:5} {nome:26} {len(v['custos']):>5} {brl(v['valor_compra']):>13} "
              f"{brl(c['prep']):>13} {brl(c['total']):>13} {lucro_txt:>13}")

    # exemplos numéricos escritos na especificação
    print("\n  EXEMPLOS DA ESPECIFICAÇÃO\n")
    city = next(v for v in veiculos if v["codigo"] == "V-07")
    cc = calc["V-07"]
    pct = cc["lucro"] / cc["total"] * 100
    exemplos = [
        ("Honda City · custo total", brl(cc["total"]), "93.853,20"),
        ("Honda City · lucro", brl(cc["lucro"]), "3.146,80"),
        ("Honda City · retorno", f"{pct:.2f}%".replace(".", ","), "3,35%"),
        ("Honda City · ciclo", f"{cc['ciclo']} dias", "170 dias"),
        ("Honda City · retorno/mês", f"{pct / (cc['ciclo'] / 30):.2f}%".replace(".", ","), "0,59%"),
        ("Tracker · custo total", brl(calc["V-13"]["total"]), "71.183,46"),
    ]
    for rotulo, obtido_txt, esperado_txt in exemplos:
        bate = obtido_txt == esperado_txt
        ok &= bate
        print(f"  {rotulo:32} {esperado_txt:>16}  {obtido_txt:>16}   {'ok' if bate else 'DIVERGE'}")

    # capital dos sócios contra o patrimônio
    capital = sum(v for _, v in CAPITAL_INICIAL)
    print("\n  CAPITAL DOS SÓCIOS\n")
    print(f"  {'capital aportado':32} {brl(capital):>16}")
    print(f"  {'lucro realizado':32} {brl(lucro):>16}")
    print(f"  {'patrimônio esperado':32} {brl(capital + lucro):>16}")
    print(f"  {'patrimônio calculado':32} {brl(patrimonio):>16}")
    print(f"  {'diferença a investigar':32} {brl(patrimonio - capital - lucro):>16}")

    previstos = sum(c["valor"] for v in veiculos for c in v["custos"]
                    if c["data"] is None and not calc[v["codigo"]]["vendido"])
    print(f"\n  custos previstos e ainda não pagos no estoque: {brl(previstos)}")
    print("  (contam no estoque ao custo e o dinheiro ainda está no caixa)")

    return bool(ok)


# --------------------------------------------------------------------------

def conferir_catalogo(veiculos: list[dict], catalogo: dict) -> bool:
    """Depois das correções, todo veículo tem de existir no catálogo."""
    marcas, cores = catalogo["marcas"], catalogo["cores"]
    faltas = []
    for v in veiculos:
        if v["marca"] not in marcas:
            faltas.append(f"{v['codigo']}: marca {v['marca']}")
        elif v["modelo"] not in marcas[v["marca"]]:
            faltas.append(f"{v['codigo']}: modelo {v['marca']} {v['modelo']}")
        if v["cor"] not in cores:
            faltas.append(f"{v['codigo']}: cor {v['cor']}")

    motos = catalogo["marcasMoto"]
    print("\n  CATÁLOGO\n")
    for rotulo, valor, esperado in (
        ("marcas de carro", len(marcas), 27),
        ("modelos de carro", sum(len(m) for m in marcas.values()), 268),
        ("marcas de moto", len(motos), 20),
        ("modelos de moto", sum(len(m) for m in motos.values()), 170),
        ("cores", len(cores), 16),
    ):
        bate = valor == esperado
        faltas.append(f"{rotulo}: {valor}, esperado {esperado}") if not bate else None
        print(f"  {rotulo:32} {valor:>16}   {'ok' if bate else 'DIVERGE'}")
    if faltas:
        for f in faltas:
            print(f"  fora do catálogo: {f}")
        return False
    print(f"  {'veículos fora do catálogo':32} {'nenhum':>16}   ok")
    return True


def main() -> int:
    if not PROTOTIPO.exists():
        print(f"não encontrei o protótipo em {PROTOTIPO}", file=sys.stderr)
        return 2

    veiculos = transformar(ler_frota_bruta(PROTOTIPO))
    catalogo = ler_catalogo(PROTOTIPO)
    ok = conferir(veiculos)
    ok &= conferir_catalogo(veiculos, catalogo)

    if "--verificar" not in sys.argv:
        DESTINO.parent.mkdir(parents=True, exist_ok=True)
        DESTINO_CATALOGO.write_text(
            json.dumps(catalogo, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"\n  gravado: {DESTINO_CATALOGO.relative_to(RAIZ)}")

    if "--verificar" not in sys.argv and "--frota-do-prototipo" in sys.argv:
        DESTINO.write_text(
            json.dumps({
                "gerado_de": PROTOTIPO.name,
                "congelado_em": HOJE.isoformat(),
                "contas": [{"nome": n, "tipo": t, "saldo_inicial": s} for n, t, s in CONTAS],
                "capital_inicial": [{"socio": n, "valor": v} for n, v in CAPITAL_INICIAL],
                "veiculos": veiculos,
            }, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        print(f"  gravado: {DESTINO.relative_to(RAIZ)}  (frota do protótipo, não da planilha)")
    elif "--verificar" not in sys.argv:
        print(f"  {DESTINO.relative_to(RAIZ)} intacto — a frota vem da planilha.")

    print(f"\n  {'TUDO CONFERE' if ok else 'HÁ DIVERGÊNCIA — não avance'}\n")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
