/* eslint-disable no-console */
/**
 * Gera um JSON fixo: pokemonEvolutionRoot.json
 * Formato: { "<speciesId>": <rootSpeciesId>, ... }
 *
 * Fonte: PokeAPI (pokemon-species + evolution-chain)
 *
 * ✅ Este script é "à prova de caminho":
 * Ele tenta achar pokemonSpecies.json em:
 * 1) admin/src/data/pokemon/pokemonSpecies.json
 * 2) admin/src/data/pokemon/pokemonSpecies.json (variação)
 * 3) mobile/src/data/pokemon/pokemonSpecies.json  ✅ (mais provável no seu caso)
 *
 * Saída (sempre):
 * - elodex-mobile/src/data/pokemon/pokemonEvolutionRoot.json
 *
 * Saída (extra, se você quiser também no admin):
 * - elodex-mobile/admin/src/data/pokemon/pokemonEvolutionRoot.json
 */

const fs = require("fs");
const path = require("path");

// ✅ admin/
const ADMIN_ROOT = path.resolve(__dirname, "..");

// ✅ elodex-mobile/
const MOBILE_ROOT = path.resolve(ADMIN_ROOT, "..");

const CANDIDATE_SPECIES_PATHS = [
  // tenta no admin primeiro (caso exista)
  path.resolve(ADMIN_ROOT, "src", "data", "pokemon", "pokemonSpecies.json"),

  // tenta no mobile (mais provável)
  path.resolve(MOBILE_ROOT, "src", "data", "pokemon", "pokemonSpecies.json"),
];

const OUT_MOBILE_JSON = path.resolve(
  MOBILE_ROOT,
  "src",
  "data",
  "pokemon",
  "pokemonEvolutionRoot.json"
);

const OUT_ADMIN_JSON = path.resolve(
  ADMIN_ROOT,
  "src",
  "data",
  "pokemon",
  "pokemonEvolutionRoot.json"
);

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchJson(url, retries = 4) {
  let lastErr = null;

  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, {
        method: "GET",
        headers: { "User-Agent": "EloDex/1.0" },
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${res.statusText} (${url})`);
      }

      return await res.json();
    } catch (err) {
      lastErr = err;
      await sleep(600 * (i + 1));
    }
  }

  throw lastErr;
}

function findSpeciesJsonPath() {
  for (const p of CANDIDATE_SPECIES_PATHS) {
    if (fs.existsSync(p)) return p;
  }

  // se não achou, mostra as tentativas pra você visualizar
  const tried = CANDIDATE_SPECIES_PATHS.map((p) => `- ${p}`).join("\n");
  throw new Error(
    `Não encontrei pokemonSpecies.json em nenhum caminho.\nTentei:\n${tried}`
  );
}

function readSpeciesIdsFromLocalJson(speciesJsonPath) {
  const raw = fs.readFileSync(speciesJsonPath, "utf8");
  const data = JSON.parse(raw);

  const list = Object.values(data);
  const ids = [];

  for (const s of list) {
    if (typeof s?.id === "number") ids.push(s.id);
  }

  return Array.from(new Set(ids)).sort((a, b) => a - b);
}

/**
 * Percorre chain da PokeAPI e gera pares (speciesId -> rootSpeciesId).
 */
function collectChainPairs(chainNode, rootId, map) {
  if (!chainNode || !chainNode.species || !chainNode.species.url) return;

  const url = chainNode.species.url; // ex: https://pokeapi.co/api/v2/pokemon-species/1/
  const match = url.match(/pokemon-species\/(\d+)\//);
  if (match) {
    const id = Number(match[1]);
    map[id] = rootId;
  }

  const next = chainNode.evolves_to || [];
  for (const child of next) {
    collectChainPairs(child, rootId, map);
  }
}

function safeWriteJson(filePath, obj) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(obj, null, 2), "utf8");
}

async function main() {
  console.log("📌 Admin root:", ADMIN_ROOT);
  console.log("📌 Mobile root:", MOBILE_ROOT);

  const speciesPath = findSpeciesJsonPath();
  console.log("✅ pokemonSpecies.json encontrado em:");
  console.log("   ", speciesPath);

  console.log("🔎 Lendo ids do pokemonSpecies.json...");
  const ids = readSpeciesIdsFromLocalJson(speciesPath);
  console.log(`✅ Total de speciesIds no JSON local: ${ids.length}`);

  const evolutionRootMap = {}; // { [id]: rootId }
  const chainCache = new Map(); // evolution_chain_url -> chainJson
  const speciesCache = new Map(); // speciesId -> speciesJson

  let processed = 0;

  for (const id of ids) {
    processed++;

    if (evolutionRootMap[id]) continue;

    try {
      const speciesUrl = `https://pokeapi.co/api/v2/pokemon-species/${id}/`;

      let speciesJson = speciesCache.get(id);
      if (!speciesJson) {
        speciesJson = await fetchJson(speciesUrl, 4);
        speciesCache.set(id, speciesJson);
      }

      const chainUrl = speciesJson?.evolution_chain?.url;
      if (!chainUrl) {
        evolutionRootMap[id] = id;
        continue;
      }

      let chainJson = chainCache.get(chainUrl);
      if (!chainJson) {
        chainJson = await fetchJson(chainUrl, 4);
        chainCache.set(chainUrl, chainJson);
      }

      const rootUrl = chainJson?.chain?.species?.url;
      const matchRoot = rootUrl?.match(/pokemon-species\/(\d+)\//);
      const rootId = matchRoot ? Number(matchRoot[1]) : id;

      collectChainPairs(chainJson.chain, rootId, evolutionRootMap);

      // ✅ rate limit leve
      if (processed % 25 === 0) {
        console.log(`... processados ${processed}/${ids.length}`);
        await sleep(350);
      }
    } catch (err) {
      console.log(`⚠️ Falha no id ${id}: ${err?.message || err}`);
      evolutionRootMap[id] = id;
    }
  }

  // fallback total
  for (const id of ids) {
    if (!evolutionRootMap[id]) evolutionRootMap[id] = id;
  }

  // ordena chaves
  const ordered = {};
  Object.keys(evolutionRootMap)
    .map((k) => Number(k))
    .sort((a, b) => a - b)
    .forEach((k) => {
      ordered[String(k)] = evolutionRootMap[k];
    });

  console.log("💾 Salvando JSON no Mobile (sempre)...");
  safeWriteJson(OUT_MOBILE_JSON, ordered);
  console.log(`✅ Gerado: ${OUT_MOBILE_JSON}`);

  console.log("💾 Salvando JSON no Admin (extra)...");
  safeWriteJson(OUT_ADMIN_JSON, ordered);
  console.log(`✅ Gerado: ${OUT_ADMIN_JSON}`);

  console.log("🏁 Concluído!");
}

main().catch((e) => {
  console.error("❌ Erro fatal:", e);
  process.exit(1);
});
