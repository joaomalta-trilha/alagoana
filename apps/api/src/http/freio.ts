/**
 * Freio de tentativas de login.
 *
 * Em memória, de propósito. São três usuários e um processo; uma tabela no
 * banco custaria uma escrita a cada senha errada e um reinício do servidor
 * zerando o freio é um risco que cabe neste porte. Se um dia houver mais de um
 * processo servindo, isto precisa sair daqui — está isolado para facilitar.
 *
 * Conta falhas por chave (e-mail + IP). Passando do limite, a chave fica
 * bloqueada por uma janela contada a partir da última tentativa: quem insiste
 * enquanto está bloqueado só empurra o próprio desbloqueio para frente.
 */

export class Freio {
  private readonly tentativas = new Map<string, { falhas: number; ultimaEm: number }>();

  constructor(
    private readonly limite = 5,
    private readonly janelaMs = 15 * 60 * 1000,
    private readonly capacidade = 10_000,
  ) {}

  /** Milissegundos que ainda faltam para liberar; 0 quando está liberado. */
  esperaRestante(chave: string, agora: number): number {
    const t = this.tentativas.get(chave);
    if (!t) return 0;
    const fim = t.ultimaEm + this.janelaMs;
    if (agora >= fim) {
      this.tentativas.delete(chave);                 // janela venceu, esquece
      return 0;
    }
    return t.falhas >= this.limite ? fim - agora : 0;
  }

  registrarFalha(chave: string, agora: number): void {
    const t = this.tentativas.get(chave);
    if (!t || agora - t.ultimaEm >= this.janelaMs) {
      this.podar(agora);
      this.tentativas.set(chave, { falhas: 1, ultimaEm: agora });
      return;
    }
    t.falhas++;
    t.ultimaEm = agora;
  }

  /** Login deu certo: a chave sai da lista. */
  limpar(chave: string): void {
    this.tentativas.delete(chave);
  }

  /**
   * Remove o que já venceu, e só quando o mapa passa da capacidade.
   *
   * Sem isto, um atacante variando o e-mail faria o mapa crescer sem limite —
   * o freio viraria o vazamento de memória que ele deveria evitar.
   */
  private podar(agora: number): void {
    if (this.tentativas.size < this.capacidade) return;
    for (const [chave, t] of this.tentativas) {
      if (agora - t.ultimaEm >= this.janelaMs) this.tentativas.delete(chave);
    }
  }
}
