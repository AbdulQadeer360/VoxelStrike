export const WORLD_WIDTH = 1500;
export const WORLD_DEPTH = 600;
export const WORLD_MIN_X = -750;
export const WORLD_MAX_X = 749;
export const WORLD_MIN_Z = -300;
export const WORLD_MAX_Z = 299;
export const WORLD_HEIGHT = 64;
export const CHUNK_SIZE = 16;
export const WORLD_SEED = 202607;
export const MAX_PLAYERS = 20;

export const PLAYER_WIDTH = 0.6;
export const PLAYER_HEIGHT = 1.75;
export const CROUCH_HEIGHT = 1.32;
export const EYE_HEIGHT = 1.54;
export const CROUCH_EYE_HEIGHT = 1.04;
export const WALK_SPEED = 5.4;
export const CROUCH_SPEED = 3.1;
export const SPRINT_SPEED = 8.4;
export const JUMP_VELOCITY = 9.0;
export const GRAVITY = 24.0;
export const MAX_REACH = 6.2;
export const CHAT_MIN_LEVEL = 1;
export const CLAN_MIN_LEVEL = 5;

export interface GunDef {
  id: 'rifle' | 'smg' | 'shotgun' | 'sniper';
  name: string;
  shortName: string;
  price: number;
  unlockLevel: number;
  magSize: number;
  fireIntervalMs: number;
  reloadMs: number;
  damage: number;
  pellets: number;
  spread: number;
  range: number;
  recoil: number;
  description: string;
  category: string;
}

export const GUNS: Record<string, GunDef> = {
  rifle: {
    id: 'rifle',
    name: 'VX-47 Auto Rifle',
    shortName: 'VX-47',
    price: 0,
    unlockLevel: 1,
    magSize: 30,
    fireIntervalMs: 105,
    reloadMs: 1450,
    damage: 18,
    pellets: 1,
    spread: 0.008,
    range: 110,
    recoil: 0.011,
    category: 'Assault Rifle',
    description: 'Balanced full-auto tactical rifle built for mid-range firefights.',
  },
  smg: {
    id: 'smg',
    name: 'Striker-9 SMG',
    shortName: 'Striker-9',
    price: 0,
    unlockLevel: 1,
    magSize: 36,
    fireIntervalMs: 68,
    reloadMs: 1200,
    damage: 13,
    pellets: 1,
    spread: 0.014,
    range: 75,
    recoil: 0.008,
    category: 'Submachine Gun',
    description: 'Blistering close-quarters fire rate with a 36-round extended mag.',
  },
  shotgun: {
    id: 'shotgun',
    name: 'Breacher-12 Shotgun',
    shortName: 'Breacher-12',
    price: 0,
    unlockLevel: 1,
    magSize: 8,
    fireIntervalMs: 650,
    reloadMs: 1650,
    damage: 12,
    pellets: 6,
    spread: 0.055,
    range: 42,
    recoil: 0.028,
    category: 'Combat Shotgun',
    description: 'Fires 6 heavy pellets per shell for devastating close-range bursts.',
  },
  sniper: {
    id: 'sniper',
    name: 'Valkyrie .50 Sniper',
    shortName: 'Valkyrie .50',
    price: 0,
    unlockLevel: 1,
    magSize: 5,
    fireIntervalMs: 920,
    reloadMs: 1850,
    damage: 68,
    pellets: 1,
    spread: 0.0008,
    range: 175,
    recoil: 0.022,
    category: 'Marksman Rifle (3.4× Scope)',
    description: 'High-caliber precision sniper rifle with right-click 3.4× optical scope.',
  },
};

export const GUN_LIST: GunDef[] = [GUNS.rifle, GUNS.smg, GUNS.shotgun, GUNS.sniper];

export type GameModeId = 'survival' | 'duel' | 'ctf' | 'clanwar';

export const DUEL_KILLS_TO_WIN = 1;
export const DUEL_DURATION_MS = 5 * 60 * 1000;
export const DUEL_WIN_XP = 120;
export const DUEL_WIN_COINS = 50;
export const DUEL_LOSS_XP = 35;
export const DUEL_LOSS_COINS = 15;

export const CTF_KILL_POINTS = 1;
export const CTF_CAPTURE_POINTS = 30;
export const CTF_WIN_SCORE = 100;
export const CTF_CAPTURE_XP = 60;
export const CTF_CAPTURE_COINS = 25;

export const CLAN_WAR_MIN_MEMBERS = 2;
export const CLAN_WAR_WIN_SCORE = 15;
export const CLAN_WAR_WIN_XP = 150;
export const CLAN_WAR_WIN_COINS = 60;

