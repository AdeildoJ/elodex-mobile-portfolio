import type { BattleAnimationHooks, BattleAnimationStep } from "./battleAnimationTypes";

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, Math.max(0, ms)));

async function runStep(step: BattleAnimationStep, hooks: BattleAnimationHooks) {
  if (step.type === "cameraFocusAttacker") return hooks.cameraFocusAttacker(step.duration);
  if (step.type === "cameraFocusTarget") return hooks.cameraFocusTarget(step.duration);
  if (step.type === "attackerLunge") return hooks.attackerLunge(step.duration);
  if (step.type === "attackerCastPose") return hooks.attackerCastPose(step.duration);
  if (step.type === "spawnEffect") return hooks.spawnEffect(step.effect, step.duration);
  if (step.type === "projectile") return hooks.projectile(step.effect, step.duration);
  if (step.type === "targetHit") return hooks.targetHit(step.duration);
  if (step.type === "targetRecoil") return hooks.targetRecoil(step.duration);
  if (step.type === "cameraShake") return hooks.cameraShake(step.duration);
  if (step.type === "cameraCriticalShake") return hooks.cameraCriticalShake(step.duration);
  if (step.type === "hpDrop") return hooks.hpDrop(step.duration);
  if (step.type === "statusPulse") return hooks.statusPulse(step.status, step.duration);
  if (step.type === "showText") return hooks.showText(step.text, step.duration);
  if (step.type === "flashOverlay") return hooks.flashOverlay(step.variant, step.duration);
  if (step.type === "resetCamera") return hooks.resetCamera(step.duration);
  const _never: never = step;
  void _never;
  return wait(0);
}

export const BattleAnimationEngine = {
  async playMoveSequence(sequence: BattleAnimationStep[], hooks: BattleAnimationHooks) {
    for (const step of sequence) {
      await runStep(step, hooks);
    }
  },
};
