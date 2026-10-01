import type { Metadata } from 'next';
import './globals.css';
import '../../compiler/app/site.css';
import release from '../../compiler/app/release.json';
import links from '../../compiler/app/site-links.json';

export const metadata: Metadata = {
  metadataBase: new URL('https://pokemondeksa.com/'),
  title: 'Pokémon FireRed Déksa · Guide',
  description: 'A FireRed ROM hack with seeded wild Pokémon and trainer teams, redesigned battles, a new story and level caps.',
  icons: { icon: '/brand-mark.svg' },
  robots: { index: true, follow: true },
  alternates: { canonical: '/' },
  openGraph: {
    title: 'Pokémon FireRed Déksa',
    description: 'Seeded encounters and trainer teams, redesigned battles and a new story in Kanto.',
    url: '/', type: 'website',
    images: [{ url: '/share-card.png', width: 1200, height: 630, alt: 'Pokémon FireRed Déksa' }],
  },
  twitter: { card: 'summary_large_image', title: 'Pokémon FireRed Déksa', images: ['/share-card.png'] },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}<footer className="site-footer">
        <span>Pokémon FireRed Déksa · Game version {release.version}</span>
        <nav aria-label="Help and project links">{links.footer.map(link => <a key={link.label} href={link.href}>{link.label}</a>)}</nav>
      </footer></body>
    </html>
  );
}
