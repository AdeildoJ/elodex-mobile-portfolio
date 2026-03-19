import React, { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Image, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";

import { COLORS } from "../../theme/colors";
import { ptBR } from "../../battle/i18n/ptBR";
import { resolveTurn } from "./TurnManager";
import { useBattleAnimationController } from "./AnimationController";
import { BattleHUD } from "./BattleHUD";
import { BattleMenu } from "./BattleMenu";
import { BattleText } from "./BattleText";
import { PartyMenuModal } from "./PartyMenuModal";
import { BattleAnimationEngine } from "./BattleAnimationEngine";
import { buildMoveAnimationSequence, type MoveAnimationProfile, resolveMoveAnimationProfile } from "./moveAnimationPresets";
import { resolveBattleFeatureFlags } from "./battleFeatureFlags";
import { resolveWeatherBackground, resolveWeatherOverlay, weatherToVisualMode } from "./BattleWeatherVisuals";
import { getLocalBattleAssets } from "./localBattleAssets";
import { resolveBattleSpriteCandidates } from "../../pokemon/sprites/SpriteResolver";
import type { BattleAction, BattleAssetSet, BattleBackgroundKind, BattleFieldState, BattleMonster, BattleMove, BattleTeam, BattleTurnEvent, BattleMode } from "./types";
import type { BattleFeatureFlags } from "./battleFeatureFlags";

type BallItem = { id: string; name: string; quantity: number };
type TurnPhase =
  | "IDLE"
  | "PLAYER_CHOOSE"
  | "FORCED_SWITCH"
  | "ENEMY_CHOOSE"
  | "RESOLVE_ORDER"
  | "EXECUTE_FIRST_ACTION"
  | "EXECUTE_SECOND_ACTION"
  | "END_TURN";

type Props = {
  visible: boolean;
  mode: BattleMode;
  backgroundKind: BattleBackgroundKind;
  battleAssets?: BattleAssetSet | null;
  initialFieldState?: Partial<BattleFieldState>;
  playerTeam: BattleTeam;
  enemyTeam: BattleTeam;
  initialPlayerIndex?: number;
  initialEnemyIndex?: number;
  balls?: BallItem[];
  canRun?: boolean;
  canUseBag?: boolean;
  typeMultiplier: (moveType: string, defenderSpeciesId: number) => number;
  onClose: () => void;
  onTryCapture?: (ballId: string, enemy: BattleMonster) => Promise<{ ok: boolean; message: string }>;
  onPlayerHpSync?: (payload: { slotIndex: number; hpCurrent: number }) => Promise<void> | void;
  battleFeatureFlags?: Partial<BattleFeatureFlags> | null;
  onFinish?: (payload: {
    result: "victory" | "defeat" | "ran";
    playerTeam: BattleTeam;
    enemyTeam: BattleTeam;
    playerActive: number;
    enemyActive: number;
    participants: number[];
  }) => Promise<void> | void;
};

function randomEnemyAction(): BattleAction {
  return { type: "bag" };
}

function getBg(kind: BattleBackgroundKind): [string, string, string] {
  if (kind === "forest") return ["#1f3f20", "#2d5d2f", "#7ea35a"];
  if (kind === "cave") return ["#1d2230", "#2d3348", "#5f6476"];
  if (kind === "beach") return ["#235f7f", "#3f92c3", "#dec289"];
  if (kind === "city") return ["#1b2336", "#324b7d", "#7b8aab"];
  return ["#35622f", "#67974c", "#b8cb77"];
}

function biomeLabel(kind: BattleBackgroundKind): string {
  if (kind === "forest") return "Floresta";
  if (kind === "cave") return "Caverna";
  if (kind === "beach") return "Praia";
  if (kind === "city") return "Cidade";
  return "Campos";
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function inferSpriteGroundOffset(mon: BattleMonster | null, side: "player" | "enemy") {
  if (!mon) return 0;
  const hpRef = Number(mon.hpTotal || mon.stats?.hp || 0);
  const types = (mon.types || []).map((t) => String(t || "").toLowerCase());
  const isHovering = types.includes("flying") || types.includes("ghost");
  const hasHeavyBody = hpRef >= 180;
  const isSmallBody = hpRef > 0 && hpRef <= 75;
  if (isHovering) return side === "enemy" ? -6 : -4;
  if (hasHeavyBody) return side === "enemy" ? -5 : -3;
  if (isSmallBody) return side === "enemy" ? 9 : 10;
  return side === "enemy" ? 5 : 4;
}

function isUsableAssetUri(value: unknown) {
  const uri = String(value || "").trim();
  if (!uri) return false;
  return /^(https?:|file:|content:|asset:|data:|blob:|\/)/i.test(uri);
}

function estimateEnemyExpYield(enemy: BattleMonster) {
  const statTotal =
    Math.max(1, Number(enemy.stats?.hp || 0)) +
    Math.max(1, Number(enemy.stats?.atk || 0)) +
    Math.max(1, Number(enemy.stats?.def || 0)) +
    Math.max(1, Number(enemy.stats?.spa || 0)) +
    Math.max(1, Number(enemy.stats?.spd || 0)) +
    Math.max(1, Number(enemy.stats?.spe || 0));
  return Math.max(24, Math.round((Math.max(1, enemy.level) * Math.max(120, statTotal)) / 32));
}

function nextExpThreshold(level: number, fallback?: number) {
  const base = Math.max(60, Math.round(level * level * 0.8 + level * 18));
  if (Number.isFinite(Number(fallback)) && Number(fallback) > 0) {
    return Math.max(base, Math.round(Number(fallback) * 1.12));
  }
  return base;
}

export function BattleScene({
  visible,
  mode,
  backgroundKind,
  battleAssets,
  initialFieldState,
  playerTeam: inputPlayerTeam,
  enemyTeam: inputEnemyTeam,
  initialPlayerIndex = 0,
  initialEnemyIndex = 0,
  balls = [],
  canRun = true,
  canUseBag = mode === "wild",
  typeMultiplier,
  onClose,
  onTryCapture,
  onPlayerHpSync,
  battleFeatureFlags,
  onFinish,
}: Props) {
  const anim = useBattleAnimationController();
  const flags = useMemo(() => resolveBattleFeatureFlags(battleFeatureFlags), [battleFeatureFlags]);
  const mountedRef = useRef(true);
  const actionLockRef = useRef(false);
  const attackCountRef = useRef(0);
  const displayPlayerTeamRef = useRef<BattleTeam>([]);
  const displayEnemyTeamRef = useRef<BattleTeam>([]);
  const displayPlayerActiveRef = useRef(initialPlayerIndex);
  const displayEnemyActiveRef = useRef(initialEnemyIndex);
  const pendingResolutionRef = useRef<{
    result: "ongoing" | "victory" | "defeat" | "ran";
    playerTeam: BattleTeam;
    enemyTeam: BattleTeam;
    playerActive: number;
    enemyActive: number;
    fieldState: BattleFieldState;
  } | null>(null);

  const [playerTeam, setPlayerTeam] = useState<BattleTeam>([]);
  const [enemyTeam, setEnemyTeam] = useState<BattleTeam>([]);
  const [playerActive, setPlayerActive] = useState(initialPlayerIndex);
  const [enemyActive, setEnemyActive] = useState(initialEnemyIndex);
  const [participants, setParticipants] = useState<number[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<"ongoing" | "victory" | "defeat" | "ran">("ongoing");
  const [phase, setPhase] = useState<TurnPhase>("IDLE");
  const [eventQueue, setEventQueue] = useState<BattleTurnEvent[]>([]);
  const [fieldState, setFieldState] = useState<BattleFieldState>({
    weather: "none",
    weatherTurns: 0,
    playerReflectTurns: 0,
    enemyReflectTurns: 0,
    playerLightScreenTurns: 0,
    enemyLightScreenTurns: 0,
    playerSpikesLayers: 0,
    enemySpikesLayers: 0,
    playerStealthRock: false,
    enemyStealthRock: false,
  });
  const [partyOpen, setPartyOpen] = useState(false);
  const [flash] = useState(new Animated.Value(0));
  const flashOverlayOpacity = useRef(new Animated.Value(0)).current;
  const captureBallOpacity = useRef(new Animated.Value(0)).current;
  const captureBallX = useRef(new Animated.Value(0)).current;
  const captureBallY = useRef(new Animated.Value(0)).current;
  const captureBallScale = useRef(new Animated.Value(0.7)).current;
  const captureBeamOpacity = useRef(new Animated.Value(0)).current;
  const captureBeamScale = useRef(new Animated.Value(0.8)).current;
  const cameraX = useRef(new Animated.Value(0)).current;
  const cameraY = useRef(new Animated.Value(0)).current;
  const cameraIdleY = useRef(new Animated.Value(0)).current;
  const cameraScale = useRef(new Animated.Value(1)).current;
  const parallaxDrift = useRef(new Animated.Value(0)).current;
  const weatherDriftY = useRef(new Animated.Value(0)).current;
  const fxOpacity = useRef(new Animated.Value(0)).current;
  const fxTravelX = useRef(new Animated.Value(0)).current;
  const fxTravelY = useRef(new Animated.Value(0)).current;
  const sequenceActorSideRef = useRef<"player" | "enemy">("player");
  const timelineHandledHitRef = useRef(false);
  const [fxKind, setFxKind] = useState<"none" | "spawn" | "projectile">("none");
  const [fxTint, setFxTint] = useState("rgba(125,211,252,0.95)");
  const [flashOverlayVariant, setFlashOverlayVariant] = useState<"none" | "shield" | "critical">("none");
  const [pendingStatusPulse, setPendingStatusPulse] = useState<"none" | "buff" | "debuff">("none");

  const [enemySpriteIdx, setEnemySpriteIdx] = useState(0);
  const [playerSpriteIdx, setPlayerSpriteIdx] = useState(0);

  const activePlayer = playerTeam[playerActive] || null;
  const activeEnemy = enemyTeam[enemyActive] || null;
  const bgColors = useMemo(() => getBg(backgroundKind), [backgroundKind]);
  const effectiveBattleAssets = useMemo<BattleAssetSet>(() => {
    const local = getLocalBattleAssets(backgroundKind) || {};
    const remote = battleAssets || {};
    const pick = (remoteValue: unknown, localValue: unknown) => {
      const r = String(remoteValue || "").trim();
      if (isUsableAssetUri(r)) return r;
      const l = String(localValue || "").trim();
      return isUsableAssetUri(l) ? l : null;
    };
    return {
      skyDay: pick(remote.skyDay, local.skyDay),
      skyNight: pick(remote.skyNight, local.skyNight),
      sky: pick(remote.sky, local.sky),
      backgroundDay: pick(remote.backgroundDay, local.backgroundDay),
      backgroundNight: pick(remote.backgroundNight, local.backgroundNight),
      background: pick(remote.background, local.background),
      groundDay: pick(remote.groundDay, local.groundDay),
      groundNight: pick(remote.groundNight, local.groundNight),
      ground: pick(remote.ground, local.ground),
      overlayRain: pick(remote.overlayRain, local.overlayRain),
      overlaySnow: pick(remote.overlaySnow, local.overlaySnow),
      overlaySandstorm: pick(remote.overlaySandstorm, local.overlaySandstorm),
      overlaySunny: pick(remote.overlaySunny, local.overlaySunny),
      backgroundRain: pick(remote.backgroundRain, local.backgroundRain),
      backgroundSunny: pick(remote.backgroundSunny, local.backgroundSunny),
      backgroundSandstorm: pick(remote.backgroundSandstorm, local.backgroundSandstorm),
      backgroundSnow: pick(remote.backgroundSnow, local.backgroundSnow),
      platformPlayer: pick(remote.platformPlayer, local.platformPlayer),
      platformEnemy: pick(remote.platformEnemy, local.platformEnemy),
      platformPlayerNight: pick(remote.platformPlayerNight, local.platformPlayerNight),
      platformEnemyNight: pick(remote.platformEnemyNight, local.platformEnemyNight),
    };
  }, [backgroundKind, battleAssets]);

  const enemyCandidates = useMemo(
    () => resolveBattleSpriteCandidates(activeEnemy?.speciesId || 0, "front"),
    [activeEnemy?.speciesId]
  );
  const playerBackCandidates = useMemo(
    () => resolveBattleSpriteCandidates(activePlayer?.speciesId || 0, "back"),
    [activePlayer?.speciesId]
  );
  const playerFrontCandidates = useMemo(
    () => resolveBattleSpriteCandidates(activePlayer?.speciesId || 0, "front"),
    [activePlayer?.speciesId]
  );
  const playerCandidates = useMemo(
    () => [...playerBackCandidates, ...playerFrontCandidates],
    [playerBackCandidates, playerFrontCandidates]
  );

  const enemySpriteUri = enemyCandidates[Math.min(enemySpriteIdx, Math.max(0, enemyCandidates.length - 1))] || null;
  const playerSpriteUri = playerCandidates[Math.min(playerSpriteIdx, Math.max(0, playerCandidates.length - 1))] || null;
  const playerSpriteMirrored = playerSpriteIdx >= playerBackCandidates.length;

  const playerSpriteScale = useMemo(() => {
    const hp = Number(activePlayer?.hpTotal || 0);
    if (hp >= 220) return 1.02;
    if (hp >= 170) return 1.08;
    if (hp <= 65 && hp > 0) return 1.2;
    return 1.14;
  }, [activePlayer?.hpTotal]);
  const enemySpriteScale = useMemo(() => {
    const hp = Number(activeEnemy?.hpTotal || 0);
    if (hp >= 220) return 0.76;
    if (hp >= 170) return 0.82;
    if (hp <= 65 && hp > 0) return 0.98;
    return 0.9;
  }, [activeEnemy?.hpTotal]);
  const playerGroundOffsetY = useMemo(() => inferSpriteGroundOffset(activePlayer, "player"), [activePlayer]);
  const enemyGroundOffsetY = useMemo(() => inferSpriteGroundOffset(activeEnemy, "enemy"), [activeEnemy]);
  const playerShadowScale = useMemo(() => {
    if (!activePlayer) return 1;
    const hp = Number(activePlayer.hpTotal || 0);
    if (hp >= 220) return 1.28;
    if (hp >= 170) return 1.18;
    if (hp <= 75 && hp > 0) return 0.86;
    return 1;
  }, [activePlayer]);
  const enemyShadowScale = useMemo(() => {
    if (!activeEnemy) return 1;
    const hp = Number(activeEnemy.hpTotal || 0);
    if (hp >= 220) return 1.18;
    if (hp >= 170) return 1.1;
    if (hp <= 75 && hp > 0) return 0.82;
    return 0.95;
  }, [activeEnemy]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      anim.stopAll();
      parallaxDrift.stopAnimation();
      weatherDriftY.stopAnimation();
      cameraX.stopAnimation();
      cameraY.stopAnimation();
      cameraIdleY.stopAnimation();
      cameraScale.stopAnimation();
      fxOpacity.stopAnimation();
      fxTravelX.stopAnimation();
      fxTravelY.stopAnimation();
      flashOverlayOpacity.stopAnimation();
      captureBallOpacity.stopAnimation();
      captureBallX.stopAnimation();
      captureBallY.stopAnimation();
      captureBallScale.stopAnimation();
      captureBeamOpacity.stopAnimation();
      captureBeamScale.stopAnimation();
    };
  }, [anim, cameraIdleY, cameraScale, cameraX, cameraY, captureBallOpacity, captureBallScale, captureBallX, captureBallY, captureBeamOpacity, captureBeamScale, flashOverlayOpacity, fxOpacity, fxTravelX, fxTravelY, parallaxDrift, weatherDriftY]);

  useEffect(() => {
    if (!visible) return;
    if (!flags.enableBattleParallax) return;
    const weatherLoopY = Animated.loop(
      Animated.sequence([
        Animated.timing(weatherDriftY, { toValue: 14, duration: 1200, useNativeDriver: true }),
        Animated.timing(weatherDriftY, { toValue: -10, duration: 1000, useNativeDriver: true }),
        Animated.timing(weatherDriftY, { toValue: 0, duration: 900, useNativeDriver: true }),
      ])
    );
    weatherLoopY.start();
    return () => {
      weatherLoopY.stop();
      parallaxDrift.setValue(0);
      weatherDriftY.setValue(0);
    };
  }, [flags.enableBattleParallax, parallaxDrift, visible, weatherDriftY]);

  const animateCameraTo = (toX: number, toY: number, toScale: number, duration = 120) =>
    new Promise<void>((resolve) => {
      if (!flags.enableBattleCamera) {
        resolve();
        return;
      }
      Animated.parallel([
        Animated.timing(cameraX, { toValue: toX, duration, useNativeDriver: true }),
        Animated.timing(cameraY, { toValue: toY, duration, useNativeDriver: true }),
        Animated.timing(cameraScale, { toValue: toScale, duration, useNativeDriver: true }),
      ]).start(() => resolve());
    });

  const focusOnPlayer = (duration = 120) => animateCameraTo(10, 2, 1.03, duration);
  const focusOnEnemy = (duration = 120) => animateCameraTo(-10, -2, 1.03, duration);
  const focusOnTarget = (side: "player" | "enemy", duration = 120) => (side === "player" ? focusOnPlayer(duration) : focusOnEnemy(duration));

  const playHitShake = () =>
    new Promise<void>((resolve) => {
      if (!flags.enableBattleCamera) {
        resolve();
        return;
      }
      Animated.parallel([
        Animated.sequence([
          Animated.timing(cameraX, { toValue: 6, duration: 35, useNativeDriver: true }),
          Animated.timing(cameraX, { toValue: -6, duration: 35, useNativeDriver: true }),
          Animated.timing(cameraX, { toValue: 4, duration: 30, useNativeDriver: true }),
          Animated.timing(cameraX, { toValue: -4, duration: 30, useNativeDriver: true }),
          Animated.timing(cameraX, { toValue: 0, duration: 30, useNativeDriver: true }),
        ]),
        Animated.sequence([
          Animated.timing(cameraScale, { toValue: 1.04, duration: 45, useNativeDriver: true }),
          Animated.timing(cameraScale, { toValue: 1.02, duration: 45, useNativeDriver: true }),
          Animated.timing(cameraScale, { toValue: 1, duration: 60, useNativeDriver: true }),
        ]),
      ]).start(() => resolve());
    });

  const playCriticalShake = () =>
    new Promise<void>((resolve) => {
      if (!flags.enableBattleCamera) {
        resolve();
        return;
      }
      Animated.parallel([
        Animated.sequence([
          Animated.timing(cameraX, { toValue: 10, duration: 28, useNativeDriver: true }),
          Animated.timing(cameraX, { toValue: -10, duration: 28, useNativeDriver: true }),
          Animated.timing(cameraX, { toValue: 8, duration: 26, useNativeDriver: true }),
          Animated.timing(cameraX, { toValue: -8, duration: 26, useNativeDriver: true }),
          Animated.timing(cameraX, { toValue: 0, duration: 32, useNativeDriver: true }),
        ]),
        Animated.sequence([
          Animated.timing(cameraScale, { toValue: 1.04, duration: 40, useNativeDriver: true }),
          Animated.timing(cameraScale, { toValue: 1.01, duration: 50, useNativeDriver: true }),
          Animated.timing(cameraScale, { toValue: 1, duration: 60, useNativeDriver: true }),
        ]),
      ]).start(() => resolve());
    });

  const resetCamera = () => animateCameraTo(0, 0, 1, 120);

  const moveToken = (value: string) =>
    String(value || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "");

  const moveFromAttackText = (side: "player" | "enemy", text?: string): BattleMove | null => {
    const src = String(text || "");
    const marker = " usou ";
    const i = src.toLowerCase().indexOf(marker);
    if (i < 0) return null;
    const raw = src.slice(i + marker.length).replace(/!/g, "").trim();
    const token = moveToken(raw);
    if (!token) return null;
    const actor =
      side === "player"
        ? displayPlayerTeamRef.current[displayPlayerActiveRef.current]
        : displayEnemyTeamRef.current[displayEnemyActiveRef.current];
    const list = Array.isArray(actor?.moves) ? actor!.moves : [];
    return (
      list.find((mv) => moveToken(String(mv.name || "")) === token) ||
      list.find((mv) => moveToken(String(mv.id || "")) === token) ||
      null
    );
  };

  const moveFromEvent = (side: "player" | "enemy", ev: BattleTurnEvent): BattleMove | null => {
    const actor =
      side === "player"
        ? displayPlayerTeamRef.current[displayPlayerActiveRef.current]
        : displayEnemyTeamRef.current[displayEnemyActiveRef.current];
    const byId = String(ev.moveId || "").trim().toLowerCase();
    if (byId && actor?.moves?.length) {
      const exact = actor.moves.find((move) => String(move.id || "").trim().toLowerCase() === byId);
      if (exact) return exact;
    }
    return moveFromAttackText(side, ev.text);
  };

  const waitStep = (duration: number) => wait(Math.max(20, duration));

  const resetCaptureFx = () => {
    captureBallOpacity.setValue(0);
    captureBallX.setValue(0);
    captureBallY.setValue(0);
    captureBallScale.setValue(0.7);
    captureBeamOpacity.setValue(0);
    captureBeamScale.setValue(0.8);
  };

  const runSpawnEffect = async (effect: string, duration: number) => {
    const fx = String(effect || "").toLowerCase();
    const tint =
      fx.includes("heal") ? "rgba(74,222,128,0.92)" :
        fx.includes("status") ? "rgba(244,114,182,0.92)" :
          fx.includes("projectile") ? "rgba(125,211,252,0.95)" :
            "rgba(248,250,252,0.9)";
    setFxTint(tint);
    setFxKind("spawn");
    fxOpacity.setValue(0);
    await new Promise<void>((resolve) => {
      Animated.sequence([
        Animated.timing(fxOpacity, { toValue: 0.95, duration: Math.max(50, Math.floor(duration * 0.35)), useNativeDriver: true }),
        Animated.timing(fxOpacity, { toValue: 0, duration: Math.max(60, Math.floor(duration * 0.65)), useNativeDriver: true }),
      ]).start(() => resolve());
    });
    setFxKind("none");
  };

  const runProjectileEffect = async (effect: string, duration: number) => {
    const side = sequenceActorSideRef.current;
    const tint = String(effect || "").toLowerCase().includes("status")
      ? "rgba(244,114,182,0.95)"
      : "rgba(125,211,252,0.96)";
    setFxTint(tint);
    setFxKind("projectile");
    fxOpacity.setValue(1);
    fxTravelX.setValue(side === "player" ? -130 : 130);
    fxTravelY.setValue(side === "player" ? 34 : -18);
    await new Promise<void>((resolve) => {
      Animated.parallel([
        Animated.timing(fxTravelX, { toValue: side === "player" ? 120 : -120, duration: Math.max(90, duration), useNativeDriver: true }),
        Animated.timing(fxTravelY, { toValue: side === "player" ? -8 : 26, duration: Math.max(90, duration), useNativeDriver: true }),
        Animated.sequence([
          Animated.delay(Math.max(50, Math.floor(duration * 0.65))),
          Animated.timing(fxOpacity, { toValue: 0, duration: Math.max(60, Math.floor(duration * 0.35)), useNativeDriver: true }),
        ]),
      ]).start(() => resolve());
    });
    setFxKind("none");
  };

  const playMoveTimeline = async (side: "player" | "enemy", ev: BattleTurnEvent) => {
    sequenceActorSideRef.current = side;
    const move = moveFromEvent(side, ev);
    const profile: MoveAnimationProfile =
      ev.moveStage === "charge"
        ? "charging"
        : move
        ? resolveMoveAnimationProfile(move)
        : "physical";
    const sequence = buildMoveAnimationSequence(profile);
    timelineHandledHitRef.current = sequence.some((step) => step.type === "targetHit" || step.type === "cameraShake");
    await BattleAnimationEngine.playMoveSequence(sequence, {
      cameraFocusAttacker: (duration) => focusOnTarget(side, duration),
      cameraFocusTarget: (duration) => focusOnTarget(side === "player" ? "enemy" : "player", duration),
      attackerLunge: async (duration) => {
        if (flags.enableBattleSpriteReactions) await anim.animateAttack(side);
        await waitStep(duration - 110);
      },
      attackerCastPose: async (duration) => {
        if (flags.enableBattleSpriteReactions) await anim.animateCast(side);
        await waitStep(duration - 110);
      },
      spawnEffect: runSpawnEffect,
      projectile: runProjectileEffect,
      targetHit: async (duration) => {
        const target = side === "player" ? "enemy" : "player";
        if (flags.enableBattleSpriteReactions) await anim.animateHit(target);
        await waitStep(duration - 80);
      },
      targetRecoil: async (duration) => {
        const target = side === "player" ? "enemy" : "player";
        if (flags.enableBattleSpriteReactions) await anim.animateRecoil(target);
        await waitStep(duration - 70);
      },
      cameraShake: async (duration) => {
        await playHitShake();
        await waitStep(duration - 95);
      },
      cameraCriticalShake: async (duration) => {
        await playCriticalShake();
        await waitStep(duration - 110);
      },
      hpDrop: (duration) => waitStep(duration),
      statusPulse: async (status, duration) => {
        setPendingStatusPulse(status === "buff" ? "buff" : "debuff");
        if (flags.enableBattleSpriteReactions) {
          const target = side === "player" ? "enemy" : "player";
          await anim.animateStatusPulse(target);
        }
        await waitStep(duration);
        setPendingStatusPulse("none");
      },
      showText: async (timelineText, duration) => {
        setMessage(timelineText);
        await waitStep(Math.max(duration, 2200));
      },
      flashOverlay: async (variant, duration) => {
        setFlashOverlayVariant(variant === "critical" ? "critical" : "shield");
        flashOverlayOpacity.setValue(0);
        await new Promise<void>((resolve) => {
          Animated.sequence([
            Animated.timing(flashOverlayOpacity, { toValue: 0.95, duration: Math.max(40, duration * 0.45), useNativeDriver: true }),
            Animated.timing(flashOverlayOpacity, { toValue: 0, duration: Math.max(50, duration * 0.55), useNativeDriver: true }),
          ]).start(() => resolve());
        });
        setFlashOverlayVariant("none");
      },
      resetCamera: (duration) => animateCameraTo(0, 0, 1, duration),
    });
  };

  const playCaptureAnimation = async (success: boolean) => {
    resetCaptureFx();
    await focusOnEnemy(110);
    await new Promise<void>((resolve) => {
      Animated.sequence([
        Animated.parallel([
          Animated.timing(captureBallOpacity, { toValue: 1, duration: 50, useNativeDriver: true }),
          Animated.timing(captureBallScale, { toValue: 1, duration: 120, useNativeDriver: true }),
          Animated.timing(captureBallX, { toValue: 112, duration: 240, useNativeDriver: true }),
          Animated.timing(captureBallY, { toValue: -138, duration: 240, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(captureBeamOpacity, { toValue: 1, duration: 110, useNativeDriver: true }),
          Animated.timing(captureBeamScale, { toValue: 1.45, duration: 180, useNativeDriver: true }),
          Animated.timing(captureBallScale, { toValue: 1.16, duration: 120, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(captureBeamOpacity, { toValue: 0, duration: 170, useNativeDriver: true }),
          Animated.timing(captureBallScale, { toValue: 0.92, duration: 170, useNativeDriver: true }),
          Animated.timing(anim.enemyY, { toValue: success ? -34 : -10, duration: 170, useNativeDriver: true }),
          Animated.timing(anim.enemyScale, { toValue: success ? 0.2 : 0.82, duration: 170, useNativeDriver: true }),
          Animated.timing(anim.enemyOpacity, { toValue: success ? 0 : 0.46, duration: 170, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(captureBallY, { toValue: -126, duration: 120, useNativeDriver: true }),
          Animated.timing(captureBallScale, { toValue: 1.02, duration: 120, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(captureBallY, { toValue: -138, duration: 120, useNativeDriver: true }),
          Animated.timing(captureBallScale, { toValue: 0.96, duration: 120, useNativeDriver: true }),
          Animated.timing(anim.enemyOpacity, { toValue: success ? 0 : 0.25, duration: 120, useNativeDriver: true }),
        ]),
      ]).start(() => resolve());
    });

    if (!success) {
      await new Promise<void>((resolve) => {
        Animated.parallel([
          Animated.timing(anim.enemyOpacity, { toValue: 1, duration: 170, useNativeDriver: true }),
          Animated.timing(anim.enemyScale, { toValue: 1, duration: 170, useNativeDriver: true }),
          Animated.timing(anim.enemyY, { toValue: 0, duration: 170, useNativeDriver: true }),
          Animated.timing(captureBallOpacity, { toValue: 0, duration: 140, useNativeDriver: true }),
          Animated.timing(captureBallScale, { toValue: 0.78, duration: 140, useNativeDriver: true }),
        ]).start(() => resolve());
      });
    }

    await resetCamera();
  };

  useEffect(() => {
    displayPlayerTeamRef.current = playerTeam;
  }, [playerTeam]);

  useEffect(() => {
    displayEnemyTeamRef.current = enemyTeam;
  }, [enemyTeam]);

  useEffect(() => {
    displayPlayerActiveRef.current = playerActive;
  }, [playerActive]);

  useEffect(() => {
    displayEnemyActiveRef.current = enemyActive;
  }, [enemyActive]);

  useEffect(() => {
    if (!visible || !flags.enableBattleCamera) return;
    const idleLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(cameraIdleY, { toValue: -2, duration: 1400, useNativeDriver: true }),
        Animated.timing(cameraIdleY, { toValue: 2, duration: 1500, useNativeDriver: true }),
        Animated.timing(cameraIdleY, { toValue: 0, duration: 1200, useNativeDriver: true }),
      ])
    );
    idleLoop.start();
    return () => {
      idleLoop.stop();
      cameraIdleY.setValue(0);
    };
  }, [cameraIdleY, flags.enableBattleCamera, visible]);

  useEffect(() => {
    if (!visible) return;
    const p = inputPlayerTeam.map((x) => ({ ...x, moves: x.moves.map((m) => ({ ...m })) }));
    const e = inputEnemyTeam.map((x) => ({ ...x, moves: x.moves.map((m) => ({ ...m })) }));
    const active = p[initialPlayerIndex];
    setPlayerTeam(p);
    setEnemyTeam(e);
    setPlayerActive(initialPlayerIndex);
    setEnemyActive(initialEnemyIndex);
    displayPlayerTeamRef.current = p;
    displayEnemyTeamRef.current = e;
    displayPlayerActiveRef.current = initialPlayerIndex;
    displayEnemyActiveRef.current = initialEnemyIndex;
    setParticipants(active?.slotIndex ? [active.slotIndex] : []);
    setMessage(ptBR.escolherAcao(active?.name || "Pokemon"));
    setBusy(false);
    setResult("ongoing");
    setPhase("PLAYER_CHOOSE");
    setEventQueue([]);
    setPartyOpen(false);
    const initialWeather = initialFieldState?.weather || "none";
    setFieldState({
      weather: initialWeather,
      weatherTurns: initialWeather === "none" ? 0 : Math.max(1, Number(initialFieldState?.weatherTurns || 5)),
      playerReflectTurns: Math.max(0, Number(initialFieldState?.playerReflectTurns || 0)),
      enemyReflectTurns: Math.max(0, Number(initialFieldState?.enemyReflectTurns || 0)),
      playerLightScreenTurns: Math.max(0, Number(initialFieldState?.playerLightScreenTurns || 0)),
      enemyLightScreenTurns: Math.max(0, Number(initialFieldState?.enemyLightScreenTurns || 0)),
      playerSpikesLayers: Math.max(0, Math.min(3, Number(initialFieldState?.playerSpikesLayers || 0))),
      enemySpikesLayers: Math.max(0, Math.min(3, Number(initialFieldState?.enemySpikesLayers || 0))),
      playerStealthRock: Boolean(initialFieldState?.playerStealthRock),
      enemyStealthRock: Boolean(initialFieldState?.enemyStealthRock),
    });
    actionLockRef.current = false;
    attackCountRef.current = 0;
    pendingResolutionRef.current = null;
    setEnemySpriteIdx(0);
    setPlayerSpriteIdx(0);
    cameraX.setValue(0);
    cameraY.setValue(0);
    cameraIdleY.setValue(0);
    cameraScale.setValue(1);
    timelineHandledHitRef.current = false;
    setFxKind("none");
    setFlashOverlayVariant("none");
    setPendingStatusPulse("none");
    fxOpacity.setValue(0);
    fxTravelX.setValue(0);
    fxTravelY.setValue(0);
    flashOverlayOpacity.setValue(0);
    resetCaptureFx();
    anim.resetOpacity("player");
    anim.resetOpacity("enemy");
    anim.playerHpAnim.setValue(active ? active.hpCurrent / Math.max(1, active.hpTotal) : 1);
    anim.enemyHpAnim.setValue(e[initialEnemyIndex] ? e[initialEnemyIndex].hpCurrent / Math.max(1, e[initialEnemyIndex].hpTotal) : 1);
    Animated.sequence([
      Animated.timing(flash, { toValue: 1, duration: 130, useNativeDriver: true }),
      Animated.timing(flash, { toValue: 0, duration: 260, useNativeDriver: true }),
    ]).start();
    if (flags.enableBattleSpriteReactions) {
      void anim.animateSummon("enemy");
      void anim.animateSummon("player");
    }
    // reinicia apenas ao abrir a cena; evita reset de estado no meio da batalha
    // quando o time externo atualiza (ex.: sync de HP em tempo real)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  useEffect(() => {
    setEnemySpriteIdx(0);
  }, [activeEnemy?.speciesId]);

  useEffect(() => {
    setPlayerSpriteIdx(0);
  }, [activePlayer?.speciesId]);

  async function processEventQueue(events: BattleTurnEvent[]) {
    attackCountRef.current = 0;
    for (const ev of events) {
      if (!mountedRef.current) return;
      if (ev.text) setMessage(ev.text);

      if (ev.type === "attack") {
        attackCountRef.current += 1;
        setPhase(attackCountRef.current === 1 ? "EXECUTE_FIRST_ACTION" : "EXECUTE_SECOND_ACTION");
        if (ev.moveStage === "execute" && ev.side && ev.semiInvulnerablePhase) {
          await anim.animateSemiInvulnerableExit(ev.side);
        }
        if (ev.side) {
          if (flags.enableBattleTimeline) {
            await playMoveTimeline(ev.side, ev);
            await wait(280);
          } else {
            await focusOnTarget(ev.side, 130);
            if (flags.enableBattleSpriteReactions) {
              if (ev.moveStage === "charge" && ev.semiInvulnerablePhase) {
                await anim.animateCast(ev.side);
              } else {
                await anim.animateAttack(ev.side);
              }
            }
            await wait(360);
          }
          if (ev.moveStage === "charge" && ev.semiInvulnerablePhase) {
            await anim.animateSemiInvulnerableEnter(ev.side, ev.semiInvulnerablePhase);
            await wait(120);
          }
        }
        continue;
      }
      if (ev.type === "hit") {
        if (flags.enableBattleTimeline && timelineHandledHitRef.current) {
          timelineHandledHitRef.current = false;
          await wait(180);
          continue;
        }
        if (ev.side && flags.enableBattleSpriteReactions) await anim.animateHit(ev.side);
        const isCriticalHit = String(ev.text || "").toLowerCase().includes("crit");
        if (isCriticalHit) await playCriticalShake();
        else await playHitShake();
        await resetCamera();
        await wait(780);
        continue;
      }
      if (ev.type === "switch" && ev.side) {
        if (typeof ev.activeIndex === "number" && ev.activeIndex >= 0) {
          if (ev.side === "player") {
            displayPlayerActiveRef.current = ev.activeIndex;
            setPlayerActive(ev.activeIndex);
          } else {
            displayEnemyActiveRef.current = ev.activeIndex;
            setEnemyActive(ev.activeIndex);
          }
        }
        if (flags.enableBattleSpriteReactions) {
          const t = String(ev.text || "").toLowerCase();
          if (t.includes("voltou")) await anim.animateSwitch(ev.side);
          else await anim.animateSummon(ev.side);
        }
        await wait(160);
        continue;
      }
      if (ev.type === "hp" && ev.side != null) {
        const pct = (ev.hpCurrent || 0) / Math.max(1, ev.hpTotal || 1);
        await anim.animateHp(ev.side, pct);
        if (ev.side === "player") {
          const idx = displayPlayerActiveRef.current;
          const next = displayPlayerTeamRef.current.map((mon, monIndex) =>
            monIndex === idx
              ? {
                ...mon,
                hpCurrent: Math.max(0, Number(ev.hpCurrent ?? mon.hpCurrent)),
                hpTotal: Math.max(1, Number(ev.hpTotal ?? mon.hpTotal)),
              }
              : mon
          );
          displayPlayerTeamRef.current = next;
          setPlayerTeam(next);
        } else {
          const idx = displayEnemyActiveRef.current;
          const next = displayEnemyTeamRef.current.map((mon, monIndex) =>
            monIndex === idx
              ? {
                ...mon,
                hpCurrent: Math.max(0, Number(ev.hpCurrent ?? mon.hpCurrent)),
                hpTotal: Math.max(1, Number(ev.hpTotal ?? mon.hpTotal)),
              }
              : mon
          );
          displayEnemyTeamRef.current = next;
          setEnemyTeam(next);
        }
        await wait(420);
        continue;
      }
      if (ev.type === "status" && ev.side != null) {
        if (ev.side === "player") {
          const idx = displayPlayerActiveRef.current;
          const next = displayPlayerTeamRef.current.map((mon, monIndex) =>
            monIndex === idx ? { ...mon, status: ev.status || "none" } : mon
          );
          displayPlayerTeamRef.current = next;
          setPlayerTeam(next);
        } else {
          const idx = displayEnemyActiveRef.current;
          const next = displayEnemyTeamRef.current.map((mon, monIndex) =>
            monIndex === idx ? { ...mon, status: ev.status || "none" } : mon
          );
          displayEnemyTeamRef.current = next;
          setEnemyTeam(next);
        }
        await wait(180);
        continue;
      }
      if (ev.type === "weather") {
        setFieldState((prev) => ({
          ...prev,
          weather: ev.weather || prev.weather,
          weatherTurns: Math.max(0, Number(ev.weatherTurns ?? prev.weatherTurns)),
        }));
        await wait(900);
        continue;
      }
      if (ev.type === "faint" && ev.side) {
        await anim.animateFaint(ev.side);
        await wait(900);
        continue;
      }
      await wait(900);
    }
    await resetCamera();
  }

  async function queueAutomaticCommittedTurn(args: {
    playerTeam: BattleTeam;
    enemyTeam: BattleTeam;
    playerActive: number;
    enemyActive: number;
    fieldState: BattleFieldState;
  }) {
    const currentPlayer = args.playerTeam[args.playerActive];
    const chargingMoveId = String(currentPlayer?.chargingMoveId || "").trim().toLowerCase();
    if (!currentPlayer || currentPlayer.hpCurrent <= 0 || !chargingMoveId) return false;

    const moveIndex = currentPlayer.moves.findIndex((move) => String(move.id || "").trim().toLowerCase() === chargingMoveId);
    const lockedMove = moveIndex >= 0 ? currentPlayer.moves[moveIndex] : null;
    setMessage(lockedMove ? `${currentPlayer.name} continua ${lockedMove.name}!` : `${currentPlayer.name} continua o movimento!`);
    setPhase("ENEMY_CHOOSE");

    const resolution = resolveTurn({
      playerTeam: args.playerTeam,
      enemyTeam: args.enemyTeam,
      playerActive: args.playerActive,
      enemyActive: args.enemyActive,
      playerAction: { type: "fight", moveIndex: moveIndex >= 0 ? moveIndex : 0 },
      enemyAction: randomEnemyAction(),
      canRun,
      isForcedPlayerSwitch: false,
      typeMultiplier,
      fieldState: args.fieldState,
    });

    if (!mountedRef.current) return true;
    setPhase("RESOLVE_ORDER");
    pendingResolutionRef.current = {
      result: resolution.result,
      playerTeam: resolution.playerTeam,
      enemyTeam: resolution.enemyTeam,
      playerActive: resolution.playerActive,
      enemyActive: resolution.enemyActive,
      fieldState: resolution.fieldState,
    };
    if (resolution.events.length === 0) {
      await finishTurnFlow();
    } else {
      setEventQueue(resolution.events);
    }
    return true;
  }

  async function playVictoryExpFlow(args: {
    playerTeam: BattleTeam;
    enemyTeam: BattleTeam;
    participants: number[];
  }) {
    const defeatedEnemies = args.enemyTeam.filter((enemy) => enemy.hpCurrent <= 0);
    if (!defeatedEnemies.length) return args.playerTeam;

    const eligible = args.playerTeam.filter((mon) =>
      mon.slotIndex != null &&
      args.participants.includes(Number(mon.slotIndex)) &&
      mon.hpTotal > 0
    );
    if (!eligible.length) return args.playerTeam;

    const totalExp = defeatedEnemies.reduce((sum, enemy) => sum + estimateEnemyExpYield(enemy), 0);
    const expPerMon = Math.max(1, Math.floor(totalExp / eligible.length));
    let nextTeam = args.playerTeam.map((mon) => ({ ...mon }));

    for (const mon of eligible) {
      const teamIndex = nextTeam.findIndex((row) => row.slotIndex === mon.slotIndex);
      if (teamIndex < 0) continue;
      let current = { ...nextTeam[teamIndex] };
      let remaining = expPerMon;
      let threshold = Math.max(1, Number(current.expToNext || nextExpThreshold(current.level)));
      let currentExp = Math.max(0, Number(current.expCurrent || 0));

      setMessage(`${current.name} ganhou ${expPerMon} de EXP!`);
      await wait(950);

      while (remaining > 0) {
        const needed = Math.max(1, threshold - currentExp);
        const gain = Math.min(remaining, needed);
        currentExp += gain;
        remaining -= gain;
        current = { ...current, expCurrent: currentExp, expToNext: threshold, expTotal: Math.max(0, Number(current.expTotal || 0)) + gain };
        nextTeam[teamIndex] = current;
        displayPlayerTeamRef.current = nextTeam;
        setPlayerTeam(nextTeam);
        await wait(520);

        if (currentExp >= threshold && remaining >= 0) {
          current = {
            ...current,
            level: current.level + 1,
            expCurrent: 0,
            expToNext: nextExpThreshold(current.level + 1, threshold),
          };
          currentExp = 0;
          threshold = Math.max(1, Number(current.expToNext || threshold));
          nextTeam[teamIndex] = current;
          displayPlayerTeamRef.current = nextTeam;
          setPlayerTeam(nextTeam);
          setMessage(`${current.name} subiu para o nivel ${current.level}!`);
          await wait(1100);
        }
      }
    }

    return nextTeam;
  }

  async function finishTurnFlow() {
    const pending = pendingResolutionRef.current;
    if (!pending || !mountedRef.current) return;

    setPlayerTeam(pending.playerTeam);
    setEnemyTeam(pending.enemyTeam);
    setPlayerActive(pending.playerActive);
    setEnemyActive(pending.enemyActive);
    setFieldState(pending.fieldState);
    displayPlayerTeamRef.current = pending.playerTeam;
    displayEnemyTeamRef.current = pending.enemyTeam;
    displayPlayerActiveRef.current = pending.playerActive;
    displayEnemyActiveRef.current = pending.enemyActive;

    if (pending.result === "ongoing") {
      setPhase("END_TURN");
      const currentPlayer = pending.playerTeam[pending.playerActive];
      const needForcedSwitch = !!currentPlayer && currentPlayer.hpCurrent <= 0;
      const hasReplacement = pending.playerTeam.some((m, idx) => idx !== pending.playerActive && m.hpCurrent > 0);

      if (needForcedSwitch && hasReplacement) {
        setMessage(ptBR.escolhaSubstituto());
        setPhase("FORCED_SWITCH");
        setPartyOpen(true);
        setBusy(false);
        actionLockRef.current = false;
        pendingResolutionRef.current = null;
        return;
      }

      const consumedAutomaticTurn = await queueAutomaticCommittedTurn({
        playerTeam: pending.playerTeam,
        enemyTeam: pending.enemyTeam,
        playerActive: pending.playerActive,
        enemyActive: pending.enemyActive,
        fieldState: pending.fieldState,
      });
      if (consumedAutomaticTurn) {
        return;
      }

      if (currentPlayer?.slotIndex != null) {
        try {
          await onPlayerHpSync?.({ slotIndex: currentPlayer.slotIndex, hpCurrent: currentPlayer.hpCurrent });
        } catch {
          // ignore
        }
      }
      if (!mountedRef.current) return;
      await resetCamera();
      setMessage(ptBR.escolherAcao(currentPlayer?.name || "Pokemon"));
      setPhase("PLAYER_CHOOSE");
      setBusy(false);
      actionLockRef.current = false;
      pendingResolutionRef.current = null;
      return;
    }

    setPhase("END_TURN");
    let finalPlayerTeam = pending.playerTeam;
    if (pending.result === "victory") {
      finalPlayerTeam = await playVictoryExpFlow({
        playerTeam: pending.playerTeam,
        enemyTeam: pending.enemyTeam,
        participants,
      });
      if (!mountedRef.current) return;
      setPlayerTeam(finalPlayerTeam);
      displayPlayerTeamRef.current = finalPlayerTeam;
    }
    setResult(pending.result);
    await onFinish?.({
      result: pending.result,
      playerTeam: finalPlayerTeam,
      enemyTeam: pending.enemyTeam,
      playerActive: pending.playerActive,
      enemyActive: pending.enemyActive,
      participants,
    });
    if (!mountedRef.current) return;
    await resetCamera();
    setBusy(false);
    actionLockRef.current = false;
    pendingResolutionRef.current = null;
    setPhase("IDLE");
  }

  useEffect(() => {
    if (!eventQueue.length || !busy) return;
    let active = true;
    (async () => {
      await processEventQueue(eventQueue);
      if (!active || !mountedRef.current) return;
      setEventQueue([]);
      await finishTurnFlow();
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventQueue, busy]);

  const runTurn = async (playerAction: BattleAction) => {
    if (!activePlayer || !activeEnemy) return;
    const canRunFromPhase = phase === "PLAYER_CHOOSE" || (phase === "FORCED_SWITCH" && playerAction.type === "switch");
    if (result !== "ongoing" || !canRunFromPhase || busy || actionLockRef.current) return;
    if (phase === "FORCED_SWITCH" && playerAction.type !== "switch") return;

    if (playerAction.type === "switch") {
      const target = playerTeam[playerAction.targetIndex];
      const validTarget =
        !!target &&
        playerAction.targetIndex !== playerActive &&
        Number(target.hpCurrent) > 0;
      if (!validTarget) {
        setPartyOpen(false);
        setMessage("Esse Pokemon nao pode entrar agora.");
        return;
      }
    }

    actionLockRef.current = true;
    setBusy(true);
    setPartyOpen(false);

    try {
      if (playerAction.type === "switch") {
        const next = playerTeam[playerAction.targetIndex];
        if (next?.slotIndex != null) {
          setParticipants((prev) => (prev.includes(next.slotIndex!) ? prev : [...prev, next.slotIndex!]));
        }
      }

      setPhase("ENEMY_CHOOSE");
      const resolution = resolveTurn({
        playerTeam,
        enemyTeam,
        playerActive,
        enemyActive,
        playerAction,
        enemyAction: randomEnemyAction(),
        canRun,
        isForcedPlayerSwitch: phase === "FORCED_SWITCH",
        typeMultiplier,
        fieldState,
      });

      if (!mountedRef.current) return;
      setPhase("RESOLVE_ORDER");
      pendingResolutionRef.current = {
        result: resolution.result,
        playerTeam: resolution.playerTeam,
        enemyTeam: resolution.enemyTeam,
        playerActive: resolution.playerActive,
        enemyActive: resolution.enemyActive,
        fieldState: resolution.fieldState,
      };
      if (resolution.events.length === 0) {
        await finishTurnFlow();
      } else {
        setEventQueue(resolution.events);
      }
    } catch {
      if (!mountedRef.current) return;
      setMessage("Nao foi possivel concluir a acao. Tente novamente.");
      setPhase("PLAYER_CHOOSE");
      setBusy(false);
      actionLockRef.current = false;
      pendingResolutionRef.current = null;
    }
  };

  const attemptCapture = async (ballId: string) => {
    if (!onTryCapture || !activeEnemy) return;
    if (result !== "ongoing" || phase !== "PLAYER_CHOOSE" || busy || actionLockRef.current) return;
    actionLockRef.current = true;
    setBusy(true);
    const ballLabel = balls.find((item) => item.id === ballId)?.name || "Pokebola";
    setMessage(`${ballLabel}, vai!`);
    await playCaptureAnimation(false);
    const out = await onTryCapture(ballId, activeEnemy);
    if (!mountedRef.current) return;
    setMessage(out.message);
    if (out.ok) {
      await playCaptureAnimation(true);
      setResult("victory");
      setPhase("END_TURN");
      await onFinish?.({
        result: "victory",
        playerTeam,
        enemyTeam,
        playerActive,
        enemyActive,
        participants,
      });
      if (!mountedRef.current) return;
      setPhase("IDLE");
    } else {
      resetCaptureFx();
      setPhase("PLAYER_CHOOSE");
    }
    setBusy(false);
    actionLockRef.current = false;
  };

  const weatherLabel =
    fieldState.weather === "sun"
      ? "Sol forte"
      : fieldState.weather === "rain"
        ? "Chuva"
        : fieldState.weather === "sandstorm"
          ? "Temp. Areia"
          : fieldState.weather === "hail"
            ? "Granizo"
            : fieldState.weather === "snow"
              ? "Neve"
              : null;

  const modeLabel = mode === "wild" ? "Selvagem" : mode === "trainer" ? "Treinador" : "PVP";
  const isNight = useMemo(() => {
    const h = new Date().getHours();
    return h >= 18 || h < 6;
  }, []);
  const weatherBackUri = useMemo(() => {
    return resolveWeatherBackground(fieldState.weather, effectiveBattleAssets);
  }, [effectiveBattleAssets, fieldState.weather]);
  const weatherOverlayUri = useMemo(() => {
    return resolveWeatherOverlay(fieldState.weather, effectiveBattleAssets);
  }, [effectiveBattleAssets, fieldState.weather]);
  const skyAssetUri = useMemo(() => {
    const assets = effectiveBattleAssets || {};
    if (isNight && assets.skyNight) return assets.skyNight;
    return assets.skyDay || assets.sky || null;
  }, [effectiveBattleAssets, isNight]);
  const backgroundAssetUri = useMemo(() => {
    const assets = effectiveBattleAssets || {};
    if (weatherBackUri) return weatherBackUri;
    if (isNight && assets.backgroundNight) return assets.backgroundNight;
    return assets.backgroundDay || assets.background || assets.backgroundNight || null;
  }, [effectiveBattleAssets, isNight, weatherBackUri]);
  const groundAssetUri = useMemo(() => {
    const assets = effectiveBattleAssets || {};
    if (isNight && assets.groundNight) return assets.groundNight;
    return assets.groundDay || assets.ground || null;
  }, [effectiveBattleAssets, isNight]);
  const playerPlatformUri = String(
    (isNight ? effectiveBattleAssets?.platformPlayerNight : null) || effectiveBattleAssets?.platformPlayer || ""
  ).trim() || null;
  const enemyPlatformUri = String(
    (isNight ? effectiveBattleAssets?.platformEnemyNight : null) || effectiveBattleAssets?.platformEnemy || ""
  ).trim() || null;
  const hasCustomBg = !!(skyAssetUri || backgroundAssetUri || groundAssetUri);
  const usingBackdropScene = !!backgroundAssetUri && !skyAssetUri && !groundAssetUri;
  const hasExplicitPlatforms = !!(playerPlatformUri || enemyPlatformUri);
  const showGroundLine = !!groundAssetUri || hasExplicitPlatforms;
  const weatherVisualMode = weatherToVisualMode(fieldState.weather);
  const rainDrops = useMemo(
    () =>
      Array.from({ length: 18 }).map((_, i) => ({
        left: (i * 19 + 12) % 360,
        top: (i * 27) % 320,
        opacity: 0.15 + ((i % 4) * 0.12),
        height: 18 + ((i * 5) % 22),
      })),
    []
  );
  const snowFlakes = useMemo(
    () =>
      Array.from({ length: 20 }).map((_, i) => ({
        left: (i * 17 + 8) % 360,
        top: (i * 23) % 320,
        size: 2 + (i % 4),
        opacity: 0.2 + ((i % 3) * 0.2),
      })),
    []
  );
  const sandStreaks = useMemo(
    () =>
      Array.from({ length: 15 }).map((_, i) => ({
        left: (i * 22 + 6) % 360,
        top: (i * 29 + 14) % 320,
        width: 24 + ((i * 9) % 42),
        opacity: 0.08 + ((i % 5) * 0.05),
      })),
    []
  );
  const skyParallaxX = useMemo(
    () => (flags.enableBattleParallax ? Animated.multiply(parallaxDrift, 0.15) : new Animated.Value(0)),
    [flags.enableBattleParallax, parallaxDrift]
  );
  const bgParallaxX = useMemo(
    () => (flags.enableBattleParallax ? Animated.multiply(parallaxDrift, 0.35) : new Animated.Value(0)),
    [flags.enableBattleParallax, parallaxDrift]
  );
  const groundParallaxX = useMemo(
    () => (flags.enableBattleParallax ? Animated.multiply(parallaxDrift, 0.55) : new Animated.Value(0)),
    [flags.enableBattleParallax, parallaxDrift]
  );
  const weatherParallaxX = useMemo(
    () => (flags.enableBattleParallax ? Animated.multiply(parallaxDrift, 0.42) : new Animated.Value(0)),
    [flags.enableBattleParallax, parallaxDrift]
  );
  const cameraTransform = {
    transform: [
      { translateX: flags.enableBattleCamera ? cameraX : 0 },
      { translateY: flags.enableBattleCamera ? Animated.add(cameraY, cameraIdleY) : 0 },
      { scale: flags.enableBattleCamera ? cameraScale : 1 },
    ],
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <LinearGradient colors={bgColors} style={styles.bg}>
          <Animated.View style={[styles.flash, { opacity: flash }]} />
          <View style={styles.scene}>
            <View style={styles.topBadgesRow}>
              <View style={styles.biomeBadge}>
                <Text style={styles.biomeBadgeText}>{biomeLabel(backgroundKind)}</Text>
              </View>
              <View style={styles.modeBadge}>
                <Text style={styles.modeBadgeText}>{modeLabel}</Text>
              </View>
            </View>
            <View style={styles.battleWorldWrap}>
              <Animated.View
                style={[
                  styles.battleCameraContainer,
                  cameraTransform,
                ]}
              >
                {flags.enableLayeredBackgrounds && skyAssetUri ? (
                  <Animated.Image
                    source={{ uri: skyAssetUri }}
                    style={[styles.skyLayerAsset, { transform: [{ translateX: skyParallaxX }] }]}
                    resizeMode="cover"
                  />
                ) : null}
                {flags.enableLayeredBackgrounds && backgroundAssetUri ? (
                  <Animated.Image
                    source={{ uri: backgroundAssetUri }}
                    style={[styles.backgroundLayerAsset, { transform: [{ translateX: bgParallaxX }] }]}
                    resizeMode="cover"
                  />
                ) : null}
                {flags.enableLayeredBackgrounds && groundAssetUri ? (
                  <Animated.Image
                    source={{ uri: groundAssetUri }}
                    style={[styles.groundLayerAsset, { transform: [{ translateX: groundParallaxX }] }]}
                    resizeMode="cover"
                  />
                ) : null}
                {hasCustomBg ? (
                  <View style={[styles.customBgShade, usingBackdropScene ? styles.customBgShadeScene : null]} />
                ) : null}
                <LinearGradient
                  pointerEvents="none"
                  colors={
                    usingBackdropScene
                      ? ["rgba(255,255,255,0.08)", "rgba(255,255,255,0.02)", "rgba(0,0,0,0.08)"]
                      : ["rgba(255,255,255,0.12)", "rgba(255,255,255,0.03)", "rgba(0,0,0,0.10)"]
                  }
                  locations={[0, 0.42, 1]}
                  style={styles.atmosphereGlow}
                />
                <LinearGradient
                  pointerEvents="none"
                  colors={usingBackdropScene ? ["rgba(3,7,18,0)", "rgba(3,7,18,0.32)", "rgba(3,7,18,0.62)"] : ["rgba(3,7,18,0)", "rgba(3,7,18,0.22)", "rgba(3,7,18,0.46)"]}
                  locations={[0, 0.68, 1]}
                  style={styles.floorDepth}
                />
                <View style={styles.vignette} />

                <View style={styles.spritesLayer}>
                  {showGroundLine ? <View style={styles.groundLine} /> : null}
                  {playerPlatformUri ? (
                    <Image source={{ uri: playerPlatformUri }} style={styles.playerGroundAsset} resizeMode="contain" />
                  ) : (
                    <View style={[styles.playerGround, usingBackdropScene ? styles.playerGroundScene : null]} />
                  )}
                  {enemyPlatformUri ? (
                    <Image source={{ uri: enemyPlatformUri }} style={styles.enemyGroundAsset} resizeMode="contain" />
                  ) : (
                    <View style={[styles.enemyGround, usingBackdropScene ? styles.enemyGroundScene : null]} />
                  )}
                  <View
                    pointerEvents="none"
                    style={[
                      styles.enemyContactShadow,
                      usingBackdropScene ? styles.enemyContactShadowScene : null,
                      { transform: [{ scaleX: enemyShadowScale }, { scaleY: Math.max(0.7, enemyShadowScale * 0.82) }] },
                    ]}
                  />
                  <View
                    pointerEvents="none"
                    style={[
                      styles.playerContactShadow,
                      usingBackdropScene ? styles.playerContactShadowScene : null,
                      { transform: [{ scaleX: playerShadowScale }, { scaleY: Math.max(0.7, playerShadowScale * 0.84) }] },
                    ]}
                  />

                  <Animated.View
                    style={[
                      styles.enemySpriteWrap,
                      usingBackdropScene ? styles.enemySpriteWrapScene : null,
                      { opacity: anim.enemyOpacity },
                      {
                        transform: [
                          { translateX: anim.enemyX },
                          { translateX: anim.enemyShake.interpolate({ inputRange: [-1, 1], outputRange: [-5, 5] }) },
                          { translateY: enemyGroundOffsetY },
                          { translateY: anim.enemyY },
                          { scale: anim.enemyScale },
                        ],
                      },
                    ]}
                  >
                    {enemySpriteUri ? (
                      <Image
                        source={{ uri: enemySpriteUri }}
                        style={[styles.enemySprite, { transform: [{ scale: enemySpriteScale }] }]}
                        resizeMode="contain"
                        onError={() => setEnemySpriteIdx((prev) => Math.min(prev + 1, enemyCandidates.length - 1))}
                      />
                    ) : (
                      <Text style={styles.fallback}>{activeEnemy?.name?.slice(0, 1) || "?"}</Text>
                    )}
                    <Animated.View pointerEvents="none" style={[styles.hitFlash, { opacity: anim.enemyHitFlash }]} />
                  </Animated.View>

                  <Animated.View
                    style={[
                      styles.playerSpriteWrap,
                      usingBackdropScene ? styles.playerSpriteWrapScene : null,
                      { opacity: anim.playerOpacity },
                      {
                        transform: [
                          { translateX: anim.playerX },
                          { translateX: anim.playerShake.interpolate({ inputRange: [-1, 1], outputRange: [-6, 6] }) },
                          { translateY: playerGroundOffsetY },
                          { translateY: anim.playerY },
                          { scale: anim.playerScale },
                        ],
                      },
                    ]}
                  >
                    {playerSpriteUri ? (
                      <Image
                        source={{ uri: playerSpriteUri }}
                        style={[styles.playerSprite, { transform: [{ scaleX: playerSpriteMirrored ? -1 : 1 }, { scale: playerSpriteScale }] }]}
                        resizeMode="contain"
                        onError={() => setPlayerSpriteIdx((prev) => Math.min(prev + 1, playerCandidates.length - 1))}
                      />
                    ) : (
                      <Text style={styles.fallback}>{activePlayer?.name?.slice(0, 1) || "?"}</Text>
                    )}
                    <Animated.View pointerEvents="none" style={[styles.hitFlash, { opacity: anim.playerHitFlash }]} />
                  </Animated.View>
                </View>
                {fxKind !== "none" ? (
                  <View pointerEvents="none" style={styles.fxLayer}>
                    {fxKind === "spawn" ? (
                      <Animated.View style={[styles.fxSpawnCore, { backgroundColor: fxTint, opacity: fxOpacity }]} />
                    ) : null}
                    {fxKind === "projectile" ? (
                      <Animated.View
                        style={[
                          styles.fxProjectile,
                          {
                            backgroundColor: fxTint,
                            opacity: fxOpacity,
                            transform: [{ translateX: fxTravelX }, { translateY: fxTravelY }],
                          },
                        ]}
                      />
                    ) : null}
                  </View>
                ) : null}
                <Animated.View
                  pointerEvents="none"
                  style={[
                    styles.captureBeam,
                    {
                      opacity: captureBeamOpacity,
                      transform: [{ scale: captureBeamScale }],
                    },
                  ]}
                />
                <Animated.View
                  pointerEvents="none"
                  style={[
                    styles.captureBall,
                    {
                      opacity: captureBallOpacity,
                      transform: [{ translateX: captureBallX }, { translateY: captureBallY }, { scale: captureBallScale }],
                    },
                  ]}
                >
                  <View style={styles.captureBallTop} />
                  <View style={styles.captureBallCenter} />
                  <View style={styles.captureBallBottom} />
                </Animated.View>
                {flashOverlayVariant !== "none" ? (
                  <Animated.View
                    pointerEvents="none"
                    style={[
                      styles.flashOverlay,
                      flashOverlayVariant === "critical" ? styles.flashOverlayCritical : styles.flashOverlayShield,
                      { opacity: flashOverlayOpacity },
                    ]}
                  />
                ) : null}
                {pendingStatusPulse !== "none" ? (
                  <View pointerEvents="none" style={[styles.statusPulseOverlay, pendingStatusPulse === "buff" ? styles.statusPulseBuff : styles.statusPulseDebuff]} />
                ) : null}
                {flags.enableBattleWeatherOverlay && weatherOverlayUri ? (
                  <Animated.Image
                    source={{ uri: weatherOverlayUri }}
                    resizeMode="cover"
                    style={[styles.weatherOverlayLayer, { transform: [{ translateX: weatherParallaxX }, { translateY: weatherDriftY }] }]}
                  />
                ) : flags.enableBattleWeatherOverlay && weatherVisualMode !== "none" ? (
                  <Animated.View
                    pointerEvents="none"
                    style={[
                      styles.weatherOverlayLayer,
                      { transform: [{ translateX: weatherParallaxX }, { translateY: weatherDriftY }] },
                    ]}
                  >
                    {weatherVisualMode === "rain"
                      ? rainDrops.map((d, idx) => (
                        <View
                          key={`rain-${idx}`}
                          style={[
                            styles.rainDrop,
                            { left: d.left, top: d.top, opacity: d.opacity, height: d.height },
                          ]}
                        />
                      ))
                      : null}
                    {weatherVisualMode === "snow"
                      ? snowFlakes.map((f, idx) => (
                        <View
                          key={`snow-${idx}`}
                          style={[
                            styles.snowFlake,
                            {
                              left: f.left,
                              top: f.top,
                              opacity: f.opacity,
                              width: f.size,
                              height: f.size,
                              borderRadius: f.size / 2,
                            },
                          ]}
                        />
                      ))
                      : null}
                    {weatherVisualMode === "sandstorm" ? (
                      <>
                        <View style={styles.sandTint} />
                        {sandStreaks.map((s, idx) => (
                          <View
                            key={`sand-${idx}`}
                            style={[
                              styles.sandStreak,
                              { left: s.left, top: s.top, width: s.width, opacity: s.opacity },
                            ]}
                          />
                        ))}
                      </>
                    ) : null}
                    {weatherVisualMode === "sun" ? (
                      <>
                        <View style={styles.sunTint} />
                        <View style={styles.sunBloom} />
                      </>
                    ) : null}
                  </Animated.View>
                ) : null}
              </Animated.View>

              <View style={styles.enemyHudWrap}>
                {activeEnemy ? (
                  <BattleHUD
                    name={activeEnemy.name}
                    level={activeEnemy.level}
                    hpCurrent={activeEnemy.hpCurrent}
                    hpTotal={activeEnemy.hpTotal}
                    side="enemy"
                    status={activeEnemy.status}
                    atkStage={activeEnemy.atkStage}
                    defStage={activeEnemy.defStage}
                    spaStage={activeEnemy.spaStage}
                    spdStage={activeEnemy.spdStage}
                    speStage={activeEnemy.speStage}
                    accuracyStage={activeEnemy.accuracyStage}
                    evasionStage={activeEnemy.evasionStage}
                  />
                ) : null}
              </View>
              <View style={styles.playerHudWrap}>
                {activePlayer ? (
                  <BattleHUD
                    name={activePlayer.name}
                    level={activePlayer.level}
                    hpCurrent={activePlayer.hpCurrent}
                    hpTotal={activePlayer.hpTotal}
                    side="player"
                    status={activePlayer.status}
                    expCurrent={activePlayer.expCurrent}
                    expToNext={activePlayer.expToNext}
                    showExpBar
                    atkStage={activePlayer.atkStage}
                    defStage={activePlayer.defStage}
                    spaStage={activePlayer.spaStage}
                    spdStage={activePlayer.spdStage}
                    speStage={activePlayer.speStage}
                    accuracyStage={activePlayer.accuracyStage}
                    evasionStage={activePlayer.evasionStage}
                    showNumericHp
                  />
                ) : null}
              </View>
            </View>
          </View>

          <View style={styles.bottom}>
            {weatherLabel ? (
              <View style={styles.weatherBadge}>
                <Text style={styles.weatherText}>
                  {weatherLabel} {fieldState.weatherTurns > 0 ? `(${fieldState.weatherTurns})` : ""}
                </Text>
              </View>
            ) : null}
            <BattleText text={message} waiting={busy} />
            {result === "ongoing" && phase === "PLAYER_CHOOSE" ? (
              <BattleMenu
                canUseBag={canUseBag}
                canRun={canRun}
                playerActive={activePlayer}
                team={playerTeam}
                currentIndex={playerActive}
                balls={balls}
                busy={busy || phase !== "PLAYER_CHOOSE"}
                onFight={(idx) => runTurn({ type: "fight", moveIndex: idx })}
                onBall={attemptCapture}
                onOpenPokemon={() => setPartyOpen(true)}
                onRun={() => runTurn({ type: "run" })}
              />
            ) : result !== "ongoing" ? (
              <Pressable style={styles.closeBtn} onPress={onClose}>
                <Text style={styles.closeText}>Continuar</Text>
              </Pressable>
            ) : null}
          </View>
        </LinearGradient>
      </SafeAreaView>

      <PartyMenuModal
        visible={partyOpen && result === "ongoing"}
        team={playerTeam}
        currentIndex={playerActive}
        busy={busy || (phase !== "PLAYER_CHOOSE" && phase !== "FORCED_SWITCH")}
        force={phase === "FORCED_SWITCH"}
        onClose={() => {
          if (phase === "FORCED_SWITCH") return;
          setPartyOpen(false);
        }}
        onSelect={(targetIndex) => runTurn({ type: "switch", targetIndex })}
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#000" },
  bg: { flex: 1 },
  skyLayerAsset: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
  },
  backgroundLayerAsset: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1,
  },
  groundLayerAsset: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 2,
  },
  customBgShade: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.18)",
    zIndex: 3,
  },
  customBgShadeScene: {
    backgroundColor: "rgba(0,0,0,0.08)",
  },
  atmosphereGlow: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 3,
  },
  floorDepth: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 4,
  },
  vignette: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.16)",
    zIndex: 4,
  },
  flash: { ...StyleSheet.absoluteFillObject, backgroundColor: "#fff" },
  scene: { flex: 1, paddingHorizontal: 12, paddingTop: 10, paddingBottom: 6, zIndex: 5 },
  battleWorldWrap: {
    flex: 1,
    position: "relative",
    overflow: "hidden",
    borderRadius: 10,
  },
  battleCameraContainer: {
    ...StyleSheet.absoluteFillObject,
  },
  topBadgesRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6, zIndex: 9 },
  biomeBadge: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.26)",
    backgroundColor: "rgba(0,0,0,0.22)",
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  biomeBadgeText: { color: "rgba(255,255,255,0.95)", fontWeight: "900", fontSize: 10, letterSpacing: 0.4 },
  modeBadge: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(125,211,252,0.55)",
    backgroundColor: "rgba(14,116,144,0.25)",
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  modeBadgeText: { color: "#e0f2fe", fontWeight: "900", fontSize: 10, letterSpacing: 0.4 },
  enemyHudWrap: {
    position: "absolute",
    top: 6,
    left: 4,
    right: 4,
    minHeight: 82,
    justifyContent: "flex-start",
    paddingLeft: 4,
    zIndex: 12,
  },
  playerHudWrap: {
    position: "absolute",
    left: 4,
    right: 4,
    bottom: 6,
    minHeight: 92,
    justifyContent: "flex-end",
    paddingRight: 4,
    zIndex: 12,
  },
  spritesLayer: { flex: 1, position: "relative", justifyContent: "flex-end", paddingVertical: 8, zIndex: 5 },
  groundLine: {
    position: "absolute",
    left: 8,
    right: 8,
    bottom: 38,
    height: 2,
    backgroundColor: "rgba(255,255,255,0.16)",
  },
  playerGround: {
    position: "absolute",
    left: "8%",
    bottom: 34,
    width: "36%",
    maxWidth: 170,
    height: 20,
    borderRadius: 999,
    backgroundColor: "rgba(3,7,18,0.34)",
  },
  enemyGround: {
    position: "absolute",
    right: "8%",
    bottom: 102,
    width: "31%",
    maxWidth: 150,
    height: 18,
    borderRadius: 999,
    backgroundColor: "rgba(3,7,18,0.30)",
  },
  playerGroundScene: {
    left: "11%",
    bottom: 38,
    width: "30%",
    maxWidth: 150,
    height: 16,
    backgroundColor: "rgba(2,6,23,0.22)",
  },
  enemyGroundScene: {
    right: "13%",
    bottom: 124,
    width: "22%",
    maxWidth: 108,
    height: 14,
    backgroundColor: "rgba(2,6,23,0.18)",
  },
  playerGroundAsset: {
    position: "absolute",
    left: "6%",
    bottom: 24,
    width: "38%",
    maxWidth: 220,
    height: 56,
  },
  enemyGroundAsset: {
    position: "absolute",
    right: "7%",
    bottom: 137,
    width: "34%",
    maxWidth: 190,
    height: 40,
  },
  enemyContactShadow: {
    position: "absolute",
    right: "15%",
    bottom: 151,
    width: "18%",
    maxWidth: 72,
    height: 12,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.24)",
  },
  playerContactShadow: {
    position: "absolute",
    left: "14%",
    bottom: 46,
    width: "24%",
    maxWidth: 106,
    height: 15,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.28)",
  },
  enemyContactShadowScene: {
    right: "14%",
    bottom: 139,
    width: "15%",
    maxWidth: 62,
    backgroundColor: "rgba(2,6,23,0.18)",
  },
  playerContactShadowScene: {
    left: "16%",
    bottom: 53,
    width: "18%",
    maxWidth: 88,
    backgroundColor: "rgba(2,6,23,0.20)",
  },
  enemySpriteWrap: {
    position: "absolute",
    right: 8,
    bottom: 116,
    width: "46%",
    maxWidth: 240,
    height: 172,
    justifyContent: "flex-end",
    alignItems: "center",
  },
  enemySpriteWrapScene: {
    right: 14,
    bottom: 104,
  },
  playerSpriteWrap: {
    position: "absolute",
    left: 1,
    bottom: -8,
    width: "54%",
    maxWidth: 320,
    height: 260,
    justifyContent: "flex-end",
    alignItems: "center",
  },
  playerSpriteWrapScene: {
    left: 8,
    bottom: -2,
  },
  enemySprite: { width: "96%", height: "96%" },
  playerSprite: { width: "100%", height: "100%" },
  hitFlash: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.42)",
  },
  fallback: { color: COLORS.white, fontWeight: "900", fontSize: 52 },
  weatherOverlayLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 6,
    opacity: 0.7,
  },
  fxLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 7,
    justifyContent: "center",
    alignItems: "center",
  },
  fxSpawnCore: {
    width: 82,
    height: 82,
    borderRadius: 999,
    shadowColor: "#fff",
    shadowOpacity: 0.45,
    shadowRadius: 16,
  },
  fxProjectile: {
    position: "absolute",
    width: 18,
    height: 18,
    borderRadius: 999,
    shadowColor: "#fff",
    shadowOpacity: 0.55,
    shadowRadius: 12,
  },
  captureBeam: {
    position: "absolute",
    right: "18%",
    bottom: 136,
    width: 88,
    height: 88,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.75)",
    backgroundColor: "rgba(125,211,252,0.18)",
    zIndex: 8,
  },
  captureBall: {
    position: "absolute",
    left: "29%",
    bottom: 64,
    width: 26,
    height: 26,
    borderRadius: 999,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: "#111827",
    backgroundColor: "#fff",
    zIndex: 9,
  },
  captureBallTop: {
    height: "48%",
    backgroundColor: "#ef4444",
  },
  captureBallCenter: {
    position: "absolute",
    top: "42%",
    left: 0,
    right: 0,
    height: 4,
    backgroundColor: "#111827",
  },
  captureBallBottom: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },
  flashOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 8,
  },
  flashOverlayShield: {
    backgroundColor: "rgba(125,211,252,0.25)",
  },
  flashOverlayCritical: {
    backgroundColor: "rgba(251,191,36,0.35)",
  },
  statusPulseOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 8,
  },
  statusPulseBuff: {
    backgroundColor: "rgba(74,222,128,0.10)",
  },
  statusPulseDebuff: {
    backgroundColor: "rgba(248,113,113,0.12)",
  },
  rainDrop: {
    position: "absolute",
    width: 2,
    backgroundColor: "rgba(173,216,255,0.9)",
    borderRadius: 999,
    transform: [{ rotate: "18deg" }],
  },
  snowFlake: {
    position: "absolute",
    backgroundColor: "rgba(255,255,255,0.95)",
  },
  sandTint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(194,158,94,0.16)",
  },
  sandStreak: {
    position: "absolute",
    height: 3,
    borderRadius: 999,
    backgroundColor: "rgba(210,180,120,0.75)",
    transform: [{ rotate: "-8deg" }],
  },
  sunTint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(245,158,11,0.12)",
  },
  sunBloom: {
    position: "absolute",
    right: 26,
    top: 20,
    width: 120,
    height: 120,
    borderRadius: 999,
    backgroundColor: "rgba(255,235,160,0.22)",
  },
  bottom: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.24)",
    borderBottomWidth: 0,
    backgroundColor: "rgba(8,10,24,0.98)",
    padding: 11,
    gap: 9,
    zIndex: 7,
  },
  weatherBadge: {
    alignSelf: "flex-start",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.24)",
    backgroundColor: "rgba(255,255,255,0.10)",
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  weatherText: { color: COLORS.white, fontWeight: "800", fontSize: 11 },
  closeBtn: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
  },
  closeText: { color: COLORS.white, fontWeight: "900", fontSize: 12 },
});
