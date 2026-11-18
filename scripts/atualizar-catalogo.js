#!/usr/bin/env node
/**
 * Matinê — gera catalogo.json a partir das playlists de uploads dos canais.
 *
 * Uso:
 *   node scripts/atualizar-catalogo.js [--dry-run] [--max-paginas=N]
 *
 * Regras:
 * - Usa apenas playlistItems.list e videos.list (sem search.list).
 * - A chave fica em .env e nunca é exibida nem gravada.
 * - Só entram vídeos com mais de 60 minutos e públicos; sem embed
 *   eles ficam marcados com embed: false.
 */

'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');

// ---------- Configuração ----------

const RAIZ = path.resolve(__dirname, '..');
const ARQ_ENV = path.join(RAIZ, '.env');
const ARQ_CANAIS = path.join(RAIZ, 'canais.json');
const ARQ_CATALOGO = path.join(RAIZ, 'catalogo.json');

const API = 'https://www.googleapis.com/youtube/v3';
const MIN_DURACAO = 60 * 60; // "mais de 60 minutos": filtro estritamente maior.
const LOTE = 50; // limite da API por chamada.
const PAUSA_MS = 150; // intervalo entre chamadas, para ser educado com a API.
const VALIDADE_DIAS = 30;

let chamadas = 0; // estimativa de quota: 1 unidade por chamada.

// ---------- Utilidades ----------

class ErroApi extends Error {
  constructor(mensagem, motivo = '', status = 0) {
    super(mensagem);
    this.motivo = motivo;
    this.status = status;
  }
}

function esperar(ms) {
  return new Promise((resolver) => setTimeout(resolver, ms));
}

// Lê um JSON local, com mensagens de erro amigáveis.
async function lerJson(caminho, descricao) {
  let texto;
  try {
    texto = await fs.readFile(caminho, 'utf8');
  } catch (erro) {
    if (erro.code === 'ENOENT') throw new Error(`${descricao} não encontrado em ${caminho}.`);
    throw erro;
  }
  try {
    return JSON.parse(texto.replace(/^\uFEFF/, ''));
  } catch (erro) {
    throw new Error(`${descricao} com JSON inválido: ${erro.message}`);
  }
}

// Parser mínimo de .env: KEY=valor, aceita `export`, aspas e comentários.
async function carregarEnv() {
  const variaveis = {};
  let texto = '';
  try {
    texto = await fs.readFile(ARQ_ENV, 'utf8');
  } catch (erro) {
    if (erro.code !== 'ENOENT') throw erro;
  }

  for (const linha of texto.split(/\r?\n/)) {
    const limpa = linha.trim();
    if (!limpa || limpa.startsWith('#')) continue;
    const achado = /^(?:export\s+)?([A-Za-z_][\w]*)\s*=\s*(.*)$/.exec(limpa);
    if (!achado) continue;
    let valor = achado[2].trim();
    const entreAspas =
      (valor.startsWith('"') && valor.endsWith('"')) ||
      (valor.startsWith("'") && valor.endsWith("'"));
    if (entreAspas) valor = valor.slice(1, -1);
    variaveis[achado[1]] = valor;
  }
  return variaveis;
}

// Grava em arquivo temporário e renomeia: evita catálogo pela metade.
async function gravarAtomico(caminho, conteudo) {
  const temporario = `${caminho}.tmp`;
  await fs.writeFile(temporario, conteudo, 'utf8');
  await fs.rename(temporario, caminho);
}

// ---------- API do YouTube ----------

