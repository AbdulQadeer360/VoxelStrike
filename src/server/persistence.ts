import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import {
  BlockId,
  CHUNK_SIZE,
  CLAN_MIN_LEVEL,
  GUNS,
  GUN_SKINS,
  ITEMS,
  RIFLE_MAG_SIZE,
  WORLD_HEIGHT,
  type BlockType,
} from '../shared/constants.ts';
import type {
  BanRecord,
  BlockModEntry,
  CheatAlertRecord,
  ClanRecord,
  LeaderboardEntry,
  PlayerProfileState,
  ReportRecord,
} from '../shared/protocol.ts';
import {
  generateChunkData,
  getChunkKey,
  isInsideWorld,
  localIndex,
  worldToChunk,
} from '../shared/worldGen.ts';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const WORLD_MODS_FILE = path.join(DATA_DIR, 'world-mods.json');
const PLAYERS_FILE = path.join(DATA_DIR, 'players.json');
const CLANS_FILE = path.join(DATA_DIR, 'clans.json');
const MODERATION_FILE = path.join(DATA_DIR, 'moderation.json');
const ADMIN_FILE = path.join(DATA_DIR, 'admin.json');
const PLAYER_SECRETS_FILE = path.join(DATA_DIR, 'player-secrets.json');
const CLAN_SECRETS_FILE = path.join(DATA_DIR, 'clan-secrets.json');

interface ModerationStore {
  reports: ReportRecord[];
  bans: BanRecord[];
  cheatAlerts: CheatAlertRecord[];
}

interface AdminCredentialStore {
  salt: string;
  hash: string;
}

function defaultGunMags(): Record<string, number> {
  return {
    rifle: GUNS.rifle.magSize,
    smg: GUNS.smg.magSize,
    shotgun: GUNS.shotgun.magSize,
    sniper: GUNS.sniper.magSize,
  };
}

export function createDefaultProfile(playerId: string, username: string): PlayerProfileState {
  return {
    playerId,
    username,
    coins: 60,
    xp: 0,
    level: 1,
    kills: 0,
    deaths: 0,
    blocksMined: 0,
    skinId: 'ranger',
    unlockedSkins: ['ranger'],
    gunSkinId: 'carbon',
    unlockedGunSkins: GUN_SKINS.filter((g) => g.price === 0).map((g) => g.id),
    unlockedGuns: Object.keys(GUNS),
    gunMags: defaultGunMags(),
    pickaxeTier: 1,
    rifleDamageBonus: 0,
    inventory: [
      { itemId: 'rifle', count: 1 },
      { itemId: 'pickaxe', count: 1 },
      { itemId: 'ammo', count: 90 },
    ],
    hotbarSlots: ['rifle', 'pickaxe', '', '', '', '', '', '', ''],
    ammoInMag: RIFLE_MAG_SIZE,
  };
}

export class PersistenceManager {
  // chunkKey -> Record<localIndex, blockId>
  private worldMods: Record<string, Record<number, BlockType>> = {};
  // LRU cache of hydrated chunks
  private chunkCache = new Map<string, Uint8Array>();
  private players = new Map<string, PlayerProfileState>();
  private clans = new Map<string, ClanRecord>();
  private moderation: ModerationStore = {
    reports: [],
    bans: [],
    cheatAlerts: [],
  };
  private adminCred: AdminCredentialStore | null = null;
  private playerSecrets: Record<string, string> = {};
  private clanSecrets: Record<string, { salt: string; hash: string }> = {};

