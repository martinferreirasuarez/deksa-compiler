const PAGE_PATH = /^\/beta5\/lotes\/[0-9]{2}[a-z]$/;
const IMAGE_PATH = /^\/(?:pokemon|trainers|items|maps|screenshots)\/[a-zA-Z0-9._-]+\.png$/;
const CSS_PATH = /^\/_next\/static\/css\/[a-zA-Z0-9._-]+\.css$/;

function publicPath(pathname) {
  if (pathname === '/' || pathname === '/wiki' || pathname === '/wiki/') return { upstream: '/', kind: 'page' };
  if (!pathname.startsWith('/wiki/')) return null;
  const upstream = pathname.slice('/wiki'.length);
  if (/^\/(?:guide|recorrido)\/[0-9]{2}[a-z]$/.test(upstream)) {
    return { upstream: upstream.replace(/^\/(?:guide|recorrido)\//, '/beta5/lotes/'), kind: 'page' };
  }
  if (upstream === '/changes') return { upstream: '/cambios', kind: 'page' };
  if (upstream === '/cambios') return { upstream, kind: 'page' };
  if (PAGE_PATH.test(upstream)) return { upstream, kind: 'page' };
  if (IMAGE_PATH.test(upstream)) return { upstream, kind: 'image' };
  if (CSS_PATH.test(upstream)) return { upstream, kind: 'css' };
  return null;
}

export function publicWikiHtml(html) {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '')
    .replace(/<link\b(?![^>]*\brel="(?:stylesheet|canonical)")[^>]*>/gi, '')
    .replace(/href="\/beta5\/lotes\//g, 'href="/guide/')
    .replace(/href="\/cambios(?=["?#])/g, 'href="/changes')
    .replace(/\b(href|src|data-rsc-css-href)="\//g, '$1="/wiki/')
    .replace(/href="\/wiki\/(?=["?#])/g, 'href="/')
    .replace(/href="\/wiki\/(play|build)(?=["?#])/g, 'href="/$1')
    .replace(/href="https:\/\/(?:beelink\.tailbc6934\.ts\.net:10000|pokemondeksa\.com)\/(?:build)?"/g, 'href="/build"')
    .replace('</head>', '<link rel="icon" type="image/svg+xml" href="/brand-mark.svg"></head>')
    .replace(
      'Taller privado de autoría y auditoría visual de Pokémon FireRed: Déksa.',
      'Pokémon FireRed Déksa: Pokémon, trainers, items and maps.',
    );
}

export async function servePublicWiki(request, response, url, origin) {
  const route = publicPath(url.pathname);
  if (!route) return false;
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { Allow: 'GET, HEAD' });
    response.end();
    return true;
  }

  const target = new URL(route.upstream + (route.kind === 'page' ? url.search : ''), origin);
  const upstream = await fetch(target, {
    redirect: 'manual',
    signal: AbortSignal.timeout(15000),
  });
  if (upstream.status !== 200) {
    response.writeHead(502, { 'Cache-Control': 'no-store' });
    response.end('The guide is currently unavailable.');
    return true;
  }
  const contentType = upstream.headers.get('content-type') || '';
  const expected = route.kind === 'page' ? 'text/html' : route.kind === 'css' ? 'text/css' : 'image/png';
  if (!contentType.startsWith(expected)) {
    response.writeHead(502, { 'Cache-Control': 'no-store' });
    response.end('Unexpected response from the guide.');
    return true;
  }
  const body = Buffer.from(await upstream.arrayBuffer());
  if (body.length > 20 * 1024 * 1024) {
    response.writeHead(502, { 'Cache-Control': 'no-store' });
    response.end('Page too large.');
    return true;
  }
  const canonical = `https://pokemondeksa.com${url.pathname === '/wiki/' || url.pathname === '/wiki' ? '/' : url.pathname}`;
  const output = route.kind === 'page' ? Buffer.from(publicWikiHtml(body.toString('utf8'))
    .replace(/<link\s+rel="canonical"\s+href="[^"]*"\s*\/?\s*>/gi, `<link rel="canonical" href="${canonical}">`)
    .replace(/<meta\s+property="og:url"\s+content="[^"]*"\s*\/?\s*>/gi, `<meta property="og:url" content="${canonical}">`)) : body;
  response.writeHead(200, {
    'Content-Type': contentType,
    'Content-Length': output.length,
    'Cache-Control': route.kind === 'page' ? 'no-store' : 'public, max-age=3600',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; img-src 'self'; style-src 'self'; base-uri 'none'; form-action 'self'",
  });
  response.end(request.method === 'HEAD' ? undefined : output);
  return true;
}

export function isPublicWikiRequest(pathname) {
  return pathname === '/' || pathname === '/wiki' || pathname.startsWith('/wiki/');
}
