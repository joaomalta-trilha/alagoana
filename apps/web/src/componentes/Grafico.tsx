/**
 * Chart.js 4 — a mesma biblioteca do protótipo, para a migração ser direta.
 *
 * O gráfico é desenhado num canvas fora do React: a instância é criada no
 * efeito e destruída na limpeza. Sem isso, cada re-render deixaria um gráfico
 * órfão segurando o canvas.
 */

import { useEffect, useRef } from "react";
import { Chart, type ChartConfiguration } from "chart.js/auto";

const fonte = { family: '"IBM Plex Sans", sans-serif', size: 11 };

export const opcoesBase = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    tooltip: {
      backgroundColor: "#15181A", padding: 9,
      titleFont: fonte, bodyFont: fonte, cornerRadius: 6,
    },
  },
} as const;

export const eixoValor = {
  grid: { color: "#EDEFEA" }, border: { display: false },
  ticks: { font: fonte, color: "#858B87" },
};
export const eixoRotulo = {
  grid: { display: false }, border: { display: false },
  ticks: { font: fonte, color: "#4A524F" },
};

export function Grafico({ config, altura }: { config: ChartConfiguration; altura?: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvas.current) return;
    const grafico = new Chart(canvas.current, config);
    return () => grafico.destroy();
  }, [config]);

  return (
    <div className="chart-box" style={altura ? { height: altura } : undefined}>
      <canvas ref={canvas} />
    </div>
  );
}
