import assert from 'node:assert/strict';
import { test } from 'node:test';
import http from 'node:http';
import { createApp } from './server.mjs';
import { publicWikiHtml } from './public-wiki.mjs';

test('canonical metadata and help links survive the public proxy', () => {
  const html = publicWikiHtml('<head><link rel="canonical" href="https://pokemondeksa.com/"><link rel="preload" href="/secret.js"><meta name="robots" content="index, follow"></head><a href="/play#credits">Credits</a>');
  assert.match(html, /rel="canonical"/);
  assert.match(html, /href="\/play#credits"/);
  assert.doesNotMatch(html, /preload|secret/);
});

test('la wiki pública conserva sólo recorrido, etapas e imágenes', async () => {
  const upstreamRequests = [];
  const upstream = http.createServer((request, response) => {
    upstreamRequests.push(request.url);
    if (request.url.startsWith('/_next/static/css/')) {
      response.writeHead(200, { 'Content-Type': 'text/css' });
      response.end('body{color:red}');
    } else if (request.url.startsWith('/pokemon/')) {
      response.writeHead(200, { 'Content-Type': 'image/png' });
      response.end('png');
    } else {
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      response.end('<!doctype html><html><head><link rel="stylesheet" href="/_next/static/css/layout.css"><link rel="modulepreload" href="/_next/static/chunks/private.js"><script src="/private.js"></script><meta name="description" content="Taller privado de autoría y auditoría visual de Pokémon FireRed: Déksa."></head><body><h1>Game guide</h1><a href="/">Guide</a><a href="https://beelink.tailbc6934.ts.net:10000/">Build game</a><a href="https://pokemondeksa.com/build">Build game</a><a href="/beta5/lotes/01a?view=trainers">Etapa</a><a href="/cambios">Cambios</a><img src="/pokemon/onix.png"><script>window.secret="private"</script></body></html>');
    }
  });
  await new Promise((resolve) => upstream.listen(0, '127.0.0.1', resolve));
  const { server } = createApp({ wikiOrigin: `http://127.0.0.1:${upstream.address().port}` });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const index = await (await fetch(base)).text();
    assert.match(index, /Game guide/);
    assert.match(index, /href="\/build"/);
    assert.doesNotMatch(index, /build-form|tailbc6934/);
    const creator = await fetch(`${base}/build`);
    assert.equal(creator.status, 200);
    const creatorHtml = await creator.text();
    assert.match(creatorHtml, /id="build-form"/);
    assert.match(creatorHtml, /href="\/">Guide/);
    const trailing = await fetch(`${base}/build/`, { redirect: 'manual' });
    assert.equal(trailing.status, 308);
    assert.equal(trailing.headers.get('location'), '/build');
    const page = await fetch(`${base}/wiki/beta5/lotes/01a?view=trainers`);
    assert.equal(page.status, 200);
    const html = await page.text();
    assert.match(html, /href="\/wiki\/guide\/01a\?view=trainers"/);
    assert.match(html, /src="\/wiki\/pokemon\/onix.png"/);
    assert.match(html, /href="\/wiki\/changes"/);
    assert.match(html, /href="\/wiki\/_next\/static\/css\/layout.css"/);
    assert.match(html, /href="\/">Guide/);
    assert.doesNotMatch(html, /<script|modulepreload|window\.secret|Taller privado/);
    assert.equal((await fetch(`${base}/wiki/pokemon/onix.png`)).status, 200);
    assert.equal((await fetch(`${base}/wiki/cambios`)).status, 200);
    assert.equal((await fetch(`${base}/wiki/_next/static/css/layout.css`)).status, 200);
    const cleanRoute = await fetch(`${base}/wiki/guide/01a?view=fauna&q=Onix`);
    assert.equal(cleanRoute.status, 200);
    assert.match(cleanRoute.headers.get('content-security-policy'), /form-action 'self'/);
    assert.equal((await fetch(`${base}/wiki/recorrido/01a?view=maps`)).status, 200);
    assert.equal((await fetch(`${base}/wiki/changes`)).status, 200);
    for (const path of ['/wiki/historia', '/wiki/archivo/beta4', '/wiki/data/dialogues.json', '/wiki/_next/static/chunks/private.js']) {
      assert.equal((await fetch(base + path)).status, 404, path);
    }
    assert.deepEqual(upstreamRequests, ['/', '/beta5/lotes/01a?view=trainers', '/pokemon/onix.png', '/cambios', '/_next/static/css/layout.css', '/beta5/lotes/01a?view=fauna&q=Onix', '/beta5/lotes/01a?view=maps', '/cambios']);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await new Promise((resolve) => upstream.close(resolve));
  }
});
