# Estado do projeto — Matinê

Última atualização: **17/11/2026**
Sessão do OpenCode: `ses_e19fab494fferKMktei1MELET9` (“Matinê — catálogo e site prontos”)

## Concluído

- **Node.js 26.13.1 LTS** instalado sem sudo em `~/.local/opt/node`, com links em `~/.local/bin`.
  PATH adicionado ao `~/.bashrc` — em terminal novo já funciona; scripts não-interativos podem
  precisar de `export PATH="$HOME/.local/bin:$PATH"`.
- **`canais.json`** com 3 canais ativos:
  - Cult Cinema Classics — Clássicos
  - PeeWee Filmes — Filmes (`UC6P6ib1uE0zaWgzyQ61YaZg`)
  - Movie Central — Filmes
- **`catalogo.json`** gerado em 17/11/2026 18:59 UTC: **622 itens**
  (Clássicos 337 · Filmes 285); 242 com ano aproximado; 622 com visualizações; nenhum sem embed.
- **Site** em HTML/CSS/JS puros:
  - `index.html` — cabeçalho, busca, filtro de ano, carrossel de destaques, catálogo, página de
    reprodução, rodapé legal.
  - `estilo.css` — tema escuro, carrossel, fileiras horizontais com setas, player 16:9, responsivo.
  - `app.js` — lê `catalogo.json`, fileiras por categoria, busca sem acentos, filtro por ano,
    rota `#/assistir/VIDEOID`, iframe oficial do YouTube, fallback para vídeo sem embed,
    aviso de catálogo vencido (30 dias) e limpeza do sufixo `| Nome do canal`.
  - **Carrossel “Em alta”** com 4 títulos: ritmo de visualizações (views/dia) dos últimos 60 dias,
    no máximo 2 por canal, com troca automática (7 s), setas, pontos, swipe e pausa no hover/foco.
    Sem histórico semanal, esse ritmo é a aproximação disponível para “mais assistidos da semana”.
- **`.opencode/command/novocanal.md`** — `/novocanal "Nome" CANAL_ID Categoria` adiciona canal,
  valida via `channels.list`, regenera o catálogo e relata o resultado.
- **`scripts/servidor.js`** — servidor estático de desenvolvimento com `Cache-Control: no-store`.
- Testes de fumaça com jsdom (45 verificações) em `/tmp/opencode/matine-teste/teste.js` (temporário).

## Como rodar

```bash
export PATH="$HOME/.local/bin:$PATH"
cd /home/tekzo/Projetos/matine
node scripts/servidor.js 8000
# http://localhost:8000
```

O `scripts/servidor.js` serve a pasta com `Cache-Control: no-store` (evita ficar com `app.js`/CSS
antigos em cache). O `python3 -m http.server` também funciona, mas responde `304` e pode exibir
versões velhas — nesse caso, recarregue com Ctrl+Shift+R.

Atualizar o catálogo:

```bash
node scripts/atualizar-catalogo.js            # completo
node scripts/atualizar-catalogo.js --dry-run  # simulação
```

## Situação atual

- Servidor de desenvolvimento rodando em segundo plano:
  `node scripts/servidor.js 8000` (PID 58270, sem cache).
- Repositório público: <https://github.com/silotto/matine>
  - Branch `main`, remoto `origin` (HTTPS).
  - **GitHub Pages ativo** (branch `main`, raiz): <https://silotto.github.io/matine/>
  - Publicado em 18/11/2026; build do Pages concluído com sucesso.
- `GitHub CLI 2.105.0` instalado sem sudo em `~/.local/opt/gh`, link em `~/.local/bin/gh`.
- Identidade local do git: `Silotto <5083814+silotto@users.noreply.github.com>`.
- `.env` existe com `YOUTUBE_API_KEY` e permissão `600` (ignorado pelo `.gitignore` e
  confirmado ausente do repositório e do site publicado).
- `catalogo.json` **é versionado** (necessário para o Pages): contém só metadados públicos, sem a chave.

## Pendências / próximos passos

1. **Anos aproximados** — 242 itens usam o ano do upload e aparecem como “(aprox.)”.
   Avaliar heurística melhor (ex.: não usar o ano do upload quando o vídeo for recente).
2. **Visualizações semanais reais** — hoje o carrossel usa views/dia desde o upload. Para “assistidos
   na semana” de verdade, guardar snapshots periódicos de `visualizacoes` e rankear pelo delta.
3. **Canais** — revalidar a lista e remover canais sem uploads; hoje todos respondem.
4. ~~**Git** — `git init` + primeiro commit~~ — feito: repositório publicado em
   <https://github.com/silotto/matine> com GitHub Pages.
5. **Validade** — regenerar o catálogo a cada 30 dias (o site avisa quando vence).
   Sem automação ainda: rodar `node scripts/atualizar-catalogo.js` e commitar o resultado.
   Opcional: workflow agendado no Actions com a chave em `secrets.YOUTUBE_API_KEY`.
6. Opcional: renomear `.opencode/command/` para `.opencode/commands/` (plural, recomendado na doc V2).

## Decisões tomadas

- Navegação por hash, sem servidor/roteador.
- Player sempre em iframe `youtube.com/embed/ID`, sem qualquer sobreposição; o iframe é removido
  ao sair da página para interromper o áudio.
- Vídeo com `embed: false` não simula player: mostra aviso e botão “Assistir no YouTube”.
- O site só consome `catalogo.json`; não fala com a API do YouTube.
- Destaques do carrossel são calculados no navegador (nada extra no `catalogo.json`), com limite de
  2 por canal para variar os títulos exibidos.
- Rodapé com link dos Termos do YouTube e o aviso “Projeto independente, sem vínculo com YouTube
  ou Netflix.”

## Observações

- Abrir `index.html` direto do disco não funciona (o `fetch` do catálogo exige HTTP).
- Nunca imprimir/commitar a `YOUTUBE_API_KEY`.
- Só canais oficiais entram na whitelist (regra do `Agents.md`).