export const BlockId = {
  AIR: 0,
  BEDROCK: 1,
  STONE: 2,
  DIRT: 3,
  GRASS: 4,
  WOOD: 5,
  LEAVES: 6,
  SAND: 7,
  WATER: 8,
  COAL_ORE: 9,
  IRON_ORE: 10,
  GOLD_ORE: 11,
  CRYSTAL_ORE: 12,
  PLANKS: 13,
  BRICK: 14,
  LAVA: 15,
  SANDSTONE: 16,
  CACTUS: 17,
  STONE_WALL: 18,
  WOOD_WALL: 19,
  STONE_STAIRS: 20,
  WOOD_STAIRS: 21,
  RED_BLOCK: 22,
  BLUE_BLOCK: 23,
} as const;

export type BlockType = (typeof BlockId)[keyof typeof BlockId];

export interface BlockMeta {
  id: BlockType;
  name: string;
  hardness: number; // seconds to mine with basic pickaxe
  solid: boolean;
  transparent: boolean;
  dropItem: string;
  dropCount: number;
  xp: number;
  coins: number;
  colorHex: string;
}

export const BLOCK_META: Record<number, BlockMeta> = {
  [BlockId.AIR]: {
    id: BlockId.AIR,
    name: 'Air',
    hardness: 0,
    solid: false,
    transparent: true,
    dropItem: '',
    dropCount: 0,
    xp: 0,
    coins: 0,
    colorHex: '#000000',
  },
  [BlockId.BEDROCK]: {
    id: BlockId.BEDROCK,
    name: 'Bedrock',
    hardness: Infinity,
    solid: true,
    transparent: false,
    dropItem: '',
    dropCount: 0,
    xp: 0,
    coins: 0,
    colorHex: '#1e293b',
  },
  [BlockId.STONE]: {
    id: BlockId.STONE,
    name: 'Stone',
    hardness: 0.9,
    solid: true,
    transparent: false,
    dropItem: 'stone',
    dropCount: 1,
    xp: 2,
    coins: 1,
    colorHex: '#7f838a',
  },
  [BlockId.DIRT]: {
    id: BlockId.DIRT,
    name: 'Dirt',
    hardness: 0.4,
    solid: true,
    transparent: false,
    dropItem: 'dirt',
    dropCount: 1,
    xp: 1,
    coins: 0,
    colorHex: '#866043',
  },
  [BlockId.GRASS]: {
    id: BlockId.GRASS,
    name: 'Grass Block',
    hardness: 0.45,
    solid: true,
    transparent: false,
    dropItem: 'dirt',
    dropCount: 1,
    xp: 1,
    coins: 0,
    colorHex: '#5eb83e',
  },
  [BlockId.WOOD]: {
    id: BlockId.WOOD,
    name: 'Oak Log',
    hardness: 0.65,
    solid: true,
    transparent: false,
    dropItem: 'wood',
    dropCount: 1,
    xp: 3,
    coins: 1,
    colorHex: '#6b5130',
  },
  [BlockId.LEAVES]: {
    id: BlockId.LEAVES,
    name: 'Oak Leaves',
    hardness: 0.25,
    solid: true,
    transparent: false,
    dropItem: 'leaves',
    dropCount: 1,
    xp: 1,
    coins: 0,
    colorHex: '#3b8b2c',
  },
  [BlockId.SAND]: {
    id: BlockId.SAND,
    name: 'Desert Sand',
    hardness: 0.35,
    solid: true,
    transparent: false,
    dropItem: 'sand',
    dropCount: 1,
    xp: 1,
    coins: 0,
    colorHex: '#e6dc9f',
  },
  [BlockId.WATER]: {
    id: BlockId.WATER,
    name: 'River Water',
    hardness: Infinity,
    solid: false,
    transparent: true,
    dropItem: '',
    dropCount: 0,
    xp: 0,
    coins: 0,
    colorHex: '#3273e8',
  },
  [BlockId.COAL_ORE]: {
    id: BlockId.COAL_ORE,
    name: 'Coal Ore',
    hardness: 1.1,
    solid: true,
    transparent: false,
    dropItem: 'coal',
    dropCount: 2,
    xp: 5,
    coins: 3,
    colorHex: '#334155',
  },
  [BlockId.IRON_ORE]: {
    id: BlockId.IRON_ORE,
    name: 'Iron Ore',
    hardness: 1.35,
    solid: true,
    transparent: false,
    dropItem: 'iron',
    dropCount: 1,
    xp: 8,
    coins: 5,
    colorHex: '#cbd5e1',
  },
  [BlockId.GOLD_ORE]: {
    id: BlockId.GOLD_ORE,
    name: 'Gold Ore',
    hardness: 1.6,
    solid: true,
    transparent: false,
    dropItem: 'gold',
    dropCount: 1,
    xp: 14,
    coins: 10,
    colorHex: '#facc15',
  },
  [BlockId.CRYSTAL_ORE]: {
    id: BlockId.CRYSTAL_ORE,
    name: 'Diamond Crystal',
    hardness: 1.9,
    solid: true,
    transparent: false,
    dropItem: 'crystal',
    dropCount: 1,
    xp: 24,
    coins: 18,
    colorHex: '#22d3ee',
  },
  [BlockId.PLANKS]: {
    id: BlockId.PLANKS,
    name: 'Oak Planks',
    hardness: 0.55,
    solid: true,
    transparent: false,
    dropItem: 'planks',
    dropCount: 1,
    xp: 1,
    coins: 0,
    colorHex: '#b88b50',
  },
  [BlockId.BRICK]: {
    id: BlockId.BRICK,
    name: 'Stone Bricks',
    hardness: 1.4,
    solid: true,
    transparent: false,
    dropItem: 'brick',
    dropCount: 1,
    xp: 2,
    coins: 0,
    colorHex: '#8d95a0',
  },
  [BlockId.LAVA]: {
    id: BlockId.LAVA,
    name: 'Molten Lava',
    hardness: Infinity,
    solid: false,
    transparent: true,
    dropItem: '',
    dropCount: 0,
    xp: 0,
    coins: 0,
    colorHex: '#ff6b1a',
  },
  [BlockId.SANDSTONE]: {
    id: BlockId.SANDSTONE,
    name: 'Sandstone',
    hardness: 0.75,
    solid: true,
    transparent: false,
    dropItem: 'sandstone',
    dropCount: 1,
    xp: 2,
    coins: 1,
    colorHex: '#dfd096',
  },
  [BlockId.CACTUS]: {
    id: BlockId.CACTUS,
    name: 'Desert Cactus',
    hardness: 0.35,
    solid: true,
    transparent: false,
    dropItem: 'cactus',
    dropCount: 1,
    xp: 2,
    coins: 1,
    colorHex: '#2f8531',
  },
  [BlockId.STONE_WALL]: {
    id: BlockId.STONE_WALL,
    name: 'Stone Wall',
    hardness: 0.85,
    solid: true,
    transparent: true,
    dropItem: 'stone_wall',
    dropCount: 1,
    xp: 2,
    coins: 0,
    colorHex: '#8d95a0',
  },
  [BlockId.WOOD_WALL]: {
    id: BlockId.WOOD_WALL,
    name: 'Oak Wall',
    hardness: 0.55,
    solid: true,
    transparent: true,
    dropItem: 'wood_wall',
    dropCount: 1,
    xp: 1,
    coins: 0,
    colorHex: '#b88b50',
  },
  [BlockId.STONE_STAIRS]: {
    id: BlockId.STONE_STAIRS,
    name: 'Stone Stairs',
    hardness: 0.85,
    solid: true,
    transparent: true,
    dropItem: 'stone_stairs',
    dropCount: 1,
    xp: 2,
    coins: 0,
    colorHex: '#7f838a',
  },
  [BlockId.WOOD_STAIRS]: {
    id: BlockId.WOOD_STAIRS,
    name: 'Oak Stairs',
    hardness: 0.55,
    solid: true,
    transparent: true,
    dropItem: 'wood_stairs',
    dropCount: 1,
    xp: 1,
    coins: 0,
    colorHex: '#b88b50',
  },
  [BlockId.RED_BLOCK]: {
    id: BlockId.RED_BLOCK,
    name: 'Red Team Bastion',
    hardness: Infinity,
    solid: true,
    transparent: false,
    dropItem: '',
    dropCount: 0,
    xp: 0,
    coins: 0,
    colorHex: '#dc2626',
  },
  [BlockId.BLUE_BLOCK]: {
    id: BlockId.BLUE_BLOCK,
    name: 'Blue Team Bastion',
    hardness: Infinity,
    solid: true,
    transparent: false,
    dropItem: '',
    dropCount: 0,
    xp: 0,
    coins: 0,
    colorHex: '#2563eb',
  },
};

