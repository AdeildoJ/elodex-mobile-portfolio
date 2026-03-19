import type { MonetizationProduct, PlayerAccountBackpackEntry, PlayerProductEntitlement } from "../firebase/monetization.service";

type ProductLike =
  | Pick<MonetizationProduct, "id" | "code" | "type" | "name" | "benefits" | "configuration">
  | Pick<PlayerProductEntitlement, "productId" | "productCode" | "productType" | "productName" | "benefits">
  | Pick<PlayerAccountBackpackEntry, "productId" | "productCode" | "productType" | "name" | "benefits">
  | Record<string, unknown>;
export type ProductRouteKind = "character_bag" | "eggs" | "biome_access" | "gym_ticket" | "trainer_license" | "battle_castle_ticket" | "exclusive_event_ticket" | "gym_global" | "account";
export type ProductRouteInfo = {
  kind: ProductRouteKind;
  scope: "character" | "account";
  message: string;
  checkoutMessage: string;
  confirmationHint: string;
  uiLocation: string;
  itemId?: string;
};
const s = (value: unknown) => String(value || "").trim().toLowerCase();
const n = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const raw = (product: ProductLike | null | undefined) => (product && typeof product === "object" ? product : null) as Record<string, any> | null;
const benefitsOf = (product: ProductLike | null | undefined) => {
  const current = raw(product);
  return (current?.benefits && typeof current.benefits === "object" ? current.benefits : null) as Record<string, any> | null;
};
const metadataOf = (product: ProductLike | null | undefined) => {
  const current = benefitsOf(product);
  return (current?.metadata && typeof current.metadata === "object" ? current.metadata : null) as Record<string, any> | null;
};
const configOf = (product: ProductLike | null | undefined) => {
  const current = raw(product);
  return (current?.configuration && typeof current.configuration === "object" ? current.configuration : null) as Record<string, any> | null;
};
export function getProductIdentity(product: ProductLike | null | undefined) {
  const current = raw(product);
  const metadata = metadataOf(product);
  const config = configOf(product);
  const benefits = benefitsOf(product);
  return {
    raw: current,
    metadata,
    config,
    type: s(current?.type ?? current?.productType ?? metadata?.productType),
    code: s(current?.code ?? current?.productCode),
    id: s(current?.id ?? current?.productId),
    name: s(current?.name ?? current?.productName),
    ticketSubtype: s(metadata?.ticketSubtype ?? metadata?.ticketType ?? config?.ticketSubtype ?? config?.ticketType),
    eggType: s(metadata?.eggType ?? config?.eggType),
    slotScope: s(metadata?.slotScope ?? config?.slotScope),
    storeCategory: s(metadata?.storeCategory),
    gymMainTeamSlots: n(benefits?.gymMainTeamSlots),
    gymDefenseSlotsAdded: n(benefits?.gymDefenseSlotsAdded),
    battleCastleTicketCount: n(benefits?.battleCastleTicketCount),
    exclusiveEventTicketCount: n(benefits?.exclusiveEventTicketCount),
    gymTicketCount: n(benefits?.gymTicketCount),
    biomeTicketCount: n(benefits?.biomeTicketCount),
    mysteryEggCount: n(benefits?.mysteryEggCount),
    ivResetCount: n(benefits?.ivResetCount),
    incubators: n(benefits?.incubators),
    trainerLicenseDays: n(benefits?.trainerLicenseDays),
    expansionSlots: n(benefits?.expansionSlots),
  };
}
export function isGymMainTeamSlotProduct(product: ProductLike | null | undefined) { const info = getProductIdentity(product); return info.type === "gym_main_team_slot" || (info.type === "slot" && info.slotScope === "gym") || ["gym-main-team-slot", "slot-de-defesa", "gym-slot"].includes(info.code) || ["gym-main-team-slot", "slot-de-defesa", "gym-slot"].includes(info.id) || ((info.gymMainTeamSlots > 0 || info.gymDefenseSlotsAdded > 0) && (info.storeCategory === "gym" || info.type.includes("gym") || info.code.includes("gym") || info.id.includes("gym") || info.name.includes("slot de defesa") || info.name.includes("slot do time principal"))); }
export const isBiomeTicketProduct = (product: ProductLike | null | undefined) => { const info = getProductIdentity(product); return info.type === "biome_ticket" || (info.type === "ticket" && info.ticketSubtype === "biome") || info.biomeTicketCount > 0; };
export const isEggProduct = (product: ProductLike | null | undefined) => { const info = getProductIdentity(product); return info.type === "mystery_egg" || info.type === "gym_type_egg" || info.type === "egg" || info.eggType === "mysterious" || info.eggType === "type" || info.mysteryEggCount > 0; };
export const isIncubatorProduct = (product: ProductLike | null | undefined) => { const info = getProductIdentity(product); return info.type === "incubator" || info.incubators > 0; };
export const isIvResetProduct = (product: ProductLike | null | undefined) => { const info = getProductIdentity(product); return info.type === "iv_reset" || info.ivResetCount > 0; };
export const isTrainerLicenseProduct = (product: ProductLike | null | undefined) => { const info = getProductIdentity(product); return info.type === "trainer_license" || info.trainerLicenseDays > 0; };
export const isGymTicketProduct = (product: ProductLike | null | undefined) => { const info = getProductIdentity(product); return info.type === "gym_ticket" || (info.type === "ticket" && info.ticketSubtype === "gym") || info.gymTicketCount > 0; };
export const isBattleCastleTicketProduct = (product: ProductLike | null | undefined) => { const info = getProductIdentity(product); return info.type === "battle_castle_ticket" || (info.type === "ticket" && info.ticketSubtype === "castle") || info.battleCastleTicketCount > 0; };
export const isExclusiveEventTicketProduct = (product: ProductLike | null | undefined) => { const info = getProductIdentity(product); return info.type === "exclusive_event_ticket" || (info.type === "ticket" && info.ticketSubtype === "event") || info.exclusiveEventTicketCount > 0; };
export const isExpansionProduct = (product: ProductLike | null | undefined) => { const info = getProductIdentity(product); return info.type === "expansion" || info.expansionSlots > 0; };
export const isGymGlobalProduct = (product: ProductLike | null | undefined) => { const info = getProductIdentity(product); return ["gym_police_npc", "gym_extra_npc", "gym_badges", "gym_storage_upgrade"].includes(info.type); };
export function resolveProductRoute(product: ProductLike | null | undefined): ProductRouteInfo {
  const info = getProductIdentity(product);
  const label = String(info.raw?.name ?? info.raw?.productName ?? "Beneficio");
  if (isGymMainTeamSlotProduct(product)) return { kind: "character_bag", scope: "character", message: label + " foi enviado para a mochila do personagem.", checkoutMessage: label + " foi pago e enviado para a mochila do personagem.", confirmationHint: "Vai para a mochila do personagem atual como item usavel do GYM.", uiLocation: "Mochila > Itens do personagem", itemId: "gym-main-team-slot-token" };
  if (isIncubatorProduct(product)) return { kind: "character_bag", scope: "character", message: label + " foi enviado para a mochila do personagem.", checkoutMessage: label + " foi pago e enviado para a mochila do personagem.", confirmationHint: "Vai para a mochila do personagem atual como incubadora de uso manual por dias.", uiLocation: "Mochila > Itens do personagem / Painel de Ovos", itemId: "egg-incubator" };
  if (isIvResetProduct(product)) return { kind: "character_bag", scope: "character", message: label + " foi enviado para a mochila do personagem.", checkoutMessage: label + " foi pago e enviado para a mochila do personagem.", confirmationHint: "Vai para a mochila do personagem atual como item de uso manual.", uiLocation: "Mochila > Itens do personagem", itemId: "iv-reset-token" };
  if (isBiomeTicketProduct(product)) return { kind: "biome_access", scope: "character", message: "Acesso ao bioma liberado para este personagem.", checkoutMessage: "Pagamento aprovado e acesso ao bioma liberado para este personagem.", confirmationHint: "Libera acesso ao bioma para este personagem. Nao vai para a mochila.", uiLocation: "Explorar > Biomas liberados" };
  if (isEggProduct(product)) return { kind: "eggs", scope: "character", message: label + " foi entregue ao personagem e aguarda incubacao manual.", checkoutMessage: label + " foi pago e entregue ao personagem para incubacao manual.", confirmationHint: "O ovo fica vinculado ao personagem atual e aparece no painel de ovos com destino final para time ou BOX.", uiLocation: "Painel de Ovos / Time ou BOX apos chocagem" };
  if (isGymTicketProduct(product)) return { kind: "gym_ticket", scope: "account", message: label + " foi aplicado como beneficio estrutural do GYM.", checkoutMessage: label + " foi pago e aplicado como beneficio estrutural do GYM.", confirmationHint: "Uso estrutural/global para criacao ou renovacao de GYM.", uiLocation: "Fluxo de criacao/renovacao de GYM" };
  if (isTrainerLicenseProduct(product)) return { kind: "trainer_license", scope: "account", message: label + " foi aplicado como beneficio compartilhado da conta.", checkoutMessage: label + " foi pago e aplicado como beneficio compartilhado da conta.", confirmationHint: "Beneficio global da conta com impacto em exploracao e bonus.", uiLocation: "Home da conta / Exploracao" };
  if (isBattleCastleTicketProduct(product)) return { kind: "battle_castle_ticket", scope: "account", message: label + " foi aplicado como ticket estrutural do Castelo de Batalha.", checkoutMessage: label + " foi pago e aplicado como ticket estrutural do Castelo de Batalha.", confirmationHint: "Beneficio estrutural/global. A gameplay dedicada ainda depende de superficie propria.", uiLocation: "Sem tela dedicada no mobile" };
  if (isExclusiveEventTicketProduct(product)) return { kind: "exclusive_event_ticket", scope: "account", message: label + " foi aplicado como ticket estrutural de evento.", checkoutMessage: label + " foi pago e aplicado como ticket estrutural de evento.", confirmationHint: "Beneficio estrutural/global. A gameplay dedicada ainda depende de superficie propria.", uiLocation: "Sem tela dedicada no mobile" };
  if (isExpansionProduct(product) || isGymGlobalProduct(product)) return { kind: isGymGlobalProduct(product) ? "gym_global" : "account", scope: "account", message: label + " foi aplicado como beneficio estrutural compartilhado.", checkoutMessage: label + " foi pago e aplicado como beneficio estrutural compartilhado.", confirmationHint: "Esse beneficio e estrutural ou compartilhado. Nao vai para a mochila do personagem.", uiLocation: "Beneficios estruturais da conta/GYM" };
  return { kind: "account", scope: "account", message: label + " foi aplicado a conta ou a estrutura global do GYM.", checkoutMessage: label + " foi pago e aplicado a conta ou a estrutura global do GYM.", confirmationHint: "Esse beneficio e estrutural ou compartilhado. Nao vai para a mochila do personagem.", uiLocation: "Conta / beneficios compartilhados" };
}
export const isCharacterDeliveredProduct = (product: ProductLike | null | undefined) => resolveProductRoute(product).scope === "character";
export const isAccountOnlyProduct = (product: ProductLike | null | undefined) => resolveProductRoute(product).scope === "account";

