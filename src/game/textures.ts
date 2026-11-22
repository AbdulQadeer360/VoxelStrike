import * as THREE from 'three';
import { BlockId, type GunSkinDef, type SkinDef } from '../shared/constants.ts';

export const ATLAS_COLS = 16;
export const ATLAS_ROWS = 2;
export const TILE_PX = 16;

// Tile indices (row * 16 + col)
export const Tile = {
  BEDROCK: 0,
  STONE: 1,
  DIRT: 2,
  GRASS_TOP: 3,
  GRASS_SIDE: 4,
  WOOD_SIDE: 5,
  WOOD_TOP: 6,
  LEAVES: 7,
  SAND: 8,
  WATER: 9,
  COAL_ORE: 10,
  IRON_ORE: 11,
  GOLD_ORE: 12,
  CRYSTAL_ORE: 13,
  PLANKS: 14,
  BRICK: 15,
  LAVA: 16,
  SANDSTONE: 17,
  CACTUS_SIDE: 18,
  CACTUS_TOP: 19,
  RED_BLOCK: 20,
  BLUE_BLOCK: 21,
} as const;

export function getBlockFaceTile(blockId: number, face: 'top' | 'bottom' | 'side'): number {
  switch (blockId) {
    case BlockId.BEDROCK:
      return Tile.BEDROCK;
    case BlockId.STONE:
      return Tile.STONE;
    case BlockId.DIRT:
      return Tile.DIRT;
    case BlockId.GRASS:
      if (face === 'top') return Tile.GRASS_TOP;
      if (face === 'bottom') return Tile.DIRT;
      return Tile.GRASS_SIDE;
    case BlockId.WOOD:
      return face === 'side' ? Tile.WOOD_SIDE : Tile.WOOD_TOP;
    case BlockId.LEAVES:
      return Tile.LEAVES;
    case BlockId.SAND:
      return Tile.SAND;
    case BlockId.WATER:
      return Tile.WATER;
    case BlockId.COAL_ORE:
      return Tile.COAL_ORE;
    case BlockId.IRON_ORE:
      return Tile.IRON_ORE;
    case BlockId.GOLD_ORE:
      return Tile.GOLD_ORE;
    case BlockId.CRYSTAL_ORE:
      return Tile.CRYSTAL_ORE;
    case BlockId.PLANKS:
      return Tile.PLANKS;
    case BlockId.BRICK:
      return Tile.BRICK;
    case BlockId.LAVA:
      return Tile.LAVA;
    case BlockId.SANDSTONE:
      return Tile.SANDSTONE;
    case BlockId.CACTUS:
      return face === 'side' ? Tile.CACTUS_SIDE : Tile.CACTUS_TOP;
    case BlockId.STONE_WALL:
      return Tile.BRICK;
    case BlockId.WOOD_WALL:
      return Tile.PLANKS;
    case BlockId.STONE_STAIRS:
      return Tile.STONE;
    case BlockId.WOOD_STAIRS:
      return Tile.PLANKS;
    case BlockId.RED_BLOCK:
      return Tile.RED_BLOCK;
    case BlockId.BLUE_BLOCK:
      return Tile.BLUE_BLOCK;
    default:
      return Tile.STONE;
  }
}

function seededRand(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s * 1664525 + 1013904223) | 0;
    return ((s >>> 0) % 10000) / 10000;
  };
}

function fillPixelNoise(
  ctx: CanvasRenderingContext2D,
  ox: number,
  oy: number,
  baseRgb: [number, number, number],
  variance: number,
  seed: number
): void {
  const rand = seededRand(seed);
  for (let y = 0; y < TILE_PX; y++) {
    for (let x = 0; x < TILE_PX; x++) {
      const delta = Math.floor((rand() - 0.5) * variance);
      const r = Math.max(0, Math.min(255, baseRgb[0] + delta));
      const g = Math.max(0, Math.min(255, baseRgb[1] + delta));
      const b = Math.max(0, Math.min(255, baseRgb[2] + delta));
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(ox + x, oy + y, 1, 1);
    }
  }
}

