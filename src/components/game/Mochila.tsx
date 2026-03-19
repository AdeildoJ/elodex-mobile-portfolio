import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Easing,
  Image,
  Modal,
  ScrollView,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { ArrowUp, Pencil, X, Check, Sparkles, RefreshCw } from "lucide-react-native";
import { COLORS } from "../../theme/colors";
import type {
  ActionResult,
  BagTabKey,
  InventoryEntry,
  PlayerTier,
  TeamPokemonUI,
} from "./types";
import { BagItems } from "./BagItems";
import { Pokebolas } from "./Pokebolas";
import {
  applyLearnsetConstraints,
  getMoveLearnMethodsForSpeciesMove,
  getTutorMovesForSpecies,
  type RelearnSource,
} from "./logic/move-learning.service";
import { resolveEvolutionTarget } from "./logic/evolution.service";

// Catalogo local (leve): moves.json
import movesDex from "../../data/pokemon/moves.json";
import speciesDex from "../../data/pokemon/pokemonSpecies.json";

type MoveEntry = {
  name: string;
  type?: string;
  power?: number | null;
  accuracy?: number | null;
  pp?: number | null;
  flavorText?: string;
  effectText?: string;
};

type AbilityEntry = { abilityId: string; isHidden: boolean; slot: number };
type RelearnFilter = "all" | "level-up" | "machine" | "egg" | "tutor";
type BlockReason = "generation" | "source" | null;

function BagTabButton({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={styles.bagTabPress}>
      <LinearGradient
        colors={
          active
            ? [COLORS.primary, COLORS.secondary]
            : ["rgba(255,255,255,0.10)", "rgba(255,255,255,0.06)"]
        }
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.bagTabBtn}
      >
        <Text style={[styles.bagTabText, active ? styles.bagTabTextActive : null]}>{label}</Text>
      </LinearGradient>
    </Pressable>
  );
}

function ProgressBar({
  value,
  max,
  variant,
}: {
  value: number;
  max: number;
  variant: "HP" | "EXP";
}) {
  const pct = useMemo(() => {
    if (!max || max <= 0) return 0;
    const p = Math.round((value / max) * 100);
    return Math.max(0, Math.min(100, p));
  }, [value, max]);

  return (
    <View style={styles.barTrack}>
      <View
        style={[
          styles.barFillBase,
          variant === "HP" ? styles.barFillHp : styles.barFillExp,
          { width: `${pct}%` },
        ]}
      />
    </View>
  );
}

function safeStr(v: any, fallback = "-") {
  if (v === null || v === undefined) return fallback;
  const s = String(v);
  return s.trim().length ? s : fallback;
}

function getMove(moveId: string): MoveEntry | null {
  // @ts-ignore
  return (movesDex as any)?.[moveId] ?? null;
}

function getSpecies(speciesId: number): any | null {
  // @ts-ignore
  return (speciesDex as any)?.[String(speciesId)] ?? (speciesDex as any)?.[speciesId] ?? null;
}


function resolveSpeciesNameLocal(speciesId: number): string {
  const sp = getSpecies(speciesId);
  const name = sp?.name || sp?.speciesName || sp?.identifier || sp?.slug;
  return safeStr(name, "-");
}

function normalizeForCompare(v: unknown): string {
  return String(v ?? "")
    .trim()
    .toLowerCase();
}

function getSpeciesDisplayName(p: any): string {
  return safeStr(
    p?.speciesName ?? p?.name,
    resolveSpeciesNameLocal(Number(p?.speciesId))
  );
}

function getDisplayName(p: any): string {
  const speciesName = getSpeciesDisplayName(p);
  const nickname = String((p as any)?.nickname ?? "").trim();
  if (!nickname) return speciesName;
  if (normalizeForCompare(nickname) === normalizeForCompare(speciesName)) return speciesName;
  return `${nickname} (${speciesName})`;
}

function getGenderSymbol(g: any): { symbol: string; color: string } {
  if (g === "M") return { symbol: "\u2642", color: "#93C5FD" }; // azul
  if (g === "F") return { symbol: "\u2640", color: "#F9A8D4" }; // rosa
  return { symbol: "-", color: "rgba(255,255,255,0.65)" };
}

function getAbilityInfo(speciesId: number, abilityId?: string | null): { title: string; description: string } {
  const id = safeStr(abilityId, "-");
  const sp = getSpecies(speciesId);
  // tenta achar qualquer campo comum que voce tenha no catalogo local
  const maybe =
    sp?.abilitiesDetailed?.[id] ||
    sp?.abilitiesById?.[id] ||
    (Array.isArray(sp?.abilities) ? sp.abilities.find((a: any) => a?.abilityId === id || a?.id === id) : null);

  const title = safeStr(maybe?.name, id);
  const description = safeStr(maybe?.effectText || maybe?.flavorText || maybe?.description, "Descricao indisponivel no catalogo local.");
  return { title, description };
}


const NATURE_PT: Record<string, { name: string; desc: string }> = {
  brave: { name: "Brave (Valente)", desc: "+ Ataque (ATK), - Velocidade (SPE)." },
  adamant: { name: "Adamant (Firme)", desc: "+ Ataque (ATK), - Ataque Especial (SPA)." },
  jolly: { name: "Jolly (Alegre)", desc: "+ Velocidade (SPE), - Ataque Especial (SPA)." },
  timid: { name: "Timid (Timida)", desc: "+ Velocidade (SPE), - Ataque (ATK)." },
  modest: { name: "Modest (Modesta)", desc: "+ Ataque Especial (SPA), - Ataque (ATK)." },
  bold: { name: "Bold (Ousada)", desc: "+ Defesa (DEF), - Ataque (ATK)." },
  calm: { name: "Calm (Calma)", desc: "+ Defesa Especial (SPD), - Ataque (ATK)." },
  careful: { name: "Careful (Cautelosa)", desc: "+ Defesa Especial (SPD), - Ataque Especial (SPA)." },
  impish: { name: "Impish (Travessa)", desc: "+ Defesa (DEF), - Ataque Especial (SPA)." },
  quiet: { name: "Quiet (Quiet)", desc: "+ Ataque Especial (SPA), - Velocidade (SPE)." },
};

function getNatureInfo(nature?: string | null): { title: string; description: string } {
  const key = String(nature ?? "").trim().toLowerCase();
  if (!key) return { title: "-", description: "Natureza nao informada." };
  const hit = NATURE_PT[key];
  if (hit) return { title: hit.name, description: hit.desc };
  // fallback: mostra como veio do banco
  return { title: key[0].toUpperCase() + key.slice(1), description: "Descricao ainda nao mapeada em PT-BR." };
}

function getItemInfo(itemId?: string | null): { title: string; description: string } {
  const id = String(itemId ?? "").trim();
  if (!id) return { title: "Sem item", description: "Este Pokemon nao esta segurando nenhum item." };
  // Estrutura preparada: se voce tiver um items.json no futuro, e so resolver aqui.
  return { title: id.replace(/-/g, " "), description: "Descricao indisponivel no catalogo local de itens (ainda nao integrado)." };
}


function canEvolveFallback(speciesId: number, level: number): { can: boolean; toId?: number } {
  const toId = resolveEvolutionTarget({ speciesId, level });
  return toId ? { can: true, toId } : { can: false };
}

function countNonEmpty(team: TeamPokemonUI[]) {
  return team.filter((p) => p && p.speciesId !== 0).length;
}