export interface ItemDef {
  id: string;
  name: string;
  kind: 'weapon' | 'tool' | 'consumable' | 'block' | 'resource';
  placeBlockId?: BlockType;
  color: string;
  maxStack: number;
  description: string;
}

export const ITEMS: Record<string, ItemDef> = {
  rifle: {
    id: 'rifle',
    name: 'VX-47 Auto Rifle',
    kind: 'weapon',
    color: '#38bdf8',
    maxStack: 1,
    description: 'Full-auto tactical voxel rifle. 30-round mag, high velocity.',
  },
  smg: {
    id: 'smg',
    name: 'Striker-9 SMG',
    kind: 'weapon',
    color: '#34d399',
    maxStack: 1,
    description: 'Ultra-fast CQB submachine gun with 36-round magazine.',
  },
  shotgun: {
    id: 'shotgun',
    name: 'Breacher-12 Shotgun',
    kind: 'weapon',
    color: '#fb923c',
    maxStack: 1,
    description: '6-pellet pump-action combat shotgun.',
  },
  sniper: {
    id: 'sniper',
    name: 'Valkyrie .50 Sniper',
    kind: 'weapon',
    color: '#c084fc',
    maxStack: 1,
    description: 'High-precision .50 caliber marksman rifle.',
  },
  pickaxe: {
    id: 'pickaxe',
    name: 'Iron Pickaxe',
    kind: 'tool',
    color: '#22d3ee',
    maxStack: 1,
    description: 'Mines stone, terrain, timber, and deep mineral ores rapidly.',
  },
  medkit: {
    id: 'medkit',
    name: 'Medkit',
    kind: 'consumable',
    color: '#ef4444',
    maxStack: 10,
    description: 'Restores +45 HP immediately.',
  },
  ammo: {
    id: 'ammo',
    name: 'Weapon Ammo',
    kind: 'resource',
    color: '#fbbf24',
    maxStack: 400,
    description: 'Universal ammunition for all VoxelStrike firearms.',
  },
  dirt: {
    id: 'dirt',
    name: 'Dirt Block',
    kind: 'block',
    placeBlockId: BlockId.DIRT,
    color: '#8b5a3c',
    maxStack: 256,
    description: 'Basic earth block for quick terrain bridging.',
  },
  stone: {
    id: 'stone',
    name: 'Stone Block',
    kind: 'block',
    placeBlockId: BlockId.STONE,
    color: '#7c8594',
    maxStack: 256,
    description: 'Sturdy stone block for cover and walls.',
  },
  wood: {
    id: 'wood',
    name: 'Timber Log',
    kind: 'block',
    placeBlockId: BlockId.WOOD,
    color: '#784826',
    maxStack: 256,
    description: 'Raw wood harvested from trees.',
  },
  leaves: {
    id: 'leaves',
    name: 'Foliage',
    kind: 'block',
    placeBlockId: BlockId.LEAVES,
    color: '#2f8c44',
    maxStack: 256,
    description: 'Foliage used for camouflage and crafting medkits.',
  },
  sand: {
    id: 'sand',
    name: 'Sand Block',
    kind: 'block',
    placeBlockId: BlockId.SAND,
    color: '#e6dc9f',
    maxStack: 256,
    description: 'Warm desert & riverbank sand.',
  },
  sandstone: {
    id: 'sandstone',
    name: 'Sandstone',
    kind: 'block',
    placeBlockId: BlockId.SANDSTONE,
    color: '#dfd096',
    maxStack: 256,
    description: 'Carved desert temple sandstone.',
  },
  cactus: {
    id: 'cactus',
    name: 'Cactus Block',
    kind: 'block',
    placeBlockId: BlockId.CACTUS,
    color: '#2f8531',
    maxStack: 256,
    description: 'Desert cactus harvested from sunlit dunes.',
  },
  planks: {
    id: 'planks',
    name: 'Oak Planks',
    kind: 'block',
    placeBlockId: BlockId.PLANKS,
    color: '#b88b50',
    maxStack: 256,
    description: 'Crafted building timber.',
  },
  brick: {
    id: 'brick',
    name: 'Stone Bricks',
    kind: 'block',
    placeBlockId: BlockId.BRICK,
    color: '#8d95a0',
    maxStack: 256,
    description: 'High-durability bunker masonry.',
  },
  stone_wall: {
    id: 'stone_wall',
    name: 'Stone Wall',
    kind: 'block',
    placeBlockId: BlockId.STONE_WALL,
    color: '#8d95a0',
    maxStack: 256,
    description: 'Defensive masonry wall that auto-connects into battlements.',
  },
  wood_wall: {
    id: 'wood_wall',
    name: 'Oak Wall',
    kind: 'block',
    placeBlockId: BlockId.WOOD_WALL,
    color: '#b88b50',
    maxStack: 256,
    description: 'Timber palisade wall that connects along bases and bridges.',
  },
  stone_stairs: {
    id: 'stone_stairs',
    name: 'Stone Stairs',
    kind: 'block',
    placeBlockId: BlockId.STONE_STAIRS,
    color: '#7f838a',
    maxStack: 256,
    description: 'Stepped stone stairs for climbing towers and bunkers.',
  },
  wood_stairs: {
    id: 'wood_stairs',
    name: 'Oak Stairs',
    kind: 'block',
    placeBlockId: BlockId.WOOD_STAIRS,
    color: '#b88b50',
    maxStack: 256,
    description: 'Stepped oak stairs for quick elevation.',
  },
  coal: {
    id: 'coal',
    name: 'Coal',
    kind: 'resource',
    color: '#334155',
    maxStack: 256,
    description: 'Used with iron to forge ammunition.',
  },
  iron: {
    id: 'iron',
    name: 'Iron Ingot',
    kind: 'resource',
    color: '#e2e8f0',
    maxStack: 256,
    description: 'Refined ore for ammo and upgrades.',
  },
  gold: {
    id: 'gold',
    name: 'Gold Nugget',
    kind: 'resource',
    color: '#f59e0b',
    maxStack: 256,
    description: 'Precious ore used for high-tier gear.',
  },
  crystal: {
    id: 'crystal',
    name: 'Aether Crystal',
    kind: 'resource',
    color: '#22d3ee',
    maxStack: 256,
    description: 'Rare glowing mineral for medkits and upgrades.',
  },
};

