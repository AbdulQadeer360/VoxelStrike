import * as THREE from 'three';
import { BlockId, CHUNK_SIZE, WORLD_HEIGHT } from '../shared/constants.ts';
import { ATLAS_COLS, ATLAS_ROWS, getBlockFaceTile } from './textures.ts';

interface FaceDef {
  dir: [number, number, number];
  face: 'top' | 'bottom' | 'side';
  shade: number;
  corners: Array<[number, number, number]>;
  uvs: Array<[number, number]>;
}

const FACES: FaceDef[] = [
  // +Y Top
  {
    dir: [0, 1, 0],
    face: 'top',
    shade: 1.0,
    corners: [
      [0, 1, 1],
      [1, 1, 1],
      [1, 1, 0],
      [0, 1, 0],
    ],
    uvs: [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ],
  },
  // -Y Bottom
  {
    dir: [0, -1, 0],
    face: 'bottom',
    shade: 0.58,
    corners: [
      [0, 0, 0],
      [1, 0, 0],
      [1, 0, 1],
      [0, 0, 1],
    ],
    uvs: [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ],
  },
  // +X East
  {
    dir: [1, 0, 0],
    face: 'side',
    shade: 0.78,
    corners: [
      [1, 0, 1],
      [1, 0, 0],
      [1, 1, 0],
      [1, 1, 1],
    ],
    uvs: [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ],
  },
  // -X West
  {
    dir: [-1, 0, 0],
    face: 'side',
    shade: 0.78,
    corners: [
      [0, 0, 0],
      [0, 0, 1],
      [0, 1, 1],
      [0, 1, 0],
    ],
    uvs: [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ],
  },
  // +Z South
  {
    dir: [0, 0, 1],
    face: 'side',
    shade: 0.9,
    corners: [
      [0, 0, 1],
      [1, 0, 1],
      [1, 1, 1],
      [0, 1, 1],
    ],
    uvs: [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ],
  },
  // -Z North
  {
    dir: [0, 0, -1],
    face: 'side',
    shade: 0.74,
    corners: [
      [1, 0, 0],
      [0, 0, 0],
      [0, 1, 0],
      [1, 1, 0],
    ],
    uvs: [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ],
  },
];

export type BlockGetter = (wx: number, wy: number, wz: number) => number;

export interface NeighborChunks {
  nx: Uint8Array | null;
  px: Uint8Array | null;
  nz: Uint8Array | null;
  pz: Uint8Array | null;
  nxnz: Uint8Array | null;
  pxnz: Uint8Array | null;
  nxpz: Uint8Array | null;
  pxpz: Uint8Array | null;
}

function isOpaque(blk: number): boolean {
  return blk !== BlockId.AIR && blk !== BlockId.WATER && blk !== BlockId.LAVA;
}

function isFullCubeOpaque(blk: number): boolean {
  return (
    isOpaque(blk) &&
    blk !== BlockId.CACTUS &&
    blk !== BlockId.STONE_WALL &&
    blk !== BlockId.WOOD_WALL &&
    blk !== BlockId.STONE_STAIRS &&
    blk !== BlockId.WOOD_STAIRS
  );
}

export interface ChunkMeshResult {
  opaqueGeometry: THREE.BufferGeometry | null;
  waterGeometry: THREE.BufferGeometry | null;
  lavaGeometry: THREE.BufferGeometry | null;
}

function finalizeGeometry(
  pos: number[],
  norm: number[],
  uv: number[],
  col: number[] | null,
  idx: number[]
): THREE.BufferGeometry | null {
  if (pos.length === 0) return null;
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geom.setAttribute('normal', new THREE.Float32BufferAttribute(norm, 3));
  geom.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  if (col) {
    geom.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  }
  geom.setIndex(idx);
  geom.computeBoundingSphere();
  return geom;
}

