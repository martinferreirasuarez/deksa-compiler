#!/usr/bin/env python3
"""Project one seeded, reviewed Beta 5 roster and fauna into FireRed sources."""

import argparse
from functools import lru_cache
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile
import unicodedata

import write_r2_trainers as base
import write_r4_trainers as r4

ROOT = Path(__file__).resolve().parents[2]
PROJECT = ROOT.parent
PARTIES = ROOT / 'src/data/trainer_parties.h'
TRAINERS = ROOT / 'src/data/trainers.h'
HELPER = ROOT / 'src/deksa_r4_trainers.c'
WILD = ROOT / 'src/data/wild_encounters.json'
PROFILES = {'COMUN': (15, 2), 'AVANZADO': (20, 4), 'ESPECIALISTA': (25, 6),
            'JEFE': (31, 8), 'LIGA': (31, 10)}
METHODS = {
    'land': ('land_mons', 0, 12),
    'surf': ('water_mons', 0, 5),
    'rock_smash': ('rock_smash_mons', 0, 5),
    'old_rod': ('fishing_mons', 0, 2),
    'good_rod': ('fishing_mons', 2, 3),
    'super_rod': ('fishing_mons', 5, 5),
}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def source_package(seed, project_root=PROJECT):
    output = subprocess.check_output(
        ['node', str(project_root / 'compiler/rom-build-data.mjs'), '--seed', seed,
         '--project-root', str(project_root)],
        cwd=project_root, text=True)
    package = json.loads(output)
    require(package['schemaVersion'] == 1 and package['seed'] == seed, 'Paquete de seed inválido')
    require(len(package['records']) == 468 and len(package['tables']) == 315, 'Cobertura Beta 5 incompleta')
    return package


@lru_cache(maxsize=None)
def abilities(species):
    return base.species_abilities(species.removeprefix('SPECIES_'))


