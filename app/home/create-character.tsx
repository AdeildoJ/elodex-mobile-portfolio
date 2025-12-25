import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  ActivityIndicator,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";

import { COLORS } from "../../src/theme/colors";
import { REGIONS, RegionKey } from "../../src/data/regions";
import { STARTERS_BY_REGION } from "../../src/data/startersByRegion";
import { VILLAINS_BY_REGION } from "../../src/data/villainsByRegion";
import { NATURES, NatureName } from "../../src/data/natures";
import { randomFromArray, randomGender } from "../../src/utils/random";

import { auth, storage } from "../../src/services/firebase/firebaseConfig";
import {
  createCharacterForPlayer,
  getCharacterForPlayer,
  updateCharacterForPlayer,
} from "../../src/services/firebase/characters.service";

import { getPlayerProfile } from "../../src/services/firebase/players.service";

import { getDownloadURL, ref, uploadBytes } from "firebase/storage";

/**
 * ✅ Catálogo fixo local (JSON)
 */
type PokemonAbility = {
  abilityId: string;
  isHidden: boolean;
  slot: number;
};

type PokemonFlags = {
  legendary: boolean;
  mythical: boolean;
};

type PokemonSpecies = {
  id: number;
  name: string;
  generation: number;
  types: string[];
  abilities: PokemonAbility[];
  flags: PokemonFlags;
  sprites?: {
    home?: { default?: string | null; shiny?: string | null };
    officialArtwork?: { default?: string | null; shiny?: string | null };
  };
};

const POKEMON_SPECIES: Record<string, PokemonSpecies> = require("../../src/data/pokemon/pokemonSpecies.json");

/**
 * ✅ Novo JSON fixo: { "<speciesId>": <rootSpeciesId> }
 * Gerado pelo Admin via script
 */
const POKEMON_EVOLUTION_ROOT: Record<string, number> = require("../../src/data/pokemon/pokemonEvolutionRoot.json");

type CharacterClassType = "TRAINER" | "THIEF";
type GenderType = "M" | "F" | "U";

type StarterPokemonData = {
  speciesId: number;
  speciesName: string;
  nickname: string;
  abilityId: string;
  nature: NatureName;
  gender: GenderType;
};

type FormState = {
  avatarLocalUri?: string;
  avatarUrl?: string;

  name: string;
  region?: RegionKey;
  classType?: CharacterClassType;

  starterPokemon?: StarterPokemonData;
};

function normalizeName(input: string) {
  return input.trim();
}

function genderLabel(g: GenderType) {
  if (g === "M") return "Masculino";
  if (g === "F") return "Feminino";
  return "Desconhecido";
}

function titleizeAbilityId(abilityId: string) {
  if (!abilityId) return "";
  return abilityId
    .split("-")
    .map((p) => (p.length ? p[0].toUpperCase() + p.slice(1) : p))
    .join(" ");
}

/**
 * ✅ Ultra Beasts (UB) - sem flag no JSON, lista fixa
 */
const ULTRA_BEAST_NAMES = new Set<string>([
  "Nihilego",
  "Buzzwole",
  "Pheromosa",
  "Xurkitree",
  "Celesteela",
  "Kartana",
  "Guzzlord",
  "Poipole",
  "Naganadel",
  "Stakataka",
  "Blacephalon",
]);

function buildSpeciesIndexes(speciesMap: Record<string, PokemonSpecies>) {
  const byId = new Map<number, PokemonSpecies>();
  const byNameLower = new Map<string, PokemonSpecies>();

  Object.values(speciesMap).forEach((s: PokemonSpecies) => {
    byId.set(s.id, s);
    byNameLower.set(s.name.toLowerCase(), s);
  });

  return { byId, byNameLower };
}

/** ✅ converte string -> RegionKey se for válido */
function toRegionKey(value: string | undefined | null): RegionKey | undefined {
  if (!value) return undefined;
  const keys = REGIONS.map((r) => r.key);
  return keys.includes(value as RegionKey) ? (value as RegionKey) : undefined;
}

/** ✅ converte string -> NatureName se for válido */
function toNatureName(value: string | undefined | null): NatureName {
  if (!value) return "Docile";
  return (NATURES as readonly string[]).includes(value)
    ? (value as NatureName)
    : "Docile";
}

/**
 * VIP: remove FORMS mantendo o primeiro por "rootName".
 * (Isso é sobre Forms: Alola/Galar/Mega/Gmax etc)
 */