export interface CraftRecipe {
  id: string;
  outputItem: string;
  outputCount: number;
  ingredients: Array<{ item: string; count: number }>;
  label: string;
}

export const CRAFT_RECIPES: CraftRecipe[] = [
  {
    id: 'craft_planks',
    outputItem: 'planks',
    outputCount: 10,
    ingredients: [{ item: 'wood', count: 1 }],
    label: '1 Oak Log → 10 Oak Planks',
  },
  {
    id: 'craft_brick',
    outputItem: 'brick',
    outputCount: 10,
    ingredients: [{ item: 'stone', count: 1 }],
    label: '1 Stone → 10 Stone Bricks',
  },
  {
    id: 'craft_stone_wall',
    outputItem: 'stone_wall',
    outputCount: 10,
    ingredients: [{ item: 'stone', count: 1 }],
    label: '1 Stone → 10 Stone Walls',
  },
  {
    id: 'craft_stone_stairs',
    outputItem: 'stone_stairs',
    outputCount: 10,
    ingredients: [{ item: 'stone', count: 1 }],
    label: '1 Stone → 10 Stone Stairs',
  },
  {
    id: 'craft_wood_wall',
    outputItem: 'wood_wall',
    outputCount: 10,
    ingredients: [{ item: 'wood', count: 1 }],
    label: '1 Oak Log → 10 Oak Walls',
  },
  {
    id: 'craft_wood_stairs',
    outputItem: 'wood_stairs',
    outputCount: 10,
    ingredients: [{ item: 'wood', count: 1 }],
    label: '1 Oak Log → 10 Oak Stairs',
  },
  {
    id: 'craft_planks_wall',
    outputItem: 'wood_wall',
    outputCount: 10,
    ingredients: [{ item: 'planks', count: 1 }],
    label: '1 Oak Planks → 10 Oak Walls',
  },
  {
    id: 'craft_planks_stairs',
    outputItem: 'wood_stairs',
    outputCount: 10,
    ingredients: [{ item: 'planks', count: 1 }],
    label: '1 Oak Planks → 10 Oak Stairs',
  },
  {
    id: 'craft_sandstone',
    outputItem: 'sandstone',
    outputCount: 10,
    ingredients: [{ item: 'sand', count: 1 }],
    label: '1 Sand → 10 Sandstone',
  },
  {
    id: 'craft_dirt_stone',
    outputItem: 'stone',
    outputCount: 10,
    ingredients: [{ item: 'dirt', count: 1 }],
    label: '1 Dirt → 10 Stone Blocks',
  },
  {
    id: 'craft_brick_wall',
    outputItem: 'stone_wall',
    outputCount: 10,
    ingredients: [{ item: 'brick', count: 1 }],
    label: '1 Stone Brick → 10 Stone Walls',
  },
  {
    id: 'craft_brick_stairs',
    outputItem: 'stone_stairs',
    outputCount: 10,
    ingredients: [{ item: 'brick', count: 1 }],
    label: '1 Stone Brick → 10 Stone Stairs',
  },
  {
    id: 'craft_sandstone_brick',
    outputItem: 'brick',
    outputCount: 10,
    ingredients: [{ item: 'sandstone', count: 1 }],
    label: '1 Sandstone → 10 Stone Bricks',
  },
  {
    id: 'craft_sandstone_wall',
    outputItem: 'stone_wall',
    outputCount: 10,
    ingredients: [{ item: 'sandstone', count: 1 }],
    label: '1 Sandstone → 10 Stone Walls',
  },
  {
    id: 'craft_sandstone_stairs',
    outputItem: 'stone_stairs',
    outputCount: 10,
    ingredients: [{ item: 'sandstone', count: 1 }],
    label: '1 Sandstone → 10 Stone Stairs',
  },
  {
    id: 'craft_sand_wall',
    outputItem: 'stone_wall',
    outputCount: 10,
    ingredients: [{ item: 'sand', count: 1 }],
    label: '1 Sand → 10 Stone Walls',
  },
  {
    id: 'craft_sand_stairs',
    outputItem: 'stone_stairs',
    outputCount: 10,
    ingredients: [{ item: 'sand', count: 1 }],
    label: '1 Sand → 10 Stone Stairs',
  },
  {
    id: 'craft_dirt_wall',
    outputItem: 'stone_wall',
    outputCount: 10,
    ingredients: [{ item: 'dirt', count: 1 }],
    label: '1 Dirt → 10 Stone Walls',
  },
  {
    id: 'craft_dirt_stairs',
    outputItem: 'stone_stairs',
    outputCount: 10,
    ingredients: [{ item: 'dirt', count: 1 }],
    label: '1 Dirt → 10 Stone Stairs',
  },
  {
    id: 'craft_wood_wall_to_stairs',
    outputItem: 'wood_stairs',
    outputCount: 1,
    ingredients: [{ item: 'wood_wall', count: 1 }],
    label: '1 Oak Wall → 1 Oak Stairs',
  },
  {
    id: 'craft_wood_stairs_to_wall',
    outputItem: 'wood_wall',
    outputCount: 1,
    ingredients: [{ item: 'wood_stairs', count: 1 }],
    label: '1 Oak Stairs → 1 Oak Wall',
  },
  {
    id: 'craft_stone_wall_to_stairs',
    outputItem: 'stone_stairs',
    outputCount: 1,
    ingredients: [{ item: 'stone_wall', count: 1 }],
    label: '1 Stone Wall → 1 Stone Stairs',
  },
  {
    id: 'craft_stone_stairs_to_wall',
    outputItem: 'stone_wall',
    outputCount: 1,
    ingredients: [{ item: 'stone_stairs', count: 1 }],
    label: '1 Stone Stairs → 1 Stone Wall',
  },
  {
    id: 'craft_ammo',
    outputItem: 'ammo',
    outputCount: 30,
    ingredients: [
      { item: 'iron', count: 1 },
      { item: 'coal', count: 1 },
    ],
    label: 'Weapon Ammo ×30',
  },
  {
    id: 'craft_medkit',
    outputItem: 'medkit',
    outputCount: 1,
    ingredients: [
      { item: 'leaves', count: 3 },
      { item: 'crystal', count: 1 },
    ],
    label: 'Medkit ×1',
  },
];

