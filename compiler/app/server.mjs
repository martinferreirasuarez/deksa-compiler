#!/usr/bin/env node
import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import http from 'node:http';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspectBuildEnvironment, runSeedBuild, DEFAULT_ROOT } from './build-service.mjs';
import { validateSeed } from '../seed-plan.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
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
  if (!value?.startsWith('Basic ')) return false;
  const actual = Buffer.from(value.slice(6), 'base64');
  const expected = Buffer.from(`deksa:${accessKey}`);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function createApp({
  projectRoot = DEFAULT_ROOT,
  accessKey = '',
  build = runSeedBuild,
} = {}) {
  const jobs = new Map();
  let active = null;
  const server = http.createServer(async (request, response) => {
    try {
      if (!authorized(request, accessKey)) {
        response.writeHead(401, { 'WWW-Authenticate': 'Basic realm="Deksa Compiler"' });
        response.end('Se necesita la clave de acceso.');
        return;
      }
      const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
      if (request.method === 'GET' && ASSETS.has(url.pathname)) {
        const [name, type] = ASSETS.get(url.pathname);
        response.writeHead(200, {
          'Content-Type': type,
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
          'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'self'",
        });
        response.end(await readFile(path.join(HERE, name)));
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
  if (!['127.0.0.1', 'localhost', '::1'].includes(host) && !accessKey) {
    throw new Error('Para abrir el compilador en la red, definí DEKSA_ACCESS_KEY.');
  }
  const { server } = createApp({ accessKey });
  server.listen(port, host, () => process.stdout.write(`Déksa Compiler: http://${host}:${port}\n`));
}
