/* La wiki local usa enlaces nativos para que cada sección cargue de forma
 * completa, sin depender del router cliente de Vinext. */
/* eslint-disable @next/next/no-html-link-for-pages */
import links from '../../compiler/app/site-links.json';

export function SiteHeader({
  title,
}: {
  active: 'beta5' | 'lots' | 'pokedex' | 'deksa' | null;
  title: string;
}) {
  return (
    <header className="site-header" id="top">
      <a className="brand" href="/" aria-label="Pokémon Déksa home">
        <i className="brand-symbol" aria-hidden="true" />
        <span className="brand-wordmark"><small>Pokémon</small><strong>Déksa</strong></span>
      </a>
      <nav className="site-nav" aria-label="Main navigation">
        {links.navigation.map(link => <a key={link.title} className={`site-link${link.primary ? ' site-link-primary' : ''}`} href={link.wikiHref} aria-current={title === link.title ? 'page' : undefined}>{link.label}</a>)}
      </nav>
    </header>
  );
}