export function buildChunkGeometryFast(
  data: Uint8Array,
  neighbors: NeighborChunks
): ChunkMeshResult {
  const pos: number[] = [];
  const norm: number[] = [];
  const uv: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];

  const wPos: number[] = [];
  const wNorm: number[] = [];
  const wUv: number[] = [];
  const wIdx: number[] = [];

  const lPos: number[] = [];
  const lNorm: number[] = [];
  const lUv: number[] = [];
  const lIdx: number[] = [];

  const tileW = 1 / ATLAS_COLS;
  const tileH = 1 / ATLAS_ROWS;
  const padX = tileW * 0.015;
  const padY = tileH * 0.015;

  // Pre-scan highest non-air layer to skip upper empty air volume (~60% of chunk)
  let maxActiveY = 0;
  for (let y = WORLD_HEIGHT - 1; y >= 0; y--) {
    const base = y << 8;
    let found = false;
    for (let i = base; i < base + 256; i++) {
      if (data[i] !== BlockId.AIR) {
        found = true;
        break;
      }
    }
    if (found) {
      maxActiveY = y;
      break;
    }
  }

  // Fast direct-array neighbor lookup with zero heap allocations
  const getLocal = (lx: number, ly: number, lz: number): number => {
    if (ly < 0 || ly >= WORLD_HEIGHT) return BlockId.AIR;
    if (lx >= 0 && lx < 16) {
      if (lz >= 0 && lz < 16) {
        return data[(ly << 8) | (lz << 4) | lx];
      }
      if (lz < 0) {
        return neighbors.nz ? neighbors.nz[(ly << 8) | ((lz + 16) << 4) | lx] : BlockId.AIR;
      }
      return neighbors.pz ? neighbors.pz[(ly << 8) | ((lz - 16) << 4) | lx] : BlockId.AIR;
    }
    if (lx < 0) {
      const nzx = lx + 16;
      if (lz >= 0 && lz < 16) {
        return neighbors.nx ? neighbors.nx[(ly << 8) | (lz << 4) | nzx] : BlockId.AIR;
      }
      if (lz < 0) {
        return neighbors.nxnz ? neighbors.nxnz[(ly << 8) | ((lz + 16) << 4) | nzx] : BlockId.AIR;
      }
      return neighbors.nxpz ? neighbors.nxpz[(ly << 8) | ((lz - 16) << 4) | nzx] : BlockId.AIR;
    }
    const pzx = lx - 16;
    if (lz >= 0 && lz < 16) {
      return neighbors.px ? neighbors.px[(ly << 8) | (lz << 4) | pzx] : BlockId.AIR;
    }
    if (lz < 0) {
      return neighbors.pxnz ? neighbors.pxnz[(ly << 8) | ((lz + 16) << 4) | pzx] : BlockId.AIR;
    }
    return neighbors.pxpz ? neighbors.pxpz[(ly << 8) | ((lz - 16) << 4) | pzx] : BlockId.AIR;
  };

  for (let y = 0; y <= maxActiveY; y++) {
    const yBase = y << 8;
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      const zBase = yBase | (lz << 4);
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const blk = data[zBase | lx];
        if (blk === BlockId.AIR) continue;

        if (blk === BlockId.WATER) {
          const tile = getBlockFaceTile(blk, 'top');
          const tx = tile % ATLAS_COLS;
          const ty = (tile / ATLAS_COLS) | 0;
          const u0 = tx * tileW + padX;
          const u1 = (tx + 1) * tileW - padX;
          const v1 = 1 - ty * tileH - padY;
          const v0 = 1 - (ty + 1) * tileH + padY;

          const topAbove = y + 1 < WORLD_HEIGHT ? data[((y + 1) << 8) | (lz << 4) | lx] : BlockId.AIR;
          const topY = topAbove === BlockId.WATER ? y + 1 : y + 0.86;
          if (topAbove === BlockId.AIR) {
            const base = wPos.length / 3;
            wPos.push(
              lx, topY, lz + 1,
              lx + 1, topY, lz + 1,
              lx + 1, topY, lz,
              lx, topY, lz
            );
            wNorm.push(0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0);
            wUv.push(u0, v0, u1, v0, u1, v1, u0, v1);
            wIdx.push(base, base + 1, base + 2, base, base + 2, base + 3);
          }
          for (let f = 2; f < 6; f++) {
            const face = FACES[f];
            const neighbor = getLocal(lx + face.dir[0], y + face.dir[1], lz + face.dir[2]);
            if (neighbor !== BlockId.AIR) continue;
            const base = wPos.length / 3;
            for (let c = 0; c < 4; c++) {
              const corner = face.corners[c];
              const cy = corner[1] === 1 ? topY : y;
              wPos.push(lx + corner[0], cy, lz + corner[2]);
              wNorm.push(face.dir[0], face.dir[1], face.dir[2]);
              wUv.push(face.uvs[c][0] === 0 ? u0 : u1, face.uvs[c][1] === 0 ? v0 : v1);
            }
            wIdx.push(base, base + 1, base + 2, base, base + 2, base + 3);
          }
          continue;
        }

        if (blk === BlockId.LAVA) {
          const tile = getBlockFaceTile(blk, 'top');
          const tx = tile % ATLAS_COLS;
          const ty = (tile / ATLAS_COLS) | 0;
          const u0 = tx * tileW + padX;
          const u1 = (tx + 1) * tileW - padX;
          const v1 = 1 - ty * tileH - padY;
          const v0 = 1 - (ty + 1) * tileH + padY;

          const topAbove = y + 1 < WORLD_HEIGHT ? data[((y + 1) << 8) | (lz << 4) | lx] : BlockId.AIR;
          const topY = topAbove === BlockId.LAVA ? y + 1 : y + 0.88;
          if (topAbove !== BlockId.LAVA && !isOpaque(topAbove)) {
            const base = lPos.length / 3;
            lPos.push(
              lx, topY, lz + 1,
              lx + 1, topY, lz + 1,
              lx + 1, topY, lz,
              lx, topY, lz
            );
            lNorm.push(0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0);
            lUv.push(u0, v0, u1, v0, u1, v1, u0, v1);
            lIdx.push(base, base + 1, base + 2, base, base + 2, base + 3);
          }
          for (let f = 2; f < 6; f++) {
            const face = FACES[f];
            const neighbor = getLocal(lx + face.dir[0], y + face.dir[1], lz + face.dir[2]);
            if (neighbor === BlockId.LAVA || isOpaque(neighbor)) continue;
            const base = lPos.length / 3;
            for (let c = 0; c < 4; c++) {
              const corner = face.corners[c];
              const cy = corner[1] === 1 ? topY : y;
              lPos.push(lx + corner[0], cy, lz + corner[2]);
              lNorm.push(face.dir[0], face.dir[1], face.dir[2]);
              lUv.push(face.uvs[c][0] === 0 ? u0 : u1, face.uvs[c][1] === 0 ? v0 : v1);
            }
            lIdx.push(base, base + 1, base + 2, base, base + 2, base + 3);
          }
          continue;
        }

        const pushSubBox = (
          x0: number,
          x1: number,
          y0: number,
          y1: number,
          z0: number,
          z1: number
        ) => {
          for (let f = 0; f < 6; f++) {
            const face = FACES[f];
            const tile = getBlockFaceTile(blk, face.face);
            const tx = tile % ATLAS_COLS;
            const ty = (tile / ATLAS_COLS) | 0;
            const u0 = tx * tileW + padX;
            const u1 = (tx + 1) * tileW - padX;
            const v1 = 1 - ty * tileH - padY;
            const v0 = 1 - (ty + 1) * tileH + padY;

            const base = pos.length / 3;
            for (let c = 0; c < 4; c++) {
              const corner = face.corners[c];
              pos.push(
                lx + (corner[0] === 0 ? x0 : x1),
                y + (corner[1] === 0 ? y0 : y1),
                lz + (corner[2] === 0 ? z0 : z1)
              );
              norm.push(face.dir[0], face.dir[1], face.dir[2]);
              uv.push(face.uvs[c][0] === 0 ? u0 : u1, face.uvs[c][1] === 0 ? v0 : v1);
              col.push(face.shade, face.shade, face.shade);
            }
            idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
          }
        };

        if (blk === BlockId.STONE_WALL || blk === BlockId.WOOD_WALL) {
          const connNX = isOpaque(getLocal(lx - 1, y, lz));
          const connPX = isOpaque(getLocal(lx + 1, y, lz));
          const connNZ = isOpaque(getLocal(lx, y, lz - 1));
          const connPZ = isOpaque(getLocal(lx, y, lz + 1));
          pushSubBox(0.22, 0.78, 0, 1.0, 0.22, 0.78);
          if (connNX) pushSubBox(0, 0.22, 0, 0.88, 0.31, 0.69);
          if (connPX) pushSubBox(0.78, 1.0, 0, 0.88, 0.31, 0.69);
          if (connNZ) pushSubBox(0.31, 0.69, 0, 0.88, 0, 0.22);
          if (connPZ) pushSubBox(0.31, 0.69, 0, 0.88, 0.78, 1.0);
          continue;
        }

        if (blk === BlockId.STONE_STAIRS || blk === BlockId.WOOD_STAIRS) {
          pushSubBox(0, 1, 0, 0.5, 0, 1);
          pushSubBox(0, 1, 0.5, 1.0, 0, 0.5);
          continue;
        }

        if (blk === BlockId.CACTUS) {
          // Inset cylindrical-ribbed cactus trunk + protruding spine ridges
          pushSubBox(0.11, 0.89, 0, 1.0, 0.11, 0.89);
          pushSubBox(0.06, 0.94, 0.04, 0.96, 0.34, 0.66);
          pushSubBox(0.34, 0.66, 0.04, 0.96, 0.06, 0.94);
          // 3D spine nubs along ribs
          pushSubBox(0.02, 0.06, 0.24, 0.3, 0.47, 0.53);
          pushSubBox(0.94, 0.98, 0.64, 0.7, 0.47, 0.53);
          pushSubBox(0.47, 0.53, 0.44, 0.5, 0.02, 0.06);
          pushSubBox(0.47, 0.53, 0.78, 0.84, 0.94, 0.98);
          if (getLocal(lx, y + 1, lz) === BlockId.AIR) {
            pushSubBox(0.32, 0.68, 1.0, 1.09, 0.32, 0.68);
          }
          continue;
        }

        // Skip bottom face of y === 0 bedrock unless exposed to air
        const hasInsideNeighbors = lx > 0 && lx < 15 && lz > 0 && lz < 15 && y > 0 && y < WORLD_HEIGHT - 1;

        for (let f = 0; f < 6; f++) {
          const face = FACES[f];
          const nx = lx + face.dir[0];
          const ny = y + face.dir[1];
          const nz = lz + face.dir[2];

          const neighbor = hasInsideNeighbors
            ? data[(ny << 8) | (nz << 4) | nx]
            : getLocal(nx, ny, nz);
          if (isFullCubeOpaque(neighbor)) continue;

          const tile = getBlockFaceTile(blk, face.face);
          const tx = tile % ATLAS_COLS;
          const ty = (tile / ATLAS_COLS) | 0;
          const u0 = tx * tileW + padX;
          const u1 = (tx + 1) * tileW - padX;
          const v1 = 1 - ty * tileH - padY;
          const v0 = 1 - (ty + 1) * tileH + padY;

          const base = pos.length / 3;
          for (let c = 0; c < 4; c++) {
            const corner = face.corners[c];
            pos.push(lx + corner[0], y + corner[1], lz + corner[2]);
            norm.push(face.dir[0], face.dir[1], face.dir[2]);
            uv.push(face.uvs[c][0] === 0 ? u0 : u1, face.uvs[c][1] === 0 ? v0 : v1);

            let ao = 1.0;
            if (face.face === 'top') {
              const sx = corner[0] === 0 ? -1 : 1;
              const sz = corner[2] === 0 ? -1 : 1;
              let occ = 0;
              if (isFullCubeOpaque(getLocal(lx + sx, y + 1, lz))) occ++;
              if (isFullCubeOpaque(getLocal(lx, y + 1, lz + sz))) occ++;
              if (isFullCubeOpaque(getLocal(lx + sx, y + 1, lz + sz))) occ++;
              ao = 1.0 - occ * 0.17;
            }
            const cVal = face.shade * ao;
            col.push(cVal, cVal, cVal);
          }

          idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
        }
      }
    }
  }

  return {
    opaqueGeometry: finalizeGeometry(pos, norm, uv, col, idx),
    waterGeometry: finalizeGeometry(wPos, wNorm, wUv, null, wIdx),
    lavaGeometry: finalizeGeometry(lPos, lNorm, lUv, null, lIdx),
  };
}

