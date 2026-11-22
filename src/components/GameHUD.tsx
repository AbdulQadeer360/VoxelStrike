import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Crosshair,
  Flag,
  Hammer,
  HeartPulse,
  Map as MapIcon,
  MessageSquare,
  Pause,
  RotateCw,
  Shield,
  Skull,
  Trash2,
  Trophy,
  Users,
  X,
} from 'lucide-react';
import {
  getQuickConvertTargets,
  GUNS,
  ITEMS,
  type KeybindingsConfig,
} from '../shared/constants.ts';
import type {
  ChatMessage,
  KillFeedEvent,
  ModeMatchState,
  PlayerProfileState,
  TeamSide,
} from '../shared/protocol.ts';
import { ItemIcon } from './ItemIcon.tsx';

interface GameHUDProps {
  profile: PlayerProfileState;
  hp: number;
  maxHp: number;
  crouching: boolean;
  scoped: boolean;
  keybinds?: KeybindingsConfig;
  coords: { x: number; y: number; z: number };
  fps?: number;
  pingMs?: number;
  statsOverlayOpen?: boolean;
  modeState?: ModeMatchState | null;
  modeBanner?: { text: string; tone: 'red' | 'blue' | 'gold' | 'green' } | null;
  selfCarryingFlag?: TeamSide;
  activeSlot: number;
  targetBlockName: string | null;
  mineProgress: number;
  reloadProgress: number;
  hitmarkerAt: number;
  damageFlashAt: number;
  pointerLocked: boolean;
  onlineCount: number;
  chatMessages: ChatMessage[];
  chatOpen: boolean;
  chatHidden?: boolean;
  killFeed: KillFeedEvent[];
  killBanner: KillFeedEvent | null;
  touchControlsEnabled: boolean;
  onSelectSlot: (idx: number) => void;
  onSendChat: (text: string) => void;
  onDeleteChat: (messageId: string) => void;
  onCloseChat: () => void;
  onOpenChat: () => void;
  onToggleChatHidden?: () => void;
  onOpenMap: () => void;
  onOpenCraft: () => void;
  quickConvertOpen?: boolean;
  onQuickConvertCraft?: (recipeId: string) => void;
  onCloseQuickConvert?: () => void;
  onOpenLeaderboard: () => void;
  onOpenScoreboard: () => void;
  onPause: () => void;
  onLockPointer: () => void;
  onToggleScope?: () => void;
  onUseMedkit?: () => void;
  onTouchMove: (mx: number, my: number, sprint: boolean) => void;
  onTouchLook: (dx: number, dy: number) => void;
  onTouchJump: () => void;
  onTouchMine: (active: boolean) => void;
  onTouchPlace: () => void;
  onTouchReload: () => void;
}

export const buildGameTips = (_kb?: KeybindingsConfig) => [
  'TIP: Collect wood & stone blocks with your Pickaxe and walk nearby to pick up drops!',
  'TIP: Hold any block in hand and convert it into Walls or Stairs inside your Bag!',
  'TIP: Sprint while strafing in gunfights to dodge incoming sniper shots!',
  'TIP: Right-click with the Valkyrie .50 Sniper to toggle the 3.4× precision optic!',
  'TIP: In Cap Flag, escort teammates carrying the enemy flag safely back to base for 30 points!',
  'TIP: Join or build a Clan to fight rival clans in Clan War arenas!',
];

const PixelHeart: React.FC<{ state: 'full' | 'half' | 'empty' }> = ({ state }) => (
  <svg width="16" height="16" viewBox="0 0 9 9" shapeRendering="crispEdges" aria-hidden="true" className="sm:w-[18px] sm:h-[18px]">
    <path
      d="M1 1h2v1h1v1h1V2h1V1h2v1h1v3H8v1H7v1H6v1H5v1H4V8H3V7H2V6H1V5H0V2h1V1z"
      fill="#181214"
    />
    <path d="M1 2h2v1h1v1h1V3h1V2h2v3H7v1H6v1H5v1H4V7H3V6H2V5H1V2z" fill="#3a1c20" />
    {state === 'full' && (
      <>
        <path d="M1 2h2v1h1v1h1V3h1V2h2v3H7v1H6v1H5v1H4V7H3V6H2V5H1V2z" fill="#e11d48" />
        <rect x="2" y="2" width="1" height="1" fill="#fda4af" />
      </>
    )}
    {state === 'half' && (
      <>
        <path d="M1 2h2v1h1v1h1v4H4V7H3V6H2V5H1V2z" fill="#e11d48" />
        <rect x="2" y="2" width="1" height="1" fill="#fda4af" />
      </>
    )}
  </svg>
);

