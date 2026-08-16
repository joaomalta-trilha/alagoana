#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Extrai a carga a partir da planilha da loja (referencia/planilha-2026.xlsx)
e grava apps/api/src/db/seed/frota.json.

A planilha é a fonte do histórico. Os protótipos seguem sendo a referência
visual, e `extrair-carga.py` segue sendo quem lê os catálogos de marca e cor
deles — este arquivo cuida só da frota.

Valores em CENTAVOS INTEIROS. Nenhum float sobrevive à extração.

Três armadilhas do arquivo, todas encontradas na marra:

  1. Há uma tabela-resumo no rodapé, uma linha por veículo, cujas colunas
     parecem lançamentos. Ela é ignorada — e ainda bem, porque tem fórmula
     quebrada: mostra o Tracker vendido por -58.083 quando a transação diz
     83.000. Linha de transação manda; resumo não.

  2. "Carro Compra" aparece duas vezes por veículo: uma como cabeçalho e
     outras como despesa de aquisição (IPVA, comissão de captação). As
     segundas somam ao valor de compra, como a planilha faz.

  3. Um veículo é "Carro Compra Repasse": comprado e repassado pelo mesmo
     valor no dia seguinte, lucro zero. Entra como veículo normal — aconteceu,
     e escondê-lo faria a contagem mentir.