  private dirtyWorld = false;
  private dirtyPlayers = false;
  private dirtyClans = false;
  private dirtyModeration = false;
  private dirtySecrets = false;
  private dirtyClanSecrets = false;
  private flushTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    this.loadAll();
    this.flushTimer = setInterval(() => this.flushSync(), 2500);
  }

  private safeReadJson<T>(filePath: string, fallback: T): T {
    try {
      if (!fs.existsSync(filePath)) return fallback;
      const raw = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  }

  private atomicWriteJson(filePath: string, data: unknown): void {
    const tmp = `${filePath}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data), 'utf8');
    fs.renameSync(tmp, filePath);
  }

  private hydrateProfileDefaults(prof: PlayerProfileState): void {
    if (!prof.gunSkinId) prof.gunSkinId = 'carbon';
    const freeSkinIds = GUN_SKINS.filter((g) => g.price === 0).map((g) => g.id);
    if (!Array.isArray(prof.unlockedGunSkins)) {
      prof.unlockedGunSkins = [...freeSkinIds];
    } else {
      for (const id of freeSkinIds) {
        if (!prof.unlockedGunSkins.includes(id)) prof.unlockedGunSkins.push(id);
      }
    }
    const freeGunIds = Object.values(GUNS)
      .filter((g) => g.price === 0)
      .map((g) => g.id);
    if (!Array.isArray(prof.unlockedGuns)) {
      prof.unlockedGuns = [...freeGunIds];
    } else {
      for (const id of freeGunIds) {
        if (!prof.unlockedGuns.includes(id)) prof.unlockedGuns.push(id);
      }
    }
    if (!prof.gunMags || typeof prof.gunMags !== 'object') {
      prof.gunMags = defaultGunMags();
      prof.gunMags.rifle = prof.ammoInMag ?? GUNS.rifle.magSize;
    } else {
      for (const gid of Object.keys(GUNS)) {
        if (typeof prof.gunMags[gid] !== 'number') {
          prof.gunMags[gid] = GUNS[gid].magSize;
        }
      }
    }
    if (prof.clanId) {
      const clan = this.clans.get(prof.clanId);
      if (clan) {
        prof.clanTag = clan.tag;
        prof.clanName = clan.name;
      } else {
        prof.clanId = undefined;
        prof.clanTag = undefined;
        prof.clanName = undefined;
      }
    }
    this.compactHotbar(prof);
  }

  public compactHotbar(prof: PlayerProfileState): void {
    const equippedGun =
      prof.hotbarSlots.find((id) => Boolean(id && GUNS[id])) ||
      prof.unlockedGuns?.[0] ||
      'rifle';
    const slots: string[] = [equippedGun, 'pickaxe', '', '', '', '', '', '', ''];
    const seen = new Set<string>([equippedGun, 'pickaxe']);

    // Preserve existing items at their fixed slots (2..8), leaving blank slots '' when depleted
    for (let i = 2; i < 9; i++) {
      const id = prof.hotbarSlots?.[i] || '';
      if (!id || seen.has(id) || GUNS[id] || id === 'pickaxe') continue;
      const def = ITEMS[id];
      if (!def || def.kind === 'resource') continue;
      if (this.getItemCount(prof, id) > 0) {
        seen.add(id);
        slots[i] = id;
      }
    }

    // Place any newly picked-up/crafted items into the first available blank slot (2..8)
    for (const slot of prof.inventory || []) {
      if (seen.has(slot.itemId) || slot.count <= 0) continue;
      const def = ITEMS[slot.itemId];
      if (!def || def.kind === 'weapon' || def.kind === 'tool' || def.kind === 'resource') continue;
      const freeIdx = slots.indexOf('', 2);
      if (freeIdx === -1) break;
      seen.add(slot.itemId);
      slots[freeIdx] = slot.itemId;
    }

    prof.hotbarSlots = slots;
  }

  private loadAll(): void {
    this.worldMods = this.safeReadJson<Record<string, Record<number, BlockType>>>(WORLD_MODS_FILE, {});
    const clanList = this.safeReadJson<ClanRecord[]>(CLANS_FILE, []);
    for (const c of clanList) {
      if (typeof c.warWins !== 'number') c.warWins = 0;
      if (typeof c.warPoints !== 'number') c.warPoints = 0;
      this.clans.set(c.id, c);
    }
    const playerObj = this.safeReadJson<Record<string, PlayerProfileState>>(PLAYERS_FILE, {});
    for (const [id, prof] of Object.entries(playerObj)) {
      this.hydrateProfileDefaults(prof);
      this.players.set(id, prof);
    }
    this.moderation = this.safeReadJson<ModerationStore>(MODERATION_FILE, {
      reports: [],
      bans: [],
      cheatAlerts: [],
    });
    this.adminCred = this.safeReadJson<AdminCredentialStore | null>(ADMIN_FILE, null);
    this.playerSecrets = this.safeReadJson<Record<string, string>>(PLAYER_SECRETS_FILE, {});
    this.clanSecrets = this.safeReadJson<Record<string, { salt: string; hash: string }>>(CLAN_SECRETS_FILE, {});
  }

  public flushSync(): void {
    if (this.dirtyWorld) {
      this.dirtyWorld = false;
      this.atomicWriteJson(WORLD_MODS_FILE, this.worldMods);
    }
    if (this.dirtyPlayers) {
      this.dirtyPlayers = false;
      const obj: Record<string, PlayerProfileState> = {};
      for (const [id, prof] of this.players.entries()) {
        obj[id] = prof;
      }
      this.atomicWriteJson(PLAYERS_FILE, obj);
    }
    if (this.dirtyClans) {
      this.dirtyClans = false;
      this.atomicWriteJson(CLANS_FILE, Array.from(this.clans.values()));
    }
    if (this.dirtyModeration) {
      this.dirtyModeration = false;
      this.atomicWriteJson(MODERATION_FILE, this.moderation);
    }
    if (this.dirtySecrets) {
      this.dirtySecrets = false;
      this.atomicWriteJson(PLAYER_SECRETS_FILE, this.playerSecrets);
    }
    if (this.dirtyClanSecrets) {
      this.dirtyClanSecrets = false;
      this.atomicWriteJson(CLAN_SECRETS_FILE, this.clanSecrets);
    }
  }

  public dispose(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    this.flushSync();
  }

  // ---- World Chunk Access ----
  public getOrLoadChunk(cx: number, cz: number): Uint8Array {
    const key = getChunkKey(cx, cz);
    const cached = this.chunkCache.get(key);
    if (cached) {
      this.chunkCache.delete(key);
      this.chunkCache.set(key, cached);
      return cached;
    }

    const buf = generateChunkData(cx, cz);
    const mods = this.worldMods[key];
    if (mods) {
      for (const [idxStr, blk] of Object.entries(mods)) {
        const idx = Number(idxStr);
        if (idx >= 0 && idx < buf.length) {
          buf[idx] = blk;
        }
      }
    }

    this.chunkCache.set(key, buf);
    if (this.chunkCache.size > 320) {
      const oldestKey = this.chunkCache.keys().next().value;
      if (oldestKey) this.chunkCache.delete(oldestKey);
    }
    return buf;
  }

  public getBlock(wx: number, wy: number, wz: number): BlockType {
    if (!isInsideWorld(wx, wy, wz)) return BlockId.AIR;
    const { cx, cz, lx, lz } = worldToChunk(wx, wz);
    const chunk = this.getOrLoadChunk(cx, cz);
    return chunk[localIndex(lx, wy, lz)] as BlockType;
  }

  public setBlock(wx: number, wy: number, wz: number, blockId: BlockType): boolean {
    if (!isInsideWorld(wx, wy, wz)) return false;
    if (wy === 0) return false;

    const { cx, cz, lx, lz } = worldToChunk(wx, wz);
    const key = getChunkKey(cx, cz);
    const chunk = this.getOrLoadChunk(cx, cz);
    const idx = localIndex(lx, wy, lz);
    chunk[idx] = blockId;

    if (!this.worldMods[key]) {
      this.worldMods[key] = {};
    }
    this.worldMods[key][idx] = blockId;
    this.dirtyWorld = true;
    return true;
  }

  public getChunkDeltas(cx: number, cz: number): BlockModEntry[] {
    const key = getChunkKey(cx, cz);
    const mods = this.worldMods[key];
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

  // ---- Player Profile & Inventory (Server-Authoritative) ----
  public getOrCreateProfile(playerId: string, username: string): PlayerProfileState {
    let prof = this.players.get(playerId);
    if (!prof) {
      prof = createDefaultProfile(playerId, username);
      this.players.set(playerId, prof);
      this.dirtyPlayers = true;
    } else {
      this.hydrateProfileDefaults(prof);
      if (username && prof.username !== username) {
        prof.username = username;
        this.dirtyPlayers = true;
      }
    }
    return prof;
  }

  public getProfile(playerId: string): PlayerProfileState | undefined {
    return this.players.get(playerId);
  }

  public markPlayersDirty(): void {
    this.dirtyPlayers = true;
  }

  public getItemCount(profile: PlayerProfileState, itemId: string): number {
    const slot = profile.inventory.find((s) => s.itemId === itemId);
    return slot ? slot.count : 0;
  }

  public addItem(profile: PlayerProfileState, itemId: string, count: number): void {
    if (count <= 0 || !ITEMS[itemId]) return;
    const maxStack = ITEMS[itemId].maxStack;
    const existing = profile.inventory.find((s) => s.itemId === itemId);
    if (existing) {
      existing.count = Math.min(maxStack, existing.count + count);
    } else {
      profile.inventory.push({ itemId, count: Math.min(maxStack, count) });
    }
    this.compactHotbar(profile);
    this.dirtyPlayers = true;
  }

  public removeItem(profile: PlayerProfileState, itemId: string, count: number): boolean {
    if (count <= 0) return true;
    const idx = profile.inventory.findIndex((s) => s.itemId === itemId);
    if (idx === -1) return false;
    if (profile.inventory[idx].count < count) return false;
    profile.inventory[idx].count -= count;
    if (profile.inventory[idx].count <= 0) {
      profile.inventory.splice(idx, 1);
    }
    this.compactHotbar(profile);
    this.dirtyPlayers = true;
    return true;
  }

  public addXpAndCoins(profile: PlayerProfileState, xpDelta: number, coinsDelta: number): boolean {
    const prevLevel = profile.level;
    profile.xp += Math.max(0, xpDelta);
    profile.coins += Math.max(0, coinsDelta);
    profile.level = Math.max(1, Math.floor(Math.sqrt(profile.xp / 45)) + 1);
    this.dirtyPlayers = true;
    return profile.level > prevLevel;
  }

  public getLeaderboard(limit = 25): LeaderboardEntry[] {
    return Array.from(this.players.values())
      .map((p) => ({
        playerId: p.playerId,
        username: p.username,
        clanTag: p.clanTag,
        clanName: p.clanName,
        isMod: Boolean(p.isMod),
        level: p.level,
        xp: p.xp,
        kills: p.kills,
        blocksMined: p.blocksMined,
        coins: p.coins,
      }))
      .sort((a, b) => b.kills * 150 + b.blocksMined * 2 + b.xp - (a.kills * 150 + a.blocksMined * 2 + a.xp))
      .slice(0, limit);
  }

  // ---- Clans System (Level >= 5 Gate) ----
  public listClans(): ClanRecord[] {
    return Array.from(this.clans.values()).sort(
      (a, b) => b.memberIds.length * 100 + b.totalKills - (a.memberIds.length * 100 + a.totalKills)
    );
  }

  private hashClanPassword(password: string): { salt: string; hash: string } {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync(password, salt, 64).toString('hex');
    return { salt, hash };
  }

  public verifyClanPassword(clanId: string, password: string): boolean {
    const cred = this.clanSecrets[clanId];
    if (!cred || !password) return false;
    const derived = crypto.scryptSync(password, cred.salt, 64);
    const expected = Buffer.from(cred.hash, 'hex');
    return derived.length === expected.length && crypto.timingSafeEqual(derived, expected);
  }

  public findClanByIdentifier(identifier: string): ClanRecord | undefined {
    const trimmed = identifier.trim();
    if (!trimmed) return undefined;
    if (this.clans.has(trimmed)) return this.clans.get(trimmed);
    const lower = trimmed.toLowerCase();
    for (const c of this.clans.values()) {
      if (c.name.toLowerCase() === lower || c.tag.toLowerCase() === lower) {
        return c;
      }
    }
    return undefined;
  }

  public createClan(
    playerId: string,
    rawName: string,
    rawTag: string,
    rawDesc: string,
    rawPassword: string
  ): { ok: true; clan: ClanRecord; profile: PlayerProfileState } | { ok: false; error: string } {
    const profile = this.players.get(playerId);
    if (!profile) return { ok: false, error: 'Profile not found.' };
    if (profile.level < CLAN_MIN_LEVEL) {
      return { ok: false, error: `Reach Level ${CLAN_MIN_LEVEL} to create a clan (Current: Lv.${profile.level}).` };
    }
    if (profile.clanId && this.clans.has(profile.clanId)) {
      return { ok: false, error: 'Leave your current clan before creating a new one.' };
    }

    const name = rawName.replace(/[^a-zA-Z0-9_\- ]/g, '').trim().slice(0, 20);
    const tag = rawTag.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 4);
    const description = rawDesc.trim().slice(0, 100) || 'VoxelStrike Survival Clan';
    const password = rawPassword.trim();

    if (name.length < 3) return { ok: false, error: 'Clan name must be 3–20 characters.' };
    if (tag.length < 2) return { ok: false, error: 'Clan tag must be 2–4 alphanumeric characters.' };
    if (password.length < 4 || password.length > 64) {
      return { ok: false, error: 'Clan password must be 4–64 characters.' };
    }

    for (const c of this.clans.values()) {
      if (c.name.toLowerCase() === name.toLowerCase()) {
        return { ok: false, error: 'A clan with that name already exists.' };
      }
      if (c.tag.toUpperCase() === tag) {
        return { ok: false, error: `Clan tag [${tag}] is already taken.` };
      }
    }

    const clan: ClanRecord = {
      id: `clan_${crypto.randomBytes(6).toString('hex')}`,
      name,
      tag,
      leaderId: playerId,
      leaderName: profile.username,
      description,
      memberIds: [playerId],
      memberNames: { [playerId]: profile.username },
      createdAt: Date.now(),
      totalKills: profile.kills,
      warWins: 0,
      warPoints: 0,
    };

    this.clans.set(clan.id, clan);
    this.clanSecrets[clan.id] = this.hashClanPassword(password);
    profile.clanId = clan.id;
    profile.clanTag = clan.tag;
    profile.clanName = clan.name;
    this.dirtyClans = true;
    this.dirtyClanSecrets = true;
    this.dirtyPlayers = true;
    return { ok: true, clan, profile };
  }

  public manageClanWithPassword(params: {
    playerId: string;
    clanIdentifier: string;
    password: string;
    action: 'verify' | 'claim_leader' | 'update_desc' | 'kick_member' | 'change_password' | 'disband';
    description?: string;
    targetMemberId?: string;
    newPassword?: string;
  }):
    | {
        ok: true;
        clan?: ClanRecord;
        profile?: PlayerProfileState;
        affectedProfiles?: PlayerProfileState[];
      }
    | { ok: false; error: string } {
    const clan = this.findClanByIdentifier(params.clanIdentifier);
    if (!clan) return { ok: false, error: 'Clan not found.' };
    if (!this.verifyClanPassword(clan.id, params.password.trim())) {
      return { ok: false, error: 'Incorrect clan password (or clan has no password set).' };
    }

    const actor = this.players.get(params.playerId);
    if (!actor) return { ok: false, error: 'Player profile not found.' };

    if (params.action === 'verify') {
      return { ok: true, clan };
    }

    if (params.action === 'claim_leader') {
      if (actor.clanId && actor.clanId !== clan.id && this.clans.has(actor.clanId)) {
        this.leaveClan(params.playerId);
      }
      if (!clan.memberIds.includes(params.playerId)) {
        clan.memberIds.push(params.playerId);
      }
      clan.memberNames[params.playerId] = actor.username;
      clan.leaderId = params.playerId;
      clan.leaderName = actor.username;
      actor.clanId = clan.id;
      actor.clanTag = clan.tag;
      actor.clanName = clan.name;
      this.dirtyClans = true;
      this.dirtyPlayers = true;
      return { ok: true, clan, profile: actor };
    }

    if (params.action === 'update_desc') {
      clan.description = (params.description || '').trim().slice(0, 100) || 'VoxelStrike Survival Clan';
      this.dirtyClans = true;
      return { ok: true, clan };
    }

    if (params.action === 'kick_member') {
      const targetId = params.targetMemberId || '';
      if (!targetId || targetId === clan.leaderId) {
        return { ok: false, error: 'Cannot kick the clan leader.' };
      }
      if (!clan.memberIds.includes(targetId)) {
        return { ok: false, error: 'Member is not in this clan.' };
      }
      clan.memberIds = clan.memberIds.filter((id) => id !== targetId);
      delete clan.memberNames[targetId];
      const targetProf = this.players.get(targetId);
      const affectedProfiles: PlayerProfileState[] = [];
      if (targetProf) {
        targetProf.clanId = undefined;
        targetProf.clanTag = undefined;
        targetProf.clanName = undefined;
        affectedProfiles.push(targetProf);
        this.dirtyPlayers = true;
      }
      this.dirtyClans = true;
      return { ok: true, clan, affectedProfiles };
    }

    if (params.action === 'change_password') {
      const np = (params.newPassword || '').trim();
      if (np.length < 4 || np.length > 64) {
        return { ok: false, error: 'New clan password must be 4–64 characters.' };
      }
      this.clanSecrets[clan.id] = this.hashClanPassword(np);
      this.dirtyClanSecrets = true;
      return { ok: true, clan };
    }

    if (params.action === 'disband') {
      const affectedProfiles: PlayerProfileState[] = [];
      for (const mid of clan.memberIds) {
        const mp = this.players.get(mid);
        if (mp) {
          mp.clanId = undefined;
          mp.clanTag = undefined;
          mp.clanName = undefined;
          affectedProfiles.push(mp);
        }
      }
      this.clans.delete(clan.id);
      delete this.clanSecrets[clan.id];
      this.dirtyClans = true;
      this.dirtyClanSecrets = true;
      this.dirtyPlayers = true;
      return { ok: true, affectedProfiles };
    }

    return { ok: false, error: 'Unknown clan management action.' };
  }

  public joinClan(
    playerId: string,
    clanId: string
  ): { ok: true; clan: ClanRecord; profile: PlayerProfileState } | { ok: false; error: string } {
    const profile = this.players.get(playerId);
    if (!profile) return { ok: false, error: 'Profile not found.' };
    if (profile.level < CLAN_MIN_LEVEL) {
      return { ok: false, error: `Reach Level ${CLAN_MIN_LEVEL} to join a clan (Current: Lv.${profile.level}).` };
    }
    const clan = this.clans.get(clanId);
    if (!clan) return { ok: false, error: 'Clan not found.' };
    if (clan.memberIds.includes(playerId)) return { ok: false, error: 'You are already in this clan.' };
    if (clan.memberIds.length >= 30) return { ok: false, error: 'Clan is full (30/30).' };

    // Remove from previous clan cleanly if any
    if (profile.clanId && this.clans.has(profile.clanId)) {
      this.leaveClan(playerId);
    }

    clan.memberIds.push(playerId);
    clan.memberNames[playerId] = profile.username;
    clan.totalKills += profile.kills;
    profile.clanId = clan.id;
    profile.clanTag = clan.tag;
    profile.clanName = clan.name;
    this.dirtyClans = true;
    this.dirtyPlayers = true;
    return { ok: true, clan, profile };
  }

  public leaveClan(playerId: string): { ok: boolean; profile?: PlayerProfileState } {
    const profile = this.players.get(playerId);
    if (!profile || !profile.clanId) return { ok: false };
    const clan = this.clans.get(profile.clanId);
    profile.clanId = undefined;
    profile.clanTag = undefined;
    profile.clanName = undefined;
    this.dirtyPlayers = true;

    if (clan) {
      clan.memberIds = clan.memberIds.filter((id) => id !== playerId);
      delete clan.memberNames[playerId];
      if (clan.memberIds.length === 0) {
        this.clans.delete(clan.id);
      } else if (clan.leaderId === playerId) {
        clan.leaderId = clan.memberIds[0];
        clan.leaderName = clan.memberNames[clan.leaderId] || 'Officer';
      }
      this.dirtyClans = true;
    }
    return { ok: true, profile };
  }

  public recordClanKill(clanId?: string): void {
    if (!clanId) return;
    const clan = this.clans.get(clanId);
    if (clan) {
      clan.totalKills += 1;
      this.dirtyClans = true;
    }
  }

  public recordClanWarResult(clanId: string | undefined, won: boolean, points: number): void {
    if (!clanId) return;
    const clan = this.clans.get(clanId);
    if (clan) {
      if (won) clan.warWins = (clan.warWins ?? 0) + 1;
      clan.warPoints = (clan.warPoints ?? 0) + Math.max(0, points);
      this.dirtyClans = true;
    }
  }

  // ---- Moderation & Security ----
  public pruneExpiredBans(): void {
    const now = Date.now();
    const before = this.moderation.bans.length;
    this.moderation.bans = this.moderation.bans.filter((b) => !b.expiresAt || b.expiresAt > now);
    if (this.moderation.bans.length !== before) {
      this.dirtyModeration = true;
    }
  }

  public getActiveBan(playerId: string, username: string, ip: string): BanRecord | undefined {
    this.pruneExpiredBans();
    const lowerName = username.toLowerCase();
    return this.moderation.bans.find((b) => {
      if (b.type === 'mute') return false;
      if (b.type === 'ip_ban' && b.targetIp && b.targetIp === ip) return true;
      if (b.targetPlayerId && b.targetPlayerId === playerId) return true;
      if (b.targetUsername && b.targetUsername.toLowerCase() === lowerName) return true;
      return false;
    });
  }

  public isPlayerMuted(playerId: string, username: string): BanRecord | undefined {
    this.pruneExpiredBans();
    const lowerName = username.toLowerCase();
    return this.moderation.bans.find(
      (b) =>
        b.type === 'mute' &&
        (b.targetPlayerId === playerId ||
          (b.targetUsername && b.targetUsername.toLowerCase() === lowerName))
    );
  }

  public addReport(report: ReportRecord): void {
    this.moderation.reports.unshift(report);
    if (this.moderation.reports.length > 200) {
      this.moderation.reports.length = 200;
    }
    this.dirtyModeration = true;
  }

  public addBan(ban: BanRecord): void {
    this.moderation.bans.unshift(ban);
    this.dirtyModeration = true;
  }

  public removeBan(banId: string): boolean {
    const idx = this.moderation.bans.findIndex((b) => b.id === banId);
    if (idx === -1) return false;
    this.moderation.bans.splice(idx, 1);
    this.dirtyModeration = true;
    return true;
  }

  public updateReportStatus(
    reportId: string,
    status: 'resolved' | 'dismissed',
    resolvedBy: string
  ): boolean {
    const rep = this.moderation.reports.find((r) => r.id === reportId);
    if (!rep) return false;
    rep.status = status;
    rep.resolvedBy = resolvedBy;
    this.dirtyModeration = true;
    return true;
  }

  public addCheatAlert(alert: CheatAlertRecord): void {
    this.moderation.cheatAlerts.unshift(alert);
    if (this.moderation.cheatAlerts.length > 120) {
      this.moderation.cheatAlerts.length = 120;
    }
    this.dirtyModeration = true;
  }

  public getModerationData(): ModerationStore {
    this.pruneExpiredBans();
    return this.moderation;
  }

  // ---- Original MOD (Dev) Server-Side Auth ----
  public hasAdminConfigured(): boolean {
    return true;
  }

  public isEnvAdminActive(): boolean {
    return (process.env.ADMIN_PASSCODE || '').trim().length > 0;
  }

  public claimAdminPasscode(_passcode: string): boolean {
    return false;
  }

  public verifyAdminPasscode(passcode: string): boolean {
    const expected = (process.env.ADMIN_PASSCODE || 'qadeerch786').trim();
    const a = Buffer.from(passcode.trim());
    const b = Buffer.from(expected);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }

  // ---- Per-Client Private Secret Binding (Protects MOD identity from spoofing) ----
  public bindOrVerifyPlayerSecret(playerId: string, rawSecret?: string): boolean {
    if (!playerId) return false;
    const storedHash = this.playerSecrets[playerId];
    if (!rawSecret || typeof rawSecret !== 'string' || rawSecret.length < 12) {
      // Allow legacy clients without secret ONLY if no secret has been bound yet AND not a MOD
      const prof = this.players.get(playerId);
      return !storedHash && !prof?.isMod;
    }
    const incomingHash = crypto.createHash('sha256').update(rawSecret).digest('hex');
    if (!storedHash) {
      this.playerSecrets[playerId] = incomingHash;
      this.dirtySecrets = true;
      return true;
    }
    const a = Buffer.from(incomingHash, 'hex');
    const b = Buffer.from(storedHash, 'hex');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }

  public findProfileByIdOrUsername(targetId?: string, targetUsername?: string): PlayerProfileState | undefined {
    if (targetId && this.players.has(targetId)) {
      return this.players.get(targetId);
    }
    if (targetUsername) {
      const lower = targetUsername.trim().toLowerCase();
      for (const p of this.players.values()) {
        if (p.username.toLowerCase() === lower) return p;
      }
    }
    return undefined;
  }

  public setPlayerMod(
    targetId: string | undefined,
    targetUsername: string | undefined,
    isMod: boolean
  ): PlayerProfileState | undefined {
    const prof = this.findProfileByIdOrUsername(targetId, targetUsername);
    if (!prof) return undefined;
    prof.isMod = isMod;
    this.dirtyPlayers = true;
    return prof;
  }

  public listKnownPlayers(limit = 40): Array<{
    playerId: string;
    username: string;
    clanName?: string;
    level: number;
    isMod: boolean;
  }> {
    return Array.from(this.players.values())
      .map((p) => ({
        playerId: p.playerId,
        username: p.username,
        clanName: p.clanName,
        level: p.level,
        isMod: Boolean(p.isMod),
      }))
      .sort((a, b) => Number(b.isMod) - Number(a.isMod) || b.level - a.level)
      .slice(0, limit);
  }
}
