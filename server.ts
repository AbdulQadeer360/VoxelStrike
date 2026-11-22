import crypto from 'crypto';
import dotenv from 'dotenv';
import express from 'express';
import fs from 'fs';
import http from 'http';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { WebSocket, WebSocketServer } from 'ws';
import { PersistenceManager } from './src/server/persistence.ts';
import {
  BLOCK_META,
  BlockId,
  CHUNK_SIZE,
  CLAN_WAR_MIN_MEMBERS,
  CLAN_WAR_WIN_COINS,
  CLAN_WAR_WIN_SCORE,
  CLAN_WAR_WIN_XP,
  CRAFT_RECIPES,
  CROUCH_EYE_HEIGHT,
  CROUCH_HEIGHT,
  CTF_CAPTURE_COINS,
  CTF_CAPTURE_POINTS,
  CTF_CAPTURE_XP,
  CTF_KILL_POINTS,
  CTF_WIN_SCORE,
  DUEL_DURATION_MS,
  DUEL_KILLS_TO_WIN,
  DUEL_LOSS_COINS,
  DUEL_LOSS_XP,
  DUEL_WIN_COINS,
  DUEL_WIN_XP,
  EYE_HEIGHT,
  GUN_SKINS,
  GUNS,
  ITEMS,
  MAX_PLAYERS,
  MAX_REACH,
  PLAYER_HEIGHT,
  PLAYER_WIDTH,
  RIFLE_MAG_SIZE,
  SHOP_ITEMS,
  SKINS,
  SPAWN_ZONES,
  SPRINT_SPEED,
  WORLD_HEIGHT,
  WORLD_MAX_X,
  WORLD_MAX_Z,
  WORLD_MIN_X,
  WORLD_MIN_Z,
  type BlockType,
  type GameModeId,
  type SpawnZone,
} from './src/shared/constants.ts';
import type {
  BlockModEntry,
  ChatMessage,
  ClanRecord,
  ClientWsMessage,
  FlagRuntimeState,
  ModeMatchState,
  PlayerPublicState,
  ServerWsMessage,
  TeamSide,
  WorldDropState,
} from './src/shared/protocol.ts';
import {
  CTF_FLAG_BASES,
  findSafeSpawnY,
  generateChunkDataForMode,
  getChunkKey,
  getModeBounds,
  getModeSpawn,
  isInsideModeWorld,
  localIndex,
  worldToChunk,
} from './src/shared/worldGen.ts';

dotenv.config();

const PORT = Number(process.env.PORT) || 3000;
const persistence = new PersistenceManager();

interface ConnectedPlayer {
  id: string;
  username: string;
  ip: string;
  ws: WebSocket;
  roomId: string;
  mode: GameModeId;
  team?: TeamSide;
  carryingFlag?: TeamSide;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  hp: number;
  maxHp: number;
  alive: boolean;
  sprinting: boolean;
  crouching: boolean;
  heldItemId: string;
  skinId: string;
  gunSkinId: string;
  clanTag?: string;
  clanName?: string;
  clanId?: string;
  isMod?: boolean;
  lastMoveAt: number;
  lastShotAt: number;
  lastActionAt: number;
  lastChatAt: number;
  chatHistory: Array<{ text: string; at: number }>;
  lastLavaTickAt: number;
  lastCactusTickAt: number;
  airTicks: number;
  peakAirY: number;
  cheatScore: number;
  zoneId: SpawnZone['id'];
}

interface ServerWorldDrop extends WorldDropState {
  spawnedAt: number;
}

interface GameRoom {
  id: string;
  mode: GameModeId;
  status: 'waiting' | 'active' | 'ended';
  redScore: number;
  blueScore: number;
  targetScore: number;
  redLabel: string;
  blueLabel: string;
  redClanId?: string;
  blueClanId?: string;
  endsAt?: number;
  winnerTeam?: TeamSide;
  winnerName?: string;
  flags?: {
    red: FlagRuntimeState;
    blue: FlagRuntimeState;
  };
  chunkCache: Map<string, Uint8Array>;
  mods: Record<string, Record<number, BlockType>>;
  drops: Map<string, ServerWorldDrop>;
  recentChat: ChatMessage[];
}

const activePlayers = new Map<string, ConnectedPlayer>();
const rooms = new Map<string, GameRoom>();
const adminTokens = new Map<string, { expiresAt: number; role: 'owner' | 'mod'; issuedByName: string }>();

function createInitialFlags(): { red: FlagRuntimeState; blue: FlagRuntimeState } {
  return {
    red: {
      team: 'red',
      state: 'base',
      x: CTF_FLAG_BASES.red.x,
      y: CTF_FLAG_BASES.red.y,
      z: CTF_FLAG_BASES.red.z,
      baseX: CTF_FLAG_BASES.red.x,
      baseY: CTF_FLAG_BASES.red.y,
      baseZ: CTF_FLAG_BASES.red.z,
    },
    blue: {
      team: 'blue',
      state: 'base',
      x: CTF_FLAG_BASES.blue.x,
      y: CTF_FLAG_BASES.blue.y,
      z: CTF_FLAG_BASES.blue.z,
      baseX: CTF_FLAG_BASES.blue.x,
      baseY: CTF_FLAG_BASES.blue.y,
      baseZ: CTF_FLAG_BASES.blue.z,
    },
  };
}

function createRoom(id: string, mode: GameModeId): GameRoom {
  const room: GameRoom = {
    id,
    mode,
    status: mode === 'survival' || mode === 'ctf' ? 'active' : 'waiting',
    redScore: 0,
    blueScore: 0,
    targetScore:
      mode === 'duel'
        ? DUEL_KILLS_TO_WIN
        : mode === 'ctf'
          ? CTF_WIN_SCORE
          : mode === 'clanwar'
            ? CLAN_WAR_WIN_SCORE
            : 0,
    redLabel: mode === 'ctf' ? 'Red Team' : 'Challenger',
    blueLabel: mode === 'ctf' ? 'Blue Team' : 'Opponent',
    flags: mode === 'ctf' ? createInitialFlags() : undefined,
    chunkCache: new Map(),
    mods: {},
    drops: new Map(),
    recentChat: [],
  };
  rooms.set(id, room);
  return room;
}

const survivalRoom = createRoom('world', 'survival');

function getOrCreateCtfRoom(): GameRoom {
  return rooms.get('ctf_main') || createRoom('ctf_main', 'ctf');
}

function getRoomPlayers(roomId: string): ConnectedPlayer[] {
  const list: ConnectedPlayer[] = [];
  for (const p of activePlayers.values()) {
    if (p.roomId === roomId) list.push(p);
  }
  return list;
}

function getClientIp(req: http.IncomingMessage): string {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length > 0) {
    return fwd.split(',')[0].trim();
  }
  return req.socket.remoteAddress || '127.0.0.1';
}

function sendWs(ws: WebSocket, msg: ServerWsMessage): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

function broadcastRoom(roomId: string, msg: ServerWsMessage, excludeId?: string): void {
  const raw = JSON.stringify(msg);
  for (const p of activePlayers.values()) {
    if (p.roomId !== roomId) continue;
    if (excludeId && p.id === excludeId) continue;
    if (p.ws.readyState === WebSocket.OPEN) {
      p.ws.send(raw);
    }
  }
}

function sanitizeUsername(name: unknown): string {
  if (typeof name !== 'string') return 'Explorer';
  const cleaned = name
    .replace(/[\r\n\t<>]/g, '')
    .replace(/[^\p{L}\p{N}_\-. ]/gu, '')
    .trim()
    .slice(0, 16);
  return cleaned.length >= 2 ? cleaned : `Miner${Math.floor(100 + Math.random() * 899)}`;
}

// ---- Room-Scoped Block & Physics Helpers ----
function getOrLoadRoomChunk(room: GameRoom, cx: number, cz: number): Uint8Array {
  if (room.mode === 'survival') {
    return persistence.getOrLoadChunk(cx, cz);
  }
  const key = getChunkKey(cx, cz);
  const cached = room.chunkCache.get(key);
  if (cached) return cached;

  const buf = generateChunkDataForMode(room.mode, cx, cz);
  const mods = room.mods[key];
  if (mods) {
    for (const [idxStr, blk] of Object.entries(mods)) {
      const idx = Number(idxStr);
      if (idx >= 0 && idx < buf.length) buf[idx] = blk;
    }
  }
  room.chunkCache.set(key, buf);
  return buf;
}

function getRoomBlock(room: GameRoom, wx: number, wy: number, wz: number): BlockType {
  if (room.mode === 'survival') {
    return persistence.getBlock(wx, wy, wz);
  }
  if (!isInsideModeWorld(room.mode, wx, wy, wz)) return BlockId.AIR;
  const { cx, cz, lx, lz } = worldToChunk(wx, wz);
  const chunk = getOrLoadRoomChunk(room, cx, cz);
  return chunk[localIndex(lx, wy, lz)] as BlockType;
}

function setRoomBlock(room: GameRoom, wx: number, wy: number, wz: number, blockId: BlockType): boolean {
  if (room.mode === 'survival') {
    return persistence.setBlock(wx, wy, wz, blockId);
  }
  if (!isInsideModeWorld(room.mode, wx, wy, wz) || wy <= 0) return false;
  const { cx, cz, lx, lz } = worldToChunk(wx, wz);
  const key = getChunkKey(cx, cz);
  const chunk = getOrLoadRoomChunk(room, cx, cz);
  const idx = localIndex(lx, wy, lz);
  chunk[idx] = blockId;
  if (!room.mods[key]) room.mods[key] = {};
  room.mods[key][idx] = blockId;
  return true;
}

function getRoomChunkDeltas(room: GameRoom, cx: number, cz: number): BlockModEntry[] {
  if (room.mode === 'survival') {
    return persistence.getChunkDeltas(cx, cz);
  }
  const key = getChunkKey(cx, cz);
  const mods = room.mods[key];
  if (!mods) return [];
  const result: BlockModEntry[] = [];
  const startX = cx * CHUNK_SIZE;
  const startZ = cz * CHUNK_SIZE;
  for (const [idxStr, blockId] of Object.entries(mods)) {
    const idx = Number(idxStr);
    const ly = Math.floor(idx / (CHUNK_SIZE * CHUNK_SIZE));
    const rem = idx % (CHUNK_SIZE * CHUNK_SIZE);
    const lz = Math.floor(rem / CHUNK_SIZE);
    const lx = rem % CHUNK_SIZE;
    if (ly >= 0 && ly < WORLD_HEIGHT) {
      result.push({ x: startX + lx, y: ly, z: startZ + lz, blockId });
    }
  }
  return result;
}

function getZoneSpawn(zoneId: SpawnZone['id']): { x: number; y: number; z: number } {
  const zone = SPAWN_ZONES.find((z) => z.id === zoneId) || SPAWN_ZONES[0];
  for (let attempt = 0; attempt < 24; attempt++) {
    const spread = 10 + attempt * 2;
    const jitterX = Math.floor(Math.random() * spread) - Math.floor(spread / 2);
    const jitterZ = Math.floor(Math.random() * spread) - Math.floor(spread / 2);
    const x = Math.max(WORLD_MIN_X + 10, Math.min(WORLD_MAX_X - 10, zone.x + jitterX));
    const z = Math.max(WORLD_MIN_Z + 10, Math.min(WORLD_MAX_Z - 10, zone.z + jitterZ));
    if (Math.abs(x) <= 2 && Math.abs(z) <= 2) continue;

    let y = findSafeSpawnY(x, z);
    while (
      y < 58 &&
      (persistence.getBlock(x, y, z) !== BlockId.AIR || persistence.getBlock(x, y + 1, z) !== BlockId.AIR)
    ) {
      y += 1;
    }
    const groundBlock = persistence.getBlock(x, y - 1, z);
    if (
      groundBlock !== BlockId.AIR &&
      groundBlock !== BlockId.WATER &&
      groundBlock !== BlockId.LAVA &&
      groundBlock !== BlockId.LEAVES &&
      groundBlock !== BlockId.CACTUS &&
      persistence.getBlock(x, y, z) === BlockId.AIR &&
      persistence.getBlock(x, y + 1, z) === BlockId.AIR
    ) {
      return { x: x + 0.5, y, z: z + 0.5 };
    }
  }
  const fallbackX = zone.id === 'citadel' ? 6 : zone.x;
  const fallbackZ = zone.id === 'citadel' ? 6 : zone.z;
  const fallbackY = findSafeSpawnY(fallbackX, fallbackZ);
  return { x: fallbackX + 0.5, y: fallbackY, z: fallbackZ + 0.5 };
}