export function getQuickConvertTargets(
  heldItemId: string
): { wallRecipeId?: string; stairsRecipeId?: string; wallCount?: number; stairsCount?: number; wallItem?: string; stairsItem?: string } | null {
  const map: Record<string, { wall?: string; stairs?: string }> = {
    wood: { wall: 'craft_wood_wall', stairs: 'craft_wood_stairs' },
    planks: { wall: 'craft_planks_wall', stairs: 'craft_planks_stairs' },
    stone: { wall: 'craft_stone_wall', stairs: 'craft_stone_stairs' },
    brick: { wall: 'craft_brick_wall', stairs: 'craft_brick_stairs' },
    sandstone: { wall: 'craft_sandstone_wall', stairs: 'craft_sandstone_stairs' },
    sand: { wall: 'craft_sand_wall', stairs: 'craft_sand_stairs' },
    dirt: { wall: 'craft_dirt_wall', stairs: 'craft_dirt_stairs' },
    wood_wall: { stairs: 'craft_wood_wall_to_stairs' },
    wood_stairs: { wall: 'craft_wood_stairs_to_wall' },
    stone_wall: { stairs: 'craft_stone_wall_to_stairs' },
    stone_stairs: { wall: 'craft_stone_stairs_to_wall' },
  };
  const entry = map[heldItemId];
  if (!entry) return null;
  const wRec = entry.wall ? CRAFT_RECIPES.find((r) => r.id === entry.wall) : undefined;
  const sRec = entry.stairs ? CRAFT_RECIPES.find((r) => r.id === entry.stairs) : undefined;
  return {
    wallRecipeId: wRec?.id,
    stairsRecipeId: sRec?.id,
    wallCount: wRec?.outputCount,
    stairsCount: sRec?.outputCount,
    wallItem: wRec?.outputItem,
    stairsItem: sRec?.outputItem,
  };
}

