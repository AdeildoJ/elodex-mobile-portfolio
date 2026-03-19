export type EvolutionRule = {
  toSpeciesId: number;
  minLevel?: number;
  minFriendship?: number;
  itemId?: string;
  moveId?: string;
  biomeId?: string;
  requireDay?: boolean;
  requireNight?: boolean;
};

function addRule(map: Record<number, EvolutionRule[]>, fromSpeciesId: number, rule: EvolutionRule) {
  if (!map[fromSpeciesId]) map[fromSpeciesId] = [];
  map[fromSpeciesId].push(rule);
}

function addLevelChain(map: Record<number, EvolutionRule[]>, speciesIds: number[], levels: number[]) {
  for (let i = 0; i < levels.length; i += 1) {
    addRule(map, speciesIds[i], { toSpeciesId: speciesIds[i + 1], minLevel: levels[i] });
  }
}

function addStoneRule(map: Record<number, EvolutionRule[]>, fromSpeciesId: number, toSpeciesId: number, itemId: string) {
  addRule(map, fromSpeciesId, { toSpeciesId, itemId });
}

function addFriendshipRule(
  map: Record<number, EvolutionRule[]>,
  fromSpeciesId: number,
  toSpeciesId: number,
  opts?: Pick<EvolutionRule, "requireDay" | "requireNight">
) {
  addRule(map, fromSpeciesId, { toSpeciesId, minFriendship: 220, ...opts });
}

const rules: Record<number, EvolutionRule[]> = {};

// Gen 1
addLevelChain(rules, [1, 2, 3], [16, 32]);
addLevelChain(rules, [4, 5, 6], [16, 36]);
addLevelChain(rules, [7, 8, 9], [16, 36]);
addLevelChain(rules, [10, 11, 12], [7, 10]);
addLevelChain(rules, [13, 14, 15], [7, 10]);
addLevelChain(rules, [16, 17, 18], [18, 36]);
addLevelChain(rules, [19, 20], [20]);
addLevelChain(rules, [21, 22], [20]);
addLevelChain(rules, [23, 24], [22]);
addLevelChain(rules, [27, 28], [22]);
addLevelChain(rules, [29, 30, 31], [16, 0]);
addLevelChain(rules, [32, 33, 34], [16, 0]);
addStoneRule(rules, 30, 31, "moon-stone");
addStoneRule(rules, 33, 34, "moon-stone");
addStoneRule(rules, 35, 36, "moon-stone");
addStoneRule(rules, 37, 38, "fire-stone");
addStoneRule(rules, 39, 40, "moon-stone");
addFriendshipRule(rules, 172, 25);
addStoneRule(rules, 25, 26, "thunder-stone");
addLevelChain(rules, [41, 42], [22]);
addLevelChain(rules, [43, 44, 45], [21, 0]);
addStoneRule(rules, 44, 45, "leaf-stone");
addLevelChain(rules, [46, 47], [24]);
addLevelChain(rules, [48, 49], [31]);
addStoneRule(rules, 50, 51, "leaf-stone");
addLevelChain(rules, [52, 53], [28]);
addLevelChain(rules, [54, 55], [33]);
addLevelChain(rules, [56, 57], [28]);
addLevelChain(rules, [58, 59], [0]);
addStoneRule(rules, 58, 59, "fire-stone");
addLevelChain(rules, [60, 61, 62], [25, 0]);
addStoneRule(rules, 61, 62, "water-stone");
addLevelChain(rules, [63, 64], [16]);
addLevelChain(rules, [66, 67, 68], [28, 0]);
addLevelChain(rules, [69, 70, 71], [21, 0]);
addStoneRule(rules, 70, 71, "leaf-stone");
addLevelChain(rules, [72, 73], [30]);
addLevelChain(rules, [74, 75, 76], [25, 0]);
addLevelChain(rules, [77, 78], [40]);
addLevelChain(rules, [79, 80], [37]);
addLevelChain(rules, [81, 82], [30]);
addLevelChain(rules, [84, 85], [31]);
addLevelChain(rules, [86, 87], [34]);
addLevelChain(rules, [88, 89], [38]);
addStoneRule(rules, 90, 91, "water-stone");
addLevelChain(rules, [92, 93, 94], [25, 0]);
addLevelChain(rules, [96, 97], [26]);
addLevelChain(rules, [98, 99], [28]);
addLevelChain(rules, [100, 101], [30]);
addStoneRule(rules, 102, 103, "leaf-stone");
addLevelChain(rules, [104, 105], [28]);
addLevelChain(rules, [109, 110], [35]);
addLevelChain(rules, [111, 112], [42]);
addLevelChain(rules, [116, 117], [32]);
addLevelChain(rules, [118, 119], [33]);
addLevelChain(rules, [120, 121], [0]);
addStoneRule(rules, 120, 121, "water-stone");
addLevelChain(rules, [129, 130], [20]);
addLevelChain(rules, [133, 134], [0]);
addStoneRule(rules, 133, 134, "water-stone");
addStoneRule(rules, 133, 135, "thunder-stone");
addStoneRule(rules, 133, 136, "fire-stone");
addLevelChain(rules, [138, 139], [40]);
addLevelChain(rules, [140, 141], [40]);
addLevelChain(rules, [147, 148, 149], [30, 55]);

