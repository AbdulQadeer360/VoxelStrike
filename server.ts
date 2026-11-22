import crypto from 'crypto';
import dotenv from 'dotenv';
import express from 'express';
import http from 'http';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { WebSocket, WebSocketServer } from 'ws';
import { PersistenceManager } from './src/server/persistence.ts';
import {
  BLOCK_META,
  BlockId,
  CRAFT_RECIPES,
  CROUCH_EYE_HEIGHT,
  CROUCH_HEIGHT,
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
  WORLD_MAX_X,
  WORLD_MAX_Z,
  WORLD_MIN_X,
  WORLD_MIN_Z,
  type BlockType,
  type SpawnZone,
} from './src/shared/constants.ts';
import type {
  ChatMessage,
  ClientWsMessage,
  PlayerPublicState,
  ServerWsMessage,
  WorldDropState,
} from './src/shared/protocol.ts';
import { findSafeSpawnY, isInsideWorld } from './src/shared/worldGen.ts';

dotenv.config();

const PORT = 3000;
const persistence = new PersistenceManager();

interface ConnectedPlayer {
  id: string;
  username: string;
  ip: string;
  ws: WebSocket;
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

const activePlayers = new Map<string, ConnectedPlayer>();
const activeDrops = new Map<string, ServerWorldDrop>();
const recentChat: ChatMessage[] = [];
const adminTokens = new Map<string, { expiresAt: number; role: 'owner' | 'mod'; issuedByName: string }>();

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

function broadcastWs(msg: ServerWsMessage, excludeId?: string): void {
  const raw = JSON.stringify(msg);
  for (const p of activePlayers.values()) {
    if (excludeId && p.id === excludeId) continue;
    if (p.ws.readyState === WebSocket.OPEN) {
      p.ws.send(raw);
    }
  }
}

function sanitizeUsername(name: unknown): string {
  if (typeof name !== 'string') return 'Explorer';
  const cleaned = name.replace(/[^a-zA-Z0-9_\- ]/g, '').trim().slice(0, 16);
  return cleaned.length >= 2 ? cleaned : `Miner${Math.floor(100 + Math.random() * 899)}`;
}

function getZoneSpawn(zoneId: SpawnZone['id']): { x: number; y: number; z: number } {
  const zone = SPAWN_ZONES.find((z) => z.id === zoneId) || SPAWN_ZONES[0];
  for (let attempt = 0; attempt < 24; attempt++) {
    const spread = 10 + attempt * 2;
    const jitterX = Math.floor(Math.random() * spread) - Math.floor(spread / 2);
    const jitterZ = Math.floor(Math.random() * spread) - Math.floor(spread / 2);
    const x = Math.max(WORLD_MIN_X + 10, Math.min(WORLD_MAX_X - 10, zone.x + jitterX));
    const z = Math.max(WORLD_MIN_Z + 10, Math.min(WORLD_MAX_Z - 10, zone.z + jitterZ));
    // Avoid spawning directly inside Central Citadel obelisk
    if (Math.abs(x) <= 2 && Math.abs(z) <= 2) continue;

    let y = findSafeSpawnY(x, z);
    while (
      y < 58 &&
      (persistence.getBlock(x, y, z) !== BlockId.AIR || persistence.getBlock(x, y + 1, z) !== BlockId.AIR)
    ) {
      y += 1;
    }
    const groundBlock = persistence.getBlock(x, y - 1, z);
    // Stand firmly on solid terrain (not water, lava, cactus, or tree leaves)
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

function hasGroundSupport(x: number, y: number, z: number): boolean {
  const half = PLAYER_WIDTH / 2 + 0.25;
  const checkY = Math.floor(y - 0.35);
  for (let dx = -1; dx <= 1; dx++) {
    for (let dz = -1; dz <= 1; dz++) {
      const bx = Math.floor(x + dx * half);
      const bz = Math.floor(z + dz * half);
      const b1 = persistence.getBlock(bx, checkY, bz);
      const b2 = persistence.getBlock(bx, Math.floor(y), bz);
      if (
        (b1 !== BlockId.AIR && b1 !== BlockId.WATER && b1 !== BlockId.LAVA) ||
        b2 === BlockId.WATER ||
        b1 === BlockId.WATER ||
        b2 === BlockId.LAVA ||
        b1 === BlockId.LAVA
      ) {
        return true;
      }
      // Also allow being 1-2.5 blocks above ground during a valid jump
      const below2 = persistence.getBlock(bx, checkY - 1, bz);
      if (below2 !== BlockId.AIR) return true;
    }
  }
  return false;
}

function isStandingOnSolidGround(x: number, y: number, z: number): boolean {
  const half = PLAYER_WIDTH / 2 + 0.06;
  const footY = Math.floor(y - 0.14);
  for (let dx = -1; dx <= 1; dx++) {
    for (let dz = -1; dz <= 1; dz++) {
      const bx = Math.floor(x + dx * half);
      const bz = Math.floor(z + dz * half);
      const b = persistence.getBlock(bx, footY, bz);
      if (b !== BlockId.AIR && b !== BlockId.WATER && b !== BlockId.LAVA) {
        return true;
      }
    }
  }
  return false;
}

function isInWater(x: number, y: number, z: number): boolean {
  const bx = Math.floor(x);
  const bz = Math.floor(z);
  return (
    persistence.getBlock(bx, Math.floor(y + 0.15), bz) === BlockId.WATER ||
    persistence.getBlock(bx, Math.floor(y - 0.12), bz) === BlockId.WATER
  );
}

function isTouchingCactus(x: number, y: number, z: number): boolean {
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
        if (persistence.getBlock(bx, by, bz) === BlockId.CACTUS) {
          return true;
        }
      }
    }
  }
  return false;
}