export type KeyActionId =
  | 'forward'
  | 'backward'
  | 'left'
  | 'right'
  | 'jump'
  | 'sprint'
  | 'crouch'
  | 'fireOrPlace'
  | 'reload'
  | 'scope'
  | 'medkit'
  | 'craft'
  | 'quickConvert'
  | 'map'
  | 'leaderboard'
  | 'chat';

export type KeybindingsConfig = Record<KeyActionId, string>;

export const DEFAULT_KEYBINDINGS: KeybindingsConfig = {
  forward: 'KeyW',
  backward: 'KeyS',
  left: 'KeyA',
  right: 'KeyD',
  jump: 'Space',
  sprint: 'ShiftLeft',
  crouch: 'KeyC',
  fireOrPlace: 'KeyF',
  reload: 'KeyR',
  scope: 'KeyQ',
  medkit: 'KeyH',
  craft: 'KeyX',
  quickConvert: 'KeyK',
  map: 'KeyM',
  leaderboard: 'KeyZ',
  chat: 'KeyT',
};

export const KEYBIND_LABELS: Array<{ id: KeyActionId; label: string }> = [
  { id: 'forward', label: 'Move Forward' },
  { id: 'backward', label: 'Move Backward' },
  { id: 'left', label: 'Move Left' },
  { id: 'right', label: 'Move Right' },
  { id: 'jump', label: 'Jump' },
  { id: 'sprint', label: 'Sprint Speed' },
  { id: 'crouch', label: 'Crouch' },
  { id: 'fireOrPlace', label: 'Fire Gun / Place Block' },
  { id: 'reload', label: 'Reload Weapon' },
  { id: 'scope', label: 'Sniper Scope' },
  { id: 'medkit', label: 'Use Medkit' },
  { id: 'craft', label: 'Inventory & Crafting' },
  { id: 'quickConvert', label: 'Convert Block (Wall / Stairs)' },
  { id: 'map', label: 'World Map' },
  { id: 'leaderboard', label: 'Leaderboard' },
  { id: 'chat', label: 'Chat' },
];

