import { useRef, useMemo } from "react";
import { Animated, Easing } from "react-native";

export function useBattleAnimationController() {
  const playerX = useRef(new Animated.Value(0)).current;
  const enemyX = useRef(new Animated.Value(0)).current;
  const playerY = useRef(new Animated.Value(0)).current;
  const enemyY = useRef(new Animated.Value(0)).current;
  const playerScale = useRef(new Animated.Value(1)).current;
  const enemyScale = useRef(new Animated.Value(1)).current;
  const playerShake = useRef(new Animated.Value(0)).current;
  const enemyShake = useRef(new Animated.Value(0)).current;
  const playerOpacity = useRef(new Animated.Value(1)).current;
  const enemyOpacity = useRef(new Animated.Value(1)).current;
  const playerHitFlash = useRef(new Animated.Value(0)).current;
  const enemyHitFlash = useRef(new Animated.Value(0)).current;
  const playerHpAnim = useRef(new Animated.Value(1)).current;
  const enemyHpAnim = useRef(new Animated.Value(1)).current;

  const animateAttack = (side: "player" | "enemy") =>
    new Promise<void>((resolve) => {
      const v = side === "player" ? playerX : enemyX;
      const s = side === "player" ? playerScale : enemyScale;
      const dir = side === "player" ? -34 : 34;
      Animated.parallel([
        Animated.sequence([
          Animated.timing(v, { toValue: dir, duration: 120, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
          Animated.timing(v, { toValue: 0, duration: 120, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
        ]),
        Animated.sequence([
          Animated.timing(s, { toValue: 1.04, duration: 110, easing: Easing.out(Easing.quad), useNativeDriver: true }),
          Animated.timing(s, { toValue: 1, duration: 120, easing: Easing.in(Easing.quad), useNativeDriver: true }),
        ]),
      ]).start(() => resolve());
    });

  const animateHit = (side: "player" | "enemy") =>
    new Promise<void>((resolve) => {
      const v = side === "player" ? playerShake : enemyShake;
      const s = side === "player" ? playerScale : enemyScale;
      const f = side === "player" ? playerHitFlash : enemyHitFlash;
      Animated.parallel([
        Animated.sequence([
          Animated.timing(v, { toValue: 1, duration: 40, useNativeDriver: true }),
          Animated.timing(v, { toValue: -1, duration: 40, useNativeDriver: true }),
          Animated.timing(v, { toValue: 1, duration: 35, useNativeDriver: true }),
          Animated.timing(v, { toValue: 0, duration: 35, useNativeDriver: true }),
        ]),
        Animated.sequence([
          Animated.timing(s, { toValue: 0.92, duration: 70, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
          Animated.timing(s, { toValue: 1, duration: 90, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
        ]),
        Animated.sequence([
          Animated.timing(f, { toValue: 0.9, duration: 60, useNativeDriver: true }),
          Animated.timing(f, { toValue: 0, duration: 120, useNativeDriver: true }),
        ]),
      ]).start(() => resolve());
    });

  const animateCast = (side: "player" | "enemy") =>
    new Promise<void>((resolve) => {
      const s = side === "player" ? playerScale : enemyScale;
      const y = side === "player" ? playerY : enemyY;
      Animated.parallel([
        Animated.sequence([
          Animated.timing(s, { toValue: 1.06, duration: 90, easing: Easing.out(Easing.quad), useNativeDriver: true }),
          Animated.timing(s, { toValue: 1, duration: 110, easing: Easing.in(Easing.quad), useNativeDriver: true }),
        ]),
        Animated.sequence([
          Animated.timing(y, { toValue: -5, duration: 80, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
          Animated.timing(y, { toValue: 0, duration: 110, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
        ]),
      ]).start(() => resolve());
    });

  const animateRecoil = (side: "player" | "enemy") =>
    new Promise<void>((resolve) => {
      const x = side === "player" ? playerX : enemyX;
      const s = side === "player" ? playerScale : enemyScale;
      const back = side === "player" ? 12 : -12;
      Animated.parallel([
        Animated.sequence([
          Animated.timing(x, { toValue: back, duration: 80, useNativeDriver: true }),
          Animated.timing(x, { toValue: 0, duration: 90, useNativeDriver: true }),
        ]),
        Animated.sequence([
          Animated.timing(s, { toValue: 0.96, duration: 85, useNativeDriver: true }),
          Animated.timing(s, { toValue: 1, duration: 95, useNativeDriver: true }),
        ]),
      ]).start(() => resolve());
    });

  const animateStatusPulse = (side: "player" | "enemy") =>
    new Promise<void>((resolve) => {
      const f = side === "player" ? playerHitFlash : enemyHitFlash;
      Animated.sequence([
        Animated.timing(f, { toValue: 0.55, duration: 90, useNativeDriver: true }),
        Animated.timing(f, { toValue: 0.15, duration: 120, useNativeDriver: true }),
        Animated.timing(f, { toValue: 0, duration: 120, useNativeDriver: true }),
      ]).start(() => resolve());
    });

  const animateSwitch = (side: "player" | "enemy") =>
    new Promise<void>((resolve) => {
      const x = side === "player" ? playerX : enemyX;
      const o = side === "player" ? playerOpacity : enemyOpacity;
      const dir = side === "player" ? -28 : 28;
      Animated.sequence([
        Animated.parallel([
          Animated.timing(x, { toValue: dir, duration: 140, useNativeDriver: true }),
          Animated.timing(o, { toValue: 0.15, duration: 140, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(x, { toValue: 0, duration: 120, useNativeDriver: true }),
          Animated.timing(o, { toValue: 1, duration: 120, useNativeDriver: true }),
        ]),
      ]).start(() => resolve());
    });

  const animateSummon = (side: "player" | "enemy") =>
    new Promise<void>((resolve) => {
      const o = side === "player" ? playerOpacity : enemyOpacity;
      const y = side === "player" ? playerY : enemyY;
      o.setValue(1);
      y.setValue(16);
      Animated.parallel([
        Animated.timing(y, { toValue: 0, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]).start(() => resolve());
    });

  const animateFaint = (side: "player" | "enemy") =>
    new Promise<void>((resolve) => {
      const o = side === "player" ? playerOpacity : enemyOpacity;
      const y = side === "player" ? playerY : enemyY;
      Animated.parallel([
        Animated.timing(o, { toValue: 0, duration: 420, easing: Easing.in(Easing.quad), useNativeDriver: true }),
        Animated.timing(y, { toValue: 16, duration: 420, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      ]).start(() => resolve());
    });

  const animateHp = (side: "player" | "enemy", pct: number) =>
    new Promise<void>((resolve) => {
      const v = side === "player" ? playerHpAnim : enemyHpAnim;
      Animated.timing(v, {
        toValue: Math.max(0, Math.min(1, pct)),
        duration: 350,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }).start(() => resolve());
    });

  const animateSemiInvulnerableEnter = (
    side: "player" | "enemy",
    phase: "airborne" | "underground" | "underwater" | "vanished" | null | undefined
  ) =>
    new Promise<void>((resolve) => {
      const y = side === "player" ? playerY : enemyY;
      const o = side === "player" ? playerOpacity : enemyOpacity;
      const s = side === "player" ? playerScale : enemyScale;
      const offset =
        phase === "airborne" ? -54 :
          phase === "underground" ? 42 :
            phase === "underwater" ? 28 :
              phase === "vanished" ? -10 :
                18;
      const opacity =
        phase === "underground" || phase === "underwater" || phase === "vanished" ? 0.08 : 0.2;
      Animated.parallel([
        Animated.timing(y, { toValue: offset, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(o, { toValue: opacity, duration: 220, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(s, { toValue: phase === "airborne" ? 1.04 : 0.96, duration: 220, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      ]).start(() => resolve());
    });

  const animateSemiInvulnerableExit = (side: "player" | "enemy") =>
    new Promise<void>((resolve) => {
      const y = side === "player" ? playerY : enemyY;
      const o = side === "player" ? playerOpacity : enemyOpacity;
      const s = side === "player" ? playerScale : enemyScale;
      Animated.parallel([
        Animated.timing(y, { toValue: 0, duration: 180, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(o, { toValue: 1, duration: 180, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(s, { toValue: 1, duration: 180, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      ]).start(() => resolve());
    });

  const resetOpacity = (side: "player" | "enemy") => {
    const o = side === "player" ? playerOpacity : enemyOpacity;
    const y = side === "player" ? playerY : enemyY;
    const s = side === "player" ? playerScale : enemyScale;
    const f = side === "player" ? playerHitFlash : enemyHitFlash;
    o.setValue(1);
    y.setValue(0);
    s.setValue(1);
    f.setValue(0);
  };

  const stopAll = () => {
    playerX.stopAnimation();
    enemyX.stopAnimation();
    playerY.stopAnimation();
    enemyY.stopAnimation();
    playerScale.stopAnimation();
    enemyScale.stopAnimation();
    playerShake.stopAnimation();
    enemyShake.stopAnimation();
    playerOpacity.stopAnimation();
    enemyOpacity.stopAnimation();
    playerHitFlash.stopAnimation();
    enemyHitFlash.stopAnimation();
    playerHpAnim.stopAnimation();
    enemyHpAnim.stopAnimation();
  };

  return useMemo(() => ({
    playerX,
    enemyX,
    playerY,
    enemyY,
    playerScale,
    enemyScale,
    playerShake,
    enemyShake,
    playerOpacity,
    enemyOpacity,
    playerHitFlash,
    enemyHitFlash,
    playerHpAnim,
    enemyHpAnim,
    animateAttack,
    animateCast,
    animateHit,
    animateRecoil,
    animateStatusPulse,
    animateFaint,
    animateSwitch,
    animateSummon,
    animateHp,
    animateSemiInvulnerableEnter,
    animateSemiInvulnerableExit,
    resetOpacity,
    stopAll,
  }), []);
}
