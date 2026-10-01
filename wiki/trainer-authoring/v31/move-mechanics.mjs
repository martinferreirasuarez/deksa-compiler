// FireRed Gen III mechanics. Runtime authority:
// pokefirered/src/battle_script_commands.c: Cmd_hiddenpowercalc,
// Cmd_friendshiptodamagecalculation and the conditional calculations below.
// pokefirered/src/pokemon.c: CalculateBaseDamage (zero power override fallback).
const HIDDEN_POWER_TYPES = Object.freeze([
  "fighting", "flying", "poison", "ground", "rock", "bug", "ghost", "steel",
  "fire", "water", "grass", "electric", "psychic", "ice", "dragon", "dark",
]);
const SPECIAL_TYPES = new Set(["fire", "water", "grass", "electric", "psychic", "ice", "dragon", "dark"]);
const IV_ORDER = Object.freeze(["hp", "attack", "defense", "speed", "spAttack", "spDefense"]);
const BATTLE_STATE_INPUTS = Object.freeze({
  EFFECT_FLAIL: ["currentHp", "maximumHp"],
  EFFECT_ERUPTION: ["currentHp", "maximumHp"],
  EFFECT_LOW_KICK: ["targetWeight"],
  EFFECT_PRESENT: ["randomOutcome"],
  EFFECT_MAGNITUDE: ["randomOutcome"],
  EFFECT_ROLLOUT: ["consecutiveTurn", "defenseCurl"],
  EFFECT_FURY_CUTTER: ["consecutiveHits"],
  EFFECT_WEATHER_BALL: ["weather", "weatherSuppressed"],
});

function integerInRange(value, maximum, field) {
  if (!Number.isInteger(value) || value < 0 || value > maximum) {
    throw new Error(`Move mechanics: ${field} requires an explicit integer from 0 to ${maximum}.`);
  }
  return value;
}

function ivVector(iv) {
  // Values are actual per-stat IVs (0..31), not the trainer party's encoded byte.
  if (typeof iv === "number") return IV_ORDER.map(() => integerInRange(iv, 31, "iv"));
  if (iv === null || typeof iv !== "object") {
    throw new Error("Move mechanics: Hidden Power requires explicit iv (0..31 or a complete IV vector).");
  }
  if (Array.isArray(iv) && iv.length !== IV_ORDER.length) {
    throw new Error("Move mechanics: the IV vector must contain exactly six values in hp/attack/defense/speed/spAttack/spDefense order.");
  }
  return IV_ORDER.map((stat, index) => integerInRange(Array.isArray(iv) ? iv[index] : iv[stat], 31, `iv.${stat}`));
}

/**
 * Resolve authored move metadata without changing the caller's object.
 * Friendship must come from the effective NPC construction, not a set author's
 * preferred value: current CreateNPCTrainerParty -> CreateMon initializes the
 * species' base friendship and does not override it for Return/Frustration.
 * Battle-state-dependent power remains null; catalogPower is only provenance.
 * Ordinary moves retain their catalog base power, not a simulated damage value.
 */
export function resolveMoveMechanics(move, { iv, friendship } = {}) {
  if (move === null || typeof move !== "object" || Array.isArray(move)) {
    throw new Error("Move mechanics: move metadata is required.");
  }
  const catalogPower = move.mechanics?.catalogPower ?? move.power;
  if (move.effect === "EFFECT_HIDDEN_POWER") {
    const values = ivVector(iv);
    const typeBits = values.reduce((sum, value, index) => sum + (value & 1) * 2 ** index, 0);
    const powerBits = values.reduce((sum, value, index) => sum + ((value >> 1) & 1) * 2 ** index, 0);
    const type = HIDDEN_POWER_TYPES[Math.floor(15 * typeBits / 63)];
    return {
      ...move, type, power: Math.floor(40 * powerBits / 63) + 30,
      damageClass: SPECIAL_TYPES.has(type) ? "special" : "physical",
      mechanics: { kind: "iv-derived", resolved: true, requiredInputs: ["iv"], catalogPower, iv: [...values] },
    };
  }
  if (["EFFECT_RETURN", "EFFECT_FRUSTRATION"].includes(move.effect)) {
    integerInRange(friendship, 255, "friendship");
    const dynamicBasePower = Math.floor(10 * (move.effect === "EFFECT_RETURN" ? friendship : 255 - friendship) / 25);
    // Zero causes CalculateBaseDamage to use the runtime table's power 1.
    return {
      ...move, type: "normal", power: Math.max(1, dynamicBasePower), damageClass: "physical",
      mechanics: { kind: "friendship-derived", resolved: true, requiredInputs: ["friendship"],
        catalogPower, friendship, dynamicBasePower },
    };
  }
  const requiredInputs = BATTLE_STATE_INPUTS[move.effect];
  if (requiredInputs) {
    return {
      ...move, power: null,
      ...(move.effect === "EFFECT_WEATHER_BALL" ? { type: null, damageClass: null } : {}),
      mechanics: { kind: "battle-state-dependent", resolved: false, requiredInputs: [...requiredInputs],
        catalogPower, warning: "Effective properties require battle state; catalog values are not a resolved power/type." },
    };
  }
  return { ...move, mechanics: { kind: "static", resolved: true, requiredInputs: [], catalogPower } };
}