export function formatKeyCode(code: string): string {
  if (!code) return '?';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code === 'Space') return 'Space';
  if (code === 'ShiftLeft' || code === 'ShiftRight') return 'Shift';
  if (code === 'ControlLeft' || code === 'ControlRight') return 'Ctrl';
  if (code === 'AltLeft' || code === 'AltRight') return 'Alt';
  if (code.startsWith('Arrow')) return code.slice(5);
  return code;
}

export interface SpawnZone {
  id: 'frontier' | 'highlands' | 'citadel' | 'valley' | 'desert';
  name: string;
  subtitle: string;
  x: number;
  z: number;
  accentFrom: string;
  accentTo: string;
  borderBottom: string;
  bonusDesc: string;
}

export const SPAWN_ZONES: SpawnZone[] = [
  {
    id: 'frontier',
    name: 'Survival Frontier',
    subtitle: '1500×600 Shared World · Rivers, Forests & Ores',
    x: 42,
    z: 28,
    accentFrom: '#5eb83e',
    accentTo: '#378b24',
    borderBottom: '#266118',
    bonusDesc: 'Lush grasslands near river bridge',
  },
  {
    id: 'highlands',
    name: 'Lava Highlands',
    subtitle: 'Volcanic Pools, Iron & Crystal',
    x: -225,
    z: -115,
    accentFrom: '#f97316',
    accentTo: '#dc2626',
    borderBottom: '#991b1b',
    bonusDesc: 'Molten lava craters & rich ore ridges',
  },
  {
    id: 'citadel',
    name: 'Central Citadel',
    subtitle: 'Stone Brick Ruins · PvP Action',
    x: 0,
    z: 0,
    accentFrom: '#ef4444',
    accentTo: '#b91c1c',
    borderBottom: '#7f1d1d',
    bonusDesc: 'Fortress walls & tactical cover',
  },
  {
    id: 'valley',
    name: 'Timber Valley',
    subtitle: 'Oak Forests · Fast Base Building',
    x: 175,
    z: -95,
    accentFrom: '#38bdf8',
    accentTo: '#2563eb',
    borderBottom: '#1d4ed8',
    bonusDesc: 'Dense oak groves & river crossing',
  },
  {
    id: 'desert',
    name: 'Sunlit Desert',
    subtitle: 'Sand Dunes, Cactus & Oasis River',
    x: 385,
    z: 35,
    accentFrom: '#facc15',
    accentTo: '#d97706',
    borderBottom: '#92400e',
    bonusDesc: 'Sandstone ruins, cacti & lava fissures',
  },
];

export interface SkinDef {
  id: string;
  name: string;
  price: number;
  bodyColor: string;
  accentColor: string;
  visorColor: string;
  rifleTint: string;
  skinTone: string;
  hairColor: string;
  pantsColor: string;
  style: 'visor' | 'helmet' | 'hood' | 'knight' | 'ninja' | 'parka';
}

export const SKINS: SkinDef[] = [
  {
    id: 'ranger',
    name: 'Emerald Ranger',
    price: 0,
    bodyColor: '#22c55e',
    accentColor: '#1e293b',
    visorColor: '#38bdf8',
    rifleTint: '#475569',
    skinTone: '#f1c27d',
    hairColor: '#451a03',
    pantsColor: '#1e293b',
    style: 'visor',
  },
  {
    id: 'striker',
    name: 'Crimson Striker',
    price: 50,
    bodyColor: '#ef4444',
    accentColor: '#18181b',
    visorColor: '#fbbf24',
    rifleTint: '#991b1b',
    skinTone: '#e0ac69',
    hairColor: '#18181b',
    pantsColor: '#27272a',
    style: 'helmet',
  },
  {
    id: 'cobalt',
    name: 'Cobalt Engineer',
    price: 90,
    bodyColor: '#3b82f6',
    accentColor: '#0f172a',
    visorColor: '#22d3ee',
    rifleTint: '#1d4ed8',
    skinTone: '#f1c27d',
    hairColor: '#78350f',
    pantsColor: '#172554',
    style: 'hood',
  },
  {
    id: 'gold',
    name: 'Solar Vanguard',
    price: 160,
    bodyColor: '#f59e0b',
    accentColor: '#292524',
    visorColor: '#fef08a',
    rifleTint: '#b45309',
    skinTone: '#d2996c',
    hairColor: '#292524',
    pantsColor: '#44403c',
    style: 'knight',
  },
  {
    id: 'obsidian',
    name: 'Aether Phantom',
    price: 250,
    bodyColor: '#334155',
    accentColor: '#09090b',
    visorColor: '#06b6d4',
    rifleTint: '#0e7490',
    skinTone: '#c68642',
    hairColor: '#09090b',
    pantsColor: '#09090b',
    style: 'ninja',
  },
  {
    id: 'frost',
    name: 'Arctic Warden',
    price: 320,
    bodyColor: '#e2e8f0',
    accentColor: '#0284c7',
    visorColor: '#67e8f9',
    rifleTint: '#0369a1',
    skinTone: '#f5cba7',
    hairColor: '#475569',
    pantsColor: '#1e3a5f',
    style: 'parka',
  },
];