function drawMinecraftStoneBase(ctx: CanvasRenderingContext2D, ox: number, oy: number, seed: number): void {
  fillPixelNoise(ctx, ox, oy, [130, 136, 144], 24, seed);
  const rand = seededRand(seed + 17);
  // Subtle horizontal rock strata like classic Minecraft stone
  for (let i = 0; i < 12; i++) {
    const px = Math.floor(rand() * 13);
    const py = Math.floor(rand() * 15);
    const w = 2 + Math.floor(rand() * 3);
    ctx.fillStyle = rand() > 0.45 ? 'rgba(90, 96, 106, 0.48)' : 'rgba(168, 174, 184, 0.42)';
    ctx.fillRect(ox + px, oy + py, w, 1);
  }
}

function drawOreCluster(
  ctx: CanvasRenderingContext2D,
  ox: number,
  oy: number,
  darkColor: string,
  midColor: string,
  highlightColor: string,
  seed: number
): void {
  const rand = seededRand(seed);
  const clusters = [
    [3, 3],
    [10, 4],
    [5, 10],
    [11, 11],
    [2, 8],
    [8, 7],
  ];
  for (const [cx, cy] of clusters) {
    const jx = Math.max(1, Math.min(12, cx + Math.floor((rand() - 0.5) * 2)));
    const jy = Math.max(1, Math.min(12, cy + Math.floor((rand() - 0.5) * 2)));
    ctx.fillStyle = darkColor;
    ctx.fillRect(ox + jx, oy + jy, 3, 2);
    ctx.fillStyle = midColor;
    ctx.fillRect(ox + jx, oy + jy, 2, 2);
    ctx.fillStyle = highlightColor;
    ctx.fillRect(ox + jx, oy + jy, 1, 1);
  }
}