function PokemonCard({
  pokemon,
  slotIndex,
  onOpenDetails,
  onOpenEvolve,
}: {
  pokemon: TeamPokemonUI;
  slotIndex: number;
  onOpenDetails: () => void;
  onOpenEvolve: () => void;
}) {
  const isEmpty = pokemon.speciesId === 0;

  const genderSymbol = pokemon.gender === "M" ? "\u2642" : pokemon.gender === "F" ? "\u2640" : "-";
  const hpLabel = isEmpty ? "-" : `${pokemon.hpCurrent}/${pokemon.hpTotal}`;
  const expLabel = isEmpty ? "-" : `${pokemon.expCurrent}/${pokemon.expToNext}`;
  const displayName = getDisplayName(pokemon);

  // Aceita flag vinda do game OU calcula fallback aqui (para UX aparecer)
  const fallback = canEvolveFallback(Number(pokemon.speciesId), Number(pokemon.level));
  const canEvolve = Boolean((pokemon as any)?.canEvolve ?? fallback.can);

  return (
    <Pressable disabled={isEmpty} onPress={onOpenDetails} style={{ borderRadius: 18, overflow: "hidden" }}>
      <LinearGradient
        colors={
          pokemon.isStarter
            ? ["rgba(59,130,246,0.35)", "rgba(167,139,250,0.18)"]
            : ["rgba(255,255,255,0.08)", "rgba(255,255,255,0.05)"]
        }
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.pokeCard, pokemon.isStarter ? styles.pokeCardStarter : null]}
      >
        <View style={styles.pokeImageWrap}>
          <LinearGradient
            colors={
              pokemon.isStarter
                ? [COLORS.primary, COLORS.secondary]
                : ["rgba(255,255,255,0.10)", "rgba(255,255,255,0.06)"]
            }
            style={styles.pokeImageFrame}
          >
            <View style={styles.pokeImageInner}>
              {!isEmpty && pokemon.spriteUrl ? (
                <Image source={{ uri: pokemon.spriteUrl }} style={styles.pokeSprite} resizeMode="contain" />
              ) : (
                <Text style={styles.pokeImageText}>{isEmpty ? "?" : String(pokemon.name).slice(0, 1).toUpperCase()}</Text>
              )}
            </View>
          </LinearGradient>

          {/* Botao de Evolucao (abaixo da foto) */}
          {canEvolve && !isEmpty ? (
            <Pressable
              onPress={(e) => {
                e.stopPropagation?.();
                onOpenEvolve();
              }}
              style={styles.evolvePress}
              hitSlop={10}
            >
              <LinearGradient
                colors={["rgba(59,130,246,0.95)", "rgba(167,139,250,0.95)"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.evolveBtn}
              >
                <ArrowUp size={18} color={COLORS.white} />
              </LinearGradient>
            </Pressable>
          ) : null}

          {pokemon.isStarter ? (
            <View style={styles.starterBadgeInline}>
              <Text style={styles.starterBadgeText}>INICIAL</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.pokeInfo}>
          <View style={styles.pokeTopRow}>
            <Text style={styles.pokeName} numberOfLines={1}>
              {displayName}
            </Text>

            <View style={styles.pokeMiniRight}>
              <Text style={styles.pokeLevel}>{isEmpty ? "-" : `Nv ${pokemon.level}`}</Text>
            </View>
          </View>

          <View style={styles.pokeMetaRow}>
            <Text style={styles.pokeMetaText}>{`${pokemon.nature || "-"} | ${genderSymbol} | Slot ${slotIndex}`}</Text>
          </View>

          <View style={styles.pokeStatBlock}>
            <View style={styles.pokeStatRow}>
              <Text style={styles.pokeStatLabel}>HP</Text>
              <Text style={styles.pokeStatValue}>{hpLabel}</Text>
            </View>
            <ProgressBar value={pokemon.hpCurrent} max={pokemon.hpTotal} variant="HP" />
          </View>

          <View style={styles.pokeStatBlock}>
            <View style={styles.pokeStatRow}>
              <Text style={styles.pokeStatLabel}>EXP</Text>
              <Text style={styles.pokeStatValue}>{expLabel}</Text>
            </View>
            <ProgressBar value={pokemon.expCurrent} max={pokemon.expToNext} variant="EXP" />
          </View>
        </View>
      </LinearGradient>
    </Pressable>
  );
}

