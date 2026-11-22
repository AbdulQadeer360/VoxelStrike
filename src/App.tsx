import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Home, Play, RotateCcw, Settings, ShieldAlert, Skull } from 'lucide-react';
import { buildGameTips, GameHUD } from './components/GameHUD.tsx';
import { HomeMenu, type HomeTab } from './components/HomeMenu.tsx';
import {
  AboutUsModal,
  ClansModal,
  CreatorsDiscordModal,
  CreditsModal,
  GunsArmoryModal,
  InventoryCraftModal,
  LeaderboardSettingsModal,
  ModerationModal,
  RulesModal,
  ScoreboardReportModal,
  ShopSkinsModal,
  UsernamePromptModal,
  WorldMapModal,
} from './components/Modals.tsx';
import { audioEngine } from './game/audio.ts';
import { VoxelEngine, type EngineSettings } from './game/VoxelEngine.ts';
import {
  DEFAULT_KEYBINDINGS,
  getQuickConvertTargets,
  MAX_PLAYERS,
  type KeyActionId,
  type KeybindingsConfig,
  type SpawnZone,
} from './shared/constants.ts';
import type {
  ChatMessage,
  ClientWsMessage,
  KillFeedEvent,
  PlayerProfileState,
  PlayerPublicState,
  ServerWsMessage,
} from './shared/protocol.ts';

