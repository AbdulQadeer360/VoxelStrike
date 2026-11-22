import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Coins,
  Crosshair,
  Hammer,
  Map as MapIcon,
  MessageSquare,
  Pause,
  RotateCw,
  Shield,
  Skull,
  Trash2,
  Trophy,
  Users,
} from 'lucide-react';
import {
  DEFAULT_KEYBINDINGS,
  formatKeyCode,
  getQuickConvertTargets,
  GUNS,
  ITEMS,
  type KeybindingsConfig,
} from '../shared/constants.ts';
import type { ChatMessage, KillFeedEvent, PlayerProfileState } from '../shared/protocol.ts';
import { ItemIcon } from './ItemIcon.tsx';

interface GameHUDProps {
  profile: PlayerProfileState;
  hp: number;
  maxHp: number;
  crouching: boolean;
  scoped: boolean;
  keybinds?: KeybindingsConfig;
  coords: { x: number; y: number; z: number };
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
  killFeed: KillFeedEvent[];
  killBanner: KillFeedEvent | null;
  touchControlsEnabled: boolean;
  onSelectSlot: (idx: number) => void;
  onSendChat: (text: string) => void;
  onDeleteChat: (messageId: string) => void;
  onCloseChat: () => void;
  onOpenChat: () => void;
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
  onTouchMove: (mx: number, my: number, sprint: boolean) => void;
  onTouchLook: (dx: number, dy: number) => void;
  onTouchJump: () => void;
  onTouchMine: (active: boolean) => void;
  onTouchPlace: () => void;
  onTouchReload: () => void;
}

export const buildGameTips = (kb: KeybindingsConfig) => [
  `TIP: Press [${formatKeyCode(kb.fireOrPlace)}] to Fire Gun or Place Block anytime!`,
  `TIP: Hold any block in hand and press [${formatKeyCode(kb.quickConvert)}] to convert it into Walls or Stairs!`,
  `TIP: Press [${formatKeyCode(kb.craft)}] to open Inventory & Crafting (Wood → Planks, Stone → Bricks).`,
  `TIP: Hold [${formatKeyCode(kb.sprint)}] anytime to sprint faster — unlimited speed boost!`,
  `TIP: Use your Pickaxe [2] to mine blocks & walk nearby to collect dropped items!`,
  `TIP: Right-click or press [${formatKeyCode(kb.scope)}] with the Valkyrie .50 Sniper for 3.4× Scope.`,
  `TIP: Press [${formatKeyCode(kb.map)}] for Map, [${formatKeyCode(kb.chat)}] for Chat, [${formatKeyCode(kb.medkit)}] for Medkit.`,
];

