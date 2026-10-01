#!/usr/bin/env node
import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import http from 'node:http';
import { isIP } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspectBuildEnvironment, runSeedPatchBuild, DEFAULT_ROOT } from './build-service.mjs';
import { BASE_ROM } from './rom-base.mjs';
import { validateSeed } from '../seed-plan.mjs';
import { isPublicWikiRequest, servePublicWiki } from './public-wiki.mjs';
import { createBuildQueue } from './build-queue.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RELEASE = JSON.parse(await readFile(path.join(HERE, 'release.json'), 'utf8'));
const BUILD_LIMIT = 3;
const BUILD_PERIOD_MS = 10 * 60 * 1000;
const MAX_RATE_ENTRIES = 10000;
const ASSETS = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/build', ['index.html', 'text/html; charset=utf-8']],
  ['/play', ['play.html', 'text/html; charset=utf-8']],
  ['/share-card.png', ['share-card.png', 'image/png']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/style.css', ['style.css', 'text/css; charset=utf-8']],
  ['/brand-mark.svg', ['brand-mark.svg', 'image/svg+xml']],
  ['/rom-base.mjs', ['rom-base.mjs', 'text/javascript; charset=utf-8']],
  ['/patch-worker.js', ['patch-worker.js', 'text/javascript; charset=utf-8']],
  ...['BinFile.js', 'HashCalculator.js', 'RomPatcher.format.bps.js'].map(name =>
    [`/vendor/rom-patcher-js/${name}`, [`vendor/rom-patcher-js/${name}`, 'text/javascript; charset=utf-8']]),
  ['/vendor/rom-patcher-js/LICENSE', ['vendor/rom-patcher-js/LICENSE', 'text/plain; charset=utf-8']],
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
    throw Object.assign(new Error('JSON is required.'), { status: 415 });
  }
  let raw = '';
  for await (const chunk of request) {
    raw += chunk.toString('utf8');
    if (raw.length > 4096) throw Object.assign(new Error('Request too large.'), { status: 413 });
  }
  try { return JSON.parse(raw); }
  catch { throw Object.assign(new Error('Invalid JSON.'), { status: 400 }); }
}

function safeNext(value) {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//')
    && !value.includes('\\') && !/[\r\n]/.test(value) ? value : '/';
}

function clientAddress(request) {
  const address = request.socket.remoteAddress || 'unknown';
  const forwarded = request.headers['cf-connecting-ip'];
  // Only the local Cloudflare connector may supply a visitor address.
  return ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(address)
    && typeof forwarded === 'string' && isIP(forwarded) ? forwarded : address;
}