function recordCheatAlert(
  player: ConnectedPlayer,
  type: 'speed' | 'teleport' | 'fly' | 'reach' | 'firerate' | 'occlusion',
  detail: string
): void {
  player.cheatScore += 1;
  persistence.addCheatAlert({
    id: crypto.randomUUID(),
    playerId: player.id,
    username: player.username,
    type,
    detail,
    timestamp: Date.now(),
  });
}

function hasGroundSupport(room: GameRoom, x: number, y: number, z: number): boolean {
  const half = PLAYER_WIDTH / 2 + 0.25;
  const checkY = Math.floor(y - 0.35);
  for (let dx = -1; dx <= 1; dx++) {
    for (let dz = -1; dz <= 1; dz++) {
      const bx = Math.floor(x + dx * half);
      const bz = Math.floor(z + dz * half);
      const b1 = getRoomBlock(room, bx, checkY, bz);
      const b2 = getRoomBlock(room, bx, Math.floor(y), bz);
      if (
        (b1 !== BlockId.AIR && b1 !== BlockId.WATER && b1 !== BlockId.LAVA) ||
        b2 === BlockId.WATER ||
        b1 === BlockId.WATER ||
        b2 === BlockId.LAVA ||
        b1 === BlockId.LAVA
      ) {
        return true;
      }
      const below2 = getRoomBlock(room, bx, checkY - 1, bz);
      if (below2 !== BlockId.AIR) return true;
    }
  }
  return false;
}

function isStandingOnSolidGround(room: GameRoom, x: number, y: number, z: number): boolean {
  const half = PLAYER_WIDTH / 2 + 0.06;
  const footY = Math.floor(y - 0.14);
  for (let dx = -1; dx <= 1; dx++) {
    for (let dz = -1; dz <= 1; dz++) {
      const bx = Math.floor(x + dx * half);
      const bz = Math.floor(z + dz * half);
      const b = getRoomBlock(room, bx, footY, bz);
      if (b !== BlockId.AIR && b !== BlockId.WATER && b !== BlockId.LAVA) {
        return true;
      }
    }
  }
  return false;
}

function isInWater(room: GameRoom, x: number, y: number, z: number): boolean {
  const bx = Math.floor(x);
  const bz = Math.floor(z);
  return (
    getRoomBlock(room, bx, Math.floor(y + 0.15), bz) === BlockId.WATER ||
    getRoomBlock(room, bx, Math.floor(y - 0.12), bz) === BlockId.WATER
  );
}

function isTouchingCactus(room: GameRoom, x: number, y: number, z: number): boolean {
  const half = PLAYER_WIDTH / 2 + 0.14;
  const minBx = Math.floor(x - half);
  const maxBx = Math.floor(x + half);
  const minBz = Math.floor(z - half);
  const maxBz = Math.floor(z + half);
  const minBy = Math.floor(y - 0.12);
  const maxBy = Math.floor(y + PLAYER_HEIGHT - 0.05);
  for (let by = minBy; by <= maxBy; by++) {
    for (let bz = minBz; bz <= maxBz; bz++) {
      for (let bx = minBx; bx <= maxBx; bx++) {
        if (getRoomBlock(room, bx, by, bz) === BlockId.CACTUS) {
          return true;
        }
      }
    }
  }
  return false;
}

function collectNearbyDropsForPlayer(room: GameRoom, p: ConnectedPlayer, now: number): void {
  if (!p.alive || room.drops.size === 0) return;
  const prof = persistence.getProfile(p.id);
  if (!prof) return;
  let collectedAny = false;
  for (const [id, drop] of room.drops.entries()) {
    if (now - drop.spawnedAt < 220) continue;
    const dist = Math.hypot(drop.x - p.x, (drop.y - (p.y + 0.8)) * 0.65, drop.z - p.z);
    if (dist <= 2.15) {
      persistence.addItem(prof, drop.itemId, drop.count);
      room.drops.delete(id);
      collectedAny = true;
      broadcastRoom(room.id, { type: 'drop:remove', id, byPlayerId: p.id });
    }
  }
  if (collectedAny) {
    sendWs(p.ws, { type: 'inventory:sync', profile: prof });
  }
}

function raycastRoomWorld(
  room: GameRoom,
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  maxDist: number
): { hitBlock: boolean; dist: number } {
  const step = 0.12;
  for (let d = 0.12; d <= maxDist; d += step) {
    const px = Math.floor(ox + dx * d);
    const py = Math.floor(oy + dy * d);
    const pz = Math.floor(oz + dz * d);
    const blk = getRoomBlock(room, px, py, pz);
    if (blk !== BlockId.AIR && blk !== BlockId.WATER && blk !== BlockId.LAVA) {
      return { hitBlock: true, dist: d };
    }
  }
  return { hitBlock: false, dist: maxDist };
}

function rayIntersectPlayer(
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  target: ConnectedPlayer,
  maxDist: number
): number | null {
  const halfW = PLAYER_WIDTH * 0.65;
  const minX = target.x - halfW;
  const maxX = target.x + halfW;
  const minY = target.y;
  const maxY = target.y + (target.crouching ? CROUCH_HEIGHT : PLAYER_HEIGHT);
  const minZ = target.z - halfW;
  const maxZ = target.z + halfW;

  let tmin = 0;
  let tmax = maxDist;

  const axes: Array<[number, number, number, number]> = [
    [ox, dx, minX, maxX],
    [oy, dy, minY, maxY],
    [oz, dz, minZ, maxZ],
  ];

  for (const [o, dir, bmin, bmax] of axes) {
    if (Math.abs(dir) < 1e-8) {
      if (o < bmin || o > bmax) return null;
    } else {
      let t1 = (bmin - o) / dir;
      let t2 = (bmax - o) / dir;
      if (t1 > t2) {
        const tmp = t1;
        t1 = t2;
        t2 = tmp;
      }
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return null;
    }
  }
  return tmin >= 0 && tmin <= maxDist ? tmin : null;
}

function buildPublicPlayers(roomId: string): PlayerPublicState[] {
  const list: PlayerPublicState[] = [];
  for (const p of activePlayers.values()) {
    if (p.roomId !== roomId) continue;
    const prof = persistence.getProfile(p.id);
    const muted = Boolean(persistence.isPlayerMuted(p.id, p.username));
    list.push({
      id: p.id,
      username: p.username,
      x: p.x,
      y: p.y,
      z: p.z,
      yaw: p.yaw,
      pitch: p.pitch,
      hp: p.hp,
      maxHp: p.maxHp,
      alive: p.alive,
      sprinting: p.sprinting,
      crouching: p.crouching,
      heldItemId: p.heldItemId,
      skinId: p.skinId,
      gunSkinId: p.gunSkinId,
      clanTag: prof?.clanTag,
      clanName: prof?.clanName,
      isMod: Boolean(prof?.isMod),
      team: p.team,
      carryingFlag: p.carryingFlag,
      level: prof?.level ?? 1,
      kills: prof?.kills ?? 0,
      deaths: prof?.deaths ?? 0,
      blocksMined: prof?.blocksMined ?? 0,
      muted,
    });
  }
  return list;
}

function formatClanDisplay(username: string, clanName?: string): string {
  return clanName ? `${username} (${clanName})` : username;
}

function pushRoomSystemChat(roomId: string, text: string): void {
  const room = rooms.get(roomId);
  if (!room) return;
  const msg: ChatMessage = {
    id: crypto.randomUUID(),
    playerId: 'system',
    username: 'Server',
    text,
    timestamp: Date.now(),
    system: true,
  };
  room.recentChat.push(msg);
  if (room.recentChat.length > 40) room.recentChat.shift();
  broadcastRoom(roomId, { type: 'chat:message', message: msg });
}

function pushGlobalSystemChat(text: string): void {
  pushRoomSystemChat('world', text);
}

// ---- Match State Builders & Mode Flow ----
function buildModeStateForPlayer(room: GameRoom, player: ConnectedPlayer, extras?: {
  didWin?: boolean;
  xpAwarded?: number;
  coinsAwarded?: number;
}): ModeMatchState | undefined {
  if (room.mode === 'survival') return undefined;
  let waitingText: string | undefined;
  if (room.status === 'waiting') {
    waitingText =
      room.mode === 'duel'
        ? 'Waiting for 2nd player to join 1v1 combat...'
        : `Waiting for ${room.blueLabel} warriors to enter Clan War...`;
  }
  return {
    mode: room.mode,
    roomId: room.id,
    status: room.status,
    selfTeam: player.team,
    redLabel: room.redLabel,
    blueLabel: room.blueLabel,
    redScore: room.redScore,
    blueScore: room.blueScore,
    targetScore: room.targetScore,
    endsAt: room.endsAt,
    waitingText,
    winnerTeam: room.winnerTeam,
    winnerName: room.winnerName,
    didWin: extras?.didWin,
    xpAwarded: extras?.xpAwarded,
    coinsAwarded: extras?.coinsAwarded,
    flags: room.flags
      ? {
          red: { ...room.flags.red },
          blue: { ...room.flags.blue },
        }
      : undefined,
  };
}

function syncRoomModeState(room: GameRoom): void {
  if (room.mode === 'survival') return;
  for (const p of getRoomPlayers(room.id)) {
    const st = buildModeStateForPlayer(room, p);
    if (st) sendWs(p.ws, { type: 'mode:state', state: st });
  }
}

function updateFlagCarrierPositions(room: GameRoom): void {
  if (room.mode !== 'ctf' || !room.flags) return;
  for (const side of ['red', 'blue'] as const) {
    const f = room.flags[side];
    if (f.state === 'carried' && f.carrierId) {
      const carrier = activePlayers.get(f.carrierId);
      if (carrier && carrier.roomId === room.id && carrier.alive) {
        f.x = carrier.x;
        f.y = carrier.y;
        f.z = carrier.z;
      }
    }
  }
}

function restoreCarriedFlag(room: GameRoom, victim: ConnectedPlayer, restorerName?: string): void {
  if (room.mode !== 'ctf' || !room.flags || !victim.carryingFlag) return;
  const flagTeam = victim.carryingFlag;
  const flag = room.flags[flagTeam];
  victim.carryingFlag = undefined;
  flag.state = 'base';
  flag.x = flag.baseX;
  flag.y = flag.baseY;
  flag.z = flag.baseZ;
  flag.carrierId = undefined;
  flag.carrierName = undefined;

  const teamLabel = flagTeam === 'red' ? 'Red' : 'Blue';
  const bannerText = restorerName
    ? `${restorerName} restored ${teamLabel} Flag!`
    : `${teamLabel} Flag restored to base!`;
  broadcastRoom(room.id, {
    type: 'mode:banner',
    text: bannerText,
    tone: flagTeam,
  });
  pushRoomSystemChat(room.id, bannerText);
  syncRoomModeState(room);
}

function checkCtfFlagInteractions(room: GameRoom, p: ConnectedPlayer): void {
  if (room.mode !== 'ctf' || !room.flags || !p.alive || !p.team) return;
  const enemyTeam: TeamSide = p.team === 'red' ? 'blue' : 'red';
  const ownTeam: TeamSide = p.team;
  const enemyFlag = room.flags[enemyTeam];
  const ownBase = CTF_FLAG_BASES[ownTeam];

  // 1. Pick up enemy flag if at enemy base and not already carrying
  if (!p.carryingFlag && enemyFlag.state === 'base') {
    const distToEnemy = Math.hypot(p.x - enemyFlag.baseX, p.z - enemyFlag.baseZ);
    if (distToEnemy <= 2.35 && Math.abs(p.y - enemyFlag.baseY) <= 3.5) {
      enemyFlag.state = 'carried';
      enemyFlag.carrierId = p.id;
      enemyFlag.carrierName = p.username;
      enemyFlag.x = p.x;
      enemyFlag.y = p.y;
      enemyFlag.z = p.z;
      p.carryingFlag = enemyTeam;
      const teamLabel = enemyTeam === 'red' ? 'Red' : 'Blue';
      const text = `${p.username} picked ${teamLabel} Flag!`;
      broadcastRoom(room.id, { type: 'mode:banner', text, tone: enemyTeam });
      pushRoomSystemChat(room.id, text);
      syncRoomModeState(room);
      return;
    }
  }

  // 2. Capture carried enemy flag upon returning to own base flag stand
  if (p.carryingFlag === enemyTeam) {
    const distToHome = Math.hypot(p.x - ownBase.x, p.z - ownBase.z);
    if (distToHome <= 2.6 && Math.abs(p.y - ownBase.y) <= 3.5) {
      if (ownTeam === 'red') room.redScore += CTF_CAPTURE_POINTS;
      else room.blueScore += CTF_CAPTURE_POINTS;

      const prof = persistence.getProfile(p.id);
      if (prof) {
        persistence.addXpAndCoins(prof, CTF_CAPTURE_XP, CTF_CAPTURE_COINS);
        sendWs(p.ws, { type: 'inventory:sync', profile: prof });
      }

      p.carryingFlag = undefined;
      enemyFlag.state = 'base';
      enemyFlag.x = enemyFlag.baseX;
      enemyFlag.y = enemyFlag.baseY;
      enemyFlag.z = enemyFlag.baseZ;
      enemyFlag.carrierId = undefined;
      enemyFlag.carrierName = undefined;

      const capturedLabel = enemyTeam === 'red' ? 'Red' : 'Blue';
      const text = `${p.username} captured ${capturedLabel} Flag! (+${CTF_CAPTURE_POINTS} pts)`;
      broadcastRoom(room.id, { type: 'mode:banner', text, tone: 'gold' });
      pushRoomSystemChat(room.id, text);

      if (room.redScore >= CTF_WIN_SCORE || room.blueScore >= CTF_WIN_SCORE) {
        const winSide: TeamSide = room.redScore >= CTF_WIN_SCORE ? 'red' : 'blue';
        const winTitle = winSide === 'red' ? 'RED TEAM WINS ROUND!' : 'BLUE TEAM WINS ROUND!';
        broadcastRoom(room.id, { type: 'mode:banner', text: winTitle, tone: winSide });
        pushRoomSystemChat(room.id, `${winTitle} (+100 XP bonus to winners). Scores reset for next round.`);
        for (const rp of getRoomPlayers(room.id)) {
          if (rp.team === winSide) {
            const wProf = persistence.getProfile(rp.id);
            if (wProf) {
              persistence.addXpAndCoins(wProf, 100, 40);
              sendWs(rp.ws, { type: 'inventory:sync', profile: wProf });
            }
          }
        }
        room.redScore = 0;
        room.blueScore = 0;
        room.flags = createInitialFlags();
        for (const rp of getRoomPlayers(room.id)) {
          rp.carryingFlag = undefined;
        }
      }
      syncRoomModeState(room);
    }
  }
}

