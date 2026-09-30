#!/usr/bin/env node
import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import http from 'node:http';
import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspectBuildEnvironment, runSeedBuild, DEFAULT_ROOT } from './build-service.mjs';
import { validateSeed } from '../seed-plan.mjs';
import { isPublicWikiRequest, servePublicWiki } from './public-wiki.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SESSION_SECONDS = 30 * 24 * 60 * 60;
const ASSETS = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/style.css', ['style.css', 'text/css; charset=utf-8']],
]);

function json(response, status, value) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  response.end(JSON.stringify(value));
}

async function requestJson(request) {
  if (!request.headers['content-type']?.startsWith('application/json')) {
    throw Object.assign(new Error('Se requiere JSON.'), { status: 415 });
  }
  let raw = '';
  for await (const chunk of request) {
    raw += chunk.toString('utf8');
    if (raw.length > 4096) throw Object.assign(new Error('Solicitud demasiado grande.'), { status: 413 });
  }
  try { return JSON.parse(raw); }
  catch { throw Object.assign(new Error('JSON inválido.'), { status: 400 }); }
}

function authorized(request, accessKey) {
  if (!accessKey) return true;
  const value = request.headers.authorization;
  if (value?.startsWith('Basic ')) {
    const actual = Buffer.from(value.slice(6), 'base64');
    if (equalSecret(actual, Buffer.from(`deksa:${accessKey}`))) return true;
  }
  const cookie = request.headers.cookie?.match(/(?:^|;\s*)deksa_session=([^;]+)/)?.[1];
  if (!cookie) return false;
  const [version, expiry, nonce, signature] = cookie.split('.');
  if (version !== 'v1' || !/^\d{10}$/.test(expiry || '')
      || !/^[0-9a-f]{32}$/.test(nonce || '') || !/^[0-9a-f]{64}$/.test(signature || '')
      || Number(expiry) <= Math.floor(Date.now() / 1000)) return false;
  const signed = `${version}.${expiry}.${nonce}`;
  return equalSecret(Buffer.from(signature, 'hex'), Buffer.from(sessionSignature(signed, accessKey), 'hex'));
}