async function requisitar(recurso, parametros, chave) {
  const url = new URL(`${API}/${recurso}`);
  for (const [nome, valor] of Object.entries(parametros)) {
    url.searchParams.set(nome, String(valor));
  }
  url.searchParams.set('key', chave);

  for (let tentativa = 1; tentativa <= 3; tentativa += 1) {
    chamadas += 1;
    let resposta;
    try {
      resposta = await fetch(url);
    } catch (erro) {
      if (tentativa === 3) throw new ErroApi(`Falha de rede em ${recurso}: ${erro.message}`);
      await esperar(PAUSA_MS * 2 ** tentativa);
      continue;
    }

    if (resposta.ok) return resposta.json();

    // Extrai o motivo sem expor a URL (que contém a chave).
    let motivo = `HTTP ${resposta.status}`;
    let detalhe = '';
    try {
      const corpo = await resposta.json();
      motivo = corpo.error?.errors?.[0]?.reason || corpo.error?.message || motivo;
      detalhe = corpo.error?.message || '';
    } catch {
      // Resposta sem JSON: mantém o motivo padrão.
    }

    if (motivo === 'quotaExceeded' || motivo === 'dailyLimitExceeded') {
      throw new ErroApi('Quota da API esgotada. Tente amanhã ou reduza --max-paginas.', motivo, resposta.status);
    }

    const podeRepetir =
      resposta.status === 429 || resposta.status >= 500 || motivo === 'rateLimitExceeded';
    if (!podeRepetir || tentativa === 3) {
      const sufixo = detalhe ? `: ${detalhe}` : '';
      throw new ErroApi(`Erro em ${recurso} (${motivo}${sufixo}).`, motivo, resposta.status);
    }
    await esperar(PAUSA_MS * 2 ** tentativa);
  }

  throw new ErroApi(`Erro inesperado em ${recurso}.`);
}

// Playlist de uploads = id do canal com o prefixo UC trocado por UU.
function playlistDeUploads(canalId) {
  if (!/^UC[\w-]{22}$/.test(canalId)) {
    throw new Error(`canalId inválido: "${canalId}" (esperado UC + 22 caracteres).`);
  }
  return `UU${canalId.slice(2)}`;
}

// Lista os uploads do canal, paginando até o limite definido.
async function listarUploads(canal, chave, maxPaginas) {
  const playlistId = playlistDeUploads(canal.canalId);
  const videos = [];
  let pagina = 0;
  let token;

  do {
    pagina += 1;
    const parametros = {
      part: 'snippet,contentDetails',
      playlistId,
      maxResults: LOTE,
    };
    if (token) parametros.pageToken = token;

    const dados = await requisitar('playlistItems', parametros, chave);
    for (const item of dados.items || []) {
      const videoId = item.contentDetails?.videoId || item.snippet?.resourceId?.videoId;
      if (!videoId) continue;
      videos.push({
        videoId,
        titulo: item.snippet?.title || '',
        publicadoEm: item.snippet?.publishedAt || item.contentDetails?.videoPublishedAt || '',
      });
    }

    token = dados.nextPageToken;
    if (token) await esperar(PAUSA_MS);
  } while (token && pagina < maxPaginas);

  return { playlistId, videos, paginas: pagina };
}

// Busca detalhes (duração, status, título completo) em lotes de 50.
async function detalhesDosVideos(ids, chave) {
  const mapa = new Map();
  for (let inicio = 0; inicio < ids.length; inicio += LOTE) {
    const lote = ids.slice(inicio, inicio + LOTE);
    const dados = await requisitar(
      'videos',
      { part: 'snippet,contentDetails,status,statistics', id: lote.join(',') },
      chave,
    );
    for (const item of dados.items || []) mapa.set(item.id, item);
    if (inicio + LOTE < ids.length) await esperar(PAUSA_MS);
  }
  return mapa;
}

// ---------- Regras de catálogo ----------

// Converte duração ISO 8601 (PT1H37M) em segundos.
function duracaoEmSegundos(iso) {
  const achado = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(iso || '');
  if (!achado) return 0;
  return (
    Number(achado[1] || 0) * 86400 +
    Number(achado[2] || 0) * 3600 +
    Number(achado[3] || 0) * 60 +
    Number(achado[4] || 0)
  );
}

