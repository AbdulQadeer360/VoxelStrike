import {
  BlockId,
  CHUNK_SIZE,
  WORLD_HEIGHT,
  WORLD_MAX_X,
  WORLD_MAX_Z,
  WORLD_MIN_X,
  WORLD_MIN_Z,
  WORLD_SEED,
  type BlockType,
  type GameModeId,
} from './constants.ts';

// Deterministic fast integer hash
function hash2i(x: number, z: number, seed = WORLD_SEED): number {
  let h = (x * 374761393 + z * 668265263 + seed * 1442695041) | 0;
  h = ((h ^ (h >>> 13)) * 1274126177) | 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function hash3i(x: number, y: number, z: number, seed = WORLD_SEED): number {
  let h = (x * 374761393 + y * 1274126177 + z * 668265263 + seed * 1442695041) | 0;
  h = ((h ^ (h >>> 13)) * 1103515245) | 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function valueNoise2D(x: number, z: number, scale: number, seedOffset = 0): number {
  const sx = x / scale;
  const sz = z / scale;
  const x0 = Math.floor(sx);
  const z0 = Math.floor(sz);
  const fx = smoothstep(sx - x0);
  const fz = smoothstep(sz - z0);

  const n00 = hash2i(x0, z0, WORLD_SEED + seedOffset);
  const n10 = hash2i(x0 + 1, z0, WORLD_SEED + seedOffset);
  const n01 = hash2i(x0, z0 + 1, WORLD_SEED + seedOffset);
  const n11 = hash2i(x0 + 1, z0 + 1, WORLD_SEED + seedOffset);

  const nx0 = lerp(n00, n10, fx);
  const nx1 = lerp(n01, n11, fx);
  return lerp(nx0, nx1, fz);
}

export const WATER_LEVEL = 19;

interface RiverSample {
  inRiver: boolean;
  isBank: boolean;
  bedHeight: number;
  isBridge: boolean;
  isBridgePost: boolean;
}

interface LavaCraterSample {
  inLava: boolean;
  isRim: boolean;
  lavaLevel: number;
  floorY: number;
}

export const LAVA_CRATERS: Array<{ x: number; z: number; radius: number; lavaLevel: number }> = [
  { x: -252, z: -78, radius: 10.5, lavaLevel: 22 },
  { x: -308, z: -136, radius: 13.0, lavaLevel: 23 },
  { x: -186, z: -158, radius: 8.5, lavaLevel: 21 },
  { x: 468, z: -72, radius: 9.0, lavaLevel: 20 },
  { x: 545, z: 112, radius: 10.0, lavaLevel: 20 },
];

export interface SniperTowerDef {
  id: string;
  name: string;
  x: number;
  z: number;
  height: number;
}

export const SNIPER_TOWERS: SniperTowerDef[] = [
  { id: 'frontier_tower', name: 'Frontier Stone Tower', x: 24, z: 16, height: 14 },
  { id: 'highland_tower', name: 'Highlands Ridge Tower', x: -148, z: -48, height: 15 },
  { id: 'desert_tower', name: 'Desert Oasis Tower', x: 335, z: 22, height: 14 },
];

const TOWER_SPIRAL_STEPS: Array<[number, number]> = [
  [0, 2],
  [1, 2],
  [2, 2],
  [2, 1],
  [2, 0],
  [2, -1],
  [2, -2],
  [1, -2],
  [0, -2],
  [-1, -2],
  [-2, -2],
  [-2, -1],
  [-2, 0],
  [-2, 1],
  [-2, 2],
  [-1, 2],
];

export function isDesertBiome(wx: number, wz: number): boolean {
  const boundaryX = 285 + (valueNoise2D(0, wz, 55, 311) - 0.5) * 44;
  return wx >= boundaryX;
}

function getLavaCraterSample(wx: number, wz: number): LavaCraterSample {
  for (const c of LAVA_CRATERS) {
    const dx = wx - c.x;
    const dz = wz - c.z;
    const rawDist = Math.hypot(dx, dz);
    if (rawDist > c.radius + 5) continue;

    const jitter = (valueNoise2D(wx, wz, 9, 419) - 0.5) * 2.6;
    const effDist = rawDist + jitter;
    if (effDist <= c.radius * 0.68) {
      return { inLava: true, isRim: false, lavaLevel: c.lavaLevel, floorY: c.lavaLevel - 3 };
    }
    if (effDist <= c.radius) {
      return { inLava: false, isRim: true, lavaLevel: c.lavaLevel, floorY: c.lavaLevel + 1 };
    }
  }
  return { inLava: false, isRim: false, lavaLevel: 0, floorY: 0 };
}

// Deterministic meandering river network across the 1500x600 world:
// 1) Main East-West river flowing right past Survival Frontier (z ~ 46), south of Citadel (z ~ 34), and into Sunlit Desert
// 2) Northern branch flowing near Lava Highlands (x ~ -185) and Timber Valley (z ~ -68)
export function getRiverSample(wx: number, wz: number): RiverSample {
  // Keep Central Citadel plateau dry
  if (Math.abs(wx) <= 22 && Math.abs(wz) <= 22) {
    return { inRiver: false, isBank: false, bedHeight: 22, isBridge: false, isBridgePost: false };
  }

  // Main East-West meandering river (passes right by Frontier spawn at (42,28) -> z ~ 48)
  const mainCenterZ =
    48 + Math.sin(wx * 0.014) * 26 + Math.cos(wx * 0.031) * 10 + valueNoise2D(wx, 0, 50, 211) * 12 - 6;
  const mainHalfWidth = 6.2 + valueNoise2D(wx, 17, 36, 223) * 2.6;
  const distMain = Math.abs(wz - mainCenterZ);

  // Northern West-East tributary flowing through Highlands & Timber Valley (z ~ -68)
  const northCenterZ =
    -68 + Math.sin(wx * 0.016 + 1.1) * 20 + Math.cos(wx * 0.036) * 8 + valueNoise2D(wx, 53, 44, 251) * 10 - 5;
  const northHalfWidth = 5.0 + valueNoise2D(wx, 41, 34, 257) * 2.0;
  const distNorth = Math.abs(wz - northCenterZ);

  // North-South connecting stream around x ~ -128
  const tribCenterX = -128 + Math.sin(wz * 0.018) * 22 + Math.cos(wz * 0.041) * 8;
  const tribHalfWidth = 4.6 + valueNoise2D(19, wz, 32, 239) * 1.8;
  const distTrib = wz <= mainCenterZ + 3 ? Math.abs(wx - tribCenterX) : 999;

  const normMain = distMain / mainHalfWidth;
  const normNorth = distNorth / northHalfWidth;
  const normTrib = distTrib / tribHalfWidth;
  const normDist = Math.min(normMain, normNorth, normTrib);

  // Wooden plank footbridges across rivers
  const mainBridgeXs = [-210, -45, 42, 225, 395];
  let isBridge = false;
  let isBridgePost = false;
  for (const bx of mainBridgeXs) {
    if (Math.abs(wx - bx) <= 1 && distMain <= mainHalfWidth + 2.4) {
      isBridge = true;
      if (Math.abs(wx - bx) === 1 && Math.abs(distMain - (mainHalfWidth + 1.5)) < 1.0) {
        isBridgePost = true;
      }
      break;
    }
  }
  const northBridgeXs = [-225, -55, 175, 360];
  if (!isBridge) {
    for (const bx of northBridgeXs) {
      if (Math.abs(wx - bx) <= 1 && distNorth <= northHalfWidth + 2.2) {
        isBridge = true;
        if (Math.abs(wx - bx) === 1 && Math.abs(distNorth - (northHalfWidth + 1.4)) < 1.0) {
          isBridgePost = true;
        }
        break;
      }
    }
  }
  const tribBridgeZs = [-110, -24, 34];
  if (!isBridge && wz <= mainCenterZ + 2) {
    for (const bz of tribBridgeZs) {
      if (Math.abs(wz - bz) <= 1 && distTrib <= tribHalfWidth + 2.2) {
        isBridge = true;
        if (Math.abs(wz - bz) === 1 && Math.abs(distTrib - (tribHalfWidth + 1.4)) < 1.0) {
          isBridgePost = true;
        }
        break;
      }
    }
  }

  if (normDist <= 1.0) {
    // Smooth riverbed bowl: 16 in center, 18 near banks
    const centerFactor = 1.0 - normDist;
    const bedHeight = centerFactor > 0.55 ? 16 : centerFactor > 0.25 ? 17 : 18;
    return { inRiver: true, isBank: true, bedHeight, isBridge, isBridgePost };
  }

  if (normDist <= 1.48) {
    return { inRiver: false, isBank: true, bedHeight: 20, isBridge, isBridgePost };
  }

  return { inRiver: false, isBank: false, bedHeight: 22, isBridge: false, isBridgePost: false };
}

export function getTerrainHeight(wx: number, wz: number): number {
  // Keep central citadel plateau flat around (0,0)
  const distCenter = Math.hypot(wx, wz);
  if (distCenter < 24) {
    return 22;
  }

  const desert = isDesertBiome(wx, wz);
  const broad = valueNoise2D(wx, wz, 72, 11) * (desert ? 4.4 : 5.8);
  const detail = valueNoise2D(wx, wz, desert ? 32 : 22, 37) * (desert ? 1.8 : 2.4);
  // Highlands ridge toward negative X/Z
  const highlandFactor = Math.max(0, Math.min(1, (-wx - 120) / 140));
  const ridge = highlandFactor * valueNoise2D(wx, wz, 34, 93) * 7.2;

  let h = Math.floor((desert ? 20.5 : 20.0) + broad + detail + ridge);
  if (distCenter < 34) {
    const blend = (distCenter - 24) / 10;
    h = Math.round(lerp(22, h, blend));
  }

  const river = getRiverSample(wx, wz);
  if (river.inRiver) {
    return river.bedHeight;
  }
  if (river.isBank) {
    // Gently slope riverbank down toward water level
    h = Math.min(h, 20);
    return Math.max(16, Math.min(36, h));
  }

  const crater = getLavaCraterSample(wx, wz);
  if (crater.inLava) {
    return crater.floorY;
  }
  if (crater.isRim) {
    return Math.max(h, crater.floorY);
  }

  return Math.max(16, Math.min(36, h));
}

export function isInsideWorld(wx: number, wy: number, wz: number): boolean {
  return (
    wx >= WORLD_MIN_X &&
    wx <= WORLD_MAX_X &&
    wz >= WORLD_MIN_Z &&
    wz <= WORLD_MAX_Z &&
    wy >= 0 &&
    wy < WORLD_HEIGHT
  );
}

export function getChunkKey(cx: number, cz: number): string {
  return `${cx},${cz}`;
}

export function worldToChunk(wx: number, wz: number): { cx: number; cz: number; lx: number; lz: number } {
  const cx = Math.floor(wx / CHUNK_SIZE);
  const cz = Math.floor(wz / CHUNK_SIZE);
  const lx = wx - cx * CHUNK_SIZE;
  const lz = wz - cz * CHUNK_SIZE;
  return { cx, cz, lx, lz };
}

export function localIndex(lx: number, ly: number, lz: number): number {
  return (ly * CHUNK_SIZE + lz) * CHUNK_SIZE + lx;
}

// Generate deterministic chunk buffer (16 * 64 * 16 = 16,384 bytes)
export function generateChunkData(cx: number, cz: number): Uint8Array {
  const data = new Uint8Array(CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE);
  const startX = cx * CHUNK_SIZE;
  const startZ = cz * CHUNK_SIZE;

  for (let lz = 0; lz < CHUNK_SIZE; lz++) {
    const wz = startZ + lz;
    if (wz < WORLD_MIN_Z || wz > WORLD_MAX_Z) continue;

    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      const wx = startX + lx;
      if (wx < WORLD_MIN_X || wx > WORLD_MAX_X) continue;

      const desert = isDesertBiome(wx, wz);
      const river = getRiverSample(wx, wz);
      const crater = river.inRiver || river.isBank ? { inLava: false, isRim: false, lavaLevel: 0, floorY: 0 } : getLavaCraterSample(wx, wz);
      const surfaceY = getTerrainHeight(wx, wz);
      const isShore = river.isBank || surfaceY <= WATER_LEVEL + 1;
      const hasDeepCavern = !river.inRiver && surfaceY > 14 && valueNoise2D(wx, wz, 26, 991) > 0.7;

      for (let ly = 0; ly < WORLD_HEIGHT; ly++) {
        let block: BlockType = BlockId.AIR;

        if (ly === 0) {
          block = BlockId.BEDROCK;
        } else if (hasDeepCavern && ly >= 1 && ly <= 7) {
          // Deep underground magma chamber with molten lava floor
          block = ly <= 4 ? BlockId.LAVA : BlockId.AIR;
        } else if (ly < surfaceY - 1) {
          if (desert && ly >= surfaceY - 5 && !crater.inLava && !crater.isRim) {
            block = BlockId.SANDSTONE;
          } else {
            block = BlockId.STONE;
            // Underground ore generation
            const r = hash3i(wx, ly, wz, 701);
            if (ly <= 10 && r < 0.018) {
              block = BlockId.CRYSTAL_ORE;
            } else if (ly <= 14 && r >= 0.018 && r < 0.042) {
              block = BlockId.GOLD_ORE;
            } else if (ly <= 19 && r >= 0.042 && r < 0.088) {
              block = BlockId.IRON_ORE;
            } else if (r >= 0.088 && r < 0.145) {
              block = BlockId.COAL_ORE;
            }
          }
        } else if (ly < surfaceY) {
          if (crater.inLava || crater.isRim) {
            block = BlockId.STONE;
          } else if (desert) {
            block = BlockId.SAND;
          } else {
            block = isShore ? BlockId.SAND : BlockId.DIRT;
          }
        } else if (ly === surfaceY) {
          if (crater.inLava || crater.isRim) {
            const sr = hash3i(wx, ly, wz, 613);
            block = sr < 0.1 ? BlockId.COAL_ORE : BlockId.STONE;
          } else if (river.inRiver) {
            block = BlockId.SAND;
          } else if (desert) {
            // Oasis lush grass strip right beside desert river, otherwise golden sand
            block = river.isBank ? BlockId.GRASS : BlockId.SAND;
          } else if (surfaceY < WATER_LEVEL || isShore) {
            block = BlockId.SAND;
          } else if (surfaceY >= 29) {
            // Rocky highland cap with occasional surface iron/gold
            const sr = hash3i(wx, ly, wz, 509);
            if (sr < 0.08) block = BlockId.IRON_ORE;
            else if (sr < 0.11) block = BlockId.GOLD_ORE;
            else block = BlockId.STONE;
          } else {
            block = BlockId.GRASS;
          }
        } else if (ly <= WATER_LEVEL && surfaceY < WATER_LEVEL) {
          block = BlockId.WATER;
        } else if (crater.inLava && ly <= crater.lavaLevel) {
          block = BlockId.LAVA;
        }

        // Rustic plank footbridges crossing the rivers
        if (river.isBridge) {
          if (ly === WATER_LEVEL + 1) {
            block = BlockId.PLANKS;
          } else if (river.isBridgePost && ly === WATER_LEVEL + 2) {
            block = BlockId.WOOD;
          }
        }

        // Natural world border cliff walls around outer block
        if (
          (wx === WORLD_MIN_X || wx === WORLD_MAX_X || wz === WORLD_MIN_Z || wz === WORLD_MAX_Z) &&
          ly <= 28
        ) {
          block = ly === 0 ? BlockId.BEDROCK : BlockId.STONE;
        }

        data[localIndex(lx, ly, lz)] = block;
      }

      // Small desert sandstone ruins (pillar accents) away from spawn/rivers/craters
      if (desert && !river.inRiver && !river.isBank && !crater.inLava && !crater.isRim) {
        const ruinSeed = hash2i(wx, wz, 947);
        if (ruinSeed < 0.0025 && Math.hypot(wx - 385, wz - 35) > 14 && surfaceY > WATER_LEVEL + 1) {
          const pillarH = 2 + Math.floor(hash2i(wx, wz, 949) * 3);
          for (let h = 1; h <= pillarH; h++) {
            const wy = surfaceY + h;
            if (wy < WORLD_HEIGHT) {
              data[localIndex(lx, wy, lz)] = BlockId.SANDSTONE;
            }
          }
        }
      }
    }
  }

  // Stamp deterministic Central Citadel ruins around (0, 0)
  for (let lz = 0; lz < CHUNK_SIZE; lz++) {
    const wz = startZ + lz;
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      const wx = startX + lx;
      if (Math.abs(wx) <= 18 && Math.abs(wz) <= 18) {
        const base = 22;
        data[localIndex(lx, base, lz)] =
          (Math.abs(wx) + Math.abs(wz)) % 4 === 0 ? BlockId.BRICK : BlockId.STONE;
        const onPerimeter = Math.abs(wx) === 16 || Math.abs(wz) === 16;
        const isGate = Math.abs(wx) <= 3 || Math.abs(wz) <= 3;
        if (onPerimeter && !isGate && Math.abs(wx) <= 16 && Math.abs(wz) <= 16) {
          const battlementH = (wx + wz) % 2 === 0 ? 4 : 3;
          for (let h = 1; h <= battlementH; h++) {
            data[localIndex(lx, base + h, lz)] = BlockId.BRICK;
          }
        }
        if (Math.abs(wx) >= 14 && Math.abs(wx) <= 16 && Math.abs(wz) >= 14 && Math.abs(wz) <= 16) {
          for (let h = 1; h <= 6; h++) {
            data[localIndex(lx, base + h, lz)] = h === 6 ? BlockId.PLANKS : BlockId.BRICK;
          }
        }
        if (Math.abs(wx) <= 1 && Math.abs(wz) <= 1 && (wx === 0 || wz === 0)) {
          data[localIndex(lx, base + 1, lz)] = BlockId.BRICK;
          if (wx === 0 && wz === 0) {
            data[localIndex(lx, base + 2, lz)] = BlockId.BRICK;
            data[localIndex(lx, base + 3, lz)] = BlockId.CRYSTAL_ORE;
          }
        }
      }
    }
  }

  // Stamp 3 Stone Sniper Watchtowers with walkable spiral stone stairs & top sniper battlements
  for (const tower of SNIPER_TOWERS) {
    if (
      startX + CHUNK_SIZE - 1 < tower.x - 3 ||
      startX > tower.x + 3 ||
      startZ + CHUNK_SIZE - 1 < tower.z - 3 ||
      startZ > tower.z + 3
    ) {
      continue;
    }

    const baseY = Math.max(WATER_LEVEL + 1, getTerrainHeight(tower.x, tower.z));
    const topY = Math.min(WORLD_HEIGHT - 4, baseY + tower.height);

    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      const wz = startZ + lz;
      const dz = wz - tower.z;
      if (Math.abs(dz) > 3) continue;

      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const wx = startX + lx;
        const dx = wx - tower.x;
        if (Math.abs(dx) > 3) continue;

        const isCorner = Math.abs(dx) === 3 && Math.abs(dz) === 3;
        const isWall = Math.abs(dx) === 3 || Math.abs(dz) === 3;
        const isDoor = dz === 3 && Math.abs(dx) <= 1;

        // Solid stone foundation base
        for (let fy = Math.max(1, baseY - 3); fy <= baseY; fy++) {
          data[localIndex(lx, fy, lz)] = BlockId.STONE;
        }

        // Clear interior & build walls + stairs
        for (let wy = baseY + 1; wy <= topY + 2; wy++) {
          const dy = wy - baseY;
          let blk: BlockType = BlockId.AIR;

          if (wy < topY) {
            if (isWall) {
              if (isDoor && dy >= 1 && dy <= 3) {
                blk = BlockId.AIR;
              } else if (!isCorner && dy === Math.floor(tower.height * 0.5) && (dx === 0 || dz === 0)) {
                // Mid-level arrow/sniper slit
                blk = BlockId.AIR;
              } else {
                blk = isCorner && dy % 3 === 0 ? BlockId.BRICK : BlockId.STONE;
              }
            } else {
              // Walkable spiral stone staircase circling inside perimeter
              const stepIdx = (dy - 1) % TOWER_SPIRAL_STEPS.length;
              const prevIdx = (dy - 2 + TOWER_SPIRAL_STEPS.length) % TOWER_SPIRAL_STEPS.length;
              const [sx, sz] = TOWER_SPIRAL_STEPS[stepIdx];
              const [px, pz] = TOWER_SPIRAL_STEPS[prevIdx];
              if ((dx === sx && dz === sz) || (dy > 1 && dx === px && dz === pz && dy === 1)) {
                blk = BlockId.STONE;
              } else if (dx === sx && dz === sz) {
                blk = BlockId.STONE;
              }
            }
          } else if (wy === topY) {
            // Top sniper deck (leave stair exit hole at last stair cell)
            const lastStep = TOWER_SPIRAL_STEPS[(tower.height - 2) % TOWER_SPIRAL_STEPS.length];
            const isHatch = dx === lastStep[0] && dz === lastStep[1];
            if (isHatch) {
              blk = BlockId.AIR;
            } else if (isWall) {
              blk = BlockId.STONE;
            } else {
              blk = BlockId.PLANKS;
            }
          } else if (wy === topY + 1 && isWall) {
            // Sniper parapet walls with open firing ports on centers
            const isPort = (Math.abs(dx) <= 1 && Math.abs(dz) === 3) || (Math.abs(dz) <= 1 && Math.abs(dx) === 3);
            if (!isPort) {
              blk = isCorner ? BlockId.BRICK : BlockId.STONE;
            }
          } else if (wy === topY + 2 && isCorner) {
            // Corner crenellation caps
            blk = BlockId.STONE;
          }

          data[localIndex(lx, wy, lz)] = blk;
        }
      }
    }
  }

  // Deterministic trees (grasslands) & cacti (desert)
  for (let wz = startZ - 2; wz <= startZ + CHUNK_SIZE + 1; wz++) {
    if (wz < WORLD_MIN_Z + 4 || wz > WORLD_MAX_Z - 4) continue;
    for (let wx = startX - 2; wx <= startX + CHUNK_SIZE + 1; wx++) {
      if (wx < WORLD_MIN_X + 4 || wx > WORLD_MAX_X - 4) continue;
      if (Math.abs(wx) < 24 && Math.abs(wz) < 24) continue; // Keep citadel clear
      if (SNIPER_TOWERS.some((t) => Math.abs(wx - t.x) <= 6 && Math.abs(wz - t.z) <= 6)) continue;

      if (Math.abs(wx) % 5 !== 0 || Math.abs(wz) % 5 !== 0) continue;

      const jx = wx + Math.floor(hash2i(wx, wz, 882) * 3) - 1;
      const jz = wz + Math.floor(hash2i(wx, wz, 883) * 3) - 1;
      const rCheck = getRiverSample(jx, jz);
      if (rCheck.inRiver || rCheck.isBank || rCheck.isBridge) continue;
      const cCheck = getLavaCraterSample(jx, jz);
      if (cCheck.inLava || cCheck.isRim) continue;

      const desert = isDesertBiome(jx, jz);
      const groundY = getTerrainHeight(jx, jz);
      if (groundY <= WATER_LEVEL + 1 || groundY >= 28) continue;

      if (desert) {
        const cactusChance = hash2i(wx, wz, 887);
        if (cactusChance > 0.3) continue;
        const cactusH = 2 + Math.floor(hash2i(jx, jz, 889) * 3);
        const lx = jx - startX;
        const lz = jz - startZ;
        if (lx >= 0 && lx < CHUNK_SIZE && lz >= 0 && lz < CHUNK_SIZE) {
          for (let cy = 1; cy <= cactusH; cy++) {
            const wy = groundY + cy;
            if (wy < WORLD_HEIGHT) {
              data[localIndex(lx, wy, lz)] = BlockId.CACTUS;
            }
          }
        }
        continue;
      }

      const valleyBoost = wx > 120 ? 0.42 : 0.28;
      const treeChance = hash2i(wx, wz, 881);
      if (treeChance > valleyBoost) continue;

      const isTallOak = hash2i(jx, jz, 885) > 0.72;
      const trunkH = isTallOak ? 6 + Math.floor(hash2i(jx, jz, 884) * 2) : 4 + Math.floor(hash2i(jx, jz, 884) * 2);

      // Trunk blocks inside this chunk
      for (let ty = 1; ty <= trunkH; ty++) {
        const wy = groundY + ty;
        const lx = jx - startX;
        const lz = jz - startZ;
        if (lx >= 0 && lx < CHUNK_SIZE && lz >= 0 && lz < CHUNK_SIZE && wy < WORLD_HEIGHT) {
          data[localIndex(lx, wy, lz)] = BlockId.WOOD;
        }
      }

      // Authentic Minecraft Oak & Tall Forest multi-layer canopies
      const canopyStart = isTallOak ? trunkH - 3 : trunkH - 2;
      for (let dy = canopyStart; dy <= trunkH + 1; dy++) {
        const layerFromTop = trunkH + 1 - dy;
        const radius = layerFromTop === 0 ? 1 : layerFromTop === 1 && !isTallOak ? 1 : 2;
        for (let dz = -radius; dz <= radius; dz++) {
          for (let dx = -radius; dx <= radius; dx++) {
            const atCorner = Math.abs(dx) === radius && Math.abs(dz) === radius;
            // Top layer forms crisp Minecraft '+' leaf crown; lower corners trimmed subtly
            if (layerFromTop === 0 && atCorner) continue;
            if (radius === 2 && atCorner && hash3i(jx + dx, groundY + dy, jz + dz, 899) > 0.38) continue;
            if (dx === 0 && dz === 0 && dy <= trunkH) continue;

            const bx = jx + dx;
            const bz = jz + dz;
            const by = groundY + dy;
            const lx = bx - startX;
            const lz = bz - startZ;
            if (lx >= 0 && lx < CHUNK_SIZE && lz >= 0 && lz < CHUNK_SIZE && by < WORLD_HEIGHT) {
              const idx = localIndex(lx, by, lz);
              if (data[idx] === BlockId.AIR) {
                data[idx] = BlockId.LEAVES;
              }
            }
          }
        }
      }
    }
  }

  return data;
}

