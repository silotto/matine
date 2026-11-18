---
description: Adiciona um canal ao canais.json e regenera o catálogo
---

Adicione um canal ao catálogo do Matinê e regenere o `catalogo.json`.

Argumentos recebidos:
- Nome: $1
- ID do canal: $2
- Categoria: $3

Se algum dos três estiver vazio, **pare** e mostre o uso correto (use aspas em nomes com espaço):

```text
/novocanal "Nome do Canal" UCxxxxxxxxxxxxxxxxxxxxxx Categoria
```

## Antes de editar

1. Leia `Agents.md`, `canais.json` e `scripts/atualizar-catalogo.js`.
2. Confirme que o canal é oficial/licenciado: a whitelist só aceita canais oficiais (regra do `Agents.md`). Se houver dúvida sobre a licença, pergunte ao usuário antes de continuar.
3. Valide o ID com o formato `^UC[\w-]{22}$`. Se não bater, pare e mostre o formato esperado.
4. Verifique se o `canalId` já existe em `canais.json`. Se existir, não duplique: informe qual entrada já usa esse ID e encerre.

## Verificação na API (opcional, mas recomendada)

Use `channels.list` (permitido pelo `Agents.md`) com a chave de `.env` para confirmar que o canal existe antes de gravar. Rode um trecho Node que leia a chave **sem exibi-la** — nunca imprima, cole ou versione a `YOUTUBE_API_KEY`.

Se não houver retorno para o ID, pare e avise que o ID parece inválido. Se o canal existir mas tiver `videoCount` igual a 0, avise que ele não vai contribuir com nenhum título.

## Edição do canais.json

- Adicione a entrada ao final da lista `canais`, no mesmo formato das existentes (2 espaços de recuo, campos `nome`, `canalId`, `categoria`, `ativo: true`). Se já houver canais da mesma categoria, insira junto deles para manter o agrupamento.
- Atualize o campo `atualizadoEm` para a data de hoje no formato `AAAA-MM-DD`.
- Preserve o restante do arquivo e o JSON válido.

## Atualização do catálogo

Rode o script completo (sem `--dry-run`):

```bash
node scripts/atualizar-catalogo.js
```

Se `node` não estiver no PATH, use `~/.local/bin/node` ou rode antes `export PATH="$HOME/.local/bin:$PATH"`.

## Relatório final

Informe de forma curta:

- nome, ID e categoria adicionados;
- quantos vídeos o novo canal aprovou (linha do log do script);
- total de itens e a divisão por categoria;
- qualquer aviso do script.

Se aparecer `playlist de uploads não encontrada`, `notFound` ou erro de quota, explique o problema e **não** deixe a entrada passando por válida sem avisar: ofereça corrigir o ID ou remover a entrada do `canais.json`.

Não mexa no `catalogo.json` à mão e não faça commit.