function removeFormsKeepFirst(speciesList: PokemonSpecies[]): PokemonSpecies[] {
  const map = new Map<string, PokemonSpecies>();

  for (const s of speciesList) {
    const root = s.name.split("-")[0];
    const current = map.get(root);

    if (!current) {
      map.set(root, s);
      continue;
    }

    if (s.id < current.id) {
      map.set(root, s);
    }
  }

  return Array.from(map.values());
}

/**
 * ✅ Evolução: pega o rootId (primeira forma da linha evolutiva)
 * Ex: Venusaur(3) -> 1 (Bulbasaur)
 */
function getRootId(speciesId: number): number {
  const root = POKEMON_EVOLUTION_ROOT[String(speciesId)];
  return typeof root === "number" ? root : speciesId;
}

export default function CreateCharacterScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ characterId?: string }>();
  const characterId = params.characterId;

  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);

  const [playerType, setPlayerType] = useState<"FREE" | "VIP">("FREE");

  const [form, setForm] = useState<FormState>({
    name: "",
  });

  // ✅ VIP search
  const [vipSearch, setVipSearch] = useState<string>("");

  const isEditing = !!characterId;
  const isVip = playerType === "VIP";

  const { byId, byNameLower } = useMemo(
    () => buildSpeciesIndexes(POKEMON_SPECIES),
    []
  );

  const regionsList = useMemo(() => {
    return REGIONS as Array<{ key: RegionKey; label: string }>;
  }, []);

  function getSpeciesByName(name: string): PokemonSpecies | null {
    const s = byNameLower.get(name.toLowerCase());
    return s ?? null;
  }

  /**
   * ✅ FREE: 3 cards apenas (por região/classe)
   */
  const freePokemonChoices = useMemo((): string[] => {
    if (!form.region || !form.classType) return [];

    if (form.classType === "TRAINER") {
      return STARTERS_BY_REGION[form.region] as string[];
    }

    return VILLAINS_BY_REGION[form.region] as string[];
  }, [form.region, form.classType]);

  /**
   * ✅ VIP: Resultados de busca que SEMPRE retornam a "primeira forma" da linha evolutiva
   *
   * - Busca pode bater em: "venusaur"
   * - Mas o resultado exibido vira: "Bulbasaur"
   *
   * Regras mantidas:
   * - Sem Lendários/Míticos
   * - Sem Ultra Beasts
   * - Sem FORMS (Alola/Galar/Mega/Gmax etc)
   */
  const vipFilteredResults = useMemo((): string[] => {
    if (!isVip) return [];

    const q = vipSearch.trim().toLowerCase();
    if (!q) return [];

    // 1) lista base (sem lend/myth/UB) e sem forms, para podermos exibir nomes válidos
    const allValidBase = removeFormsKeepFirst(
      Object.values(POKEMON_SPECIES).filter((s: PokemonSpecies) => {
        const isLegendary = !!s.flags?.legendary;
        const isMythical = !!s.flags?.mythical;
        const isUB = ULTRA_BEAST_NAMES.has(s.name);
        if (isLegendary) return false;
        if (isMythical) return false;
        if (isUB) return false;
        return true;
      })
    );

    // 2) busca em TODOS os species (inclusive evoluções), mas converte para ROOT ID
    const matchedRootIds = new Set<number>();

    Object.values(POKEMON_SPECIES).forEach((s: PokemonSpecies) => {
      const isLegendary = !!s.flags?.legendary;
      const isMythical = !!s.flags?.mythical;
      const isUB = ULTRA_BEAST_NAMES.has(s.name);
      if (isLegendary || isMythical || isUB) return;

      // remove forms na comparação
      const nameLower = s.name.toLowerCase();
      const rootNameLower = s.name.split("-")[0].toLowerCase();

      if (nameLower.includes(q) || rootNameLower.includes(q)) {
        matchedRootIds.add(getRootId(s.id));
      }
    });

    // 3) converte rootId -> nome exibido (o species cujo id == rootId)
    const roots = allValidBase
      .filter((s: PokemonSpecies) => matchedRootIds.has(s.id))
      .map((s: PokemonSpecies) => s.name);

    // 4) remove duplicados e ordena
    const unique = Array.from(new Set(roots));
    unique.sort((a, b) => a.localeCompare(b));

    return unique.slice(0, 50);
  }, [isVip, vipSearch]);

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        setLoading(true);

        const user = auth.currentUser;
        if (!user) {
          Alert.alert("Sessão expirada", "Faça login novamente.");
          router.replace("/auth/login");
          return;
        }

        const profile = await getPlayerProfile(user.uid);
        if (mounted && profile?.playerType) {
          setPlayerType(profile.playerType);
        }

        if (characterId) {
          const char = await getCharacterForPlayer(user.uid, characterId);

          if (!char) {
            Alert.alert("Erro", "Personagem não encontrado.");
            router.back();
            return;
          }

          if (!mounted) return;

          setForm({
            avatarUrl: char.avatarUrl,
            name: char.name ?? "",
            region: toRegionKey(char.region),
            classType: char.classType,
            starterPokemon: char.starterPokemon
              ? {
                  speciesId: char.starterPokemon.speciesId,
                  speciesName: char.starterPokemon.speciesName,
                  nickname: char.starterPokemon.nickname,
                  abilityId: char.starterPokemon.abilityId,
                  nature: toNatureName(char.starterPokemon.nature),
                  gender: char.starterPokemon.gender as GenderType,
                }
              : undefined,
          });
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Falha ao carregar dados.";
        Alert.alert("Erro", msg);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    load();
    return () => {
      mounted = false;
    };
  }, [characterId, router]);

  async function handlePickAvatar() {
    try {
      const ImagePicker = require("expo-image-picker") as typeof import("expo-image-picker");

      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(
          "Permissão necessária",
          "Permita acesso às fotos para escolher um avatar."
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.85,
        allowsEditing: true,
        aspect: [1, 1],
      });

      if (result.canceled) return;

      const uri: string | undefined = result.assets?.[0]?.uri;
      if (!uri) return;

      // ✅ Local uri serve só pra preview e upload
      setForm((prev: FormState) => ({ ...prev, avatarLocalUri: uri }));
    } catch {
      Alert.alert("Erro", "Falha ao abrir galeria.");
    }
  }

  function handleSelectStarter(speciesName: string) {
    const species = getSpeciesByName(speciesName);
    if (!species) {
      Alert.alert(
        "Erro",
        `Pokémon não encontrado no catálogo local: ${speciesName}`
      );
      return;
    }

    const nickname = species.name;
    const availableAbilities = (species.abilities ?? []).map(
      (a: PokemonAbility) => a.abilityId
    );

    if (availableAbilities.length === 0) {
      Alert.alert("Erro", "Esse Pokémon não possui habilidades no catálogo local.");
      return;
    }

    if (!isVip) {
      const randomNature = randomFromArray(NATURES);
      const randomGen = randomGender();
      const randomAbilityId = randomFromArray(availableAbilities);

      setForm((prev: FormState) => ({
        ...prev,
        starterPokemon: {
          speciesId: species.id,
          speciesName: species.name,
          nickname,
          abilityId: randomAbilityId,
          nature: randomNature,
          gender: randomGen,
        },
      }));
      return;
    }

    // VIP: usuário escolhe ability/nature/gender depois
    setForm((prev: FormState) => ({
      ...prev,
      starterPokemon: {
        speciesId: species.id,
        speciesName: species.name,
        nickname,
        abilityId: "",
        nature: "Docile",
        gender: "U",
      },
    }));
  }

  function validate(): string | null {
    const name = normalizeName(form.name);

    if (!name) return "Nome do Personagem é obrigatório.";
    if (!form.region) return "Região é obrigatória.";
    if (!form.classType) return "Classe é obrigatória.";
    if (!form.starterPokemon?.speciesName)
      return "Você precisa escolher o Pokémon Inicial.";

    if (isVip) {
      if (!form.starterPokemon.abilityId)
        return "Habilidade é obrigatória (VIP).";
      if (!form.starterPokemon.nature) return "Natureza é obrigatória (VIP).";
      if (!form.starterPokemon.gender) return "Gênero é obrigatório (VIP).";
    } else {
      if (!form.starterPokemon.abilityId)
        return "Falha ao gerar habilidade aleatória (FREE).";
      if (!form.starterPokemon.nature)
        return "Falha ao gerar natureza aleatória (FREE).";
      if (!form.starterPokemon.gender)
        return "Falha ao gerar gênero aleatório (FREE).";
    }

    return null;
  }

  async function uploadAvatarIfNeeded(uid: string, charId: string) {
    if (!form.avatarLocalUri) return form.avatarUrl;

    const response = await fetch(form.avatarLocalUri);
    const blob = await response.blob();

    const storageRef = ref(
      storage,
      `players/${uid}/characters/${charId}/avatar.jpg`
    );
    await uploadBytes(storageRef, blob);
    const url = await getDownloadURL(storageRef);

    return url as string;
  }

  async function handleSave() {
    const user = auth.currentUser;
    if (!user) {
      Alert.alert("Sessão expirada", "Faça login novamente.");
      router.replace("/auth/login");
      return;
    }

    const error = validate();
    if (error) {
      Alert.alert("Validação", error);
      return;
    }

    try {
      setSaving(true);

      // ✅ base payload SEM avatarUrl (para nunca mandar undefined)
      const basePayload = {
        name: normalizeName(form.name),
        region: form.region!,
        classType: form.classType!,
        starterPokemon: {
          ...form.starterPokemon!,
          nature: form.starterPokemon!.nature,
        },
      };

      // ✅ inclui avatarUrl somente se for string válida
      const payload =
        form.avatarUrl && form.avatarUrl.trim().length > 0
          ? { ...basePayload, avatarUrl: form.avatarUrl }
          : basePayload;

      if (!isEditing) {
        // ✅ create (sem avatarUrl undefined)
        const newId: string = await createCharacterForPlayer(user.uid, payload);

        // ✅ upload depois (se tiver avatarLocalUri)
        const uploadedUrl = await uploadAvatarIfNeeded(user.uid, newId);

        if (uploadedUrl) {
          await updateCharacterForPlayer(user.uid, newId, { avatarUrl: uploadedUrl });

          // ✅ espelha no estado (visual) e limpa local uri
          setForm((prev) => ({
            ...prev,
            avatarUrl: uploadedUrl,
            avatarLocalUri: undefined,
          }));
        }

        Alert.alert("Sucesso", "Personagem criado!");
        router.back();
        return;
      }

      // ✅ update (payload também nunca manda avatarUrl undefined)
      await updateCharacterForPlayer(user.uid, characterId!, payload);

      // ✅ se escolheu nova foto local, faz upload e atualiza só avatarUrl
      const uploadedUrl = await uploadAvatarIfNeeded(user.uid, characterId!);
      if (uploadedUrl) {
        await updateCharacterForPlayer(user.uid, characterId!, { avatarUrl: uploadedUrl });

        setForm((prev) => ({
          ...prev,
          avatarUrl: uploadedUrl,
          avatarLocalUri: undefined,
        }));
      }

      Alert.alert("Sucesso", "Personagem atualizado!");
      router.back();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Falha ao salvar.";
      Alert.alert("Erro", msg);
    } finally {
      setSaving(false);
    }
  }

  function setRegion(region: RegionKey) {
    setForm((prev: FormState) => ({
      ...prev,
      region,
      starterPokemon: undefined,
    }));
  }

  function setClassType(classType: CharacterClassType) {
    setForm((prev: FormState) => ({
      ...prev,
      classType,
      starterPokemon: undefined,
    }));
  }

  function setStarterAbility(abilityId: string) {
    setForm((prev: FormState) => ({
      ...prev,
      starterPokemon: prev.starterPokemon
        ? { ...prev.starterPokemon, abilityId }
        : prev.starterPokemon,
    }));
  }

  function setStarterNature(nature: NatureName) {
    setForm((prev: FormState) => ({
      ...prev,
      starterPokemon: prev.starterPokemon
        ? { ...prev.starterPokemon, nature }
        : prev.starterPokemon,
    }));
  }

  function setStarterGender(gender: GenderType) {
    setForm((prev: FormState) => ({
      ...prev,
      starterPokemon: prev.starterPokemon
        ? { ...prev.starterPokemon, gender }
        : prev.starterPokemon,
    }));
  }

  function setStarterNickname(nickname: string) {
    setForm((prev: FormState) => ({
      ...prev,
      starterPokemon: prev.starterPokemon
        ? { ...prev.starterPokemon, nickname }
        : prev.starterPokemon,
    }));
  }

  const selectedSpecies = useMemo(() => {
    if (!form.starterPokemon?.speciesId) return null;
    return byId.get(form.starterPokemon.speciesId) ?? null;
  }, [form.starterPokemon?.speciesId, byId]);

  const availableAbilitiesForSelected = useMemo(() => {
    if (!selectedSpecies) return [];
    const abilities = (selectedSpecies.abilities ?? []).map(
      (a: PokemonAbility) => a.abilityId
    );
    return Array.from(new Set<string>(abilities));
  }, [selectedSpecies]);

  if (loading) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="large" />
        <Text style={styles.loadingText}>Carregando...</Text>
      </View>
    );
  }

  return (
    <LinearGradient colors={[COLORS.dark, "#121212"]} style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>
          {isEditing ? "Editar Personagem" : "Criar Personagem"}
        </Text>

        {/* Avatar */}
        <View style={styles.section}>
          <Text style={styles.label}>Foto (Avatar)</Text>
          <View style={styles.avatarRow}>
            <View style={styles.avatarBox}>
              {form.avatarLocalUri ? (
                <Image source={{ uri: form.avatarLocalUri }} style={styles.avatarImg} />
              ) : form.avatarUrl ? (
                <Image source={{ uri: form.avatarUrl }} style={styles.avatarImg} />
              ) : (
                <Text style={styles.avatarPlaceholder}>Sem foto</Text>
              )}
            </View>

            <Pressable onPress={handlePickAvatar} style={styles.buttonSmall}>
              <Text style={styles.buttonSmallText}>Escolher foto</Text>
            </Pressable>
          </View>
        </View>

        {/* Nome */}
        <View style={styles.section}>
          <Text style={styles.label}>Nome do Personagem *</Text>
          <TextInput
            value={form.name}
            onChangeText={(t: string) => setForm((p: FormState) => ({ ...p, name: t }))}
            placeholder="Digite o nome do personagem"
            placeholderTextColor="#9CA3AF"
            style={styles.input}
          />
        </View>

        {/* Região */}
        <View style={styles.section}>
          <Text style={styles.label}>Região *</Text>

          <View style={styles.chipsWrap}>
            {regionsList.map((r: { key: RegionKey; label: string }) => {
              const active = form.region === r.key;
              return (
                <Pressable
                  key={r.key}
                  onPress={() => setRegion(r.key)}
                  style={[styles.chip, active && styles.chipActive]}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>
                    {r.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Classe */}
        <View style={styles.section}>
          <Text style={styles.label}>Classe *</Text>

          <View style={styles.chipsWrap}>
            <Pressable
              onPress={() => setClassType("TRAINER")}
              style={[styles.chip, form.classType === "TRAINER" && styles.chipActive]}
            >
              <Text
                style={[
                  styles.chipText,
                  form.classType === "TRAINER" && styles.chipTextActive,
                ]}
              >
                Treinador
              </Text>
            </Pressable>

            <Pressable
              onPress={() => setClassType("THIEF")}
              style={[styles.chip, form.classType === "THIEF" && styles.chipActive]}
            >
              <Text
                style={[
                  styles.chipText,
                  form.classType === "THIEF" && styles.chipTextActive,
                ]}
              >
                Ladrão
              </Text>
            </Pressable>
          </View>

          <Text style={styles.hint}>
            {isVip
              ? "VIP: escolha via busca (retorna sempre a primeira forma da linha evolutiva)."
              : form.classType === "TRAINER"
              ? "Treinador: mostra os 3 iniciais da região."
              : form.classType === "THIEF"
              ? "Ladrão: mostra 3 Pokémon de vilões da região."
              : "Selecione a classe para ver os Pokémon iniciais."}
          </Text>
        </View>

        {/* Pokémon Inicial */}
        <View style={styles.section}>
          <Text style={styles.label}>Pokémon Inicial *</Text>

          {!form.region || !form.classType ? (
            <Text style={styles.hint}>Selecione Região e Classe primeiro.</Text>
          ) : isVip ? (
            <>
              <TextInput
                value={vipSearch}
                onChangeText={(t: string) => setVipSearch(t)}
                placeholder="Buscar Pokémon (VIP)..."
                placeholderTextColor="#9CA3AF"
                style={styles.input}
                autoCapitalize="none"
                autoCorrect={false}
              />

              {vipSearch.trim().length === 0 ? (
                <Text style={styles.hint}>Digite para buscar (ex: venusaur → bulbasaur).</Text>
              ) : (
                <View style={{ paddingTop: 10 }}>
                  {vipFilteredResults.length === 0 ? (
                    <Text style={styles.hint}>Nenhum Pokémon encontrado.</Text>
                  ) : (
                    vipFilteredResults.map((name: string) => {
                      const active = form.starterPokemon?.speciesName === name;
                      return (
                        <Pressable
                          key={name}
                          onPress={() => handleSelectStarter(name)}
                          style={[
                            styles.vipResultRow,
                            active && styles.vipResultRowActive,
                          ]}
                        >
                          <Text
                            style={[
                              styles.vipResultText,
                              active && styles.vipResultTextActive,
                            ]}
                          >
                            {name}
                          </Text>
                        </Pressable>
                      );
                    })
                  )}
                </View>
              )}
            </>
          ) : (
            <>
              <View style={[styles.pokemonListContent, { paddingTop: 6 }]}>
                <View style={styles.pokemonRow}>
                  {freePokemonChoices.map((pokeName: string) => {
                    const active = form.starterPokemon?.speciesName === pokeName;
                    return (
                      <Pressable
                        key={pokeName}
                        onPress={() => handleSelectStarter(pokeName)}
                        style={[styles.pokemonCard, active && styles.pokemonCardActive]}
                      >
                        <Text style={[styles.pokemonName, active && styles.pokemonNameActive]}>
                          {pokeName}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                {freePokemonChoices.length === 0 && (
                  <Text style={styles.hint}>Nenhum Pokémon disponível.</Text>
                )}
              </View>
            </>
          )}
        </View>

        {/* Dados do Pokémon escolhido */}
        {form.starterPokemon?.speciesName ? (
          <View style={styles.section}>
            <Text style={styles.label}>Dados do Pokémon</Text>

            <View style={styles.dataRow}>
              <Text style={styles.dataLabel}>Pokémon:</Text>
              <Text style={styles.dataValue}>{form.starterPokemon.speciesName}</Text>
            </View>

            <View style={styles.sectionInner}>
              <Text style={styles.labelSmall}>Nome do Pokémon</Text>
              <TextInput
                value={form.starterPokemon.nickname}
                onChangeText={(t: string) => setStarterNickname(t)}
                placeholder="Nome do Pokémon"
                placeholderTextColor="#9CA3AF"
                style={styles.input}
              />
              <Text style={styles.hint}>Padrão: nome real do Pokémon (você pode alterar).</Text>
            </View>

            {!isVip ? (
              <>
                <View style={styles.dataRow}>
                  <Text style={styles.dataLabel}>Habilidade:</Text>
                  <Text style={styles.dataValue}>
                    {titleizeAbilityId(form.starterPokemon.abilityId)}
                  </Text>
                </View>

                <View style={styles.dataRow}>
                  <Text style={styles.dataLabel}>Natureza:</Text>
                  <Text style={styles.dataValue}>{form.starterPokemon.nature}</Text>
                </View>

                <View style={styles.dataRow}>
                  <Text style={styles.dataLabel}>Gênero:</Text>
                  <Text style={styles.dataValue}>{genderLabel(form.starterPokemon.gender)}</Text>
                </View>

                <Text style={styles.hint}>
                  FREE: habilidade, natureza e gênero são definidos aleatoriamente.
                </Text>
              </>
            ) : (
              <>
                <View style={styles.sectionInner}>
                  <Text style={styles.labelSmall}>Habilidade *</Text>
                  <View style={styles.chipsWrap}>
                    {availableAbilitiesForSelected.map((abilityId: string) => {
                      const active = form.starterPokemon?.abilityId === abilityId;
                      return (
                        <Pressable
                          key={abilityId}
                          onPress={() => setStarterAbility(abilityId)}
                          style={[styles.chipSmall, active && styles.chipActive]}
                        >
                          <Text style={[styles.chipText, active && styles.chipTextActive]}>
                            {titleizeAbilityId(abilityId)}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>

                <View style={styles.sectionInner}>
                  <Text style={styles.labelSmall}>Natureza *</Text>
                  <View style={styles.chipsWrap}>
                    {NATURES.map((n: NatureName) => {
                      const active = form.starterPokemon?.nature === n;
                      return (
                        <Pressable
                          key={n}
                          onPress={() => setStarterNature(n)}
                          style={[styles.chipSmall, active && styles.chipActive]}
                        >
                          <Text style={[styles.chipText, active && styles.chipTextActive]}>
                            {n}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>

                <View style={styles.sectionInner}>
                  <Text style={styles.labelSmall}>Gênero *</Text>
                  <View style={styles.chipsWrap}>
                    {(["M", "F", "U"] as GenderType[]).map((g: GenderType) => {
                      const active = form.starterPokemon?.gender === g;
                      return (
                        <Pressable
                          key={g}
                          onPress={() => setStarterGender(g)}
                          style={[styles.chip, active && styles.chipActive]}
                        >
                          <Text style={[styles.chipText, active && styles.chipTextActive]}>
                            {genderLabel(g)}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              </>
            )}
          </View>
        ) : null}

        {/* Actions */}
        <View style={styles.actions}>
          <Pressable
            onPress={() => router.back()}
            style={[styles.button, styles.buttonGhost]}
            disabled={saving}
          >
            <Text style={styles.buttonGhostText}>Cancelar</Text>
          </Pressable>

          <Pressable onPress={handleSave} style={styles.button} disabled={saving}>
            <LinearGradient colors={[COLORS.primary, COLORS.secondary]} style={styles.buttonGradient}>
              {saving ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>
                  {isEditing ? "Salvar alterações" : "Criar personagem"}
                </Text>
              )}
            </LinearGradient>
          </Pressable>
        </View>
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },

  loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
  loadingText: { marginTop: 10, color: "#111" },

  title: {
    color: COLORS.white,
    fontSize: 22,
    fontWeight: "800",
    marginBottom: 16,
  },

  section: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 16,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },

  sectionInner: { marginTop: 12 },

  label: { color: COLORS.white, fontSize: 14, fontWeight: "700", marginBottom: 8 },
  labelSmall: { color: COLORS.white, fontSize: 13, fontWeight: "700", marginBottom: 8 },

  hint: { color: "rgba(255,255,255,0.75)", marginTop: 8, fontSize: 12, lineHeight: 16 },

  input: {
    backgroundColor: "rgba(0,0,0,0.25)",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: COLORS.white,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },

  chipsWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },

  chip: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  chipSmall: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    backgroundColor: "rgba(255,255,255,0.04)",
  },

  chipActive: {
    borderColor: "rgba(255,255,255,0.35)",
    backgroundColor: "rgba(59,130,246,0.25)",
  },

  chipText: { color: "rgba(255,255,255,0.85)", fontWeight: "700", fontSize: 12 },
  chipTextActive: { color: COLORS.white },

  avatarRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  avatarBox: {
    width: 72,
    height: 72,
    borderRadius: 18,
    backgroundColor: "rgba(0,0,0,0.25)",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  avatarImg: { width: "100%", height: "100%" },
  avatarPlaceholder: { color: "rgba(255,255,255,0.70)", fontSize: 12 },

  buttonSmall: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  buttonSmallText: { color: COLORS.white, fontWeight: "800" },

  pokemonListContent: { paddingTop: 6 },

  pokemonRow: {
    flexDirection: "row",
    gap: 10,
    flexWrap: "nowrap",
    justifyContent: "space-between",
  },

  pokemonCard: {
    flex: 1,
    minHeight: 52,
    borderRadius: 14,
    padding: 10,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    justifyContent: "center",
    marginBottom: 10,
  },
  pokemonCardActive: {
    backgroundColor: "rgba(167,139,250,0.20)",
    borderColor: "rgba(167,139,250,0.45)",
  },
  pokemonName: {
    color: "rgba(255,255,255,0.90)",
    fontWeight: "900",
    textAlign: "center",
    fontSize: 12,
  },
  pokemonNameActive: { color: COLORS.white },

  vipResultRow: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.04)",
    marginBottom: 10,
  },
  vipResultRowActive: {
    backgroundColor: "rgba(167,139,250,0.20)",
    borderColor: "rgba(167,139,250,0.45)",
  },
  vipResultText: { color: "rgba(255,255,255,0.90)", fontWeight: "900" },
  vipResultTextActive: { color: COLORS.white },

  dataRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 6,
  },
  dataLabel: { color: "rgba(255,255,255,0.75)", fontWeight: "700" },
  dataValue: { color: COLORS.white, fontWeight: "900" },

  actions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 8,
    alignItems: "center",
  },
  button: { flex: 1, borderRadius: 16, overflow: "hidden" },
  buttonGradient: { paddingVertical: 14, alignItems: "center", justifyContent: "center" },
  buttonText: { color: "#fff", fontWeight: "900" },

  buttonGhost: {
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    backgroundColor: "rgba(255,255,255,0.06)",
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 14,
  },
  buttonGhostText: { color: COLORS.white, fontWeight: "900" },
});
