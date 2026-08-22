/** Tela de login — §5. A senha se define no terminal do servidor. */

import { useState } from "react";
import { api, ErroApi, type Usuario } from "../api.js";

export function Login({ aoEntrar }: { aoEntrar: (u: Usuario) => void }) {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      const { usuario } = await api.entrar(email, senha);
      setSenha("");
      aoEntrar(usuario);
    } catch (erroDoLogin) {
      setErro(erroDoLogin instanceof ErroApi ? erroDoLogin.message : "Não foi possível entrar.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <main className="login">
      <div className="card">
        <div className="marca">
          <span className="selo" role="img" aria-label="Alagoana Veículos" />
          <span className="nome">Alagoana Veículos</span>
        </div>
        <p className="sub">Sistema de gestão · acesso interno</p>

        {erro && <p className="aviso" role="alert">{erro}</p>}

        <form onSubmit={entrar}>
          <div className="campo">
            <label htmlFor="email">E-mail</label>
            <input
              id="email" type="email" value={email} required
              autoComplete="username" inputMode="email"
              autoCapitalize="none" spellCheck={false}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="campo">
            <label htmlFor="senha">Senha</label>
            <input
              id="senha" type="password" value={senha} required
              autoComplete="current-password"
              onChange={(e) => setSenha(e.target.value)}
            />
          </div>
          <button className="btn" type="submit" disabled={enviando} style={{ marginTop: 18 }}>
            {enviando ? "Entrando…" : "Entrar"}
          </button>
        </form>

        <p className="rodape">
          Primeiro acesso, ou senha esquecida? A senha se define no terminal do
          servidor:<br /><code>npm run senha -- seu@email</code>
        </p>
      </div>
    </main>
  );
}