function finishMatch(
  room: GameRoom,
  winnerSide: TeamSide,
  winnerName: string,
  reasonText?: string
): void {
  if (room.status === 'ended') return;
  room.status = 'ended';
  room.winnerTeam = winnerSide;
  room.winnerName = winnerName;
  room.endsAt = undefined;

  const isDuel = room.mode === 'duel';
  const winXp = isDuel ? DUEL_WIN_XP : CLAN_WAR_WIN_XP;
  const winCoins = isDuel ? DUEL_WIN_COINS : CLAN_WAR_WIN_COINS;
  const lossXp = isDuel ? DUEL_LOSS_XP : 40;
  const lossCoins = isDuel ? DUEL_LOSS_COINS : 15;

  if (room.mode === 'clanwar') {
    const redWon = winnerSide === 'red';
    persistence.recordClanWarResult(room.redClanId, redWon, room.redScore);
    persistence.recordClanWarResult(room.blueClanId, !redWon, room.blueScore);
  }

  for (const rp of getRoomPlayers(room.id)) {
    const didWin = rp.team === winnerSide;
    const xpAwarded = didWin ? winXp : lossXp;
    const coinsAwarded = didWin ? winCoins : lossCoins;
    const prof = persistence.getProfile(rp.id);
    if (prof) {
      persistence.addXpAndCoins(prof, xpAwarded, coinsAwarded);
      sendWs(rp.ws, { type: 'inventory:sync', profile: prof });
    }
    const st = buildModeStateForPlayer(room, rp, { didWin, xpAwarded, coinsAwarded });
    if (st) sendWs(rp.ws, { type: 'mode:state', state: st });
  }

  if (reasonText) {
    broadcastRoom(room.id, { type: 'mode:banner', text: reasonText, tone: 'gold' });
    pushRoomSystemChat(room.id, reasonText);
  }
}

function evaluateClanWarEligibility(playerId: string): {
  eligible: boolean;
  errorCode?: 'NO_CLAN' | 'NO_BIG_CLAN' | 'NO_BIG_RIVAL';
  message?: string;
  playerClan?: ClanRecord;
  bigRivalClans: ClanRecord[];
} {
  const prof = persistence.getProfile(playerId);
  const clans = persistence.listClans();
  const playerClan = prof?.clanId ? clans.find((c) => c.id === prof.clanId) : undefined;
  if (!playerClan) {
    return {
      eligible: false,
      errorCode: 'NO_CLAN',
      message: 'No clan found! Create or join a clan first.',
      bigRivalClans: [],
    };
  }
  if (playerClan.memberIds.length < CLAN_WAR_MIN_MEMBERS) {
    return {
      eligible: false,
      errorCode: 'NO_BIG_CLAN',
      message: `No big clan found! Your clan [${playerClan.tag}] needs at least ${CLAN_WAR_MIN_MEMBERS} members.`,
      playerClan,
      bigRivalClans: [],
    };
  }
  const bigRivalClans = clans.filter(
    (c) => c.id !== playerClan.id && c.memberIds.length >= CLAN_WAR_MIN_MEMBERS
  );
  if (bigRivalClans.length === 0) {
    return {
      eligible: false,
      errorCode: 'NO_BIG_RIVAL',
      message: `No big rival clan found! Another clan with ${CLAN_WAR_MIN_MEMBERS}+ members is required.`,
      playerClan,
      bigRivalClans: [],
    };
  }
  return { eligible: true, playerClan, bigRivalClans };
}

function findOrCreateDuelRoom(): GameRoom {
  for (const r of rooms.values()) {
    if (r.mode === 'duel' && r.status === 'waiting' && getRoomPlayers(r.id).length < 2) {
      return r;
    }
  }
  return createRoom(`duel_${crypto.randomBytes(4).toString('hex')}`, 'duel');
}

function findOrCreateClanWarRoom(myClan: ClanRecord, rivalClan: ClanRecord): { room: GameRoom; team: TeamSide } {
  // Check if a waiting or active room already exists between these two clans
  for (const r of rooms.values()) {
    if (r.mode !== 'clanwar' || r.status === 'ended') continue;
    if (r.redClanId === myClan.id && r.blueClanId === rivalClan.id) {
      return { room: r, team: 'red' };
    }
    if (r.redClanId === rivalClan.id && r.blueClanId === myClan.id) {
      return { room: r, team: 'blue' };
    }
  }
  const room = createRoom(`clanwar_${crypto.randomBytes(4).toString('hex')}`, 'clanwar');
  room.redClanId = myClan.id;
  room.blueClanId = rivalClan.id;
  room.redLabel = `[${myClan.tag}] ${myClan.name}`;
  room.blueLabel = `[${rivalClan.tag}] ${rivalClan.name}`;
  room.status = 'waiting';
  return { room, team: 'red' };
}

function resetPlayerForCombatSpawn(p: ConnectedPlayer, spawn: { x: number; y: number; z: number }): void {
  p.x = spawn.x;
  p.y = spawn.y;
  p.z = spawn.z;
  p.hp = 100;
  p.maxHp = 100;
  p.alive = true;
  p.crouching = false;
  p.carryingFlag = undefined;
  p.airTicks = 0;
  p.peakAirY = spawn.y;
  p.lastMoveAt = Date.now();
  const prof = persistence.getProfile(p.id);
  if (prof) {
    for (const gid of Object.keys(GUNS)) {
      prof.gunMags[gid] = GUNS[gid].magSize;
    }
    const equipped = p.heldItemId && GUNS[p.heldItemId] ? p.heldItemId : prof.hotbarSlots[0] || 'rifle';
    prof.ammoInMag = prof.gunMags[equipped] ?? RIFLE_MAG_SIZE;
    sendWs(p.ws, {
      type: 'player:respawned',
      x: p.x,
      y: p.y,
      z: p.z,
      hp: p.hp,
      ammoInMag: prof.ammoInMag,
    });
    sendWs(p.ws, { type: 'inventory:sync', profile: prof });
  }
}

function handleModeKillScoring(
  room: GameRoom,
  killer: ConnectedPlayer | null,
  victim: ConnectedPlayer
): void {
  if (room.mode === 'survival') return;

  if (room.mode === 'ctf') {
    if (victim.carryingFlag) {
      restoreCarriedFlag(room, victim, killer?.username);
    }
    if (killer && killer.team && killer.team !== victim.team) {
      if (killer.team === 'red') room.redScore += CTF_KILL_POINTS;
      else room.blueScore += CTF_KILL_POINTS;
      syncRoomModeState(room);
    }
    return;
  }

  if (room.mode === 'duel' && room.status === 'active') {
    const winSide: TeamSide = killer?.team || (victim.team === 'red' ? 'blue' : 'red');
    if (winSide === 'red') room.redScore += 1;
    else room.blueScore += 1;
    const survivor =
      killer ||
      getRoomPlayers(room.id).find((rp) => rp.id !== victim.id) ||
      victim;
    finishMatch(room, winSide, survivor.username, `${survivor.username} won the 1v1 combat!`);
    return;
  }

  if (room.mode === 'clanwar' && killer && killer.team && killer.team !== victim.team) {
    if (killer.team === 'red') room.redScore += 1;
    else room.blueScore += 1;
    syncRoomModeState(room);
    if (room.redScore >= room.targetScore) {
      finishMatch(room, 'red', room.redLabel, `${room.redLabel} conquered the Clan War!`);
    } else if (room.blueScore >= room.targetScore) {
      finishMatch(room, 'blue', room.blueLabel, `${room.blueLabel} conquered the Clan War!`);
    }
  }
}

function requireAdmin(req: express.Request, res: express.Response, next: express.NextFunction): void {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const token = auth.slice(7);
  const session = adminTokens.get(token);
  if (!session || session.expiresAt < Date.now()) {
    adminTokens.delete(token);
    res.status(401).json({ error: 'Session expired' });
    return;
  }
  (req as express.Request & { modSession?: { role: 'owner' | 'mod'; issuedByName: string } }).modSession = {
    role: session.role,
    issuedByName: session.issuedByName,
  };
  next();
}