export function createVoxelAtlasTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = ATLAS_COLS * TILE_PX;
  canvas.height = ATLAS_ROWS * TILE_PX;
  const ctx = canvas.getContext('2d')!;

  const tilePos = (idx: number) => ({
    ox: (idx % ATLAS_COLS) * TILE_PX,
    oy: Math.floor(idx / ATLAS_COLS) * TILE_PX,
  });

  // 0: Bedrock (high-contrast dark volcanic crag)
  {
    const { ox, oy } = tilePos(Tile.BEDROCK);
    fillPixelNoise(ctx, ox, oy, [42, 46, 56], 34, 101);
    const rand = seededRand(102);
    for (let i = 0; i < 16; i++) {
      ctx.fillStyle = rand() > 0.5 ? '#181c24' : '#64748b';
      ctx.fillRect(ox + Math.floor(rand() * 14), oy + Math.floor(rand() * 15), 2, 1);
    }
  }

  // 1: Stone (classic stratified limestone gray)
  {
    const { ox, oy } = tilePos(Tile.STONE);
    drawMinecraftStoneBase(ctx, ox, oy, 202);
  }

  // 2: Dirt (classic warm Minecraft soil)
  {
    const { ox, oy } = tilePos(Tile.DIRT);
    fillPixelNoise(ctx, ox, oy, [134, 96, 67], 22, 303);
    const rand = seededRand(304);
    for (let i = 0; i < 14; i++) {
      ctx.fillStyle = rand() > 0.35 ? '#5c3c24' : '#a08c7a';
      ctx.fillRect(ox + Math.floor(rand() * 15), oy + Math.floor(rand() * 15), 1, 1);
    }
  }

  // 3: Grass Top (iconic bright Minecraft plains meadow green)
  {
    const { ox, oy } = tilePos(Tile.GRASS_TOP);
    fillPixelNoise(ctx, ox, oy, [120, 189, 64], 24, 404);
    const rand = seededRand(405);
    for (let i = 0; i < 24; i++) {
      ctx.fillStyle = rand() > 0.45 ? '#8fd44e' : '#5ca32f';
      ctx.fillRect(ox + Math.floor(rand() * 15), oy + Math.floor(rand() * 15), 1, 2);
    }
  }

  // 4: Grass Side (Minecraft dirt + jagged lush grass overhang)
  {
    const { ox, oy } = tilePos(Tile.GRASS_SIDE);
    fillPixelNoise(ctx, ox, oy, [134, 96, 67], 20, 505);
    const rand = seededRand(506);
    for (let i = 0; i < 10; i++) {
      ctx.fillStyle = '#593a22';
      ctx.fillRect(ox + Math.floor(rand() * 15), oy + 5 + Math.floor(rand() * 10), 1, 1);
    }
    const drops = [3, 4, 5, 3, 4, 5, 4, 3, 4, 5, 3, 4, 5, 4, 3, 4];
    for (let x = 0; x < TILE_PX; x++) {
      const drop = drops[x];
      for (let y = 0; y < drop; y++) {
        const isEdge = y === drop - 1;
        const g = isEdge ? 156 : 186 + Math.floor(rand() * 20);
        const r = isEdge ? 92 : 114 + Math.floor(rand() * 16);
        ctx.fillStyle = `rgb(${r},${g},60)`;
        ctx.fillRect(ox + x, oy + y, 1, 1);
      }
      ctx.fillStyle = 'rgba(40, 22, 10, 0.38)';
      ctx.fillRect(ox + x, oy + drop, 1, 1);
    }
  }

  // 5: Wood Side (classic grooved Minecraft oak bark)
  {
    const { ox, oy } = tilePos(Tile.WOOD_SIDE);
    fillPixelNoise(ctx, ox, oy, [104, 78, 46], 16, 606);
    for (let x = 0; x < TILE_PX; x += 2) {
      ctx.fillStyle = x % 4 === 0 ? 'rgba(50, 32, 14, 0.62)' : 'rgba(148, 114, 70, 0.34)';
      ctx.fillRect(ox + x, oy, 1, TILE_PX);
    }
    ctx.fillStyle = 'rgba(38, 22, 8, 0.5)';
    ctx.fillRect(ox + 4, oy + 2, 1, 6);
    ctx.fillRect(ox + 10, oy + 7, 1, 7);
  }

  // 6: Wood Top (warm sapwood with crisp concentric growth rings + bark rim)
  {
    const { ox, oy } = tilePos(Tile.WOOD_TOP);
    fillPixelNoise(ctx, ox, oy, [196, 152, 96], 16, 707);
    ctx.strokeStyle = '#5c381a';
    ctx.lineWidth = 1;
    ctx.strokeRect(ox + 0.5, oy + 0.5, TILE_PX - 1, TILE_PX - 1);
    ctx.strokeStyle = '#8c5d30';
    ctx.strokeRect(ox + 2.5, oy + 2.5, TILE_PX - 5, TILE_PX - 5);
    ctx.strokeStyle = 'rgba(130, 82, 38, 0.55)';
    ctx.strokeRect(ox + 5.5, oy + 5.5, TILE_PX - 11, TILE_PX - 11);
  }

  // 7: Leaves (crisp mottled Minecraft oak canopy foliage)
  {
    const { ox, oy } = tilePos(Tile.LEAVES);
    fillPixelNoise(ctx, ox, oy, [62, 148, 42], 28, 808);
    const rand = seededRand(809);
    for (let y = 0; y < TILE_PX; y += 2) {
      for (let x = 0; x < TILE_PX; x += 2) {
        const pick = rand();
        if (pick < 0.28) {
          ctx.fillStyle = '#245d18';
          ctx.fillRect(ox + x, oy + y, 2, 1);
        } else if (pick > 0.74) {
          ctx.fillStyle = '#7ad456';
          ctx.fillRect(ox + x, oy + y, 1, 2);
        }
      }
    }
  }

  // 8: Sand (warm sunlit golden Minecraft desert sand)
  {
    const { ox, oy } = tilePos(Tile.SAND);
    fillPixelNoise(ctx, ox, oy, [230, 218, 159], 18, 909);
    const rand = seededRand(910);
    for (let i = 0; i < 14; i++) {
      ctx.fillStyle = rand() > 0.5 ? '#cfc07d' : '#f5edc4';
      ctx.fillRect(ox + Math.floor(rand() * 14), oy + Math.floor(rand() * 15), 2, 1);
    }
  }

  // 9: Water (classic vibrant Minecraft river blue with crisp shimmer streaks)
  {
    const { ox, oy } = tilePos(Tile.WATER);
    fillPixelNoise(ctx, ox, oy, [54, 126, 245], 14, 1010);
    ctx.fillStyle = 'rgba(205, 228, 255, 0.58)';
    ctx.fillRect(ox + 2, oy + 3, 5, 1);
    ctx.fillRect(ox + 9, oy + 8, 5, 1);
    ctx.fillRect(ox + 3, oy + 13, 6, 1);
  }

  // 10-13: Ores (Coal, Iron, Gold, Crystal)
  {
    const { ox, oy } = tilePos(Tile.COAL_ORE);
    drawMinecraftStoneBase(ctx, ox, oy, 1101);
    drawOreCluster(ctx, ox, oy, '#0f172a', '#1e293b', '#475569', 1102);
  }
  {
    const { ox, oy } = tilePos(Tile.IRON_ORE);
    drawMinecraftStoneBase(ctx, ox, oy, 1201);
    drawOreCluster(ctx, ox, oy, '#9a7b64', '#dfb89c', '#ffffff', 1202);
  }
  {
    const { ox, oy } = tilePos(Tile.GOLD_ORE);
    drawMinecraftStoneBase(ctx, ox, oy, 1301);
    drawOreCluster(ctx, ox, oy, '#b45309', '#facc15', '#fef9c3', 1302);
  }
  {
    const { ox, oy } = tilePos(Tile.CRYSTAL_ORE);
    drawMinecraftStoneBase(ctx, ox, oy, 1401);
    drawOreCluster(ctx, ox, oy, '#0e7490', '#22d3ee', '#ecfeff', 1402);
  }

  // 14: Wood Planks (classic 4-board oak planks with bevel & vertical joints)
  {
    const { ox, oy } = tilePos(Tile.PLANKS);
    fillPixelNoise(ctx, ox, oy, [192, 142, 82], 16, 1501);
    for (let row = 0; row < 4; row++) {
      const py = oy + row * 4;
      ctx.fillStyle = 'rgba(232, 186, 122, 0.42)';
      ctx.fillRect(ox, py + 1, TILE_PX, 1);
      ctx.fillStyle = 'rgba(94, 58, 22, 0.65)';
      ctx.fillRect(ox, py + 3, TILE_PX, 1);
      // Staggered vertical plank seams
      const seamX = row % 2 === 0 ? 7 : 13;
      ctx.fillRect(ox + seamX, py, 1, 4);
    }
  }

  // 15: Fortress Brick (crisp stone bricks with highlight bevel & dark mortar)
  {
    const { ox, oy } = tilePos(Tile.BRICK);
    fillPixelNoise(ctx, ox, oy, [138, 148, 164], 18, 1601);
    ctx.fillStyle = 'rgba(203, 213, 225, 0.45)';
    ctx.fillRect(ox, oy + 1, TILE_PX, 1);
    ctx.fillRect(ox, oy + 9, TILE_PX, 1);
    ctx.fillStyle = 'rgba(51, 65, 85, 0.72)';
    ctx.fillRect(ox, oy + 7, TILE_PX, 1);
    ctx.fillRect(ox, oy + 15, TILE_PX, 1);
    ctx.fillRect(ox + 7, oy, 1, 8);
    ctx.fillRect(ox + 15, oy + 8, 1, 8);
  }

  // 16: Molten Lava (glowing volcanic orange-gold-red magma cells)
  {
    const { ox, oy } = tilePos(Tile.LAVA);
    fillPixelNoise(ctx, ox, oy, [238, 92, 18], 34, 1701);
    const rand = seededRand(1702);
    for (let i = 0; i < 16; i++) {
      ctx.fillStyle = rand() > 0.45 ? '#fde047' : '#fb923c';
      ctx.fillRect(ox + Math.floor(rand() * 14), oy + Math.floor(rand() * 14), 2, 2);
    }
    for (let i = 0; i < 10; i++) {
      ctx.fillStyle = '#9a3412';
      ctx.fillRect(ox + Math.floor(rand() * 14), oy + Math.floor(rand() * 14), 2, 1);
    }
  }

  // 17: Sandstone (stratified warm desert stone with smooth top band)
  {
    const { ox, oy } = tilePos(Tile.SANDSTONE);
    fillPixelNoise(ctx, ox, oy, [223, 208, 150], 16, 1801);
    ctx.fillStyle = 'rgba(248, 240, 198, 0.55)';
    ctx.fillRect(ox, oy + 1, TILE_PX, 2);
    ctx.fillStyle = 'rgba(176, 156, 98, 0.48)';
    ctx.fillRect(ox, oy + 6, TILE_PX, 1);
    ctx.fillRect(ox, oy + 12, TILE_PX, 1);
  }

  // 18: Cactus Side (deeply fluted realistic desert cactus with crisp white/gold spines)
  {
    const { ox, oy } = tilePos(Tile.CACTUS_SIDE);
    fillPixelNoise(ctx, ox, oy, [54, 134, 38], 16, 1901);
    for (let x = 0; x < TILE_PX; x += 4) {
      ctx.fillStyle = 'rgba(24, 68, 16, 0.78)';
      ctx.fillRect(ox + x, oy, 1, TILE_PX);
      ctx.fillStyle = 'rgba(130, 214, 82, 0.5)';
      ctx.fillRect(ox + x + 2, oy, 1, TILE_PX);
    }
    const spines: Array<[number, number]> = [
      [2, 2], [6, 5], [10, 3], [14, 7], [2, 9], [10, 11], [6, 13], [14, 14],
    ];
    for (const [sx, sy] of spines) {
      ctx.fillStyle = '#14360a';
      ctx.fillRect(ox + sx, oy + sy, 1, 1);
      ctx.fillStyle = '#fef9c3';
      ctx.fillRect(ox + Math.min(15, sx + 1), oy + sy, 1, 1);
      ctx.fillRect(ox + sx, oy + Math.max(0, sy - 1), 1, 1);
    }
  }

  // 19: Cactus Top (ringed star-ribbed cactus cap with center spine cluster)
  {
    const { ox, oy } = tilePos(Tile.CACTUS_TOP);
    fillPixelNoise(ctx, ox, oy, [68, 152, 46], 14, 2001);
    ctx.strokeStyle = '#1e5213';
    ctx.lineWidth = 1;
    ctx.strokeRect(ox + 0.5, oy + 0.5, TILE_PX - 1, TILE_PX - 1);
    ctx.fillStyle = 'rgba(28, 74, 18, 0.55)';
    ctx.fillRect(ox + 7, oy + 1, 2, 14);
    ctx.fillRect(ox + 1, oy + 7, 14, 2);
    ctx.fillStyle = '#bef264';
    ctx.fillRect(ox + 6, oy + 6, 4, 4);
    ctx.fillStyle = '#fef08a';
    ctx.fillRect(ox + 7, oy + 7, 2, 2);
  }

  // 20: Red Team Bastion Masonry
  {
    const { ox, oy } = tilePos(Tile.RED_BLOCK);
    fillPixelNoise(ctx, ox, oy, [196, 38, 42], 18, 2101);
    ctx.fillStyle = 'rgba(252, 165, 165, 0.42)';
    ctx.fillRect(ox, oy + 1, TILE_PX, 1);
    ctx.fillRect(ox, oy + 9, TILE_PX, 1);
    ctx.fillStyle = 'rgba(105, 14, 18, 0.72)';
    ctx.fillRect(ox, oy + 7, TILE_PX, 1);
    ctx.fillRect(ox, oy + 15, TILE_PX, 1);
    ctx.fillRect(ox + 7, oy, 1, 8);
    ctx.fillRect(ox + 15, oy + 8, 1, 8);
  }

  // 21: Blue Team Bastion Masonry
  {
    const { ox, oy } = tilePos(Tile.BLUE_BLOCK);
    fillPixelNoise(ctx, ox, oy, [37, 99, 235], 18, 2201);
    ctx.fillStyle = 'rgba(147, 197, 253, 0.42)';
    ctx.fillRect(ox, oy + 1, TILE_PX, 1);
    ctx.fillRect(ox, oy + 9, TILE_PX, 1);
    ctx.fillStyle = 'rgba(15, 34, 96, 0.72)';
    ctx.fillRect(ox, oy + 7, TILE_PX, 1);
    ctx.fillRect(ox, oy + 15, TILE_PX, 1);
    ctx.fillRect(ox + 7, oy, 1, 8);
    ctx.fillRect(ox + 15, oy + 8, 1, 8);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.anisotropy = Math.min(8, maxAnisotropy);
  tex.needsUpdate = true;
  return tex;
}

