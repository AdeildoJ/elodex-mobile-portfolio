import type { VipBenefitSet } from "../firebase/monetization.service";

export type BonusContext = {
  baseXp?: number;
  baseMoney?: number;
  vipBenefits?: VipBenefitSet | null;
};

function toSafeNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function getVipXpMultiplier(vipBenefits?: VipBenefitSet | null) {
  const bonusPercent = Math.max(0, toSafeNumber(vipBenefits?.xpBonusPercent));
  return 1 + bonusPercent / 100;
}

export function getVipMoneyMultiplier(vipBenefits?: VipBenefitSet | null) {
  const bonusPercent = Math.max(0, toSafeNumber(vipBenefits?.moneyBonusPercent));
  return 1 + bonusPercent / 100;
}

export function applyPreparedXpBonus({ baseXp = 0, vipBenefits }: BonusContext) {
  return Math.round(Math.max(0, toSafeNumber(baseXp)) * getVipXpMultiplier(vipBenefits));
}

export function applyPreparedMoneyBonus({ baseMoney = 0, vipBenefits }: BonusContext) {
  return Math.round(Math.max(0, toSafeNumber(baseMoney)) * getVipMoneyMultiplier(vipBenefits));
}