// Ano do título quando existir; senão, ano do upload marcado como aproximado.
function extrairAno(titulo, publicadoEm) {
  const anoAtual = new Date().getFullYear();
  const valido = (ano) => ano >= 1900 && ano <= anoAtual;

  // 1) Entre parênteses/colchetes: ex. "O Filme (1999) | Dublado".
  for (const achado of String(titulo).matchAll(/[(\[]((?:19|20)\d{2})[)\]]/g)) {
    const ano = Number(achado[1]);
    if (valido(ano)) return { ano, aproximado: false };
  }

  // 2) Ano solto no título: ex. "O Filme 1999 dublado".
  for (const achado of String(titulo).matchAll(/\b((?:19|20)\d{2})\b/g)) {
    const ano = Number(achado[1]);
    if (valido(ano)) return { ano, aproximado: false };
  }

  // 3) Sem ano no título: usa o ano do upload e sinaliza aproximação.
  const anoUpload = new Date(publicadoEm).getUTCFullYear();
  if (Number.isFinite(anoUpload) && anoUpload > 1900) {
    return { ano: anoUpload, aproximado: true };
  }
  return { ano: null, aproximado: true };
}

// Valida canais.json e devolve apenas os canais ativos e sem duplicatas.
function validarCanais(dados) {
  if (!dados || !Array.isArray(dados.canais)) {
    throw new Error('canais.json inválido: esperado um objeto com a lista "canais".');
  }

  const vistos = new Set();
  const ativos = [];

  dados.canais.forEach((canal, indice) => {
    const nome = String(canal.nome || '').trim();
    const canalId = String(canal.canalId || '').trim();
    const categoria = String(canal.categoria || '').trim();

    if (!nome || !canalId || !categoria) {
      throw new Error(`Canal #${indice + 1} em canais.json precisa de nome, canalId e categoria.`);
    }
    playlistDeUploads(canalId); // valida o formato do id
    if (canal.ativo === false) return;
    if (vistos.has(canalId)) return;
    vistos.add(canalId);
    ativos.push({ nome, canalId, categoria });
  });

  if (!ativos.length) throw new Error('Nenhum canal ativo em canais.json.');
  return ativos;
}