export function buildChunkGeometry(cx: number, cz: number, getBlock: BlockGetter): ChunkMeshResult {
  const startX = cx * CHUNK_SIZE;
  const startZ = cz * CHUNK_SIZE;
  const data = new Uint8Array(CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE);
  for (let y = 0; y < WORLD_HEIGHT; y++) {
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        data[(y << 8) | (lz << 4) | lx] = getBlock(startX + lx, y, startZ + lz);
      }
    }
  }
  const makeNeighbor = (ox: number, oz: number): Uint8Array => {
    const arr = new Uint8Array(CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE);
    const sx = (cx + ox) * CHUNK_SIZE;
    const sz = (cz + oz) * CHUNK_SIZE;
    for (let y = 0; y < WORLD_HEIGHT; y++) {
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        for (let lx = 0; lx < CHUNK_SIZE; lx++) {
          arr[(y << 8) | (lz << 4) | lx] = getBlock(sx + lx, y, sz + lz);
        }
      }
    }
    return arr;
  };
  return buildChunkGeometryFast(data, {
    nx: makeNeighbor(-1, 0),
    px: makeNeighbor(1, 0),
    nz: makeNeighbor(0, -1),
    pz: makeNeighbor(0, 1),
    nxnz: makeNeighbor(-1, -1),
    pxnz: makeNeighbor(1, -1),
    nxpz: makeNeighbor(-1, 1),
    pxpz: makeNeighbor(1, 1),
  });
}
