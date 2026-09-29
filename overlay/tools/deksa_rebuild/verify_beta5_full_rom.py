#!/usr/bin/env python3
"""Verify the selected Beta 5 roster and fauna against bytes in the compiled ROM."""

import argparse
import json
from pathlib import Path
import re
import struct
import subprocess

import write_beta5_full as writer

ROOT = Path(__file__).resolve().parents[2]
WILD_SUFFIX = {
    'land': 'LandMons', 'surf': 'WaterMons', 'rock_smash': 'RockSmashMons',
    'old_rod': 'FishingMons', 'good_rod': 'FishingMons', 'super_rod': 'FishingMons',
}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--seed', required=True)
    parser.add_argument('--project-root', type=Path, default=ROOT.parent)
    parser.add_argument('--rom', type=Path, default=ROOT / 'pokefirered.gba')
    parser.add_argument('--elf', type=Path, default=ROOT / 'pokefirered.elf')
    args = parser.parse_args()
    outputs, package = writer.desired_outputs(args.seed, args.project_root.resolve())
    for path, expected in outputs.items():
        assert path.read_text() == expected, f'Source differs from seed: {path}'
    records = writer.normalize_records(package['records'])
    symbols = {}
    for line in subprocess.check_output(
            ['arm-none-eabi-nm', '-S', '--defined-only', str(args.elf)], text=True).splitlines():
        fields = line.split()
        if len(fields) == 4:
            symbols[fields[3]] = (int(fields[0], 16), int(fields[1], 16))
    rom = args.rom.read_bytes()
    assert len(rom) == 16 * 1024 * 1024

    def read(name):
        address, size = symbols[name]
        offset = address - 0x08000000
        assert 0 <= offset and offset + size <= len(rom), name
        return rom[offset:offset + size]

    constants = {}
    for name in ['pokemon', 'species', 'moves', 'items', 'opponents']:
        content = (ROOT / f'include/constants/{name}.h').read_text()
        constants.update((key, int(value, 0)) for key, value in re.findall(
            r'^#define\s+(\w+)\s+(0x[0-9A-Fa-f]+|\d+)\b', content, re.M))
    personalities = {(trainer, slot): (species, nature, ability) for
                     trainer, species, slot, nature, ability in
                     struct.iter_unpack('<HHBBBx', read('sR4TrainerPersonalities'))}
    rewards = dict(struct.iter_unpack('<HH', read('sR4TrainerRewards')))
    trainers = read('gTrainers')
    assert len(personalities) == 468 * 6 and len(rewards) == 468
    for row in records:
        raw = read(row['symbol'])
        assert len(raw) == 6 * 16, row['symbol']
        for index, mon in enumerate(row['members']):
            expected = (mon['rawIv'], mon['level'], constants[mon['species']],
                        constants[mon['item']], *[constants[move] for move in mon['moves']])
            actual = struct.unpack_from('<HBxHH4H', raw, index * 16)
            assert actual == expected, (row['symbol'], index, actual, expected)
            assert personalities[row['id'], index] == (
                constants[mon['species']], constants[mon['nature']], mon['abilityNum'])
        offset = row['id'] * 40
        assert trainers[offset] == 3, row['constant']
        assert struct.unpack_from('<I', trainers, offset + 28)[0] == 0x107, row['constant']
        assert trainers[offset + 32] == 6, row['constant']
        assert struct.unpack_from('<I', trainers, offset + 36)[0] == symbols[row['symbol']][0]
        assert rewards[row['id']] == row['payout']

    source = json.loads(writer.WILD.read_text())['wild_encounter_groups'][0]
    entries = {}
    for entry in source['encounters']:
        entries.setdefault(entry['map'], []).append(entry)
    touched = set()
    for table in package['tables']:
        field, start, count = writer.METHODS[table['method']]
        for entry in entries[table['mapId']]:
            label = entry['base_label']
            symbol = f"{label}_{WILD_SUFFIX[table['method']]}"
            if symbol not in symbols:  # This binary contains FireRed, not LeafGreen.
                continue
            raw = read(symbol)
            expected = [
                (slot['minLevel'], slot['maxLevel'], constants[slot['species']])
                for slot in table['slots']
            ]
            actual = [struct.unpack_from('<BBH', raw, (start + index) * 4)
                      for index in range(count)]
            assert actual == expected, (table['surfaceId'], label, actual, expected)
            rate = read(f'{symbol}Info')[0]
            native_rate = entry[field]['encounter_rate']
            assert rate == native_rate
            touched.add((label, table['method']))
    assert len(touched) == 323, len(touched)
    print('Beta 5 ROM PASS: 468 physical teams / 2808 Pokemon / 323 FireRed fauna projections')


if __name__ == '__main__':
    main()