export const GameHUD: React.FC<GameHUDProps> = ({
  profile,
  hp,
  maxHp,
  crouching,
  scoped,
  coords,
  fps = 60,
  pingMs = 0,
  statsOverlayOpen = false,
  modeState = null,
  modeBanner = null,
  selfCarryingFlag,
  activeSlot,
  targetBlockName,
  mineProgress,
  reloadProgress,
  hitmarkerAt,
  damageFlashAt,
  pointerLocked,
  onlineCount,
  chatMessages,
  chatOpen,
  chatHidden = false,
  killFeed,
  killBanner,
  touchControlsEnabled,
  onSelectSlot,
  onSendChat,
  onDeleteChat,
  onCloseChat,
  onOpenChat,
  onToggleChatHidden,
  onOpenMap,
  onOpenCraft,
  quickConvertOpen = false,
  onQuickConvertCraft,
  onCloseQuickConvert,
  onOpenLeaderboard,
  onOpenScoreboard,
  onPause,
  onLockPointer,
  onToggleScope,
  onUseMedkit,
  onTouchMove,
  onTouchLook,
  onTouchJump,
  onTouchMine,
  onTouchPlace,
  onTouchReload,
}) => {
  const [chatInput, setChatInput] = useState('');
  const [tickNow, setTickNow] = useState(() => Date.now());
  const chatInputRef = useRef<HTMLInputElement>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const lookTouchRef = useRef<{ id: number; x: number; y: number } | null>(null);
  const moveTouchRef = useRef<{ id: number; cx: number; cy: number } | null>(null);
  const [stickOffset, setStickOffset] = useState({ x: 0, y: 0 });

  useEffect(() => {
    if (chatOpen && !chatHidden) {
      setTimeout(() => chatInputRef.current?.focus(), 20);
    }
  }, [chatOpen, chatHidden]);

  useEffect(() => {
    const el = chatScrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [chatMessages, chatOpen, chatHidden]);

  useEffect(() => {
    if (!modeState?.endsAt) return;
    const timer = window.setInterval(() => setTickNow(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, [modeState?.endsAt]);

  const now = Date.now();
  const showHitmarker = now - hitmarkerAt < 180;
  const showDamageFlash = now - damageFlashAt < 260;

  const getItemCount = (itemId: string): number => {
    if (!itemId) return 0;
    return profile.inventory.find((s) => s.itemId === itemId)?.count ?? 0;
  };

  const fixedHotbarSlots = useMemo(() => {
    return Array.from({ length: 9 }, (_, idx) => {
      const itemId = profile.hotbarSlots[idx] || '';
      if (!itemId || !ITEMS[itemId]) return '';
      const kind = ITEMS[itemId].kind;
      if (kind === 'weapon' || kind === 'tool') return itemId;
      return (profile.inventory.find((s) => s.itemId === itemId)?.count ?? 0) > 0 ? itemId : '';
    });
  }, [profile.hotbarSlots, profile.inventory]);

  const heldItemId = fixedHotbarSlots[activeSlot] || '';
  const heldItem = ITEMS[heldItemId];
  const heldGun = GUNS[heldItemId];
  const quickConvertTargets = useMemo(
    () => (heldItemId ? getQuickConvertTargets(heldItemId) : null),
    [heldItemId]
  );
  const reserveAmmo = profile.inventory.find((s) => s.itemId === 'ammo')?.count ?? 0;
  const medkitCount = profile.inventory.find((s) => s.itemId === 'medkit')?.count ?? 0;
  const currentMag = heldGun
    ? profile.gunMags?.[heldGun.id] ?? (heldGun.id === 'rifle' ? profile.ammoInMag : heldGun.magSize)
    : 0;

  const hpScaled = Math.max(0, Math.min(20, Math.ceil((hp / Math.max(1, maxHp)) * 20)));

  const duelRemainingSec = modeState?.endsAt
    ? Math.max(0, Math.ceil((modeState.endsAt - tickNow) / 1000))
    : null;
  const duelTimerLabel =
    duelRemainingSec !== null
      ? `${Math.floor(duelRemainingSec / 60)}:${String(duelRemainingSec % 60).padStart(2, '0')}`
      : null;

  return (
    <div className="fixed inset-0 z-10 pointer-events-none select-none">
      {/* Sniper Optical Scope Reticle Overlay (3.4x) */}
      {scoped && (
        <div
          className="fixed inset-0 pointer-events-none flex items-center justify-center z-0"
          style={{
            background:
              'radial-gradient(circle at center, transparent 0%, transparent 33%, rgba(6, 10, 18, 0.96) 35.5%, rgba(3, 6, 12, 0.99) 100%)',
          }}
        >
          <div className="relative w-[min(68vh,68vw)] h-[min(68vh,68vw)] rounded-full border-[4px] border-slate-800 shadow-[inset_0_0_45px_rgba(0,0,0,0.85)] flex items-center justify-center">
            <div className="absolute inset-x-0 h-[1.5px] bg-slate-950/90" />
            <div className="absolute inset-y-0 w-[1.5px] bg-slate-950/90" />
            <div className="absolute flex items-center justify-center gap-7">
              <span className="w-1.5 h-1.5 rounded-full bg-slate-950/90" />
              <span className="w-1.5 h-1.5 rounded-full bg-slate-950/90" />
              <span className="w-5" />
              <span className="w-1.5 h-1.5 rounded-full bg-slate-950/90" />
              <span className="w-1.5 h-1.5 rounded-full bg-slate-950/90" />
            </div>
            <div className="absolute flex flex-col items-center justify-center gap-7">
              <span className="w-1.5 h-1.5 rounded-full bg-slate-950/90" />
              <span className="w-1.5 h-1.5 rounded-full bg-slate-950/90" />
              <span className="h-5" />
              <span className="w-1.5 h-1.5 rounded-full bg-slate-950/90" />
              <span className="w-1.5 h-1.5 rounded-full bg-slate-950/90" />
            </div>
            <div className="w-2 h-2 rounded-full bg-rose-500 shadow-[0_0_8px_#f43f5e]" />
            <div className="absolute bottom-5 px-2.5 py-0.5 rounded bg-black/70 border border-emerald-400/50 text-[11px] font-mono-num font-bold text-emerald-300">
              3.4× OPTIC
            </div>
          </div>
        </div>
      )}

      {/* Damage Vignette Flash */}
      {showDamageFlash && (
        <div
          className="fixed inset-0 pointer-events-none border-[18px] border-rose-500/45 transition-opacity duration-150"
          style={{ boxShadow: 'inset 0 0 90px rgba(239,68,68,0.45)' }}
        />
      )}

      {/* TOP-LEFT: Clean Coordinates Only (+ Team Badge in Team Modes & Zero-Key Stats Overlay) */}
      <div className="fixed top-2.5 left-2.5 sm:top-3 sm:left-3 flex flex-col gap-1.5 z-20">
        <div className="mc-panel rounded-sm px-2.5 sm:px-3 py-1.5 flex items-center gap-2 text-[11px] sm:text-xs font-mono-num">
          <span className="text-slate-100 font-bold">
            X:{coords.x} Y:{coords.y} Z:{coords.z}
          </span>
          {modeState?.selfTeam && (modeState.mode === 'ctf' || modeState.mode === 'clanwar') && (
            <span
              className={`px-1.5 py-0.5 rounded-xs text-[10px] font-sans font-black uppercase ${
                modeState.selfTeam === 'red'
                  ? 'bg-rose-600 text-white'
                  : 'bg-blue-600 text-white'
              }`}
            >
              {modeState.selfTeam} TEAM
            </span>
          )}
          {crouching && <span className="text-sky-300 font-bold text-[10px]">CROUCH</span>}
        </div>

        {/* Toggleable Stats Telemetry Overlay (Press 0) */}
        {statsOverlayOpen && (
          <div className="mc-panel rounded-sm px-2.5 py-1.5 border-[#7ce354]/60 flex flex-col gap-0.5 text-[11px] font-mono-num text-slate-200 w-44">
            <div className="flex justify-between">
              <span className="text-slate-400">XYZ</span>
              <span className="text-white font-bold">
                {coords.x}, {coords.y}, {coords.z}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">PING</span>
              <span className={pingMs < 90 ? 'text-[#7ce354] font-bold' : pingMs < 180 ? 'text-amber-300 font-bold' : 'text-rose-400 font-bold'}>
                {pingMs} ms
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">FPS</span>
              <span className="text-sky-300 font-bold">{fps} FPS</span>
            </div>
          </div>
        )}
      </div>

      {/* TOP-CENTER: Arena Mode Scoreboard (1v1, Cap Flag, Clan War) */}
      {modeState && modeState.mode !== 'survival' && (
        <div className="fixed top-2.5 sm:top-3 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center gap-1 max-w-[92vw]">
          <div className="mc-panel rounded-sm px-3 py-1.5 flex items-center gap-2.5 sm:gap-4 text-xs font-bold shadow-lg whitespace-nowrap">
            <div className="flex items-center gap-1.5 text-rose-400">
              <span className="max-w-[90px] sm:max-w-[140px] truncate">{modeState.redLabel}</span>
              <span className="font-mono-num text-sm text-white bg-rose-700/80 px-1.5 py-0.5 rounded-xs">
                {modeState.redScore}
              </span>
            </div>

            <div className="flex flex-col items-center">
              <span className="text-[10px] font-mono-num text-amber-300">
                {modeState.mode === 'duel' && duelTimerLabel
                  ? duelTimerLabel
                  : modeState.mode === 'ctf'
                  ? `/${modeState.targetScore}`
                  : `/${modeState.targetScore}`}
              </span>
            </div>

            <div className="flex items-center gap-1.5 text-sky-400">
              <span className="font-mono-num text-sm text-white bg-blue-700/80 px-1.5 py-0.5 rounded-xs">
                {modeState.blueScore}
              </span>
              <span className="max-w-[90px] sm:max-w-[140px] truncate">{modeState.blueLabel}</span>
            </div>
          </div>

          {modeState.flags && (
            <div className="flex items-center gap-2 text-[10px] font-bold">
              <span className="mc-panel px-2 py-0.5 rounded-sm text-rose-300 flex items-center gap-1">
                <Flag className="w-3 h-3" />
                {modeState.flags.red.state === 'carried' ? 'Taken' : 'Base'}
              </span>
              <span className="mc-panel px-2 py-0.5 rounded-sm text-sky-300 flex items-center gap-1">
                <Flag className="w-3 h-3" />
                {modeState.flags.blue.state === 'carried' ? 'Taken' : 'Base'}
              </span>
            </div>
          )}

          {modeState.waitingText && modeState.status === 'waiting' && (
            <div className="mc-panel rounded-sm px-3 py-1 text-[11px] font-bold text-amber-300">
              {modeState.waitingText}
            </div>
          )}

          {selfCarryingFlag && (
            <div className="bg-amber-500 border-2 border-amber-200 rounded-sm px-3 py-1 text-[11px] font-black text-slate-950 animate-pulse">
              CARRYING ENEMY FLAG — Return to Your Base!
            </div>
          )}
        </div>
      )}

      {/* Mode Event Banner (Flag picked/captured/restored, Match updates) */}
      {modeBanner && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-20 pointer-events-none">
          <div
            className={`mc-panel rounded-sm px-4 py-1.5 text-xs sm:text-sm font-bold mc-text-shadow whitespace-nowrap ${
              modeBanner.tone === 'red'
                ? 'border-rose-400 text-rose-200'
                : modeBanner.tone === 'blue'
                ? 'border-sky-400 text-sky-200'
                : modeBanner.tone === 'green'
                ? 'border-[#7ce354] text-[#7ce354]'
                : 'border-amber-400 text-amber-300'
            }`}
          >
            {modeBanner.text}
          </div>
        </div>
      )}

      {/* Global Kill Broadcast Banner */}
      {killBanner && !modeBanner && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-20 pointer-events-none">
          <div className="mc-panel rounded-sm px-3 sm:px-4 py-1.5 border-[#fbbf24] flex items-center gap-2 text-xs sm:text-sm font-bold mc-text-shadow whitespace-nowrap">
            <Skull className="w-4 h-4 text-rose-400" />
            <span className="text-[#7ce354]">{killBanner.killerName}</span>
            <span className="text-slate-300">eliminated</span>
            <span className="text-rose-400">{killBanner.victimName}</span>
            <span className="text-amber-300">[{killBanner.weapon}]</span>
          </div>
        </div>
      )}

      {/* Click-to-Lock Prompt when unlocked on desktop */}
      {!pointerLocked && !chatOpen && !touchControlsEnabled && (
        <div className="fixed top-28 left-1/2 -translate-x-1/2 pointer-events-auto">
          <button
            onClick={onLockPointer}
            className="mc-panel hover:bg-[#383b42] rounded-sm px-4 py-2 text-xs font-bold text-white flex items-center gap-2 cursor-pointer whitespace-nowrap"
          >
            <Crosshair className="w-4 h-4 text-[#7ce354]" />
            Click game view to play
          </button>
        </div>
      )}

      {/* Top-Right Clean Action Buttons & Kill Feed (No keybind hints) */}
      <div className="fixed top-2.5 right-2.5 sm:top-3 sm:right-3 flex flex-col items-end gap-2 z-20">
        <div className="pointer-events-auto flex items-center gap-1 sm:gap-1.5">
          <button
            onClick={onOpenMap}
            title="Map"
            className="mc-btn-stone rounded-sm px-2 sm:px-2.5 py-1.5 text-[11px] sm:text-xs font-bold text-sky-300 flex items-center gap-1 game-btn-depth cursor-pointer whitespace-nowrap"
          >
            <MapIcon className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Map</span>
          </button>
          <button
            onClick={onOpenCraft}
            title="Bag & Crafting"
            className="mc-btn-stone rounded-sm px-2 sm:px-2.5 py-1.5 text-[11px] sm:text-xs font-bold text-amber-300 flex items-center gap-1 game-btn-depth cursor-pointer whitespace-nowrap"
          >
            <Hammer className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Bag</span>
          </button>
          <button
            onClick={onOpenLeaderboard}
            title="Ranks"
            className="mc-btn-stone rounded-sm px-2 sm:px-2.5 py-1.5 text-[11px] sm:text-xs font-bold text-yellow-300 flex items-center gap-1 game-btn-depth cursor-pointer whitespace-nowrap"
          >
            <Trophy className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Ranks</span>
          </button>
          <button
            onClick={onOpenScoreboard}
            title="Players"
            className="mc-btn-stone rounded-sm px-2 sm:px-2.5 py-1.5 text-[11px] sm:text-xs font-bold text-[#7ce354] flex items-center gap-1 game-btn-depth cursor-pointer tabular-nums whitespace-nowrap"
          >
            <Users className="w-3.5 h-3.5" />
            {onlineCount}
          </button>
          <button
            onClick={onPause}
            className="mc-btn-stone rounded-sm p-1.5 text-slate-100 game-btn-depth cursor-pointer"
            title="Pause"
          >
            <Pause className="w-4 h-4" />
          </button>
        </div>

        {/* Kill Feed */}
        <div className="hidden sm:flex flex-col items-end gap-1">
          {killFeed.slice(0, 4).map((k) => (
            <div
              key={k.id}
              className="mc-panel rounded-sm px-2.5 py-1 text-[11px] font-semibold text-slate-200 flex items-center gap-1.5"
            >
              <span className="text-[#7ce354]">{k.killerName}</span>
              <span className="text-amber-300">[{k.weapon}]</span>
              <span className="text-rose-400">{k.victimName}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Center Crosshair + Hitmarker + Mining Progress */}
      <div className="fixed inset-0 flex items-center justify-center pointer-events-none">
        <div className="relative flex items-center justify-center">
          {!scoped && (
            <>
              <div className="w-4 h-0.5 bg-white/90 shadow-sm" />
              <div className="absolute w-0.5 h-4 bg-white/90 shadow-sm" />
            </>
          )}

          {showHitmarker && (
            <svg width="26" height="26" viewBox="0 0 26 26" className="absolute">
              <line x1="4" y1="4" x2="10" y2="10" stroke="#ef4444" strokeWidth="2.4" />
              <line x1="22" y1="4" x2="16" y2="10" stroke="#ef4444" strokeWidth="2.4" />
              <line x1="4" y1="22" x2="10" y2="16" stroke="#ef4444" strokeWidth="2.4" />
              <line x1="22" y1="22" x2="16" y2="16" stroke="#ef4444" strokeWidth="2.4" />
            </svg>
          )}

          {targetBlockName && !scoped && (
            <div className="absolute top-6 whitespace-nowrap mc-panel rounded-sm px-2 py-0.5 text-[11px] font-bold text-white mc-text-shadow">
              {targetBlockName}
            </div>
          )}

          {mineProgress > 0 && (
            <div className="absolute top-12 w-24 h-2 bg-[#141619] border border-[#494c52] overflow-hidden">
              <div className="h-full bg-[#7ce354]" style={{ width: `${Math.round(mineProgress * 100)}%` }} />
            </div>
          )}

          {reloadProgress > 0 && (
            <div className="absolute -top-9 whitespace-nowrap mc-panel rounded-sm px-2.5 py-0.5 text-[11px] font-bold text-amber-300">
              Reloading {Math.round(reloadProgress * 100)}%
            </div>
          )}
        </div>
      </div>

      {/* Bottom-Left Closeable Chat Panel (Tips in Green Here Only) */}
      <div
        className={`fixed left-2.5 sm:left-3 z-20 flex flex-col gap-1.5 ${
          touchControlsEnabled ? 'bottom-56 w-60 sm:w-72' : 'bottom-28 sm:bottom-4 w-72 sm:w-80'
        }`}
      >
        {chatHidden ? (
          <div className="flex items-center">
            <button
              onClick={() => onToggleChatHidden?.()}
              className="pointer-events-auto mc-panel hover:bg-[#3a3d42] rounded-sm px-2.5 py-1.5 text-[11px] font-semibold text-slate-200 flex items-center gap-1.5 cursor-pointer"
              title="Open Chat"
            >
              <MessageSquare className="w-3.5 h-3.5 text-[#7ce354]" />
              <span>Chat</span>
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between bg-[#141619]/85 px-2.5 py-1 rounded-t-sm border-b border-white/10">
              <span className="text-[11px] font-bold text-slate-300 flex items-center gap-1.5">
                <MessageSquare className="w-3 h-3 text-[#7ce354]" />
                Chat
              </span>
              {onToggleChatHidden && (
                <button
                  onClick={onToggleChatHidden}
                  title="Close Chat"
                  className="pointer-events-auto text-slate-400 hover:text-white p-0.5 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div
              ref={chatScrollRef}
              className={`flex flex-col gap-1 max-h-28 sm:max-h-36 overflow-y-auto game-scroll pr-0.5 ${
                chatOpen ? 'pointer-events-auto' : ''
              }`}
            >
              {chatMessages.slice(-30).map((m) => (
                <div
                  key={m.id}
                  className="bg-[#141619]/80 px-2.5 py-1 text-xs leading-snug text-slate-100 break-words flex items-start justify-between gap-2"
                >
                  <div className="min-w-0 flex-1">
                    {m.isTip ? (
                      <span className="text-[#4ade80] font-semibold">{m.text}</span>
                    ) : m.system ? (
                      <span className="text-amber-300 font-semibold">{m.text}</span>
                    ) : (
                      <>
                        {m.isMod && (
                          <span className="inline-block bg-amber-400 text-slate-950 font-black px-1 py-0.2 rounded-xs mr-1 text-[10px] align-baseline">
                            [MOD]
                          </span>
                        )}
                        <span className="font-bold text-[#7ce354]">
                          {m.username}
                          {m.clanName ? ` (${m.clanName})` : ''}:{' '}
                        </span>
                        <span>{m.text}</span>
                      </>
                    )}
                  </div>
                  {profile.isMod && !m.system && !m.isTip && (
                    <button
                      onClick={() => onDeleteChat(m.id)}
                      title="Delete message"
                      className="pointer-events-auto text-rose-400 hover:text-rose-300 p-0.5 shrink-0 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>

            {chatOpen ? (
              <form
                className="pointer-events-auto flex gap-1.5"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (chatInput.trim()) onSendChat(chatInput.trim());
                  setChatInput('');
                  onCloseChat();
                }}
              >
                <input
                  ref={chatInputRef}
                  value={chatInput}
                  maxLength={160}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      e.stopPropagation();
                      setChatInput('');
                      onCloseChat();
                    }
                  }}
                  placeholder="Type message..."
                  className="flex-1 bg-[#141619]/95 border-2 border-[#6bc349] rounded-sm px-2.5 py-1.5 text-xs text-white outline-none"
                />
              </form>
            ) : (
              <div className="flex items-center gap-1.5">
                <button
                  onClick={onOpenChat}
                  className="pointer-events-auto mc-panel hover:bg-[#3a3d42] rounded-sm px-2.5 py-1 text-[11px] font-semibold text-slate-200 flex items-center gap-1.5 cursor-pointer"
                >
                  <MessageSquare className="w-3 h-3" />
                  Send Message
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Bottom-Center Hearts + Quick-Convert Bar + Responsive 9-Slot Hotbar */}
      <div className="fixed bottom-2 sm:bottom-3 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1.5 max-w-[98vw]">
        {quickConvertOpen && quickConvertTargets && onQuickConvertCraft && (
          <div className="pointer-events-auto mc-panel rounded-sm px-2.5 py-1.5 border-[#7ce354] flex items-center gap-2 shadow-lg">
            <span className="text-[11px] font-bold text-amber-300 whitespace-nowrap">
              {heldItem?.name}:
            </span>
            {quickConvertTargets.wallRecipeId && quickConvertTargets.wallItem && (
              <button
                onClick={() => onQuickConvertCraft(quickConvertTargets.wallRecipeId!)}
                className="mc-btn-stone rounded-sm px-2 py-1 text-[11px] font-bold text-white flex items-center gap-1.5 cursor-pointer hover:bg-[#4b5059]"
              >
                <ItemIcon itemId={quickConvertTargets.wallItem} size={18} />
                <span>Wall ×{quickConvertTargets.wallCount}</span>
              </button>
            )}
            {quickConvertTargets.stairsRecipeId && quickConvertTargets.stairsItem && (
              <button
                onClick={() => onQuickConvertCraft(quickConvertTargets.stairsRecipeId!)}
                className="mc-btn-stone rounded-sm px-2 py-1 text-[11px] font-bold text-white flex items-center gap-1.5 cursor-pointer hover:bg-[#4b5059]"
              >
                <ItemIcon itemId={quickConvertTargets.stairsItem} size={18} />
                <span>Stairs ×{quickConvertTargets.stairsCount}</span>
              </button>
            )}
            {onCloseQuickConvert && (
              <button
                onClick={onCloseQuickConvert}
                className="text-[10px] font-bold text-slate-300 hover:text-white px-1.5 py-0.5 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}

        {heldItem && (
          <div className="flex items-center gap-2 px-2.5 py-0.5 text-[11px] sm:text-xs font-bold mc-text-shadow whitespace-nowrap">
            <span className="font-display text-white">{heldItem.name}</span>
            {heldGun && (
              <>
                <span className="text-slate-300">·</span>
                <span className="font-mono-num text-amber-300">
                  {currentMag} / {heldGun.magSize} <span className="text-slate-200">({reserveAmmo})</span>
                </span>
              </>
            )}
          </div>
        )}

        <div className="flex items-center justify-center gap-0.5" title={`Health: ${hp} / ${maxHp}`}>
          {Array.from({ length: 10 }).map((_, i) => {
            const heartPoints = hpScaled - i * 2;
            const state = heartPoints >= 2 ? 'full' : heartPoints === 1 ? 'half' : 'empty';
            return <PixelHeart key={i} state={state} />;
          })}
        </div>

        <div className="pointer-events-auto mc-panel rounded-sm p-1 flex items-center gap-0.5 sm:gap-1">
          {fixedHotbarSlots.map((itemId, idx) => {
            const active = idx === activeSlot;
            const count = itemId ? getItemCount(itemId) : 0;
            const showCount = itemId && ITEMS[itemId]?.kind !== 'weapon' && ITEMS[itemId]?.kind !== 'tool';
            return (
              <button
                key={`hotbar-slot-${idx}`}
                onClick={() => onSelectSlot(idx)}
                className={`relative w-8 h-8 xs:w-9 xs:h-9 sm:w-12 sm:h-12 rounded-none flex items-center justify-center cursor-pointer transition-transform ${
                  active ? 'mc-slot-active -translate-y-0.5' : 'mc-slot hover:bg-[#494c52]'
                }`}
              >
                <span className="hidden sm:block absolute top-0.5 left-1 text-[9px] font-mono-num text-slate-300 mc-text-shadow">
                  {idx + 1}
                </span>
                {itemId && <ItemIcon itemId={itemId} size={26} />}
                {showCount && count > 0 && (
                  <span className="absolute bottom-0 right-0.5 sm:bottom-0.5 sm:right-1 text-[9px] sm:text-[11px] font-mono-num font-bold text-white mc-text-shadow">
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Responsive Mobile & Tablet Touch Controls */}
      {touchControlsEnabled && (
        <div className="fixed inset-0 pointer-events-none">
          {/* Virtual Move + Sprint Joystick */}
          <div
            className="pointer-events-auto fixed bottom-20 left-4 sm:bottom-24 sm:left-6 w-28 h-28 rounded-full bg-[#141619]/60 border-2 border-white/35 flex items-center justify-center touch-none"
            onTouchStart={(e) => {
              const t = e.changedTouches[0];
              const rect = e.currentTarget.getBoundingClientRect();
              moveTouchRef.current = {
                id: t.identifier,
                cx: rect.left + rect.width / 2,
                cy: rect.top + rect.height / 2,
              };
            }}
            onTouchMove={(e) => {
              if (!moveTouchRef.current) return;
              for (let i = 0; i < e.changedTouches.length; i++) {
                const t = e.changedTouches[i];
                if (t.identifier === moveTouchRef.current.id) {
                  const dx = t.clientX - moveTouchRef.current.cx;
                  const dy = t.clientY - moveTouchRef.current.cy;
                  const maxR = 42;
                  const dist = Math.hypot(dx, dy);
                  const clamped = Math.min(maxR, dist);
                  const nx = dist > 0 ? (dx / dist) * (clamped / maxR) : 0;
                  const ny = dist > 0 ? (dy / dist) * (clamped / maxR) : 0;
                  setStickOffset({ x: nx * 32, y: ny * 32 });
                  onTouchMove(nx, ny, dist > 34);
                }
              }
            }}
            onTouchEnd={() => {
              moveTouchRef.current = null;
              setStickOffset({ x: 0, y: 0 });
              onTouchMove(0, 0, false);
            }}
          >
            <div
              className="w-11 h-11 rounded-full bg-white/85 shadow-md"
              style={{ transform: `translate(${stickOffset.x}px, ${stickOffset.y}px)` }}
            />
          </div>

          {/* Right-Half Camera Look Drag Pad */}
          <div
            className="pointer-events-auto fixed top-14 right-0 bottom-36 w-1/2 touch-none"
            onTouchStart={(e) => {
              const t = e.changedTouches[0];
              lookTouchRef.current = { id: t.identifier, x: t.clientX, y: t.clientY };
            }}
            onTouchMove={(e) => {
              if (!lookTouchRef.current) return;
              for (let i = 0; i < e.changedTouches.length; i++) {
                const t = e.changedTouches[i];
                if (t.identifier === lookTouchRef.current.id) {
                  onTouchLook(t.clientX - lookTouchRef.current.x, t.clientY - lookTouchRef.current.y);
                  lookTouchRef.current.x = t.clientX;
                  lookTouchRef.current.y = t.clientY;
                }
              }
            }}
            onTouchEnd={() => {
              lookTouchRef.current = null;
            }}
          />

          {/* Ergonomic Mobile Action Thumb Cluster */}
          <div className="pointer-events-auto fixed bottom-20 right-4 sm:bottom-24 sm:right-6 flex flex-col items-end gap-2">
            <div className="flex gap-1.5 sm:gap-2">
              {heldGun?.id === 'sniper' && onToggleScope && (
                <button
                  onTouchStart={(e) => {
                    e.preventDefault();
                    onToggleScope();
                  }}
                  className={`w-12 h-11 rounded-md font-display font-bold text-[11px] flex items-center justify-center ${
                    scoped ? 'mc-btn-green text-white' : 'mc-btn-stone text-sky-300'
                  }`}
                >
                  SCOPE
                </button>
              )}
              {medkitCount > 0 && onUseMedkit && (
                <button
                  onTouchStart={(e) => {
                    e.preventDefault();
                    onUseMedkit();
                  }}
                  className="w-11 h-11 mc-btn-stone rounded-md text-emerald-300 flex flex-col items-center justify-center text-[10px] font-bold"
                >
                  <HeartPulse className="w-4 h-4" />
                  {medkitCount}
                </button>
              )}
              <button
                onTouchStart={(e) => {
                  e.preventDefault();
                  onTouchReload();
                }}
                className="w-11 h-11 mc-btn-stone rounded-md text-sky-300 flex items-center justify-center font-bold"
              >
                <RotateCw className="w-5 h-5" />
              </button>
              <button
                onTouchStart={(e) => {
                  e.preventDefault();
                  onTouchJump();
                }}
                className="w-13 h-11 mc-btn-green rounded-md text-white font-display font-bold text-xs"
              >
                JUMP
              </button>
            </div>
            <div className="flex gap-2">
              <button
                onTouchStart={(e) => {
                  e.preventDefault();
                  onTouchPlace();
                }}
                className="w-14 h-13 mc-btn-stone rounded-md text-amber-300 font-bold text-[11px] flex flex-col items-center justify-center"
              >
                <Shield className="w-4 h-4" />
                PLACE
              </button>
              <button
                onTouchStart={(e) => {
                  e.preventDefault();
                  onTouchMine(true);
                }}
                onTouchEnd={(e) => {
                  e.preventDefault();
                  onTouchMine(false);
                }}
                className="w-16 h-16 bg-rose-700 border-2 border-rose-950 border-b-4 rounded-md text-white font-display font-bold text-xs flex items-center justify-center shadow-lg"
              >
                FIRE
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