const PixelHeart: React.FC<{ state: 'full' | 'half' | 'empty' }> = ({ state }) => (
  <svg width="18" height="18" viewBox="0 0 9 9" shapeRendering="crispEdges" aria-hidden="true">
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
  keybinds = DEFAULT_KEYBINDINGS,
  coords,
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
  killFeed,
  killBanner,
  touchControlsEnabled,
  onSelectSlot,
  onSendChat,
  onDeleteChat,
  onCloseChat,
  onOpenChat,
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
  onTouchMove,
  onTouchLook,
  onTouchJump,
  onTouchMine,
  onTouchPlace,
  onTouchReload,
}) => {
  const [chatInput, setChatInput] = useState('');
  const chatInputRef = useRef<HTMLInputElement>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const lookTouchRef = useRef<{ id: number; x: number; y: number } | null>(null);
  const moveTouchRef = useRef<{ id: number; cx: number; cy: number } | null>(null);
  const [stickOffset, setStickOffset] = useState({ x: 0, y: 0 });

  useEffect(() => {
    if (chatOpen) {
      setTimeout(() => chatInputRef.current?.focus(), 20);
    }
  }, [chatOpen]);

  useEffect(() => {
    const el = chatScrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [chatMessages, chatOpen]);

  const now = Date.now();
  const showHitmarker = now - hitmarkerAt < 180;
  const showDamageFlash = now - damageFlashAt < 260;

  const getItemCount = (itemId: string): number => {
    if (!itemId) return 0;
    return profile.inventory.find((s) => s.itemId === itemId)?.count ?? 0;
  };

  // Fixed 9-slot hotbar preserving blank empty slots
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
  const currentMag = heldGun
    ? profile.gunMags?.[heldGun.id] ?? (heldGun.id === 'rifle' ? profile.ammoInMag : heldGun.magSize)
    : 0;

  const xpForNext = profile.level * 120;
  const xpPct = Math.max(0, Math.min(100, Math.round((profile.xp / Math.max(1, xpForNext)) * 100)));
  const hpScaled = Math.max(0, Math.min(20, Math.ceil((hp / Math.max(1, maxHp)) * 20)));

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
            {/* Horizontal Hairline + Mil-Dots */}
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
            {/* Illuminated Center Dot */}
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

      {/* Global Kill Broadcast Banner */}
      {killBanner && (
        <div className="fixed top-14 left-1/2 -translate-x-1/2 z-20 pointer-events-none">
          <div className="mc-panel rounded-sm px-4 py-1.5 border-[#fbbf24] flex items-center gap-2 text-xs sm:text-sm font-bold mc-text-shadow whitespace-nowrap">
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
        <div className="fixed top-24 left-1/2 -translate-x-1/2 pointer-events-auto">
          <button
            onClick={onLockPointer}
            className="mc-panel hover:bg-[#383b42] rounded-sm px-4 py-2 text-xs font-bold text-white flex items-center gap-2 cursor-pointer whitespace-nowrap"
          >
            <Crosshair className="w-4 h-4 text-[#7ce354]" />
            Click game view to aim &amp; lock mouse (Esc for menu)
          </button>
        </div>
      )}

      {/* Top-Left Coordinates, Level/XP, Coins & Crouch State */}
      <div className="fixed top-3 left-3 flex flex-col gap-1.5">
        <div className="mc-panel rounded-sm px-3 py-1.5 flex items-center gap-3 text-xs font-mono-num">
          <span className="text-slate-100 font-bold">
            X:{coords.x} Y:{coords.y} Z:{coords.z}
          </span>
          <span className="text-slate-500">·</span>
          <span className="font-bold text-[#7ce354]">Lv.{profile.level}</span>
          <span className="text-slate-500">·</span>
          <span className="flex items-center gap-1 font-bold text-amber-300">
            <Coins className="w-3.5 h-3.5" />
            {profile.coins}
          </span>
          {crouching && (
            <>
              <span className="text-slate-500">·</span>
              <span className="text-sky-300 font-bold">CROUCH</span>
            </>
          )}
        </div>
        <div className="mc-panel rounded-sm px-2.5 py-1 flex items-center gap-2 w-56">
          <span className="text-[10px] font-bold text-sky-300 whitespace-nowrap">XP {profile.xp}/{xpForNext}</span>
          <div className="flex-1 h-1.5 bg-[#141619] border border-black/50 overflow-hidden">
            <div className="h-full bg-[#7ce354]" style={{ width: `${xpPct}%` }} />
          </div>
        </div>
      </div>

      {/* Top-Right Action Buttons & Kill Feed */}
      <div className="fixed top-3 right-3 flex flex-col items-end gap-2">
        <div className="pointer-events-auto flex items-center gap-1.5">
          <button
            onClick={onOpenMap}
            className="mc-btn-stone rounded-sm px-2.5 py-1.5 text-xs font-bold text-sky-300 flex items-center gap-1.5 game-btn-depth cursor-pointer whitespace-nowrap"
          >
            <MapIcon className="w-3.5 h-3.5" />
            Map [{formatKeyCode(keybinds.map)}]
          </button>
          <button
            onClick={onOpenCraft}
            className="mc-btn-stone rounded-sm px-2.5 py-1.5 text-xs font-bold text-amber-300 flex items-center gap-1.5 game-btn-depth cursor-pointer whitespace-nowrap"
          >
            <Hammer className="w-3.5 h-3.5" />
            Inventory [{formatKeyCode(keybinds.craft)}]
          </button>
          <button
            onClick={onOpenLeaderboard}
            className="mc-btn-stone rounded-sm px-2.5 py-1.5 text-xs font-bold text-yellow-300 flex items-center gap-1.5 game-btn-depth cursor-pointer whitespace-nowrap"
          >
            <Trophy className="w-3.5 h-3.5" />
            Ranks [{formatKeyCode(keybinds.leaderboard)}]
          </button>
          <button
            onClick={onOpenScoreboard}
            className="mc-btn-stone rounded-sm px-2.5 py-1.5 text-xs font-bold text-[#7ce354] flex items-center gap-1.5 game-btn-depth cursor-pointer tabular-nums whitespace-nowrap"
          >
            <Users className="w-3.5 h-3.5" />
            {onlineCount} [Tab]
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
        <div className="flex flex-col items-end gap-1">
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

      {/* Center Classic Minecraft Crosshair + Hitmarker + Mining Progress */}
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

      {/* Bottom-Left Multiplayer Messages (Auto-Scroll + Open to All Players + MOD Delete) */}
      <div className="fixed bottom-28 sm:bottom-4 left-3 w-72 sm:w-80 flex flex-col gap-1.5">
        <div
          ref={chatScrollRef}
          className={`flex flex-col gap-1 max-h-36 overflow-y-auto game-scroll pr-0.5 ${
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
                  title="Delete message (MOD)"
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
              placeholder="Type message... (No spam)"
              className="flex-1 bg-[#141619]/95 border-2 border-[#6bc349] rounded-sm px-2.5 py-1.5 text-xs text-white outline-none"
            />
          </form>
        ) : (
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                onClick={onOpenChat}
                className="pointer-events-auto mc-panel hover:bg-[#3a3d42] rounded-sm px-2.5 py-1 text-[11px] font-semibold text-slate-200 flex items-center gap-1.5 cursor-pointer"
              >
                <MessageSquare className="w-3 h-3" />
                Messages [{formatKeyCode(keybinds.chat)}]
              </button>
              <div className="mc-panel rounded-sm px-2 py-1 text-[10px] font-semibold text-slate-300">
                [{formatKeyCode(keybinds.crouch)}] Crouch · [{formatKeyCode(keybinds.fireOrPlace)}] Fire/Place · [{formatKeyCode(keybinds.quickConvert)}] Convert
              </div>
            </div>
          )}
      </div>

      {/* Bottom-Center Hearts + Quick-Convert Bar + Fixed 9-Slot Hotbar */}
      <div className="fixed bottom-3 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1.5">
        {quickConvertOpen && quickConvertTargets && onQuickConvertCraft && (
          <div className="pointer-events-auto mc-panel rounded-sm px-2.5 py-1.5 border-[#7ce354] flex items-center gap-2 shadow-lg">
            <span className="text-[11px] font-bold text-amber-300 whitespace-nowrap">
              Convert {heldItem?.name}:
            </span>
            {quickConvertTargets.wallRecipeId && quickConvertTargets.wallItem && (
              <button
                onClick={() => onQuickConvertCraft(quickConvertTargets.wallRecipeId!)}
                className="mc-btn-stone rounded-sm px-2 py-1 text-[11px] font-bold text-white flex items-center gap-1.5 cursor-pointer hover:bg-[#4b5059]"
              >
                <span className="text-[#7ce354] font-mono-num">[1]</span>
                <ItemIcon itemId={quickConvertTargets.wallItem} size={18} />
                <span>Wall ×{quickConvertTargets.wallCount}</span>
              </button>
            )}
            {quickConvertTargets.stairsRecipeId && quickConvertTargets.stairsItem && (
              <button
                onClick={() => onQuickConvertCraft(quickConvertTargets.stairsRecipeId!)}
                className="mc-btn-stone rounded-sm px-2 py-1 text-[11px] font-bold text-white flex items-center gap-1.5 cursor-pointer hover:bg-[#4b5059]"
              >
                <span className="text-[#7ce354] font-mono-num">[2]</span>
                <ItemIcon itemId={quickConvertTargets.stairsItem} size={18} />
                <span>Stairs ×{quickConvertTargets.stairsCount}</span>
              </button>
            )}
            {onCloseQuickConvert && (
              <button
                onClick={onCloseQuickConvert}
                className="text-[10px] font-bold text-slate-300 hover:text-white px-1.5 py-0.5 cursor-pointer"
              >
                [Esc]
              </button>
            )}
          </div>
        )}

        {heldItem && (
          <div className="flex items-center gap-2.5 px-2.5 py-0.5 text-xs font-bold mc-text-shadow">
            <span className="font-display text-white">{heldItem.name}</span>
            {heldGun && (
              <>
                <span className="text-slate-300">·</span>
                <span className="font-mono-num text-amber-300">
                  {currentMag} / {heldGun.magSize} <span className="text-slate-200">({reserveAmmo})</span>
                </span>
                {heldGun.id === 'sniper' && (
                  <span className="text-sky-300 text-[11px]">· [RMB / {formatKeyCode(keybinds.scope)}] Scope</span>
                )}
              </>
            )}
            {!heldGun && quickConvertTargets && (
              <span className="text-[#7ce354] text-[11px]">
                · [{formatKeyCode(keybinds.quickConvert)}] Wall / Stairs
              </span>
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

        <div className="pointer-events-auto mc-panel rounded-sm p-1 flex items-center gap-1">
          {fixedHotbarSlots.map((itemId, idx) => {
            const active = idx === activeSlot;
            const count = itemId ? getItemCount(itemId) : 0;
            const showCount = itemId && ITEMS[itemId]?.kind !== 'weapon' && ITEMS[itemId]?.kind !== 'tool';
            return (
              <button
                key={`hotbar-slot-${idx}`}
                onClick={() => onSelectSlot(idx)}
                className={`relative w-10 h-10 sm:w-12 sm:h-12 rounded-none flex items-center justify-center cursor-pointer transition-transform ${
                  active ? 'mc-slot-active -translate-y-0.5' : 'mc-slot hover:bg-[#494c52]'
                }`}
              >
                <span className="absolute top-0.5 left-1 text-[9px] font-mono-num text-slate-300 mc-text-shadow">
                  {idx + 1}
                </span>
                {itemId && <ItemIcon itemId={itemId} size={30} />}
                {showCount && count > 0 && (
                  <span className="absolute bottom-0.5 right-1 text-[11px] font-mono-num font-bold text-white mc-text-shadow">
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tablet Touch Controls Overlay */}
      {touchControlsEnabled && (
        <div className="fixed inset-0 pointer-events-none">
          <div
            className="pointer-events-auto fixed bottom-28 left-6 w-28 h-28 rounded-full bg-[#141619]/60 border-2 border-white/30 flex items-center justify-center touch-none"
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
                  onTouchMove(nx, ny, dist > 36);
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

          <div
            className="pointer-events-auto fixed top-16 right-0 bottom-36 w-1/2 touch-none"
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

          <div className="pointer-events-auto fixed bottom-28 right-6 flex flex-col items-end gap-2.5">
            <div className="flex gap-2">
              {heldGun?.id === 'sniper' && onToggleScope && (
                <button
                  onTouchStart={(e) => {
                    e.preventDefault();
                    onToggleScope();
                  }}
                  className={`w-14 h-12 rounded-md font-display font-bold text-xs flex items-center justify-center ${
                    scoped ? 'mc-btn-green text-white' : 'mc-btn-stone text-sky-300'
                  }`}
                >
                  SCOPE
                </button>
              )}
              <button
                onTouchStart={(e) => {
                  e.preventDefault();
                  onTouchReload();
                }}
                className="w-12 h-12 mc-btn-stone rounded-md text-sky-300 flex items-center justify-center font-bold"
              >
                <RotateCw className="w-5 h-5" />
              </button>
              <button
                onTouchStart={(e) => {
                  e.preventDefault();
                  onTouchJump();
                }}
                className="w-14 h-12 mc-btn-green rounded-md text-white font-display font-bold text-xs"
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
                className="w-14 h-14 mc-btn-stone rounded-md text-amber-300 font-bold text-xs flex flex-col items-center justify-center"
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
                className="w-16 h-16 bg-rose-700 border-2 border-rose-950 border-b-4 rounded-md text-white font-bold text-xs flex items-center justify-center"
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