function equalSecret(actual, expected) {
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function sessionSignature(value, accessKey) {
  return createHmac('sha256', accessKey).update(`deksa-session:${value}`).digest('hex');
}

function newSession(accessKey) {
  const expiry = Math.floor(Date.now() / 1000) + SESSION_SECONDS;
  const signed = `v1.${expiry}.${randomBytes(16).toString('hex')}`;
  return `${signed}.${sessionSignature(signed, accessKey)}`;
}

function safeNext(value) {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//')
    && !value.includes('\\') && !/[\r\n]/.test(value) ? value : '/';
}

function escapeHtml(value) {
  return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function loginPage(next, invalid = false) {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Déksa · Ingresar</title><link rel="stylesheet" href="/style.css"></head><body><main class="shell"><header class="topline"><span class="mark">D</span><span>DÉKSA</span></header><section class="panel login-panel"><p class="eyebrow">ACCESO</p><h1>Bienvenido.</h1><p class="intro">Ingresá una vez en este dispositivo. La sesión dura 30 días.</p><form method="post" action="/login"><input type="hidden" name="next" value="${escapeHtml(next)}"><label for="username">Usuario</label><input id="username" name="username" autocomplete="username" required value="deksa"><label for="password">Contraseña</label><input id="password" name="password" type="password" autocomplete="current-password" required autofocus>${invalid ? '<p class="login-error" role="alert">Usuario o contraseña incorrectos.</p>' : ''}<button class="primary" type="submit">Entrar</button></form></section></main></body></html>`;
}

async function requestForm(request) {
  if (!request.headers['content-type']?.startsWith('application/x-www-form-urlencoded')) {
    throw Object.assign(new Error('Formulario inválido.'), { status: 415 });
  }
  let raw = '';
  for await (const chunk of request) {
    raw += chunk.toString('utf8');
    if (raw.length > 4096) throw Object.assign(new Error('Formulario demasiado grande.'), { status: 413 });
  }
  return new URLSearchParams(raw);
}

export function createApp({
  projectRoot = DEFAULT_ROOT,
  accessKey = '',
  build = runSeedBuild,
  wikiOrigin = '',
} = {}) {
  const jobs = new Map();
  let active = null;
  const server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
      if (accessKey && url.pathname === '/login') {
        if (request.method === 'POST') {
          const form = await requestForm(request);
          const username = form.get('username') || '';
          const password = form.get('password') || '';
          const next = safeNext(form.get('next'));
          if (username === 'deksa' && equalSecret(Buffer.from(password), Buffer.from(accessKey))) {
            response.writeHead(303, {
              Location: next,
              'Set-Cookie': `deksa_session=${newSession(accessKey)}; Path=/; Max-Age=${SESSION_SECONDS}; HttpOnly; Secure; SameSite=Lax`,
              'Cache-Control': 'no-store',
            });
            response.end();
          } else {
            response.writeHead(401, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
            response.end(loginPage(next, true));
          }
          return;
        }
        if (request.method === 'GET') {
          const next = safeNext(url.searchParams.get('next'));
          if (authorized(request, accessKey)) {
            response.writeHead(303, { Location: next, 'Cache-Control': 'no-store' });
            response.end();
          } else {
            response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
            response.end(loginPage(next));
          }
          return;
        }
      }
      if (request.method === 'GET' && url.pathname === '/style.css') {
        response.writeHead(200, { 'Content-Type': 'text/css; charset=utf-8', 'Cache-Control': 'no-store' });
        response.end(await readFile(path.join(HERE, 'style.css')));
        return;
      }
      if (!authorized(request, accessKey)) {
        if (url.pathname.startsWith('/api/')) {
          json(response, 401, { error: 'Iniciá sesión para continuar.' });
        } else if (request.method === 'GET' || request.method === 'HEAD') {
          response.writeHead(303, {
            Location: `/login?next=${encodeURIComponent(safeNext(url.pathname + url.search))}`,
            'Cache-Control': 'no-store',
          });
          response.end();
        } else {
          json(response, 401, { error: 'Iniciá sesión para continuar.' });
        }
        return;
      }
      if (wikiOrigin && isPublicWikiRequest(url.pathname)) {
        if (!await servePublicWiki(request, response, url, wikiOrigin)) {
          json(response, 404, { error: 'Página no encontrada.' });
        }
        return;
      }
      if (request.method === 'GET' && ASSETS.has(url.pathname)) {
        const [name, type] = ASSETS.get(url.pathname);
        response.writeHead(200, {
          'Content-Type': type,
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
          'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'self'",
        });
        const asset = await readFile(path.join(HERE, name));
        response.end(name === 'index.html'
          ? asset.toString('utf8').replace('<!-- DEKSA_WIKI_LINK -->', wikiOrigin
            ? '<a class="wiki-link" href="/wiki/">Explorar el juego</a>' : '')
          : asset);
        return;
      }
      if (request.method === 'GET' && url.pathname === '/api/status') {
        json(response, 200, { environment: await inspectBuildEnvironment(projectRoot), busy: active !== null });
        return;
      }
      if (request.method === 'POST' && url.pathname === '/api/build') {
        const origin = request.headers.origin;
        if (origin && origin !== `http://${request.headers.host}` && origin !== `https://${request.headers.host}`) {
          json(response, 403, { error: 'Origen no permitido.' });
          return;
        }
        if (active) {
          json(response, 409, { error: 'Ya hay una compilación en curso.' });
          return;
        }
        const body = await requestJson(request);
        const seed = validateSeed(body?.seed);
        const id = randomUUID();
        const job = { id, seed, state: 'running', phase: 'En espera', result: null, error: null };
        jobs.set(id, job);
        active = id;
        json(response, 202, { id, seed });
        build(seed, { projectRoot, onPhase: (phase) => { job.phase = phase; } })
          .then((result) => { job.result = result; job.state = 'complete'; job.phase = 'ROM lista'; })
          .catch((error) => { job.state = 'failed'; job.error = error.message.slice(-1800); job.phase = 'No se pudo compilar'; })
          .finally(() => { active = null; });
        while (jobs.size > 8) jobs.delete(jobs.keys().next().value);
        return;
      }
      const match = url.pathname.match(/^\/api\/build\/([0-9a-f-]{36})$/);
      if (request.method === 'GET' && match) {
        const job = jobs.get(match[1]);
        if (!job) return json(response, 404, { error: 'Compilación no encontrada.' });
        json(response, 200, {
          id: job.id, seed: job.seed, state: job.state, phase: job.phase,
          error: job.error,
          sha256: job.result?.sha256,
          download: job.state === 'complete' ? `/download/${job.id}` : null,
        });
        return;
      }
      const download = url.pathname.match(/^\/download\/([0-9a-f-]{36})$/);
      if (request.method === 'GET' && download) {
        const job = jobs.get(download[1]);
        if (job?.state !== 'complete') return json(response, 404, { error: 'ROM no disponible.' });
        const size = (await stat(job.result.path)).size;
        response.writeHead(200, {
          'Content-Type': 'application/octet-stream',
          'Content-Length': size,
          'Content-Disposition': `attachment; filename="${path.basename(job.result.path)}"`,
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
        });
        createReadStream(job.result.path).pipe(response);
        return;
      }
      json(response, 404, { error: 'Página no encontrada.' });
    } catch (error) {
      if (!response.headersSent) json(response, error.status || 400, { error: error.message });
      else response.destroy(error);
    }
  });
  return { server, jobs };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const host = process.env.DEKSA_HOST || '127.0.0.1';
  const port = Number(process.env.DEKSA_PORT || 52655);
  const accessKey = process.env.DEKSA_ACCESS_KEY || '';
  const wikiOrigin = process.env.DEKSA_WIKI_ORIGIN || '';
  if (!['127.0.0.1', 'localhost', '::1'].includes(host) && !accessKey) {
    throw new Error('Para abrir el compilador en la red, definí DEKSA_ACCESS_KEY.');
  }
  const { server } = createApp({ accessKey, wikiOrigin });
  server.listen(port, host, () => process.stdout.write(`Déksa Compiler: http://${host}:${port}\n`));
}