function getOrCreatePlayerId(): string {
  try {
    let id = localStorage.getItem('terravox_player_id');
    if (!id) {
      id = `tv_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
      localStorage.setItem('terravox_player_id', id);
    }
    return id;
  } catch {
    return `tv_${Math.random().toString(36).slice(2, 10)}`;
  }
}

function getOrCreatePlayerSecret(): string {
  try {
    let sec = localStorage.getItem('terravox_player_secret');
    if (!sec) {
      const bytes = new Uint8Array(24);
      crypto.getRandomValues(bytes);
      sec = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
      localStorage.setItem('terravox_player_secret', sec);
    }
    return sec;
  } catch {
    return `sec_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
  }
}

function loadSavedKeybinds(): KeybindingsConfig {
  try {
    const raw = localStorage.getItem('voxelstrike_keybinds_v2');
    if (!raw) return { ...DEFAULT_KEYBINDINGS };
    const parsed = JSON.parse(raw) as Partial<KeybindingsConfig>;
    const merged: KeybindingsConfig = { ...DEFAULT_KEYBINDINGS };
    for (const k of Object.keys(DEFAULT_KEYBINDINGS) as KeyActionId[]) {
      if (typeof parsed[k] === 'string' && parsed[k]!.length > 0) {
        merged[k] = parsed[k]!;
      }
    }
    return merged;
  } catch {
    return { ...DEFAULT_KEYBINDINGS };
  }
}

const DEFAULT_PROFILE: PlayerProfileState = {
  playerId: 'local',
  username: 'Explorer',
  coins: 60,
  xp: 0,
  level: 1,
  kills: 0,
  deaths: 0,
  blocksMined: 0,
  skinId: 'ranger',
  unlockedSkins: ['ranger'],
  gunSkinId: 'carbon',
  unlockedGunSkins: ['carbon'],
  unlockedGuns: ['rifle'],
  gunMags: { rifle: 30, smg: 36, shotgun: 8, sniper: 5 },
  pickaxeTier: 1,
  rifleDamageBonus: 0,
  inventory: [
    { itemId: 'rifle', count: 1 },
    { itemId: 'pickaxe', count: 1 },
    { itemId: 'ammo', count: 90 },
  ],
  hotbarSlots: ['rifle', 'pickaxe', '', '', '', '', '', '', ''],
  ammoInMag: 30,
};

export default function App() {
  const canvasMountRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<VoxelEngine | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const playerIdRef = useRef<string>(getOrCreatePlayerId());
  const playerSecretRef = useRef<string>(getOrCreatePlayerSecret());

  const [screen, setScreen] = useState<'menu' | 'playing'>('menu');
  const screenRef = useRef<'menu' | 'playing'>('menu');
  screenRef.current = screen;

  const [profile, setProfile] = useState<PlayerProfileState>({
    ...DEFAULT_PROFILE,
    playerId: playerIdRef.current,
  });
  const profileRef = useRef(profile);
  profileRef.current = profile;

  const [needsUsername, setNeedsUsername] = useState<boolean>(() => {
    try {
      return !localStorage.getItem('terravox_username_set');
    } catch {
      return true;
    }
  });
  const [rulesAccepted, setRulesAccepted] = useState<boolean>(() => {
    try {
      return localStorage.getItem('voxelstrike_rules_accepted_v1') === '1';
    } catch {
      return false;
    }
  });
  const rulesAcceptedRef = useRef(rulesAccepted);
  rulesAcceptedRef.current = rulesAccepted;
  const pendingPlayAfterRulesRef = useRef(false);

  const [selectedZone, setSelectedZone] = useState<SpawnZone['id']>('frontier');
  const [onlineCount, setOnlineCount] = useState(0);
  const [maxPlayers, setMaxPlayers] = useState(MAX_PLAYERS);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);

  // Modals
  const [homeModal, setHomeModal] = useState<HomeTab | null>(null);
  const [gameModal, setGameModal] = useState<
    'map' | 'craft' | 'scoreboard' | 'leaderboard' | 'pause' | 'settings' | null
  >(null);
  const gameModalRef = useRef(gameModal);
  gameModalRef.current = gameModal;

  const [quickConvertOpen, setQuickConvertOpen] = useState(false);
  const quickConvertOpenRef = useRef(false);
  quickConvertOpenRef.current = quickConvertOpen;

  // In-game live state
  const [hp, setHp] = useState(100);
  const [maxHp, setMaxHp] = useState(100);
  const [alive, setAlive] = useState(true);
  const aliveRef = useRef(true);
  aliveRef.current = alive;
  const [killedBy, setKilledBy] = useState<string | null>(null);

  const [activeSlot, setActiveSlot] = useState(0);
  const activeSlotRef = useRef(0);
  activeSlotRef.current = activeSlot;

  const [coords, setCoords] = useState({ x: 0, y: 24, z: 0 });
  const [yaw, setYaw] = useState(0);
  const [crouching, setCrouching] = useState(false);
  const [scoped, setScoped] = useState(false);
  const [targetBlockName, setTargetBlockName] = useState<string | null>(null);
  const [mineProgress, setMineProgress] = useState(0);
  const [reloadProgress, setReloadProgress] = useState(0);
  const [pointerLocked, setPointerLocked] = useState(false);
  const [hitmarkerAt, setHitmarkerAt] = useState(0);
  const [damageFlashAt, setDamageFlashAt] = useState(0);
  const [remotePlayers, setRemotePlayers] = useState<PlayerPublicState[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatOpen, setChatOpen] = useState(false);
  const chatOpenRef = useRef(false);
  chatOpenRef.current = chatOpen;
  const [killFeed, setKillFeed] = useState<KillFeedEvent[]>([]);
  const [killBanner, setKillBanner] = useState<KillFeedEvent | null>(null);
  const killBannerTimerRef = useRef<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [settings, setSettings] = useState<EngineSettings>({
    fov: 75,
    renderDistance: 5,
    sensitivity: 0.0022,
  });

  const [keybinds, setKeybinds] = useState<KeybindingsConfig>(loadSavedKeybinds);
  const keybindsRef = useRef(keybinds);
  keybindsRef.current = keybinds;

  const [touchEnabled, setTouchEnabled] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return 'ontouchstart' in window && window.innerWidth >= 600 && navigator.maxTouchPoints > 0;
  });

  const sendWs = useCallback((msg: ClientWsMessage) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }, []);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => {
      setToast((curr) => (curr === msg ? null : curr));
    }, 3200);
  }, []);

  // Load initial profile & server info
  useEffect(() => {
    const pid = playerIdRef.current;
    fetch(`/api/profile/${encodeURIComponent(pid)}`, {
      headers: { 'x-player-secret': playerSecretRef.current },
    })
      .then((r) => r.json())
      .then((d) => {
        if (d.profile) {
          setProfile(d.profile);
          engineRef.current?.setSkin(d.profile.skinId);
          engineRef.current?.setGunSkin(d.profile.gunSkinId || 'carbon');
          if (d.profile.username && d.profile.username !== 'Explorer') {
            try {
              localStorage.setItem('terravox_username_set', '1');
              setNeedsUsername(false);
            } catch {
              // ignore storage errors
            }
          } else {
            setNeedsUsername(true);
          }
        }
      })
      .catch(() => {});

    const refreshInfo = () => {
      fetch('/api/server/info')
        .then((r) => r.json())
        .then((d) => {
          if (typeof d.onlineCount === 'number') setOnlineCount(d.onlineCount);
          if (typeof d.maxPlayers === 'number') setMaxPlayers(d.maxPlayers);
        })
        .catch(() => {});
    };
    refreshInfo();
    const timer = setInterval(refreshInfo, 6000);
    return () => clearInterval(timer);
  }, []);

  // Mount Three.js VoxelEngine once in isolated container
  useEffect(() => {
    const el = canvasMountRef.current;
    if (!el) return;

    const engine = new VoxelEngine(el, {
      onMoveSend: (st) => {
        sendWs({ type: 'player:move', ...st });
      },
      onRequestChunks: (chunks) => {
        sendWs({ type: 'chunk:request', chunks });
      },
      onMineBlock: (x, y, z) => {
        sendWs({ type: 'block:mine', x, y, z });
      },
      onPlaceBlock: (x, y, z, itemId) => {
        sendWs({ type: 'block:place', x, y, z, itemId });
      },
      onShoot: (origin, dir, gunId) => {
        sendWs({
          type: 'combat:shoot',
          gunId,
          originX: origin.x,
          originY: origin.y,
          originZ: origin.z,
          dirX: dir.x,
          dirY: dir.y,
          dirZ: dir.z,
        });
      },
      onReloadRequest: (gunId) => {
        sendWs({ type: 'weapon:reload', gunId });
      },
      onUseMedkit: () => {
        sendWs({ type: 'item:use', itemId: 'medkit' });
      },
      onHudTick: (hud) => {
        setCoords({ x: hud.x, y: hud.y, z: hud.z });
        setYaw(hud.yaw);
        setCrouching(hud.crouching);
        setScoped(hud.scoped);
        setTargetBlockName(hud.targetBlockName);
        setMineProgress(hud.mineProgress);
        setReloadProgress(hud.reloadProgress);
        setPointerLocked(hud.pointerLocked);
      },
      onPointerLockChange: (locked) => {
        setPointerLocked(locked);
      },
    });

    engine.setKeybinds(keybindsRef.current);
    engineRef.current = engine;
    return () => {
      engine.dispose();
      engineRef.current = null;
    };
  }, [sendWs]);

  useEffect(() => {
    engineRef.current?.setKeybinds(keybinds);
    try {
      localStorage.setItem('voxelstrike_keybinds_v2', JSON.stringify(keybinds));
    } catch {
      // ignore storage errors
    }
  }, [keybinds]);

  // Sync held item, gun mags & skins to engine whenever profile or slot changes
  useEffect(() => {
    if (activeSlot < 0 || activeSlot >= 9) {
      setActiveSlot(0);
      return;
    }
    const engine = engineRef.current;
    const itemId = profile.hotbarSlots[activeSlot] || '';
    if (quickConvertOpen && (!itemId || !getQuickConvertTargets(itemId))) {
      setQuickConvertOpen(false);
    }
    if (!engine) return;
    engine.setHeldItem(itemId);
    const reserve = profile.inventory.find((s) => s.itemId === 'ammo')?.count ?? 0;
    engine.setGunMags(profile.gunMags || { rifle: profile.ammoInMag }, reserve);
    engine.setPickaxeTier(profile.pickaxeTier);
    engine.setSkin(profile.skinId);
    engine.setGunSkin(profile.gunSkinId || 'carbon');
  }, [profile, activeSlot, quickConvertOpen]);

  // In-game & menu Escape / keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Escape') {
        if (homeModal) {
          setHomeModal(null);
          return;
        }
        if (quickConvertOpenRef.current) {
          setQuickConvertOpen(false);
          return;
        }
        if (gameModalRef.current) {
          setGameModal(null);
          if (!touchEnabled) engineRef.current?.requestPointerLock();
          return;
        }
      }
      if (screenRef.current !== 'playing') return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (e.code >= 'Digit1' && e.code <= 'Digit9') {
        const idx = Number(e.code.replace('Digit', '')) - 1;
        if (quickConvertOpenRef.current && (idx === 0 || idx === 1)) {
          const heldId = profileRef.current.hotbarSlots[activeSlotRef.current] || '';
          const targets = heldId ? getQuickConvertTargets(heldId) : null;
          const recipeId = idx === 0 ? targets?.wallRecipeId : targets?.stairsRecipeId;
          if (recipeId) {
            e.preventDefault();
            audioEngine.playUiClick();
            sendWs({
              type: 'craft:make',
              recipeId,
              targetHotbarSlot: Math.max(2, activeSlotRef.current),
            });
            setQuickConvertOpen(false);
            return;
          }
        }
        if (idx >= 0 && idx < 9) {
          setQuickConvertOpen(false);
          setActiveSlot(idx);
          audioEngine.playUiClick();
        }
        return;
      }

      const kb = keybindsRef.current;

      if (e.code === kb.craft) {
        e.preventDefault();
        setQuickConvertOpen(false);
        if (gameModalRef.current === 'craft') {
          setGameModal(null);
          if (!touchEnabled) engineRef.current?.requestPointerLock();
        } else {
          engineRef.current?.exitPointerLock();
          setGameModal('craft');
        }
        return;
      }

      if (e.code === kb.quickConvert && !chatOpenRef.current && !gameModalRef.current) {
        e.preventDefault();
        const heldId = profileRef.current.hotbarSlots[activeSlotRef.current] || '';
        const targets = heldId ? getQuickConvertTargets(heldId) : null;
        if (targets) {
          audioEngine.playUiClick();
          setQuickConvertOpen((v) => !v);
        } else {
          showToast(
            'Hold any block in hand (Wood, Stone, Sand, Dirt...) and press K to convert to Wall or Stairs!'
          );
        }
        return;
      }

      if (e.code === kb.leaderboard) {
        e.preventDefault();
        setQuickConvertOpen(false);
        if (gameModalRef.current === 'leaderboard') {
          setGameModal(null);
          if (!touchEnabled) engineRef.current?.requestPointerLock();
        } else {
          engineRef.current?.exitPointerLock();
          setGameModal('leaderboard');
        }
        return;
      }

      if (e.code === 'Tab') {
        e.preventDefault();
        setQuickConvertOpen(false);
        if (gameModalRef.current === 'scoreboard') {
          setGameModal(null);
          if (!touchEnabled) engineRef.current?.requestPointerLock();
        } else {
          engineRef.current?.exitPointerLock();
          setGameModal('scoreboard');
        }
        return;
      }

      if (e.code === kb.map) {
        e.preventDefault();
        setQuickConvertOpen(false);
        if (gameModalRef.current === 'map') {
          setGameModal(null);
          if (!touchEnabled) engineRef.current?.requestPointerLock();
        } else if (!chatOpenRef.current) {
          engineRef.current?.exitPointerLock();
          setGameModal('map');
        }
        return;
      }

      if (e.code === kb.chat || e.code === 'Enter') {
        if (!chatOpenRef.current && !gameModalRef.current) {
          e.preventDefault();
          setQuickConvertOpen(false);
          engineRef.current?.exitPointerLock();
          setChatOpen(true);
        }
        return;
      }

      if (e.code === kb.medkit && aliveRef.current && !gameModalRef.current) {
        sendWs({ type: 'item:use', itemId: 'medkit' });
        return;
      }

      if (e.code === 'KeyP') {
        setQuickConvertOpen(false);
        if (gameModalRef.current === 'pause') {
          setGameModal(null);
          if (!touchEnabled) engineRef.current?.requestPointerLock();
        } else {
          engineRef.current?.exitPointerLock();
          setGameModal('pause');
        }
      }
    };

    const onWheel = (e: WheelEvent) => {
      if (screenRef.current !== 'playing' || gameModalRef.current || chatOpenRef.current) return;
      const dir = e.deltaY > 0 ? 1 : -1;
      setQuickConvertOpen(false);
      setActiveSlot((prev) => (prev + dir + 9) % 9);
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('wheel', onWheel);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('wheel', onWheel);
    };
  }, [sendWs, homeModal, touchEnabled, showToast]);

  // Periodic green game tips in multiplayer chat feed
  useEffect(() => {
    if (screen !== 'playing') return;
    let tipIdx = 0;
    const pushTip = () => {
      const tips = buildGameTips(keybindsRef.current);
      const text = tips[tipIdx % tips.length];
      tipIdx += 1;
      setChatMessages((prev) => [
        ...prev.slice(-30),
        {
          id: `tip_${Date.now()}_${tipIdx}`,
          playerId: 'tips',
          username: 'TIP',
          text,
          timestamp: Date.now(),
          isTip: true,
        },
      ]);
    };
    const interval = window.setInterval(pushTip, 60000);
    return () => {
      window.clearInterval(interval);
    };
  }, [screen]);

  // Connect WebSocket & Enter Single Shared World
  const handlePlay = useCallback(
    (zoneId: SpawnZone['id'] = 'frontier') => {
      if (!rulesAcceptedRef.current) {
        pendingPlayAfterRulesRef.current = true;
        return;
      }
      audioEngine.playUiClick();
      setConnectionError(null);
      setSelectedZone(zoneId);
      setHomeModal(null);
      setGameModal(null);

      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }

      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${proto}//${window.location.host}/ws`);
      wsRef.current = ws;

      ws.onopen = () => {
        ws.send(
          JSON.stringify({
            type: 'auth:join',
            playerId: playerIdRef.current,
            playerSecret: playerSecretRef.current,
            username: profileRef.current.username,
            zoneId,
            skinId: profileRef.current.skinId,
            gunSkinId: profileRef.current.gunSkinId,
          } satisfies ClientWsMessage)
        );
      };

      ws.onmessage = (evt) => {
        let msg: ServerWsMessage;
        try {
          msg = JSON.parse(String(evt.data)) as ServerWsMessage;
        } catch {
          return;
        }

        if (msg.type === 'auth:rejected') {
          setConnectionError(msg.reason);
          setScreen('menu');
          engineRef.current?.setMode('menu');
          ws.close();
          return;
        }

        if (msg.type === 'auth:welcome') {
          setProfile(msg.profile);
          setOnlineCount(msg.onlineCount);
          setMaxPlayers(msg.maxPlayers);
          setChatMessages(msg.recentChat);
          setHp(100);
          setMaxHp(100);
          setAlive(true);
          setKilledBy(null);
          setScreen('playing');
          engineRef.current?.setMode('playing');
          engineRef.current?.spawnPlayer(msg.selfId, msg.spawn.x, msg.spawn.y, msg.spawn.z);
          if (!touchEnabled) {
            setTimeout(() => engineRef.current?.requestPointerLock(), 80);
          }
          return;
        }

        if (msg.type === 'world:players') {
          setRemotePlayers(msg.players);
          setOnlineCount(msg.onlineCount);
          engineRef.current?.syncRemotePlayers(msg.players);
          const self = msg.players.find((p) => p.id === playerIdRef.current);
          if (self) {
            setHp(self.hp);
            setMaxHp(self.maxHp);
            setAlive(self.alive);
            engineRef.current?.setAlive(self.alive);
          }
          return;
        }

        if (msg.type === 'player:correction') {
          engineRef.current?.setServerCorrection(msg.x, msg.y, msg.z);
          return;
        }

        if (msg.type === 'chunk:deltas') {
          engineRef.current?.applyChunkDeltas(msg.chunks);
          return;
        }

        if (msg.type === 'block:update') {
          engineRef.current?.applyBlockUpdate(msg.x, msg.y, msg.z, msg.blockId, msg.byPlayerId);
          return;
        }

        if (msg.type === 'drops:sync') {
          engineRef.current?.syncDrops(msg.drops);
          return;
        }

        if (msg.type === 'drop:spawn') {
          engineRef.current?.spawnDrop(msg.drop);
          return;
        }

        if (msg.type === 'drop:remove') {
          engineRef.current?.removeDrop(msg.id, msg.byPlayerId);
          return;
        }

        if (msg.type === 'inventory:sync') {
          setProfile(msg.profile);
          if (typeof msg.equipSlot === 'number' && msg.equipSlot >= 0 && msg.equipSlot < 9) {
            setActiveSlot(msg.equipSlot);
          }
          return;
        }

        if (msg.type === 'combat:tracer') {
          engineRef.current?.spawnTracer(
            msg.shooterId,
            msg.startX,
            msg.startY,
            msg.startZ,
            msg.endX,
            msg.endY,
            msg.endZ,
            Boolean(msg.hitPlayerId)
          );
          if (msg.shooterId === playerIdRef.current && msg.hitPlayerId) {
            setHitmarkerAt(Date.now());
            audioEngine.playHitmarker();
          }
          return;
        }

        if (msg.type === 'combat:damaged') {
          setHp(msg.hp);
          setMaxHp(msg.maxHp);
          if (msg.attackerName === 'Medkit') {
            showToast(`Healed to ${msg.hp} HP`);
          } else {
            setDamageFlashAt(Date.now());
            engineRef.current?.triggerDamageShake();
          }
          if (msg.hp <= 0) {
            setAlive(false);
            setKilledBy(msg.attackerName);
            engineRef.current?.setAlive(false);
          }
          return;
        }

        if (msg.type === 'combat:kill') {
          setKillFeed((prev) => [msg.event, ...prev].slice(0, 6));
          setKillBanner(msg.event);
          if (killBannerTimerRef.current) {
            window.clearTimeout(killBannerTimerRef.current);
          }
          killBannerTimerRef.current = window.setTimeout(() => {
            setKillBanner(null);
          }, 4500);
          if (
            msg.event.victimName === profileRef.current.username ||
            msg.event.victimName.startsWith(`${profileRef.current.username} (`)
          ) {
            setAlive(false);
            setKilledBy(`${msg.event.killerName} (${msg.event.weapon})`);
            engineRef.current?.setAlive(false);
          }
          return;
        }

        if (msg.type === 'player:respawned') {
          setHp(msg.hp);
          setAlive(true);
          setKilledBy(null);
          engineRef.current?.spawnPlayer(playerIdRef.current, msg.x, msg.y, msg.z);
          if (!touchEnabled) {
            setTimeout(() => engineRef.current?.requestPointerLock(), 60);
          }
          return;
        }

        if (msg.type === 'chat:message') {
          setChatMessages((prev) => [...prev.slice(-30), msg.message]);
          return;
        }

        if (msg.type === 'chat:deleted') {
          setChatMessages((prev) => prev.filter((m) => m.id !== msg.messageId));
          return;
        }

        if (msg.type === 'system:notice' || msg.type === 'report:ack') {
          showToast(msg.text);
        }
      };

      ws.onclose = (ev) => {
        if (screenRef.current === 'playing') {
          setScreen('menu');
          engineRef.current?.setMode('menu');
          if (ev.code !== 1000 && ev.code !== 4000) {
            setConnectionError((prev) => prev || 'Disconnected from server.');
          }
        }
      };
    },
    [showToast, touchEnabled]
  );

  const handleReturnMenu = () => {
    audioEngine.playUiClick();
    wsRef.current?.close();
    wsRef.current = null;
    setGameModal(null);
    setChatOpen(false);
    setScreen('menu');
    engineRef.current?.setMode('menu');
  };

  const handleUsernameChange = async (username: string) => {
    const res = await fetch('/api/profile/username', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        playerId: playerIdRef.current,
        playerSecret: playerSecretRef.current,
        username,
      }),
    });
    if (res.ok) {
      const d = await res.json();
      if (d.profile) setProfile(d.profile);
      try {
        localStorage.setItem('terravox_username_set', '1');
      } catch {
        // ignore storage errors
      }
      setNeedsUsername(false);
    } else {
      const d = await res.json().catch(() => ({}));
      showToast(d.error || 'Invalid username');
    }
  };

  const handleGunAction = async (gunId: string) => {
    audioEngine.playUiClick();
    const res = await fetch('/api/guns/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId: playerIdRef.current, gunId }),
    });
    const d = await res.json();
    if (res.ok && d.profile) {
      setProfile(d.profile);
      setActiveSlot(0);
    } else if (d.error) {
      showToast(d.error);
    }
  };

  const handleSkinAction = async (skinId: string) => {
    audioEngine.playUiClick();
    const res = await fetch('/api/skins/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId: playerIdRef.current, skinId }),
    });
    const d = await res.json();
    if (res.ok && d.profile) {
      setProfile(d.profile);
    } else if (d.error) {
      showToast(d.error);
    }
  };

  const handleGunSkinAction = async (gunSkinId: string) => {
    audioEngine.playUiClick();
    const res = await fetch('/api/gun-skins/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId: playerIdRef.current, gunSkinId }),
    });
    const d = await res.json();
    if (res.ok && d.profile) {
      setProfile(d.profile);
    } else if (d.error) {
      showToast(d.error);
    }
  };

  const handleShopBuy = async (itemId: string) => {
    audioEngine.playUiClick();
    const res = await fetch('/api/shop/buy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId: playerIdRef.current, itemId }),
    });
    const d = await res.json();
    if (res.ok && d.profile) {
      setProfile(d.profile);
      showToast('Purchased!');
    } else if (d.error) {
      showToast(d.error);
    }
  };

  const handleAssignHotbar = (slotIdx: number, itemId: string) => {
    audioEngine.playUiClick();
    const next = Array.from({ length: 9 }, (_, i) => profile.hotbarSlots[i] || '');
    const existingIdx = next.indexOf(itemId);
    if (existingIdx !== -1 && existingIdx !== slotIdx) {
      setActiveSlot(existingIdx);
      return;
    }
    const dest = slotIdx >= 0 && slotIdx < 9 ? slotIdx : 2;
    next[dest] = itemId;
    setProfile((p) => ({ ...p, hotbarSlots: next }));
    setActiveSlot(dest);
    sendWs({ type: 'hotbar:set', hotbarSlots: next });
  };

  const handleUpdateSettings = (partial: Partial<EngineSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...partial };
      engineRef.current?.updateSettings(next);
      return next;
    });
  };

  const handleUpdateKeybind = useCallback((action: KeyActionId, code: string) => {
    setKeybinds((prev) => ({ ...prev, [action]: code }));
  }, []);

  const handleResetKeybinds = useCallback(() => {
    setKeybinds({ ...DEFAULT_KEYBINDINGS });
  }, []);

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-slate-950">
      {/* Dedicated Isolated WebGL Canvas Container */}
      <div ref={canvasMountRef} className="fixed inset-0 z-0" />

      {/* Toast Notification */}
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 mc-panel rounded-sm px-4 py-2 text-xs font-bold text-amber-200 mc-text-shadow">
          {toast}
        </div>
      )}

      {/* First-Visit Username Prompt */}
      {screen === 'menu' && needsUsername && (
        <UsernamePromptModal
          defaultName={profile.username}
          onConfirm={(name) => {
            audioEngine.playUiClick();
            handleUsernameChange(name);
          }}
        />
      )}

      {/* First-Visit Mandatory Rules Prompt */}
      {screen === 'menu' && !needsUsername && !rulesAccepted && (
        <RulesModal
          requireAccept
          onAccept={() => {
            audioEngine.playUiClick();
            try {
              localStorage.setItem('voxelstrike_rules_accepted_v1', '1');
            } catch {
              // ignore storage errors
            }
            rulesAcceptedRef.current = true;
            setRulesAccepted(true);
            if (pendingPlayAfterRulesRef.current) {
              pendingPlayAfterRulesRef.current = false;
              handlePlay(selectedZone);
            }
          }}
        />
      )}

      {/* Home Screen */}
      {screen === 'menu' && (
        <HomeMenu
          profile={profile}
          muted={muted}
          connectionError={connectionError}
          onPlay={() => handlePlay('frontier')}
          onUsernameChange={handleUsernameChange}
          onToggleMute={() => {
            const next = !muted;
            setMuted(next);
            audioEngine.setMuted(next);
          }}
          onOpenTab={(tab) => {
            audioEngine.playUiClick();
            setHomeModal(tab);
          }}
        />
      )}

      {/* Home Modals */}
      {screen === 'menu' && homeModal === 'guns' && (
        <GunsArmoryModal
          profile={profile}
          onGunAction={handleGunAction}
          onGunSkinAction={handleGunSkinAction}
          onClose={() => setHomeModal(null)}
        />
      )}

      {screen === 'menu' && homeModal === 'clans' && (
        <ClansModal
          profile={profile}
          playerSecret={playerSecretRef.current}
          onProfileSync={setProfile}
          onToast={showToast}
          onClose={() => setHomeModal(null)}
        />
      )}

      {screen === 'menu' && (homeModal === 'skins' || homeModal === 'shop') && (
        <ShopSkinsModal
          initialTab={homeModal}
          profile={profile}
          onSkinAction={handleSkinAction}
          onGunSkinAction={handleGunSkinAction}
          onShopBuy={handleShopBuy}
          onClose={() => setHomeModal(null)}
        />
      )}

      {screen === 'menu' && (homeModal === 'leaderboard' || homeModal === 'settings') && (
        <LeaderboardSettingsModal
          tab={homeModal}
          settings={settings}
          keybinds={keybinds}
          touchEnabled={touchEnabled}
          onUpdateSettings={handleUpdateSettings}
          onUpdateKeybind={handleUpdateKeybind}
          onResetKeybinds={handleResetKeybinds}
          onToggleTouch={setTouchEnabled}
          onClose={() => setHomeModal(null)}
        />
      )}

      {screen === 'menu' && homeModal === 'creators' && (
        <CreatorsDiscordModal onClose={() => setHomeModal(null)} />
      )}

      {screen === 'menu' && homeModal === 'about' && (
        <AboutUsModal onClose={() => setHomeModal(null)} />
      )}

      {screen === 'menu' && homeModal === 'rules' && (
        <RulesModal onClose={() => setHomeModal(null)} />
      )}

      {screen === 'menu' && homeModal === 'credits' && (
        <CreditsModal onClose={() => setHomeModal(null)} />
      )}

      {screen === 'menu' && homeModal === 'moderation' && (
        <ModerationModal
          profile={profile}
          playerSecret={playerSecretRef.current}
          onToast={showToast}
          onClose={() => setHomeModal(null)}
        />
      )}

      {/* Active Gameplay HUD */}
      {screen === 'playing' && (
        <GameHUD
          profile={profile}
          hp={hp}
          maxHp={maxHp}
          crouching={crouching}
          scoped={scoped}
          keybinds={keybinds}
          coords={coords}
          activeSlot={activeSlot}
          targetBlockName={targetBlockName}
          mineProgress={mineProgress}
          reloadProgress={reloadProgress}
          hitmarkerAt={hitmarkerAt}
          damageFlashAt={damageFlashAt}
          pointerLocked={pointerLocked}
          onlineCount={onlineCount}
          chatMessages={chatMessages}
          chatOpen={chatOpen}
          killFeed={killFeed}
          killBanner={killBanner}
          touchControlsEnabled={touchEnabled}
          onSelectSlot={(idx) => {
            audioEngine.playUiClick();
            setActiveSlot(idx);
          }}
          onSendChat={(text) => sendWs({ type: 'chat:send', text })}
          onDeleteChat={(messageId) => sendWs({ type: 'chat:delete', messageId })}
          onCloseChat={() => {
            setChatOpen(false);
            if (!touchEnabled) engineRef.current?.requestPointerLock();
          }}
          onOpenChat={() => {
            engineRef.current?.exitPointerLock();
            setChatOpen(true);
          }}
          onOpenMap={() => {
            engineRef.current?.exitPointerLock();
            setGameModal('map');
          }}
          onOpenCraft={() => {
            setQuickConvertOpen(false);
            engineRef.current?.exitPointerLock();
            setGameModal('craft');
          }}
          quickConvertOpen={quickConvertOpen}
          onQuickConvertCraft={(recipeId) => {
            audioEngine.playUiClick();
            sendWs({
              type: 'craft:make',
              recipeId,
              targetHotbarSlot: Math.max(2, activeSlotRef.current),
            });
            setQuickConvertOpen(false);
          }}
          onCloseQuickConvert={() => setQuickConvertOpen(false)}
          onOpenLeaderboard={() => {
            setQuickConvertOpen(false);
            engineRef.current?.exitPointerLock();
            setGameModal('leaderboard');
          }}
          onOpenScoreboard={() => {
            setQuickConvertOpen(false);
            engineRef.current?.exitPointerLock();
            setGameModal('scoreboard');
          }}
          onPause={() => {
            setQuickConvertOpen(false);
            engineRef.current?.exitPointerLock();
            setGameModal('pause');
          }}
          onLockPointer={() => engineRef.current?.requestPointerLock()}
          onToggleScope={() => engineRef.current?.toggleSniperScope()}
          onTouchMove={(mx, my, sprint) => engineRef.current?.setTouchInput(mx, my, sprint)}
          onTouchLook={(dx, dy) => engineRef.current?.addTouchLookDelta(dx, dy)}
          onTouchJump={() => engineRef.current?.triggerTouchJump()}
          onTouchMine={(active) => engineRef.current?.setTouchMining(active)}
          onTouchPlace={() => engineRef.current?.triggerTouchPlace()}
          onTouchReload={() => engineRef.current?.triggerReload()}
        />
      )}

      {/* In-Game Modals */}
      {screen === 'playing' && gameModal === 'map' && (
        <WorldMapModal
          selfId={playerIdRef.current}
          coords={coords}
          yaw={yaw}
          players={remotePlayers}
          onClose={() => {
            setGameModal(null);
            if (!touchEnabled) engineRef.current?.requestPointerLock();
          }}
        />
      )}
      {screen === 'playing' && gameModal === 'craft' && (
        <InventoryCraftModal
          profile={profile}
          activeSlot={activeSlot}
          onCraft={(recipeId) => {
            audioEngine.playUiClick();
            sendWs({ type: 'craft:make', recipeId });
          }}
          onAssignHotbar={handleAssignHotbar}
          onClose={() => {
            setGameModal(null);
            if (!touchEnabled) engineRef.current?.requestPointerLock();
          }}
        />
      )}

      {screen === 'playing' && gameModal === 'leaderboard' && (
        <LeaderboardSettingsModal
          tab="leaderboard"
          settings={settings}
          keybinds={keybinds}
          touchEnabled={touchEnabled}
          onUpdateSettings={handleUpdateSettings}
          onUpdateKeybind={handleUpdateKeybind}
          onResetKeybinds={handleResetKeybinds}
          onToggleTouch={setTouchEnabled}
          onClose={() => {
            setGameModal(null);
            if (!touchEnabled) engineRef.current?.requestPointerLock();
          }}
        />
      )}

      {screen === 'playing' && gameModal === 'scoreboard' && (
        <ScoreboardReportModal
          selfId={playerIdRef.current}
          players={remotePlayers}
          onReportPlayer={(targetId, reason, details) => {
            sendWs({ type: 'report:submit', targetId, reason, details });
          }}
          onClose={() => {
            setGameModal(null);
            if (!touchEnabled) engineRef.current?.requestPointerLock();
          }}
        />
      )}

      {screen === 'playing' && gameModal === 'settings' && (
        <LeaderboardSettingsModal
          tab="settings"
          settings={settings}
          keybinds={keybinds}
          touchEnabled={touchEnabled}
          onUpdateSettings={handleUpdateSettings}
          onUpdateKeybind={handleUpdateKeybind}
          onResetKeybinds={handleResetKeybinds}
          onToggleTouch={setTouchEnabled}
          onClose={() => setGameModal('pause')}
        />
      )}

      {screen === 'playing' && gameModal === 'pause' && (
        <div className="fixed inset-0 z-30 bg-black/70 flex items-center justify-center p-4">
          <div className="w-full max-w-sm mc-panel rounded-md p-6 flex flex-col gap-3">
            <h2 className="font-display text-2xl font-bold text-white text-center mb-1 mc-text-shadow">
              Game Menu
            </h2>
            <button
              onClick={() => {
                setGameModal(null);
                if (!touchEnabled) engineRef.current?.requestPointerLock();
              }}
              className="w-full py-3 rounded-sm mc-btn-green text-white font-display font-bold flex items-center justify-center gap-2 mc-text-shadow game-btn-depth cursor-pointer"
            >
              <Play className="w-4 h-4 fill-current" />
              Back to Game
            </button>
            <button
              onClick={() => setGameModal('settings')}
              className="w-full py-2.5 rounded-sm mc-btn-stone text-white font-display font-bold flex items-center justify-center gap-2 mc-text-shadow game-btn-depth cursor-pointer"
            >
              <Settings className="w-4 h-4" />
              Options...
            </button>
            <button
              onClick={() => setGameModal('scoreboard')}
              className="w-full py-2.5 rounded-sm mc-btn-stone text-rose-300 font-display font-bold flex items-center justify-center gap-2 mc-text-shadow game-btn-depth cursor-pointer"
            >
              <ShieldAlert className="w-4 h-4" />
              Players &amp; Report
            </button>
            <button
              onClick={handleReturnMenu}
              className="w-full py-2.5 rounded-sm bg-rose-700 hover:bg-rose-600 border-2 border-rose-950 border-b-4 text-white font-display font-bold flex items-center justify-center gap-2 mc-text-shadow game-btn-depth cursor-pointer"
            >
              <Home className="w-4 h-4" />
              Save &amp; Quit to Title
            </button>
          </div>
        </div>
      )}

      {/* Death & Respawn Overlay */}
      {screen === 'playing' && !alive && (
        <div className="fixed inset-0 z-40 bg-rose-950/75 flex items-center justify-center p-4">
          <div className="w-full max-w-sm mc-panel rounded-md p-6 text-center flex flex-col items-center gap-3">
            <div className="w-14 h-14 mc-slot flex items-center justify-center">
              <Skull className="w-8 h-8 text-rose-400" />
            </div>
            <h2 className="font-display text-2xl font-bold text-white mc-text-shadow">You Died!</h2>
            <p className="text-sm text-slate-200">
              {killedBy ? `Slain by ${killedBy}` : 'You fell in the frontier.'}
            </p>
            <div className="w-full flex flex-col gap-2.5 mt-2">
              <button
                onClick={() => sendWs({ type: 'player:respawn', zoneId: selectedZone })}
                className="w-full py-3 rounded-sm mc-btn-green text-white font-display font-bold flex items-center justify-center gap-2 mc-text-shadow game-btn-depth cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
                Respawn
              </button>
              <button
                onClick={handleReturnMenu}
                className="w-full py-2.5 rounded-sm mc-btn-stone text-slate-100 font-display font-bold mc-text-shadow game-btn-depth cursor-pointer"
              >
                Title Screen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