export function findSafeSpawnY(x: number, z: number): number {
  if (Math.abs(x) <= 18 && Math.abs(z) <= 18) {
    return 23;
  }
  const h = getTerrainHeight(x, z);
  return Math.max(WATER_LEVEL + 1, h + 1);
}

export const CTF_FLAG_BASES = {
  red: { x: -40, y: 23, z: 0 },
  blue: { x: 40, y: 23, z: 0 },
} as const;

export function getModeBounds(mode: GameModeId): {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
} {
  if (mode === 'duel') return { minX: -50, maxX: 49, minZ: -50, maxZ: 49 };
  if (mode === 'ctf') return { minX: -62, maxX: 62, minZ: -34, maxZ: 34 };
  if (mode === 'clanwar') return { minX: -48, maxX: 48, minZ: -30, maxZ: 30 };
  return { minX: WORLD_MIN_X, maxX: WORLD_MAX_X, minZ: WORLD_MIN_Z, maxZ: WORLD_MAX_Z };
}

export function isInsideModeWorld(mode: GameModeId, wx: number, wy: number, wz: number): boolean {
  const b = getModeBounds(mode);
  return wx >= b.minX && wx <= b.maxX && wz >= b.minZ && wz <= b.maxZ && wy >= 0 && wy < WORLD_HEIGHT;
}

