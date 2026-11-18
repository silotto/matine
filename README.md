# Matinê

Catálogo de filmes e séries completos e gratuitos do YouTube, reproduzidos sempre no player oficial.

Site estático em HTML, CSS e JavaScript puros — sem frameworks e sem etapa de build.

## Como funciona

- `canais.json` mantém a **whitelist** de canais oficiais que podem ser catalogados.
- `scripts/atualizar-catalogo.js` (Node) lê a playlist de uploads de cada canal com
  `playlistItems.list`, filtra vídeos com mais de 60 minutos, confirma o status com `videos.list`
  e grava `catalogo.json`.
- O site lê apenas `catalogo.json`. Ele nunca fala com a API do YouTube.
- A reprodução usa o iframe oficial (`youtube.com/embed/ID`). Nada é baixado, guardado ou alterado.

> Projeto independente, sem vínculo com YouTube ou Netflix.

## Rodar localmente

```bash
node scripts/servidor.js 8000
# http://localhost:8000
```

Abrir `index.html` direto do disco não funciona: o `fetch` do catálogo exige HTTP.

## Atualizar o catálogo

Crie um `.env` a partir do exemplo e preencha sua chave da API do YouTube:

```bash
cp .env.example .env
# edite .env e coloque YOUTUBE_API_KEY=...
```

```bash
node scripts/atualizar-catalogo.js            # completo
node scripts/atualizar-catalogo.js --dry-run  # simulação, não grava
```

O catálogo tem validade de 30 dias e o site avisa quando vence.

## Adicionar um canal

Edite `canais.json` (ou use o comando `/novocanal` no OpenCode) e regenere o catálogo.
Só entram canais oficiais/licenciados.

## Estrutura

| Arquivo | Papel |
| --- | --- |
| `index.html` | Estrutura da página |
| `estilo.css` | Tema escuro, carrossel e fileiras |
| `app.js` | Busca, filtros, rotas e player |
| `canais.json` | Whitelist de canais |
| `catalogo.json` | Catálogo gerado (dados públicos do YouTube) |
| `scripts/atualizar-catalogo.js` | Gerador do catálogo |
| `scripts/servidor.js` | Servidor estático de desenvolvimento |
| `Agents.md` | Regras do projeto, incluindo as legais |

## Segredos

A `YOUTUBE_API_KEY` vive só no `.env`, que é ignorado pelo Git. O `catalogo.json` contém apenas
metadados públicos (título, canal, duração, visualizações) e **não** inclui a chave.