def normalize_records(rows):
    result = []
    tokens = set()
    for row in rows:
        profile = ''.join(char for char in unicodedata.normalize('NFD', row['profile'].upper())
                          if unicodedata.category(char) != 'Mn')
        require(profile in PROFILES, f"{row['constant']}: perfil desconocido")
        iv, multiplier = PROFILES[profile]
        require(len(row['members']) == 6, f"{row['constant']}: equipo incompleto")
        members = []
        for slot, member in enumerate(row['members']):
            species = member['species']
            nature = member['nature']
            ability = member['ability']
            item = member['item'] or 'ITEM_NONE'
            moves = [*member['moves']]
            require(member['iv'] == iv, f"{row['constant']}/{slot}: IV no coincide con perfil")
            require(all(value == 0 for value in member['evs'].values()), f"{row['constant']}/{slot}: EV no cero")
            require(1 <= len(moves) <= 4 and len(set(moves)) == len(moves),
                    f"{row['constant']}/{slot}: movimientos inválidos")
            pair = abilities(species)
            require(ability in pair and ability != 'ABILITY_NONE',
                    f"{row['constant']}/{slot}: habilidad {ability} no legal para {species}")
            ability_num = 0 if ability == pair[0] else 1
            moves += ['MOVE_NONE'] * (4 - len(moves))
            tokens.update((species, nature, ability, item, *moves))
            members.append({
                'slot': slot + 1, 'species': species, 'level': member['level'],
                'moves': moves, 'nature': nature, 'ability': ability,
                'abilityNum': ability_num, 'item': item,
                'editorialIv': iv, 'rawIv': base.raw_iv(iv),
            })
        payout = ((sum(mon['level'] for mon in members) * multiplier + 9) // 10) * 10
        result.append({**row, 'partySymbol': row['symbol'], 'trainerConstant': row['constant'],
                       'members': members, 'payout': payout})
    base.validate_constants(tokens)
    return result


def replace_one(pattern, replacement, text, label):
    updated, count = pattern.subn(lambda _: replacement, text)
    require(count == 1, f'{label}: se esperó un bloque, hubo {count}')
    return updated


def trainer_sources(records):
    parties = PARTIES.read_text()
    trainers = TRAINERS.read_text()
    helper = HELPER.read_text()
    personality = []
    rewards = []
    for record in records:
        constant = record['constant']
        symbol = record['symbol']
        parties = replace_one(base.array_pattern(symbol), base.render_party(record), parties, symbol)
        block = base.trainer_pattern(constant).search(trainers)
        require(block is not None, f'{constant}: entrenador físico ausente')
        replacement = re.sub(r'\.aiFlags = [^\n]+', '.aiFlags = ' + r4.UNIVERSAL_AI + ',', block.group())
        replacement = re.sub(r'\.party = [^\n]+', f'.party = ITEM_CUSTOM_MOVES({symbol}),', replacement)
        trainers = replace_one(base.trainer_pattern(constant), replacement, trainers, constant)
        for slot, member in enumerate(record['members']):
            personality.append(f"    {{{constant}, {member['species']}, {slot}, {member['nature']}, {member['abilityNum']}}},")
        rewards.append(f"    {{{constant}, {record['payout']}}},")

    # Keep the fixed Oak exception and the runtime functions. Only their data arrays change.
    for kind, lines in [('Personality', personality), ('Reward', rewards)]:
        name = 'sR4TrainerPersonalities' if kind == 'Personality' else 'sR4TrainerRewards'
        pattern = re.compile(r'(static const struct DeksaR4Trainer' + kind + r' ' + name + r'\[\] =\n\{\n).*?(\n\};)', re.S)
        match = pattern.search(helper)
        require(match is not None, f'{name}: tabla ausente')
        helper = replace_one(pattern, match.group(1) + '\n'.join(lines) + match.group(2), helper, name)
    return {PARTIES: parties, TRAINERS: trainers, HELPER: helper}


def fauna_source(tables):
    document = json.loads(WILD.read_text())
    group, = document['wild_encounter_groups']
    fields = {field['type']: field for field in group['fields']}
    for method, (field, start, count) in METHODS.items():
        expected = fields[field]['encounter_rates'][start:start + count]
        require(len(expected) == count and sum(expected) == 100,
                f'{method}: pesos de encuentros inválidos')
    physical = {}
    for entry in group['encounters']:
        physical.setdefault(entry['map'], []).append(entry)
    touched = set()
    for table in tables:
        method = table['method']
        require(method in METHODS, f'{table["surfaceId"]}: método desconocido')
        field, start, count = METHODS[method]
        require(len(table['slots']) == count, f'{table["surfaceId"]}: cantidad de slots incorrecta')
        entries = physical.get(table['mapId'], [])
        require(len(entries) == (18 if table['mapId'] == 'MAP_SIX_ISLAND_ALTERING_CAVE' else 2),
                f'{table["mapId"]}: cantidad de tablas físicas inesperada')
        for entry in entries:
            body = entry.get(field)
            require(body and (body['encounter_rate'] == table['encounterRate']
                              or ('LeafGreen' in entry['base_label'] and table['mapId'] == 'MAP_SIX_ISLAND_ALTERING_CAVE'
                                  and body['encounter_rate'] == 7)),
                    f'{table["surfaceId"]}: tasa física diferente')
            mons = body['mons']
            require(start + count <= len(mons), f'{table["surfaceId"]}: rango de pesca incorrecto')
            key = (entry['base_label'], method)
            require(key not in touched, f'{key}: tabla duplicada')
            touched.add(key)
            mons[start:start + count] = [
                {'min_level': slot['minLevel'], 'max_level': slot['maxLevel'], 'species': slot['species']}
                for slot in table['slots']
            ]
    require(len(touched) == 646, f'Fauna: sólo {len(touched)} proyecciones físicas')
    return json.dumps(document, indent=2) + '\n'


def desired_outputs(seed, project_root=PROJECT):
    package = source_package(seed, project_root)
    records = normalize_records(package['records'])
    outputs = trainer_sources(records)
    outputs[WILD] = fauna_source(package['tables'])
    return outputs, package


def write_atomic(path, text):
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8', dir=path.parent,
                                         prefix=f'.{path.name}.', delete=False) as handle:
            temporary = Path(handle.name)
            handle.write(text)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--seed', required=True)
    parser.add_argument('--project-root', type=Path, default=PROJECT)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument('--write', action='store_true')
    mode.add_argument('--check', action='store_true')
    mode.add_argument('--dry-run', action='store_true')
    args = parser.parse_args()
    outputs, package = desired_outputs(args.seed, args.project_root.resolve())
    changed = [path for path, text in outputs.items() if path.read_text() != text]
    if args.check:
        require(not changed, 'Fuentes distintas de la seed: ' + ', '.join(str(path) for path in changed))
    elif args.write:
        for path in changed:
            write_atomic(path, outputs[path])
    print(f"Beta 5 {args.seed}: 452 encuentros / {len(package['records'])} registros / "
          f"{len(package['tables'])} tablas; {len(changed)} archivos {'pendientes' if args.dry_run else 'cambiados'}")


if __name__ == '__main__':
    main()
