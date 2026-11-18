#!/usr/bin/env node
/**
 * Matinê — servidor estático de desenvolvimento.
 *
 * Uso: node scripts/servidor.js [porta]   (padrão: 8000)
 *
 * Serve a raiz do projeto com Cache-Control: no-store, para que edições em
 * index.html, estilo.css, app.js e catalogo.json apareçam no próximo reload.
 */

'use strict';

const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');

const RAIZ = path.resolve(__dirname, '..');
const PORTA = Number(process.argv[2]) || 8000;

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

// Impede que ".." saia da pasta do projeto.
function resolver(caminhoUrl) {
  let caminho;
  try {
    caminho = decodeURIComponent(caminhoUrl.split('?')[0]);
  } catch {
    return null;
  }
  if (caminho === '/' || caminho === '') caminho = '/index.html';

  const completo = path.resolve(RAIZ, `.${caminho}`);
  if (completo !== RAIZ && !completo.startsWith(RAIZ + path.sep)) return null;
  return completo;
}

const servidor = http.createServer(async (requisicao, resposta) => {
  if (requisicao.method !== 'GET' && requisicao.method !== 'HEAD') {
    resposta.writeHead(405, { Allow: 'GET, HEAD' }).end('Método não permitido');
    return;
  }

  const arquivo = resolver(requisicao.url || '/');
  if (!arquivo) {
    resposta.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Caminho inválido');
    return;
  }

  let conteudo;
  try {
    conteudo = await fs.readFile(arquivo);
  } catch (erro) {
    const status = erro.code === 'ENOENT' || erro.code === 'EISDIR' ? 404 : 500;
    resposta
      .writeHead(status, {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store',
      })
      .end(status === 404 ? 'Arquivo não encontrado' : 'Erro ao ler o arquivo');
    return;
  }

  const tipo = TIPOS[path.extname(arquivo).toLowerCase()] || 'application/octet-stream';

  resposta.writeHead(200, {
    'Content-Type': tipo,
    'Content-Length': conteudo.length,
    'Cache-Control': 'no-store, max-age=0',
    'X-Content-Type-Options': 'nosniff',
  });

  resposta.end(requisicao.method === 'HEAD' ? undefined : conteudo);
});

servidor.listen(PORTA, () => {
  console.log(`Matinê no ar em http://localhost:${PORTA}`);
  console.log(`Servindo ${RAIZ} (sem cache)`);
});