export function getModeSpawn(mode: GameModeId, team: 'red' | 'blue' = 'red'): { x: number; y: number; z: number } {
  if (mode === 'duel') {
    return team === 'red' ? { x: -42, y: 23, z: 0 } : { x: 42, y: 23, z: 0 };
  }
  if (mode === 'ctf') {
    return team === 'red' ? { x: -53, y: 23, z: 0 } : { x: 53, y: 23, z: 0 };
  }
  if (mode === 'clanwar') {
    return team === 'red' ? { x: -40, y: 23, z: 0 } : { x: 40, y: 23, z: 0 };
  }
  return { x: 42, y: findSafeSpawnY(42, 28), z: 28 };
}

function generateDuelChunkData(cx: number, cz: number): Uint8Array {
  const data = new Uint8Array(CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE);
  const startX = cx * CHUNK_SIZE;
  const startZ = cz * CHUNK_SIZE;
  const { minX, maxX, minZ, maxZ } = getModeBounds('duel');
  const floorY = 22;

  for (let lz = 0; lz < CHUNK_SIZE; lz++) {
    const wz = startZ + lz;
    if (wz < minZ || wz > maxZ) continue;
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      const wx = startX + lx;
      if (wx < minX || wx > maxX) continue;

      for (let ly = 0; ly < floorY; ly++) {
        data[localIndex(lx, ly, lz)] = ly === 0 ? BlockId.BEDROCK : BlockId.STONE;
      }

      const absX = Math.abs(wx);
      const absZ = Math.abs(wz);
      const isBorder = wx === minX || wx === maxX || wz === minZ || wz === maxZ;

      // 100x100 Plain Battleground Floor
      data[localIndex(lx, floorY, lz)] =
        absZ <= 2 || absX <= 2
          ? BlockId.STONE
          : Math.abs(wx + wz) % 6 === 0
            ? BlockId.BRICK
            : BlockId.GRASS;

      // Perimeter Fortress Walls
      if (isBorder) {
        const wallH = (wx + wz) % 2 === 0 ? 9 : 8;
        for (let wy = floorY + 1; wy <= floorY + wallH; wy++) {
          data[localIndex(lx, wy, lz)] = wy === floorY + wallH ? BlockId.STONE : BlockId.BRICK;
        }
        continue;
      }

      // Spawn Defensive Barriers (at x = ±36)
      if (absX === 36 && absZ <= 6 && absZ >= 2) {
        for (let wy = floorY + 1; wy <= floorY + 3; wy++) {
          data[localIndex(lx, wy, lz)] = BlockId.STONE_WALL;
        }
      }

      // Outer Fight Walls & Peek Windows (at x = ±24, z = ±5..14)
      if (absX === 24 && absZ >= 4 && absZ <= 14) {
        for (let wy = floorY + 1; wy <= floorY + 3; wy++) {
          if (wy === floorY + 2 && (absZ === 7 || absZ === 11)) continue;
          data[localIndex(lx, wy, lz)] = absZ % 2 === 0 ? BlockId.BRICK : BlockId.STONE_WALL;
        }
      }

      // Midfield Barriers (at x = ±14, z = ±2..10 & x = ±8, z = ±16..24)
      if (absX === 14 && absZ >= 2 && absZ <= 10) {
        for (let wy = floorY + 1; wy <= floorY + 2; wy++) {
          data[localIndex(lx, wy, lz)] = wy === floorY + 2 ? BlockId.PLANKS : BlockId.WOOD_WALL;
        }
      }
      if (absX === 8 && absZ >= 16 && absZ <= 24) {
        for (let wy = floorY + 1; wy <= floorY + 3; wy++) {
          data[localIndex(lx, wy, lz)] = BlockId.BRICK;
        }
      }

      // Twin North & South Sniper Towers (x = ±18, z = ±30)
      for (const tx of [-18, 18]) {
        for (const tz of [-30, 30]) {
          const dx = wx - tx;
          const dz = wz - tz;
          if (Math.abs(dx) <= 2 && Math.abs(dz) <= 2) {
            const onEdge = Math.abs(dx) === 2 || Math.abs(dz) === 2;
            const door = dx === 0 && dz === (tz > 0 ? -2 : 2);
            if (onEdge && !door) {
              for (let wy = floorY + 1; wy <= floorY + 7; wy++) {
                data[localIndex(lx, wy, lz)] = wy === floorY + 7 ? BlockId.STONE_WALL : BlockId.BRICK;
              }
            }
            data[localIndex(lx, floorY + 6, lz)] = BlockId.PLANKS;
            if (dx === 0 && dz === 0) {
              for (let wy = floorY + 1; wy <= floorY + 5; wy++) {
                data[localIndex(lx, wy, lz)] = wy % 2 === 0 ? BlockId.STONE_STAIRS : BlockId.BRICK;
              }
            }
          }
          // Access Stairs to Tower
          if (dx === 0 && dz === (tz > 0 ? -3 : 3)) {
            data[localIndex(lx, floorY + 1, lz)] = BlockId.STONE_STAIRS;
          }
        }
      }

      // Center Citadel Combat Platform + Barriers
      if (absX <= 4 && absZ <= 4) {
        data[localIndex(lx, floorY + 1, lz)] = BlockId.BRICK;
        if ((absX === 4 && absZ <= 1) || (absZ === 4 && absX <= 1)) {
          data[localIndex(lx, floorY + 1, lz)] = BlockId.STONE_STAIRS;
        }
        if (absX === 3 && absZ === 3) {
          data[localIndex(lx, floorY + 2, lz)] = BlockId.STONE_WALL;
          data[localIndex(lx, floorY + 3, lz)] = BlockId.CRYSTAL_ORE;
        }
      }
    }
  }

  return data;
}