export function createApp({
  projectRoot = DEFAULT_ROOT,
  build = runSeedPatchBuild,
  wikiOrigin = '',
  now = Date.now,
  jobDirectory = build === runSeedPatchBuild ? path.join(projectRoot, 'compiler/private/build-jobs') : null,
  buildTimeoutMs = 10 * 60 * 1000,
} = {}) {
  const queue = createBuildQueue({ build, projectRoot, now, directory: jobDirectory,
    version: RELEASE.version, timeoutMs: buildTimeoutMs });
  const { jobs } = queue;
  const buildRates = new Map();
  const server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
      // Trust proxy protocol information only from the local tunnel connector.
      const local = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(request.socket.remoteAddress);
      const publicHost = ['pokemondeksa.com', 'www.pokemondeksa.com'].includes(request.headers.host);
      if (local && publicHost && (request.headers['x-forwarded-proto'] === 'http' || request.headers.host.startsWith('www.'))) {
        response.writeHead(308, { Location: `https://pokemondeksa.com${url.pathname}${url.search}` });
        response.end(); return;
      }
      // Old sign-in bookmarks lead straight to the public page.
      if (request.method === 'GET' && url.pathname === '/login') {
        response.writeHead(303, { Location: safeNext(url.searchParams.get('next')), 'Cache-Control': 'no-store' });
        response.end();
        return;
      }
      if (request.method === 'GET' && url.pathname === '/build/') {
        response.writeHead(308, { Location: '/build' + url.search, 'Cache-Control': 'no-store' });
        response.end();
        return;
      }
      if (wikiOrigin && isPublicWikiRequest(url.pathname)) {
        if (!await servePublicWiki(request, response, url, wikiOrigin)) {
          json(response, 404, { error: 'Page not found.' });
        }
        return;
      }
      if (['GET', 'HEAD'].includes(request.method) && ASSETS.has(url.pathname)) {
        const [name, type] = ASSETS.get(url.pathname);
        response.writeHead(200, {
          'Content-Type': type,
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
          'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'self'",
        });
        const asset = await readFile(path.join(HERE, name));
        if (request.method === 'HEAD') { response.end(); return; }
        response.end(name.endsWith('.html')
          ? asset.toString('utf8').replaceAll('{{VERSION}}', RELEASE.version).replace('<!-- DEKSA_WIKI_LINK -->', wikiOrigin
            ? '<nav class="landing-nav" aria-label="Main navigation"><a class="wiki-link" href="/">Guide</a><a class="wiki-link" href="/wiki/changes">Changes</a></nav>' : '')
          : asset);
        return;
      }
      if (request.method === 'GET' && url.pathname === '/api/status') {
        await queue.ready;
        json(response, 200, { environment: await inspectBuildEnvironment(projectRoot), busy: queue.busy(),
          waiting: queue.waiting(), version: RELEASE.version, baseRom: BASE_ROM });
        return;
      }
      if (request.method === 'POST' && url.pathname === '/api/build') {
        const origin = request.headers.origin;
        if (origin && origin !== `http://${request.headers.host}` && origin !== `https://${request.headers.host}`) {
          json(response, 403, { error: 'Origin not allowed.' });
          return;
        }
        const body = await requestJson(request);
        if (!body || Object.keys(body).some(key => key !== 'seed')) {
          throw Object.assign(new Error('Only the seed is accepted. Your original ROM stays on your device.'), { status: 400 });
        }
        let seed;
        try { seed = validateSeed(body?.seed); }
        catch (error) { throw Object.assign(error, { status: 400 }); }
        const existing = await queue.find(seed);
        if (existing) return json(response, 202, { id: existing.id, seed, version: RELEASE.version });
        const timestamp = now();
        for (const [key, value] of buildRates) {
          if (value.expires <= timestamp) buildRates.delete(key);
        }
        const address = clientAddress(request);
        const rate = buildRates.get(address);
        if (rate?.count >= BUILD_LIMIT || (!rate && buildRates.size >= MAX_RATE_ENTRIES)) {
          response.setHeader('Retry-After', String(Math.max(1, Math.ceil(((rate?.expires ?? timestamp + BUILD_PERIOD_MS) - timestamp) / 1000))));
          return json(response, 429, { error: 'Build limit reached. Please wait a few minutes and try again.' });
        }
        buildRates.set(address, { count: (rate?.count ?? 0) + 1, expires: rate?.expires ?? timestamp + BUILD_PERIOD_MS });
        let job;
        try { job = await queue.submit(seed); }
        catch (error) {
          const reserved = buildRates.get(address);
          if (reserved?.count === 1) buildRates.delete(address);
          else if (reserved) reserved.count--;
          throw error;
        }
        json(response, 202, { id: job.id, seed, version: RELEASE.version });
        return;
      }
      const match = url.pathname.match(/^\/api\/build\/([0-9a-f-]{36})$/);
      if (request.method === 'GET' && match) {
        await queue.ready;
        const job = jobs.get(match[1]);
        if (!job) return json(response, 404, { error: 'Build not found.' });
        json(response, 200, {
          id: job.id, seed: job.seed, state: job.state, position: queue.position(job.id), version: job.version,
          error: job.error,
          sha256: job.result?.sha256,
          patchSha256: job.result?.patchSha256,
          romName: job.result?.romName,
          baseRom: BASE_ROM,
          download: job.state === 'complete' ? `/download/${job.id}` : null,
        });
        return;
      }
      const download = url.pathname.match(/^\/download\/([0-9a-f-]{36})$/);
      if (request.method === 'GET' && download) {
        await queue.ready;
        const job = jobs.get(download[1]);
        if (job?.state !== 'complete') return json(response, 404, { error: 'Patch unavailable.' });
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
      if (request.method === 'GET' && url.pathname === '/sitemap.xml') {
        const urls = ['/', '/build', '/play', '/wiki/changes'];
        if (wikiOrigin) {
          try {
            const home = await fetch(new URL('/', wikiOrigin), { signal: AbortSignal.timeout(10000) });
            if (home.ok) {
              const html = await home.text();
              for (const match of html.matchAll(/href="\/beta5\/lotes\/([0-9]{2}[a-z])(?:["?])/g)) urls.push(`/wiki/guide/${match[1]}`);
            }
          } catch { /* The main pages remain discoverable if the guide is restarting. */ }
        }
        response.writeHead(200, { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600' });
        response.end(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${[...new Set(urls)].map(route => `<url><loc>https://pokemondeksa.com${route}</loc></url>`).join('')}</urlset>`);
        return;
      }
      if (request.method === 'GET' && url.pathname === '/robots.txt') {
        response.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
        response.end('User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /download/\nSitemap: https://pokemondeksa.com/sitemap.xml\n');
        return;
      }
      json(response, 404, { error: 'Page not found.' });
    } catch (error) {
      if (!error.status) console.error('Déksa request failed:', error);
      if (!response.headersSent) json(response, error.status || 500, { error: error.status ? error.message : 'The server is unavailable. Please try again later.' });
      else response.destroy(error);
    }
  });
  server.requestTimeout = 30000;
  server.headersTimeout = 15000;
  return { server, jobs };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const host = process.env.DEKSA_HOST || '127.0.0.1';
  const port = Number(process.env.DEKSA_PORT || 52655);
  const wikiOrigin = process.env.DEKSA_WIKI_ORIGIN || '';
  const { server } = createApp({ wikiOrigin });
  server.listen(port, host, () => process.stdout.write(`Déksa Compiler: http://${host}:${port}\n`));
}
