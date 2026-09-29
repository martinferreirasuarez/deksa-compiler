#!/usr/bin/env python3
"""Materialize the accepted Beta 3 W01-B trainer package into clean R2 sources."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import subprocess
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[2]
PROJECT = ROOT.parent
UPSTREAM_COMMIT = "c75f352304d529f6ba92d4f74b9cf8b5c3810788"

WORLD_MANIFEST = PROJECT / "wiki/world-build/runs/018d4993d11b-ba270d452b8c/manifest.json"
SELECTED_TRAINERS = PROJECT / "wiki/world-build/runs/018d4993d11b-ba270d452b8c/trainers.selected.json"
LOT_TRIPLET = PROJECT / "wiki/trainer-authoring/v7/runs/01A/lot-gate/lot-triplet.json"
LOT_STATE = PROJECT / "wiki/trainer-authoring/v7/lot-state/01A.json"

PARTIES = ROOT / "src/data/trainer_parties.h"
TRAINERS = ROOT / "src/data/trainers.h"
BATTLE_MAIN = ROOT / "src/battle_main.c"
HELPER_HEADER = ROOT / "include/deksa_r2_trainers.h"
HELPER_SOURCE = ROOT / "src/deksa_r2_trainers.c"
GENERATED_MANIFEST = ROOT / "tools/deksa_rebuild/generated/r2_trainers.generated.json"

EXPECTED_INPUT_SHA256 = {
    WORLD_MANIFEST: "f54ec9cb184066153f7bef9b24fa1ce43550ffac42a8f4c0bfc11e9e05bfd4ad",
    SELECTED_TRAINERS: "bd4c61139c863ab4199c5f3267895ddfc280a0757ebd48cbe80daba8bd9b004b",
    LOT_TRIPLET: "736219e346276944142df39b1a15ea09c3f93620a3999304da9f7862b6b8068f",
    LOT_STATE: "7ea93c9c1689b605ff88ffba90d95b70a13096fe3f248e88b227323523c5ce56",
}

EXPECTED_MATERIALIZATION = "018d4993d11b-ba270d452b8c"
EXPECTED_MASTER_SEED = "beta3-w01-dev"
EXPECTED_PACKAGE_ID = "01A-B-beta3-v7"
EXPECTED_PACKAGE_DIGEST = "sha256:1940b81e59277a4ec40b07c58097332a440fca4542fc97a9abc811a31aa12b06"

PROFILE_IV = {"COMUN": 10, "AVANZADO": 15, "ESPECIALISTA": 20, "JEFE": 25}
PROFILE_PAYOUT = {"COMUN": 2, "AVANZADO": 3, "ESPECIALISTA": 4, "JEFE": 5}
UNIVERSAL_AI = (
    "AI_SCRIPT_CHECK_BAD_MOVE | AI_SCRIPT_TRY_TO_FAINT | "
    "AI_SCRIPT_CHECK_VIABILITY | AI_SCRIPT_HP_AWARE"
)

BINDINGS = {
    ("rival-route-22", "rival-water"): (329, "TRAINER_RIVAL_ROUTE22_EARLY_SQUIRTLE", "sParty_RivalRoute22EarlySquirtle"),
    ("rival-route-22", "rival-grass"): (330, "TRAINER_RIVAL_ROUTE22_EARLY_BULBASAUR", "sParty_RivalRoute22EarlyBulbasaur"),
    ("rival-route-22", "rival-fire"): (331, "TRAINER_RIVAL_ROUTE22_EARLY_CHARMANDER", "sParty_RivalRoute22EarlyCharmander"),
    ("bug-catcher-rick", "default"): (102, "TRAINER_BUG_CATCHER_RICK", "sParty_BugCatcherRick"),
    ("bug-catcher-doug", "default"): (103, "TRAINER_BUG_CATCHER_DOUG", "sParty_BugCatcherDoug"),
    ("bug-catcher-sammy", "default"): (104, "TRAINER_BUG_CATCHER_SAMMY", "sParty_BugCatcherSammy"),
    ("bug-catcher-anthony", "default"): (531, "TRAINER_BUG_CATCHER_ANTHONY", "sParty_BugCatcherAnthony"),
    ("bug-catcher-charlie", "default"): (532, "TRAINER_BUG_CATCHER_CHARLIE", "sParty_BugCatcherCharlie"),
    ("camper-liam", "default"): (142, "TRAINER_CAMPER_LIAM", "sParty_CamperLiam"),
    ("leader-brock", "default"): (414, "TRAINER_LEADER_BROCK", "sParty_LeaderBrock"),
}

OAK_CONSTANTS = (
    "TRAINER_RIVAL_OAKS_LAB_SQUIRTLE",
    "TRAINER_RIVAL_OAKS_LAB_BULBASAUR",
    "TRAINER_RIVAL_OAKS_LAB_CHARMANDER",
)
PHYSICAL_STARTERS = {
    "rival-water": "squirtle",
    "rival-grass": "bulbasaur",
    "rival-fire": "charmander",
}


def fail(message: str) -> None:
    raise ValueError(f"R2 trainer writer: {message}")


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def sha256(path: Path) -> str:
    return sha256_bytes(path.read_bytes())


def canonical(value: Any) -> Any:
    if isinstance(value, list):
        return [canonical(item) for item in value]
    if isinstance(value, dict):
        return {key: canonical(value[key]) for key in sorted(value)}
    return value


def canonical_digest(value: Any) -> str:
    raw = json.dumps(canonical(value), ensure_ascii=False, separators=(",", ":")).encode()
    return "sha256:" + sha256_bytes(raw)


def read_sealed_json(path: Path) -> dict[str, Any]:
    expected = EXPECTED_INPUT_SHA256[path]
    actual = sha256(path)
    if actual != expected:
        fail(f"{path.relative_to(PROJECT)} SHA-256 {actual} != {expected}")
    return json.loads(path.read_text(encoding="utf-8"))


def upstream_text(relative: str) -> str:
    result = subprocess.run(
        ["git", "show", f"{UPSTREAM_COMMIT}:{relative}"],
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    return result.stdout


def constantize(value: str) -> str:
    return re.sub(r"[^A-Z0-9]+", "_", value.upper()).strip("_")


def species_constant(value: str) -> str:
    return "SPECIES_" + constantize(value)


def move_constant(value: str) -> str:
    return "MOVE_" + constantize(value)


def item_constant(value: str | None) -> str:
    return "ITEM_NONE" if value is None else "ITEM_" + constantize(value)


def ability_constant(value: str) -> str:
    return "ABILITY_" + constantize(value)


def nature_constant(value: str) -> str:
    return "NATURE_" + constantize(value)


def raw_iv(editorial_iv: int) -> int:
    return (editorial_iv * 255 + 30) // 31


def load_package() -> tuple[dict[str, Any], dict[str, Any]]:
    world = read_sealed_json(WORLD_MANIFEST)
    selected = read_sealed_json(SELECTED_TRAINERS)
    triplet = read_sealed_json(LOT_TRIPLET)
    state = read_sealed_json(LOT_STATE)

    if (
        world.get("materializationId") != EXPECTED_MATERIALIZATION
        or world.get("masterSeed") != EXPECTED_MASTER_SEED
        or world.get("scope") != "Beta3-W01-fixture"
        or world.get("status") != "WORKSHOP_MATERIALIZED"
    ):
        fail("world materialization identity drifted")
    selection = next(
        (row for row in world["trainers"]["lotSelections"] if row["lotId"] == "01A"),
        None,
    )
    if selection != {
        "lotId": "01A",
        "selectionScope": "continuity",
        "selectionId": "continuity-component-01",
        "variant": "B",
        "authoringStatus": "LOT_ACCEPTED",
        "packageId": EXPECTED_PACKAGE_ID,
        "selectedPackageDigest": EXPECTED_PACKAGE_DIGEST,
    }:
        fail("world does not select the accepted 01A-B package")

    if state.get("status") != "LOT_ACCEPTED" or len(state.get("acceptedTriplets", [])) != 8:
        fail("01A editorial state is not LOT_ACCEPTED with eight triplets")
    source_package = triplet.get("lotPackages", {}).get("B")
    if source_package is None or source_package.get("packageId") != EXPECTED_PACKAGE_ID:
        fail("accepted lot triplet has no 01A-B package")
    if canonical_digest(source_package) != EXPECTED_PACKAGE_DIGEST:
        fail("accepted package canonical digest drifted")

    lots = selected.get("lots", [])
    if len(lots) != 1:
        fail("selected trainer artifact must contain exactly one materialized lot")
    lot = lots[0]
    if (
        lot.get("lotId") != "01A"
        or lot.get("variant") != "B"
        or lot.get("packageId") != EXPECTED_PACKAGE_ID
        or lot.get("selectedPackageDigest") != EXPECTED_PACKAGE_DIGEST
        or lot.get("fixedPackageId") is not None
        or lot.get("fixedMechanicalSheet") is not None
        or lot.get("mechanicalSheet") != source_package.get("mechanicalSheet")
    ):
        fail("selected trainer artifact differs from accepted package B")
    return world, source_package


def validate_constants(tokens: set[str]) -> None:
    sources = {
        "SPECIES_": ROOT / "include/constants/species.h",
        "MOVE_": ROOT / "include/constants/moves.h",
        "ITEM_": ROOT / "include/constants/items.h",
        "ABILITY_": ROOT / "include/constants/abilities.h",
        "NATURE_": ROOT / "include/constants/pokemon.h",
    }
    texts = {prefix: path.read_text(encoding="utf-8") for prefix, path in sources.items()}
    for token in sorted(tokens):
        prefix = next((candidate for candidate in sources if token.startswith(candidate)), None)
        if prefix is None or re.search(rf"^#define\s+{re.escape(token)}\b", texts[prefix], re.MULTILINE) is None:
            fail(f"missing clean FireRed constant {token}")


def species_abilities(species: str) -> tuple[str, str]:
    source = (ROOT / "src/data/pokemon/species_info.h").read_text(encoding="utf-8")
    constant = species_constant(species)
    match = re.search(
        rf"\[{re.escape(constant)}\]\s*=\s*\{{(?P<body>.*?)^\s*\}},",
        source,
        re.MULTILINE | re.DOTALL,
    )
    if match is None:
        fail(f"cannot resolve species data for {constant}")
    abilities = re.search(
        r"\.abilities\s*=\s*\{\s*(ABILITY_[A-Z0-9_]+)\s*,\s*(ABILITY_[A-Z0-9_]+)\s*\}",
        match.group("body"),
    )
    if abilities is None:
        fail(f"cannot resolve abilities for {constant}")
    return abilities.group(1), abilities.group(2)


def normalized_members(package: dict[str, Any]) -> list[dict[str, Any]]:
    logicals = package["mechanicalSheet"]["logicalTrainers"]
    if len(logicals) != 8:
        fail("package must contain eight logical trainers")
    seen_bindings: set[tuple[str, str]] = set()
    records: list[dict[str, Any]] = []
    constant_tokens: set[str] = set()

    for logical in logicals:
        logical_id = logical["logicalTrainerId"]
        profile = logical["profile"]
        editorial_iv = PROFILE_IV.get(profile)
        payout_multiplier = PROFILE_PAYOUT.get(profile)
        expected_payout = ((logical["levelTotal"] * payout_multiplier + 9) // 10) * 10 if payout_multiplier else None
        if (
            editorial_iv is None
            or logical["iv"] != editorial_iv
            or logical["partySize"] != 6
            or logical["aiProfile"] != "DEKSA_UNIVERSAL"
            or logical["payout"] != expected_payout
        ):
            fail(f"{logical_id}: profile, IV, party, AI or payout invariant drifted")

        for physical in logical["physicalRecords"]:
            key = (logical_id, physical["branchId"])
            binding = BINDINGS.get(key)
            if binding is None or physical["recordId"] != binding[0] or key in seen_bindings:
                fail(f"{key}: missing, duplicate or mismatched clean binding")
            seen_bindings.add(key)
            members = physical["members"]
            if len(members) != 6 or [row["slot"] for row in members] != list(range(1, 7)):
                fail(f"{key}: party is not six ordered slots")
            if sum(row["level"] for row in members) != logical["levelTotal"]:
                fail(f"{key}: level total drifted")
            if logical_id == "rival-route-22":
                expected_starter = PHYSICAL_STARTERS[physical["branchId"]]
                if members[-1]["species"] != expected_starter or members[-1]["family"] != expected_starter:
                    fail(f"{key}: R2 must use the Kanto physicalRecord starter")

            rendered_members = []
            for member in members:
                if member.get("nature") is None or member.get("ability") is None:
                    fail(f"{key}/slot {member['slot']}: nature and ability are mandatory")
                moves = [move_constant(move) for move in member["moves"]]
                if not 1 <= len(moves) <= 4:
                    fail(f"{key}/slot {member['slot']}: invalid move count")
                moves.extend(["MOVE_NONE"] * (4 - len(moves)))
                species = species_constant(member["species"])
                ability = ability_constant(member["ability"])
                nature = nature_constant(member["nature"])
                item = item_constant(member.get("item"))
                ability_pair = species_abilities(member["species"])
                if ability == ability_pair[0]:
                    ability_num = 0
                elif ability == ability_pair[1] and ability_pair[1] != "ABILITY_NONE":
                    ability_num = 1
                else:
                    fail(f"{key}/slot {member['slot']}: {ability} is illegal for {species}")
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
                    "rawIv": raw_iv(editorial_iv),
                })
            records.append({
                "logicalTrainerId": logical_id,
                "branchId": physical["branchId"],
                "trainerId": binding[0],
                "trainerConstant": binding[1],
                "partySymbol": binding[2],
                "profile": profile,
                "payout": logical["payout"],
                "members": rendered_members,
            })

    if seen_bindings != set(BINDINGS) or len(records) != 10 or sum(len(row["members"]) for row in records) != 60:
        fail("package does not cover exactly 8 logical / 10 physical / 60 members")
    validate_constants(constant_tokens)
    return sorted(records, key=lambda row: row["trainerId"])


def array_pattern(symbol: str) -> re.Pattern[str]:
    return re.compile(
        rf"^static const struct TrainerMon[A-Za-z]+\s+{re.escape(symbol)}\[\]\s*=\s*\{{.*?^\}};",
        re.MULTILINE | re.DOTALL,
    )


def trainer_pattern(constant: str) -> re.Pattern[str]:
    return re.compile(
        rf"^    \[{re.escape(constant)}\] = \{{.*?^    \}},",
        re.MULTILINE | re.DOTALL,
    )


def render_party(record: dict[str, Any]) -> str:
    lines = [f"static const struct TrainerMonItemCustomMoves {record['partySymbol']}[] = {{"]
    for member in record["members"]:
        lines.extend([
            "    {",
            f"        .iv = {member['rawIv']},",
            f"        .lvl = {member['level']},",
            f"        .species = {member['species']},",
            f"        .heldItem = {member['item']},",
            f"        .moves = {{{', '.join(member['moves'])}}},",
            "    },",
        ])
    lines.append("};")
    return "\n".join(lines)


def render_parties(records: list[dict[str, Any]]) -> str:
    result = upstream_text("src/data/trainer_parties.h")
    for record in records:
        pattern = array_pattern(record["partySymbol"])
        if len(pattern.findall(result)) != 1:
            fail(f"upstream party symbol {record['partySymbol']} is not unique")
        result = pattern.sub(render_party(record), result, count=1)
    return result


def render_trainers(records: list[dict[str, Any]]) -> str:
    result = upstream_text("src/data/trainers.h")
    for record in records:
        pattern = trainer_pattern(record["trainerConstant"])
        matches = pattern.findall(result)
        if len(matches) != 1:
            fail(f"upstream trainer {record['trainerConstant']} is not unique")
        block = matches[0]
        block, ai_count = re.subn(r"(?m)^        \.aiFlags = .*,$", f"        .aiFlags = {UNIVERSAL_AI},", block)
        block, party_count = re.subn(
            r"(?m)^        \.party = .*,$",
            f"        .party = ITEM_CUSTOM_MOVES({record['partySymbol']}),",
            block,
        )
        if ai_count != 1 or party_count != 1:
            fail(f"upstream trainer {record['trainerConstant']} has unexpected layout")
        result = pattern.sub(block, result, count=1)
    return result


def render_header() -> str:
    return """#ifndef GUARD_DEKSA_R2_TRAINERS_H
