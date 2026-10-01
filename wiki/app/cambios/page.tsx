import { SiteHeader } from "../site-header";

export const metadata = {
  title: "Changes · Pokémon FireRed Déksa",
  description: "Changes from the original Pokémon FireRed.",
};

const revivalPrices = [
  ["Story", "Free", "Free", "Free"],
  ["Easy", "₽44", "₽66", "₽188"],
  ["Normal", "₽88", "₽132", "₽375"],
  ["Hard", "₽175", "₽263", "₽750"],
  ["Dékslock", "Unavailable", "Unavailable", "Unavailable"],
];

const specialEvolutions = [
  ["Poliwhirl", "Politoed", "43", "King’s Rock"],
  ["Kadabra", "Alakazam", "29", "Twisted Spoon"],
  ["Machoke", "Machamp", "43", "Black Belt"],
  ["Graveler", "Golem", "43", "Hard Stone"],
  ["Slowpoke", "Slowking", "37", "King’s Rock"],
  ["Haunter", "Gengar", "43", "Spell Tag"],
  ["Onix", "Steelix", "43", "Metal Coat"],
  ["Seadra", "Kingdra", "47", "Dragon Scale"],
  ["Scyther", "Scizor", "43", "Metal Coat"],
  ["Eevee", "Espeon", "29", "Sun Stone"],
  ["Eevee", "Umbreon", "29", "Moon Stone"],
  ["Porygon", "Porygon2", "43", "Up-Grade"],
  ["Feebas", "Milotic", "47", "Blue Scarf"],
  ["Clamperl", "Huntail", "43", "DeepSeaTooth"],
  ["Clamperl", "Gorebyss", "43", "DeepSeaScale"],
  ["Tyrogue", "Hitmonlee", "20", "Black Belt"],
  ["Tyrogue", "Hitmonchan", "20", "Focus Band"],
  ["Tyrogue", "Hitmontop", "20", "Quick Claw"],
];

