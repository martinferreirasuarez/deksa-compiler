import links from './site-links.json' with { type: 'json' };

function escape(value) {
  return String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

export function siteHeader(active) {
  const navigation = links.navigation.map(link => `<a class="site-link${link.primary ? ' site-link-primary' : ''}" href="${link.href}"${link.title === active ? ' aria-current="page"' : ''}>${link.label}</a>`).join('');
  return `<header class="site-header" id="top"><a class="brand" href="/" aria-label="Pokémon Déksa home"><i class="brand-symbol" aria-hidden="true"></i><span class="brand-wordmark"><small>Pokémon</small><strong>Déksa</strong></span></a><nav class="site-nav" aria-label="Main navigation">${navigation}</nav></header>`;
}

export function siteFooter(version) {
  const navigation = links.footer.map(link => `<a${link.label === 'Report a problem' ? ' id="report-problem"' : ''} href="${link.href}">${link.label}</a>`).join('');
  return `<footer class="site-footer"><span>Pokémon FireRed Déksa · Game version <span id="game-version">${escape(version)}</span></span><nav aria-label="Help and project links">${navigation}</nav></footer>`;
}
