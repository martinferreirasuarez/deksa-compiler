#!/usr/bin/env python3
"""Materialize the sealed Beta 3 world through W02 into clean FireRed sources."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
from pathlib import Path
from typing import Any

import write_r2_trainers as r2


ROOT = Path(__file__).resolve().parents[2]
PROJECT = ROOT.parent
MATERIALIZATION_ID = "c85f2c164889-779f8388fbb9"
MATERIALIZATION_DIR = PROJECT / "wiki/world-build/runs" / MATERIALIZATION_ID
WORLD_MANIFEST = MATERIALIZATION_DIR / "manifest.json"
SELECTED_TRAINERS = MATERIALIZATION_DIR / "trainers.selected.json"
ROM_BINDING = PROJECT / "wiki/trainer-authoring/v7/rom-binding/generated/through-w02-rom-binding.generated.json"

PARTIES = ROOT / "src/data/trainer_parties.h"
TRAINERS = ROOT / "src/data/trainers.h"
BATTLE_MAIN = ROOT / "src/battle_main.c"
HELPER_HEADER = ROOT / "include/deksa_r4_trainers.h"
HELPER_SOURCE = ROOT / "src/deksa_r4_trainers.c"
GENERATED_MANIFEST = ROOT / "tools/deksa_rebuild/generated/r4_trainers.generated.json"

EXPECTED_INPUT_SHA256 = {
    WORLD_MANIFEST: "44a476a73451de590cfe0ae502262a74925266baaa00dfb1334f9a1a0051d692",
    SELECTED_TRAINERS: "41f52ae7520607a3d18cbf5736f66f20a1be801fcff342acd397915a11d81528",
    ROM_BINDING: "7d5946beb8eb786b07da251eb5eda19a37cac7c1862f18bd52c00acaa57fff30",
}
EXPECTED_MASTER_SEED = "deksa-beta3.1-misty-001"
EXPECTED_LOTS = ["01A", "02A", "02B", "02C", "02D"]
EXPECTED_VARIANTS = {"01A": "B", "02A": "B", "02B": "B", "02C": "B", "02D": "B"}
EXPECTED_CLOSURE_DIGEST = "sha256:23ae86b9e16ed92eca88e5179ec9aab88154e56c17160355b6d49b91ef3933f3"
PREVIOUS_OUTPUT_SHA256 = {
    PARTIES: "6755ea514a9030603feb30497ae04f42f79567a583421566505f759f371ba07d",
    TRAINERS: "d959f12e484838e6519677c38978ce50cd86d9b56ea26661fc64c9abaae09169",
    BATTLE_MAIN: "8ff52f691d387fed15f9e3f4e69bc2ed0aab89566ff17bf9ccaa083ac9561dc6",
}
PROFILE_IV = {"COMUN": 10, "AVANZADO": 15, "ESPECIALISTA": 20, "JEFE": 25}
PROFILE_PAYOUT = {"COMUN": 2, "AVANZADO": 4, "ESPECIALISTA": 6, "JEFE": 8, "LIGA": 10}
OAK_R8_PARTIES = {
    "sParty_RivalOaksLabSquirtle": "SPECIES_SQUIRTLE",
    "sParty_RivalOaksLabBulbasaur": "SPECIES_BULBASAUR",
    "sParty_RivalOaksLabCharmander": "SPECIES_CHARMANDER",
}
OAK_R8_TRAINERS = (
    "TRAINER_RIVAL_OAKS_LAB_SQUIRTLE",
    "TRAINER_RIVAL_OAKS_LAB_BULBASAUR",
    "TRAINER_RIVAL_OAKS_LAB_CHARMANDER",
)
UNIVERSAL_AI = (
    "AI_SCRIPT_CHECK_BAD_MOVE | AI_SCRIPT_TRY_TO_FAINT | "
    "AI_SCRIPT_CHECK_VIABILITY | AI_SCRIPT_HP_AWARE"
)


def fail(message: str) -> None:
    raise ValueError(f"R4 trainer writer: {message}")


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def read_pinned(path: Path) -> dict[str, Any]:
    actual = sha256(path)
    expected = EXPECTED_INPUT_SHA256[path]
    if actual != expected:
        fail(f"{path.relative_to(PROJECT)} SHA-256 {actual} != {expected}")
    return json.loads(path.read_text(encoding="utf-8"))


def without_content_digest(value: dict[str, Any]) -> dict[str, Any]:
    payload = dict(value)
    payload.pop("contentDigest", None)
    return payload


def load_inputs() -> tuple[dict[str, Any], dict[str, Any], dict[str, Any]]:
    world = read_pinned(WORLD_MANIFEST)
    selected = read_pinned(SELECTED_TRAINERS)
    binding = read_pinned(ROM_BINDING)
    if (
        world.get("materializationId") != MATERIALIZATION_ID
        or world.get("masterSeed") != EXPECTED_MASTER_SEED
        or world.get("scope") != "Beta3-through-02D"
        or world.get("throughLot") != "02D"
        or world.get("scopeLotIds") != EXPECTED_LOTS
        or world.get("completion", {}).get("missingTrainerLots") != []
    ):
        fail("world manifest does not seal the complete 01A→02D cut")
    if r2.canonical_digest(without_content_digest(world)) != world.get("contentDigest"):
        fail("world manifest contentDigest drifted")
    if r2.canonical_digest(without_content_digest(selected)) != selected.get("contentDigest"):
        fail("selected trainer contentDigest drifted")
    if selected.get("throughLot") != "02D" or [lot["lotId"] for lot in selected.get("lots", [])] != EXPECTED_LOTS:
        fail("selected trainers do not cover the exact R4 lot cut")
    if {lot["lotId"]: lot["variant"] for lot in selected["lots"]} != EXPECTED_VARIANTS:
        fail("seed-selected variants drifted")
    if selected.get("windowClosure", {}).get("digest") != EXPECTED_CLOSURE_DIGEST:
        fail("W02 window closure is absent or divergent")
    if len(selected.get("frontiers", [])) != 4 or any(row.get("status") != "PASS" for row in selected["frontiers"]):
        fail("the four 01A→02D frontiers are not PASS")
    if len(selected.get("tacticalOrder", {}).get("applied", [])) != 9:
        fail("the nine sealed tactical orders were not applied")
    inventory = binding.get("inventory", {})
    if (
        binding.get("bindingId") != "B3-THROUGH-W02-ROM-BINDING-1"
        or binding.get("throughLot") != "02D"
        or inventory.get("authorablePhysicalRecordCount") != 53
        or inventory.get("generatedTrainerIdCount") != 0
    ):
        fail("ROM binding does not describe the exact existing 53 records")
    return world, selected, binding


def r2_baseline_outputs() -> dict[Path, str]:
    """Reconstruct the frozen R2 sources without consulting the mutable worktree."""
    _, package = r2.load_package()
    records = r2.normalized_members(package)
    return {
        PARTIES: r2.render_parties(records),
        TRAINERS: r2.render_trainers(records),
        BATTLE_MAIN: r2.render_battle_main(r2.upstream_text("src/battle_main.c")),
    }


def normalized_records(selected: dict[str, Any], binding: dict[str, Any]) -> list[dict[str, Any]]:
    bindings = {
        row["recordIndex"]: row
        for row in binding["records"]
        if row["ownership"] == "AUTHORABLE"
    }
    if len(bindings) != 53:
        fail("binding does not expose exactly 53 authorable record IDs")

    records: list[dict[str, Any]] = []
    seen_ids: set[int] = set()
    constant_tokens: set[str] = set()
    logical_count = 0
    for lot in selected["lots"]:
        for logical in lot["mechanicalSheet"]["logicalTrainers"]:
            logical_count += 1
            profile = logical["profile"]
            editorial_iv = PROFILE_IV.get(profile)
            multiplier = PROFILE_PAYOUT.get(profile)
            expected_payout = ((logical["levelTotal"] * multiplier + 9) // 10) * 10 if multiplier else None
            if (
                editorial_iv is None
                or logical["iv"] != editorial_iv
                or logical["partySize"] != 6
                or logical["aiProfile"] != "DEKSA_UNIVERSAL"
                or logical["payout"] != expected_payout
            ):
                fail(f"{lot['lotId']}/{logical['logicalTrainerId']}: profile invariant drifted")
            for physical in logical["physicalRecords"]:
                record_id = physical["recordId"]
                bound = bindings.get(record_id)
                if bound is None or record_id in seen_ids:
                    fail(f"record {record_id} is missing or duplicated")
                if (
                    bound["lotId"] != lot["lotId"]
                    or bound["logicalTrainerId"] != logical["logicalTrainerId"]
                    or bound["physicalBranchId"] != physical["branchId"]
                ):
                    fail(f"record {record_id} differs from its sealed ROM binding")
                seen_ids.add(record_id)
                members = physical["members"]
                if len(members) != 6 or [row["slot"] for row in members] != [1, 2, 3, 4, 5, 6]:
                    fail(f"record {record_id} is not one ordered six-Pokemon party")
                if sum(row["level"] for row in members) != logical["levelTotal"]:
                    fail(f"record {record_id} level total drifted")
                rendered_members = []
                for member in members:
                    if member.get("nature") is None or member.get("ability") is None:
                        fail(f"record {record_id}/slot {member['slot']} lacks nature or ability")
                    moves = [r2.move_constant(move) for move in member["moves"]]
                    if not 1 <= len(moves) <= 4:
                        fail(f"record {record_id}/slot {member['slot']} has invalid move count")
                    moves.extend(["MOVE_NONE"] * (4 - len(moves)))
                    species = r2.species_constant(member["species"])
                    ability = r2.ability_constant(member["ability"])
                    nature = r2.nature_constant(member["nature"])
                    item = r2.item_constant(member.get("item"))
                    ability_pair = r2.species_abilities(member["species"])
                    if ability == ability_pair[0]:
                        ability_num = 0
                    elif ability == ability_pair[1] and ability_pair[1] != "ABILITY_NONE":
                        ability_num = 1
                    else:
                        fail(f"record {record_id}/slot {member['slot']}: illegal {ability} for {species}")
                    constant_tokens.update({species, ability, nature, item, *moves})
                    rendered_members.append({
                        "slot": member["slot"],
                        "species": species,
                        "level": member["level"],
                        "moves": moves,
                        "item": item,
                        "ability": ability,
                        "abilityNum": ability_num,
                        "nature": nature,
                        "editorialIv": editorial_iv,
                        "rawIv": r2.raw_iv(editorial_iv),
                    })
                records.append({
                    "lotId": lot["lotId"],
                    "logicalTrainerId": logical["logicalTrainerId"],
                    "branchId": physical["branchId"],
                    "trainerId": record_id,
                    "trainerConstant": bound["engineTrainerConstant"],
                    "partySymbol": bound["partyBinding"]["symbol"],
                    "profile": profile,
                    "payout": logical["payout"],
                    "members": rendered_members,
                })

    if logical_count != 49 or len(records) != 53 or len(seen_ids) != 53:
        fail(f"scope is {logical_count} logical / {len(records)} physical, expected 49 / 53")
    if sum(len(row["members"]) for row in records) != 318:
        fail("scope does not contain exactly 318 Pokemon")
    if seen_ids != set(bindings):
        fail("selected parties do not cover the exact binding inventory")
    r2.validate_constants(constant_tokens)
    return sorted(records, key=lambda row: row["trainerId"])


def apply_oak_r8_parties(current: str) -> str:
    for symbol, species in OAK_R8_PARTIES.items():
        replacement = f"""static const struct TrainerMonNoItemDefaultMoves {symbol}[] = {{
    {{
        .iv = 206,
        .lvl = 14,
        .species = {species},
    }},
}};"""
        current, count = r2.array_pattern(symbol).subn(replacement, current, count=1)
        if count != 1:
            fail(f"could not apply R8 Oak party override to {symbol}")
    return current


def apply_oak_r8_ai(current: str) -> str:
    for trainer in OAK_R8_TRAINERS:
        pattern = r2.trainer_pattern(trainer)
        match = pattern.search(current)
        if match is None:
            fail(f"could not find R8 Oak trainer record {trainer}")
        block, count = re.subn(
            r"(?m)^(\s*)\.aiFlags = .*,$",
            rf"\1.aiFlags = {UNIVERSAL_AI},",
            match.group(0),
            count=1,
        )
        if count != 1:
            fail(f"could not apply R8 Oak AI override to {trainer}")
        current = current[:match.start()] + block + current[match.end():]
    return current


def render_header() -> str:
    return """#ifndef GUARD_DEKSA_R4_TRAINERS_H