// Minecraft-style stepped block breaking crack texture
export function createBreakCrackTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 16;
  canvas.height = 16;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, 16, 16);

  ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
  const crackPixels: Array<[number, number]> = [
    [7, 7], [8, 7], [7, 8], [8, 8],
    [6, 6], [5, 5], [4, 5], [3, 4], [2, 3],
    [9, 6], [10, 5], [11, 4], [12, 4], [13, 3],
    [6, 9], [5, 10], [5, 11], [4, 12], [3, 13],
    [9, 9], [10, 10], [11, 11], [12, 12], [13, 13],
    [7, 5], [7, 4], [8, 3], [8, 2],
    [8, 10], [8, 11], [7, 12], [7, 13],
    [4, 8], [3, 8], [2, 7],
    [11, 8], [12, 8], [13, 9],
  ];
  for (const [x, y] of crackPixels) {
    ctx.fillRect(x, y, 1, 1);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  return tex;
}

// Procedural pixel-art textures for character head face & tactical armor torso
export function createCharacterTextures(skin: SkinDef): {
  faceTex: THREE.CanvasTexture;
  torsoTex: THREE.CanvasTexture;
} {
  // 8x8 Minecraft-style face texture (upscaled cleanly with NearestFilter)
  const fCanvas = document.createElement('canvas');
  fCanvas.width = 8;
  fCanvas.height = 8;
  const fCtx = fCanvas.getContext('2d')!;

  fCtx.fillStyle = skin.skinTone;
  fCtx.fillRect(0, 0, 8, 8);

  if (skin.style === 'ninja') {
    // Full ninja cowl with glowing eyes slit
    fCtx.fillStyle = skin.bodyColor;
    fCtx.fillRect(0, 0, 8, 8);
    fCtx.fillStyle = skin.accentColor;
    fCtx.fillRect(0, 0, 8, 2);
    fCtx.fillRect(0, 5, 8, 3);
    fCtx.fillStyle = skin.skinTone;
    fCtx.fillRect(1, 3, 6, 2);
    fCtx.fillStyle = skin.visorColor;
    fCtx.fillRect(1, 3, 2, 1);
    fCtx.fillRect(5, 3, 2, 1);
  } else {
    // Hair / Hood / Helmet crown
    fCtx.fillStyle = skin.style === 'hood' || skin.style === 'parka' ? skin.bodyColor : skin.hairColor;
    fCtx.fillRect(0, 0, 8, 2);
    fCtx.fillRect(0, 2, 1, 2);
    fCtx.fillRect(7, 2, 1, 2);

    if (skin.style === 'hood' || skin.style === 'parka') {
      fCtx.fillStyle = skin.accentColor;
      fCtx.fillRect(0, 2, 1, 4);
      fCtx.fillRect(7, 2, 1, 4);
    }

    // Crisp Minecraft-style eyes (white sclera + colored/dark iris)
    fCtx.fillStyle = '#ffffff';
    fCtx.fillRect(1, 3, 2, 1);
    fCtx.fillRect(5, 3, 2, 1);
    fCtx.fillStyle = skin.visorColor;
    fCtx.fillRect(2, 3, 1, 1);
    fCtx.fillRect(5, 3, 1, 1);

    // Subtle nose & expression line
    fCtx.fillStyle = 'rgba(0, 0, 0, 0.16)';
    fCtx.fillRect(3, 5, 2, 1);
    fCtx.fillStyle = 'rgba(120, 62, 32, 0.35)';
    fCtx.fillRect(3, 6, 2, 1);
  }

  const faceTex = new THREE.CanvasTexture(fCanvas);
  faceTex.colorSpace = THREE.SRGBColorSpace;
  faceTex.magFilter = THREE.NearestFilter;
  faceTex.minFilter = THREE.NearestFilter;
  faceTex.generateMipmaps = false;

  // 8x8 Pixel-art tactical chest armor texture
  const tCanvas = document.createElement('canvas');
  tCanvas.width = 8;
  tCanvas.height = 8;
  const tCtx = tCanvas.getContext('2d')!;

  tCtx.fillStyle = skin.bodyColor;
  tCtx.fillRect(0, 0, 8, 8);
  // Shoulder straps & chest rig
  tCtx.fillStyle = skin.accentColor;
  tCtx.fillRect(1, 0, 1, 6);
  tCtx.fillRect(6, 0, 1, 6);
  tCtx.fillRect(1, 2, 6, 3);
  // Glowing core / emblem pixel
  tCtx.fillStyle = skin.visorColor;
  tCtx.fillRect(3, 3, 2, 1);
  // Tactical belt + buckle
  tCtx.fillStyle = '#0f172a';
  tCtx.fillRect(0, 6, 8, 1);
  tCtx.fillStyle = '#fbbf24';
  tCtx.fillRect(3, 6, 2, 1);

  const torsoTex = new THREE.CanvasTexture(tCanvas);
  torsoTex.colorSpace = THREE.SRGBColorSpace;
  torsoTex.magFilter = THREE.NearestFilter;
  torsoTex.minFilter = THREE.NearestFilter;
  torsoTex.generateMipmaps = false;

  return { faceTex, torsoTex };
}

