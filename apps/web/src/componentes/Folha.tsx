/**
 * Folha inferior (*bottom sheet*) e os campos de formulário — §6.1 e §7.4.
 *
 * "Formulários abrem como bottom sheet." Campos com 16px para o iOS não dar
 * zoom ao focar, alvos de toque de 44px, e `inputmode` certo em cada tipo de
 * número.
 */

import { useEffect, useId, type ReactNode } from "react";

export function Folha(
  { titulo, dica, aoFechar, children }:
  { titulo: string; dica?: ReactNode; aoFechar: () => void; children: ReactNode },
) {
  // Esc fecha, e o corpo para de rolar atrás da folha.
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => { if (e.key === "Escape") aoFechar(); };
    document.addEventListener("keydown", aoTeclar);
    const antes = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", aoTeclar);
      document.body.style.overflow = antes;
    };
  }, [aoFechar]);

  return (
    <div className="sheet-bg" onClick={(e) => { if (e.target === e.currentTarget) aoFechar(); }}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={titulo}>
        <div className="grab" />
        <h3>{titulo}</h3>
        {dica && <p className="hint">{dica}</p>}
        {children}
      </div>
    </div>
  );
}

export function Campo(
  { rotulo, children }: { rotulo: string; children: (id: string) => ReactNode },
) {
  const id = useId();
  return (
    <div className="campo">
      <label htmlFor={id}>{rotulo}</label>
      {children(id)}
    </div>
  );
}

/** Campo de dinheiro: teclado decimal e nada de `type=number`, que come vírgula. */
export function CampoValor(
  { rotulo, valor, aoMudar, dica }:
  { rotulo: string; valor: string; aoMudar: (v: string) => void; dica?: string },
) {
  return (
    <Campo rotulo={rotulo}>
      {(id) => (
        <input
          id={id} type="text" inputMode="decimal" value={valor}
          placeholder={dica ?? "0,00"}
          onChange={(e) => aoMudar(e.target.value)}
        />
      )}
    </Campo>
  );
}

export function CampoTexto(
  { rotulo, valor, aoMudar, dica }:
  { rotulo: string; valor: string; aoMudar: (v: string) => void; dica?: string },
) {
  return (
    <Campo rotulo={rotulo}>
      {(id) => (
        <input id={id} type="text" value={valor} placeholder={dica ?? ""}
               onChange={(e) => aoMudar(e.target.value)} />
      )}
    </Campo>
  );
}

export function CampoNumero(
  { rotulo, valor, aoMudar }: { rotulo: string; valor: string; aoMudar: (v: string) => void },
) {
  return (
    <Campo rotulo={rotulo}>
      {(id) => (
        <input id={id} type="text" inputMode="numeric" value={valor}
               onChange={(e) => aoMudar(e.target.value)} />
      )}
    </Campo>
  );
}

export function CampoData(
  { rotulo, valor, aoMudar }: { rotulo: string; valor: string; aoMudar: (v: string) => void },
) {
  return (
    <Campo rotulo={rotulo}>
      {(id) => (
        <input id={id} type="date" value={valor} onChange={(e) => aoMudar(e.target.value)} />
      )}
    </Campo>
  );
}

export function CampoSelecao(
  { rotulo, valor, aoMudar, children }:
  { rotulo: string; valor: string; aoMudar: (v: string) => void; children: ReactNode },
) {
  return (
    <Campo rotulo={rotulo}>
      {(id) => (
        <select id={id} value={valor} onChange={(e) => aoMudar(e.target.value)}>{children}</select>
      )}
    </Campo>
  );
}

export function CampoMarcavel(
  { rotulo, marcado, aoMudar }:
  { rotulo: ReactNode; marcado: boolean; aoMudar: (v: boolean) => void },
) {
  return (
    <div className="campo caixa">
      <label>
        <input type="checkbox" checked={marcado} onChange={(e) => aoMudar(e.target.checked)} />
        {rotulo}
      </label>
    </div>
  );
}

/** A recusa aparece onde a pessoa está olhando, com o texto exato da §8. */
export function Erro({ mensagem }: { mensagem: string | null }) {
  if (!mensagem) return null;
  return <p className="err" role="alert">{mensagem}</p>;
}

export function Acoes({ children }: { children: ReactNode }) {
  return <div className="acoes">{children}</div>;
}
