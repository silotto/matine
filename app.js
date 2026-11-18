'use strict';

/*
 * Matinê — monta a interface a partir de catalogo.json.
 * O site não consulta a API do YouTube: os dados são estáticos e a
 * reprodução acontece no iframe oficial do YouTube.
 */

const ARQ_CATALOGO = 'catalogo.json';
const TITULO_SITE = 'Matinê — filmes e séries gratuitos do YouTube';
const VALIDADE_PADRAO_DIAS = 30;
const ATRASO_BUSCA_MS = 120;
const RELACIONADOS_MAX = 12;
const DESTAQUES_TOTAL = 4;
const DESTAQUE_JANELA_DIAS = 60;
const DESTAQUE_MAX_POR_CANAL = 2;
const INTERVALO_DESTAQUE_MS = 7000;

const estado = {
  catalogo: null,
  busca: '',
  ano: 'todos',
  emPlayer: false,
  rolagemInicio: 0,
};

const el = {
  aviso: document.getElementById('aviso-catalogo'),
  formBusca: document.getElementById('form-busca'),
  busca: document.getElementById('campo-busca'),
  filtroAno: document.getElementById('filtro-ano'),
  inicio: document.getElementById('pagina-inicio'),
  player: document.getElementById('pagina-player'),
  fileiras: document.getElementById('fileiras'),
  vazio: document.getElementById('vazio'),
  resumo: document.getElementById('abertura-resumo'),
  atualizacao: document.getElementById('data-atualizacao'),
  destaques: document.getElementById('destaques'),
  destaquesPalco: document.getElementById('destaques-palco'),
  destaquesPontos: document.getElementById('destaques-pontos'),
  destaquesAnterior: document.getElementById('destaques-anterior'),
  destaquesProximo: document.getElementById('destaques-proximo'),
  destaquesPausa: document.getElementById('destaques-pausa'),
  playerTitulo: document.getElementById('video-titulo'),
  playerMeta: document.getElementById('video-meta'),
  playerCaixa: document.getElementById('player-caixa'),
  playerLink: document.getElementById('video-link-youtube'),
  playerCanal: document.getElementById('video-canal'),
  playerRelacionados: document.getElementById('player-relacionados'),
};

// Estado do carrossel de destaques.
let indiceDestaque = 0;
let totalDestaques = 0;
let destaquesDisponiveis = false;
let timerDestaques = null;
let destaquesPausados = false;
let destaquesParados = false;
let toqueInicial = null;

const movimentoReduzido =
  typeof window.matchMedia === 'function'
  && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------- Utilidades ----------