function generateCtfChunkData(cx: number, cz: number): Uint8Array {
  const data = new Uint8Array(CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE);
  const startX = cx * CHUNK_SIZE;
  const startZ = cz * CHUNK_SIZE;
  const { minX, maxX, minZ, maxZ } = getModeBounds('ctf');
  const floorY = 22;

  for (let lz = 0; lz < CHUNK_SIZE; lz++) {
    const wz = startZ + lz;
    if (wz < minZ || wz > maxZ) continue;
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      const wx = startX + lx;
      if (wx < minX || wx > maxX) continue;

      const absX = Math.abs(wx);
      const absZ = Math.abs(wz);
      const isRedSide = wx < 0;
      const teamBlock = isRedSide ? BlockId.RED_BLOCK : BlockId.BLUE_BLOCK;
      const isBorder = wx === minX || wx === maxX || wz === minZ || wz === maxZ;

      for (let ly = 0; ly < floorY; ly++) {
        data[localIndex(lx, ly, lz)] = ly === 0 ? BlockId.BEDROCK : BlockId.STONE;
      }

      // Base floor (moat in center x = -2..2 with 3 bridges)
      const isBridge = absZ <= 2 || Math.abs(absZ - 19) <= 2;
      if (absX <= 2 && !isBridge) {
        data[localIndex(lx, floorY - 2, lz)] = BlockId.SAND;
        data[localIndex(lx, floorY - 1, lz)] = BlockId.WATER;
        data[localIndex(lx, floorY, lz)] = BlockId.WATER;
      } else if (absX <= 2 && isBridge) {
        data[localIndex(lx, floorY, lz)] = BlockId.PLANKS;
      } else if (absX >= 38 && absX <= 57 && absZ <= 14) {
        // Red & Blue Base Courtyard floors
        const isTrim = absX === 38 || absX === 57 || absZ === 14;
        data[localIndex(lx, floorY, lz)] = isTrim ? teamBlock : BlockId.BRICK;
      } else {
        data[localIndex(lx, floorY, lz)] =
          absZ <= 2 ? BlockId.BRICK : (Math.abs(wx + wz) % 4 === 0 ? BlockId.STONE : BlockId.GRASS);
      }

      if (isBorder) {
        for (let wy = floorY + 1; wy <= floorY + 8; wy++) {
          data[localIndex(lx, wy, lz)] = wy === floorY + 8 ? BlockId.STONE : teamBlock;
        }
        continue;
      }

      // Flag Pedestal Pad in front-center of each Base (x = ±40, z = 0)
      if (Math.abs(absX - 40) <= 1 && absZ <= 1) {
        data[localIndex(lx, floorY, lz)] = absX === 40 && absZ === 0 ? BlockId.CRYSTAL_ORE : teamBlock;
      }

      // Red & Blue Fortress Base Perimeter (open wide front arch at x = ±38, z = -5..5)
      if (absX >= 38 && absX <= 57 && absZ <= 14) {
        const isBaseWall = absX === 57 || absZ === 14 || (absX === 38 && absZ >= 5);
        const isCornerTower = (absX >= 55 || absX <= 40) && absZ >= 12;
        if (isCornerTower) {
          for (let wy = floorY + 1; wy <= floorY + 7; wy++) {
            data[localIndex(lx, wy, lz)] = wy === floorY + 7 ? BlockId.BRICK : teamBlock;
          }
        } else if (isBaseWall) {
          const wallH = (wx + wz) % 2 === 0 ? 5 : 4;
          for (let wy = floorY + 1; wy <= floorY + wallH; wy++) {
            data[localIndex(lx, wy, lz)] = wy === 1 ? BlockId.BRICK : teamBlock;
          }
        }
        // Spawn shelter pillars behind spawn at ±55
        if (absX === 49 && absZ >= 3 && absZ <= 5) {
          for (let wy = floorY + 1; wy <= floorY + 3; wy++) {
            data[localIndex(lx, wy, lz)] = BlockId.BRICK;
          }
        }
      }

      // Midfield tactical cover walls & bunkers
      if (absX === 25 && absZ >= 4 && absZ <= 10) {
        for (let wy = floorY + 1; wy <= floorY + 3; wy++) {
          if (wy === floorY + 2 && absZ === 7) continue;
          data[localIndex(lx, wy, lz)] = BlockId.STONE_WALL;
        }
      }
      if (absX === 14 && (absZ <= 2 || (absZ >= 12 && absZ <= 16))) {
        for (let wy = floorY + 1; wy <= floorY + 2; wy++) {
          data[localIndex(lx, wy, lz)] = BlockId.BRICK;
        }
      }
      // Twin sniper lookout towers on North/South midfield (x = ±16, z = ±25)
      if (Math.abs(absX - 16) <= 2 && Math.abs(absZ - 25) <= 2) {
        const isTowerEdge = Math.abs(absX - 16) === 2 || Math.abs(absZ - 25) === 2;
        const isTowerDoor = Math.abs(absX - 16) === 0 && absZ === 23;
        if (isTowerEdge && !isTowerDoor) {
          for (let wy = floorY + 1; wy <= floorY + 5; wy++) {
            data[localIndex(lx, wy, lz)] = BlockId.STONE;
          }
        }
        data[localIndex(lx, floorY + 5, lz)] = BlockId.PLANKS;
        if (isTowerEdge) {
          data[localIndex(lx, floorY + 6, lz)] = teamBlock;
        }
      }
    }
  }

  return data;
}

