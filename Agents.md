# Projeto: Matinê, catálogo de filmes e séries gratuitos do YouTube
- HTML, CSS e JavaScript puros. Sem frameworks e sem etapa de build.
- Interface em português do Brasil, tema escuro, visual de catálogo com fileiras horizontais por categoria.
- Código comentado de forma curta e clara.

## Regras legais (nunca quebrar)
- Reproduzir SEMPRE pelo player oficial do YouTube (iframe). Nunca baixar, guardar ou extrair o vídeo.
- Nunca colocar nada por cima do player, nem molduras ou botões sobre os controles.
- Nunca bloquear anúncios nem alterar o player.
- Só listar vídeos de canais que estejam em canais.json (whitelist de canais oficiais). Proibido buscar canais na hora.
- Se o vídeo não permitir embed, mostrar o botão "Assistir no YouTube" com link para o vídeo.
- O rodapé deve ter o link para os Termos de Serviço do YouTube e o aviso: "Projeto independente, sem vínculo com YouTube ou Netflix."

## Dados
- canais.json: lista de canais com nome, id do canal e categoria.
- scripts/atualizar-catalogo.js (Node): lê a playlist de uploads de cada canal com playlistItems.list, filtra por duração (mais de 60 minutos) e status com videos.list, registra as visualizações (statistics.viewCount) e grava catalogo.json.
- A chave da API fica em .env e NUNCA vai para o site nem para o git.
- Não usar search.list. Usar só playlistItems.list, videos.list e channels.list.
- O catalogo.json tem validade de 30 dias: guardar a data da atualização e mostrar aviso se passar disso.
- O ano vem do título quando houver (ex.: "(1999)"). Se não houver, usar o ano do upload e marcar como aproximado.

## Interface
- Fileiras por categoria, filtro por ano, busca por título e página de reprodução com o player em 16:9.
- Carrossel com 4 destaques ("Em alta"), escolhidos pelo ritmo de visualizações (views por dia) dos títulos recentes.