// Procedural pixel-art rifle finish texture
export function createGunSkinTexture(gunSkin: GunSkinDef): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 16;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = gunSkin.primaryHex;
  ctx.fillRect(0, 0, 32, 16);

  if (gunSkin.pattern === 'carbon') {
    ctx.fillStyle = gunSkin.secondaryHex;
    for (let y = 0; y < 16; y += 2) {
      for (let x = y % 4 === 0 ? 0 : 1; x < 32; x += 2) {
        ctx.fillRect(x, y, 1, 1);
      }
    }
    ctx.fillStyle = gunSkin.accentHex;
    ctx.fillRect(0, 6, 32, 1);
  } else if (gunSkin.pattern === 'scales') {
    ctx.fillStyle = gunSkin.secondaryHex;
    for (let y = 0; y < 16; y += 3) {
      for (let x = (y % 6 === 0 ? 0 : 2); x < 32; x += 4) {
        ctx.fillRect(x, y, 3, 2);
      }
    }
    ctx.fillStyle = gunSkin.accentHex;
    ctx.fillRect(2, 7, 28, 2);
    ctx.fillRect(6, 2, 3, 1);
    ctx.fillRect(18, 2, 3, 1);
  } else if (gunSkin.pattern === 'blaze') {
    ctx.fillStyle = gunSkin.secondaryHex;
    ctx.fillRect(0, 0, 32, 4);
    ctx.fillRect(0, 12, 32, 4);
    ctx.fillStyle = gunSkin.accentHex;
    for (let x = 0; x < 32; x += 5) {
      ctx.fillRect(x, 4, 2, 8);
      ctx.fillRect(x + 1, 3, 1, 10);
    }
  } else if (gunSkin.pattern === 'gold') {
    ctx.fillStyle = gunSkin.secondaryHex;
    ctx.fillRect(0, 0, 32, 2);
    ctx.fillRect(0, 14, 32, 2);
    ctx.fillStyle = gunSkin.accentHex;
    ctx.fillRect(4, 3, 24, 2);
    ctx.fillRect(4, 11, 24, 2);
    ctx.fillRect(12, 6, 8, 4);
  } else if (gunSkin.pattern === 'circuit') {
    ctx.fillStyle = gunSkin.secondaryHex;
    ctx.fillRect(0, 2, 32, 12);
    ctx.fillStyle = gunSkin.accentHex;
    ctx.fillRect(2, 4, 10, 1);
    ctx.fillRect(11, 4, 1, 5);
    ctx.fillRect(11, 8, 12, 1);
    ctx.fillRect(22, 5, 8, 1);
    ctx.fillRect(4, 11, 14, 1);
    ctx.fillRect(18, 11, 1, 3);
  } else if (gunSkin.pattern === 'frost') {
    ctx.fillStyle = gunSkin.secondaryHex;
    ctx.fillRect(0, 9, 32, 7);
    ctx.fillStyle = gunSkin.accentHex;
    for (let x = 1; x < 30; x += 6) {
      ctx.fillRect(x, 4, 3, 3);
      ctx.fillRect(x + 1, 3, 1, 5);
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  return tex;
}