function collectNearbyDropsForPlayer(p: ConnectedPlayer, now: number): void {
  if (!p.alive || activeDrops.size === 0) return;
  const prof = persistence.getProfile(p.id);
  if (!prof) return;
  let collectedAny = false;
  for (const [id, drop] of activeDrops.entries()) {
    if (now - drop.spawnedAt < 220) continue;
    const dist = Math.hypot(drop.x - p.x, (drop.y - (p.y + 0.8)) * 0.65, drop.z - p.z);
    if (dist <= 2.15) {
      persistence.addItem(prof, drop.itemId, drop.count);
      activeDrops.delete(id);
      collectedAny = true;
      broadcastWs({ type: 'drop:remove', id, byPlayerId: p.id });
    }
  }
  if (collectedAny) {
    sendWs(p.ws, { type: 'inventory:sync', profile: prof });
  }
}

// Server-side raymarch through voxel world to check line-of-sight & block impact
function raycastWorld(
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
    const blk = persistence.getBlock(px, py, pz);
    if (blk !== BlockId.AIR && blk !== BlockId.WATER && blk !== BlockId.LAVA) {
      return { hitBlock: true, dist: d };
    }
  }
  return { hitBlock: false, dist: maxDist };
}

// Ray-AABB intersection for player hitbox
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
  const halfW = PLAYER_WIDTH * 0.65; // slight generous hitbox for responsive netcode
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

