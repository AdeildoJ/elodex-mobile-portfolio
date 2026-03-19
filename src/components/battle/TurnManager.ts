import { computeDamage } from "./DamageCalculator";
import { ptBR } from "../../battle/i18n/ptBR";
import { canHitSemiInvulnerableTarget, fallbackStatusFromMove } from "./moveRules";
import type {
  BattleAction,
  BattleFieldState,
  BattleMoveEffect,
  BattleMonster,
  BattleMove,
  BattleResolution,
  BattleSide,
  BattleTeam,
  BattleTurnEvent,
  BattleWeather,
} from "./types";

const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

const randomBetween = (min: number, max: number) => Math.min(min, max) + Math.floor(Math.random() * (Math.abs(max - min) + 1));

const prettyMove = (name: string) =>
  String(name || "")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());

function aliveIndex(team: BattleTeam) {
  return team.findIndex((m) => m.hpCurrent > 0);
}

function anyAlive(team: BattleTeam) {
  return team.some((m) => m.hpCurrent > 0);
}

function cloneTeam(team: BattleTeam) {
  return team.map((m) => ({
    ...m,
    hpTotal: Math.max(1, n(m.hpTotal)),
    hpCurrent: Math.max(0, Math.min(Math.max(1, n(m.hpTotal)), n(m.hpCurrent))),
    moves: (Array.isArray(m.moves) ? m.moves : []).map((mv) => ({
      ...mv,
      pp: Math.max(0, n(mv.pp)),
      ppMax: Math.max(1, n(mv.ppMax || mv.pp)),
      power: Math.max(0, n(mv.power)),
      accuracy: Math.max(1, Math.min(100, n(mv.accuracy || 100))),
      priority: n(mv.priority),
      critStage: n(mv.critStage),
    })),
    sprite: { ...m.sprite },
    stats: {
      hp: Math.max(1, n(m.stats?.hp ?? m.hpTotal)),
      atk: Math.max(1, n(m.stats?.atk)),
      def: Math.max(1, n(m.stats?.def)),
      spa: Math.max(1, n(m.stats?.spa)),
      spd: Math.max(1, n(m.stats?.spd)),
      spe: Math.max(1, n(m.stats?.spe)),
    },
    types: [...m.types],
    status: (m.status ?? "none"),
    statusTurns: Math.max(0, n(m.statusTurns ?? 0)),
    badPoisonCounter: Math.max(0, n(m.badPoisonCounter ?? 0)),
    accuracyStage: Math.max(-6, Math.min(6, n(m.accuracyStage ?? 0))),
    evasionStage: Math.max(-6, Math.min(6, n(m.evasionStage ?? 0))),
    atkStage: Math.max(-6, Math.min(6, n(m.atkStage ?? 0))),
    defStage: Math.max(-6, Math.min(6, n(m.defStage ?? 0))),
    spaStage: Math.max(-6, Math.min(6, n(m.spaStage ?? 0))),
    spdStage: Math.max(-6, Math.min(6, n(m.spdStage ?? 0))),
    speStage: Math.max(-6, Math.min(6, n(m.speStage ?? 0))),
    flinched: false,
    protected: false,
    protectMoveId: (m.protectMoveId ? String(m.protectMoveId) : null) as string | null,
    protectStreak: Math.max(0, n(m.protectStreak ?? 0)),
    chargingMoveId: m.chargingMoveId ? String(m.chargingMoveId) : null,
    volatileStatuses: Array.isArray(m.volatileStatuses) ? m.volatileStatuses.map((status) => ({ ...status })) : [],
  }));
}

function ensureHasMoves(mon: BattleMonster) {
  if (Array.isArray(mon.moves) && mon.moves.length > 0) return;
  mon.moves = [
    {
      id: "struggle",
      name: "Struggle",
      type: "normal",
      power: 50,
      accuracy: 100,
      pp: 1,
      ppMax: 1,
      category: "physical",
      priority: 0,
      critStage: 0,
    },
  ];
}

function resolveCommittedMove(mon: BattleMonster, requestedIndex: number) {
  const chargedId = String(mon.chargingMoveId || "").trim().toLowerCase();
  if (chargedId) {
    const chargedIndex = mon.moves.findIndex((mv) => String(mv.id || "").trim().toLowerCase() === chargedId && mv.pp > 0);
    if (chargedIndex >= 0) {
      return { move: mon.moves[chargedIndex], moveIndex: chargedIndex, lockedByCharge: true };
    }
  }
  const safeIndex = requestedIndex >= 0 && requestedIndex < mon.moves.length ? requestedIndex : 0;
  return { move: mon.moves[safeIndex] || mon.moves[0], moveIndex: safeIndex, lockedByCharge: false };
}

function speedOrder(playerMove: BattleMove, enemyMove: BattleMove, player: BattleMonster, enemy: BattleMonster): BattleSide[] {
  if (playerMove.priority !== enemyMove.priority) return playerMove.priority > enemyMove.priority ? ["player", "enemy"] : ["enemy", "player"];
  const playerSpeed = effectiveSpeed(player);
  const enemySpeed = effectiveSpeed(enemy);
  if (playerSpeed !== enemySpeed) return playerSpeed > enemySpeed ? ["player", "enemy"] : ["enemy", "player"];
  return Math.random() < 0.5 ? ["player", "enemy"] : ["enemy", "player"];
}

function weatherStartText(weather: BattleWeather): string {
  if (weather === "sun") return ptBR.climaSol();
  if (weather === "rain") return ptBR.climaChuva();
  if (weather === "sandstorm") return ptBR.climaAreia();
  if (weather === "hail") return ptBR.climaGranizo();
  if (weather === "snow") return ptBR.climaNeve();
  return ptBR.climaPassou();
}

function immuneToWeatherChip(mon: BattleMonster, weather: BattleWeather) {
  const types = Array.isArray(mon.types) ? mon.types.map((t) => String(t || "").toLowerCase()) : [];
  if (weather === "sandstorm") {
    return types.includes("rock") || types.includes("ground") || types.includes("steel");
  }
  if (weather === "hail") {
    return types.includes("ice");
  }
  return true;
}

function normalizedItemId(mon: BattleMonster) {
  return String(mon.heldItemId || "").trim().toLowerCase();
}

function isPoisonType(mon: BattleMonster) {
  return (mon.types || []).map((t) => String(t || "").toLowerCase()).includes("poison");
}

function stageMultiplier(stage: number) {
  const s = Math.max(-6, Math.min(6, Math.trunc(Number(stage || 0))));
  if (s >= 0) return (s + 3) / 3;
  return 3 / (3 - s);
}

function effectiveSpeed(mon: BattleMonster) {
  const base = Math.max(1, n(mon.stats?.spe));
  const staged = base * stageMultiplier(mon.speStage ?? 0);
  const para = mon.status === "paralyze" ? 0.5 : 1;
  return Math.max(1, Math.floor(staged * para));
}

function effectiveAccuracyModifier(attacker: BattleMonster, defender: BattleMonster) {
  const atkAcc = stageMultiplier(attacker.accuracyStage ?? 0);
  const defEva = stageMultiplier(defender.evasionStage ?? 0);
  return atkAcc / defEva;
}

