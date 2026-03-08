export type BattleAnimationStep =
  | { type: "cameraFocusAttacker"; duration: number }
  | { type: "cameraFocusTarget"; duration: number }
  | { type: "attackerLunge"; duration: number }
  | { type: "attackerCastPose"; duration: number }
  | { type: "spawnEffect"; effect: string; duration: number }
  | { type: "projectile"; effect: string; duration: number }
  | { type: "targetHit"; duration: number }
  | { type: "targetRecoil"; duration: number }
  | { type: "cameraShake"; duration: number }
  | { type: "cameraCriticalShake"; duration: number }
  | { type: "hpDrop"; duration: number }
  | { type: "statusPulse"; status: string; duration: number }
  | { type: "showText"; text: string; duration: number }
  | { type: "flashOverlay"; variant: string; duration: number }
  | { type: "resetCamera"; duration: number };

export type BattleAnimationHooks = {
  cameraFocusAttacker: (duration: number) => Promise<void>;
  cameraFocusTarget: (duration: number) => Promise<void>;
  attackerLunge: (duration: number) => Promise<void>;
  attackerCastPose: (duration: number) => Promise<void>;
  spawnEffect: (effect: string, duration: number) => Promise<void>;
  projectile: (effect: string, duration: number) => Promise<void>;
  targetHit: (duration: number) => Promise<void>;
  targetRecoil: (duration: number) => Promise<void>;
  cameraShake: (duration: number) => Promise<void>;
  cameraCriticalShake: (duration: number) => Promise<void>;
  hpDrop: (duration: number) => Promise<void>;
  statusPulse: (status: string, duration: number) => Promise<void>;
  showText: (text: string, duration: number) => Promise<void>;
  flashOverlay: (variant: string, duration: number) => Promise<void>;
  resetCamera: (duration: number) => Promise<void>;
};