function generateClanWarChunkData(cx: number, cz: number): Uint8Array {
  const data = new Uint8Array(CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE);
  const startX = cx * CHUNK_SIZE;
  const startZ = cz * CHUNK_SIZE;
  const { minX, maxX, minZ, maxZ } = getModeBounds('clanwar');
  const floorY = 22;

  for (let lz = 0; lz < CHUNK_SIZE; lz++) {
    const wz = startZ + lz;
    if (wz < minZ || wz > maxZ) continue;
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      const wx = startX + lx;
      if (wx < minX || wx > maxX) continue;

      const absX = Math.abs(wx);
      const absZ = Math.abs(wz);
      const teamBlock = wx < 0 ? BlockId.RED_BLOCK : BlockId.BLUE_BLOCK;
      const isBorder = wx === minX || wx === maxX || wz === minZ || wz === maxZ;

      for (let ly = 0; ly < floorY; ly++) {
        data[localIndex(lx, ly, lz)] = ly === 0 ? BlockId.BEDROCK : BlockId.STONE;
      }

      data[localIndex(lx, floorY, lz)] =
        absX <= 6 && absZ <= 6
          ? BlockId.BRICK
          : absZ <= 2
            ? BlockId.STONE
            : (Math.abs(wx + wz) % 5 === 0 ? BlockId.STONE : BlockId.GRASS);

      if (isBorder) {
        for (let wy = floorY + 1; wy <= floorY + 8; wy++) {
          data[localIndex(lx, wy, lz)] = wy === floorY + 8 ? BlockId.STONE : teamBlock;
        }
        continue;
      }

      // Clan Bastion Forts (x = ±36..44, z = -10..10)
      if (absX >= 33 && absX <= 44 && absZ <= 10) {
        const isWall = absX === 44 || absZ === 10 || (absX === 33 && absZ >= 4);
        if (isWall) {
          for (let wy = floorY + 1; wy <= floorY + 5; wy++) {
            data[localIndex(lx, wy, lz)] = wy % 2 === 0 ? BlockId.BRICK : teamBlock;
          }
        }
      }

      // Central War Keep
      if (absX <= 5 && absZ <= 5) {
        const isKeepWall = (absX === 5 || absZ === 5) && absX > 1 && absZ > 1;
        if (isKeepWall) {
          for (let wy = floorY + 1; wy <= floorY + 3; wy++) {
            data[localIndex(lx, wy, lz)] = BlockId.BRICK;
          }
        }
        if (absX === 0 && absZ === 0) {
          data[localIndex(lx, floorY + 1, lz)] = BlockId.BRICK;
          data[localIndex(lx, floorY + 2, lz)] = BlockId.CRYSTAL_ORE;
        }
      }

      // Tactical fight walls across battlefield
      if (absX === 18 && absZ >= 3 && absZ <= 9) {
        for (let wy = floorY + 1; wy <= floorY + 3; wy++) {
          if (wy === floorY + 2 && absZ === 6) continue;
          data[localIndex(lx, wy, lz)] = BlockId.STONE_WALL;
        }
      }
      if (absX === 10 && absZ >= 12 && absZ <= 17) {
        for (let wy = floorY + 1; wy <= floorY + 2; wy++) {
          data[localIndex(lx, wy, lz)] = BlockId.WOOD_WALL;
        }
      }
    }
  }
  return data;
}

export function generateChunkDataForMode(mode: GameModeId, cx: number, cz: number): Uint8Array {
  if (mode === 'duel') return generateDuelChunkData(cx, cz);
  if (mode === 'ctf') return generateCtfChunkData(cx, cz);
  if (mode === 'clanwar') return generateClanWarChunkData(cx, cz);
  return generateChunkData(cx, cz);
}