function canInflictStatus(moveId: string, defender: BattleMonster, status: NonNullable<BattleMonster["status"]>) {
  const types = (defender.types || []).map((t) => String(t || "").toLowerCase());
  const id = String(moveId || "").trim().toLowerCase();
  if (defender.status && defender.status !== "none") return false;
  if (status === "burn" && types.includes("fire")) return false;
  if ((status === "poison" || status === "bad-poison") && (types.includes("steel") || types.includes("poison"))) return false;
  if (status === "paralyze" && id === "thunder-wave" && types.includes("ground")) return false;
  return true;
}

function applyStageMove(moveId: string, attacker: BattleMonster, defender: BattleMonster) {
  const id = String(moveId || "").trim().toLowerCase();
  if (id === "sand-attack" || id === "mud-slap" || id === "flash" || id === "smokescreen" || id === "kinesis") {
    defender.accuracyStage = Math.max(-6, Math.min(6, n(defender.accuracyStage ?? 0) - 1));
    return `${defender.name} perdeu precisao!`;
  }
  if (id === "double-team") {
    attacker.evasionStage = Math.max(-6, Math.min(6, n(attacker.evasionStage ?? 0) + 1));
    return `${attacker.name} aumentou evasao!`;
  }
  if (id === "minimize") {
    attacker.evasionStage = Math.max(-6, Math.min(6, n(attacker.evasionStage ?? 0) + 2));
    return `${attacker.name} aumentou muito a evasao!`;
  }
  return null;
}

function flinchChanceFromMove(move: BattleMove) {
  const fromData = n(move.flinchChance);
  if (fromData > 0) return Math.max(0, Math.min(1, fromData / 100));
  const id = String(move.id || "").trim().toLowerCase();
  if (id === "air-slash" || id === "waterfall" || id === "rock-slide") return 0.3;
  if (id === "bite" || id === "headbutt" || id === "stomp" || id === "astonish") return 0.3;
  return 0;
}

function getMoveEffects(move: BattleMove, kind?: BattleMoveEffect["kind"]) {
  const effects = Array.isArray(move.effects) ? move.effects : [];
  return kind ? effects.filter((effect) => effect.kind === kind) : effects;
}

function getChargeExecution(move: BattleMove) {
  const chargeTurns = n(move.execution?.chargeTurns);
  if (chargeTurns <= 1) return null;
  return move.execution ?? null;
}

function shouldSkipCharge(move: BattleMove, weather: BattleWeather) {
  const allowed = Array.isArray(move.execution?.skipChargeInWeather) ? move.execution?.skipChargeInWeather : [];
  return allowed.includes(weather);
}

function getMultiHitCount(move: BattleMove) {
  const minHits = n(move.execution?.multiHit?.minHits);
  const maxHits = n(move.execution?.multiHit?.maxHits);
  if (minHits > 0 && maxHits >= minHits) {
    return minHits === maxHits ? minHits : randomBetween(minHits, maxHits);
  }
  return 1;
}

function isSemiInvulnerableMove(move: BattleMove | null | undefined) {
  return !!move?.execution?.semiInvulnerablePhase;
}

function statusFromEffectStatus(status: string | null | undefined): BattleMonster["status"] | null {
  const value = String(status || "").trim().toLowerCase();
  if (!value) return null;
  if (value === "paralysis") return "paralyze";
  if (value === "burn" || value === "poison" || value === "bad-poison" || value === "sleep" || value === "freeze") return value;
  return null;
}

function findVolatile(mon: BattleMonster, id: string) {
  const key = String(id || "").trim().toLowerCase();
  return (mon.volatileStatuses || []).find((status) => String(status.id || "").trim().toLowerCase() === key) ?? null;
}

function setVolatile(mon: BattleMonster, id: string, turns?: number, sourceMoveId?: string) {
  const key = String(id || "").trim().toLowerCase();
  mon.volatileStatuses = Array.isArray(mon.volatileStatuses) ? mon.volatileStatuses.filter((status) => String(status.id || "").trim().toLowerCase() !== key) : [];
  mon.volatileStatuses.push({ id: key, turns, sourceMoveId: sourceMoveId || null });
}

function clearVolatile(mon: BattleMonster, id: string) {
  const key = String(id || "").trim().toLowerCase();
  mon.volatileStatuses = Array.isArray(mon.volatileStatuses) ? mon.volatileStatuses.filter((status) => String(status.id || "").trim().toLowerCase() !== key) : [];
}

function applyVolatileStatus(events: BattleTurnEvent[], move: BattleMove, target: BattleMonster, status: string) {
  const id = String(status || "").trim().toLowerCase();
  if (!id) return false;
  if (id === "trap") {
    setVolatile(target, id, randomBetween(2, 5), move.id);
    events.push({ type: "message", text: `${target.name} ficou preso!` });
    return true;
  }
  if (id === "yawn") {
    setVolatile(target, id, 2, move.id);
    events.push({ type: "message", text: `${target.name} ficou sonolento!` });
    return true;
  }
  if (id === "confusion") {
    setVolatile(target, id, randomBetween(2, 5), move.id);
    events.push({ type: "message", text: `${target.name} ficou confuso!` });
    return true;
  }
  if (id === "infatuation") {
    setVolatile(target, id, undefined, move.id);
    events.push({ type: "message", text: `${target.name} ficou apaixonado!` });
    return true;
  }
  return false;
}

function getReflectTurns(fieldState: BattleFieldState, side: BattleSide) {
  return side === "player" ? n(fieldState.playerReflectTurns) : n(fieldState.enemyReflectTurns);
}

function getLightScreenTurns(fieldState: BattleFieldState, side: BattleSide) {
  return side === "player" ? n(fieldState.playerLightScreenTurns) : n(fieldState.enemyLightScreenTurns);
}

function setReflectTurns(fieldState: BattleFieldState, side: BattleSide, turns: number) {
  if (side === "player") fieldState.playerReflectTurns = Math.max(0, turns);
  else fieldState.enemyReflectTurns = Math.max(0, turns);
}

function setLightScreenTurns(fieldState: BattleFieldState, side: BattleSide, turns: number) {
  if (side === "player") fieldState.playerLightScreenTurns = Math.max(0, turns);
  else fieldState.enemyLightScreenTurns = Math.max(0, turns);
}

function addSpikesLayer(fieldState: BattleFieldState, side: BattleSide) {
  if (side === "player") fieldState.playerSpikesLayers = Math.max(0, Math.min(3, n(fieldState.playerSpikesLayers) + 1));
  else fieldState.enemySpikesLayers = Math.max(0, Math.min(3, n(fieldState.enemySpikesLayers) + 1));
}

function setStealthRock(fieldState: BattleFieldState, side: BattleSide, value: boolean) {
  if (side === "player") fieldState.playerStealthRock = value;
  else fieldState.enemyStealthRock = value;
}

function statusFromAilment(ailment: string | null | undefined): BattleMonster["status"] | null {
  const a = String(ailment || "").trim().toLowerCase();
  if (!a) return null;
  if (a === "burn") return "burn";
  if (a === "poison") return "poison";
  if (a === "bad-poison") return "bad-poison";
  if (a === "paralysis") return "paralyze";
  if (a === "sleep") return "sleep";
  if (a === "freeze") return "freeze";
  return null;
}