#define GUARD_DEKSA_R4_TRAINERS_H

u32 DeksaR4_AdjustTrainerPersonality(u16 trainerId, u8 partySlot, u16 species, u32 personality);
bool8 DeksaR4_GetTrainerReward(u16 trainerId, u32 *reward);

#endif // GUARD_DEKSA_R4_TRAINERS_H
"""


def render_helper(records: list[dict[str, Any]]) -> str:
    lines = [
        "// Generated by tools/deksa_rebuild/write_r4_trainers.py. Do not edit.",
        '#include "global.h"',
        '#include "data.h"',
        '#include "deksa_r4_trainers.h"',
        '#include "constants/abilities.h"',
        '#include "constants/opponents.h"',
        '#include "constants/pokemon.h"',
        '#include "constants/species.h"',
        "",
        "struct DeksaR4TrainerPersonality",
        "{",
        "    u16 trainerId;",
        "    u16 species;",
        "    u8 partySlot;",
        "    u8 nature;",
        "    u8 abilityNum;",
        "};",
        "",
        "static const struct DeksaR4TrainerPersonality sR4TrainerPersonalities[] =",
        "{",
    ]
    for record in records:
        for member in record["members"]:
            lines.append(
                f"    {{{record['trainerConstant']}, {member['species']}, {member['slot'] - 1}, "
                f"{member['nature']}, {member['abilityNum']}}},"
            )
    lines.extend([
        "};",
        "",
        "struct DeksaR4TrainerReward",
        "{",
        "    u16 trainerId;",
        "    u16 reward;",
        "};",
        "",
        "// Fixed party level sum times profile (2/4/6/8/10), rounded up to ten.",
        "static const struct DeksaR4TrainerReward sR4TrainerRewards[] =",
        "{",
    ])
    for record in records:
        levels = sum(member["level"] for member in record["members"])
        reward = ((levels * PROFILE_PAYOUT[record["profile"]] + 9) // 10) * 10
        if reward != record["payout"]:
            fail(f"{record['trainerConstant']}: physical party reward differs from sealed payout")
        lines.append(f"    {{{record['trainerConstant']}, {reward}}},")
    lines.extend([
        "};",
        "",
        "bool8 DeksaR4_GetTrainerReward(u16 trainerId, u32 *reward)",
        "{",
        "    u32 i;",
        "",
        "    if (trainerId == TRAINER_RIVAL_OAKS_LAB_SQUIRTLE",
        "     || trainerId == TRAINER_RIVAL_OAKS_LAB_BULBASAUR",
        "     || trainerId == TRAINER_RIVAL_OAKS_LAB_CHARMANDER)",
        "    {",
        "        *reward = 0;",
        "        return TRUE;",
        "    }",
        "    for (i = 0; i < ARRAY_COUNT(sR4TrainerRewards); i++)",
        "    {",
        "        if (sR4TrainerRewards[i].trainerId == trainerId)",
        "        {",
        "            *reward = sR4TrainerRewards[i].reward;",
        "            return TRUE;",
        "        }",
        "    }",
        "    // Parties outside the authored scope retain their vanilla rewards.",
        "    return FALSE;",
        "}",
        "",
        "u32 DeksaR4_AdjustTrainerPersonality(u16 trainerId, u8 partySlot, u16 species, u32 personality)",
        "{",
        "    u32 i;",
        "",
        "    for (i = 0; i < ARRAY_COUNT(sR4TrainerPersonalities); i++)",
        "    {",
        "        const struct DeksaR4TrainerPersonality *metadata = &sR4TrainerPersonalities[i];",
        "",
        "        if (metadata->trainerId > trainerId)",
        "            break;",
        "        if (metadata->trainerId != trainerId",
        "         || metadata->partySlot != partySlot",
        "         || metadata->species != species)",
        "            continue;",
        "        while (personality % NUM_NATURES != metadata->nature",
        "            || (gSpeciesInfo[species].abilities[1] != ABILITY_NONE",
        "             && (personality & 1) != metadata->abilityNum))",
        "            personality++;",
        "        break;",
        "    }",
        "    return personality;",
        "}",
        "",
    ])
    return "\n".join(lines)


def render_battle_main(current: str) -> str:
    old_include = '#include "deksa_r2_trainers.h"\n'
    new_include = '#include "deksa_r4_trainers.h"\n'
    if current.count(old_include) == 1 and current.count(new_include) == 0:
        current = current.replace(old_include, new_include, 1)
    elif current.count(new_include) != 1:
        fail("battle_main does not contain one replaceable trainer helper include")
    old_call = "DeksaR2_AdjustTrainerPersonality"
    new_call = "DeksaR4_AdjustTrainerPersonality"
    if current.count(old_call) == 4 and current.count(new_call) == 0:
        current = current.replace(old_call, new_call)
    elif current.count(new_call) != 4:
        fail("battle_main does not contain four replaceable trainer helper calls")
    normalized = current.replace(new_include, "").replace(new_call, "DeksaR2_AdjustTrainerPersonality")
    r2_baseline = r2_baseline_outputs()[BATTLE_MAIN]
    expected_normalized = r2_baseline.replace(old_include, "")
    if normalized != expected_normalized:
        fail("battle_main contains changes outside the helper rename")
    return current


def output_manifest(records: list[dict[str, Any]], outputs: dict[Path, str]) -> str:
    payload = {
        "schemaVersion": 1,
        "writerId": "deksa-clean-rebuild-r4-trainers-v1",
        "baselineCommit": r2.UPSTREAM_COMMIT,
        "materializationId": MATERIALIZATION_ID,
        "masterSeed": EXPECTED_MASTER_SEED,
        "throughLot": "02D",
        "lotVariants": EXPECTED_VARIANTS,
        "windowClosureDigest": EXPECTED_CLOSURE_DIGEST,
        "regionalStarterOverridesCompiled": 0,
        "logicalTrainers": 49,
        "physicalRecords": 53,
        "compiledPokemon": 318,
        "trainerIds": [row["trainerId"] for row in records],
        "oakLab": {
            "trainerIds": [326, 327, 328],
            "policy": "r8-level14-iv25-universal-ai",
        },
        "rematches": "outside-R4-vanilla",
        "mechanics": {
            "ai": "CHECK_BAD_MOVE|TRY_TO_FAINT|CHECK_VIABILITY|HP_AWARE",
            "natureAbility": "pre-CreateMon deterministic personality projection",
            "payout": "r9-ceil-to-10(levelTotal * profileMultiplier); prologue=0; outside-scope=vanilla",
        },
        "inputs": {
            path.relative_to(PROJECT).as_posix(): f"sha256:{digest}"
            for path, digest in EXPECTED_INPUT_SHA256.items()
        },
        "outputs": {
            path.relative_to(ROOT).as_posix(): "sha256:" + hashlib.sha256(text.encode()).hexdigest()
            for path, text in outputs.items()
        },
    }
    return json.dumps(payload, ensure_ascii=False, indent=2) + "\n"


def desired_outputs() -> dict[Path, str]:
    _, selected, binding = load_inputs()
    records = normalized_records(selected, binding)
    outputs = {
        PARTIES: apply_oak_r8_parties(r2.render_parties(records)),
        TRAINERS: apply_oak_r8_ai(r2.render_trainers(records)),
        HELPER_HEADER: render_header(),
        HELPER_SOURCE: render_helper(records),
        BATTLE_MAIN: render_battle_main(BATTLE_MAIN.read_text(encoding="utf-8")),
    }
    outputs[GENERATED_MANIFEST] = output_manifest(records, outputs)
    return outputs


def main() -> int:
    parser = argparse.ArgumentParser()
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--write", action="store_true")
    mode.add_argument("--check", action="store_true")
    args = parser.parse_args()

    outputs = desired_outputs()
    r2_outputs = r2_baseline_outputs()
    drifted: list[str] = []
    for path, desired in outputs.items():
        current = path.read_text(encoding="utf-8") if path.exists() else None
        if current == desired:
            continue
        if args.check:
            drifted.append(path.relative_to(ROOT).as_posix())
            continue
        if path in (PARTIES, TRAINERS, BATTLE_MAIN):
            allowed = {r2_outputs[path], r2.upstream_text(path.relative_to(ROOT).as_posix())}
            current_sha = hashlib.sha256(current.encode()).hexdigest() if current is not None else None
            if current not in allowed and current_sha != PREVIOUS_OUTPUT_SHA256[path]:
                fail(f"refusing to overwrite unexpected {path.relative_to(ROOT)}")
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(desired, encoding="utf-8")

    if drifted:
        fail("generated outputs drifted: " + ", ".join(drifted))
    action = "verified" if args.check else "written"
    print(f"R4 trainers {action}: 49 logical / 53 physical / 318 Pokemon / Oak R8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