function buildPublicPlayers(): PlayerPublicState[] {
  const list: PlayerPublicState[] = [];
  for (const p of activePlayers.values()) {
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

function pushSystemChat(text: string): void {
  const msg: ChatMessage = {
    id: crypto.randomUUID(),
    playerId: 'system',
    username: 'Server',
    text,
    timestamp: Date.now(),
    system: true,
  };
  recentChat.push(msg);
  if (recentChat.length > 40) recentChat.shift();
  broadcastWs({ type: 'chat:message', message: msg });
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
    res.json({
      onlineCount: activePlayers.size,
      maxPlayers: MAX_PLAYERS,
      worldSize: '1500 × 600',
    });
  });

  app.get('/api/profile/:playerId', (req, res) => {
    const playerId = String(req.params.playerId || '').slice(0, 64);
    const username = sanitizeUsername(req.query.username || 'Explorer');
    const headerSecret = typeof req.headers['x-player-secret'] === 'string' ? req.headers['x-player-secret'] : undefined;
    if (!playerId) {
      res.status(400).json({ error: 'Invalid playerId' });
      return;
    }
    const existing = persistence.getProfile(playerId);
    if (existing && headerSecret && !persistence.bindOrVerifyPlayerSecret(playerId, headerSecret)) {
      res.status(403).json({ error: 'Invalid player session token' });
      return;
    }
    const profile = persistence.getOrCreateProfile(playerId, existing ? '' : username);
    if (headerSecret) {
      persistence.bindOrVerifyPlayerSecret(playerId, headerSecret);
    }
    res.json({ profile });
  });

  app.post('/api/profile/username', (req, res) => {
    const playerId = typeof req.body?.playerId === 'string' ? req.body.playerId.slice(0, 64) : '';
    const username = sanitizeUsername(req.body?.username);
    const playerSecret = typeof req.body?.playerSecret === 'string' ? req.body.playerSecret : undefined;
    if (!playerId) {
      res.status(400).json({ error: 'Missing playerId' });
      return;
    }
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
    // Equip into primary Hotbar Slot #1 while keeping Slots 2..8
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
      online.clanTag = result.clan.tag;
      online.clanName = result.clan.name;
      sendWs(online.ws, { type: 'inventory:sync', profile: result.profile });
    }
    res.json({ clan: result.clan, profile: result.profile, clans: persistence.listClans() });
  });

  app.post('/api/clans/manage', (req, res) => {
    const playerId = typeof req.body?.playerId === 'string' ? req.body.playerId.slice(0, 64) : '';
    const playerSecret = typeof req.body?.playerSecret === 'string' ? req.body.playerSecret : undefined;
    const clanIdentifier = typeof req.body?.clanIdentifier === 'string' ? req.body.clanIdentifier : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const action = typeof req.body?.action === 'string' ? req.body.action : 'verify';
    const description = typeof req.body?.description === 'string' ? req.body.description : undefined;
    const targetMemberId = typeof req.body?.targetMemberId === 'string' ? req.body.targetMemberId : undefined;
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
        online.clanTag = result.profile.clanTag;
        online.clanName = result.profile.clanName;
        sendWs(online.ws, { type: 'inventory:sync', profile: result.profile });
      }
    }
    if (result.affectedProfiles) {
      for (const ap of result.affectedProfiles) {
        const online = activePlayers.get(ap.playerId);
        if (online) {
          online.clanTag = undefined;
          online.clanName = undefined;
          sendWs(online.ws, { type: 'inventory:sync', profile: ap });
        }
      }
    }
    res.json({
      ok: true,
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
    // Never ban on unverified reports alone
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

  // Promoted MODs can authenticate with their bound player secret (never by public playerId alone)
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
      recentChat: recentChat.slice(-30),
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
        pushSystemChat(`${onlineTarget.username} was kicked (${reason}).`);
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
      pushSystemChat(
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
      }
      broadcastWs({
        type: 'world:players',
        players: buildPublicPlayers(),
        onlineCount: activePlayers.size,
      });
      pushSystemChat(`${updated.username} is ${isMod ? 'now a [MOD]' : 'no longer a MOD'}.`);
      res.json({ ok: true, player: updated });
      return;
    }

    if (action === 'delete_chat') {
      const messageId = typeof req.body?.messageId === 'string' ? req.body.messageId : '';
      const idx = recentChat.findIndex((m) => m.id === messageId);
      if (idx === -1) {
        res.status(404).json({ error: 'Chat message not found.' });
        return;
      }
      recentChat.splice(idx, 1);
      broadcastWs({ type: 'chat:deleted', messageId });
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

      // ---- 1. Join / Auth ----
      if (msg.type === 'auth:join') {
        const playerId = typeof msg.playerId === 'string' ? msg.playerId.slice(0, 64) : crypto.randomUUID();
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

        // Disconnect stale socket for same playerId
        const existing = activePlayers.get(playerId);
        if (existing) {
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

        const zoneId = SPAWN_ZONES.some((z) => z.id === msg.zoneId) ? msg.zoneId : 'frontier';
        const spawn = getZoneSpawn(zoneId);
        const now = Date.now();

        currentPlayer = {
          id: playerId,
          username: profile.username,
          ip,
          ws,
          x: spawn.x,
          y: spawn.y,
          z: spawn.z,
          yaw: 0,
          pitch: 0,
          hp: 100,
          maxHp: 100,
          alive: true,
          sprinting: false,
          crouching: false,
          heldItemId: profile.hotbarSlots[0] || 'rifle',
          skinId: profile.skinId,
          gunSkinId: profile.gunSkinId,
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
          recentChat: recentChat.slice(-20),
        });
        sendWs(ws, {
          type: 'drops:sync',
          drops: Array.from(activeDrops.values()).map(({ id, itemId, count, x, y, z }) => ({
            id,
            itemId,
            count,
            x,
            y,
            z,
          })),
        });

        pushSystemChat(`${currentPlayer.username} entered the frontier.`);
        broadcastWs({
          type: 'world:players',
          players: buildPublicPlayers(),
          onlineCount: activePlayers.size,
        });
        return;
      }

      if (!currentPlayer) return;
      const player = currentPlayer;
      const profile = persistence.getProfile(player.id);
      if (!profile) return;

      // ---- 2. Chunk Delta Request ----
      if (msg.type === 'chunk:request' && Array.isArray(msg.chunks)) {
        const chunksOut: Array<{ cx: number; cz: number; mods: ReturnType<typeof persistence.getChunkDeltas> }> = [];
        for (const c of msg.chunks.slice(0, 64)) {
          if (typeof c?.cx === 'number' && typeof c?.cz === 'number') {
            const mods = persistence.getChunkDeltas(c.cx | 0, c.cz | 0);
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

      // ---- 3. Movement & Anti-Cheat (Speed / Teleport / Fly) ----
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

        // World bounds check
        if (x < WORLD_MIN_X + 1 || x > WORLD_MAX_X || z < WORLD_MIN_Z + 1 || z > WORLD_MAX_Z || y < 0 || y > 72) {
          sendWs(ws, {
            type: 'player:correction',
            x: player.x,
            y: player.y,
            z: player.z,
            reason: 'World boundary reached',
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
            `Moved ${horizDist.toFixed(2)}m in ${(dt * 1000).toFixed(0)}ms (limit ${maxAllowedHoriz.toFixed(2)}m)`
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

        // Anti-fly check & accurate fall damage tracking
        const supported = hasGroundSupport(x, y, z);
        if (!supported && y >= player.y - 0.02) {
          player.airTicks += 1;
          if (player.airTicks > 26) {
            recordCheatAlert(player, 'fly', `Sustained airborne ascent/hover (${player.airTicks} ticks)`);
            const safeY = findSafeSpawnY(Math.floor(player.x), Math.floor(player.z));
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

        if (isInWater(x, y, z)) {
          player.peakAirY = y;
        } else if (!isStandingOnSolidGround(x, y, z)) {
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
                broadcastWs({
                  type: 'combat:kill',
                  event: {
                    id: crypto.randomUUID(),
                    killerName: 'Terrain',
                    victimName: formatClanDisplay(player.username, profile.clanName),
                    weapon: 'Fall Damage',
                    timestamp: Date.now(),
                  },
                });
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
        collectNearbyDropsForPlayer(player, now);
        return;
      }

      // ---- 4. Block Mining (Reach + Bedrock + World Drop Spawn) ----
      if (msg.type === 'block:mine') {
        if (!player.alive) return;
        const bx = msg.x | 0;
        const by = msg.y | 0;
        const bz = msg.z | 0;
        if (!isInsideWorld(bx, by, bz) || by === 0) return;

        const now = Date.now();
        if (now - player.lastActionAt < 90) return; // basic anti-nuker rate guard
        player.lastActionAt = now;

        const dist = Math.hypot(bx + 0.5 - player.x, by + 0.5 - (player.y + 1.5), bz + 0.5 - player.z);
        if (dist > MAX_REACH + 1.1) {
          recordCheatAlert(player, 'reach', `Mine attempt at ${dist.toFixed(1)}m`);
          return;
        }

        const existing = persistence.getBlock(bx, by, bz);
        if (existing === BlockId.AIR || existing === BlockId.BEDROCK || existing === BlockId.WATER || existing === BlockId.LAVA) return;

        const meta = BLOCK_META[existing];
        if (!meta) return;

        const ok = persistence.setBlock(bx, by, bz, BlockId.AIR);
        if (!ok) return;

        if (meta.dropItem && meta.dropCount > 0) {
          if (activeDrops.size >= 300) {
            const oldestKey = activeDrops.keys().next().value;
            if (oldestKey) {
              activeDrops.delete(oldestKey);
              broadcastWs({ type: 'drop:remove', id: oldestKey });
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
          activeDrops.set(drop.id, drop);
          broadcastWs({
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

        broadcastWs({
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

      // ---- 5. Block Placement (Reach + Inventory Deduction + Overlap Guard) ----
      if (msg.type === 'block:place') {
        if (!player.alive) return;
        const bx = msg.x | 0;
        const by = msg.y | 0;
        const bz = msg.z | 0;
        const itemId = typeof msg.itemId === 'string' ? msg.itemId : '';
        const itemDef = ITEMS[itemId];
        if (!itemDef || itemDef.kind !== 'block' || !itemDef.placeBlockId) return;
        if (!isInsideWorld(bx, by, bz) || by === 0 || by >= 62) return;

        const dist = Math.hypot(bx + 0.5 - player.x, by + 0.5 - (player.y + 1.5), bz + 0.5 - player.z);
        if (dist > MAX_REACH + 1.1) {
          recordCheatAlert(player, 'reach', `Place attempt at ${dist.toFixed(1)}m`);
          return;
        }

        // Cannot place inside player's own bounding box
        const overlapsSelf =
          Math.abs(bx + 0.5 - player.x) < PLAYER_WIDTH * 0.5 + 0.45 &&
          Math.abs(bz + 0.5 - player.z) < PLAYER_WIDTH * 0.5 + 0.45 &&
          by + 1 > player.y + 0.05 &&
          by < player.y + PLAYER_HEIGHT;
        if (overlapsSelf) return;

        const current = persistence.getBlock(bx, by, bz);
        if (current !== BlockId.AIR && current !== BlockId.WATER && current !== BlockId.LAVA) return;

        if (!persistence.removeItem(profile, itemId, 1)) {
          sendWs(ws, { type: 'inventory:sync', profile });
          return;
        }

        const blockId = itemDef.placeBlockId as BlockType;
        persistence.setBlock(bx, by, bz, blockId);
        broadcastWs({
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

      // ---- 6. Combat Shooting (Multi-Gun Authoritative Fire-Rate, Pellets, Ammo & Damage) ----
      if (msg.type === 'combat:shoot') {
        if (!player.alive) return;
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
          persistence.getBlock(Math.floor(originX), Math.floor(originY), Math.floor(originZ)) === BlockId.AIR
            ? originX
            : player.x;
        const oy =
          originErr <= 1.0 &&
          persistence.getBlock(Math.floor(originX), Math.floor(originY), Math.floor(originZ)) === BlockId.AIR
            ? originY
            : expectedEye;
        const oz =
          originErr <= 1.0 &&
          persistence.getBlock(Math.floor(originX), Math.floor(originY), Math.floor(originZ)) === BlockId.AIR
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

          const worldHit = raycastWorld(ox, oy, oz, ndx, ndy, ndz, gun.range);
          let hitTarget: ConnectedPlayer | null = null;
          let hitDist = worldHit.dist;

          for (const other of activePlayers.values()) {
            if (other.id === player.id || !other.alive) continue;
            const t = rayIntersectPlayer(ox, oy, oz, ndx, ndy, ndz, other, hitDist);
            if (t !== null && t < hitDist) {
              hitDist = t;
              hitTarget = other;
            }
          }

          broadcastWs({
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

            broadcastWs({
              type: 'combat:kill',
              event: {
                id: crypto.randomUUID(),
                killerName: formatClanDisplay(player.username, profile.clanName),
                victimName: formatClanDisplay(hitTarget.username, targetProf?.clanName || hitTarget.clanName),
                weapon: gun.name,
                timestamp: Date.now(),
              },
            });
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
        const zoneId = msg.zoneId && SPAWN_ZONES.some((z) => z.id === msg.zoneId) ? msg.zoneId : player.zoneId;
        const spawn = getZoneSpawn(zoneId);
        player.x = spawn.x;
        player.y = spawn.y;
        player.z = spawn.z;
        player.hp = 100;
        player.alive = true;
        player.crouching = false;
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

      // ---- 11. Hotbar Sync (Fixed 9 slots preserving blank boxes) ----
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

      // ---- 12. Chat (Open to All Players + Anti-Spam Protection) ----
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

        // Anti-spam checks (cooldown, burst limit, duplicate repeat, character flooding)
        if (now - player.lastChatAt < 1500) {
          sendWs(ws, {
            type: 'system:notice',
            level: 'warning',
            text: 'Slow down! No spam allowed.',
          });
          return;
        }

        player.chatHistory = player.chatHistory.filter((entry) => now - entry.at < 15_000);
        const recent8s = player.chatHistory.filter((entry) => now - entry.at < 8_000);
        if (recent8s.length >= 4) {
          sendWs(ws, {
            type: 'system:notice',
            level: 'warning',
            text: 'Too many messages! Spam is not allowed.',
          });
          return;
        }

        const lowerText = cleanText.toLowerCase();
        if (player.chatHistory.some((entry) => entry.text === lowerText)) {
          sendWs(ws, {
            type: 'system:notice',
            level: 'warning',
            text: 'Duplicate message blocked — no spam allowed.',
          });
          return;
        }

        if (/(.)\1{7,}/.test(cleanText)) {
          sendWs(ws, {
            type: 'system:notice',
            level: 'warning',
            text: 'Repeated character flood blocked — no spam allowed.',
          });
          return;
        }

        // Enforce Rule #2: No bad words / abuse
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
        recentChat.push(chatMsg);
        if (recentChat.length > 40) recentChat.shift();
        broadcastWs({ type: 'chat:message', message: chatMsg });
        return;
      }

      // ---- 12b. MOD Live Chat Message Delete ----
      if (msg.type === 'chat:delete') {
        if (!profile.isMod) {
          sendWs(ws, {
            type: 'system:notice',
            level: 'warning',
            text: 'Only [MOD] players can delete chat messages.',
          });
          return;
        }
        const messageId = typeof msg.messageId === 'string' ? msg.messageId : '';
        const idx = recentChat.findIndex((m) => m.id === messageId);
        if (idx !== -1) {
          recentChat.splice(idx, 1);
          broadcastWs({ type: 'chat:deleted', messageId });
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
        activePlayers.delete(currentPlayer.id);
        pushSystemChat(`${currentPlayer.username} left the frontier.`);
        broadcastWs({
          type: 'world:players',
          players: buildPublicPlayers(),
          onlineCount: activePlayers.size,
        });
      }
    });
  });

  // 20 Hz Player State Broadcast
  setInterval(() => {
    if (activePlayers.size === 0) return;
    broadcastWs({
      type: 'world:players',
      players: buildPublicPlayers(),
      onlineCount: activePlayers.size,
    });
  }, 50);

  // Server-authoritative World Hazards (Lava & Cactus) + Drop Pickup & Expiry (200ms tick)
  setInterval(() => {
    const now = Date.now();
    // Expire stale world drops after 2 minutes
    for (const [id, drop] of activeDrops.entries()) {
      if (now - drop.spawnedAt > 120_000) {
        activeDrops.delete(id);
        broadcastWs({ type: 'drop:remove', id });
      }
    }

    if (activePlayers.size === 0) return;
    for (const p of activePlayers.values()) {
      if (!p.alive) continue;
      collectNearbyDropsForPlayer(p, now);

      const fx = Math.floor(p.x);
      const fz = Math.floor(p.z);
      const bFeet = persistence.getBlock(fx, Math.floor(p.y + 0.15), fz);
      const bWaist = persistence.getBlock(fx, Math.floor(p.y + 0.65), fz);
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
          broadcastWs({
            type: 'combat:kill',
            event: {
              id: crypto.randomUUID(),
              killerName: 'Lava',
              victimName: formatClanDisplay(p.username, prof?.clanName || p.clanName),
              weapon: 'Molten Lava',
              timestamp: now,
            },
          });
        }
      } else if (now - p.lastCactusTickAt >= 650 && isTouchingCactus(p.x, p.y, p.z)) {
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
          broadcastWs({
            type: 'combat:kill',
            event: {
              id: crypto.randomUUID(),
              killerName: 'Desert',
              victimName: formatClanDisplay(p.username, prof?.clanName || p.clanName),
              weapon: 'Cactus Spines',
              timestamp: now,
            },
          });
        }
      }
    }
  }, 200);

  // Vite dev middleware or static dist serving
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
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
