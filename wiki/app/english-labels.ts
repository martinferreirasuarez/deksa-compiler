// Presentation only: the approved trainer and item catalogs stay unchanged.
const profiles: Record<string, string> = {
  comun: 'Common', avanzado: 'Advanced', especialista: 'Specialist',
  jefe: 'Boss', liga: 'League', prologo: 'Prologue',
};
export function profileLabel(value: string) {
  const key = value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  return profiles[key] ?? value;
}

const trainerClasses: Record<string, string> = {
  'Prólogo obligatorio': 'Rival', 'Rival temprano': 'Rival', 'Rival de Celeste': 'Rival',
  'Líder de Gimnasio': 'Gym Leader', 'Jefe de Team Rocket': 'Team Rocket Boss',
  'Científico': 'Scientist', 'Recluta Rocket': 'Team Rocket', 'Malabarista': 'Juggler',
  'Jefe Rocket': 'Team Rocket Boss', 'Cinturón Negro': 'Black Belt', 'Maestro del Dojo': 'Karate Master',
  'Psíquico': 'Psychic', 'Psíquica': 'Psychic', 'Médium': 'Channeler',
  'Nadadora': 'Swimmer', 'Nadador': 'Swimmer', 'Pescador': 'Fisherman', 'Luchadora': 'Crush Girl',
  'Campista': 'Camper', 'Dominguera': 'Picnicker', 'Dúo Lucha': 'Crush Kin',
  'Motociclista': 'Biker', 'Calvo': 'Cue Ball', 'Dama Aroma': 'Aroma Lady',
  'Bañista': 'Swimmer', 'Gemelas': 'Twins', 'Entrenador Guay': 'Cooltrainer',
  'Entrenadora Guay': 'Cooltrainer', 'Alto Mando': 'Elite Four', 'Campeón': 'Champion',
  'Criadora Pokémon': 'Pokémon Breeder', 'Criadora': 'Pokémon Breeder', 'Pintora': 'Painter',
  'Dama': 'Lady', 'Joven': 'Youngster', 'Ruinamaníaco': 'Ruin Maniac', 'Ornitólogo': 'Bird Keeper',
  'Montañero': 'Hiker', 'Cazabichos': 'Bug Catcher', 'Chica': 'Lass', 'Hermanos': 'Sis & Bro',
  'Pareja Joven': 'Young Couple', 'Domador': 'Tamer', 'Pareja Guay': 'Cool Couple',
  'Caballero': 'Gentleman', 'Pokemaníaco': 'Pokémaniac',
  'Administradora Rocket': 'Rocket Admin', 'Administrador Rocket': 'Rocket Admin',
  'Alto Mando reforzado': 'Elite Four',
};
export function trainerClassLabel(value: string) {
  const base = value.split(' · ')[0];
  return trainerClasses[base] ?? base;
}

const sources: Record<string, string> = {
  'Monte Moon': 'Mt. Moon', 'Torre Pokémon': 'Pokémon Tower',
  'Centro Comercial de Azulona': 'Celadon Department Store',
  'Centro Comercial de Azulona, tras Erika': 'Celadon Department Store, after Erika',
  'Recompensa DÉKSA en Azulona tras Erika': 'Celadon City, after Erika',
  'Poké Ball de Zona Safari Norte': 'Safari Zone, north area',
  'Silph S.A., tras Giovanni': 'Silph Co., after Giovanni', 'Dojo de Combate': 'Fighting Dojo',
  'Islas Espuma': 'Seafoam Islands', 'Laboratorio de Isla Canela': 'Cinnabar Lab',
  'Cabo Extremo / Isla Prima': 'Cape Brink / One Island',
  'Recompensa por rescatar a Lostelle': 'Reward for rescuing Lostelle',
};
export function itemSourceLabel(value: string) { return sources[value] ?? value; }
