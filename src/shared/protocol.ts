import type { BlockType, GameModeId, SpawnZone } from './constants.ts';

export interface InventorySlot {
  itemId: string;
  count: number;
}

export interface ClanRecord {
  id: string;
  name: string;
  tag: string;
  leaderId: string;
  leaderName: string;
  description: string;
  memberIds: string[];
  memberNames: Record<string, string>;
  createdAt: number;
  totalKills: number;
  warWins?: number;
  warPoints?: number;
}

export type TeamSide = 'red' | 'blue';

export interface FlagRuntimeState {
  team: TeamSide;
  state: 'base' | 'carried';
  x: number;
  y: number;
  z: number;
  baseX: number;
  baseY: number;
  baseZ: number;
  carrierId?: string;
  carrierName?: string;
}

export interface ModeMatchState {
  mode: GameModeId;
  roomId: string;
  status: 'waiting' | 'active' | 'ended';
  selfTeam?: TeamSide;
  redLabel: string;
  blueLabel: string;
  redScore: number;
  blueScore: number;
  targetScore: number;
  endsAt?: number;
  waitingText?: string;
  winnerTeam?: TeamSide;
  winnerName?: string;
  didWin?: boolean;
  xpAwarded?: number;
  coinsAwarded?: number;
  flags?: {
    red: FlagRuntimeState;
    blue: FlagRuntimeState;
  };
}

export interface PlayerPublicState {
  id: string;
  username: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  hp: number;
  maxHp: number;
  alive: boolean;
  sprinting: boolean;
  crouching?: boolean;
  heldItemId: string;
  skinId: string;
  gunSkinId: string;
  clanTag?: string;
  clanName?: string;
  isMod?: boolean;
  team?: TeamSide;
  carryingFlag?: TeamSide;
  level: number;
  kills: number;
  deaths: number;
  blocksMined: number;
  muted: boolean;
}

export interface PlayerProfileState {
  playerId: string;
  username: string;
  coins: number;
  xp: number;
  level: number;
  kills: number;
  deaths: number;
  blocksMined: number;
  skinId: string;
  unlockedSkins: string[];
  gunSkinId: string;
  unlockedGunSkins: string[];
  unlockedGuns: string[];
  gunMags: Record<string, number>;
  pickaxeTier: number;
  rifleDamageBonus: number;
  clanId?: string;
  clanTag?: string;
  clanName?: string;
  isMod?: boolean;
  inventory: InventorySlot[];
  hotbarSlots: string[];
  ammoInMag: number;
}

export interface ChatMessage {
  id: string;
  playerId: string;
  username: string;
  clanTag?: string;
  clanName?: string;
  isMod?: boolean;
  text: string;
  timestamp: number;
  system?: boolean;
  isTip?: boolean;
}

export interface KillFeedEvent {
  id: string;
  killerName: string;
  victimName: string;
  weapon: string;
  timestamp: number;
}

export interface BlockModEntry {
  x: number;
  y: number;
  z: number;
  blockId: BlockType;
}

export interface WorldDropState {
  id: string;
  itemId: string;
  count: number;
  x: number;
  y: number;
  z: number;
}

export interface LeaderboardEntry {
  playerId: string;
  username: string;
  clanTag?: string;
  clanName?: string;
  isMod?: boolean;
  level: number;
  xp: number;
  kills: number;
  blocksMined: number;
  coins: number;
}

export interface ReportRecord {
  id: string;
  reporterId: string;
  reporterName: string;
  targetId: string;
  targetName: string;
  reason: string;
  details: string;
  timestamp: number;
  status: 'pending' | 'resolved' | 'dismissed';
  resolvedBy?: string;
}

export interface CheatAlertRecord {
  id: string;
  playerId: string;
  username: string;
  type: 'speed' | 'teleport' | 'fly' | 'reach' | 'firerate' | 'occlusion';
  detail: string;
  timestamp: number;
}

export interface BanRecord {
  id: string;
  targetPlayerId?: string;
  targetUsername?: string;
  targetIp?: string;
  type: 'mute' | 'temp_ban' | 'perm_ban' | 'ip_ban';
  reason: string;
  createdAt: number;
  expiresAt?: number;
  issuedBy: string;
}