// Gen 2
addLevelChain(rules, [152, 153, 154], [16, 32]);
addLevelChain(rules, [155, 156, 157], [14, 36]);
addLevelChain(rules, [158, 159, 160], [18, 30]);
addLevelChain(rules, [161, 162], [15]);
addLevelChain(rules, [163, 164], [20]);
addLevelChain(rules, [165, 166], [18]);
addLevelChain(rules, [167, 168], [22]);
addFriendshipRule(rules, 173, 35);
addFriendshipRule(rules, 174, 39);
addLevelChain(rules, [179, 180, 181], [15, 30]);
addLevelChain(rules, [187, 188, 189], [18, 27]);
addFriendshipRule(rules, 175, 176);
addLevelChain(rules, [177, 178], [25]);
addLevelChain(rules, [183, 184], [18]);
addFriendshipRule(rules, 133, 196, { requireDay: true });
addFriendshipRule(rules, 133, 197, { requireNight: true });
addLevelChain(rules, [218, 219], [38]);
addLevelChain(rules, [220, 221], [33]);
addFriendshipRule(rules, 298, 183);

// Gen 3
addLevelChain(rules, [252, 253, 254], [16, 36]);
addLevelChain(rules, [255, 256, 257], [16, 36]);
addLevelChain(rules, [258, 259, 260], [16, 36]);
addLevelChain(rules, [261, 262], [18]);
addLevelChain(rules, [263, 264], [20]);
addLevelChain(rules, [265, 266, 267], [7, 10]);
addLevelChain(rules, [265, 268, 269], [7, 10]);
addLevelChain(rules, [270, 271, 272], [14, 0]);
addStoneRule(rules, 271, 272, "water-stone");
addLevelChain(rules, [273, 274, 275], [14, 0]);
addStoneRule(rules, 274, 275, "leaf-stone");
addLevelChain(rules, [276, 277], [22]);
addLevelChain(rules, [278, 279], [25]);
addLevelChain(rules, [280, 281, 282], [20, 30]);
addLevelChain(rules, [283, 284], [22]);
addLevelChain(rules, [285, 286], [23]);
addLevelChain(rules, [287, 288, 289], [18, 36]);
addLevelChain(rules, [293, 294, 295], [20, 40]);
addLevelChain(rules, [296, 297], [24]);
addLevelChain(rules, [300, 301], [0]);
addStoneRule(rules, 300, 301, "moon-stone");
addLevelChain(rules, [304, 305, 306], [32, 42]);
addLevelChain(rules, [307, 308], [37]);
addLevelChain(rules, [309, 310], [26]);
addLevelChain(rules, [315, 407], [0]);
addStoneRule(rules, 315, 407, "shiny-stone");
addLevelChain(rules, [320, 321], [40]);
addLevelChain(rules, [328, 329, 330], [35, 45]);
addLevelChain(rules, [331, 332], [32]);
addLevelChain(rules, [333, 334], [35]);
addLevelChain(rules, [339, 340], [30]);
addLevelChain(rules, [341, 342], [30]);
addLevelChain(rules, [349, 350], [0]);
addLevelChain(rules, [353, 354], [37]);
addLevelChain(rules, [355, 356], [37]);
addLevelChain(rules, [363, 364, 365], [32, 44]);
addLevelChain(rules, [366, 367], [0]);
addLevelChain(rules, [366, 368], [0]);
addStoneRule(rules, 366, 367, "deep-sea-tooth");
addStoneRule(rules, 366, 368, "deep-sea-scale");
addLevelChain(rules, [371, 372, 373], [30, 50]);
addLevelChain(rules, [374, 375, 376], [20, 45]);