function escolherThumb(thumbnails, videoId) {
  return (
    thumbnails?.maxres?.url ||
    thumbnails?.standard?.url ||
    thumbnails?.high?.url ||
    thumbnails?.medium?.url ||
    thumbnails?.default?.url ||
    `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
  );
}

// Ordena por categoria (ordem do canais.json), ano desc e título.
function ordenarItens(itens, canais) {
  const ordem = new Map();
  for (const canal of canais) {
    if (!ordem.has(canal.categoria)) ordem.set(canal.categoria, ordem.size);
  }

  return itens.sort((a, b) => {
    const catA = ordem.get(a.categoria) ?? Number.MAX_SAFE_INTEGER;
    const catB = ordem.get(b.categoria) ?? Number.MAX_SAFE_INTEGER;
    if (catA !== catB) return catA - catB;
    if (a.ano !== b.ano) {
      if (a.ano == null) return 1;
      if (b.ano == null) return -1;
      return b.ano - a.ano;
    }
    return a.titulo.localeCompare(b.titulo, 'pt-BR');
  });
}

// ---------- Execução ----------

function imprimirAjuda() {
  console.log(`Atualiza catalogo.json com vídeos de mais de 60 minutos.

Uso:
  node scripts/atualizar-catalogo.js [opções]

Opções:
  --dry-run        simula a execução sem gravar catalogo.json
  --max-paginas=N  páginas de uploads por canal (padrão: 10)
  -h, --ajuda      mostra esta ajuda

Requer YOUTUBE_API_KEY no arquivo .env (nunca versione esse arquivo).`);
}

async function principal() {
  const argumentos = process.argv.slice(2);
  if (argumentos.includes('--ajuda') || argumentos.includes('-h')) {
    imprimirAjuda();
    return;
  }

  const dryRun = argumentos.includes('--dry-run');
  const argPaginas = argumentos.find((arg) => arg.startsWith('--max-paginas='));
  const maxPaginas = argPaginas ? Number(argPaginas.split('=')[1]) : 10;
  if (!Number.isInteger(maxPaginas) || maxPaginas < 1) {
    throw new Error('--max-paginas precisa ser um número inteiro maior que zero.');
  }

  // A chave vem do .env; a variável de ambiente serve para testes e CI.
  const env = await carregarEnv();
  const chave = process.env.YOUTUBE_API_KEY || env.YOUTUBE_API_KEY || '';
  if (!chave) {
    throw new Error('YOUTUBE_API_KEY não encontrada. Crie .env na raiz com YOUTUBE_API_KEY=sua_chave.');
  }

  const canais = validarCanais(await lerJson(ARQ_CANAIS, 'canais.json'));
  console.log(`Matinê — atualizando catálogo (${canais.length} canais, até ${maxPaginas} páginas cada)`);

  const vistos = new Set();
  const itens = [];
  let examinados = 0;

  for (const [indice, canal] of canais.entries()) {
    console.log(`\n[${indice + 1}/${canais.length}] ${canal.nome} — ${canal.categoria}`);

    let uploads;
    try {
      uploads = await listarUploads(canal, chave, maxPaginas);
    } catch (erro) {
      if (erro instanceof ErroApi && (erro.motivo === 'playlistNotFound' || erro.motivo === 'notFound')) {
        console.warn('  aviso: playlist de uploads não encontrada; canal ignorado.');
        continue;
      }
      throw erro;
    }

    const novos = uploads.videos.filter((video) => !vistos.has(video.videoId));
    novos.forEach((video) => vistos.add(video.videoId));
    examinados += novos.length;
    console.log(`  ${uploads.videos.length} uploads lidos em ${uploads.paginas} página(s); ${novos.length} novos`);

    if (!novos.length) continue;

    const detalhes = await detalhesDosVideos(novos.map((video) => video.videoId), chave);
    let aprovados = 0;

    for (const upload of novos) {
      const video = detalhes.get(upload.videoId);
      if (!video) continue; // removido ou privado entre as chamadas

      const status = video.status || {};
      const segundos = duracaoEmSegundos(video.contentDetails?.duration);
      if (segundos <= MIN_DURACAO) continue;
      if (status.privacyStatus !== 'public') continue;
      if (status.uploadStatus && status.uploadStatus !== 'processed') continue;
      if ((video.snippet?.liveBroadcastContent || 'none') !== 'none') continue;

      const titulo = video.snippet?.title || upload.titulo;
      const publicadoEm = video.snippet?.publishedAt || upload.publicadoEm;
      const { ano, aproximado } = extrairAno(titulo, publicadoEm);

      itens.push({
        videoId: upload.videoId,
        titulo,
        canalId: canal.canalId,
        canalNome: canal.nome,
        categoria: canal.categoria,
        ano,
        anoAproximado: aproximado,
        duracaoSegundos: segundos,
        publicadoEm,
        visualizacoes: Number(video.statistics?.viewCount || 0),
        thumb: escolherThumb(video.snippet?.thumbnails, upload.videoId),
        embed: status.embeddable !== false,
        url: `https://www.youtube.com/watch?v=${upload.videoId}`,
      });
      aprovados += 1;
    }

    console.log(`  ${aprovados} vídeos com mais de 60 min aprovados`);
  }

  ordenarItens(itens, canais);
  const categorias = [...new Set(canais.map((canal) => canal.categoria))];
  const porCategoria = {};
  for (const item of itens) {
    porCategoria[item.categoria] = (porCategoria[item.categoria] || 0) + 1;
  }

  const catalogo = {
    versao: 1,
    geradoEm: new Date().toISOString(),
    validadeDias: VALIDADE_DIAS,
    canais: canais.map(({ canalId, nome, categoria }) => ({ canalId, nome, categoria })),
    categorias,
    resumo: { total: itens.length, porCategoria },
    itens,
  };

  console.log(
    `\nResumo: ${itens.length} itens; ${examinados} vídeos examinados; ${chamadas} chamadas à API.`,
  );

  if (dryRun) {
    console.log('--dry-run ativo: catalogo.json não foi alterado.');
    return;
  }

  await gravarAtomico(ARQ_CATALOGO, `${JSON.stringify(catalogo, null, 2)}\n`);
  console.log(`catalogo.json gravado em ${ARQ_CATALOGO}`);
}

// Exporta helpers para testes; só executa quando chamado direto.
module.exports = { duracaoEmSegundos, extrairAno, playlistDeUploads };

if (require.main === module) {
  principal().catch((erro) => {
    console.error(`\nFalha: ${erro.message}`);
    process.exitCode = 1;
  });
}