export function Mochila({
  bagTab,
  setBagTab,
  team,
  // mantem compatibilidade
  onPressPokemon,
  // novos (opcionais, nao quebram)
  playerType = "FREE",
  box = [],
  onRenamePokemon,
  onEvolvePokemon,
  onReplaceWithBox,
  onUpdateAbility,
  items = [],
  pokeballs = [],
  itemCapacityUsed = 0,
  itemCapacityLimit = 20,
  pokeballCapacityUsed = 0,
  pokeballCapacityLimit = 20,
  currentCoins = 0,
  onUseItem,
  onRelearnMove,
  onTutorTeachMove,
  onReleasePokemon,
  allowRelearn = true,
  allowTutor = true,
  allowedTutorType = null,
}: {
  bagTab: BagTabKey;
  setBagTab: (t: BagTabKey) => void;
  team: TeamPokemonUI[];
  onPressPokemon?: (slotIndex: number) => void;

  playerType?: PlayerTier;
  box?: TeamPokemonUI[];

  onRenamePokemon?: (slotIndex: number, nickname: string) => void;
  onEvolvePokemon?: (slotIndex: number, toSpeciesId: number) => void;
  onReplaceWithBox?: (teamSlotIndex: number, boxSlotIndex: number | null) => void;
  onUpdateAbility?: (slotIndex: number, abilityId: string) => void;
  items?: InventoryEntry[];
  pokeballs?: InventoryEntry[];
  itemCapacityUsed?: number;
  itemCapacityLimit?: number;
  pokeballCapacityUsed?: number;
  pokeballCapacityLimit?: number;
  currentCoins?: number;
  onUseItem?: (itemId: string, slotIndex: number) => Promise<ActionResult>;
  onRelearnMove?: (slotIndex: number, moveId: string) => Promise<ActionResult>;
  onTutorTeachMove?: (
    slotIndex: number,
    moveId: string,
    payment: "coins" | "heart-scale"
  ) => Promise<ActionResult>;
  onReleasePokemon?: (slotIndex: number) => Promise<ActionResult> | ActionResult;
  allowRelearn?: boolean;
  allowTutor?: boolean;
  allowedTutorType?: string | null;
}) {
  const [detailsSlot, setDetailsSlot] = useState<number | null>(null);
  const selected = useMemo(() => {
    if (detailsSlot === null) return null;
    return team[detailsSlot - 1] ?? null;
  }, [detailsSlot, team]);

  // rename
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState("");
  useEffect(() => {
    // evita cache/estado preso na primeira renderizacao do modal
    setEditingName(false);
    setRelearnFilter("all");
    if (!selected) return;
    setNameValue((selected as any)?.nicknameEdited ? ((selected as any)?.nickname ?? "") : "");
  }, [selected?.speciesId, (selected as any)?.nickname, (selected as any)?.nicknameEdited]);


  // ability desc
  const [abilityOpen, setAbilityOpen] = useState(false);
  const [abilitySelected, setAbilitySelected] = useState<{ title: string; description: string } | null>(null);

  // nature desc
  const [natureOpen, setNatureOpen] = useState(false);
  const [natureSelected, setNatureSelected] = useState<{ title: string; description: string } | null>(null);

  // item desc
  const [itemOpen, setItemOpen] = useState(false);
  const [itemSelected, setItemSelected] = useState<{ title: string; description: string } | null>(null);

  // moves desc
  const [moveOpen, setMoveOpen] = useState(false);
  const [moveSelected, setMoveSelected] = useState<{ id: string; data: MoveEntry | null } | null>(null);

  // evolve modal with loop animation
  const [evolveOpen, setEvolveOpen] = useState(false);
  const evolvePulse = useRef(new Animated.Value(0)).current;

  // replace modal
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [relearningMoveId, setRelearningMoveId] = useState<string | null>(null);
  const [teachingTutorMoveId, setTeachingTutorMoveId] = useState<string | null>(null);
  const [relearnFilter, setRelearnFilter] = useState<RelearnFilter>("all");

  function openDetails(slotIndex: number) {
    setDetailsSlot(slotIndex);

    const p = team[slotIndex - 1];
    setEditingName(false);
    setNameValue(safeStr(p?.nickname, ""));
  }

  function openMove(moveId: string) {
    setMoveSelected({ id: moveId, data: getMove(moveId) });
    setMoveOpen(true);
  }

  function startEvolveAnim() {
    evolvePulse.setValue(0);
    Animated.loop(
      Animated.timing(evolvePulse, {
        toValue: 1,
        duration: 1200,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      })
    ).start();
  }

  function stopEvolveAnim() {
    evolvePulse.stopAnimation();
    evolvePulse.setValue(0);
  }

  const canChooseAbility = useMemo(() => {
    if (!selected) return false;
    return Boolean(selected.isStarter && playerType === "VIP");
  }, [selected, playerType]);

  const abilities = useMemo((): AbilityEntry[] => {
    if (!selected) return [];
    const sp = getSpecies(Number(selected.speciesId));
    return (sp?.abilities ?? []) as AbilityEntry[];
  }, [selected]);

  function openReplace() {
    if (!selected) return;
    if (!box?.length) {
      Alert.alert("Box vazia", "Voce ainda nao possui Pokemon na box.");
      return;
    }
    setReplaceOpen(true);
  }

  function pickFromBox(boxIndex: number | null) {
    if (!detailsSlot) return;
    const teamCount = countNonEmpty(team);
    const isRemoving = boxIndex === null;

    if (isRemoving && teamCount <= 1) {
      Alert.alert("Acao nao permitida", "Voce precisa manter pelo menos 1 Pokemon no time.");
      return;
    }
    onReplaceWithBox?.(detailsSlot, boxIndex);
    setReplaceOpen(false);
  }

  function openEvolve(slotIndex: number) {
    setDetailsSlot(slotIndex);
    setEvolveOpen(true);
    startEvolveAnim();
  }

  function confirmEvolve() {
    if (!detailsSlot || !selected) return;
    const canEvolveNow = Boolean((selected as any)?.canEvolve ?? canEvolveFallback(Number(selected.speciesId), Number(selected.level)).can);
    if (!canEvolveNow) {
      Alert.alert("Ops", "Nao encontrei o proximo estagio de evolucao desse Pokemon.");
      return;
    }
    onEvolvePokemon?.(detailsSlot, Number((selected as any)?.evolveToSpeciesId ?? 0));
    setEvolveOpen(false);
    stopEvolveAnim();
  }

  function saveNickname() {
    if (!detailsSlot) return;
    onRenamePokemon?.(detailsSlot, nameValue.trim());
    setEditingName(false);
  }

  const displayedMoves = useMemo(() => {
    const ids = ((selected as any)?.moves ?? []) as string[];
    return ids.map((id) => ({ id, data: getMove(id) }));
  }, [selected]);
  const relearnableMoves = useMemo(() => {
    const current = ((selected as any)?.moves ?? []) as string[];
    const relearn = ((selected as any)?.relearnableMoves ?? []) as string[];
    const unique = Array.from(new Set(relearn.map((m) => String(m || "").trim()).filter(Boolean)));
    return unique.filter((m) => !current.includes(m));
  }, [selected]);
  const relearnableWithSources = useMemo(() => {
    if (!selected || Number(selected.speciesId) <= 0) {
      return [] as { moveId: string; sources: RelearnSource[]; blockedReason: BlockReason }[];
    }
    const sp = getSpecies(Number(selected.speciesId));
    const speciesGeneration = Number(sp?.generation ?? 0);
    const maxGeneration = Number(
      (selected as any)?.learnsetConstraints?.maxGeneration ??
        (selected as any)?.maxGeneration ??
        0
    );
    const blockedSourcesRaw = ((selected as any)?.learnsetConstraints?.blockedSources ?? []) as string[];
    const blockedSources = blockedSourcesRaw
      .map((s) => String(s || "").trim().toLowerCase())
      .filter(Boolean) as RelearnSource[];

    return relearnableMoves.map((moveId) => {
      const methods = getMoveLearnMethodsForSpeciesMove(Number(selected.speciesId), moveId);
      const sources = (methods.length ? methods : ["other"]) as RelearnSource[];
      const constrained = applyLearnsetConstraints(sources, {
        speciesGeneration,
        maxGeneration: Number.isFinite(maxGeneration) && maxGeneration > 0 ? maxGeneration : null,
        blockedSources,
      });
      return {
        moveId,
        sources: constrained.allowedSources,
        blockedReason: constrained.blockedReason,
      };
    });
  }, [selected, relearnableMoves]);
  const filteredRelearnableMoves = useMemo(() => {
    const allowed = relearnableWithSources.filter((row) => row.sources.length > 0);
    if (relearnFilter === "all") return allowed;
    return allowed.filter((row) => row.sources.includes(relearnFilter));
  }, [relearnFilter, relearnableWithSources]);
  const blockedRelearnableMoves = useMemo(
    () => relearnableWithSources.filter((row) => row.sources.length === 0 && !!row.blockedReason),
    [relearnableWithSources]
  );
  const heartScaleQty = useMemo(
    () => Math.max(0, Number(items.find((x) => x.id === "heart-scale")?.quantity ?? 0)),
    [items]
  );
  const tutorMoves = useMemo(() => {
    if (!selected || Number(selected.speciesId) <= 0) return [];
    const current = ((selected as any)?.moves ?? []) as string[];
    const unique = Array.from(new Set(getTutorMovesForSpecies(Number(selected.speciesId)))).filter(
      (m) => !current.includes(m)
    );
    const sp = getSpecies(Number(selected.speciesId));
    const speciesGeneration = Number(sp?.generation ?? 0);
    const maxGeneration = Number(
      (selected as any)?.learnsetConstraints?.maxGeneration ??
        (selected as any)?.maxGeneration ??
        0
    );
    const blockedSourcesRaw = ((selected as any)?.learnsetConstraints?.blockedSources ?? []) as string[];
    const blockedSources = blockedSourcesRaw
      .map((s) => String(s || "").trim().toLowerCase())
      .filter(Boolean) as RelearnSource[];

    return unique.filter((moveId) => {
      const constrained = applyLearnsetConstraints(["tutor"], {
        speciesGeneration,
        maxGeneration: Number.isFinite(maxGeneration) && maxGeneration > 0 ? maxGeneration : null,
        blockedSources,
      });
      if (!constrained.allowedSources.includes("tutor")) return false;
      if (!allowedTutorType) return true;
      const moveType = String(getMove(moveId)?.type || "").trim().toLowerCase();
      return moveType === String(allowedTutorType).trim().toLowerCase();
    });
  }, [selected, allowedTutorType]);

  const displayedStats = useMemo(() => {
    // stats reais ja vem do game ou Firestore (stats map). Aqui so exibimos
    const s = (selected as any)?.stats ?? {};
    return {
      hp: (selected as any)?.hpTotal ?? (selected as any)?.hp?.total ?? "-",
      atk: s.atk ?? "-",
      def: s.def ?? "-",
      spa: s.spa ?? "-",
      spd: s.spd ?? "-",
      spe: s.spe ?? "-",
    };
  }, [selected]);

  const displayedEVs = useMemo(() => {
    const e = (selected as any)?.evs ?? {};
    const vals = {
      hp: Math.max(0, Number(e.hp ?? 0)),
      atk: Math.max(0, Number(e.atk ?? 0)),
      def: Math.max(0, Number(e.def ?? 0)),
      spa: Math.max(0, Number(e.spa ?? 0)),
      spd: Math.max(0, Number(e.spd ?? 0)),
      spe: Math.max(0, Number(e.spe ?? 0)),
    };
    const total = vals.hp + vals.atk + vals.def + vals.spa + vals.spd + vals.spe;
    return { ...vals, total };
  }, [selected]);

  return (
    <>
      <View style={styles.bagHeader}>
        <Text style={styles.bagTitle}>MOCHILA</Text>

        <View style={styles.bagTabsRow}>
          <BagTabButton label="TIME" active={bagTab === "TEAM"} onPress={() => setBagTab("TEAM")} />
          <BagTabButton label="ITENS" active={bagTab === "ITEMS"} onPress={() => setBagTab("ITEMS")} />
          <BagTabButton label="POKEBOLAS" active={bagTab === "POKEBALLS"} onPress={() => setBagTab("POKEBALLS")} />
        </View>
      </View>

      {bagTab === "TEAM" ? (
        <View style={{ gap: 10 }}>
          {team.map((p, idx) => (
            <PokemonCard
              key={p.id}
              pokemon={p}
              slotIndex={idx + 1}
              onOpenDetails={() => openDetails(idx + 1)}
              onOpenEvolve={() => openEvolve(idx + 1)}
            />
          ))}
        </View>
      ) : null}

      {bagTab === "ITEMS" ? (
        <BagItems
          items={items}
          capacityUsed={itemCapacityUsed}
          capacityLimit={itemCapacityLimit}
          team={team}
          onUseItem={async (itemId, slotIndex) => {
            if (!onUseItem) return { ok: false, message: "Uso de item indisponivel." };
            return onUseItem(itemId, slotIndex);
          }}
        />
      ) : null}

      {bagTab === "POKEBALLS" ? (
        <Pokebolas
          pokeballs={pokeballs}
          capacityUsed={pokeballCapacityUsed}
          capacityLimit={pokeballCapacityLimit}
        />
      ) : null}

      {/* MODAL DETALHES */}
      <Modal
        key={`${detailsSlot ?? "x"}_${(selected as any)?.speciesId ?? "0"}_${(selected as any)?.abilityId ?? "a"}`}
        visible={detailsSlot !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setDetailsSlot(null)}
      >
        <View style={styles.modalBackdrop}>
          <LinearGradient
            colors={["rgba(0,0,0,0.92)", "rgba(45,45,45,0.92)"]}
            style={[styles.modalShell, { maxHeight: "92%" }]}
          >
            {/* CABECALHO: linha unica */}
            <View style={styles.modalHeaderRow}>
              <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Text style={styles.modalHeaderName} numberOfLines={1}>
                  {selected ? getDisplayName(selected) : "-"}
                </Text>

                {selected ? (() => {
                  const g = getGenderSymbol((selected as any)?.gender);
                  return <Text style={[styles.genderIcon, { color: g.color }]}>{g.symbol}</Text>;
                })() : null}

                <Text style={styles.levelInline}>{`[${safeStr((selected as any)?.level, "-")}]`}</Text>

                {selected?.isStarter ? (
                  <View style={styles.starterBadgeMini}>
                    <Text style={styles.starterBadgeMiniText}>INICIAL</Text>
                  </View>
                ) : null}
              </View>

              {selected && !(selected as any)?.nicknameEdited ? (
                <Pressable
                  onPress={() => {
                    setEditingName(true);
                    setNameValue(safeStr((selected as any)?.nickname, ""));
                  }}
                  style={styles.iconChip}
                >
                  <Pencil size={16} color={COLORS.white} />
                </Pressable>
              ) : null}

              <Pressable onPress={() => setDetailsSlot(null)} style={styles.modalCloseBtn}>
                <X size={18} color={COLORS.white} />
              </Pressable>
            </View>

            {/* Se estiver editando nickname, mostra o campo logo abaixo do header (sem poluir topo) */}
            {selected && editingName ? (
              <View style={{ flexDirection: "row", gap: 10, marginBottom: 10 }}>
                <TextInput
                  value={nameValue}
                  onChangeText={setNameValue}
                  placeholder="Nickname"
                  placeholderTextColor="rgba(255,255,255,0.45)"
                  style={styles.nicknameInput}
                  maxLength={18}
                />
                <Pressable onPress={saveNickname} style={styles.iconChip}>
                  <Check size={16} color={COLORS.white} />
                </Pressable>
              </View>
            ) : null}

            {selected && selected.speciesId !== 0 ? (
              <ScrollView contentContainerStyle={{ gap: 14, paddingBottom: 10 }} showsVerticalScrollIndicator={false}>
                {/* CORPO PRINCIPAL: 2 colunas (foto a esquerda | infos a direita) */}
                <View style={styles.detailsTwoCol}>
                  {/* FOTO */}
                  <LinearGradient
                    colors={["rgba(59,130,246,0.22)", "rgba(167,139,250,0.12)"]}
                    style={styles.heroSpriteCard}
                  >
                    {selected.spriteUrl ? (
                      <Image source={{ uri: selected.spriteUrl }} style={styles.heroSprite} resizeMode="contain" />
                    ) : (
                      <Text style={styles.pokeImageText}>{String((selected as any)?.name).slice(0, 1).toUpperCase()}</Text>
                    )}
                    <View style={styles.heroGlow} />
                  </LinearGradient>

                  {/* COLUNA DE DADOS (label + valor) */}
                  <View style={styles.infoCol}>
                    {/* 1) NATUREZA */}
                    {(() => {
                      const info = getNatureInfo((selected as any)?.nature);
                      return (
                        <Pressable
                          onPress={() => {
                            setNatureSelected(info);
                            setNatureOpen(true);
                          }}
                          style={styles.infoRowPress}
                        >
                          <Text style={styles.infoLabel}>NATUREZA:</Text>
                          <Text style={styles.infoValue} numberOfLines={1}>{safeStr((selected as any)?.nature)}</Text>
                        </Pressable>
                      );
                    })()}

                    {/* 2) HABILIDADE (APENAS a atual) */}
                    {(() => {
                      const ab = getAbilityInfo(Number((selected as any)?.speciesId), (selected as any)?.abilityId);
                      return (
                        <Pressable
                          onPress={() => {
                            setAbilitySelected(ab);
                            setAbilityOpen(true);
                          }}
                          style={styles.infoRowPress}
                        >
                          <Text style={styles.infoLabel}>HABILIDADE:</Text>
                          <Text style={styles.infoValue} numberOfLines={1}>{ab.title}</Text>
                        </Pressable>
                      );
                    })()}

                    {/* 3) ITEM */}
                    {(() => {
                      const rawItem =
                        (selected as any)?.heldItemId ??
                        (selected as any)?.itemId ??
                        (selected as any)?.item ??
                        null;
                      const itemInfo = getItemInfo(rawItem);
                      const clickable = Boolean(rawItem);
                      return (
                        <Pressable
                          disabled={!clickable}
                          onPress={() => {
                            setItemSelected(itemInfo);
                            setItemOpen(true);
                          }}
                          style={[styles.infoRowPress, !clickable ? { opacity: 0.85 } : null]}
                        >
                          <Text style={styles.infoLabel}>ITEM:</Text>
                          <Text style={styles.infoValue} numberOfLines={1}>{itemInfo.title || "Sem item"}</Text>
                        </Pressable>
                      );
                    })()}

                    {/* 4) HP */}
                    <View style={styles.infoBarBlock}>
                      <View style={styles.barTopRow}>
                        <Text style={styles.infoLabel}>HP:</Text>
                        <Text style={styles.barNumbers}>{`${selected.hpCurrent}/${selected.hpTotal}`}</Text>
                      </View>
                      <ProgressBar value={selected.hpCurrent} max={selected.hpTotal} variant="HP" />
                    </View>

                    {/* 5) EXP */}
                    <View style={styles.infoBarBlock}>
                      <View style={styles.barTopRow}>
                        <Text style={styles.infoLabel}>EXP:</Text>
                        <Text style={styles.barNumbers}>{`${selected.expCurrent}/${selected.expToNext}`}</Text>
                      </View>
                      <ProgressBar value={selected.expCurrent} max={selected.expToNext} variant="EXP" />
                    </View>
                  </View>
                </View>

                {/* STATUS */}
                <LinearGradient colors={["rgba(255,255,255,0.08)", "rgba(255,255,255,0.05)"]} style={styles.cardBlock}>
                  <Text style={styles.cardTitle}>STATUS</Text>
                  <View style={styles.statsGrid}>
                    {(
                      [
                        ["HP", displayedStats.hp],
                        ["ATK", displayedStats.atk],
                        ["DEF", displayedStats.def],
                        ["SPA", displayedStats.spa],
                        ["SPD", displayedStats.spd],
                        ["SPE", displayedStats.spe],
                      ] as Array<[string, any]>
                    ).map(([k, v]) => (
                      <View key={k} style={styles.statRow}>
                        <Text style={styles.statKey}>{k}</Text>
                        <Text style={styles.statVal}>{safeStr(v)}</Text>
                      </View>
                    ))}
                  </View>
                </LinearGradient>

                <LinearGradient colors={["rgba(255,255,255,0.08)", "rgba(255,255,255,0.05)"]} style={styles.cardBlock}>
                  <View style={styles.evHeader}>
                    <Text style={styles.cardTitle}>EV</Text>
                    <Text style={styles.evTotal}>{`${displayedEVs.total}/510`}</Text>
                  </View>
                  <View style={styles.evList}>
                    {(
                      [
                        ["HP", displayedEVs.hp],
                        ["ATK", displayedEVs.atk],
                        ["DEF", displayedEVs.def],
                        ["SPA", displayedEVs.spa],
                        ["SPD", displayedEVs.spd],
                        ["SPE", displayedEVs.spe],
                      ] as Array<[string, any]>
                    ).map(([k, v]) => (
                      <View key={`ev_${k}`} style={styles.evRow}>
                        <Text style={styles.evKey}>{k}</Text>
                        <View style={styles.evBarTrack}>
                          <View style={[styles.evBarFill, { width: `${Math.max(0, Math.min(100, (Number(v) / 252) * 100))}%` }]} />
                        </View>
                        <Text style={styles.evVal}>{safeStr(v)}</Text>
                      </View>
                    ))}
                  </View>
                </LinearGradient>

                {/* MOVES */}
                <LinearGradient colors={["rgba(255,255,255,0.08)", "rgba(255,255,255,0.05)"]} style={styles.cardBlock}>
                  <Text style={styles.cardTitle}>MOVIMENTOS</Text>
                  <View style={{ gap: 10, marginTop: 10 }}>
                    {displayedMoves.length ? (
                      displayedMoves.slice(0, 4).map((m, i) => (
                        <Pressable key={m.id} onPress={() => openMove(m.id)} style={styles.moveLine}>
                          <Text style={styles.moveLineText} numberOfLines={1}>
                            {`MOV ${i + 1}: ${safeStr(m.data?.name ?? m.id)} - ${m.data?.power ?? "-"} - ${m.data?.accuracy ?? "-"} - ${m.data?.pp ?? "-"}`}
                          </Text>
                        </Pressable>
                      ))
                    ) : (
                      <Text style={styles.placeholderText}>Nenhum movimento encontrado.</Text>
                    )}
                  </View>
                </LinearGradient>

                {allowRelearn ? (
                  <LinearGradient colors={["rgba(255,255,255,0.08)", "rgba(255,255,255,0.05)"]} style={styles.cardBlock}>
                    <Text style={styles.cardTitle}>REAPRENDER GOLPES</Text>
                    <View style={styles.relearnFilterRow}>
                      {(["all", "level-up", "machine", "egg", "tutor"] as RelearnFilter[]).map((f) => (
                        <Pressable
                          key={`rf_${f}`}
                          onPress={() => setRelearnFilter(f)}
                          style={[styles.relearnFilterBtn, relearnFilter === f ? styles.relearnFilterBtnActive : null]}
                        >
                          <Text style={styles.relearnFilterText}>{f === "all" ? "Todos" : f}</Text>
                        </Pressable>
                      ))}
                    </View>
                    <View style={{ gap: 8, marginTop: 10 }}>
                      {filteredRelearnableMoves.length ? (
                        filteredRelearnableMoves.map((row) => (
                          <Pressable
                            key={`relearn_${row.moveId}`}
                            disabled={!detailsSlot || !onRelearnMove || relearningMoveId === row.moveId}
                            onPress={async () => {
                              if (!detailsSlot || !onRelearnMove) return;
                              try {
                                setRelearningMoveId(row.moveId);
                                const result = await onRelearnMove(detailsSlot, row.moveId);
                                Alert.alert("Move Relearner", result.message);
                              } finally {
                                setRelearningMoveId(null);
                              }
                            }}
                            style={[styles.relearnBtn, relearningMoveId === row.moveId ? styles.relearnBtnDisabled : null]}
                          >
                            <Text style={styles.relearnBtnText}>{safeStr(getMove(row.moveId)?.name ?? row.moveId)}</Text>
                            <Text style={styles.relearnSourcesText}>{row.sources.join(" / ")}</Text>
                          </Pressable>
                        ))
                      ) : (
                        <Text style={styles.placeholderText}>Nenhum golpe disponivel para reaprendizado.</Text>
                      )}
                    </View>
                    {blockedRelearnableMoves.length ? (
                      <View style={{ gap: 6, marginTop: 8 }}>
                        <Text style={styles.placeholderText}>Bloqueados por regra:</Text>
                        {blockedRelearnableMoves.map((row) => (
                          <View key={`blocked_${row.moveId}`} style={styles.blockedRow}>
                            <Text style={styles.blockedText}>{safeStr(getMove(row.moveId)?.name ?? row.moveId)}</Text>
                            <Text style={styles.blockedReasonText}>
                              {row.blockedReason === "generation" ? "Bloqueado por geracao" : "Bloqueado por fonte"}
                            </Text>
                          </View>
                        ))}
                      </View>
                    ) : null}
                  </LinearGradient>
                ) : null}

                {allowTutor ? (
                  <LinearGradient colors={["rgba(255,255,255,0.08)", "rgba(255,255,255,0.05)"]} style={styles.cardBlock}>
                    <Text style={styles.cardTitle}>MOVE TUTOR</Text>
                    {allowedTutorType ? (
                      <Text style={styles.placeholderText}>{`Especialista do tipo: ${allowedTutorType}`}</Text>
                    ) : null}
                    <Text style={styles.placeholderText}>{`Custo: 1200 moedas ou 1 Heart Scale (x${heartScaleQty})`}</Text>
                    <View style={{ gap: 8, marginTop: 8 }}>
                      {tutorMoves.length ? (
                        tutorMoves.map((moveId) => (
                          <View key={`tutor_${moveId}`} style={styles.tutorRow}>
                            <Text style={styles.tutorMoveName} numberOfLines={1}>
                              {safeStr(getMove(moveId)?.name ?? moveId)}
                            </Text>
                            <View style={styles.tutorActions}>
                              <Pressable
                                disabled={!detailsSlot || !onTutorTeachMove || teachingTutorMoveId === moveId}
                                onPress={async () => {
                                  if (!detailsSlot || !onTutorTeachMove) return;
                                  try {
                                    setTeachingTutorMoveId(moveId);
                                    const result = await onTutorTeachMove(detailsSlot, moveId, "coins");
                                    Alert.alert("Move Tutor", result.message);
                                  } finally {
                                    setTeachingTutorMoveId(null);
                                  }
                                }}
                                style={[styles.relearnBtn, teachingTutorMoveId === moveId ? styles.relearnBtnDisabled : null]}
                              >
                                <Text style={styles.relearnBtnText}>Moedas</Text>
                              </Pressable>
                              <Pressable
                                disabled={!detailsSlot || !onTutorTeachMove || heartScaleQty <= 0 || teachingTutorMoveId === moveId}
                                onPress={async () => {
                                  if (!detailsSlot || !onTutorTeachMove) return;
                                  try {
                                    setTeachingTutorMoveId(moveId);
                                    const result = await onTutorTeachMove(detailsSlot, moveId, "heart-scale");
                                    Alert.alert("Move Tutor", result.message);
                                  } finally {
                                    setTeachingTutorMoveId(null);
                                  }
                                }}
                                style={[
                                  styles.relearnBtn,
                                  (heartScaleQty <= 0 || teachingTutorMoveId === moveId) ? styles.relearnBtnDisabled : null,
                                ]}
                              >
                                <Text style={styles.relearnBtnText}>Heart Scale</Text>
                              </Pressable>
                            </View>
                          </View>
                        ))
                      ) : (
                        <Text style={styles.placeholderText}>Nenhum tutor move disponivel para esta especie.</Text>
                      )}
                    </View>
                    <Text style={styles.placeholderText}>{`Saldo atual: ${Math.max(0, Number(currentCoins || 0))} moedas`}</Text>
                  </LinearGradient>
                ) : null}

                {/* ACOES */}
                <View style={styles.actionsRow}>
                  <Pressable
                    onPress={async () => {
                      if (!detailsSlot || !onReleasePokemon) return;
                      Alert.alert(
                        "Liberar Pokemon",
                        "Este Pokemon sera liberado e podera voltar como abandonado em biomas. Deseja continuar?",
                        [
                          { text: "Cancelar", style: "cancel" },
                          {
                            text: "Liberar",
                            style: "destructive",
                            onPress: async () => {
                              const result = await onReleasePokemon(detailsSlot);
                              Alert.alert("BOX", result.message);
                              if (result.ok) setDetailsSlot(null);
                            },
                          },
                        ]
                      );
                    }}
                    style={{ flex: 1 }}
                  >
                    <LinearGradient colors={["rgba(239,68,68,0.26)", "rgba(239,68,68,0.16)"]} style={styles.actionBtn}>
                      <Text style={styles.actionBtnText}>Liberar</Text>
                    </LinearGradient>
                  </Pressable>

                  <Pressable onPress={openReplace} style={{ flex: 1 }}>
                    <LinearGradient colors={["rgba(255,255,255,0.10)", "rgba(255,255,255,0.06)"]} style={styles.actionBtn}>
                      <RefreshCw size={16} color={COLORS.white} />
                      <Text style={styles.actionBtnText}>Substituir</Text>
                    </LinearGradient>
                  </Pressable>

                  <Pressable
                    onPress={() => {
                      const canEvolveNow = Boolean((selected as any)?.canEvolve ?? canEvolveFallback(Number(selected.speciesId), Number(selected.level)).can);
                      if (!canEvolveNow) {
                        Alert.alert("Evolucao", "Esse Pokemon ainda nao pode evoluir.");
                        return;
                      }
                      setEvolveOpen(true);
                      startEvolveAnim();
                    }}
                    style={{ flex: 1 }}
                  >
                    <LinearGradient colors={[COLORS.primary, COLORS.secondary]} style={styles.actionBtn}>
                      <Sparkles size={16} color={COLORS.white} />
                      <Text style={styles.actionBtnText}>Evoluir</Text>
                    </LinearGradient>
                  </Pressable>
                </View>
              </ScrollView>
            ) : null}
          </LinearGradient>
        </View>
      </Modal>

      {/* MODAL MOVE DESCRICAO */}
      {/* MODAL MOVE DESCRICAO */}
      <Modal visible={moveOpen} transparent animationType="fade" onRequestClose={() => setMoveOpen(false)}>
        <View style={styles.modalBackdrop}>
          <LinearGradient colors={["rgba(0,0,0,0.92)", "rgba(45,45,45,0.92)"]} style={styles.smallModal}>
            <View style={styles.modalTopBar}>
              <Text style={styles.modalTitle} numberOfLines={1}>
                {moveSelected ? safeStr(moveSelected.data?.name ?? moveSelected.id) : "Movimento"}
              </Text>
              <Pressable onPress={() => setMoveOpen(false)} style={styles.modalCloseBtn}>
                <X size={18} color={COLORS.white} />
              </Pressable>
            </View>

            <View style={{ gap: 8 }}>
              <Text style={styles.longText}>
                {moveSelected?.data?.flavorText ||
                  moveSelected?.data?.effectText ||
                  "Descricao indisponivel no catalogo local."}
              </Text>
              {moveSelected?.data ? (
                <View style={{ gap: 6 }}>
                  <Text style={styles.placeholderText}>{`Tipo: ${safeStr((moveSelected.data as any).type)} | Categoria: ${safeStr((moveSelected.data as any).category)}`}</Text>
                  <Text style={styles.placeholderText}>{`Prioridade: ${safeStr((moveSelected.data as any).priority)} | Contato: ${safeStr((moveSelected.data as any).contact)}`}</Text>
                  <Text style={styles.placeholderText}>{`Status: ${safeStr((moveSelected.data as any).status)}`}</Text>
                </View>
              ) : null}
            </View>

            <Pressable onPress={() => setMoveOpen(false)}>
              <LinearGradient colors={[COLORS.primary, COLORS.secondary]} style={styles.primaryBtn}>
                <Text style={styles.primaryBtnText}>Fechar</Text>
              </LinearGradient>
            </Pressable>
          </LinearGradient>
        </View>
      </Modal>

      {/* MODAL NATUREZA */}
      <Modal visible={natureOpen} transparent animationType="fade" onRequestClose={() => setNatureOpen(false)}>
        <View style={styles.modalBackdrop}>
          <LinearGradient colors={["rgba(0,0,0,0.92)", "rgba(45,45,45,0.92)"]} style={styles.smallModal}>
            <View style={styles.modalTopBar}>
              <Text style={styles.modalTitle} numberOfLines={1}>
                {natureSelected?.title ?? "Natureza"}
              </Text>
              <Pressable onPress={() => setNatureOpen(false)} style={styles.modalCloseBtn}>
                <X size={18} color={COLORS.white} />
              </Pressable>
            </View>
            <Text style={styles.longText}>{natureSelected?.description ?? "Descricao indisponivel."}</Text>
            <Pressable onPress={() => setNatureOpen(false)}>
              <LinearGradient colors={[COLORS.primary, COLORS.secondary]} style={styles.primaryBtn}>
                <Text style={styles.primaryBtnText}>Fechar</Text>
              </LinearGradient>
            </Pressable>
          </LinearGradient>
        </View>
      </Modal>

      {/* MODAL ITEM */}
      <Modal visible={itemOpen} transparent animationType="fade" onRequestClose={() => setItemOpen(false)}>
        <View style={styles.modalBackdrop}>
          <LinearGradient colors={["rgba(0,0,0,0.92)", "rgba(45,45,45,0.92)"]} style={styles.smallModal}>
            <View style={styles.modalTopBar}>
              <Text style={styles.modalTitle} numberOfLines={1}>
                {itemSelected?.title ?? "Item"}
              </Text>
              <Pressable onPress={() => setItemOpen(false)} style={styles.modalCloseBtn}>
                <X size={18} color={COLORS.white} />
              </Pressable>
            </View>
            <Text style={styles.longText}>{itemSelected?.description ?? "Descricao indisponivel."}</Text>
            <Pressable onPress={() => setItemOpen(false)}>
              <LinearGradient colors={[COLORS.primary, COLORS.secondary]} style={styles.primaryBtn}>
                <Text style={styles.primaryBtnText}>Fechar</Text>
              </LinearGradient>
            </Pressable>
          </LinearGradient>
        </View>
      </Modal>

      {/* MODAL EVOLUCAO */}
      <Modal
        visible={evolveOpen}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setEvolveOpen(false);
          stopEvolveAnim();
        }}
      >
        <View style={styles.modalBackdrop}>
          <LinearGradient colors={["rgba(59,130,246,0.22)", "rgba(167,139,250,0.14)"]} style={styles.evolveShell}>
            <View style={styles.modalTopBar}>
              <Text style={styles.modalTitle}>Evolucao</Text>
              <Pressable
                onPress={() => {
                  setEvolveOpen(false);
                  stopEvolveAnim();
                }}
                style={styles.modalCloseBtn}
              >
                <X size={18} color={COLORS.white} />
              </Pressable>
            </View>

            <Text style={styles.evolveSub}>
              {selected ? `${safeStr((selected as any)?.speciesName ?? (selected as any)?.name)} esta evoluindo...` : ""}
            </Text>

            <View style={styles.evolveStage}>
              <Animated.View
                style={[
                  styles.evolveGlow,
                  {
                    opacity: evolvePulse.interpolate({ inputRange: [0, 1], outputRange: [0.25, 0.95] }),
                    transform: [
                      {
                        scale: evolvePulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] }),
                      },
                    ],
                  },
                ]}
              />
              <LinearGradient colors={["rgba(0,0,0,0.55)", "rgba(0,0,0,0.25)"]} style={styles.evolveSpriteFrame}>
                {selected?.spriteUrl ? (
                  <Image source={{ uri: selected.spriteUrl }} style={styles.evolveSprite} resizeMode="contain" />
                ) : (
                  <Text style={styles.pokeImageText}>?</Text>
                )}
              </LinearGradient>
            </View>

            <View style={{ flexDirection: "row", gap: 10 }}>
              <Pressable
                onPress={() => {
                  setEvolveOpen(false);
                  stopEvolveAnim();
                }}
                style={{ flex: 1 }}
              >
                <LinearGradient colors={["rgba(255,255,255,0.10)", "rgba(255,255,255,0.06)"]} style={styles.secondaryBtn}>
                  <Text style={styles.secondaryBtnText}>Cancelar</Text>
                </LinearGradient>
              </Pressable>
              <Pressable onPress={confirmEvolve} style={{ flex: 1 }}>
                <LinearGradient colors={[COLORS.primary, COLORS.secondary]} style={styles.primaryBtn}>
                  <Text style={styles.primaryBtnText}>Confirmar</Text>
                </LinearGradient>
              </Pressable>
            </View>
          </LinearGradient>
        </View>
      </Modal>

      {/* MODAL SUBSTITUIR (BOX) */}
      <Modal visible={replaceOpen} transparent animationType="fade" onRequestClose={() => setReplaceOpen(false)}>
        <View style={styles.modalBackdrop}>
          <LinearGradient colors={["rgba(0,0,0,0.92)", "rgba(45,45,45,0.92)"]} style={[styles.modalShell, { maxHeight: "92%" }]}>
            <View style={styles.modalTopBar}>
              <Text style={styles.modalTitle}>Substituir por...</Text>
              <Pressable onPress={() => setReplaceOpen(false)} style={styles.modalCloseBtn}>
                <X size={18} color={COLORS.white} />
              </Pressable>
            </View>

            <Pressable onPress={() => pickFromBox(null)} style={{ borderRadius: 18, overflow: "hidden", marginBottom: 10 }}>
              <LinearGradient colors={["rgba(255,255,255,0.10)", "rgba(255,255,255,0.06)"]} style={styles.removeFromTeamBtn}>
                <Text style={styles.removeFromTeamText}>Remover do time</Text>
                <Text style={styles.removeFromTeamHint}>Deixa o slot vazio (equivale clicar slot vazio da box)</Text>
              </LinearGradient>
            </Pressable>

            <View style={{ gap: 10 }}>
              {box.map((p, i) => (
                <Pressable key={(p as any)?.id ?? `box_${i}`} onPress={() => pickFromBox(i)} style={{ borderRadius: 18, overflow: "hidden" }}>
                  <LinearGradient colors={["rgba(255,255,255,0.08)", "rgba(255,255,255,0.05)"]} style={styles.boxRow}>
                    <View style={styles.boxRowLeft}>
                      <View style={styles.boxSpriteBox}>
                        {p.spriteUrl ? (
                          <Image source={{ uri: p.spriteUrl }} style={{ width: "100%", height: "100%" }} resizeMode="contain" />
                        ) : (
                          <Text style={styles.pokeImageText}>{String((p as any)?.name).slice(0, 1).toUpperCase()}</Text>
                        )}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.boxName} numberOfLines={1}>{getDisplayName(p)}</Text>
                        <Text style={styles.boxMeta}>{`Nv ${p.level} | ${safeStr((p as any)?.nature, "-")}`}</Text>
                      </View>
                    </View>
                    <Text style={styles.boxCTA}>Selecionar</Text>
                  </LinearGradient>
                </Pressable>
              ))}
            </View>
          </LinearGradient>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  bagHeader: { marginTop: 6, marginBottom: 10 },
  bagTitle: {
    color: COLORS.white,
    fontSize: 16,
    fontWeight: "900",
    letterSpacing: 2,
    textAlign: "center",
    marginBottom: 10,
  },
  bagTabsRow: { flexDirection: "row", gap: 10 as any, justifyContent: "center" },
  bagTabPress: { borderRadius: 14, overflow: "hidden" },
  bagTabBtn: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  bagTabText: { color: "rgba(255,255,255,0.78)", fontWeight: "900", fontSize: 12, letterSpacing: 1 },
  bagTabTextActive: { color: COLORS.white },

  placeholderCard: {
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    padding: 14,
  },
  placeholderTitle: { color: COLORS.white, fontWeight: "900", marginBottom: 6 },
  placeholderText: { color: "rgba(255,255,255,0.70)", lineHeight: 18 },

  pokeCard: {
    borderRadius: 18,
    padding: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    flexDirection: "row",
    gap: 12 as any,
  },
  pokeCardStarter: { borderColor: "rgba(167,139,250,0.35)" },

  pokeImageWrap: { width: 74, position: "relative" },
  pokeImageFrame: { width: 74, height: 74, borderRadius: 18, padding: 2 },
  pokeImageInner: {
    flex: 1,
    borderRadius: 16,
    backgroundColor: "rgba(0,0,0,0.25)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    overflow: "hidden",
  },
  pokeSprite: { width: "100%", height: "100%" },
  pokeImageText: { color: COLORS.white, fontWeight: "900", fontSize: 20 },

  evolvePress: { marginTop: 8, alignSelf: "center" },
  evolveBtn: {
    width: 38,
    height: 34,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
  },

  starterBadgeInline: {
    marginTop: 8,
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
  },
  starterBadgeText: { color: COLORS.white, fontWeight: "900", fontSize: 10, letterSpacing: 0.4 },

  pokeInfo: { flex: 1 },
  pokeTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 as any, marginBottom: 4 },
  pokeName: { color: COLORS.white, fontWeight: "900", fontSize: 14, flex: 1 },
  pokeMiniRight: { alignItems: "flex-end" },
  pokeLevel: { color: "rgba(255,255,255,0.85)", fontWeight: "900", fontSize: 12 },

  pokeMetaRow: { flexDirection: "row", alignItems: "center", gap: 8 as any, marginBottom: 10, flexWrap: "wrap" },
  pokeMetaText: { color: "rgba(255,255,255,0.70)", fontWeight: "800", fontSize: 12 },
  pokeMetaDot: { color: "rgba(255,255,255,0.35)", fontWeight: "900" },

  pokeStatBlock: { marginBottom: 10 },
  pokeStatRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 },
  pokeStatLabel: { color: "rgba(255,255,255,0.70)", fontWeight: "900", fontSize: 11 },
  pokeStatValue: { color: COLORS.white, fontWeight: "900", fontSize: 11 },

  barTrack: {
    height: 10,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.10)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    overflow: "hidden",
  },
  barFillBase: { height: "100%", borderRadius: 999 },
  barFillHp: { backgroundColor: "#7A0000" },
  barFillExp: { backgroundColor: "rgba(59,130,246,0.85)" },

  // modal
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.60)",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  modalShell: {
    width: "100%",
    borderRadius: 22,
    padding: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  modalTopBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  modalTitle: { color: COLORS.white, fontWeight: "900", fontSize: 14, letterSpacing: 0.6, flex: 1, paddingRight: 10 },
  modalCloseBtn: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },

  modalHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10, gap: 10 as any },
  modalHeaderName: { color: COLORS.white, fontWeight: "900", fontSize: 14, letterSpacing: 0.6, flex: 1 },
  levelInline: {
    color: "rgba(255,255,255,0.90)",
    fontWeight: "900",
    fontSize: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  starterBadgeMini: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "rgba(167,139,250,0.18)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  starterBadgeMiniText: { color: COLORS.white, fontWeight: "900", fontSize: 10, letterSpacing: 0.3 },

  detailsTwoCol: { flexDirection: "row", gap: 12 as any },
  infoCol: { flex: 1, gap: 10 },
  infoRowPress: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8 as any,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },
  infoLabel: { color: "rgba(255,255,255,0.72)", fontWeight: "900", fontSize: 11, letterSpacing: 0.8 },
  infoValue: { color: COLORS.white, fontWeight: "900", fontSize: 12, flex: 1 },

  infoBarBlock: { gap: 6, marginTop: 2 },
  barTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  barNumbers: { color: "rgba(255,255,255,0.85)", fontWeight: "900", fontSize: 11 },

  moveLine: {
    borderRadius: 16,
    padding: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(0,0,0,0.25)",
  },
  moveLineText: { color: COLORS.white, fontWeight: "900", fontSize: 12 },
  relearnBtn: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(59,130,246,0.45)",
    backgroundColor: "rgba(59,130,246,0.16)",
    paddingVertical: 9,
    paddingHorizontal: 10,
  },
  relearnBtnDisabled: { opacity: 0.5 },
  relearnBtnText: { color: COLORS.white, fontWeight: "800", fontSize: 12 },
  relearnSourcesText: { color: "rgba(255,255,255,0.72)", fontWeight: "700", fontSize: 10, marginTop: 3 },
  relearnFilterRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 },
  relearnFilterBtn: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    backgroundColor: "rgba(255,255,255,0.08)",
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  relearnFilterBtnActive: {
    borderColor: "rgba(59,130,246,0.70)",
    backgroundColor: "rgba(59,130,246,0.20)",
  },
  relearnFilterText: { color: COLORS.white, fontWeight: "800", fontSize: 11 },
  blockedRow: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.35)",
    backgroundColor: "rgba(239,68,68,0.12)",
    paddingHorizontal: 8,
    paddingVertical: 7,
    gap: 2,
  },
  blockedText: { color: COLORS.white, fontWeight: "800", fontSize: 12 },
  blockedReasonText: { color: "rgba(255,255,255,0.78)", fontWeight: "700", fontSize: 10 },
  tutorRow: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(0,0,0,0.20)",
    padding: 8,
    gap: 8,
  },
  tutorMoveName: { color: COLORS.white, fontWeight: "800", fontSize: 12 },
  tutorActions: { flexDirection: "row", gap: 8 },

  detailsHeroRow: { flexDirection: "row", gap: 12 as any },
  heroSpriteCard: {
    width: 170,
    height: 200,
    borderRadius: 22,
    padding: 10,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    position: "relative",
    overflow: "hidden",
  },
  heroSprite: { width: "100%", height: "100%" },
  heroGlow: {
    position: "absolute",
    inset: -40 as any,
    borderRadius: 999,
    backgroundColor: "rgba(167,139,250,0.10)",
    transform: [{ rotate: "25deg" }],
  },
  heroMetaCol: { flex: 1, gap: 10 },

  heroNameRow: { flexDirection: "row", alignItems: "center", gap: 10 as any },
  heroName: { color: COLORS.white, fontWeight: "900", fontSize: 16, flex: 1 },
  genderIcon: { fontWeight: "900", fontSize: 16, marginTop: 1 },
  levelBadge: {
    color: "rgba(255,255,255,0.90)",
    fontWeight: "900",
    fontSize: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  heroSubLine: { color: "rgba(255,255,255,0.72)", fontWeight: "800", fontSize: 12, marginTop: 2 },
  iconChip: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.45)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  nicknameInput: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: COLORS.white,
    fontWeight: "900",
    backgroundColor: "rgba(0,0,0,0.30)",
  },

  heroBadges: { flexDirection: "row", flexWrap: "wrap", gap: 8 as any },
  badge: {
    color: COLORS.white,
    fontWeight: "900",
    fontSize: 11,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  badgeAccent: {
    color: COLORS.white,
    fontWeight: "900",
    fontSize: 11,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(59,130,246,0.25)",
    borderWidth: 1,
    borderColor: "rgba(167,139,250,0.25)",
  },

  cardBlock: {
    borderRadius: 18,
    padding: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  cardTitle: { color: "rgba(255,255,255,0.75)", fontWeight: "900", fontSize: 11, letterSpacing: 1.1 },
  evHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  evTotal: { color: "rgba(255,255,255,0.85)", fontWeight: "900", fontSize: 11 },
  evList: { gap: 8, marginTop: 10 },
  evRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  evKey: { width: 34, color: "rgba(255,255,255,0.75)", fontWeight: "900", fontSize: 11 },
  evBarTrack: { flex: 1, height: 8, borderRadius: 999, overflow: "hidden", backgroundColor: "rgba(255,255,255,0.10)", borderWidth: 1, borderColor: "rgba(255,255,255,0.10)" },
  evBarFill: { height: "100%", backgroundColor: "rgba(59,130,246,0.85)" },
  evVal: { width: 36, textAlign: "right", color: COLORS.white, fontWeight: "900", fontSize: 11 },
  cardValue: { color: COLORS.white, fontWeight: "900", fontSize: 13, marginTop: 6 },
  cardHint: { color: "rgba(255,255,255,0.70)", fontWeight: "800", fontSize: 11 },

  abilityRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 as any, marginTop: 6 },
  abilityChip: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 8, borderWidth: 1, borderColor: "rgba(255,255,255,0.12)" },
  abilityChipText: { color: COLORS.white, fontWeight: "900", fontSize: 11 },

  statsGrid: {
    marginTop: 10,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10 as any,
  },
  statRow: {
    width: "31%",
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(0,0,0,0.25)",
  },
  statKey: { color: "rgba(255,255,255,0.70)", fontWeight: "900", fontSize: 11 },
  statVal: { color: COLORS.white, fontWeight: "900", fontSize: 13, marginTop: 4 },

  moveRowPress: {
    borderRadius: 16,
    padding: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(0,0,0,0.25)",
  },
  moveRowTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 as any },
  moveName: { color: COLORS.white, fontWeight: "900", fontSize: 13, flex: 1 },
  moveType: { color: "rgba(255,255,255,0.78)", fontWeight: "900", fontSize: 11, textTransform: "uppercase" },
  moveRowBottom: { flexDirection: "row", alignItems: "center", gap: 10 as any, marginTop: 6, flexWrap: "wrap" },
  moveMeta: { color: "rgba(255,255,255,0.70)", fontWeight: "900", fontSize: 11 },
  moveDesc: { color: "rgba(255,255,255,0.80)", lineHeight: 18 },

  actionsRow: { flexDirection: "row", gap: 10 as any },
  actionBtn: {
    borderRadius: 18,
    paddingVertical: 12,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    flexDirection: "row",
    gap: 10 as any,
  },
  actionBtnText: { color: COLORS.white, fontWeight: "900", fontSize: 12, letterSpacing: 0.8 },

  smallModalShell: { width: "92%", maxHeight: "80%", borderRadius: 22, padding: 14, borderWidth: 1, borderColor: "rgba(255,255,255,0.12)" },
  longText: { color: "rgba(255,255,255,0.88)", fontWeight: "700", lineHeight: 20 },

  smallModal: {
    width: "100%",
    borderRadius: 22,
    padding: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    gap: 12,
  },
  primaryBtn: {
    borderRadius: 18,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  primaryBtnText: { color: COLORS.white, fontWeight: "900", letterSpacing: 0.8 },
  secondaryBtn: {
    borderRadius: 18,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  secondaryBtnText: { color: COLORS.white, fontWeight: "900", letterSpacing: 0.8, opacity: 0.9 },

  evolveShell: {
    width: "100%",
    borderRadius: 22,
    padding: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    gap: 12,
  },
  evolveSub: { color: "rgba(255,255,255,0.80)", textAlign: "center" },
  evolveStage: { height: 210, alignItems: "center", justifyContent: "center", marginVertical: 6, position: "relative" },
  evolveGlow: {
    position: "absolute",
    width: 210,
    height: 210,
    borderRadius: 999,
    backgroundColor: "rgba(59,130,246,0.25)",
  },
  evolveSpriteFrame: {
    width: 190,
    height: 190,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    overflow: "hidden",
  },
  evolveSprite: { width: "90%", height: "90%" },

  removeFromTeamBtn: {
    borderRadius: 18,
    padding: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  removeFromTeamText: { color: COLORS.white, fontWeight: "900", fontSize: 13 },
  removeFromTeamHint: { color: "rgba(255,255,255,0.65)", marginTop: 4, fontSize: 11 },

  boxRow: {
    borderRadius: 18,
    padding: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10 as any,
  },
  boxRowLeft: { flexDirection: "row", alignItems: "center", gap: 10 as any, flex: 1 },
  boxSpriteBox: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: "rgba(0,0,0,0.25)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  boxName: { color: COLORS.white, fontWeight: "900", fontSize: 13 },
  boxMeta: { color: "rgba(255,255,255,0.70)", fontWeight: "800", fontSize: 11, marginTop: 2 },
  boxCTA: { color: COLORS.white, fontWeight: "900", fontSize: 12, opacity: 0.9 },
});