Uso:  python3 ferramentas/extrair-planilha.py [--verificar]
"""

# `str | None` em anotação exige 3.10; o python3 desta máquina é mais velho.
from __future__ import annotations

import json
import re
import sys
import zipfile
from datetime import date, timedelta
from decimal import Decimal
from pathlib import Path
from xml.etree import ElementTree as ET

RAIZ = Path(__file__).resolve().parent.parent
PLANILHA = RAIZ / "referencia" / "planilha-2026.xlsx"
DESTINO = RAIZ / "apps" / "api" / "src" / "db" / "seed" / "frota.json"

NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
EPOCA = date(1899, 12, 30)

# A data em que a planilha foi recebida. Conferência que envolve "hoje" é
# feita contra ela, nunca contra a data de execução.
HOJE = date(2026, 8, 16)

# Saldos informados pelo cliente em 16/08/2026.
CONTAS = [
    ("Ricardo", "socio", 3808862),
    ("Alagoana", "empresa", 4000000),
    ("Victor", "socio", 260854),
    ("João", "socio", 317476),
]
CAPITAL_INICIAL = [("João", 15000000), ("Victor", 7500000), ("Ricardo", 7500000)]

# --------------------------------------------------------------- leitura


def _coluna(ref: str) -> int:
    n = 0
    for c in re.match(r"[A-Z]+", ref).group():
        n = n * 26 + (ord(c) - 64)
    return n - 1


def ler_xlsx(caminho: Path) -> list[list[str]]:
    z = zipfile.ZipFile(caminho)
    partilhadas = []
    if "xl/sharedStrings.xml" in z.namelist():
        for si in ET.fromstring(z.read("xl/sharedStrings.xml")).findall(f"{NS}si"):
            partilhadas.append("".join(t.text or "" for t in si.iter(f"{NS}t")))

    linhas = []
    for linha in ET.fromstring(z.read("xl/worksheets/sheet1.xml")).iter(f"{NS}row"):
        cel = {}
        for c in linha.findall(f"{NS}c"):
            v, tipo = c.find(f"{NS}v"), c.get("t")
            if tipo == "s" and v is not None:
                txt = partilhadas[int(v.text)]
            elif tipo == "inlineStr":
                txt = "".join(x.text or "" for x in c.iter(f"{NS}t"))
            else:
                txt = (v.text or "") if v is not None else ""
            if txt.strip():
                cel[_coluna(c.get("r"))] = txt.strip()
        linhas.append([cel.get(i, "") for i in range(max(cel) + 1)] if cel else [])
    return linhas


def dia(valor) -> str | None:
    try:
        return (EPOCA + timedelta(days=int(float(valor)))).isoformat()
    except (ValueError, TypeError):
        return None


def centavos(valor) -> int | None:
    try:
        return int((Decimal(str(valor)) * 100).quantize(Decimal("1")))
    except Exception:
        return None


# ------------------------------------------------------------- conversões

# A planilha identifica o veículo por "MODELO - COR - ANO - PLACA". A marca
# está implícita no modelo, e é o vendedor que sabe qual é.
MARCAS = {
    "kicks s": ("Nissan", "Kicks", "S"),
    "fiesta": ("Ford", "Fiesta", None),
    "cruze": ("Chevrolet", "Cruze", None),
    "fiat 500": ("Fiat", "500", None),
    "t cross": ("Volkswagen", "T-Cross", None),
    "mobi": ("Fiat", "Mobi", None),
    "honda city": ("Honda", "City", None),
    "hyundai creta": ("Hyundai", "Creta", None),
    "ford ka": ("Ford", "Ka", None),
    "ford eco sport": ("Ford", "EcoSport", None),
    "volks polo highline": ("Volkswagen", "Polo", "Highline"),
    "hyundai tucson": ("Hyundai", "Tucson", None),
    "tracker": ("Chevrolet", "Tracker", None),
    "hyundaí hb20": ("Hyundai", "HB20", None),
    "hyundai hb20": ("Hyundai", "HB20", None),
    "ford ka sedan": ("Ford", "Ka Sedan", None),
    "toyota yaris": ("Toyota", "Yaris", None),
    "moto fazer": ("Yamaha", "Fazer 250", None),
    "nissan versa": ("Nissan", "Versa", None),
}

MOTOS = {"moto fazer"}

CORES = {"preta": "Preto", "branca": "Branco", "prata": "Prata", "cinza": "Cinza",
         "preto": "Preto", "branco": "Branco", "vermelho": "Vermelho",
         "vermelha": "Vermelho", "grafite": "Grafite", "azul": "Azul"}

# A §3.7 é lista fechada. "Multa" não está nela; é uma linha só, no Honda
# City, e entra como Imposto — que é o que uma multa é do ponto de vista do
# caixa. A descrição preserva a palavra.
CATEGORIAS = {
    "Combustível", "Transferência", "Consulta", "Peças", "Pintura", "Polimento",
    "Reparo", "Manutenção", "Revisão", "Serviço", "Guincho", "IPVA", "Imposto",
    "Amarelinha", "Cautelar", "Bateria", "Chaveiro", "Lâmpada", "Patrocinado",
    "Comissão", "Retorno", "Troca", "Não detalhado",
}
EQUIVALENTES = {"Multa": "Imposto"}


def identificar(titulo: str) -> dict:
    # "HYUNDAÍ HB20- BRANCO" tem o hífen colado no modelo; sem normalizar, a
    # divisão por " - " deixa a cor grudada e o modelo deixa de ser reconhecido.
    titulo = re.sub(r"(?<! )- ", " - ", titulo)
    partes = [p.strip() for p in titulo.split(" - ") if p.strip()]
    placa = re.sub(r"\s*\(.*\)$", "", partes[-1]).strip().upper() if partes else ""
    ano = next((int(p) for p in partes if re.fullmatch(r"(19|20)\d{2}", p)), None)
    cor = next((CORES[p.lower()] for p in partes if p.lower() in CORES), "Prata")

    corte = len(partes) - 1
    for i, p in enumerate(partes):
        if p.lower() in CORES or re.fullmatch(r"(19|20)\d{2}", p):
            corte = i
            break
    bruto = " ".join(partes[:corte]).strip().rstrip("-").strip()
    chave = re.sub(r"\s+", " ", bruto.lower()).replace("- ", " ").strip()

    if chave not in MARCAS:
        raise SystemExit(f"  modelo desconhecido: {bruto!r} (de {titulo!r})")
    marca, modelo, versao = MARCAS[chave]
    return {"marca": marca, "modelo": modelo, "versao": versao, "ano": ano,
            "cor": cor, "placa": placa,
            "tipo": "moto" if chave in MOTOS else "carro"}


# --------------------------------------------------------------- extração

def extrair() -> tuple[list[dict], list[str]]:
    linhas = ler_xlsx(PLANILHA)
    veiculos: list[dict] = []
    atual: dict | None = None
    avisos: list[str] = []

    for numero, l in enumerate(linhas, 1):
        if len(l) < 2 or not l[0] or not l[1]:
            continue
        nome, categoria = l[0], l[1]

        # A tabela-resumo do rodapé tem data na 2ª coluna. Dali em diante não
        # há mais transação nenhuma.
        if dia(categoria) is not None:
            break

        cabecalho = len(l) > 6 and l[6] == "% Lucro"
        data_, valor = dia(l[2]) if len(l) > 2 else None, centavos(l[3]) if len(l) > 3 else None

        if categoria in ("Carro Compra", "Carro Compra Repasse") and cabecalho:
            atual = {**identificar(nome), "codigo": f"V-{len(veiculos) + 1:02d}",
                     "data_compra": data_, "valor_compra": -valor,
                     "valor_anuncio": None, "fipe_compra": None, "fipe_hoje": None,
                     "data_venda": None, "valor_venda": None, "origem": "compra",
                     "km": None, "custos": [],
                     "observacao": "Repasse: comprado e repassado pelo mesmo valor."
                                   if "Repasse" in categoria else None}
            veiculos.append(atual)
            continue

        if atual is None:
            continue

        # Colunas de resumo à direita do bloco do veículo.
        if len(l) > 6 and l[6] in ("ANÚNCIO", "Fipe"):
            v = centavos(l[5]) if len(l) > 5 else None
            if v:
                atual["valor_anuncio" if l[6] == "ANÚNCIO" else "fipe_compra"] = v

        if categoria in ("Carro Venda", "Carro Venda Repasse"):
            atual["valor_venda"], atual["data_venda"] = valor, data_
        elif categoria in ("Carro Compra", "Carro Compra Repasse"):
            # Despesa de aquisição: soma ao valor de compra, como a planilha faz.
            atual["valor_compra"] += -valor
        elif valor is not None:
            # Linha de valor zero é espaço reservado da planilha — não é custo,
            # e o banco recusa (custo tem de ser maior que zero).
            if valor == 0:
                avisos.append(f"linha {numero}: {nome!r} com valor zero, ignorada")
                continue
            cat = EQUIVALENTES.get(categoria, categoria)
            if cat not in CATEGORIAS:
                avisos.append(f"linha {numero}: categoria fora da §3.7: {categoria!r}")
                cat = "Serviço"
            elif categoria in EQUIVALENTES:
                avisos.append(f"linha {numero}: {categoria!r} → {cat!r} (fora da §3.7)")
            atual["custos"].append({"descricao": nome, "categoria": cat,
                                    "data": data_, "valor": -valor})

    for v in veiculos:
        v["fipe_hoje"] = v["fipe_compra"]      # a planilha só tem um valor
    return veiculos, avisos


# ------------------------------------------------------------ conferência

def brl(c: int) -> str:
    return f"{c/100:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


def conferir(veiculos: list[dict]) -> bool:
    vendidos = [v for v in veiculos if v["valor_venda"]]
    estoque = [v for v in veiculos if not v["valor_venda"]]
    total = lambda v: v["valor_compra"] + sum(c["valor"] for c in v["custos"])

    faturado = sum(v["valor_venda"] for v in vendidos)
    investido = sum(total(v) for v in vendidos)
    caixa = sum(s for _, _, s in CONTAS)
    ao_custo = sum(total(v) for v in estoque)

    print("\n  CONFERÊNCIA DA PLANILHA\n")
    linhas = [
        ("veículos", len(veiculos)),
        ("lançamentos", sum(len(v["custos"]) for v in veiculos)),
        ("vendidos", len(vendidos)),
        ("em estoque", len(estoque)),
        ("total faturado", brl(faturado)),
        ("investido nos vendidos", brl(investido)),
        ("lucro total", brl(faturado - investido)),
        ("retorno sobre o investido", f"{(faturado-investido)/investido*100:.1f}%"),
        ("ciclo médio", round(sum(
            (date.fromisoformat(v["data_venda"]) - date.fromisoformat(v["data_compra"])).days
            for v in vendidos) / len(vendidos))),
        ("estoque ao custo", brl(ao_custo)),
        ("caixa total", brl(caixa)),
        ("patrimônio total", brl(caixa + ao_custo)),
    ]
    for rotulo, valor in linhas:
        print(f"  {rotulo:28}{str(valor):>18}")

    print("\n  POR VEÍCULO\n")
    for v in veiculos:
        nome = f"{v['marca']} {v['modelo']}" + (f" {v['versao']}" if v["versao"] else "")
        lucro = (v["valor_venda"] - total(v)) if v["valor_venda"] else None
        print(f"  {v['codigo']:6}{nome[:26]:27}{v['tipo']:6}{len(v['custos']):>4}"
              f"{brl(v['valor_compra']):>13}{brl(total(v)):>13}"
              f"{(brl(lucro) if lucro is not None else '—'):>13}")
    return True


def conferir_categorias(veiculos: list, linhas: list) -> bool:
    """Confere o extraído contra a tabela "Códigos | Valores" do rodapé.

    É a conferência que importa: a planilha soma sozinha, por categoria, e se
    o que eu li não bater com o que ela declara, li errado. As linhas de
    compra e venda ficam de fora porque não são custo.
    """
    fora = {"Carro Compra", "Carro Venda", "Carro Compra Repasse",
            "Carro Venda Repasse", "Aporte", "Maquineta", "Parcela", "Banco"}

    oficial, lendo = {}, False
    for l in linhas:
        if len(l) >= 2 and l[0] == "Códigos":
            lendo = True
            continue
        if lendo and len(l) >= 2 and l[0] and l[1]:
            # A tabela de categorias termina onde começa a de veículos, cujas
            # linhas trazem o título completo — "MODELO - COR - ANO - PLACA".
            if " - " in l[0]:
                break
            if l[0].upper() == "TOTAL":
                oficial["__total__"] = -centavos(l[1])
                continue
            v = centavos(l[1])
            if v is not None:
                oficial[l[0]] = -v

    extraido: dict = {}
    for v in veiculos:
        for c in v["custos"]:
            extraido[c["categoria"]] = extraido.get(c["categoria"], 0) + c["valor"]

    # "Multa" foi somada em "Imposto"; para conferir, desfaz-se a soma.
    declarado = oficial.pop("__total__", None)
    esperado = {k: v for k, v in oficial.items() if k not in fora}
    if "Multa" in esperado:
        esperado["Imposto"] = esperado.get("Imposto", 0) + esperado.pop("Multa")

    print("\n  CUSTOS POR CATEGORIA, CONTRA A PLANILHA\n")
    ok = True
    for cat in sorted(esperado, key=lambda c: -esperado[c]):
        alvo, obtido = esperado[cat], extraido.get(cat, 0)
        bate = alvo == obtido
        ok &= bate
        print(f"  {cat:20}{brl(alvo):>14}{brl(obtido):>14}   {'ok' if bate else 'DIVERGE'}")

    sobrando = set(extraido) - set(esperado)
    for cat in sorted(sobrando):
        ok = False
        print(f"  {cat:20}{'—':>14}{brl(extraido[cat]):>14}   SÓ NO EXTRAÍDO")

    total_e, total_x = sum(esperado.values()), sum(extraido.values())
    print(f"\n  {'TOTAL':20}{brl(total_e):>14}{brl(total_x):>14}   "
          f"{'ok' if total_e == total_x else 'DIVERGE'}")
    if declarado is not None and declarado != total_e:
        print(f"  {'(planilha declara)':20}{brl(declarado):>14}")
    return ok and total_e == total_x


def main() -> int:
    if not PLANILHA.exists():
        print(f"não encontrei a planilha em {PLANILHA}", file=sys.stderr)
        return 2

    veiculos, avisos = extrair()
    conferir(veiculos)
    ok = conferir_categorias(veiculos, ler_xlsx(PLANILHA))

    if avisos:
        print("\n  AVISOS\n")
        for a in avisos:
            print(f"  {a}")

    if not ok:
        print("\n  HÁ DIVERGÊNCIA — nada foi gravado\n")
        return 1

    if "--verificar" not in sys.argv:
        DESTINO.write_text(json.dumps({
            "gerado_de": PLANILHA.name,
            "congelado_em": HOJE.isoformat(),
            "contas": [{"nome": n, "tipo": t, "saldo_inicial": s} for n, t, s in CONTAS],
            "capital_inicial": [{"socio": n, "valor": v} for n, v in CAPITAL_INICIAL],
            "veiculos": veiculos,
        }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"\n  gravado: {DESTINO.relative_to(RAIZ)}")

    print()
    return 0


if __name__ == "__main__":
    sys.exit(main())