async function startServer(): Promise<void> {
  const app = express();
  app.set('trust proxy', true);
  app.use(express.json({ limit: '64kb' }));

  // ---- REST APIs ----
  app.get('/api/server/info', (_req, res) => {
    let duelWaiting = 0;
    for (const r of rooms.values()) {
      if (r.mode === 'duel' && r.status === 'waiting') {
        duelWaiting += getRoomPlayers(r.id).length;
      }
    }
    res.json({
      onlineCount: activePlayers.size,
      maxPlayers: MAX_PLAYERS,
      worldSize: '1500 × 600',
      duelWaiting,
    });
  });

  app.get('/api/duel/status', (_req, res) => {
    let waitingCount = 0;
    let activeRooms = 0;
    for (const r of rooms.values()) {
      if (r.mode !== 'duel') continue;
      if (r.status === 'waiting') waitingCount += getRoomPlayers(r.id).length;
      else if (r.status === 'active') activeRooms += 1;
    }
    res.json({ waitingCount, activeRooms });
  });

  app.get('/api/clanwar/status', (req, res) => {
    const playerId = typeof req.query.playerId === 'string' ? req.query.playerId.slice(0, 64) : '';
    const evalResult = evaluateClanWarEligibility(playerId);
    const activeChallenges: Array<{ roomId: string; redClanId?: string; blueClanId?: string; redLabel: string; blueLabel: string }> = [];
    for (const r of rooms.values()) {
      if (r.mode === 'clanwar' && r.status !== 'ended') {
        activeChallenges.push({
          roomId: r.id,
          redClanId: r.redClanId,
          blueClanId: r.blueClanId,
          redLabel: r.redLabel,
          blueLabel: r.blueLabel,
        });
      }
    }
    res.json({ ...evalResult, activeChallenges });
  });

  app.get('/api/profile/:playerId', (req, res) => {
    const rawPid = String(req.params.playerId || '').trim().slice(0, 64);
    const playerId = rawPid || `tv_${crypto.randomBytes(6).toString('hex')}`;
    const rawSavedName = typeof req.query.username === 'string' ? req.query.username : '';
    const requestedName = rawSavedName.trim().length >= 2 ? sanitizeUsername(rawSavedName) : 'Explorer';
    const headerSecret = typeof req.headers['x-player-secret'] === 'string' ? req.headers['x-player-secret'] : undefined;

    const existing = persistence.getProfile(playerId);
    if (existing && headerSecret && !persistence.bindOrVerifyPlayerSecret(playerId, headerSecret)) {
      res.status(403).json({ error: 'Invalid player session token' });
      return;
    }
    const profile = persistence.getOrCreateProfile(
      playerId,
      existing ? (existing.username === 'Explorer' && requestedName !== 'Explorer' ? requestedName : '') : requestedName
    );
    if (headerSecret) {
      persistence.bindOrVerifyPlayerSecret(playerId, headerSecret);
    }
    res.json({ profile });
  });

  app.post('/api/profile/username', (req, res) => {
    const rawPid = typeof req.body?.playerId === 'string' ? req.body.playerId.trim().slice(0, 64) : '';
    const playerId = rawPid || `tv_${crypto.randomBytes(6).toString('hex')}`;
    const rawUsername = typeof req.body?.username === 'string' ? req.body.username.trim() : '';
    if (rawUsername.length < 2) {
      res.status(400).json({ error: 'Username must be at least 2 characters.' });
      return;
    }
    const username = sanitizeUsername(rawUsername);
    const playerSecret = typeof req.body?.playerSecret === 'string' ? req.body.playerSecret : undefined;

    if (playerSecret && !persistence.bindOrVerifyPlayerSecret(playerId, playerSecret)) {
      res.status(403).json({ error: 'Session verification failed' });
      return;
    }
    const profile = persistence.getOrCreateProfile(playerId, username);
    profile.username = username;
    persistence.markPlayersDirty();
    const online = activePlayers.get(playerId);
    if (online) online.username = username;
    res.json({ profile });
  });

  app.post('/api/shop/buy', (req, res) => {
    const playerId = typeof req.body?.playerId === 'string' ? req.body.playerId.slice(0, 64) : '';
    const itemId = typeof req.body?.itemId === 'string' ? req.body.itemId : '';
    const profile = persistence.getProfile(playerId);
    const shopItem = SHOP_ITEMS.find((s) => s.id === itemId);
    if (!profile || !shopItem) {
      res.status(400).json({ error: 'Invalid purchase request' });
      return;
    }
    if (profile.coins < shopItem.price) {
      res.status(400).json({ error: 'Not enough coins' });
      return;
    }
    if (itemId === 'upgrade_pickaxe') {
      if (profile.pickaxeTier >= 3) {
        res.status(400).json({ error: 'Pickaxe already maxed' });
        return;
      }
      profile.coins -= shopItem.price;
      profile.pickaxeTier += 1;
    } else if (itemId === 'upgrade_rifle') {
      if (profile.rifleDamageBonus >= 12) {
        res.status(400).json({ error: 'Rifle barrel already maxed' });
        return;
      }
      profile.coins -= shopItem.price;
      profile.rifleDamageBonus += 4;
    } else if (itemId === 'supply_ammo') {
      profile.coins -= shopItem.price;
      persistence.addItem(profile, 'ammo', 90);
    } else if (itemId === 'supply_medkit') {
      profile.coins -= shopItem.price;
      persistence.addItem(profile, 'medkit', 3);
    } else if (itemId === 'supply_brick') {
      profile.coins -= shopItem.price;
      persistence.addItem(profile, 'brick', 40);
    } else if (itemId === 'supply_planks') {
      profile.coins -= shopItem.price;
      persistence.addItem(profile, 'planks', 40);
    }
    persistence.markPlayersDirty();
    const online = activePlayers.get(playerId);
    if (online) sendWs(online.ws, { type: 'inventory:sync', profile });
    res.json({ profile });
  });

  app.post('/api/skins/action', (req, res) => {
    const playerId = typeof req.body?.playerId === 'string' ? req.body.playerId.slice(0, 64) : '';
    const skinId = typeof req.body?.skinId === 'string' ? req.body.skinId : '';
    const profile = persistence.getProfile(playerId);
    const skin = SKINS.find((s) => s.id === skinId);
    if (!profile || !skin) {
      res.status(400).json({ error: 'Invalid skin' });
      return;
    }
    if (!profile.unlockedSkins.includes(skinId)) {
      if (profile.coins < skin.price) {
        res.status(400).json({ error: 'Not enough coins to unlock skin' });
        return;
      }
      profile.coins -= skin.price;
      profile.unlockedSkins.push(skinId);
    }
    profile.skinId = skinId;
    persistence.markPlayersDirty();
    const online = activePlayers.get(playerId);
    if (online) {
      online.skinId = skinId;
      sendWs(online.ws, { type: 'inventory:sync', profile });
    }
    res.json({ profile });
  });

  app.post('/api/gun-skins/action', (req, res) => {
    const playerId = typeof req.body?.playerId === 'string' ? req.body.playerId.slice(0, 64) : '';
    const gunSkinId = typeof req.body?.gunSkinId === 'string' ? req.body.gunSkinId : '';
    const profile = persistence.getProfile(playerId);
    const gunSkin = GUN_SKINS.find((s) => s.id === gunSkinId);
    if (!profile || !gunSkin) {
      res.status(400).json({ error: 'Invalid gun skin' });
      return;
    }
    if (!profile.unlockedGunSkins.includes(gunSkinId)) {
      if (profile.coins < gunSkin.price) {
        res.status(400).json({ error: 'Not enough coins to unlock gun skin' });
        return;
      }
      profile.coins -= gunSkin.price;
      profile.unlockedGunSkins.push(gunSkinId);
    }
    profile.gunSkinId = gunSkinId;
    persistence.markPlayersDirty();
    const online = activePlayers.get(playerId);
    if (online) {
      online.gunSkinId = gunSkinId;
      sendWs(online.ws, { type: 'inventory:sync', profile });
    }
    res.json({ profile });
  });

  app.post('/api/guns/action', (req, res) => {
    const playerId = typeof req.body?.playerId === 'string' ? req.body.playerId.slice(0, 64) : '';
    const gunId = typeof req.body?.gunId === 'string' ? req.body.gunId : '';
    const profile = persistence.getProfile(playerId);
    const gun = GUNS[gunId];
    if (!profile || !gun) {
      res.status(400).json({ error: 'Invalid gun selection' });
      return;
    }
    if (!profile.unlockedGuns.includes(gunId)) {
      if (profile.level < gun.unlockLevel) {
        res.status(400).json({ error: `Reach Level ${gun.unlockLevel} to unlock ${gun.name}` });
        return;
      }
      if (profile.coins < gun.price) {
        res.status(400).json({ error: `Need ${gun.price} coins to unlock ${gun.name}` });
        return;
      }
      profile.coins -= gun.price;
      profile.unlockedGuns.push(gunId);
      profile.gunMags[gunId] = gun.magSize;
    }
    if (persistence.getItemCount(profile, gunId) === 0) {
      persistence.addItem(profile, gunId, 1);
    }
    const existingTail = Array.from({ length: 7 }, (_, i) => profile.hotbarSlots[i + 2] || '');
    profile.hotbarSlots = [gunId, 'pickaxe', ...existingTail];
    persistence.compactHotbar(profile);
    profile.ammoInMag = profile.gunMags[gunId] ?? gun.magSize;
    persistence.markPlayersDirty();
    const online = activePlayers.get(playerId);
    if (online) {
      online.heldItemId = gunId;
      sendWs(online.ws, { type: 'inventory:sync', profile });
    }
    res.json({ profile });
  });

  app.get('/api/clans', (_req, res) => {
    res.json({ clans: persistence.listClans() });
  });

  app.post('/api/clans/create', (req, res) => {
    const playerId = typeof req.body?.playerId === 'string' ? req.body.playerId.slice(0, 64) : '';
    const name = typeof req.body?.name === 'string' ? req.body.name : '';
    const tag = typeof req.body?.tag === 'string' ? req.body.tag : '';
    const description = typeof req.body?.description === 'string' ? req.body.description : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!playerId) {
      res.status(400).json({ error: 'Missing playerId' });
      return;
    }
    const result = persistence.createClan(playerId, name, tag, description, password);
    if (!result.ok) {
      res.status(400).json({ error: result.error });
      return;
    }
    const online = activePlayers.get(playerId);
    if (online) {
      online.clanId = result.clan.id;
      online.clanTag = result.clan.tag;
      online.clanName = result.clan.name;
      sendWs(online.ws, { type: 'inventory:sync', profile: result.profile });
    }
    res.json({ clan: result.clan, profile: result.profile, clans: persistence.listClans() });
  });

  app.post('/api/clans/manage', (req, res) => {
    const playerId = typeof req.body?.playerId === 'string' ? req.body.playerId.slice(0, 64) : '';
    const playerSecret = typeof req.body?.playerSecret === 'string' ? req.body.playerSecret : undefined;
    const rawIdentifier =
      req.body?.clanIdentifier ?? req.body?.identifier ?? req.body?.clanId ?? '';
    const clanIdentifier = typeof rawIdentifier === 'string' ? rawIdentifier : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const action = typeof req.body?.action === 'string' ? req.body.action : 'verify';
    const description = typeof req.body?.description === 'string' ? req.body.description : undefined;
    const rawTargetMember = req.body?.targetMemberId ?? req.body?.targetPlayerId;
    const targetMemberId = typeof rawTargetMember === 'string' ? rawTargetMember : undefined;
    const newPassword = typeof req.body?.newPassword === 'string' ? req.body.newPassword : undefined;

    if (!playerId || !clanIdentifier || !password) {
      res.status(400).json({ error: 'Clan name/tag and password are required.' });
      return;
    }
    if (playerSecret && !persistence.bindOrVerifyPlayerSecret(playerId, playerSecret)) {
      res.status(403).json({ error: 'Player session verification failed.' });
      return;
    }
    const allowedActions = ['verify', 'claim_leader', 'update_desc', 'kick_member', 'change_password', 'disband'] as const;
    if (!allowedActions.includes(action as (typeof allowedActions)[number])) {
      res.status(400).json({ error: 'Invalid clan management action.' });
      return;
    }

    const result = persistence.manageClanWithPassword({
      playerId,
      clanIdentifier,
      password,
      action: action as (typeof allowedActions)[number],
      description,
      targetMemberId,
      newPassword,
    });
    if (!result.ok) {
      res.status(403).json({ error: result.error });
      return;
    }

    if (result.profile) {
      const online = activePlayers.get(result.profile.playerId);
      if (online) {
        online.clanId = result.profile.clanId;
        online.clanTag = result.profile.clanTag;
        online.clanName = result.profile.clanName;
        sendWs(online.ws, { type: 'inventory:sync', profile: result.profile });
      }
    }
    if (result.affectedProfiles) {
      for (const ap of result.affectedProfiles) {
        const online = activePlayers.get(ap.playerId);
        if (online) {
          online.clanId = undefined;
          online.clanTag = undefined;
          online.clanName = undefined;
          sendWs(online.ws, { type: 'inventory:sync', profile: ap });
        }
      }
    }
    res.json({
      ok: true,
      disbanded: action === 'disband',
      clan: result.clan,
      profile: result.profile,
      clans: persistence.listClans(),
    });
  });

  app.post('/api/clans/join', (req, res) => {
    const playerId = typeof req.body?.playerId === 'string' ? req.body.playerId.slice(0, 64) : '';
    const clanId = typeof req.body?.clanId === 'string' ? req.body.clanId : '';
    if (!playerId || !clanId) {
      res.status(400).json({ error: 'Missing clan parameters' });
      return;
    }
    const result = persistence.joinClan(playerId, clanId);
    if (!result.ok) {
      res.status(400).json({ error: result.error });
      return;
    }
    const online = activePlayers.get(playerId);
    if (online) {
      online.clanId = result.clan.id;
      online.clanTag = result.clan.tag;
      online.clanName = result.clan.name;
      sendWs(online.ws, { type: 'inventory:sync', profile: result.profile });
    }
    res.json({ clan: result.clan, profile: result.profile, clans: persistence.listClans() });
  });

  app.post('/api/clans/leave', (req, res) => {
    const playerId = typeof req.body?.playerId === 'string' ? req.body.playerId.slice(0, 64) : '';
    if (!playerId) {
      res.status(400).json({ error: 'Missing playerId' });
      return;
    }
    const result = persistence.leaveClan(playerId);
    const online = activePlayers.get(playerId);
    if (online && result.profile) {
      online.clanId = undefined;
      online.clanTag = undefined;
      online.clanName = undefined;
      sendWs(online.ws, { type: 'inventory:sync', profile: result.profile });
    }
    res.json({ profile: result.profile, clans: persistence.listClans() });
  });

  app.get('/api/leaderboard', (_req, res) => {
    res.json({ entries: persistence.getLeaderboard(25) });
  });

  app.post('/api/report', (req, res) => {
    const reporterId = typeof req.body?.reporterId === 'string' ? req.body.reporterId.slice(0, 64) : '';
    const targetId = typeof req.body?.targetId === 'string' ? req.body.targetId.slice(0, 64) : '';
    const reason = typeof req.body?.reason === 'string' ? req.body.reason.slice(0, 80) : 'Cheating / Abuse';
    const details = typeof req.body?.details === 'string' ? req.body.details.slice(0, 300) : '';
    if (!reporterId || !targetId || reporterId === targetId) {
      res.status(400).json({ error: 'Invalid report parameters' });
      return;
    }
    const reporter = persistence.getProfile(reporterId);
    const target = persistence.getProfile(targetId);
    persistence.addReport({
      id: crypto.randomUUID(),
      reporterId,
      reporterName: reporter?.username || 'Player',
      targetId,
      targetName: target?.username || 'Unknown',
      reason,
      details,
      timestamp: Date.now(),
      status: 'pending',
    });
    res.json({ ok: true, message: 'Report queued for moderator review.' });
  });

  // ---- Admin / Moderation Auth & Actions ----
  app.get('/api/admin/status', (_req, res) => {
    res.json({
      configured: persistence.hasAdminConfigured(),
      envManaged: persistence.isEnvAdminActive(),
    });
  });

  app.post('/api/admin/claim', (_req, res) => {
    res.status(409).json({ error: 'Moderator passcode is already configured.' });
  });

  app.post('/api/admin/login', (req, res) => {
    const passcode = typeof req.body?.passcode === 'string' ? req.body.passcode : '';
    if (!persistence.verifyAdminPasscode(passcode)) {
      res.status(403).json({ error: 'Invalid moderator passcode.' });
      return;
    }
    const token = crypto.randomBytes(32).toString('hex');
    adminTokens.set(token, { expiresAt: Date.now() + 1000 * 60 * 60 * 6, role: 'owner', issuedByName: 'Dev' });
    res.json({ token, role: 'owner', modName: 'Dev' });
  });

  app.post('/api/mod/session', (req, res) => {
    const playerId = typeof req.body?.playerId === 'string' ? req.body.playerId.slice(0, 64) : '';
    const playerSecret = typeof req.body?.playerSecret === 'string' ? req.body.playerSecret : '';
    if (!playerId || !playerSecret) {
      res.status(400).json({ error: 'Missing moderator credentials.' });
      return;
    }
    const prof = persistence.getProfile(playerId);
    if (!prof?.isMod || !persistence.bindOrVerifyPlayerSecret(playerId, playerSecret)) {
      res.status(403).json({ error: 'Moderator privileges required.' });
      return;
    }
    const token = crypto.randomBytes(32).toString('hex');
    adminTokens.set(token, { expiresAt: Date.now() + 1000 * 60 * 60 * 6, role: 'mod', issuedByName: prof.username });
    res.json({ token, role: 'mod', modName: prof.username });
  });

  app.get('/api/admin/overview', requireAdmin, (req, res) => {
    const modSession = (req as express.Request & { modSession?: { role: 'owner' | 'mod'; issuedByName: string } }).modSession;
    const mod = persistence.getModerationData();
    const online = Array.from(activePlayers.values()).map((p) => {
      const prof = persistence.getProfile(p.id);
      return {
        id: p.id,
        username: p.username,
        clanName: prof?.clanName,
        isMod: Boolean(prof?.isMod),
        ip: p.ip,
        x: Math.round(p.x),
        y: Math.round(p.y),
        z: Math.round(p.z),
        cheatScore: p.cheatScore,
        muted: Boolean(persistence.isPlayerMuted(p.id, p.username)),
      };
    });
    res.json({
      role: modSession?.role || 'mod',
      modName: modSession?.issuedByName || 'MOD',
      online,
      knownPlayers: persistence.listKnownPlayers(50),
      reports: mod.reports,
      bans: mod.bans,
      cheatAlerts: mod.cheatAlerts,
      recentChat: survivalRoom.recentChat.slice(-30),
    });
  });

  app.post('/api/admin/action', requireAdmin, (req, res) => {
    const modSession = (req as express.Request & { modSession?: { role: 'owner' | 'mod'; issuedByName: string } }).modSession;
    const issuerLabel =
      modSession?.role === 'owner'
        ? 'Dev'
        : modSession?.issuedByName
          ? `MOD ${modSession.issuedByName}`
          : 'Moderator';
    const action = typeof req.body?.action === 'string' ? req.body.action : '';
    const targetPlayerId = typeof req.body?.targetPlayerId === 'string' ? req.body.targetPlayerId.slice(0, 64) : undefined;
    const targetUsername = typeof req.body?.targetUsername === 'string' ? req.body.targetUsername.trim().slice(0, 24) : undefined;
    const reason = typeof req.body?.reason === 'string' && req.body.reason.trim() ? req.body.reason.trim().slice(0, 140) : 'Rule violation';
    const rawDuration = Number(req.body?.durationMinutes);
    const durationMinutes = Number.isFinite(rawDuration) ? Math.max(1, Math.min(525600, Math.round(rawDuration))) : 30;
    const reportId = typeof req.body?.reportId === 'string' ? req.body.reportId : undefined;
    const banId = typeof req.body?.banId === 'string' ? req.body.banId : undefined;

    const matchedProfile = persistence.findProfileByIdOrUsername(targetPlayerId, targetUsername);
    const resolvedId = targetPlayerId || matchedProfile?.playerId;
    const resolvedUsername = targetUsername || matchedProfile?.username;
    const onlineTarget = resolvedId
      ? activePlayers.get(resolvedId)
      : resolvedUsername
        ? Array.from(activePlayers.values()).find((p) => p.username.toLowerCase() === resolvedUsername.toLowerCase())
        : undefined;

    if (action === 'kick') {
      if (onlineTarget) {
        sendWs(onlineTarget.ws, { type: 'auth:rejected', reason: `Kicked by ${issuerLabel}: ${reason}` });
        onlineTarget.ws.close(4001, 'Kicked');
        activePlayers.delete(onlineTarget.id);
        pushGlobalSystemChat(`${onlineTarget.username} was kicked (${reason}).`);
      }
      res.json({ ok: true });
      return;
    }

    if (action === 'mute') {
      persistence.addBan({
        id: crypto.randomUUID(),
        targetPlayerId: resolvedId,
        targetUsername: resolvedUsername || onlineTarget?.username,
        type: 'mute',
        reason,
        createdAt: Date.now(),
        expiresAt: Date.now() + durationMinutes * 60_000,
        issuedBy: issuerLabel,
      });
      if (onlineTarget) {
        sendWs(onlineTarget.ws, {
          type: 'system:notice',
          level: 'warning',
          text: `You have been muted for ${durationMinutes}m (${reason}).`,
        });
      }
      res.json({ ok: true });
      return;
    }

    if (action === 'temp_ban' || action === 'perm_ban' || action === 'ip_ban') {
      if (!resolvedId && !resolvedUsername && action !== 'ip_ban') {
        res.status(400).json({ error: 'Specify a valid player or username to ban.' });
        return;
      }
      const expiresAt = action === 'temp_ban' ? Date.now() + durationMinutes * 60_000 : undefined;
      const targetIp = action === 'ip_ban' ? (onlineTarget?.ip || (typeof req.body?.targetIp === 'string' ? req.body.targetIp : undefined)) : undefined;
      persistence.addBan({
        id: crypto.randomUUID(),
        targetPlayerId: resolvedId,
        targetUsername: resolvedUsername || onlineTarget?.username,
        targetIp,
        type: action,
        reason,
        createdAt: Date.now(),
        expiresAt,
        issuedBy: issuerLabel,
      });
      if (onlineTarget) {
        sendWs(onlineTarget.ws, {
          type: 'auth:rejected',
          reason: `Banned: ${reason}`,
          expiresAt,
        });
        onlineTarget.ws.close(4003, 'Banned');
        activePlayers.delete(onlineTarget.id);
      }
      const who = resolvedUsername || onlineTarget?.username || targetIp || resolvedId || 'Player';
      pushGlobalSystemChat(
        action === 'temp_ban'
          ? `${who} was banned for ${durationMinutes}m (${reason}).`
          : `${who} was banned (${reason}).`
      );
      res.json({ ok: true });
      return;
    }

    if (action === 'make_mod' || action === 'remove_mod') {
      const isMod = action === 'make_mod';
      if (!isMod && modSession?.role !== 'owner') {
        res.status(403).json({ error: 'Only Original MOD Dev can remove MOD status.' });
        return;
      }
      const updated = persistence.setPlayerMod(resolvedId, resolvedUsername, isMod);
      if (!updated) {
        res.status(404).json({ error: 'Player not found. They must join the game at least once first.' });
        return;
      }
      if (onlineTarget) {
        onlineTarget.isMod = isMod;
        sendWs(onlineTarget.ws, { type: 'inventory:sync', profile: updated });
        sendWs(onlineTarget.ws, {
          type: 'system:notice',
          level: 'info',
          text: isMod ? 'You were promoted to [MOD]!' : 'Your [MOD] status was removed by Dev.',
        });
        broadcastRoom(onlineTarget.roomId, {
          type: 'world:players',
          players: buildPublicPlayers(onlineTarget.roomId),
          onlineCount: activePlayers.size,
        });
      }
      pushGlobalSystemChat(`${updated.username} is ${isMod ? 'now a [MOD]' : 'no longer a MOD'}.`);
      res.json({ ok: true, player: updated });
      return;
    }

    if (action === 'delete_chat') {
      const messageId = typeof req.body?.messageId === 'string' ? req.body.messageId : '';
      let foundRoom: GameRoom | undefined;
      for (const r of rooms.values()) {
        const idx = r.recentChat.findIndex((m) => m.id === messageId);
        if (idx !== -1) {
          r.recentChat.splice(idx, 1);
          foundRoom = r;
          break;
        }
      }
      if (!foundRoom) {
        res.status(404).json({ error: 'Chat message not found.' });
        return;
      }
      broadcastRoom(foundRoom.id, { type: 'chat:deleted', messageId });
      res.json({ ok: true });
      return;
    }

    if (action === 'unban' && banId) {
      persistence.removeBan(banId);
      res.json({ ok: true });
      return;
    }

    if ((action === 'resolve_report' || action === 'dismiss_report') && reportId) {
      persistence.updateReportStatus(reportId, action === 'resolve_report' ? 'resolved' : 'dismissed', issuerLabel);
      res.json({ ok: true });
      return;
    }

    res.status(400).json({ error: 'Unknown moderation action' });
  });

  // ---- HTTP + WebSocket Server ----
  const httpServer = http.createServer(app);
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  wss.on('connection', (ws, req) => {
    const ip = getClientIp(req);
    let currentPlayer: ConnectedPlayer | null = null;

    ws.on('message', (rawBuf) => {
      let msg: ClientWsMessage;
      try {
        msg = JSON.parse(rawBuf.toString('utf8')) as ClientWsMessage;
      } catch {
        return;
      }

      if (!msg || typeof msg !== 'object') return;

      // ---- 0. Ping / Pong for Latency MS ----
      if (msg.type === 'net:ping' && typeof msg.t === 'number') {
        sendWs(ws, { type: 'net:pong', t: msg.t });
        return;
      }

      // ---- 1. Join / Auth (Survival | 1v1 | CTF | Clan War) ----
      if (msg.type === 'auth:join') {
        const playerId = typeof msg.playerId === 'string' && msg.playerId.trim()
          ? msg.playerId.slice(0, 64)
          : `tv_${crypto.randomBytes(6).toString('hex')}`;
        const username = sanitizeUsername(msg.username);

        if (!persistence.bindOrVerifyPlayerSecret(playerId, msg.playerSecret)) {
          sendWs(ws, { type: 'auth:rejected', reason: 'Session verification failed for this player profile.' });
          ws.close(4004, 'Auth mismatch');
          return;
        }

        const activeBan = persistence.getActiveBan(playerId, username, ip);
        if (activeBan) {
          sendWs(ws, {
            type: 'auth:rejected',
            reason: `${activeBan.type.replace('_', ' ').toUpperCase()}: ${activeBan.reason}`,
            expiresAt: activeBan.expiresAt,
          });
          ws.close(4003, 'Banned');
          return;
        }

        if (activePlayers.size >= MAX_PLAYERS && !activePlayers.has(playerId)) {
          sendWs(ws, { type: 'auth:rejected', reason: 'Server world is currently full.' });
          ws.close(4002, 'Full');
          return;
        }

        const existing = activePlayers.get(playerId);
        if (existing) {
          const prevRoom = rooms.get(existing.roomId);
          if (prevRoom && existing.carryingFlag) {
            restoreCarriedFlag(prevRoom, existing);
          }
          existing.ws.close(4000, 'Reconnected');
          activePlayers.delete(playerId);
        }

        const profile = persistence.getOrCreateProfile(playerId, username);
        if (msg.skinId && profile.unlockedSkins.includes(msg.skinId)) {
          profile.skinId = msg.skinId;
        }
        if (msg.gunSkinId && profile.unlockedGunSkins.includes(msg.gunSkinId)) {
          profile.gunSkinId = msg.gunSkinId;
        }

        const mode: GameModeId =
          msg.mode === 'duel' || msg.mode === 'ctf' || msg.mode === 'clanwar' ? msg.mode : 'survival';

        let room: GameRoom = survivalRoom;
        let team: TeamSide | undefined;
        let spawn = { x: 42, y: 23, z: 28 };
        const zoneId = SPAWN_ZONES.some((z) => z.id === msg.zoneId) ? msg.zoneId : 'frontier';

        if (mode === 'survival') {
          room = survivalRoom;
          spawn = getZoneSpawn(zoneId);
        } else if (mode === 'duel') {
          room = findOrCreateDuelRoom();
          const currentInRoom = getRoomPlayers(room.id);
          if (currentInRoom.length === 0) {
            team = 'red';
            room.redLabel = profile.username;
            room.status = 'waiting';
          } else {
            const takenRed = currentInRoom.some((p) => p.team === 'red');
            team = takenRed ? 'blue' : 'red';
            if (team === 'red') room.redLabel = profile.username;
            else room.blueLabel = profile.username;
            room.status = 'active';
            room.endsAt = Date.now() + DUEL_DURATION_MS;
          }
          spawn = getModeSpawn('duel', team);
        } else if (mode === 'ctf') {
          room = getOrCreateCtfRoom();
          const ctfPlayers = getRoomPlayers(room.id);
          const redCount = ctfPlayers.filter((p) => p.team === 'red').length;
          const blueCount = ctfPlayers.filter((p) => p.team === 'blue').length;
          team = redCount <= blueCount ? 'red' : 'blue';
          spawn = getModeSpawn('ctf', team);
        } else if (mode === 'clanwar') {
          const check = evaluateClanWarEligibility(playerId);
          if (!check.eligible || !check.playerClan) {
            sendWs(ws, {
              type: 'auth:rejected',
              reason: check.message || 'Not eligible for Clan War.',
            });
            ws.close(4005, 'Clan War ineligible');
            return;
          }
          const targetOpponent =
            (msg.opponentClanId
              ? check.bigRivalClans.find((c) => c.id === msg.opponentClanId)
              : undefined) || check.bigRivalClans[0];
          if (!targetOpponent) {
            sendWs(ws, {
              type: 'auth:rejected',
              reason: 'No big rival clan found!',
            });
            ws.close(4005, 'No rival clan');
            return;
          }
          const matched = findOrCreateClanWarRoom(check.playerClan, targetOpponent);
          room = matched.room;
          team = matched.team;
          const peers = getRoomPlayers(room.id);
          if (peers.some((p) => p.team && p.team !== team)) {
            room.status = 'active';
          }
          spawn = getModeSpawn('clanwar', team);
        }

        const now = Date.now();
        currentPlayer = {
          id: playerId,
          username: profile.username,
          ip,
          ws,
          roomId: room.id,
          mode,
          team,
          x: spawn.x,
          y: spawn.y,
          z: spawn.z,
          yaw: team === 'blue' ? Math.PI / 2 : mode !== 'survival' ? -Math.PI / 2 : 0,
          pitch: 0,
          hp: 100,
          maxHp: 100,
          alive: true,
          sprinting: false,
          crouching: false,
          heldItemId: profile.hotbarSlots[0] || 'rifle',
          skinId: profile.skinId,
          gunSkinId: profile.gunSkinId,
          clanId: profile.clanId,
          clanTag: profile.clanTag,
          clanName: profile.clanName,
          isMod: Boolean(profile.isMod),
          lastMoveAt: now,
          lastShotAt: 0,
          lastActionAt: 0,
          lastChatAt: 0,
          chatHistory: [],
          lastLavaTickAt: 0,
          lastCactusTickAt: 0,
          airTicks: 0,
          peakAirY: spawn.y,
          cheatScore: 0,
          zoneId,
        };

        activePlayers.set(playerId, currentPlayer);

        sendWs(ws, {
          type: 'auth:welcome',
          selfId: playerId,
          profile,
          spawn,
          onlineCount: activePlayers.size,
          maxPlayers: MAX_PLAYERS,
          recentChat: room.recentChat.slice(-20),
          modeState: buildModeStateForPlayer(room, currentPlayer),
        });
        sendWs(ws, {
          type: 'drops:sync',
          drops: Array.from(room.drops.values()).map(({ id, itemId, count, x, y, z }) => ({
            id,
            itemId,
            count,
            x,
            y,
            z,
          })),
        });

        if (mode === 'duel' && room.status === 'active') {
          // Reset both fighters cleanly when 2nd opponent arrives
          for (const rp of getRoomPlayers(room.id)) {
            const rpSpawn = getModeSpawn('duel', rp.team || 'red');
            resetPlayerForCombatSpawn(rp, rpSpawn);
          }
          broadcastRoom(room.id, {
            type: 'mode:banner',
            text: `1v1 FIGHT: ${room.redLabel} vs ${room.blueLabel}! (5:00)`,
            tone: 'gold',
          });
          pushRoomSystemChat(room.id, `1v1 Started! ${room.redLabel} vs ${room.blueLabel}. Last survivor wins!`);
          syncRoomModeState(room);
        } else if (mode === 'ctf') {
          const teamName = team === 'red' ? 'Red Team' : 'Blue Team';
          pushRoomSystemChat(room.id, `${currentPlayer.username} joined ${teamName}.`);
          syncRoomModeState(room);
        } else if (mode === 'clanwar') {
          pushRoomSystemChat(
            room.id,
            `${currentPlayer.username} entered Clan War for ${team === 'red' ? room.redLabel : room.blueLabel}!`
          );
          syncRoomModeState(room);
        } else {
          pushRoomSystemChat(room.id, `${currentPlayer.username} entered the frontier.`);
        }

        broadcastRoom(room.id, {
          type: 'world:players',
          players: buildPublicPlayers(room.id),
          onlineCount: activePlayers.size,
        });
        return;
      }

      if (!currentPlayer) return;
      const player = currentPlayer;
      const room = rooms.get(player.roomId);
      const profile = persistence.getProfile(player.id);
      if (!room || !profile) return;

      // ---- 1b. Rematch for 1v1 / Clan War ----
      if (msg.type === 'mode:rematch' && (room.mode === 'duel' || room.mode === 'clanwar')) {
        if (room.status !== 'ended') return;
        room.redScore = 0;
        room.blueScore = 0;
        room.winnerTeam = undefined;
        room.winnerName = undefined;
        room.mods = {};
        room.chunkCache.clear();
        room.drops.clear();
        const peers = getRoomPlayers(room.id);
        room.status = peers.length >= 2 ? 'active' : 'waiting';
        room.endsAt = room.mode === 'duel' && peers.length >= 2 ? Date.now() + DUEL_DURATION_MS : undefined;
        for (const rp of peers) {
          const sp = getModeSpawn(room.mode, rp.team || 'red');
          resetPlayerForCombatSpawn(rp, sp);
        }
        syncRoomModeState(room);
        broadcastRoom(room.id, {
          type: 'mode:banner',
          text: peers.length >= 2 ? 'REMATCH STARTED!' : 'Waiting for opponent to rematch...',
          tone: 'gold',
        });
        return;
      }

      // ---- 2. Chunk Delta Request ----
      if (msg.type === 'chunk:request' && Array.isArray(msg.chunks)) {
        const chunksOut: Array<{ cx: number; cz: number; mods: BlockModEntry[] }> = [];
        for (const c of msg.chunks.slice(0, 64)) {
          if (typeof c?.cx === 'number' && typeof c?.cz === 'number') {
            const mods = getRoomChunkDeltas(room, c.cx | 0, c.cz | 0);
            if (mods.length > 0) {
              chunksOut.push({ cx: c.cx | 0, cz: c.cz | 0, mods });
            }
          }
        }
        if (chunksOut.length > 0) {
          sendWs(ws, { type: 'chunk:deltas', chunks: chunksOut });
        }
        return;
      }

      // ---- 3. Movement & Anti-Cheat + CTF Flag Checks ----
      if (msg.type === 'player:move') {
        if (!player.alive) return;
        const { x, y, z, yaw, pitch, sprinting, heldItemId } = msg;
        if (
          !Number.isFinite(x) ||
          !Number.isFinite(y) ||
          !Number.isFinite(z) ||
          !Number.isFinite(yaw) ||
          !Number.isFinite(pitch)
        ) {
          return;
        }

        const bounds = getModeBounds(room.mode);
        if (x < bounds.minX + 0.5 || x > bounds.maxX + 0.5 || z < bounds.minZ + 0.5 || z > bounds.maxZ + 0.5 || y < 0 || y > 72) {
          sendWs(ws, {
            type: 'player:correction',
            x: player.x,
            y: player.y,
            z: player.z,
            reason: 'Arena boundary reached',
          });
          return;
        }

        const now = Date.now();
        const dt = Math.max(0.016, Math.min(0.6, (now - player.lastMoveAt) / 1000));
        const horizDist = Math.hypot(x - player.x, z - player.z);
        const maxAllowedHoriz = SPRINT_SPEED * dt * 1.48 + 0.65;

        if (horizDist > maxAllowedHoriz) {
          const isTeleport = horizDist > 12;
          recordCheatAlert(
            player,
            isTeleport ? 'teleport' : 'speed',
            `Moved ${horizDist.toFixed(2)}m in ${(dt * 1000).toFixed(0)}ms`
          );
          sendWs(ws, {
            type: 'player:correction',
            x: player.x,
            y: player.y,
            z: player.z,
            reason: isTeleport ? 'Teleport rejected' : 'Speed limit exceeded',
          });
          player.lastMoveAt = now;
          return;
        }

        const supported = hasGroundSupport(room, x, y, z);
        if (!supported && y >= player.y - 0.02) {
          player.airTicks += 1;
          if (player.airTicks > 26) {
            recordCheatAlert(player, 'fly', `Sustained airborne ascent/hover (${player.airTicks} ticks)`);
            const safeY = room.mode === 'survival' ? findSafeSpawnY(Math.floor(player.x), Math.floor(player.z)) : 23;
            player.y = safeY;
            player.airTicks = 0;
            player.peakAirY = safeY;
            sendWs(ws, {
              type: 'player:correction',
              x: player.x,
              y: player.y,
              z: player.z,
              reason: 'Anti-fly correction',
            });
            player.lastMoveAt = now;
            return;
          }
        } else if (supported) {
          player.airTicks = 0;
        }

        if (isInWater(room, x, y, z)) {
          player.peakAirY = y;
        } else if (!isStandingOnSolidGround(room, x, y, z)) {
          player.peakAirY = Math.max(player.peakAirY, y);
        } else {
          const dropDistance = player.peakAirY - y;
          if (dropDistance > 3.5) {
            const dmg = Math.min(100, Math.floor((dropDistance - 3.5) * 14));
            if (dmg > 0) {
              player.hp = Math.max(0, player.hp - dmg);
              sendWs(ws, { type: 'combat:damaged', hp: player.hp, maxHp: player.maxHp, attackerName: 'Fall Damage' });
              if (player.hp <= 0) {
                player.alive = false;
                profile.deaths += 1;
                persistence.markPlayersDirty();
                broadcastRoom(room.id, {
                  type: 'combat:kill',
                  event: {
                    id: crypto.randomUUID(),
                    killerName: 'Terrain',
                    victimName: formatClanDisplay(player.username, profile.clanName),
                    weapon: 'Fall Damage',
                    timestamp: Date.now(),
                  },
                });
                handleModeKillScoring(room, null, player);
              }
            }
          }
          player.peakAirY = y;
        }

        player.x = x;
        player.y = y;
        player.z = z;
        player.yaw = yaw;
        player.pitch = Math.max(-1.56, Math.min(1.56, pitch));
        player.sprinting = Boolean(sprinting) && !msg.crouching;
        player.crouching = Boolean(msg.crouching);
        if (typeof heldItemId === 'string' && (heldItemId === '' || ITEMS[heldItemId])) {
          player.heldItemId = heldItemId;
        }
        player.lastMoveAt = now;
        collectNearbyDropsForPlayer(room, player, now);
        checkCtfFlagInteractions(room, player);
        return;
      }

      // ---- 4. Block Mining ----
      if (msg.type === 'block:mine') {
        if (!player.alive) return;
        const bx = msg.x | 0;
        const by = msg.y | 0;
        const bz = msg.z | 0;
        if (!isInsideModeWorld(room.mode, bx, by, bz) || by === 0) return;

        const now = Date.now();
        if (now - player.lastActionAt < 90) return;
        player.lastActionAt = now;

        const dist = Math.hypot(bx + 0.5 - player.x, by + 0.5 - (player.y + 1.5), bz + 0.5 - player.z);
        if (dist > MAX_REACH + 1.1) {
          recordCheatAlert(player, 'reach', `Mine attempt at ${dist.toFixed(1)}m`);
          return;
        }

        const existing = getRoomBlock(room, bx, by, bz);
        if (
          existing === BlockId.AIR ||
          existing === BlockId.BEDROCK ||
          existing === BlockId.WATER ||
          existing === BlockId.LAVA ||
          existing === BlockId.RED_BLOCK ||
          existing === BlockId.BLUE_BLOCK
        ) {
          return;
        }

        const meta = BLOCK_META[existing];
        if (!meta) return;

        const ok = setRoomBlock(room, bx, by, bz, BlockId.AIR);
        if (!ok) return;

        if (meta.dropItem && meta.dropCount > 0) {
          if (room.drops.size >= 300) {
            const oldestKey = room.drops.keys().next().value;
            if (oldestKey) {
              room.drops.delete(oldestKey);
              broadcastRoom(room.id, { type: 'drop:remove', id: oldestKey });
            }
          }
          const drop: ServerWorldDrop = {
            id: crypto.randomUUID(),
            itemId: meta.dropItem,
            count: meta.dropCount,
            x: bx + 0.5,
            y: by + 0.35,
            z: bz + 0.5,
            spawnedAt: now,
          };
          room.drops.set(drop.id, drop);
          broadcastRoom(room.id, {
            type: 'drop:spawn',
            drop: { id: drop.id, itemId: drop.itemId, count: drop.count, x: drop.x, y: drop.y, z: drop.z },
          });
        }
        profile.blocksMined += 1;
        const leveledUp = persistence.addXpAndCoins(profile, meta.xp, meta.coins);
        if (leveledUp) {
          sendWs(ws, {
            type: 'system:notice',
            level: 'info',
            text: `Level Up! You reached Level ${profile.level}!`,
          });
        }

        broadcastRoom(room.id, {
          type: 'block:update',
          x: bx,
          y: by,
          z: bz,
          blockId: BlockId.AIR,
          byPlayerId: player.id,
        });
        sendWs(ws, { type: 'inventory:sync', profile });
        return;
      }

      // ---- 5. Block Placement ----
      if (msg.type === 'block:place') {
        if (!player.alive) return;
        const bx = msg.x | 0;
        const by = msg.y | 0;
        const bz = msg.z | 0;
        const itemId = typeof msg.itemId === 'string' ? msg.itemId : '';
        const itemDef = ITEMS[itemId];
        if (!itemDef || itemDef.kind !== 'block' || !itemDef.placeBlockId) return;
        if (!isInsideModeWorld(room.mode, bx, by, bz) || by === 0 || by >= 62) return;

        const dist = Math.hypot(bx + 0.5 - player.x, by + 0.5 - (player.y + 1.5), bz + 0.5 - player.z);
        if (dist > MAX_REACH + 1.1) {
          recordCheatAlert(player, 'reach', `Place attempt at ${dist.toFixed(1)}m`);
          return;
        }

        const overlapsSelf =
          Math.abs(bx + 0.5 - player.x) < PLAYER_WIDTH * 0.5 + 0.45 &&
          Math.abs(bz + 0.5 - player.z) < PLAYER_WIDTH * 0.5 + 0.45 &&
          by + 1 > player.y + 0.05 &&
          by < player.y + PLAYER_HEIGHT;
        if (overlapsSelf) return;

        const current = getRoomBlock(room, bx, by, bz);
        if (current !== BlockId.AIR && current !== BlockId.WATER && current !== BlockId.LAVA) return;

        if (!persistence.removeItem(profile, itemId, 1)) {
          sendWs(ws, { type: 'inventory:sync', profile });
          return;
        }

        const blockId = itemDef.placeBlockId as BlockType;
        setRoomBlock(room, bx, by, bz, blockId);
        broadcastRoom(room.id, {
          type: 'block:update',
          x: bx,
          y: by,
          z: bz,
          blockId,
          byPlayerId: player.id,
        });
        sendWs(ws, { type: 'inventory:sync', profile });
        return;
      }

      // ---- 6. Combat Shooting ----
      if (msg.type === 'combat:shoot') {
        if (!player.alive) return;
        if (room.status === 'ended') return;
        if (room.mode === 'duel' && room.status === 'waiting') {
          sendWs(ws, { type: 'system:notice', level: 'info', text: 'Waiting for opponent to join 1v1!' });
          return;
        }

        const requestedGun = typeof msg.gunId === 'string' && GUNS[msg.gunId] ? msg.gunId : player.heldItemId;
        const gun = GUNS[requestedGun] || GUNS.rifle;
        if (!profile.unlockedGuns.includes(gun.id)) return;

        const now = Date.now();
        if (now - player.lastShotAt < gun.fireIntervalMs - 16) {
          recordCheatAlert(player, 'firerate', `${gun.shortName} interval ${now - player.lastShotAt}ms`);
          return;
        }

        const currentMag = profile.gunMags[gun.id] ?? 0;
        if (currentMag <= 0) {
          profile.ammoInMag = 0;
          sendWs(ws, { type: 'inventory:sync', profile });
          return;
        }

        const { originX, originY, originZ, dirX, dirY, dirZ } = msg;
        if (
          !Number.isFinite(originX) ||
          !Number.isFinite(originY) ||
          !Number.isFinite(originZ) ||
          !Number.isFinite(dirX) ||
          !Number.isFinite(dirY) ||
          !Number.isFinite(dirZ)
        ) {
          return;
        }

        const expectedEye = player.y + (player.crouching ? CROUCH_EYE_HEIGHT : EYE_HEIGHT);
        const originErr = Math.hypot(originX - player.x, originY - expectedEye, originZ - player.z);
        if (originErr > 2.35) {
          recordCheatAlert(player, 'occlusion', `Shot origin mismatch ${originErr.toFixed(2)}m`);
          return;
        }

        const len = Math.hypot(dirX, dirY, dirZ) || 1;
        const baseDx = dirX / len;
        const baseDy = dirY / len;
        const baseDz = dirZ / len;

        player.lastShotAt = now;
        profile.gunMags[gun.id] = currentMag - 1;
        profile.ammoInMag = profile.gunMags[gun.id];
        persistence.markPlayersDirty();

        const ox =
          originErr <= 1.0 &&
          getRoomBlock(room, Math.floor(originX), Math.floor(originY), Math.floor(originZ)) === BlockId.AIR
            ? originX
            : player.x;
        const oy =
          originErr <= 1.0 &&
          getRoomBlock(room, Math.floor(originX), Math.floor(originY), Math.floor(originZ)) === BlockId.AIR
            ? originY
            : expectedEye;
        const oz =
          originErr <= 1.0 &&
          getRoomBlock(room, Math.floor(originX), Math.floor(originY), Math.floor(originZ)) === BlockId.AIR
            ? originZ
            : player.z;

        const pelletDamage = gun.damage + Math.round(profile.rifleDamageBonus * (gun.pellets > 1 ? 0.35 : 1));
        const crouchSpreadMult = player.crouching ? 0.55 : 1.0;
        const damageByVictim = new Map<ConnectedPlayer, number>();

        for (let pIdx = 0; pIdx < gun.pellets; pIdx++) {
          const sp = gun.spread * crouchSpreadMult * (gun.pellets > 1 ? 1.0 : 0.45);
          const pdx = baseDx + (Math.random() - 0.5) * sp;
          const pdy = baseDy + (Math.random() - 0.5) * sp;
          const pdz = baseDz + (Math.random() - 0.5) * sp;
          const plen = Math.hypot(pdx, pdy, pdz) || 1;
          const ndx = pdx / plen;
          const ndy = pdy / plen;
          const ndz = pdz / plen;

          const worldHit = raycastRoomWorld(room, ox, oy, oz, ndx, ndy, ndz, gun.range);
          let hitTarget: ConnectedPlayer | null = null;
          let hitDist = worldHit.dist;

          for (const other of getRoomPlayers(room.id)) {
            if (other.id === player.id || !other.alive) continue;
            // Team modes disable friendly fire
            if ((room.mode === 'ctf' || room.mode === 'clanwar') && player.team && other.team === player.team) {
              continue;
            }
            const t = rayIntersectPlayer(ox, oy, oz, ndx, ndy, ndz, other, hitDist);
            if (t !== null && t < hitDist) {
              hitDist = t;
              hitTarget = other;
            }
          }

          broadcastRoom(room.id, {
            type: 'combat:tracer',
            shooterId: player.id,
            startX: ox,
            startY: oy - 0.14,
            startZ: oz,
            endX: ox + ndx * hitDist,
            endY: oy + ndy * hitDist,
            endZ: oz + ndz * hitDist,
            hitPlayerId: hitTarget?.id,
          });

          if (hitTarget) {
            damageByVictim.set(hitTarget, (damageByVictim.get(hitTarget) || 0) + pelletDamage);
          }
        }

        for (const [hitTarget, totalDmg] of damageByVictim.entries()) {
          if (!hitTarget.alive) continue;
          hitTarget.hp = Math.max(0, hitTarget.hp - totalDmg);
          sendWs(hitTarget.ws, {
            type: 'combat:damaged',
            hp: hitTarget.hp,
            maxHp: hitTarget.maxHp,
            attackerName: player.username,
          });

          if (hitTarget.hp <= 0) {
            hitTarget.alive = false;
            profile.kills += 1;
            persistence.recordClanKill(profile.clanId);
            const leveledUp = persistence.addXpAndCoins(profile, 65, 35);
            if (leveledUp) {
              sendWs(ws, {
                type: 'system:notice',
                level: 'info',
                text: `Level Up! You reached Level ${profile.level}!`,
              });
            }

            const targetProf = persistence.getProfile(hitTarget.id);
            if (targetProf) {
              targetProf.deaths += 1;
              persistence.markPlayersDirty();
            }

            broadcastRoom(room.id, {
              type: 'combat:kill',
              event: {
                id: crypto.randomUUID(),
                killerName: formatClanDisplay(player.username, profile.clanName),
                victimName: formatClanDisplay(hitTarget.username, targetProf?.clanName || hitTarget.clanName),
                weapon: gun.name,
                timestamp: Date.now(),
              },
            });

            handleModeKillScoring(room, player, hitTarget);
          }
        }

        sendWs(ws, { type: 'inventory:sync', profile });
        return;
      }

      // ---- 7. Reload Weapon ----
      if (msg.type === 'weapon:reload') {
        const gunId = typeof msg.gunId === 'string' && GUNS[msg.gunId] ? msg.gunId : player.heldItemId;
        const gun = GUNS[gunId] || GUNS.rifle;
        const currentMag = profile.gunMags[gun.id] ?? 0;
        const needed = gun.magSize - currentMag;
        if (needed <= 0) return;
        const reserve = persistence.getItemCount(profile, 'ammo');
        if (reserve <= 0) return;
        const take = Math.min(needed, reserve);
        persistence.removeItem(profile, 'ammo', take);
        profile.gunMags[gun.id] = currentMag + take;
        profile.ammoInMag = profile.gunMags[gun.id];
        persistence.markPlayersDirty();
        sendWs(ws, { type: 'inventory:sync', profile });
        return;
      }

      // ---- 8. Use Medkit ----
      if (msg.type === 'item:use' && msg.itemId === 'medkit') {
        if (!player.alive || player.hp >= player.maxHp) return;
        if (!persistence.removeItem(profile, 'medkit', 1)) return;
        player.hp = Math.min(player.maxHp, player.hp + 45);
        sendWs(ws, { type: 'inventory:sync', profile });
        sendWs(ws, { type: 'combat:damaged', hp: player.hp, maxHp: player.maxHp, attackerName: 'Medkit' });
        return;
      }

      // ---- 9. Crafting & Quick-Convert ----
      if (msg.type === 'craft:make') {
        const recipe = CRAFT_RECIPES.find((r) => r.id === msg.recipeId);
        if (!recipe) return;
        for (const ing of recipe.ingredients) {
          if (persistence.getItemCount(profile, ing.item) < ing.count) {
            sendWs(ws, { type: 'system:notice', level: 'warning', text: 'Insufficient resources to craft.' });
            return;
          }
        }
        for (const ing of recipe.ingredients) {
          persistence.removeItem(profile, ing.item, ing.count);
        }
        persistence.addItem(profile, recipe.outputItem, recipe.outputCount);
        let equipSlot: number | undefined;
        if (typeof msg.targetHotbarSlot === 'number' && msg.targetHotbarSlot >= 2 && msg.targetHotbarSlot < 9) {
          const existingIdx = profile.hotbarSlots.indexOf(recipe.outputItem);
          if (existingIdx >= 2) {
            equipSlot = existingIdx;
          } else {
            profile.hotbarSlots[msg.targetHotbarSlot] = recipe.outputItem;
            equipSlot = msg.targetHotbarSlot;
          }
          persistence.compactHotbar(profile);
        }
        const leveledUp = persistence.addXpAndCoins(profile, 8, 2);
        if (leveledUp) {
          sendWs(ws, {
            type: 'system:notice',
            level: 'info',
            text: `Level Up! You reached Level ${profile.level}!`,
          });
        }
        sendWs(ws, { type: 'inventory:sync', profile, equipSlot });
        return;
      }

      // ---- 10. Respawn ----
      if (msg.type === 'player:respawn') {
        if (player.alive) return;
        if (room.status === 'ended') return;
        const zoneId = msg.zoneId && SPAWN_ZONES.some((z) => z.id === msg.zoneId) ? msg.zoneId : player.zoneId;
        const spawn =
          room.mode === 'survival' ? getZoneSpawn(zoneId) : getModeSpawn(room.mode, player.team || 'red');
        player.x = spawn.x;
        player.y = spawn.y;
        player.z = spawn.z;
        player.hp = 100;
        player.alive = true;
        player.crouching = false;
        player.carryingFlag = undefined;
        player.airTicks = 0;
        player.peakAirY = spawn.y;
        player.lastMoveAt = Date.now();
        if ((profile.gunMags.rifle ?? 0) === 0 && persistence.getItemCount(profile, 'ammo') < 30) {
          persistence.addItem(profile, 'ammo', 30);
        }
        if ((profile.gunMags.rifle ?? 0) === 0) {
          const take = Math.min(RIFLE_MAG_SIZE, persistence.getItemCount(profile, 'ammo'));
          if (take > 0) {
            persistence.removeItem(profile, 'ammo', take);
            profile.gunMags.rifle = take;
            profile.ammoInMag = take;
          }
        }
        sendWs(ws, {
          type: 'player:respawned',
          x: player.x,
          y: player.y,
          z: player.z,
          hp: player.hp,
          ammoInMag: profile.ammoInMag,
        });
        sendWs(ws, { type: 'inventory:sync', profile });
        return;
      }

      // ---- 11. Hotbar Sync ----
      if (msg.type === 'hotbar:set' && Array.isArray(msg.hotbarSlots) && msg.hotbarSlots.length >= 1 && msg.hotbarSlots.length <= 9) {
        const gunSlot =
          msg.hotbarSlots.find((id) => typeof id === 'string' && Boolean(GUNS[id])) ||
          profile.hotbarSlots.find((id) => Boolean(id && GUNS[id])) ||
          'rifle';
        const nextSlots = [gunSlot, 'pickaxe', '', '', '', '', '', '', ''];
        const seen = new Set<string>([gunSlot, 'pickaxe']);
        for (let i = 2; i < 9; i++) {
          const id = typeof msg.hotbarSlots[i] === 'string' ? msg.hotbarSlots[i] : '';
          if (id && !seen.has(id) && ITEMS[id] && !GUNS[id] && id !== 'pickaxe' && persistence.getItemCount(profile, id) > 0) {
            seen.add(id);
            nextSlots[i] = id;
          }
        }
        profile.hotbarSlots = nextSlots;
        persistence.compactHotbar(profile);
        persistence.markPlayersDirty();
        sendWs(ws, { type: 'inventory:sync', profile });
        return;
      }

      // ---- 12. Chat ----
      if (msg.type === 'chat:send') {
        const muted = persistence.isPlayerMuted(player.id, player.username);
        if (muted) {
          sendWs(ws, {
            type: 'system:notice',
            level: 'warning',
            text: `You are muted: ${muted.reason}`,
          });
          return;
        }
        const now = Date.now();
        const cleanText = typeof msg.text === 'string' ? msg.text.replace(/\s+/g, ' ').trim().slice(0, 160) : '';
        if (!cleanText) return;

        if (now - player.lastChatAt < 1500) {
          sendWs(ws, { type: 'system:notice', level: 'warning', text: 'Slow down! No spam allowed.' });
          return;
        }

        player.chatHistory = player.chatHistory.filter((entry) => now - entry.at < 15_000);
        if (player.chatHistory.filter((entry) => now - entry.at < 8_000).length >= 4) {
          sendWs(ws, { type: 'system:notice', level: 'warning', text: 'Too many messages! Spam is not allowed.' });
          return;
        }

        const lowerText = cleanText.toLowerCase();
        if (player.chatHistory.some((entry) => entry.text === lowerText)) {
          sendWs(ws, { type: 'system:notice', level: 'warning', text: 'Duplicate message blocked — no spam allowed.' });
          return;
        }

        if (/(.)\1{7,}/.test(cleanText)) {
          sendWs(ws, { type: 'system:notice', level: 'warning', text: 'Repeated character flood blocked.' });
          return;
        }

        const abusivePattern = /\b(fuck|shit|bitch|asshole|bastard|dick|pussy|cunt|whore|slut|nigger|nigga|faggot|retard|madarchod|bhenchod|chutiya)\b/i;
        if (abusivePattern.test(cleanText)) {
          sendWs(ws, {
            type: 'system:notice',
            level: 'warning',
            text: 'Rule #2: Bad words & abuse are not allowed in VoxelStrike!',
          });
          return;
        }

        player.lastChatAt = now;
        player.chatHistory.push({ text: lowerText, at: now });

        const chatMsg: ChatMessage = {
          id: crypto.randomUUID(),
          playerId: player.id,
          username: player.username,
          clanTag: profile.clanTag,
          clanName: profile.clanName,
          isMod: Boolean(profile.isMod),
          text: cleanText,
          timestamp: now,
        };
        room.recentChat.push(chatMsg);
        if (room.recentChat.length > 40) room.recentChat.shift();
        broadcastRoom(room.id, { type: 'chat:message', message: chatMsg });
        return;
      }

      // ---- 12b. MOD Live Chat Message Delete ----
      if (msg.type === 'chat:delete') {
        if (!profile.isMod) {
          sendWs(ws, { type: 'system:notice', level: 'warning', text: 'Only [MOD] players can delete chat messages.' });
          return;
        }
        const messageId = typeof msg.messageId === 'string' ? msg.messageId : '';
        const idx = room.recentChat.findIndex((m) => m.id === messageId);
        if (idx !== -1) {
          room.recentChat.splice(idx, 1);
          broadcastRoom(room.id, { type: 'chat:deleted', messageId });
        }
        return;
      }

      // ---- 13. Player Report ----
      if (msg.type === 'report:submit') {
        const targetId = typeof msg.targetId === 'string' ? msg.targetId.slice(0, 64) : '';
        if (!targetId || targetId === player.id) return;
        const targetProf = persistence.getProfile(targetId);
        const targetOnline = activePlayers.get(targetId);
        persistence.addReport({
          id: crypto.randomUUID(),
          reporterId: player.id,
          reporterName: player.username,
          targetId,
          targetName: targetOnline?.username || targetProf?.username || 'Unknown',
          reason: typeof msg.reason === 'string' ? msg.reason.slice(0, 80) : 'Suspicious activity',
          details: typeof msg.details === 'string' ? msg.details.slice(0, 300) : '',
          timestamp: Date.now(),
          status: 'pending',
        });
        sendWs(ws, {
          type: 'report:ack',
          text: 'Report logged for moderator verification. No automated ban issued.',
        });
      }
    });

    ws.on('close', () => {
      if (currentPlayer && activePlayers.get(currentPlayer.id)?.ws === ws) {
        const leaving = currentPlayer;
        activePlayers.delete(leaving.id);
        const room = rooms.get(leaving.roomId);
        if (room) {
          if (room.mode === 'ctf' && leaving.carryingFlag) {
            restoreCarriedFlag(room, leaving);
          }
          if (room.mode === 'duel' && room.status === 'active') {
            const survivor = getRoomPlayers(room.id)[0];
            if (survivor && survivor.team) {
              if (survivor.team === 'red') room.redScore += 1;
              else room.blueScore += 1;
              finishMatch(room, survivor.team, survivor.username, `${leaving.username} forfeited — ${survivor.username} wins!`);
            }
          }
          pushRoomSystemChat(room.id, `${leaving.username} left.`);
          broadcastRoom(room.id, {
            type: 'world:players',
            players: buildPublicPlayers(room.id),
            onlineCount: activePlayers.size,
          });
          if (room.id !== 'world' && room.id !== 'ctf_main' && getRoomPlayers(room.id).length === 0) {
            rooms.delete(room.id);
          }
        }
      }
    });
  });

  // 20 Hz Player State & Flag Position Broadcast per Room
  setInterval(() => {
    if (activePlayers.size === 0) return;
    for (const room of rooms.values()) {
      const players = buildPublicPlayers(room.id);
      if (players.length === 0) continue;
      if (room.mode === 'ctf' && room.flags) {
        updateFlagCarrierPositions(room);
        syncRoomModeState(room);
      }
      broadcastRoom(room.id, {
        type: 'world:players',
        players,
        onlineCount: activePlayers.size,
      });
    }
  }, 50);

  // Server-authoritative World Hazards + Drop Expiry + Duel 5-Min Timer (200ms tick)
  setInterval(() => {
    const now = Date.now();
    for (const room of rooms.values()) {
      // Check 5-minute 1v1 combat timer expiration
      if (room.mode === 'duel' && room.status === 'active' && room.endsAt && now >= room.endsAt) {
        const fighters = getRoomPlayers(room.id);
        if (fighters.length === 2) {
          const red = fighters.find((f) => f.team === 'red') || fighters[0];
          const blue = fighters.find((f) => f.team === 'blue') || fighters[1];
          const winSide: TeamSide = red.hp >= blue.hp ? 'red' : 'blue';
          const winner = winSide === 'red' ? red : blue;
          finishMatch(room, winSide, winner.username, `Time Up! ${winner.username} survived with higher HP!`);
        }
      }

      for (const [id, drop] of room.drops.entries()) {
        if (now - drop.spawnedAt > 120_000) {
          room.drops.delete(id);
          broadcastRoom(room.id, { type: 'drop:remove', id });
        }
      }

      for (const p of getRoomPlayers(room.id)) {
        if (!p.alive) continue;
        collectNearbyDropsForPlayer(room, p, now);
        checkCtfFlagInteractions(room, p);

        const fx = Math.floor(p.x);
        const fz = Math.floor(p.z);
        const bFeet = getRoomBlock(room, fx, Math.floor(p.y + 0.15), fz);
        const bWaist = getRoomBlock(room, fx, Math.floor(p.y + 0.65), fz);
        if (now - p.lastLavaTickAt >= 500 && (bFeet === BlockId.LAVA || bWaist === BlockId.LAVA)) {
          p.lastLavaTickAt = now;
          p.hp = Math.max(0, p.hp - 12);
          sendWs(p.ws, {
            type: 'combat:damaged',
            hp: p.hp,
            maxHp: p.maxHp,
            attackerName: 'Molten Lava',
          });
          if (p.hp <= 0) {
            p.alive = false;
            const prof = persistence.getProfile(p.id);
            if (prof) {
              prof.deaths += 1;
              persistence.markPlayersDirty();
            }
            broadcastRoom(room.id, {
              type: 'combat:kill',
              event: {
                id: crypto.randomUUID(),
                killerName: 'Lava',
                victimName: formatClanDisplay(p.username, prof?.clanName || p.clanName),
                weapon: 'Molten Lava',
                timestamp: now,
              },
            });
            handleModeKillScoring(room, null, p);
          }
        } else if (now - p.lastCactusTickAt >= 650 && isTouchingCactus(room, p.x, p.y, p.z)) {
          p.lastCactusTickAt = now;
          p.hp = Math.max(0, p.hp - 8);
          sendWs(p.ws, {
            type: 'combat:damaged',
            hp: p.hp,
            maxHp: p.maxHp,
            attackerName: 'Cactus',
          });
          if (p.hp <= 0) {
            p.alive = false;
            const prof = persistence.getProfile(p.id);
            if (prof) {
              prof.deaths += 1;
              persistence.markPlayersDirty();
            }
            broadcastRoom(room.id, {
              type: 'combat:kill',
              event: {
                id: crypto.randomUUID(),
                killerName: 'Desert',
                victimName: formatClanDisplay(p.username, prof?.clanName || p.clanName),
                weapon: 'Cactus Spines',
                timestamp: now,
              },
            });
            handleModeKillScoring(room, null, p);
          }
        }
      }
    }
  }, 200);

  // Portable Static / Vite Serving (works in dev & production anywhere!)
  const distPath = path.resolve(process.cwd(), 'dist');
  const useProdStatic = process.env.NODE_ENV === 'production' && fs.existsSync(path.join(distPath, 'index.html'));
  if (!useProdStatic) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`VoxelStrike server running on http://0.0.0.0:${PORT}`);
  });

  const cleanup = () => {
    persistence.dispose();
    process.exit(0);
  };
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
}

startServer().catch((err) => {
  console.error('Failed to start VoxelStrike server:', err);
  process.exit(1);
});