function applyStageDelta(mon: BattleMonster, stat: string, delta: number): boolean {
  const d = Math.trunc(Number(delta || 0));
  if (!d) return false;
  const s = String(stat || "").trim().toLowerCase();
  const clampStage = (v: number) => Math.max(-6, Math.min(6, v));
  if (s === "attack") {
    mon.atkStage = clampStage(n(mon.atkStage ?? 0) + d);
    return true;
  }
  if (s === "defense") {
    mon.defStage = clampStage(n(mon.defStage ?? 0) + d);
    return true;
  }
  if (s === "special-attack") {
    mon.spaStage = clampStage(n(mon.spaStage ?? 0) + d);
    return true;
  }
  if (s === "special-defense") {
    mon.spdStage = clampStage(n(mon.spdStage ?? 0) + d);
    return true;
  }
  if (s === "speed") {
    mon.speStage = clampStage(n(mon.speStage ?? 0) + d);
    return true;
  }
  if (s === "accuracy") {
    mon.accuracyStage = clampStage(n(mon.accuracyStage ?? 0) + d);
    return true;
  }
  if (s === "evasion") {
    mon.evasionStage = clampStage(n(mon.evasionStage ?? 0) + d);
    return true;
  }
  return false;
}

function applyStatusWithMessage(
  events: BattleTurnEvent[],
  side: BattleSide,
  moveId: string,
  target: BattleMonster,
  status: NonNullable<BattleMonster["status"]>
) {
  if (!canInflictStatus(moveId, target, status)) return false;
  target.status = status;
  target.badPoisonCounter = status === "bad-poison" ? 1 : 0;
  if (status === "sleep") target.statusTurns = randomBetween(1, 2);
  events.push({ type: "status", side, status });
  if (status === "burn") events.push({ type: "message", text: ptBR.ficouQueimado(target.name) });
  if (status === "poison" || status === "bad-poison") events.push({ type: "message", text: ptBR.ficouEnvenenado(target.name) });
  if (status === "paralyze") events.push({ type: "message", text: ptBR.ficouParalisado(target.name) });
  if (status === "sleep") events.push({ type: "message", text: ptBR.adormeceu(target.name) });
  if (status === "freeze") events.push({ type: "message", text: ptBR.congelado(target.name) });
  return true;
}

function effectiveMonForMove(mon: BattleMonster): BattleMonster {
  return {
    ...mon,
    stats: {
      ...mon.stats,
      atk: Math.max(1, Math.floor(n(mon.stats.atk) * stageMultiplier(mon.atkStage ?? 0))),
      def: Math.max(1, Math.floor(n(mon.stats.def) * stageMultiplier(mon.defStage ?? 0))),
      spa: Math.max(1, Math.floor(n(mon.stats.spa) * stageMultiplier(mon.spaStage ?? 0))),
      spd: Math.max(1, Math.floor(n(mon.stats.spd) * stageMultiplier(mon.spdStage ?? 0))),
      spe: effectiveSpeed(mon),
    },
  };
}