#define GUARD_DEKSA_R2_TRAINERS_H

u32 DeksaR2_AdjustTrainerPersonality(u16 trainerId, u8 partySlot, u16 species, u32 personality);

#endif // GUARD_DEKSA_R2_TRAINERS_H
"""


def render_helper(records: list[dict[str, Any]]) -> str:
    lines = [
        "// Generated by tools/deksa_rebuild/write_r2_trainers.py. Do not edit.",
        '#include "global.h"',
        '#include "data.h"',
        '#include "deksa_r2_trainers.h"',
        '#include "constants/abilities.h"',
        '#include "constants/opponents.h"',
        '#include "constants/pokemon.h"',
        '#include "constants/species.h"',
        "",
        "struct DeksaR2TrainerPersonality",
        "{",
        "    u16 trainerId;",
        "    u16 species;",
        "    u8 partySlot;",
        "    u8 nature;",
        "    u8 abilityNum;",
        "};",
        "",
        "static const struct DeksaR2TrainerPersonality sR2TrainerPersonalities[] =",
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
        "u32 DeksaR2_AdjustTrainerPersonality(u16 trainerId, u8 partySlot, u16 species, u32 personality)",
        "{",
        "    u32 i;",
        "",
        "    for (i = 0; i < ARRAY_COUNT(sR2TrainerPersonalities); i++)",
        "    {",
        "        const struct DeksaR2TrainerPersonality *metadata = &sR2TrainerPersonalities[i];",
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
    upstream = upstream_text("src/battle_main.c")
    if upstream.count("CreateMon(&party[i], partyData[i].species") != 4:
        fail("upstream CreateNPCTrainerParty shape drifted")
    include_line = '#include "deksa_r2_trainers.h"\n'
    if current.count(include_line) == 0:
        anchor = '#include "decompress.h"\n'
        if current.count(anchor) != 1:
            fail("battle_main include anchor drifted")
        current = current.replace(anchor, anchor + include_line, 1)
    elif current.count(include_line) != 1:
        fail("battle_main helper include is duplicated")

    call_pattern = re.compile(
        r"(?P<indent>[ \t]*)CreateMon\(&party\[i\], partyData\[i\]\.species, partyData\[i\]\.lvl, fixedIV, TRUE, personalityValue, OT_ID_RANDOM_NO_SHINY, 0\);"
    )
    matches = list(call_pattern.finditer(current))
    if len(matches) != 4:
        fail("battle_main must contain exactly four vanilla trainer CreateMon calls")
    helper_line = "personalityValue = DeksaR2_AdjustTrainerPersonality(trainerNum, i, partyData[i].species, personalityValue);"
    if current.count(helper_line) == 0:
        current = call_pattern.sub(
            lambda match: f"{match.group('indent')}{helper_line}\n{match.group('indent')}"
            + match.group(0).lstrip(),
            current,
        )
    elif current.count(helper_line) != 4:
        fail("battle_main trainer personality hook is incomplete or duplicated")

    function_pattern = re.compile(
        r"^static u8 CreateNPCTrainerParty\(struct Pokemon \*party, u16 trainerNum\)\n"
        r".*?(?=^// Unused\nstatic void HBlankCB_Battle)",
        re.MULTILINE | re.DOTALL,
    )
    current_match = function_pattern.search(current)
    upstream_match = function_pattern.search(upstream)
    if current_match is None or upstream_match is None:
        fail("cannot isolate CreateNPCTrainerParty for baseline validation")
    normalized = re.sub(
        rf"(?m)^[ \t]*{re.escape(helper_line)}\n",
        "",
        current_match.group(0),
    )
    if normalized != upstream_match.group(0):
        fail("CreateNPCTrainerParty contains changes outside the minimal R2 hook")
    return current


def verify_oak_untouched(parties: str, trainers: str) -> None:
    base_parties = upstream_text("src/data/trainer_parties.h")
    base_trainers = upstream_text("src/data/trainers.h")
    symbols = (
        "sParty_RivalOaksLabSquirtle",
        "sParty_RivalOaksLabBulbasaur",
        "sParty_RivalOaksLabCharmander",
    )
    for symbol in symbols:
        if array_pattern(symbol).search(parties).group(0) != array_pattern(symbol).search(base_parties).group(0):
            fail(f"Oak party {symbol} changed")
    for constant in OAK_CONSTANTS:
        if trainer_pattern(constant).search(trainers).group(0) != trainer_pattern(constant).search(base_trainers).group(0):
            fail(f"Oak trainer record {constant} changed")


def output_manifest(records: list[dict[str, Any]], outputs: dict[Path, str]) -> str:
    payload = {
        "schemaVersion": 1,
        "writerId": "deksa-clean-rebuild-r2-trainers-v1",
        "baselineCommit": UPSTREAM_COMMIT,
        "materializationId": EXPECTED_MATERIALIZATION,
        "masterSeed": EXPECTED_MASTER_SEED,
        "lotId": "01A",
        "variant": "B",
        "packageId": EXPECTED_PACKAGE_ID,
        "packageDigest": EXPECTED_PACKAGE_DIGEST,
        "route22Policy": "physical-records-kanto-base",
        "regionalStarterOverridesCompiled": 0,
        "logicalTrainers": 8,
        "physicalRecords": 10,
        "compiledPokemon": 60,
        "trainerIds": [row["trainerId"] for row in records],
        "oakLab": {"trainerIds": [326, 327, 328], "policy": "upstream-vanilla-untouched"},
        "mechanics": {
            "ai": "CHECK_BAD_MOVE|TRY_TO_FAINT|CHECK_VIABILITY|HP_AWARE",
            "natureAbility": "pre-CreateMon deterministic personality projection",
            "payout": "outside-R2",
        },
        "inputs": {
            path.relative_to(PROJECT).as_posix(): digest
            for path, digest in EXPECTED_INPUT_SHA256.items()
        },
        "outputs": {
            path.relative_to(ROOT).as_posix(): "sha256:" + sha256_bytes(text.encode())
            for path, text in outputs.items()
        },
    }
    return json.dumps(payload, ensure_ascii=False, indent=2) + "\n"


def desired_outputs() -> dict[Path, str]:
    _, package = load_package()
    records = normalized_members(package)
    outputs = {
        PARTIES: render_parties(records),
        TRAINERS: render_trainers(records),
        HELPER_HEADER: render_header(),
        HELPER_SOURCE: render_helper(records),
    }
    outputs[BATTLE_MAIN] = render_battle_main(BATTLE_MAIN.read_text(encoding="utf-8"))
    verify_oak_untouched(outputs[PARTIES], outputs[TRAINERS])
    outputs[GENERATED_MANIFEST] = output_manifest(records, outputs)
    return outputs


def main() -> int:
    parser = argparse.ArgumentParser()
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--write", action="store_true")
    mode.add_argument("--check", action="store_true")
    args = parser.parse_args()

    outputs = desired_outputs()
    drifted: list[str] = []
    for path, desired in outputs.items():
        current = path.read_text(encoding="utf-8") if path.exists() else None
        if current == desired:
            continue
        if args.check:
            drifted.append(path.relative_to(ROOT).as_posix())
            continue
        if path in (PARTIES, TRAINERS):
            baseline = upstream_text(path.relative_to(ROOT).as_posix())
            if current not in (baseline, None):
                fail(f"refusing to overwrite non-baseline {path.relative_to(ROOT)}")
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(desired, encoding="utf-8")

    if drifted:
        fail("generated outputs drifted: " + ", ".join(drifted))
    action = "verified" if args.check else "written"
    print(f"R2 trainers {action}: 8 logical / 10 physical / 60 Pokemon / Oak vanilla")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