export type ClientWsMessage =
  | {
      type: 'auth:join';
      playerId: string;
      playerSecret?: string;
      username: string;
      zoneId: SpawnZone['id'];
      skinId: string;
      gunSkinId?: string;
      mode?: GameModeId;
      opponentClanId?: string;
    }
  | {
      type: 'mode:rematch';
    }
  | {
      type: 'net:ping';
      t: number;
    }
  | {
      type: 'player:move';
      x: number;
      y: number;
      z: number;
      yaw: number;
      pitch: number;
      sprinting: boolean;
      crouching?: boolean;
      heldItemId: string;
    }
  | {
      type: 'chunk:request';
      chunks: Array<{ cx: number; cz: number }>;
    }
  | {
      type: 'block:mine';
      x: number;
      y: number;
      z: number;
    }
  | {
      type: 'block:place';
      x: number;
      y: number;
      z: number;
      itemId: string;
    }
  | {
      type: 'combat:shoot';
      gunId?: string;
      originX: number;
      originY: number;
      originZ: number;
      dirX: number;
      dirY: number;
      dirZ: number;
    }
  | {
      type: 'weapon:reload';
      gunId?: string;
    }
  | {
      type: 'item:use';
      itemId: string;
    }
  | {
      type: 'craft:make';
      recipeId: string;
      targetHotbarSlot?: number;
    }
  | {
      type: 'player:respawn';
      zoneId?: SpawnZone['id'];
    }
  | {
      type: 'chat:send';
      text: string;
    }
  | {
      type: 'chat:delete';
      messageId: string;
    }
  | {
      type: 'hotbar:set';
      hotbarSlots: string[];
    }
  | {
      type: 'report:submit';
      targetId: string;
      reason: string;
      details: string;
    };

export type ServerWsMessage =
  | {
      type: 'auth:welcome';
      selfId: string;
      profile: PlayerProfileState;
      spawn: { x: number; y: number; z: number };
      onlineCount: number;
      maxPlayers: number;
      recentChat: ChatMessage[];
      modeState?: ModeMatchState;
    }
  | {
      type: 'auth:rejected';
      reason: string;
      expiresAt?: number;
    }
  | {
      type: 'mode:state';
      state: ModeMatchState;
    }
  | {
      type: 'mode:banner';
      text: string;
      tone: 'red' | 'blue' | 'gold' | 'green';
    }
  | {
      type: 'net:pong';
      t: number;
    }
  | {
      type: 'world:players';
      players: PlayerPublicState[];
      onlineCount: number;
    }
  | {
      type: 'player:correction';
      x: number;
      y: number;
      z: number;
      reason: string;
    }
  | {
      type: 'chunk:deltas';
      chunks: Array<{ cx: number; cz: number; mods: BlockModEntry[] }>;
    }
  | {
      type: 'block:update';
      x: number;
      y: number;
      z: number;
      blockId: BlockType;
      byPlayerId?: string;
    }
  | {
      type: 'inventory:sync';
      profile: PlayerProfileState;
      equipSlot?: number;
    }
  | {
      type: 'drops:sync';
      drops: WorldDropState[];
    }
  | {
      type: 'drop:spawn';
      drop: WorldDropState;
    }
  | {
      type: 'drop:remove';
      id: string;
      byPlayerId?: string;
    }
  | {
      type: 'combat:tracer';
      shooterId: string;
      startX: number;
      startY: number;
      startZ: number;
      endX: number;
      endY: number;
      endZ: number;
      hitPlayerId?: string;
    }
  | {
      type: 'combat:damaged';
      hp: number;
      maxHp: number;
      attackerName: string;
    }
  | {
      type: 'combat:kill';
      event: KillFeedEvent;
    }
  | {
      type: 'player:respawned';
      x: number;
      y: number;
      z: number;
      hp: number;
      ammoInMag: number;
    }
  | {
      type: 'chat:message';
      message: ChatMessage;
    }
  | {
      type: 'chat:deleted';
      messageId: string;
    }
  | {
      type: 'system:notice';
      level: 'info' | 'warning' | 'error';
      text: string;
    }
  | {
      type: 'report:ack';
      text: string;
    };