export default function CambiosPage() {
  return (
    <>
      <SiteHeader active={null} title="Changes" />
      <main className="changes-shell">
        <section className="changes-intro">
          <p className="eyebrow">FIRERED · DÉKSA</p>
          <h2>Changes from FireRed</h2>
        </section>

        <details className="changes-section" id="menos-farmeo">
          <summary>Leveling</summary>
          <div className="changes-detail-body">
            <h4>Levels and Rare Candies</h4>
            <ul>
              <li>Battles give no experience. Each Rare Candy raises a Pokémon’s level by one.</li>
              <li>Rare Candies cost <strong>₽1</strong> at Poké Marts. Purchases are limited only by your money and Bag space.</li>
              <li>A <strong>level cap</strong> limits Rare Candy use. At the cap, the candy is not used or consumed.</li>
              <li>The cap rises as you earn badges and complete League and island objectives. After Erika, defeat both Koga and Sabrina to raise it again.</li>
              <li>The Day Care does not grant experience from walking.</li>
            </ul>
            <div className="changes-table-wrap">
              <table className="changes-table">
                <thead><tr><th>Next objective</th><th>Level cap</th></tr></thead>
                <tbody>
                  <tr><td>Brock</td><td>14</td></tr>
                  <tr><td>Misty</td><td>21</td></tr>
                  <tr><td>Lt. Surge</td><td>24</td></tr>
                  <tr><td>Erika</td><td>29</td></tr>
                  <tr><td>Koga and Sabrina</td><td>43</td></tr>
                  <tr><td>Blaine</td><td>47</td></tr>
                  <tr><td>Giovanni</td><td>50</td></tr>
                  <tr><td>Pokémon League</td><td>60</td></tr>
                  <tr><td>Deliver the Ruby</td><td>65</td></tr>
                  <tr><td>Deliver the Sapphire</td><td>70</td></tr>
                  <tr><td>League rematch</td><td>75</td></tr>
                </tbody>
              </table>
            </div>

          </div>
        </details>

        <details className="changes-section" id="dificultad">
          <summary>Battles and recovery</summary>
          <div className="changes-detail-body">
            <h4>Trainers</h4>
            <ul>
              <li>Trainers have <strong>six Pokémon</strong>, except in the first battle at Oak’s Lab.</li>
              <li><strong>Improved AI</strong> and mandatory <strong>Set</strong> battle mode.</li>
              <li>A trainer’s category determines their average team level. Individual Pokémon can be two levels below to one level above the section’s cap.</li>
            </ul>
            <div className="changes-table-wrap">
              <table className="changes-table changes-trainer-table">
                <thead><tr><th>Category</th><th>Average level*</th><th>Held items</th><th>Species</th><th>TM/HM/Tutor</th><th>Available items</th></tr></thead>
                <tbody>
                  <tr><td>Common</td><td>−1.5</td><td>Up to 2/6</td><td>Current section</td><td>Current section</td><td>Current section</td></tr>
                  <tr><td>Advanced</td><td>−1</td><td>Up to 3/6</td><td>Current section</td><td>Current section</td><td>Stronger</td></tr>
                  <tr><td>Specialist</td><td>−0.5</td><td>Up to 4/6</td><td>Stronger</td><td>Current section</td><td>Stronger</td></tr>
                  <tr><td>Boss</td><td>Equal</td><td>Up to 6/6</td><td>Stronger</td><td>Stronger</td><td>Stronger</td></tr>
                  <tr><td>League</td><td>+0.5</td><td>Up to 6/6</td><td>Strongest</td><td>Strongest</td><td>Strongest</td></tr>
                </tbody>
              </table>
            </div>
            <p>* Relative to the section’s level cap.</p>

            <h4>Captures and held items</h4>
            <ul>
              <li>Only <strong>one Pokémon per evolutionary family</strong> can be obtained per playthrough, including captures, gifts, eggs, fossils and NPC trades.</li>
              <li>No duplicate held items within your team, including Berries.</li>
            </ul>

            <h4>Pokémon Centers and recovery</h4>
            <ul>
              <li>Pokémon Centers and the Déksa Kit automatically heal all conscious Pokémon for free.</li>
              <li>Reviving fainted Pokémon costs money based on the selected difficulty.</li>
              <li>The reusable <strong>Déksa Kit</strong> heals outside Pokémon Centers. Reviving with it costs three times the Center price.</li>
              <li>If any Pokémon remain fainted, you are shown their number and the total revival price. Accept to revive them all, or decline without paying.</li>
            </ul>
            <p>Choose Story, Easy, Normal, Hard or Dékslock when starting a game. Story is the default.</p>
            <div className="changes-table-wrap">
              <table className="changes-table">
                <thead><tr><th>Mode</th><th>Revive at Lv. 14</th><th>Lv. 21</th><th>Lv. 60</th></tr></thead>
                <tbody>
                  {revivalPrices.map(([mode, level14, level21, level60]) => (
                    <tr key={mode}><td>{mode}</td><td>{level14}</td><td>{level21}</td><td>{level60}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
            <h4>Items</h4>
            <ul>
              <li>Poké Marts sell Oran, Cheri, Chesto, Pecha, Rawst, Aspear and Persim Berries for ₽20. Leppa, Sitrus and Lum Berries are sold later for ₽100.</li>
              <li>Some healing item pickups are replaced with sellable items. Additional evolution items are available along the route.</li>
              <li>Your mother gives you the Déksa Kit, Old Rod and Running Shoes at the start.</li>
            </ul>
          </div>
        </details>

        <details className="changes-section" id="variedad">
          <summary>Pokémon and seeds</summary>
          <div className="changes-detail-body">
            <h4>Seeds and wild Pokémon</h4>
            <ul>
              <li>The seed determines each area’s wild Pokémon from the species available there.</li>
              <li>Available species are determined by their relative strength and type.</li>
              <li>Species from <strong>Kanto, Johto and Hoenn</strong> are included.</li>
              <li>About one in ten evolutionary families is excluded from wild encounters.</li>
              <li>Starter Pokémon, fossils and Legendary Pokémon do not appear in random wild encounters.</li>
              <li>Baby Pokémon and their entire evolutionary families are excluded from wild encounters.</li>
              <li>Unevolved Pokémon can appear even at levels that allow evolution.</li>
              <li>Each trainer has three possible teams. The seed selects one.</li>
            </ul>
            <h4>Pokédex</h4>
            <ul>
              <li>Oak gives you the National Pokédex with the regular Pokédex.</li>
            </ul>
            <h4>Baby Pokémon eggs</h4>
            <ul>
              <li>Each NPC gives one egg. When several species are offered, you choose one.</li>
            </ul>
            <div className="changes-table-wrap">
              <table className="changes-table">
                <thead><tr><th>Location</th><th>Egg</th><th>Requirement</th></tr></thead>
                <tbody>
                  <tr><td>Viridian City Pokémon Center</td><td>Pichu or Azurill</td><td>From the start</td></tr>
                  <tr><td>Route 5 Day Care</td><td>Cleffa or Igglybuff</td><td>On arrival</td></tr>
                  <tr><td>Saffron City Fighting Dojo</td><td>Tyrogue</td><td>Defeat the Karate Master; alternative to Hitmonlee or Hitmonchan</td></tr>
                  <tr><td>Fuchsia City Pokémon Center</td><td>Wynaut</td><td>After Koga</td></tr>
                  <tr><td>Cinnabar Lab</td><td>Smoochum, Elekid or Magby</td><td>After Blaine</td></tr>
                  <tr><td>Water Labyrinth, Five Island</td><td>Togepi</td><td>High friendship with your lead Pokémon</td></tr>
                </tbody>
              </table>
            </div>
            <h4>Special evolutions</h4>
            <ul>
              <li>Pichu, Cleffa, Igglybuff, Azurill and Togepi evolve when leveling up from level 10, without a friendship requirement.</li>
              <li>Wynaut evolves at level 15; Smoochum, Elekid and Magby at level 30.</li>
              <li>The evolutions below require leveling up while holding the listed item, at or above the minimum level.</li>
              <li>The held item is not consumed. Evolution stones used from the Bag are also reusable.</li>
              <li>The Karate Master gives you all three of Tyrogue’s evolution items. Tyrogue does not evolve without one equipped.</li>
            </ul>
            <div className="changes-table-wrap">
              <table className="changes-table">
                <thead><tr><th>From</th><th>To</th><th>Minimum level</th><th>Held item</th></tr></thead>
                <tbody>
                  {specialEvolutions.map(([from, to, level, item]) => (
                    <tr key={`${from}-${to}`}><td>{from}</td><td>{to}</td><td>{level}</td><td>{item}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </details>
      </main>
    </>
  );
}
