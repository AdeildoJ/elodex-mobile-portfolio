import { computeDamage } from "./DamageCalculator";
import { ptBR } from "../../battle/i18n/ptBR";
import { canSkipCharge, fallbackStatusFromMove, isProtectMove, isTwoTurnMove, multiHitCountForMove, weatherFromMove } from "./moveRules";
import type {
  BattleAction,
  BattleFieldState,
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
  moveId: string,
  target: BattleMonster,
  status: NonNullable<BattleMonster["status"]>
) {
  if (!canInflictStatus(moveId, target, status)) return false;
  target.status = status;
  target.badPoisonCounter = status === "bad-poison" ? 1 : 0;
  if (status === "sleep") target.statusTurns = randomBetween(1, 2);
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
  typeMultiplier: (moveType: string, defenderSpeciesId: number) => number;
  fieldState?: BattleFieldState;
}): BattleResolution {
  const events: BattleTurnEvent[] = [];
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
    if (args.canRun) {
      events.push({ type: "message", text: ptBR.fugiu() });
      return { events, playerTeam, enemyTeam, playerActive, enemyActive, fieldState, result: "ran" };
    }
    events.push({ type: "message", text: ptBR.naoPodeFugir() });
  }

  if (args.playerAction.type === "switch") {
    const next = playerTeam[args.playerAction.targetIndex];
    if (next && next.hpCurrent > 0 && args.playerAction.targetIndex !== playerActive) {
      const oldName = playerTeam[playerActive].name;
      const oldMon = playerTeam[playerActive];
      if (oldMon && oldMon.status === "bad-poison") oldMon.badPoisonCounter = 0;
      playerActive = args.playerAction.targetIndex;
      events.push({ type: "switch", side: "player", text: ptBR.voltou(oldName) });
      events.push({ type: "switch", side: "player", text: ptBR.vai(playerTeam[playerActive].name) });
      applyEntryHazards("player", playerTeam[playerActive]);
    }
  }

  const enemyNow = enemyTeam[enemyActive];
  const playerNow = playerTeam[playerActive];
  if (!enemyNow || !playerNow || enemyNow.hpCurrent <= 0 || playerNow.hpCurrent <= 0) {
    return { events, playerTeam, enemyTeam, playerActive, enemyActive, fieldState, result: "ongoing" };
  }

  const playerMoveIndex = args.playerAction.type === "fight" ? args.playerAction.moveIndex : 0;
  const playerMove = playerNow.moves[playerMoveIndex] || playerNow.moves[0];
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
  const enemyMove = enemyNow.moves[enemyMoveIndex] || enemyNow.moves[0];

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
          events.push({ type: "message", text: ptBR.acordou(attacker.name) });
        }
        return;
      }
      attacker.status = "none";
      attacker.badPoisonCounter = 0;
      events.push({ type: "message", text: ptBR.acordou(attacker.name) });
    }

    if (attacker.status === "freeze") {
      if (Math.random() < 0.2 || move.type === "fire") {
        attacker.status = "none";
        attacker.badPoisonCounter = 0;
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

    const protectLike = isProtectMove(move.id);

    const chargingNow = attacker.chargingMoveId && String(attacker.chargingMoveId).toLowerCase() === String(move.id || "").toLowerCase();
    if (!chargingNow && !protectLike) attacker.protectStreak = 0;

    const needsCharge = isTwoTurnMove(move.id) && !canSkipCharge(move.id, fieldState.weather);
    if (!chargingNow && needsCharge) {
      move.pp = Math.max(0, move.pp - 1);
      attacker.chargingMoveId = String(move.id || "").toLowerCase();
      events.push({ type: "attack", side, text: ptBR.usouGolpe(attacker.name, prettyMove(move.name || move.id)) });
      events.push({ type: "message", text: ptBR.carregandoGolpe(attacker.name) });
      return;
    }
    attacker.chargingMoveId = null;

    move.pp = Math.max(0, move.pp - 1);
    events.push({ type: "attack", side, text: ptBR.usouGolpe(attacker.name, prettyMove(move.name || move.id)) });
    const nextWeather = weatherFromMove(move.id);
    if (nextWeather) {
      fieldState.weather = nextWeather;
      fieldState.weatherTurns = 5;
      events.push({ type: "weather", text: weatherStartText(nextWeather), weather: nextWeather, weatherTurns: fieldState.weatherTurns });
      return;
    }

    const moveIdNorm = String(move.id || "").trim().toLowerCase();
    if (moveIdNorm === "reflect") {
      setReflectTurns(fieldState, side, 5);
      events.push({ type: "message", text: ptBR.criouReflect(attacker.name) });
      return;
    }
    if (moveIdNorm === "light-screen") {
      setLightScreenTurns(fieldState, side, 5);
      events.push({ type: "message", text: ptBR.criouLightScreen(attacker.name) });
      return;
    }
    if (moveIdNorm === "spikes") {
      const targetSide: BattleSide = isPlayer ? "enemy" : "player";
      const before = targetSide === "player" ? n(fieldState.playerSpikesLayers) : n(fieldState.enemySpikesLayers);
      addSpikesLayer(fieldState, targetSide);
      const after = targetSide === "player" ? n(fieldState.playerSpikesLayers) : n(fieldState.enemySpikesLayers);
      if (after > before) events.push({ type: "message", text: ptBR.spikesEspalhados() });
      else events.push({ type: "message", text: ptBR.spikesCheio() });
      return;
    }
    if (moveIdNorm === "stealth-rock") {
      const targetSide: BattleSide = isPlayer ? "enemy" : "player";
      const already = targetSide === "player" ? !!fieldState.playerStealthRock : !!fieldState.enemyStealthRock;
      if (!already) {
        setStealthRock(fieldState, targetSide, true);
        events.push({ type: "message", text: ptBR.stealthRockAtivo() });
      } else {
        events.push({ type: "message", text: ptBR.stealthRockJaAtivo() });
      }
      return;
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
      attacker.protectMoveId = String(move.id || "").trim().toLowerCase();
      attacker.protectStreak = streak + 1;
      events.push({ type: "message", text: ptBR.protegeu(attacker.name) });
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
        applyStatusWithMessage(events, "baneful-bunker", attacker, "poison");
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
      const selfHeal = Math.max(0, n(move.healing));
      if (selfHeal > 0) {
        const heal = Math.max(1, Math.floor((attacker.hpTotal * selfHeal) / 100));
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
      const directStatus = fallbackStatusFromMove(move.id) ?? statusFromAilment(move.statusAilment);
      const statusTarget = (move.target || "").toLowerCase() === "user" ? attacker : defender;
      if (directStatus && applyStatusWithMessage(events, move.id, statusTarget, directStatus)) {
        return;
      }
      const statChance = Math.max(0, Math.min(100, n(move.statChangeChance || 100)));
      if ((move.statChanges?.length || 0) > 0 && Math.random() * 100 < statChance) {
        let changed = false;
        for (const sc of move.statChanges || []) {
          const toSelf = (move.target || "").toLowerCase() === "user";
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

    const plannedHits = multiHitCountForMove(move.id, randomBetween);
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

    const drainPct = n(move.drain);
    if (drainPct > 0 && totalDamage > 0 && attacker.hpCurrent > 0) {
      const heal = Math.max(1, Math.floor((totalDamage * drainPct) / 100));
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
    } else if (drainPct < 0 && totalDamage > 0 && attacker.hpCurrent > 0) {
      const recoil = Math.max(1, Math.floor((totalDamage * Math.abs(drainPct)) / 100));
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

    const secStatusChance = Math.max(0, Math.min(100, n(move.statusChance || 0)));
    const secStatus = statusFromAilment(move.statusAilment);
    if (defender.hpCurrent > 0 && secStatus && secStatusChance > 0 && Math.random() * 100 < secStatusChance) {
      const secTarget = (move.target || "").toLowerCase() === "user" ? attacker : defender;
      applyStatusWithMessage(events, move.id, secTarget, secStatus);
    }

    const secStatChance = Math.max(0, Math.min(100, n(move.statChangeChance || 0)));
    if (defender.hpCurrent > 0 && (move.statChanges?.length || 0) > 0 && Math.random() * 100 < secStatChance) {
      let changed = false;
      for (const sc of move.statChanges || []) {
        const toSelf = (move.target || "").toLowerCase() === "user";
        const targetMon = toSelf ? attacker : defender;
        changed = applyStageDelta(targetMon, sc.stat, n(sc.stages)) || changed;
      }
      if (changed) events.push({ type: "message", text: ptBR.atributosAlterados() });
    }

    if (defender.hpCurrent <= 0) {
      events.push({ type: "faint", side: isPlayer ? "enemy" : "player", text: ptBR.desmaiou(defender.name) });
    }
  };

  if (args.playerAction.type === "switch") {
    const p = playerTeam[playerActive];
    const e = enemyTeam[enemyActive];
    if (p && e && p.hpCurrent > 0 && e.hpCurrent > 0) runAttack("enemy", false);
  } else if (args.playerAction.type === "run" && !args.canRun) {
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
      } else {
        runAttack(side, !playerActed);
        enemyActed = true;
      }
    }
  }

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