export interface GunSkinDef {
  id: string;
  name: string;
  price: number;
  primaryHex: string;
  secondaryHex: string;
  accentHex: string;
  emissiveHex: string;
  pattern: 'carbon' | 'scales' | 'blaze' | 'gold' | 'circuit' | 'frost';
}

export const GUN_SKINS: GunSkinDef[] = [
  {
    id: 'carbon',
    name: 'Tactical Carbon',
    price: 0,
    primaryHex: '#334155',
    secondaryHex: '#1e293b',
    accentHex: '#38bdf8',
    emissiveHex: '#0284c7',
    pattern: 'carbon',
  },
  {
    id: 'emerald_dragon',
    name: 'Emerald Dragon',
    price: 0,
    primaryHex: '#10b981',
    secondaryHex: '#064e3b',
    accentHex: '#fbbf24',
    emissiveHex: '#34d399',
    pattern: 'scales',
  },
  {
    id: 'crimson_blaze',
    name: 'Crimson Blaze',
    price: 0,
    primaryHex: '#dc2626',
    secondaryHex: '#18181b',
    accentHex: '#f97316',
    emissiveHex: '#fb923c',
    pattern: 'blaze',
  },
  {
    id: 'gold_sovereign',
    name: 'Gold Sovereign',
    price: 0,
    primaryHex: '#f59e0b',
    secondaryHex: '#451a03',
    accentHex: '#fef08a',
    emissiveHex: '#facc15',
    pattern: 'gold',
  },
  {
    id: 'cyber_neon',
    name: 'Cyber Neon',
    price: 0,
    primaryHex: '#0f172a',
    secondaryHex: '#312e81',
    accentHex: '#22d3ee',
    emissiveHex: '#06b6d4',
    pattern: 'circuit',
  },
  {
    id: 'arctic_frost',
    name: 'Arctic Frost',
    price: 0,
    primaryHex: '#f1f5f9',
    secondaryHex: '#0284c7',
    accentHex: '#67e8f9',
    emissiveHex: '#38bdf8',
    pattern: 'frost',
  },
  {
    id: 'neon_viper',
    name: 'Neon Viper',
    price: 0,
    primaryHex: '#84cc16',
    secondaryHex: '#14532d',
    accentHex: '#bef264',
    emissiveHex: '#4ade80',
    pattern: 'scales',
  },
  {
    id: 'solar_flare',
    name: 'Solar Flare',
    price: 0,
    primaryHex: '#f97316',
    secondaryHex: '#7c2d12',
    accentHex: '#fde047',
    emissiveHex: '#fb923c',
    pattern: 'blaze',
  },
];

export interface ShopItem {
  id: string;
  name: string;
  description: string;
  price: number;
  category: 'upgrade' | 'supply';
}

export const SHOP_ITEMS: ShopItem[] = [
  {
    id: 'supply_ammo',
    name: 'Ammo Crate (+90)',
    description: 'Adds 90 universal rounds for all your firearms.',
    price: 25,
    category: 'supply',
  },
  {
    id: 'supply_medkit',
    name: 'Field Medkits (×3)',
    description: 'Adds 3 tactical medkits (+45 HP each).',
    price: 30,
    category: 'supply',
  },
  {
    id: 'supply_brick',
    name: 'Stone Bricks (×40)',
    description: 'Adds 40 high-durability Stone Bricks for cover & towers.',
    price: 30,
    category: 'supply',
  },
  {
    id: 'supply_planks',
    name: 'Oak Planks (×40)',
    description: 'Adds 40 Oak Planks for quick bridges and bases.',
    price: 20,
    category: 'supply',
  },
  {
    id: 'upgrade_pickaxe',
    name: 'Titanium Pickaxe (+35% Speed)',
    description: 'Permanently boosts pickaxe mining speed.',
    price: 100,
    category: 'upgrade',
  },
  {
    id: 'upgrade_rifle',
    name: 'Weapon Core (+4 Damage)',
    description: 'Permanently increases firearm bullet damage.',
    price: 150,
    category: 'upgrade',
  },
];

export const RIFLE_MAG_SIZE = 30;
export const RIFLE_FIRE_INTERVAL_MS = 105;
export const RIFLE_RELOAD_MS = 1450;
export const RIFLE_BASE_DAMAGE = 18;
export const RIFLE_RANGE = 110;