export function resolveTurn(args: {
  playerTeam: BattleTeam;
  enemyTeam: BattleTeam;
  playerActive: number;
  enemyActive: number;
  playerAction: BattleAction;
  enemyAction: BattleAction;
  canRun: boolean;
  isForcedPlayerSwitch?: boolean;
  typeMultiplier: (moveType: string, defenderSpeciesId: number) => number;
  fieldState?: BattleFieldState;
}): BattleResolution {
  const events: BattleTurnEvent[] = [];
  let playerAction = args.playerAction;
  let playerActionBlocked = false;
  const playerTeam = cloneTeam(args.playerTeam);
  const enemyTeam = cloneTeam(args.enemyTeam);
  playerTeam.forEach((m) => {
    m.protected = false;
    m.protectMoveId = null;
    m.flinched = false;
  });
  enemyTeam.forEach((m) => {
    m.protected = false;
    m.protectMoveId = null;
    m.flinched = false;
  });
  let playerActive = args.playerActive;
  let enemyActive = args.enemyActive;
  const fieldState: BattleFieldState = {
    weather: args.fieldState?.weather || "none",
    weatherTurns: Math.max(0, n(args.fieldState?.weatherTurns || 0)),
    playerReflectTurns: Math.max(0, n(args.fieldState?.playerReflectTurns || 0)),
    enemyReflectTurns: Math.max(0, n(args.fieldState?.enemyReflectTurns || 0)),
    playerLightScreenTurns: Math.max(0, n(args.fieldState?.playerLightScreenTurns || 0)),
    enemyLightScreenTurns: Math.max(0, n(args.fieldState?.enemyLightScreenTurns || 0)),
    playerSpikesLayers: Math.max(0, Math.min(3, n(args.fieldState?.playerSpikesLayers || 0))),
    enemySpikesLayers: Math.max(0, Math.min(3, n(args.fieldState?.enemySpikesLayers || 0))),
    playerStealthRock: Boolean(args.fieldState?.playerStealthRock),
    enemyStealthRock: Boolean(args.fieldState?.enemyStealthRock),
  };

  const applyEntryHazards = (side: BattleSide, mon: BattleMonster | undefined) => {
    if (!mon || mon.hpCurrent <= 0) return;
    const spikesLayers = side === "player" ? n(fieldState.playerSpikesLayers) : n(fieldState.enemySpikesLayers);
    const hasStealthRock = side === "player" ? !!fieldState.playerStealthRock : !!fieldState.enemyStealthRock;
    let total = 0;
    if (spikesLayers > 0) {
      const grounded = !(mon.types || []).map((t) => String(t || "").toLowerCase()).includes("flying");
      if (grounded) {
        const frac = spikesLayers >= 3 ? 0.25 : spikesLayers === 2 ? 1 / 6 : 1 / 8;
        total += Math.max(1, Math.floor(mon.hpTotal * frac));
      }
    }
    if (hasStealthRock) {
      const eff = Math.max(0, args.typeMultiplier("rock", mon.speciesId));
      total += Math.max(1, Math.floor((mon.hpTotal / 8) * eff));
    }
    if (total <= 0) return;
    mon.hpCurrent = Math.max(0, mon.hpCurrent - total);
    events.push({ type: "message", text: ptBR.danoArmadilhas(mon.name) });
    events.push({ type: "hp", side, hpCurrent: mon.hpCurrent, hpTotal: mon.hpTotal });
    if (mon.hpCurrent <= 0) {
      events.push({ type: "faint", side, text: ptBR.desmaiou(mon.name) });
    }
  };

  const activePlayer = playerTeam[playerActive];
  const activeEnemy = enemyTeam[enemyActive];
  if (activePlayer) ensureHasMoves(activePlayer);
  if (activeEnemy) ensureHasMoves(activeEnemy);
  if (!activePlayer || !activeEnemy) {
    return { events: [{ type: "end", text: ptBR.interrompida() }], playerTeam, enemyTeam, playerActive, enemyActive, fieldState, result: "defeat" };
  }

  if (args.playerAction.type === "run") {
    if (findVolatile(activePlayer, "trap")) {
      events.push({ type: "message", text: `${activePlayer.name} nao conseguiu fugir!` });
      playerActionBlocked = true;
    } else if (args.canRun) {
      events.push({ type: "message", text: ptBR.fugiu() });
      return { events, playerTeam, enemyTeam, playerActive, enemyActive, fieldState, result: "ran" };
    }
    events.push({ type: "message", text: ptBR.naoPodeFugir() });
  }

  if (args.playerAction.type === "switch") {
    if (findVolatile(playerTeam[playerActive], "trap")) {
      events.push({ type: "message", text: `${playerTeam[playerActive].name} esta preso e nao pode trocar!` });
      playerActionBlocked = true;
    } else {
      const next = playerTeam[args.playerAction.targetIndex];
      if (next && next.hpCurrent > 0 && args.playerAction.targetIndex !== playerActive) {
        const oldName = playerTeam[playerActive].name;
        const oldMon = playerTeam[playerActive];
        if (oldMon && oldMon.status === "bad-poison") oldMon.badPoisonCounter = 0;
        playerActive = args.playerAction.targetIndex;
        events.push({ type: "switch", side: "player", text: ptBR.voltou(oldName) });
        events.push({ type: "switch", side: "player", text: ptBR.vai(playerTeam[playerActive].name), activeIndex: playerActive });
        applyEntryHazards("player", playerTeam[playerActive]);
        if (args.isForcedPlayerSwitch) {
          return { events, playerTeam, enemyTeam, playerActive, enemyActive, fieldState, result: "ongoing" };
        }
      }
    }
  }

  const enemyNow = enemyTeam[enemyActive];
  const playerNow = playerTeam[playerActive];
  if (!enemyNow || !playerNow || enemyNow.hpCurrent <= 0 || playerNow.hpCurrent <= 0) {
    return { events, playerTeam, enemyTeam, playerActive, enemyActive, fieldState, result: "ongoing" };
  }

  const requestedPlayerMoveIndex = playerAction.type === "fight" ? playerAction.moveIndex : 0;
  const enemyMoveIndexPool = enemyNow.moves.map((mv, idx) => ({ idx, pp: mv.pp })).filter((mv) => mv.pp > 0);
  const enemyDamageMovePool = enemyMoveIndexPool.filter((x) => {
    const mv = enemyNow.moves[x.idx];
    return mv && mv.power > 0 && mv.category !== "status";
  });
  const requestedEnemyIndex = args.enemyAction.type === "fight" ? args.enemyAction.moveIndex : -1;
  const requestedEnemyValid = enemyMoveIndexPool.some((m) => m.idx === requestedEnemyIndex);
  const enemyMoveIndex = requestedEnemyValid
    ? requestedEnemyIndex
    : enemyDamageMovePool.length
    ? enemyDamageMovePool[randomBetween(0, enemyDamageMovePool.length - 1)].idx
    : enemyMoveIndexPool.length
    ? enemyMoveIndexPool[randomBetween(0, enemyMoveIndexPool.length - 1)].idx
    : 0;
  const committedPlayer = resolveCommittedMove(playerNow, requestedPlayerMoveIndex);
  const committedEnemy = resolveCommittedMove(enemyNow, enemyMoveIndex);
  const playerMoveIndex = committedPlayer.moveIndex;
  const playerMove = committedPlayer.move;
  const enemyMove = committedEnemy.move;

  if (!playerMove || !enemyMove) {
    return { events, playerTeam, enemyTeam, playerActive, enemyActive, fieldState, result: "ongoing" };
  }

  const order = speedOrder(playerMove, enemyMove, playerNow, enemyNow);

  const runAttack = (side: BattleSide, defenderCanAct: boolean) => {
    const isPlayer = side === "player";
    const attackerTeam = isPlayer ? playerTeam : enemyTeam;
    const defenderTeam = isPlayer ? enemyTeam : playerTeam;
    const attackerIndex = isPlayer ? playerActive : enemyActive;
    const defenderIndex = isPlayer ? enemyActive : playerActive;
    const attacker = attackerTeam[attackerIndex];
    const defender = defenderTeam[defenderIndex];
    const moveIndex = isPlayer ? playerMoveIndex : enemyMoveIndex;
    const selectedMove = attacker?.moves[moveIndex];
    if (!attacker || !defender || !selectedMove || attacker.hpCurrent <= 0 || defender.hpCurrent <= 0) return;

    let move = selectedMove;
    const chargedId = attacker.chargingMoveId ? String(attacker.chargingMoveId).toLowerCase() : "";
    if (chargedId) {
      const chargedMove = attacker.moves.find((mv) => String(mv.id || "").toLowerCase() === chargedId && mv.pp > 0);
      if (chargedMove) {
        move = chargedMove;
      } else {
        attacker.chargingMoveId = null;
      }
    }
    if (move.pp <= 0) return;

    if (attacker.flinched) {
      attacker.flinched = false;
      events.push({ type: "message", text: ptBR.recuou(attacker.name) });
      return;
    }

    if (attacker.status === "sleep") {
      const turns = Math.max(0, n(attacker.statusTurns ?? 0));
      if (turns > 0) {
        attacker.statusTurns = turns - 1;
        events.push({ type: "message", text: ptBR.estaDormindo(attacker.name) });
        if (attacker.statusTurns <= 0) {
          attacker.status = "none";
          attacker.badPoisonCounter = 0;
          events.push({ type: "status", side, status: "none" });
          events.push({ type: "message", text: ptBR.acordou(attacker.name) });
        }
        return;
      }
      attacker.status = "none";
      attacker.badPoisonCounter = 0;
      events.push({ type: "status", side, status: "none" });
      events.push({ type: "message", text: ptBR.acordou(attacker.name) });
    }

    if (attacker.status === "freeze") {
      if (Math.random() < 0.2 || move.type === "fire") {
        attacker.status = "none";
        attacker.badPoisonCounter = 0;
        events.push({ type: "status", side, status: "none" });
        events.push({ type: "message", text: ptBR.descongelou(attacker.name) });
      } else {
        events.push({ type: "message", text: ptBR.estaCongelado(attacker.name) });
        return;
      }
    }

    if (attacker.status === "paralyze" && Math.random() < 0.25) {
      events.push({ type: "message", text: ptBR.paralisiaTravou(attacker.name) });
      return;
    }

    const confusion = findVolatile(attacker, "confusion");
    if (confusion) {
      events.push({ type: "message", text: `${attacker.name} esta confuso!` });
      const turnsLeft = Math.max(0, n(confusion.turns ?? 0) - 1);
      if (Math.random() < 1 / 3) {
        const chip = Math.max(1, Math.floor(attacker.hpTotal / 8));
        attacker.hpCurrent = Math.max(0, attacker.hpCurrent - chip);
        events.push({ type: "message", text: `${attacker.name} se machucou na confusao!` });
        events.push({ type: "hp", side, hpCurrent: attacker.hpCurrent, hpTotal: attacker.hpTotal });
        if (turnsLeft <= 0) clearVolatile(attacker, "confusion");
        else setVolatile(attacker, "confusion", turnsLeft, confusion.sourceMoveId || undefined);
        if (attacker.hpCurrent <= 0) events.push({ type: "faint", side, text: ptBR.desmaiou(attacker.name) });
        return;
      }
      if (turnsLeft <= 0) {
        clearVolatile(attacker, "confusion");
        events.push({ type: "message", text: `${attacker.name} saiu da confusao!` });
      } else {
        setVolatile(attacker, "confusion", turnsLeft, confusion.sourceMoveId || undefined);
      }
    }

    if (findVolatile(attacker, "infatuation") && Math.random() < 0.5) {
      events.push({ type: "message", text: `${attacker.name} esta apaixonado demais para atacar!` });
      return;
    }

    const protectEffect = getMoveEffects(move, "protect")[0];
    const protectLike = !!protectEffect;

    const chargingNow = attacker.chargingMoveId && String(attacker.chargingMoveId).toLowerCase() === String(move.id || "").toLowerCase();
    if (!chargingNow && !protectLike) attacker.protectStreak = 0;

    const chargeExecution = getChargeExecution(move);
    const needsCharge = !!chargeExecution && !shouldSkipCharge(move, fieldState.weather);
    if (!chargingNow && needsCharge) {
      move.pp = Math.max(0, move.pp - 1);
      attacker.chargingMoveId = String(move.id || "").toLowerCase();
      events.push({
        type: "attack",
        side,
        text: ptBR.usouGolpe(attacker.name, prettyMove(move.name || move.id)),
        moveId: move.id,
        moveStage: "charge",
        semiInvulnerablePhase: move.execution?.semiInvulnerablePhase || null,
      });
      events.push({ type: "message", text: ptBR.carregandoGolpe(attacker.name) });
      return;
    }
    attacker.chargingMoveId = null;

    move.pp = Math.max(0, move.pp - 1);
    events.push({
      type: "attack",
      side,
      text: ptBR.usouGolpe(attacker.name, prettyMove(move.name || move.id)),
      moveId: move.id,
      moveStage: chargingNow ? "execute" : undefined,
      semiInvulnerablePhase: chargingNow ? move.execution?.semiInvulnerablePhase || null : null,
    });
    const weatherEffect = getMoveEffects(move, "weather")[0];
    if (weatherEffect?.kind === "weather") {
      fieldState.weather = weatherEffect.weather;
      fieldState.weatherTurns = Math.max(1, n(weatherEffect.turns));
      events.push({
        type: "weather",
        text: weatherStartText(weatherEffect.weather),
        weather: weatherEffect.weather,
        weatherTurns: fieldState.weatherTurns,
      });
      return;
    }

    const sideConditionEffects = getMoveEffects(move, "sideCondition");
    if (sideConditionEffects.length > 0) {
      for (const effect of sideConditionEffects) {
        if (effect.kind !== "sideCondition") continue;
        const targetSide: BattleSide =
          effect.target === "user-side" ? side : isPlayer ? "enemy" : "player";
        if (effect.condition === "reflect") {
          setReflectTurns(fieldState, targetSide, Math.max(1, n(effect.turns)));
          events.push({ type: "message", text: ptBR.criouReflect(attacker.name) });
          return;
        }
        if (effect.condition === "light-screen") {
          setLightScreenTurns(fieldState, targetSide, Math.max(1, n(effect.turns)));
          events.push({ type: "message", text: ptBR.criouLightScreen(attacker.name) });
          return;
        }
        if (effect.condition === "spikes") {
          const before = targetSide === "player" ? n(fieldState.playerSpikesLayers) : n(fieldState.enemySpikesLayers);
          addSpikesLayer(fieldState, targetSide);
          const after = targetSide === "player" ? n(fieldState.playerSpikesLayers) : n(fieldState.enemySpikesLayers);
          if (after > before) events.push({ type: "message", text: ptBR.spikesEspalhados() });
          else events.push({ type: "message", text: ptBR.spikesCheio() });
          return;
        }
        if (effect.condition === "stealth-rock") {
          const already = targetSide === "player" ? !!fieldState.playerStealthRock : !!fieldState.enemyStealthRock;
          if (!already) {
            setStealthRock(fieldState, targetSide, true);
            events.push({ type: "message", text: ptBR.stealthRockAtivo() });
          } else {
            events.push({ type: "message", text: ptBR.stealthRockJaAtivo() });
          }
          return;
        }
      }
    }

    if (protectLike) {
      const streak = Math.max(0, n(attacker.protectStreak ?? 0));
      const successChance = streak <= 0 ? 1 : Math.pow(1 / 3, streak);
      if (Math.random() > successChance) {
        attacker.protectStreak = 0;
        events.push({ type: "message", text: ptBR.falhou() });
        return;
      }
      attacker.protected = true;
      attacker.protectMoveId = protectEffect.kind === "protect" ? protectEffect.protectType : String(move.id || "").trim().toLowerCase();
      attacker.protectStreak = streak + 1;
      events.push({ type: "message", text: ptBR.protegeu(attacker.name) });
      return;
    }

    const defenderChargeId = String(defender.chargingMoveId || "").trim().toLowerCase();
    const defenderChargeMove = defender.moves.find((mv) => String(mv.id || "").trim().toLowerCase() === defenderChargeId);
    if (
      defenderChargeId &&
      isSemiInvulnerableMove(defenderChargeMove) &&
      !canHitSemiInvulnerableTarget(move.id, defenderChargeId)
    ) {
      events.push({ type: "message", text: ptBR.falhou() });
      return;
    }

    const stagedAttacker = effectiveMonForMove(attacker);
    const stagedDefender = effectiveMonForMove(defender);
    const damage = computeDamage({
      attacker: stagedAttacker,
      defender: stagedDefender,
      move,
      typeMultiplier: args.typeMultiplier(move.type, defender.speciesId),
      weather: fieldState.weather,
      accuracyModifier: effectiveAccuracyModifier(attacker, defender),
    });

    if (damage.missed) {
      events.push({ type: "message", text: ptBR.falhou() });
      return;
    }

    if (defender.protected && move.category !== "status") {
      events.push({ type: "message", text: ptBR.protegido() });
      const protectMove = String(defender.protectMoveId || "").trim().toLowerCase();
      const isContact = !!move.isContact;
      if (isContact && protectMove === "spiky-shield" && attacker.hpCurrent > 0) {
        const chip = Math.max(1, Math.floor(attacker.hpTotal / 8));
        attacker.hpCurrent = Math.max(0, attacker.hpCurrent - chip);
        events.push({ type: "message", text: ptBR.spikyShieldContato(attacker.name) });
        events.push({ type: "hp", side, hpCurrent: attacker.hpCurrent, hpTotal: attacker.hpTotal });
        if (attacker.hpCurrent <= 0) events.push({ type: "faint", side, text: ptBR.desmaiou(attacker.name) });
      } else if (isContact && protectMove === "baneful-bunker" && attacker.hpCurrent > 0) {
        applyStatusWithMessage(events, side, "baneful-bunker", attacker, "poison");
      } else if (isContact && protectMove === "kings-shield" && attacker.hpCurrent > 0) {
        applyStageDelta(attacker, "attack", -1);
        events.push({ type: "message", text: ptBR.kingsShieldDropAtk(attacker.name) });
      }
      return;
    }

    if (move.category === "status") {
      if (defender.protected) {
        events.push({ type: "message", text: ptBR.protegido() });
        return;
      }
      const healEffect = getMoveEffects(move, "heal").find(
        (effect) => effect.kind === "heal" && effect.phase === "onUse" && effect.target === "user"
      );
      if (healEffect?.kind === "heal" && healEffect.percent > 0) {
        const heal = Math.max(1, Math.floor((attacker.hpTotal * healEffect.percent) / 100));
        const before = attacker.hpCurrent;
        attacker.hpCurrent = Math.min(attacker.hpTotal, attacker.hpCurrent + heal);
        if (attacker.hpCurrent > before) {
          events.push({ type: "message", text: ptBR.recuperouHp(attacker.name) });
          events.push({
            type: "hp",
            side,
            hpCurrent: attacker.hpCurrent,
            hpTotal: attacker.hpTotal,
          });
          return;
        }
      }
      const directStatusEffect = getMoveEffects(move, "status").find((effect) => effect.kind === "status" && effect.phase === "onUse");
      const directStatus =
        (directStatusEffect?.kind === "status" ? statusFromEffectStatus(directStatusEffect.status) : null) ??
        fallbackStatusFromMove(move.id) ??
        statusFromAilment(move.statusAilment);
      const statusTarget =
        directStatusEffect?.kind === "status" && directStatusEffect.target === "user"
          ? attacker
          : (move.target || "").toLowerCase() === "user"
          ? attacker
          : defender;
      const statusSide: BattleSide =
        statusTarget === attacker ? side : isPlayer ? "enemy" : "player";
      if (directStatus && applyStatusWithMessage(events, statusSide, move.id, statusTarget, directStatus)) {
        return;
      }
      const directVolatileEffect = getMoveEffects(move, "volatileStatus").find(
        (effect) => effect.kind === "volatileStatus" && effect.phase === "onUse"
      );
      if (directVolatileEffect?.kind === "volatileStatus") {
        const volatileTarget = directVolatileEffect.target === "user" ? attacker : defender;
        if (applyVolatileStatus(events, move, volatileTarget, directVolatileEffect.status)) {
          return;
        }
      }
      const statStageEffect = getMoveEffects(move, "statStages").find((effect) => effect.kind === "statStages" && effect.phase === "onUse");
      const statChance =
        statStageEffect?.kind === "statStages" ? Math.max(0, Math.min(100, n(statStageEffect.chance || 100))) : Math.max(0, Math.min(100, n(move.statChangeChance || 100)));
      const statusMoveChanges = statStageEffect?.kind === "statStages" ? statStageEffect.changes : move.statChanges || [];
      if (statusMoveChanges.length > 0 && Math.random() * 100 < statChance) {
        let changed = false;
        for (const sc of statusMoveChanges) {
          const toSelf =
            statStageEffect?.kind === "statStages" ? statStageEffect.target === "user" : (move.target || "").toLowerCase() === "user";
          const targetMon = toSelf ? attacker : defender;
          changed = applyStageDelta(targetMon, sc.stat, n(sc.stages)) || changed;
        }
        if (changed) {
          events.push({ type: "message", text: ptBR.atributosAlterados() });
          return;
        }
      }
      const stageMsg = applyStageMove(move.id, attacker, defender);
      if (stageMsg) {
        events.push({ type: "message", text: stageMsg });
        return;
      }
    }

    if (damage.damage <= 0) {
      events.push({ type: "message", text: ptBR.semDano() });
      return;
    }

    const defenderSide: BattleSide = isPlayer ? "enemy" : "player";
    const reflectTurns = getReflectTurns(fieldState, defenderSide);
    const lightScreenTurns = getLightScreenTurns(fieldState, defenderSide);
    const screenMult =
      move.category === "physical" && reflectTurns > 0 ? 0.5 : move.category === "special" && lightScreenTurns > 0 ? 0.5 : 1;

    const plannedHits = getMultiHitCount(move);
    let hits = plannedHits;
    let totalDamage = 0;
    while (hits > 0 && defender.hpCurrent > 0) {
      const oneHitDamage = Math.max(1, Math.floor(n(damage.damage) * screenMult));
      defender.hpCurrent = Math.max(0, n(defender.hpCurrent) - oneHitDamage);
      totalDamage += oneHitDamage;
      hits--;
    }
    events.push({
      type: "hit",
      side: isPlayer ? "enemy" : "player",
      text: ptBR.danoDireto(totalDamage),
      targetHpCurrent: defender.hpCurrent,
      targetHpTotal: defender.hpTotal,
    });
    events.push({
      type: "hp",
      side: isPlayer ? "enemy" : "player",
      hpCurrent: defender.hpCurrent,
      hpTotal: defender.hpTotal,
    });

    if (damage.critical) events.push({ type: "message", text: ptBR.critico() });
    if (damage.effectiveness === 0) events.push({ type: "message", text: ptBR.semEfeito() });
    else if (damage.effectiveness >= 2) events.push({ type: "message", text: ptBR.superEfetivo() });
    else if (damage.effectiveness < 1) events.push({ type: "message", text: ptBR.poucoEfetivo() });
    if (plannedHits > 1) events.push({ type: "message", text: ptBR.multiHit() });

    const drainEffect = getMoveEffects(move, "drain")[0];
    const recoilEffect = getMoveEffects(move, "recoil")[0];
    if (drainEffect?.kind === "drain" && totalDamage > 0 && attacker.hpCurrent > 0) {
      const heal = Math.max(1, Math.floor((totalDamage * drainEffect.percent) / 100));
      const before = attacker.hpCurrent;
      attacker.hpCurrent = Math.min(attacker.hpTotal, attacker.hpCurrent + heal);
      if (attacker.hpCurrent > before) {
        events.push({ type: "message", text: ptBR.drenouEnergia(attacker.name) });
        events.push({
          type: "hp",
          side,
          hpCurrent: attacker.hpCurrent,
          hpTotal: attacker.hpTotal,
        });
      }
    } else if (recoilEffect?.kind === "recoil" && totalDamage > 0 && attacker.hpCurrent > 0) {
      const recoil = Math.max(1, Math.floor((totalDamage * recoilEffect.percent) / 100));
      attacker.hpCurrent = Math.max(0, attacker.hpCurrent - recoil);
      events.push({ type: "message", text: ptBR.sofreuRecoil(attacker.name) });
      events.push({
        type: "hp",
        side,
        hpCurrent: attacker.hpCurrent,
        hpTotal: attacker.hpTotal,
      });
      if (attacker.hpCurrent <= 0) {
        events.push({ type: "faint", side, text: ptBR.desmaiou(attacker.name) });
      }
    }

    if (totalDamage > 0 && attacker.hpCurrent > 0 && normalizedItemId(attacker) === "life-orb") {
      const chip = Math.max(1, Math.floor(attacker.hpTotal / 10));
      attacker.hpCurrent = Math.max(0, attacker.hpCurrent - chip);
      events.push({ type: "message", text: ptBR.sofreuRecoil(attacker.name) });
      events.push({
        type: "hp",
        side,
        hpCurrent: attacker.hpCurrent,
        hpTotal: attacker.hpTotal,
      });
      if (attacker.hpCurrent <= 0) {
        events.push({ type: "faint", side, text: ptBR.desmaiou(attacker.name) });
      }
    }

    const flinchChance = flinchChanceFromMove(move);
    if (defenderCanAct && defender.hpCurrent > 0 && flinchChance > 0 && Math.random() < flinchChance) {
      defender.flinched = true;
    }

    const secStatusEffect = getMoveEffects(move, "status").find((effect) => effect.kind === "status" && effect.phase === "onHit");
    const secStatusChance =
      secStatusEffect?.kind === "status" ? Math.max(0, Math.min(100, n(secStatusEffect.chance || 0))) : Math.max(0, Math.min(100, n(move.statusChance || 0)));
    const secStatus =
      (secStatusEffect?.kind === "status" ? statusFromEffectStatus(secStatusEffect.status) : null) ?? statusFromAilment(move.statusAilment);
    if (defender.hpCurrent > 0 && secStatus && secStatusChance > 0 && Math.random() * 100 < secStatusChance) {
      const secTarget =
        secStatusEffect?.kind === "status" && secStatusEffect.target === "user"
          ? attacker
          : (move.target || "").toLowerCase() === "user"
          ? attacker
          : defender;
      const secStatusSide: BattleSide =
        secTarget === attacker ? side : isPlayer ? "enemy" : "player";
      applyStatusWithMessage(events, secStatusSide, move.id, secTarget, secStatus);
    }

    const secVolatileEffect = getMoveEffects(move, "volatileStatus").find(
      (effect) => effect.kind === "volatileStatus" && effect.phase === "onHit"
    );
    if (
      defender.hpCurrent > 0 &&
      secVolatileEffect?.kind === "volatileStatus" &&
      Math.random() * 100 < Math.max(0, Math.min(100, n(secVolatileEffect.chance || 0)))
    ) {
      const volatileTarget = secVolatileEffect.target === "user" ? attacker : defender;
      applyVolatileStatus(events, move, volatileTarget, secVolatileEffect.status);
    }

    const secStatEffect = getMoveEffects(move, "statStages").find((effect) => effect.kind === "statStages" && effect.phase === "onHit");
    const secStatChance =
      secStatEffect?.kind === "statStages" ? Math.max(0, Math.min(100, n(secStatEffect.chance || 0))) : Math.max(0, Math.min(100, n(move.statChangeChance || 0)));
    const secChanges = secStatEffect?.kind === "statStages" ? secStatEffect.changes : move.statChanges || [];
    if (defender.hpCurrent > 0 && secChanges.length > 0 && Math.random() * 100 < secStatChance) {
      let changed = false;
      for (const sc of secChanges) {
        const toSelf = secStatEffect?.kind === "statStages" ? secStatEffect.target === "user" : (move.target || "").toLowerCase() === "user";
        const targetMon = toSelf ? attacker : defender;
        changed = applyStageDelta(targetMon, sc.stat, n(sc.stages)) || changed;
      }
      if (changed) events.push({ type: "message", text: ptBR.atributosAlterados() });
    }

    if (defender.hpCurrent <= 0) {
      events.push({ type: "faint", side: isPlayer ? "enemy" : "player", text: ptBR.desmaiou(defender.name) });
    }
  };

  if (playerActionBlocked) {
    const p = playerTeam[playerActive];
    const e = enemyTeam[enemyActive];
    if (p && e && p.hpCurrent > 0 && e.hpCurrent > 0) runAttack("enemy", false);
  } else if (playerAction.type === "switch") {
    const p = playerTeam[playerActive];
    const e = enemyTeam[enemyActive];
    if (p && e && p.hpCurrent > 0 && e.hpCurrent > 0) runAttack("enemy", false);
  } else if (playerAction.type === "run" && !args.canRun) {
    const p = playerTeam[playerActive];
    const e = enemyTeam[enemyActive];
    if (p && e && p.hpCurrent > 0 && e.hpCurrent > 0) runAttack("enemy", false);
  } else {
    let playerActed = false;
    let enemyActed = false;
    for (const side of order) {
      const p = playerTeam[playerActive];
      const e = enemyTeam[enemyActive];
      if (!p || !e || p.hpCurrent <= 0 || e.hpCurrent <= 0) break;
      if (side === "player") {
        runAttack(side, !enemyActed);
        playerActed = true;
        const nextPlayer = playerTeam[playerActive];
        const nextEnemy = enemyTeam[enemyActive];
        if (!nextPlayer || !nextEnemy || nextPlayer.hpCurrent <= 0 || nextEnemy.hpCurrent <= 0) break;
      } else {
        runAttack(side, !playerActed);
        enemyActed = true;
        const nextPlayer = playerTeam[playerActive];
        const nextEnemy = enemyTeam[enemyActive];
        if (!nextPlayer || !nextEnemy || nextPlayer.hpCurrent <= 0 || nextEnemy.hpCurrent <= 0) break;
      }
    }
  }

  if (enemyTeam[enemyActive]?.hpCurrent <= 0) {
    const oldEnemy = enemyTeam[enemyActive];
    if (oldEnemy && oldEnemy.status === "bad-poison") oldEnemy.badPoisonCounter = 0;
    const nextEnemy = aliveIndex(enemyTeam);
    if (nextEnemy >= 0) {
      enemyActive = nextEnemy;
      events.push({ type: "switch", side: "enemy", text: ptBR.entrou(enemyTeam[nextEnemy].name), activeIndex: nextEnemy });
      applyEntryHazards("enemy", enemyTeam[nextEnemy]);
    }
  }

  if (fieldState.weather === "sandstorm" || fieldState.weather === "hail") {
    const weather = fieldState.weather;
    const p = playerTeam[playerActive];
    const e = enemyTeam[enemyActive];
    const applyChip = (side: BattleSide, mon: BattleMonster | undefined) => {
      if (!mon || mon.hpCurrent <= 0 || immuneToWeatherChip(mon, weather)) return;
      const chip = Math.max(1, Math.floor(mon.hpTotal / 16));
      mon.hpCurrent = Math.max(0, mon.hpCurrent - chip);
      events.push({ type: "message", text: ptBR.danoClima(mon.name) });
      events.push({
        type: "hp",
        side,
        hpCurrent: mon.hpCurrent,
        hpTotal: mon.hpTotal,
      });
      if (mon.hpCurrent <= 0) {
        events.push({ type: "faint", side, text: ptBR.desmaiou(mon.name) });
      }
    };
    applyChip("player", p);
    applyChip("enemy", e);
  }

  const applyStatusChip = (side: BattleSide, mon: BattleMonster | undefined) => {
    if (!mon || mon.hpCurrent <= 0) return;
    const st = mon.status ?? "none";
    if (st === "none") {
      mon.badPoisonCounter = 0;
      return;
    }
    if (st !== "burn" && st !== "poison" && st !== "bad-poison") return;
    let chip = Math.max(1, Math.floor(mon.hpTotal / 8));
    if (st === "bad-poison") {
      const counter = Math.max(1, Math.min(15, n(mon.badPoisonCounter ?? 1)));
      chip = Math.max(1, Math.floor((mon.hpTotal * counter) / 16));
      mon.badPoisonCounter = Math.min(15, counter + 1);
    } else {
      mon.badPoisonCounter = 0;
    }
    mon.hpCurrent = Math.max(0, mon.hpCurrent - chip);
    events.push({
      type: "message",
      text: ptBR.sofreuStatus(mon.name, st === "burn" ? "queimadura" : st === "bad-poison" ? "veneno severo" : "veneno"),
    });
    events.push({
      type: "hp",
      side,
      hpCurrent: mon.hpCurrent,
      hpTotal: mon.hpTotal,
    });
    if (mon.hpCurrent <= 0) {
      events.push({ type: "faint", side, text: ptBR.desmaiou(mon.name) });
    }
  };

  applyStatusChip("player", playerTeam[playerActive]);
  applyStatusChip("enemy", enemyTeam[enemyActive]);

  const applyVolatileEndTurn = (side: BattleSide, mon: BattleMonster | undefined) => {
    if (!mon || mon.hpCurrent <= 0) return;

    const yawn = findVolatile(mon, "yawn");
    if (yawn) {
      const turnsLeft = Math.max(0, n(yawn.turns ?? 0) - 1);
      if (turnsLeft <= 0) {
        clearVolatile(mon, "yawn");
        if (mon.status === "none") {
          mon.status = "sleep";
          mon.statusTurns = randomBetween(1, 2);
          events.push({ type: "status", side, status: "sleep" });
          events.push({ type: "message", text: ptBR.adormeceu(mon.name) });
        }
      } else {
        setVolatile(mon, "yawn", turnsLeft, yawn.sourceMoveId || undefined);
      }
    }

    const trap = findVolatile(mon, "trap");
    if (trap) {
      const chip = Math.max(1, Math.floor(mon.hpTotal / 8));
      mon.hpCurrent = Math.max(0, mon.hpCurrent - chip);
      events.push({ type: "message", text: `${mon.name} sofreu dano por estar preso!` });
      events.push({ type: "hp", side, hpCurrent: mon.hpCurrent, hpTotal: mon.hpTotal });
      const turnsLeft = Math.max(0, n(trap.turns ?? 0) - 1);
      if (turnsLeft <= 0 || mon.hpCurrent <= 0) clearVolatile(mon, "trap");
      else setVolatile(mon, "trap", turnsLeft, trap.sourceMoveId || undefined);
      if (mon.hpCurrent <= 0) events.push({ type: "faint", side, text: ptBR.desmaiou(mon.name) });
    }
  };

  applyVolatileEndTurn("player", playerTeam[playerActive]);
  applyVolatileEndTurn("enemy", enemyTeam[enemyActive]);

  const applyHeldItemEndTurn = (side: BattleSide, mon: BattleMonster | undefined) => {
    if (!mon || mon.hpCurrent <= 0) return;
    const itemId = normalizedItemId(mon);
    if (!itemId) return;
    if (itemId === "leftovers") {
      const heal = Math.max(1, Math.floor(mon.hpTotal / 16));
      const before = mon.hpCurrent;
      mon.hpCurrent = Math.min(mon.hpTotal, mon.hpCurrent + heal);
      if (mon.hpCurrent > before) {
        events.push({ type: "message", text: ptBR.recuperouHp(mon.name) });
        events.push({ type: "hp", side, hpCurrent: mon.hpCurrent, hpTotal: mon.hpTotal });
      }
      return;
    }
    if (itemId === "black-sludge") {
      if (isPoisonType(mon)) {
        const heal = Math.max(1, Math.floor(mon.hpTotal / 16));
        const before = mon.hpCurrent;
        mon.hpCurrent = Math.min(mon.hpTotal, mon.hpCurrent + heal);
        if (mon.hpCurrent > before) {
          events.push({ type: "message", text: ptBR.recuperouHp(mon.name) });
          events.push({ type: "hp", side, hpCurrent: mon.hpCurrent, hpTotal: mon.hpTotal });
        }
      } else {
        const chip = Math.max(1, Math.floor(mon.hpTotal / 8));
        mon.hpCurrent = Math.max(0, mon.hpCurrent - chip);
        events.push({ type: "message", text: ptBR.sofreuStatus(mon.name, "lodo negro") });
        events.push({ type: "hp", side, hpCurrent: mon.hpCurrent, hpTotal: mon.hpTotal });
        if (mon.hpCurrent <= 0) events.push({ type: "faint", side, text: ptBR.desmaiou(mon.name) });
      }
    }
  };

  applyHeldItemEndTurn("player", playerTeam[playerActive]);
  applyHeldItemEndTurn("enemy", enemyTeam[enemyActive]);

  if (enemyTeam[enemyActive]?.hpCurrent <= 0) {
    const oldEnemy = enemyTeam[enemyActive];
    if (oldEnemy && oldEnemy.status === "bad-poison") oldEnemy.badPoisonCounter = 0;
    const nextEnemy = aliveIndex(enemyTeam);
    if (nextEnemy >= 0) {
      enemyActive = nextEnemy;
      events.push({ type: "switch", side: "enemy", text: ptBR.entrou(enemyTeam[nextEnemy].name) });
      applyEntryHazards("enemy", enemyTeam[nextEnemy]);
    }
  }

  if (fieldState.weather !== "none" && fieldState.weatherTurns > 0) {
    fieldState.weatherTurns = Math.max(0, fieldState.weatherTurns - 1);
    if (fieldState.weatherTurns <= 0) {
      fieldState.weather = "none";
      events.push({ type: "weather", text: ptBR.climaPassou(), weather: "none", weatherTurns: 0 });
    }
  }

  if (fieldState.playerReflectTurns > 0) {
    fieldState.playerReflectTurns = Math.max(0, fieldState.playerReflectTurns - 1);
    if (fieldState.playerReflectTurns <= 0) events.push({ type: "message", text: ptBR.reflectAcabouPlayer() });
  }
  if (fieldState.enemyReflectTurns > 0) {
    fieldState.enemyReflectTurns = Math.max(0, fieldState.enemyReflectTurns - 1);
    if (fieldState.enemyReflectTurns <= 0) events.push({ type: "message", text: ptBR.reflectAcabouEnemy() });
  }
  if (fieldState.playerLightScreenTurns > 0) {
    fieldState.playerLightScreenTurns = Math.max(0, fieldState.playerLightScreenTurns - 1);
    if (fieldState.playerLightScreenTurns <= 0) events.push({ type: "message", text: ptBR.lightScreenAcabouPlayer() });
  }
  if (fieldState.enemyLightScreenTurns > 0) {
    fieldState.enemyLightScreenTurns = Math.max(0, fieldState.enemyLightScreenTurns - 1);
    if (fieldState.enemyLightScreenTurns <= 0) events.push({ type: "message", text: ptBR.lightScreenAcabouEnemy() });
  }

  // Nao troca automaticamente o jogador quando desmaia.
  // A escolha do substituto e feita pela UI (troca forcada).

  const playerAlive = anyAlive(playerTeam);
  const enemyAlive = anyAlive(enemyTeam);
  const result = !playerAlive ? "defeat" : !enemyAlive ? "victory" : "ongoing";
  if (result !== "ongoing") {
    events.push({
      type: "end",
      text: result === "victory" ? ptBR.vitoria() : ptBR.derrota(),
    });
  }

  return { events, playerTeam, enemyTeam, playerActive, enemyActive, fieldState, result };
}
