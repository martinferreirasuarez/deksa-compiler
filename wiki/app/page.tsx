import { SiteHeader } from './site-header';
import { beta5Windows } from './beta5-window-plan';
import { sectionName, stageForLot } from './recorrido';
import { workbench } from './workbench';

export const dynamic = 'force-dynamic';

export default function Home() {
  return <>
    <SiteHeader active={null} title="Guide" />
    <main className="workbench-shell guide-home">
      <section className="guide-intro" aria-labelledby="guide-title">
        <div className="guide-intro-copy">
          <p className="eyebrow">POKÉMON FIRERED · DÉKSA</p>
          <h2 id="guide-title">Pokémon FireRed Déksa</h2>
          <p>A FireRed ROM hack focused on tougher battles, less grinding and more replayability. Each seed brings different wild encounters and trainer teams, with Pokémon from Kanto, Johto and Hoenn. A new story explores Déksa’s influence as a biotechnology company in Kanto.</p>
          <div className="guide-actions">
            <a className="guide-primary" href="https://pokemondeksa.com/build">Build game ↗</a>
            <a href="/cambios">Changes from FireRed →</a>
            <a href="/play">How to play →</a>
          </div>
        </div>
      </section>
      <section className="game-gallery" aria-label="Game screenshots">
        <figure><img src="/screenshots/difficulty.png?v=normal" width="240" height="160" alt="Difficulty selection in the game, with Normal selected" /><figcaption>Choose your difficulty</figcaption></figure>
        <figure><img src="/screenshots/story.png" width="240" height="160" alt="Professor Oak introduces Kanto's changing ecology" /><figcaption>A new story in Kanto</figcaption></figure>
        <figure><img src="/screenshots/kit.png" width="240" height="160" alt="Your mother gives you the Déksa Kit, Old Rod and Running Shoes" /><figcaption>Quality-of-life improvements</figcaption></figure>
        <figure><img src="/screenshots/recovery.png?v=heal-first" width="240" height="160" alt="Pokémon Center offering to revive all fainted Pokémon for the displayed total price" /><figcaption>Revival costs depend on difficulty</figcaption></figure>
        <figure><img src="/screenshots/candies.png" width="240" height="160" alt="A Poké Mart selling Rare Candies for ₽1 and Berries" /><figcaption>Rare Candies and Berries</figcaption></figure>
      </section>
      <div className="guide-heading"><h2>Walkthrough</h2><p>Pokémon · Trainers · Items · Maps</p></div>
      <section className="lot-index lot-index-direct guide-index" aria-label="Game walkthrough">
        {beta5Windows.map((section, index) => <section className="arc-row window-row" key={section.id}>
          <h3><span className="guide-section-number">{String(index + 1).padStart(2, '0')}</span><strong>{sectionName(section.id)}</strong></h3>
          <div className="lot-grid">
            {workbench.lots.filter(lot => section.batches.includes(lot.id)).map(lot => {
              const stage = stageForLot(lot.id);
              return <a className="lot-card" href={`/beta5/lotes/${lot.id.toLowerCase()}?view=fauna`} key={lot.id}>
                <span className="lot-card-number guide-stage-number">{String(stage.number).padStart(2, '0')}</span>
                <span className="lot-card-copy"><small>Part {stage.number}</small><strong>{stage.title}</strong></span>
                <span className="guide-card-arrow" aria-hidden="true">↗</span>
              </a>;
            })}
          </div>
        </section>)}
      </section>
      <footer className="guide-footer"><a href="#top">Back to top ↑</a></footer>
    </main>
  </>;
}