// Gen 4
addLevelChain(rules, [387, 388, 389], [18, 32]);
addLevelChain(rules, [390, 391, 392], [14, 36]);
addLevelChain(rules, [393, 394, 395], [16, 36]);
addLevelChain(rules, [396, 397, 398], [14, 34]);
addLevelChain(rules, [399, 400], [15]);
addLevelChain(rules, [401, 402], [10]);
addFriendshipRule(rules, 406, 315);
addLevelChain(rules, [418, 419], [26]);
addLevelChain(rules, [420, 421], [25]);
addLevelChain(rules, [422, 423], [30]);
addLevelChain(rules, [427, 428], [0]);
addStoneRule(rules, 427, 428, "shiny-stone");
addLevelChain(rules, [431, 432], [38]);
addLevelChain(rules, [433, 358], [0]);
addFriendshipRule(rules, 433, 358, { requireNight: true });
addLevelChain(rules, [443, 444, 445], [24, 48]);
addLevelChain(rules, [446, 143], [0]);
addFriendshipRule(rules, 446, 143);
addFriendshipRule(rules, 447, 448, { requireDay: true });
addLevelChain(rules, [449, 450], [34]);
addLevelChain(rules, [451, 452], [40]);
addLevelChain(rules, [453, 454], [37]);
addLevelChain(rules, [456, 457], [31]);
addLevelChain(rules, [458, 226], [0]);
addLevelChain(rules, [459, 460], [40]);

// Gen 5+
addLevelChain(rules, [495, 496, 497], [17, 36]);
addLevelChain(rules, [498, 499, 500], [17, 36]);
addLevelChain(rules, [501, 502, 503], [17, 36]);
addLevelChain(rules, [519, 520, 521], [21, 32]);
addLevelChain(rules, [524, 525, 526], [25, 35]);
addLevelChain(rules, [532, 533, 534], [25, 36]);
addLevelChain(rules, [540, 541, 542], [20, 0]);
addFriendshipRule(rules, 541, 542);
addLevelChain(rules, [543, 544, 545], [22, 30]);
addLevelChain(rules, [548, 549], [0]);
addStoneRule(rules, 548, 549, "sun-stone");
addLevelChain(rules, [551, 552, 553], [29, 40]);
addLevelChain(rules, [559, 560], [39]);
addLevelChain(rules, [574, 575, 576], [32, 41]);
addLevelChain(rules, [590, 591], [39]);
addLevelChain(rules, [607, 608, 609], [41, 0]);
addStoneRule(rules, 608, 609, "dusk-stone");
addLevelChain(rules, [610, 611, 612], [38, 48]);
addLevelChain(rules, [633, 634, 635], [50, 64]);
addLevelChain(rules, [650, 651, 652], [16, 36]);
addLevelChain(rules, [653, 654, 655], [16, 36]);
addLevelChain(rules, [656, 657, 658], [16, 36]);
addLevelChain(rules, [661, 662, 663], [17, 35]);
addLevelChain(rules, [736, 737, 738], [20, 30]);
addLevelChain(rules, [761, 762, 763], [18, 0]);
addFriendshipRule(rules, 762, 763);
addLevelChain(rules, [782, 783, 784], [35, 45]);
addLevelChain(rules, [810, 811, 812], [16, 35]);
addLevelChain(rules, [813, 814, 815], [16, 35]);
addLevelChain(rules, [816, 817, 818], [16, 35]);
addLevelChain(rules, [906, 907, 908], [16, 36]);
addLevelChain(rules, [909, 910, 911], [16, 36]);
addLevelChain(rules, [912, 913, 914], [16, 36]);

export const EVOLUTION_RULES_BY_SPECIES: Record<number, EvolutionRule[]> = rules;