const esc = (valor) =>
  String(valor ?? '').replace(/[&<>"']/g, (caractere) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[caractere]);

// Minúsculas e sem acentos, para busca tolerante.
function normalizar(texto) {
  return String(texto || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

// Remove o "| Nome do canal" que alguns canais repetem no fim do título.
function limparTitulo(titulo, canalNome) {
  const original = String(titulo || '').trim();
  const canal = String(canalNome || '').trim();
  if (!canal) return original;
  const canalSeguro = canal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regra = new RegExp(`\\s*\\|\\s*${canalSeguro}\\s*$`, 'i');
  return original.replace(regra, '').trim() || original;
}

function formatarDuracao(segundos) {
  const total = Number(segundos) || 0;
  if (total <= 0) return '';
  const horas = Math.floor(total / 3600);
  const minutos = Math.round((total % 3600) / 60);
  if (!horas) return `${minutos} min`;
  return minutos ? `${horas}h ${String(minutos).padStart(2, '0')}` : `${horas}h`;
}

function rotuloAno(item) {
  if (!item.ano) return 'Ano desconhecido';
  return item.anoAproximado ? `${item.ano} (aprox.)` : String(item.ano);
}

const formatoCompacto = new Intl.NumberFormat('pt-BR', {
  notation: 'compact',
  maximumFractionDigits: 1,
});

function formatarVisualizacoes(total) {
  const numero = Number(total) || 0;
  if (numero <= 0) return 'sem visualizações registradas';
  return `${formatoCompacto.format(numero)} de visualizações`;
}

// ---------- Montagem dos cartões ----------

function criarCartao(item) {
  const titulo = limparTitulo(item.titulo, item.canalNome);
  const cartao = document.createElement('article');
  cartao.className = 'cartao';
  cartao.setAttribute('role', 'listitem');

  cartao.innerHTML = `
    <a class="cartao__link" href="#/assistir/${encodeURIComponent(item.videoId)}">
      <span class="cartao__capa">
        <img src="${esc(item.thumb)}" alt="" loading="lazy" decoding="async" width="320" height="180">
        ${item.duracaoSegundos ? `<span class="cartao__duracao">${esc(formatarDuracao(item.duracaoSegundos))}</span>` : ''}
        ${item.embed === false ? '<span class="cartao__selo">Só no YouTube</span>' : ''}
      </span>
      <span class="cartao__titulo">${esc(titulo)}</span>
      <span class="cartao__meta">${esc(rotuloAno(item))} · ${esc(item.canalNome)}</span>
    </a>
  `;

  // Miniaturas maxres nem sempre existem: cai para a padrão.
  const capa = cartao.querySelector('img');
  capa.addEventListener('error', () => {
    const alternativa = `https://i.ytimg.com/vi/${item.videoId}/hqdefault.jpg`;
    if (capa.src !== alternativa) capa.src = alternativa;
  }, { once: true });

  return cartao;
}

function atualizarSetas(trilho, esquerda, direita) {
  const limite = trilho.scrollWidth - trilho.clientWidth;
  esquerda.disabled = limite <= 4 || trilho.scrollLeft <= 4;
  direita.disabled = limite <= 4 || trilho.scrollLeft >= limite - 4;
}

function criarFileira(titulo, itens) {
  const secao = document.createElement('section');
  secao.className = 'fileira';

  const rotulo = `${itens.length} ${itens.length === 1 ? 'título' : 'títulos'}`;
  secao.innerHTML = `
    <header class="fileira__cabecalho">
      <h2 class="fileira__titulo">${esc(titulo)}</h2>
      <span class="fileira__contagem">${rotulo}</span>
      <div class="fileira__setas">
        <button type="button" class="seta" data-dir="-1" aria-label="Rolar ${esc(titulo)} para a esquerda">‹</button>
        <button type="button" class="seta" data-dir="1" aria-label="Rolar ${esc(titulo)} para a direita">›</button>
      </div>
    </header>
    <div class="trilho" role="list"></div>
  `;

  const trilho = secao.querySelector('.trilho');
  for (const item of itens) trilho.append(criarCartao(item));

  const setaEsquerda = secao.querySelector('[data-dir="-1"]');
  const setaDireita = secao.querySelector('[data-dir="1"]');

  for (const seta of [setaEsquerda, setaDireita]) {
    seta.addEventListener('click', () => {
      const passo = Math.max(trilho.clientWidth * 0.8, 220);
      trilho.scrollBy({ left: passo * Number(seta.dataset.dir), behavior: 'smooth' });
    });
  }

  const sincronizar = () => atualizarSetas(trilho, setaEsquerda, setaDireita);
  trilho.addEventListener('scroll', sincronizar, { passive: true });
  window.addEventListener('resize', sincronizar);

  // Espera o layout para saber se há conteúdo para rolar.
  requestAnimationFrame(sincronizar);

  return secao;
}

// ---------- Carrossel de destaques ----------

// A API não dá visualizações por semana; usamos o ritmo (views/dia) dos
// títulos recentes como aproximação de "em alta nesta semana".
function escolherDestaques(itens) {
  const agora = Date.now();
  const comRitmo = itens
    .filter((item) => item.embed !== false && Number(item.visualizacoes) > 0)
    .map((item) => {
      const publicadoEm = Date.parse(item.publicadoEm);
      const dias = Number.isFinite(publicadoEm)
        ? Math.max(1, (agora - publicadoEm) / 86_400_000)
        : Number.POSITIVE_INFINITY;
      return { item, dias, ritmo: Number(item.visualizacoes) / dias };
    })
    .sort((a, b) => b.ritmo - a.ritmo || b.item.visualizacoes - a.item.visualizacoes);

  const escolhidos = [];
  const porCanal = new Map();

  // Só títulos recentes, com no máximo 2 por canal, para variar os destaques.
  for (const candidato of comRitmo) {
    if (escolhidos.length >= DESTAQUES_TOTAL) break;
    if (candidato.dias > DESTAQUE_JANELA_DIAS) continue;
    const usados = porCanal.get(candidato.item.canalId) || 0;
    if (usados >= DESTAQUE_MAX_POR_CANAL) continue;
    porCanal.set(candidato.item.canalId, usados + 1);
    escolhidos.push(candidato.item);
  }

  // Se faltar, completa com os mais vistos de qualquer época.
  if (escolhidos.length < DESTAQUES_TOTAL) {
    const restantes = [...itens]
      .filter((item) => item.embed !== false && !escolhidos.includes(item))
      .sort((a, b) => b.visualizacoes - a.visualizacoes);

    for (const item of restantes) {
      if (escolhidos.length >= DESTAQUES_TOTAL) break;
      escolhidos.push(item);
    }
  }

  return escolhidos;
}

function criarDestaque(item, indice, total) {
  const titulo = limparTitulo(item.titulo, item.canalNome);
  const slide = document.createElement('article');
  slide.className = 'destaque';
  slide.setAttribute('role', 'group');
  slide.setAttribute('aria-roledescription', 'slide');
  slide.setAttribute('aria-label', `${indice + 1} de ${total}`);
  slide.setAttribute('inert', '');

  slide.innerHTML = `
    <img class="destaque__fundo" src="${esc(item.thumb)}" alt=""
         loading="${indice === 0 ? 'eager' : 'lazy'}" decoding="async">
    <div class="destaque__sombra" aria-hidden="true"></div>
    <div class="destaque__conteudo">
      <p class="destaque__etiqueta">Em alta · ${esc(formatarVisualizacoes(item.visualizacoes))}</p>
      <h2 class="destaque__titulo">${esc(titulo)}</h2>
      <p class="destaque__meta">${esc(
        [rotuloAno(item), formatarDuracao(item.duracaoSegundos), item.canalNome]
          .filter(Boolean)
          .join(' · '),
      )}</p>
      <a class="botao destaque__botao" href="#/assistir/${encodeURIComponent(item.videoId)}">Assistir agora</a>
    </div>
  `;

  const imagem = slide.querySelector('img');
  imagem.addEventListener('error', () => {
    const alternativa = `https://i.ytimg.com/vi/${item.videoId}/hqdefault.jpg`;
    if (imagem.src !== alternativa) imagem.src = alternativa;
  }, { once: true });

  return slide;
}

function mostrarDestaque(indice) {
  const slides = [...el.destaquesPalco.children];
  if (!slides.length) return;

  indiceDestaque = (indice + slides.length) % slides.length;

  slides.forEach((slide, i) => {
    const ativo = i === indiceDestaque;
    slide.classList.toggle('destaque--ativo', ativo);
    slide.setAttribute('aria-hidden', String(!ativo));
    if (ativo) slide.removeAttribute('inert');
    else slide.setAttribute('inert', '');

    const link = slide.querySelector('a');
    if (link) link.tabIndex = ativo ? 0 : -1;
  });

  [...el.destaquesPontos.children].forEach((ponto, i) => {
    if (i === indiceDestaque) ponto.setAttribute('aria-current', 'true');
    else ponto.removeAttribute('aria-current');
  });
}

function reiniciarTimerDestaques() {
  clearInterval(timerDestaques);
  timerDestaques = null;

  if (movimentoReduzido || totalDestaques < 2) return;

  timerDestaques = setInterval(() => {
    if (destaquesParados || destaquesPausados || document.hidden || el.destaques.hidden) return;
    mostrarDestaque(indiceDestaque + 1);
  }, INTERVALO_DESTAQUE_MS);
}

function atualizarVisibilidadeDestaques() {
  const filtrando = Boolean(estado.busca) || estado.ano !== 'todos';
  el.destaques.hidden = !destaquesDisponiveis || filtrando;
}

function montarDestaques() {
  const itens = escolherDestaques(estado.catalogo.itens);
  destaquesDisponiveis = itens.length >= 2;

  if (!destaquesDisponiveis) {
    el.destaques.hidden = true;
    return;
  }

  totalDestaques = itens.length;
  el.destaquesPalco.replaceChildren();
  el.destaquesPontos.replaceChildren();

  itens.forEach((item, indice) => {
    el.destaquesPalco.append(criarDestaque(item, indice, totalDestaques));

    const ponto = document.createElement('button');
    ponto.type = 'button';
    ponto.className = 'ponto';
    ponto.dataset.indice = String(indice);
    ponto.setAttribute(
      'aria-label',
      `Ir para o destaque ${indice + 1}: ${limparTitulo(item.titulo, item.canalNome)}`,
    );
    el.destaquesPontos.append(ponto);
  });

  mostrarDestaque(0);
  atualizarVisibilidadeDestaques();
  el.destaquesPausa.hidden = movimentoReduzido;
  reiniciarTimerDestaques();
}

// ---------- Filtros e fileiras ----------

function renderizarFileiras(itens) {
  el.fileiras.replaceChildren();

  const grupos = new Map();
  for (const item of itens) {
    const categoria = item.categoria || 'Outros';
    if (!grupos.has(categoria)) grupos.set(categoria, []);
    grupos.get(categoria).push(item);
  }

  // Respeita a ordem de categorias do catálogo.
  const ordem = Array.isArray(estado.catalogo?.categorias) ? estado.catalogo.categorias : [];
  const categorias = [
    ...ordem.filter((categoria) => grupos.has(categoria)),
    ...[...grupos.keys()].filter((categoria) => !ordem.includes(categoria)),
  ];

  for (const categoria of categorias) {
    el.fileiras.append(criarFileira(categoria, grupos.get(categoria)));
  }
}

function aplicarFiltros() {
  if (!estado.catalogo) return;

  atualizarVisibilidadeDestaques();

  const itens = estado.catalogo.itens.filter((item) => {
    if (estado.ano !== 'todos' && String(item.ano) !== estado.ano) return false;
    if (!estado.busca) return true;
    const alvo = normalizar(`${limparTitulo(item.titulo, item.canalNome)} ${item.canalNome}`);
    return alvo.includes(estado.busca);
  });

  if (!itens.length) {
    const termo = el.busca.value.trim();
    const partes = [];
    if (termo) partes.push(`“${termo}”`);
    if (estado.ano !== 'todos') partes.push(`ano ${estado.ano}`);
    const detalhe = partes.length ? ` para ${partes.join(' e ')}` : '';
    mostrarVazio('Nada encontrado', `Nenhum título corresponde${detalhe}.`, true);
    return;
  }

  el.vazio.hidden = true;
  el.fileiras.hidden = false;
  renderizarFileiras(itens);
}

function atualizarOpcoesDeAno(itens) {
  const anos = [...new Set(itens.map((item) => item.ano).filter(Boolean))]
    .sort((a, b) => b - a);

  for (const ano of anos) {
    const opcao = document.createElement('option');
    opcao.value = String(ano);
    opcao.textContent = String(ano);
    el.filtroAno.append(opcao);
  }
}

function limparFiltros() {
  estado.busca = '';
  estado.ano = 'todos';
  el.busca.value = '';
  el.filtroAno.value = 'todos';
  aplicarFiltros();
  el.busca.focus();
}

// ---------- Estados de erro e vazio ----------

function mostrarVazio(titulo, texto, comLimpar) {
  el.fileiras.hidden = true;
  el.vazio.hidden = false;
  el.vazio.innerHTML = `
    <h2>${esc(titulo)}</h2>
    <p>${esc(texto)}</p>
    ${comLimpar ? '<button type="button" class="botao botao--fantasma vazio__limpar">Limpar filtros</button>' : ''}
  `;
}

function mostrarErroCatalogo(detalhe) {
  el.fileiras.hidden = true;
  el.vazio.hidden = false;
  el.vazio.innerHTML = `
    <h2>Não foi possível carregar o catálogo</h2>
    <p>${esc(detalhe)}</p>
    <p>Gere o arquivo com <code>node scripts/atualizar-catalogo.js</code> e sirva a pasta
    com <code>python3 -m http.server</code> (abrir o arquivo direto não funciona).</p>
  `;
}

// ---------- Página de reprodução ----------

function montarPlayer(item) {
  const titulo = limparTitulo(item.titulo, item.canalNome);
  el.playerCaixa.replaceChildren();

  if (item.embed === false) {
    // Sem embed: nada de player falso; o caminho é o YouTube.
    const bloco = document.createElement('div');
    bloco.className = 'player__indisponivel';
    bloco.innerHTML = `
      <img src="${esc(item.thumb)}" alt="" loading="lazy">
      <div class="player__indisponivel__conteudo">
        <p>Este vídeo não permite reprodução incorporada.</p>
        <p>Use o botão abaixo para assistir no YouTube.</p>
      </div>
    `;
    el.playerCaixa.append(bloco);
    return;
  }

  const iframe = document.createElement('iframe');
  iframe.src = `https://www.youtube.com/embed/${encodeURIComponent(item.videoId)}`;
  iframe.title = `Player do YouTube — ${titulo}`;
  iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
  iframe.allowFullscreen = true;
  iframe.referrerPolicy = 'strict-origin-when-cross-origin';
  el.playerCaixa.append(iframe);
}

function renderizarRelacionados(item) {
  el.playerRelacionados.replaceChildren();
  const mesmaCategoria = estado.catalogo.itens
    .filter((outro) => outro.categoria === item.categoria && outro.videoId !== item.videoId)
    .slice(0, RELACIONADOS_MAX);

  if (!mesmaCategoria.length) return;
  el.playerRelacionados.append(criarFileira(`Mais em ${item.categoria}`, mesmaCategoria));
}

function renderizarPlayer(videoId) {
  const item = estado.catalogo.itens.find((candidato) => candidato.videoId === videoId);

  el.playerRelacionados.replaceChildren();
  el.playerCaixa.replaceChildren();

  if (!item) {
    document.title = 'Vídeo não encontrado — Matinê';
    el.playerTitulo.textContent = 'Vídeo não encontrado';
    el.playerMeta.textContent = 'Este título não está no catálogo.';
    el.playerCanal.textContent = '';
    el.playerLink.hidden = true;
    el.playerCaixa.innerHTML = `
      <div class="player__indisponivel">
        <div class="player__indisponivel__conteudo">
          <p>O vídeo pode ter saído do catálogo.</p>
          <a class="botao" href="#/">Voltar ao catálogo</a>
        </div>
      </div>
    `;
    return;
  }

  const titulo = limparTitulo(item.titulo, item.canalNome);

  document.title = `${titulo} — Matinê`;
  el.playerTitulo.textContent = titulo;
  el.playerMeta.textContent = [
    rotuloAno(item),
    item.categoria,
    formatarDuracao(item.duracaoSegundos),
  ].filter(Boolean).join(' · ');
  el.playerCanal.textContent = `Canal: ${item.canalNome}`;
  el.playerLink.hidden = false;
  el.playerLink.href = item.url;

  montarPlayer(item);
  renderizarRelacionados(item);

  el.playerTitulo.focus({ preventScroll: true });
  window.scrollTo(0, 0);
}

// ---------- Roteamento (hash) ----------

function rotear() {
  if (!estado.catalogo) return;

  const emPlayer = location.hash.startsWith('#/assistir/');
  const id = (location.hash.match(/^#\/assistir\/([A-Za-z0-9_-]+)/) || [])[1] || '';

  if (emPlayer) {
    if (!estado.emPlayer) estado.rolagemInicio = window.scrollY;
    estado.emPlayer = true;
    document.body.classList.add('modo-player');
    el.inicio.hidden = true;
    el.player.hidden = false;
    renderizarPlayer(id);
    return;
  }

  document.title = TITULO_SITE;

  if (!estado.emPlayer) return;

  // Ao voltar, encerra o player (senão o áudio continua) e restaura a rolagem.
  estado.emPlayer = false;
  document.body.classList.remove('modo-player');
  el.player.hidden = true;
  el.inicio.hidden = false;
  el.playerCaixa.replaceChildren();
  el.playerRelacionados.replaceChildren();
  window.scrollTo(0, estado.rolagemInicio || 0);
}

// ---------- Início ----------

function verificarValidade(catalogo) {
  const geradoEm = Date.parse(catalogo.geradoEm);
  if (!Number.isFinite(geradoEm)) return;

  const limite = Number(catalogo.validadeDias) || VALIDADE_PADRAO_DIAS;
  const dias = Math.floor((Date.now() - geradoEm) / 86_400_000);

  el.atualizacao.textContent = `Catálogo atualizado em ${new Date(geradoEm).toLocaleDateString('pt-BR')}.`;

  if (dias > limite) {
    el.aviso.hidden = false;
    el.aviso.textContent =
      `Este catálogo foi atualizado há ${dias} dias (validade de ${limite}). ` +
      'Pode haver títulos novos ou links fora do ar.';
  }
}

async function carregarCatalogo() {
  let resposta;
  try {
    resposta = await fetch(ARQ_CATALOGO, { cache: 'no-cache' });
  } catch {
    throw new Error('O catalogo.json não pôde ser lido. O site precisa ser servido por HTTP.');
  }

  if (!resposta.ok) {
    throw new Error(`O catalogo.json respondeu com erro ${resposta.status}.`);
  }

  const catalogo = await resposta.json();
  if (!catalogo || !Array.isArray(catalogo.itens)) {
    throw new Error('O catalogo.json está em formato inesperado.');
  }
  return catalogo;
}

async function iniciar() {
  try {
    const catalogo = await carregarCatalogo();
    estado.catalogo = catalogo;

    const total = catalogo.itens.length;
    const categorias = Array.isArray(catalogo.categorias) ? catalogo.categorias.length : 0;
    el.resumo.textContent = `${total} ${total === 1 ? 'título' : 'títulos'} em ${categorias} ${categorias === 1 ? 'categoria' : 'categorias'}`;

    atualizarOpcoesDeAno(catalogo.itens);
    verificarValidade(catalogo);
    montarDestaques();
    aplicarFiltros();
    rotear();
  } catch (erro) {
    el.busca.disabled = true;
    el.filtroAno.disabled = true;
    el.resumo.textContent = '';
    mostrarErroCatalogo(erro.message);
  }
}

// ---------- Eventos ----------

let temporizadorBusca;

el.formBusca.addEventListener('submit', (evento) => evento.preventDefault());

el.busca.addEventListener('input', () => {
  clearTimeout(temporizadorBusca);
  temporizadorBusca = setTimeout(() => {
    estado.busca = normalizar(el.busca.value);
    aplicarFiltros();
  }, ATRASO_BUSCA_MS);
});

el.filtroAno.addEventListener('change', () => {
  estado.ano = el.filtroAno.value;
  aplicarFiltros();
});

// Botão "Limpar filtros" recriado a cada estado vazio.
el.vazio.addEventListener('click', (evento) => {
  if (evento.target.closest('.vazio__limpar')) limparFiltros();
});

// ---------- Eventos do carrossel ----------

el.destaquesAnterior.addEventListener('click', () => {
  mostrarDestaque(indiceDestaque - 1);
  reiniciarTimerDestaques();
});

el.destaquesProximo.addEventListener('click', () => {
  mostrarDestaque(indiceDestaque + 1);
  reiniciarTimerDestaques();
});

el.destaquesPontos.addEventListener('click', (evento) => {
  const ponto = evento.target.closest('.ponto');
  if (!ponto) return;
  mostrarDestaque(Number(ponto.dataset.indice));
  reiniciarTimerDestaques();
});

// Controle de pausa exigido para conteúdo que troca sozinho.
el.destaquesPausa.addEventListener('click', () => {
  destaquesParados = !destaquesParados;
  el.destaquesPausa.setAttribute('aria-pressed', String(destaquesParados));
  el.destaquesPausa.textContent = destaquesParados ? 'Retomar' : 'Pausar';
  el.destaquesPausa.setAttribute(
    'aria-label',
    destaquesParados
      ? 'Retomar troca automática de destaques'
      : 'Pausar troca automática de destaques',
  );
});

// Pausa a troca automática enquanto o mouse ou o foco estão no carrossel.
el.destaques.addEventListener('mouseenter', () => { destaquesPausados = true; });
el.destaques.addEventListener('mouseleave', () => { destaquesPausados = false; });
el.destaques.addEventListener('focusin', () => { destaquesPausados = true; });
el.destaques.addEventListener('focusout', () => { destaquesPausados = false; });

// Deslizar com o dedo no celular.
el.destaquesPalco.addEventListener('pointerdown', (evento) => {
  if (evento.pointerType === 'mouse') return;
  toqueInicial = evento.clientX;
});

el.destaquesPalco.addEventListener('pointerup', (evento) => {
  if (toqueInicial === null) return;
  const distancia = evento.clientX - toqueInicial;
  toqueInicial = null;
  if (Math.abs(distancia) < 45) return;
  mostrarDestaque(indiceDestaque + (distancia < 0 ? 1 : -1));
  reiniciarTimerDestaques();
});

el.destaquesPalco.addEventListener('pointercancel', () => { toqueInicial = null; });

// Reinicia o relógio quando a aba volta a ficar visível.
document.addEventListener('visibilitychange', reiniciarTimerDestaques);

window.addEventListener('hashchange', rotear);

iniciar();
