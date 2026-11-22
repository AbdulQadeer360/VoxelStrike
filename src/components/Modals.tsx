import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Award,
  Ban,
  BookOpen,
  Check,
  Coins,
  Crosshair,
  ExternalLink,
  Flag,
  Hammer,
  Info,
  Keyboard,
  KeyRound,
  Lock,
  RotateCcw,
  Shield,
  ShieldAlert,
  ShoppingBag,
  Sparkles,
  Trash2,
  Trophy,
  UserCheck,
  Users,
  UserX,
  VolumeX,
  X,
} from 'lucide-react';
import type { EngineSettings } from '../game/VoxelEngine.ts';
import {
  CLAN_MIN_LEVEL,
  CRAFT_RECIPES,
  DEFAULT_KEYBINDINGS,
  formatKeyCode,
  GUN_LIST,
  GUN_SKINS,
  ITEMS,
  KEYBIND_LABELS,
  SHOP_ITEMS,
  SKINS,
  SPAWN_ZONES,
  WORLD_MAX_X,
  WORLD_MAX_Z,
  WORLD_MIN_X,
  WORLD_MIN_Z,
  type KeyActionId,
  type KeybindingsConfig,
} from '../shared/constants.ts';
import type {
  BanRecord,
  ChatMessage,
  CheatAlertRecord,
  ClanRecord,
  LeaderboardEntry,
  PlayerProfileState,
  PlayerPublicState,
  ReportRecord,
} from '../shared/protocol.ts';
import {
  getRiverSample,
  getTerrainHeight,
  isDesertBiome,
  LAVA_CRATERS,
  SNIPER_TOWERS,
  WATER_LEVEL,
} from '../shared/worldGen.ts';
import { ItemIcon } from './ItemIcon.tsx';

// ---- 1. Inventory & Crafting Workbench (Press X) ----
interface InventoryModalProps {
  profile: PlayerProfileState;
  activeSlot: number;
  onCraft: (recipeId: string) => void;
  onAssignHotbar: (slotIdx: number, itemId: string) => void;
  onClose: () => void;
}

export const InventoryCraftModal: React.FC<InventoryModalProps> = ({
  profile,
  activeSlot,
  onCraft,
  onAssignHotbar,
  onClose,
}) => {
  const [selectedHotbarIdx, setSelectedHotbarIdx] = useState(() =>
    Math.min(Math.max(0, activeSlot), 8)
  );

  const countOf = (id: string) => profile.inventory.find((s) => s.itemId === id)?.count ?? 0;

  // Fixed 9-slot hotbar preserving blanks
  const fixedHotbar = useMemo(
    () =>
      Array.from({ length: 9 }, (_, idx) => {
        const id = profile.hotbarSlots[idx] || '';
        if (!id || !ITEMS[id]) return '';
        const kind = ITEMS[id].kind;
        if (kind === 'weapon' || kind === 'tool') return id;
        return (profile.inventory.find((s) => s.itemId === id)?.count ?? 0) > 0 ? id : '';
      }),
    [profile.hotbarSlots, profile.inventory]
  );

  // 18-slot inventory bag: unlocked guns + owned items, padded with blank boxes
  const inventoryGridSlots = useMemo(() => {
    const entries: Array<{ itemId: string; count: number }> = [];
    const seen = new Set<string>();
    for (const gid of profile.unlockedGuns || ['rifle']) {
      if (ITEMS[gid] && !seen.has(gid)) {
        seen.add(gid);
        entries.push({ itemId: gid, count: 1 });
      }
    }
    for (const s of profile.inventory) {
      if (ITEMS[s.itemId] && s.count > 0 && !seen.has(s.itemId)) {
        seen.add(s.itemId);
        entries.push({ itemId: s.itemId, count: s.count });
      }
    }
    return Array.from({ length: 18 }, (_, i) => entries[i] ?? null);
  }, [profile.unlockedGuns, profile.inventory]);

  const handleInventoryAssign = (itemId: string) => {
    const def = ITEMS[itemId];
    if (!def || itemId === 'ammo') return;
    if (def.kind === 'weapon') {
      setSelectedHotbarIdx(0);
      onAssignHotbar(0, itemId);
      return;
    }
    if (itemId === 'pickaxe') {
      setSelectedHotbarIdx(1);
      onAssignHotbar(1, itemId);
      return;
    }
    const existingIdx = fixedHotbar.indexOf(itemId);
    if (existingIdx >= 2) {
      setSelectedHotbarIdx(existingIdx);
      onAssignHotbar(existingIdx, itemId);
      return;
    }
    const firstEmptyIdx = fixedHotbar.findIndex((id, i) => i >= 2 && !id);
    const targetIdx =
      selectedHotbarIdx >= 2
        ? selectedHotbarIdx
        : firstEmptyIdx !== -1
        ? firstEmptyIdx
        : 2;
    setSelectedHotbarIdx(targetIdx);
    onAssignHotbar(targetIdx, itemId);
  };

  return (
    <div className="fixed inset-0 z-30 bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="w-full max-w-2xl mc-panel rounded-md p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Hammer className="w-5 h-5 text-amber-400" />
          </div>
          <button onClick={onClose} aria-label="Close" className="p-1.5 rounded-sm mc-btn-stone text-slate-200 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
          {/* Left: Clean Icon-Only 18-Slot Minecraft Storage + 9-Slot Hotbar */}
          <div className="md:col-span-7 flex flex-col gap-3">
            <div className="grid grid-cols-6 gap-1.5 p-1.5 bg-[#1b1d20]/70 border-2 border-[#0e0f11]">
              {inventoryGridSlots.map((slot, i) => {
                if (!slot) {
                  return (
                    <div
                      key={`empty-inv-${i}`}
                      className="aspect-square mc-slot opacity-65"
                    />
                  );
                }
                const def = ITEMS[slot.itemId];
                if (!def) return null;
                const inHotbar = fixedHotbar.includes(slot.itemId);
                const showCount = def.kind !== 'weapon' && def.kind !== 'tool';
                return (
                  <button
                    key={slot.itemId}
                    title={def.name}
                    onClick={() => handleInventoryAssign(slot.itemId)}
                    className={`relative aspect-square flex items-center justify-center cursor-pointer ${
                      inHotbar ? 'mc-slot-active' : 'mc-slot hover:bg-[#494c52]'
                    }`}
                  >
                    <ItemIcon itemId={slot.itemId} size={32} />
                    {showCount && (
                      <span className="absolute bottom-0.5 right-1 text-[11px] font-mono-num font-bold text-white mc-text-shadow">
                        {slot.count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Bottom 9-Slot Hotbar Strip */}
            <div className="border-t-2 border-[#0e0f11] pt-2.5 flex items-center justify-center gap-1 flex-wrap">
              {fixedHotbar.map((id, idx) => {
                const def = id ? ITEMS[id] : undefined;
                const cnt = id ? countOf(id) : 0;
                const showCount = Boolean(def && def.kind !== 'weapon' && def.kind !== 'tool');
                return (
                  <button
                    key={`modal-hotbar-${idx}`}
                    title={def?.name || `Slot ${idx + 1}`}
                    onClick={() => setSelectedHotbarIdx(idx)}
                    className={`relative w-10 h-10 sm:w-11 sm:h-11 flex items-center justify-center cursor-pointer ${
                      selectedHotbarIdx === idx ? 'mc-slot-active' : 'mc-slot hover:bg-[#494c52]'
                    }`}
                  >
                    <span className="absolute top-0.5 left-1 text-[9px] font-mono-num text-slate-300">
                      {idx + 1}
                    </span>
                    {id && <ItemIcon itemId={id} size={26} />}
                    {showCount && cnt > 0 && (
                      <span className="absolute bottom-0.5 right-1 text-[10px] font-mono-num font-bold text-white mc-text-shadow">
                        {cnt}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right: Inside Crafting & Block Conversion Panel */}
          <div className="md:col-span-5 grid grid-cols-1 gap-1.5 max-h-72 overflow-y-auto game-scroll pr-1">
            {CRAFT_RECIPES.map((rec) => {
              const canCraft = rec.ingredients.every((ing) => countOf(ing.item) >= ing.count);
              const outName = ITEMS[rec.outputItem]?.name || rec.label;
              return (
                <button
                  key={rec.id}
                  disabled={!canCraft}
                  title={rec.label}
                  onClick={() => onCraft(rec.id)}
                  className={`p-2 flex items-center justify-between gap-2 transition-colors ${
                    canCraft
                      ? 'mc-slot hover:bg-[#494c52] border-[#56b834] cursor-pointer'
                      : 'mc-slot opacity-45 cursor-not-allowed'
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    {rec.ingredients.map((ing) => {
                      const hasEnough = countOf(ing.item) >= ing.count;
                      return (
                        <div
                          key={ing.item}
                          title={ITEMS[ing.item]?.name}
                          className={`relative w-10 h-10 bg-[#141619] border flex items-center justify-center ${
                            hasEnough ? 'border-[#56b834]/70' : 'border-rose-500/60'
                          }`}
                        >
                          <ItemIcon itemId={ing.item} size={26} />
                          <span
                            className={`absolute bottom-0 right-0.5 text-[10px] font-mono-num font-bold mc-text-shadow ${
                              hasEnough ? 'text-[#7ce354]' : 'text-rose-400'
                            }`}
                          >
                            {ing.count}
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  <ArrowRight className={`w-4 h-4 shrink-0 ${canCraft ? 'text-[#7ce354]' : 'text-slate-500'}`} />

                  <div
                    title={outName}
                    className={`relative w-11 h-11 flex items-center justify-center ${
                      canCraft ? 'mc-slot-active' : 'bg-[#141619] border border-black/40'
                    }`}
                  >
                    <ItemIcon itemId={rec.outputItem} size={30} />
                    <span className="absolute bottom-0 right-1 text-[11px] font-mono-num font-bold text-amber-300 mc-text-shadow">
                      {rec.outputCount}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

// ---- 2. Skins, Gun Skins & Supply Shop Modal ----
interface ShopSkinsModalProps {
  initialTab: 'skins' | 'shop';
  profile: PlayerProfileState;
  onSkinAction: (skinId: string) => void;
  onGunSkinAction: (gunSkinId: string) => void;
  onShopBuy: (itemId: string) => void;
  onClose: () => void;
}

export const ShopSkinsModal: React.FC<ShopSkinsModalProps> = ({
  initialTab,
  profile,
  onSkinAction,
  onGunSkinAction,
  onShopBuy,
  onClose,
}) => {
  const [tab, setTab] = useState<'skins' | 'gunskins' | 'shop'>(initialTab);

  return (
    <div className="fixed inset-0 z-30 bg-black/70 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl mc-panel rounded-md p-5">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setTab('skins')}
              className={`px-3.5 py-1.5 rounded-sm text-xs sm:text-sm font-display font-bold flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                tab === 'skins' ? 'mc-btn-green text-white mc-text-shadow' : 'mc-btn-stone text-slate-200'
              }`}
            >
              <Sparkles className="w-4 h-4" />
              Hero Skins
            </button>
            <button
              onClick={() => setTab('gunskins')}
              className={`px-3.5 py-1.5 rounded-sm text-xs sm:text-sm font-display font-bold flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                tab === 'gunskins' ? 'mc-btn-green text-white mc-text-shadow' : 'mc-btn-stone text-slate-200'
              }`}
            >
              <Crosshair className="w-4 h-4" />
              Gun Skins
            </button>
            <button
              onClick={() => setTab('shop')}
              className={`px-3.5 py-1.5 rounded-sm text-xs sm:text-sm font-display font-bold flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                tab === 'shop' ? 'mc-btn-green text-white mc-text-shadow' : 'mc-btn-stone text-slate-200'
              }`}
            >
              <ShoppingBag className="w-4 h-4" />
              Supply Shop
            </button>
          </div>
          <div className="flex items-center gap-2.5">
            <div className="mc-slot px-3 py-1 flex items-center gap-1.5 text-sm font-bold text-amber-300 tabular-nums">
              <Coins className="w-4 h-4" />
              {profile.coins}
            </div>
            <button onClick={onClose} className="p-1.5 rounded-sm mc-btn-stone text-slate-200 cursor-pointer">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {tab === 'skins' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-80 overflow-y-auto game-scroll pr-1">
            {SKINS.map((sk) => {
              const unlocked = profile.unlockedSkins.includes(sk.id);
              const equipped = profile.skinId === sk.id;
              return (
                <div
                  key={sk.id}
                  className={`p-3 flex items-center justify-between gap-3 ${
                    equipped ? 'mc-slot-active' : 'mc-slot'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-12 h-12 border-2 border-black/40 relative overflow-hidden flex flex-col items-center justify-center shrink-0"
                      style={{ backgroundColor: sk.bodyColor }}
                    >
                      <div
                        className="w-8 h-6 relative flex items-center justify-around px-1"
                        style={{ backgroundColor: sk.style === 'ninja' ? sk.accentColor : sk.skinTone }}
                      >
                        <div className="w-1.5 h-1.5" style={{ backgroundColor: sk.visorColor }} />
                        <div className="w-1.5 h-1.5" style={{ backgroundColor: sk.visorColor }} />
                      </div>
                      <div className="w-9 h-2 mt-0.5" style={{ backgroundColor: sk.accentColor }} />
                    </div>
                    <div>
                      <div className="font-bold text-sm text-white">{sk.name}</div>
                      <div className="text-xs text-slate-300 mt-0.5 capitalize">
                        {unlocked ? (equipped ? 'Equipped' : 'Unlocked') : `${sk.price} Coins`} · {sk.style}
                      </div>
                    </div>
                  </div>
                  <button
                    disabled={!unlocked && profile.coins < sk.price}
                    onClick={() => onSkinAction(sk.id)}
                    className={`px-3 py-1.5 rounded-sm text-xs font-display font-bold game-btn-depth ${
                      equipped
                        ? 'mc-btn-green text-white mc-text-shadow cursor-pointer'
                        : unlocked || profile.coins >= sk.price
                        ? 'mc-btn-stone text-amber-300 cursor-pointer'
                        : 'mc-btn-stone opacity-45 text-slate-400 cursor-not-allowed'
                    }`}
                  >
                    {equipped ? 'Active' : unlocked ? 'Equip' : 'Unlock'}
                  </button>
                </div>
              );
            })}
          </div>
        ) : tab === 'gunskins' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-80 overflow-y-auto game-scroll pr-1">
            {GUN_SKINS.map((gs) => {
              const unlocked = profile.unlockedGunSkins?.includes(gs.id);
              const equipped = profile.gunSkinId === gs.id;
              return (
                <div
                  key={gs.id}
                  className={`p-3 flex items-center justify-between gap-3 ${
                    equipped ? 'mc-slot-active' : 'mc-slot'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-14 h-12 border-2 border-black/40 flex flex-col items-center justify-center shrink-0 relative overflow-hidden"
                      style={{ background: `linear-gradient(135deg, ${gs.primaryHex}, ${gs.secondaryHex})` }}
                    >
                      <div className="w-10 h-2.5 relative" style={{ backgroundColor: gs.primaryHex, border: `1px solid ${gs.accentHex}` }}>
                        <div className="absolute -top-1.5 left-3 w-3 h-1.5" style={{ backgroundColor: gs.accentHex }} />
                        <div className="absolute top-2.5 left-4 w-2 h-2.5" style={{ backgroundColor: gs.secondaryHex }} />
                        <div className="absolute top-0.5 -right-2 w-2.5 h-1" style={{ backgroundColor: gs.accentHex }} />
                      </div>
                    </div>
                    <div>
                      <div className="font-bold text-sm text-white">{gs.name}</div>
                      <div className="text-xs text-slate-300 mt-0.5 capitalize">
                        {unlocked ? (equipped ? 'Equipped' : 'Unlocked') : gs.price === 0 ? 'FREE' : `${gs.price} Coins`} · {gs.pattern}
                      </div>
                    </div>
                  </div>
                  <button
                    disabled={!unlocked && profile.coins < gs.price}
                    onClick={() => onGunSkinAction(gs.id)}
                    className={`px-3 py-1.5 rounded-sm text-xs font-display font-bold game-btn-depth ${
                      equipped
                        ? 'mc-btn-green text-white mc-text-shadow cursor-pointer'
                        : unlocked || profile.coins >= gs.price
                        ? 'mc-btn-stone text-amber-300 cursor-pointer'
                        : 'mc-btn-stone opacity-45 text-slate-400 cursor-not-allowed'
                    }`}
                  >
                    {equipped ? 'Active' : unlocked ? 'Equip' : 'Unlock'}
                  </button>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-col gap-2 max-h-80 overflow-y-auto game-scroll pr-1">
            {SHOP_ITEMS.map((item) => {
              const maxed =
                (item.id === 'upgrade_pickaxe' && profile.pickaxeTier >= 3) ||
                (item.id === 'upgrade_rifle' && profile.rifleDamageBonus >= 12);
              const canAfford = profile.coins >= item.price && !maxed;
              return (
                <div
                  key={item.id}
                  className="mc-slot p-3.5 flex items-center justify-between gap-3"
                >
                  <div>
                    <div className="font-bold text-sm text-white">{item.name}</div>
                    <div className="text-xs text-slate-300 mt-0.5">{item.description}</div>
                  </div>
                  <button
                    disabled={!canAfford}
                    onClick={() => onShopBuy(item.id)}
                    className={`shrink-0 px-4 py-2 rounded-sm text-xs font-display font-bold game-btn-depth tabular-nums ${
                      maxed
                        ? 'mc-btn-green text-white opacity-80'
                        : canAfford
                        ? 'mc-btn-stone text-amber-300 cursor-pointer'
                        : 'mc-btn-stone opacity-45 text-slate-400 cursor-not-allowed'
                    }`}
                  >
                    {maxed ? 'Maxed' : `${item.price} Coins`}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

// ---- 3. Leaderboard & Settings Modal ----
interface LeaderboardSettingsModalProps {
  tab: 'leaderboard' | 'settings';
  settings: EngineSettings;
  keybinds: KeybindingsConfig;
  touchEnabled: boolean;
  onUpdateSettings: (partial: Partial<EngineSettings>) => void;
  onUpdateKeybind: (action: KeyActionId, code: string) => void;
  onResetKeybinds: () => void;
  onToggleTouch: (enabled: boolean) => void;
  onClose: () => void;
}

export const LeaderboardSettingsModal: React.FC<LeaderboardSettingsModalProps> = ({
  tab,
  settings,
  keybinds,
  touchEnabled,
  onUpdateSettings,
  onUpdateKeybind,
  onResetKeybinds,
  onToggleTouch,
  onClose,
}) => {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [listeningAction, setListeningAction] = useState<KeyActionId | null>(null);

  useEffect(() => {
    if (!listeningAction) return;
    const onCaptureKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.code === 'Escape') {
        setListeningAction(null);
        return;
      }
      onUpdateKeybind(listeningAction, e.code);
      setListeningAction(null);
    };
    window.addEventListener('keydown', onCaptureKey, { capture: true });
    return () => window.removeEventListener('keydown', onCaptureKey, { capture: true });
  }, [listeningAction, onUpdateKeybind]);

  useEffect(() => {
    if (tab !== 'leaderboard') return;
    fetch('/api/leaderboard')
      .then((r) => r.json())
      .then((d) => setEntries(d.entries || []))
      .catch(() => {});
  }, [tab]);

  return (
    <div className="fixed inset-0 z-30 bg-black/70 flex items-center justify-center p-4">
      <div className="w-full max-w-xl mc-panel rounded-md p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            {tab === 'leaderboard' ? (
              <Trophy className="w-5 h-5 text-yellow-400" />
            ) : null}
            <h2 className="font-display text-lg sm:text-xl font-bold text-white mc-text-shadow">
              {tab === 'leaderboard' ? 'Frontier Leaderboard' : 'Game Settings'}
            </h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-sm mc-btn-stone text-slate-200 cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        {tab === 'leaderboard' ? (
          <div className="max-h-80 overflow-y-auto game-scroll">
            {entries.length === 0 ? (
              <div className="text-sm text-slate-300 py-8 text-center">No players recorded yet.</div>
            ) : (
              <table className="w-full text-left text-xs">
                <thead className="text-slate-300 border-b border-[#1b1d20]">
                  <tr>
                    <th className="py-2">#</th>
                    <th className="py-2">Player</th>
                    <th className="py-2">Level</th>
                    <th className="py-2">XP</th>
                    <th className="py-2">Kills</th>
                    <th className="py-2">Mined</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1b1d20] tabular-nums">
                  {entries.map((e, i) => (
                    <tr key={e.playerId} className="text-slate-100">
                      <td className="py-2 font-bold text-amber-400">{i + 1}</td>
                      <td className="py-2 font-semibold">
                        {e.isMod && (
                          <span className="inline-block bg-amber-400 text-slate-950 font-black px-1 rounded-xs mr-1.5 text-[10px]">
                            [MOD]
                          </span>
                        )}
                        {e.username}
                        {e.clanName ? <span className="text-[#7ce354] ml-1">({e.clanName})</span> : null}
                      </td>
                      <td className="py-2 text-[#7ce354]">Lv.{e.level}</td>
                      <td className="py-2 text-sky-300">{e.xp}</td>
                      <td className="py-2">{e.kills}</td>
                      <td className="py-2">{e.blocksMined}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-4 text-sm">
            <div>
              <div className="flex justify-between font-semibold mb-1">
                <span>Field of View (FOV)</span>
                <span className="font-mono-num text-[#7ce354]">{settings.fov}°</span>
              </div>
              <input
                type="range"
                min={60}
                max={105}
                value={settings.fov}
                onChange={(e) => onUpdateSettings({ fov: Number(e.target.value) })}
                className="w-full accent-[#56b834]"
              />
            </div>

            <div>
              <div className="flex justify-between font-semibold mb-1">
                <span>Render Distance (Chunks)</span>
                <span className="font-mono-num text-[#7ce354]">{settings.renderDistance}</span>
              </div>
              <input
                type="range"
                min={3}
                max={8}
                value={settings.renderDistance}
                onChange={(e) => onUpdateSettings({ renderDistance: Number(e.target.value) })}
                className="w-full accent-[#56b834]"
              />
            </div>

            <div>
              <div className="flex justify-between font-semibold mb-1">
                <span>Mouse Sensitivity</span>
                <span className="font-mono-num text-amber-300">{(settings.sensitivity * 1000).toFixed(1)}</span>
              </div>
              <input
                type="range"
                min={1}
                max={5}
                step={0.2}
                value={settings.sensitivity * 1000}
                onChange={(e) => onUpdateSettings({ sensitivity: Number(e.target.value) / 1000 })}
                className="w-full accent-amber-400"
              />
            </div>

            <label className="mc-slot flex items-center justify-between px-4 py-3 cursor-pointer">
              <div>
                <div className="font-bold text-white">Tablet Touch Controls</div>
                <div className="text-xs text-slate-300">On-screen virtual stick &amp; fire/mine buttons</div>
              </div>
              <input
                type="checkbox"
                checked={touchEnabled}
                onChange={(e) => onToggleTouch(e.target.checked)}
                className="w-5 h-5 accent-[#56b834]"
              />
            </label>

            <div className="border-t border-[#1b1d20] pt-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 font-bold text-white">
                  <Keyboard className="w-4 h-4 text-[#7ce354]" />
                  <span>Keyboard Controls</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setListeningAction(null);
                    onResetKeybinds();
                  }}
                  className="px-2.5 py-1 rounded-sm mc-btn-stone text-[11px] font-bold text-slate-200 inline-flex items-center gap-1 cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" />
                  Reset Defaults
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-48 overflow-y-auto game-scroll pr-1">
                {KEYBIND_LABELS.map((item) => {
                  const isListening = listeningAction === item.id;
                  const code = keybinds[item.id] || DEFAULT_KEYBINDINGS[item.id];
                  return (
                    <div
                      key={item.id}
                      className="mc-slot px-3 py-2 flex items-center justify-between gap-2"
                    >
                      <span className="text-xs font-semibold text-slate-200 truncate">{item.label}</span>
                      <button
                        type="button"
                        onClick={() => setListeningAction(isListening ? null : item.id)}
                        className={`px-2.5 py-1 rounded-sm text-xs font-mono-num font-bold min-w-[68px] text-center cursor-pointer ${
                          isListening
                            ? 'mc-btn-green text-white animate-pulse'
                            : 'mc-btn-stone text-amber-300'
                        }`}
                      >
                        {isListening ? 'Press key...' : formatKeyCode(code)}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ---- 4. Scoreboard & Player Report Modal ----
interface ScoreboardModalProps {
  selfId: string;
  players: PlayerPublicState[];
  onReportPlayer: (targetId: string, reason: string, details: string) => void;
  onClose: () => void;
}

export const ScoreboardReportModal: React.FC<ScoreboardModalProps> = ({
  selfId,
  players,
  onReportPlayer,
  onClose,
}) => {
  const [reportingTarget, setReportingTarget] = useState<PlayerPublicState | null>(null);
  const [reason, setReason] = useState('Speed / Fly Hack');
  const [details, setDetails] = useState('');

  return (
    <div className="fixed inset-0 z-30 bg-black/70 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl mc-panel rounded-md p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-lg sm:text-xl font-bold text-white mc-text-shadow">
            Online Survivors ({players.length})
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-sm mc-btn-stone text-slate-200 cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        {reportingTarget ? (
          <form
            className="mc-slot flex flex-col gap-3 p-4"
            onSubmit={(e) => {
              e.preventDefault();
              onReportPlayer(reportingTarget.id, reason, details);
              setReportingTarget(null);
              setDetails('');
            }}
          >
            <div className="font-bold text-sm text-rose-300 flex items-center gap-2">
              <Flag className="w-4 h-4" />
              Report {reportingTarget.username} (Reviewed by Moderator)
            </div>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="bg-[#1b1d20] border-2 border-[#0e0f11] px-3 py-2 text-sm text-white"
            >
              <option>Speed / Fly Hack</option>
              <option>Teleporting / Reach Hack</option>
              <option>Combat / Damage Exploit</option>
              <option>Chat Abuse / Harassment</option>
            </select>
            <textarea
              value={details}
              maxLength={300}
              onChange={(e) => setDetails(e.target.value)}
              placeholder="Describe what happened..."
              className="bg-[#1b1d20] border-2 border-[#0e0f11] px-3 py-2 text-sm text-white h-20"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setReportingTarget(null)}
                className="px-3 py-1.5 rounded-sm mc-btn-stone text-xs font-bold text-white cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 rounded-sm bg-rose-600 hover:bg-rose-500 border-2 border-rose-950 text-xs font-bold text-white cursor-pointer"
              >
                Submit Report
              </button>
            </div>
          </form>
        ) : (
          <div className="max-h-72 overflow-y-auto game-scroll">
            <table className="w-full text-left text-xs">
              <thead className="text-slate-300 border-b border-[#1b1d20]">
                <tr>
                  <th className="py-2">Player</th>
                  <th className="py-2">Level</th>
                  <th className="py-2">Kills</th>
                  <th className="py-2">Deaths</th>
                  <th className="py-2">Mined</th>
                  <th className="py-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1b1d20] tabular-nums">
                {players.map((p) => (
                  <tr key={p.id} className="text-slate-100">
                    <td className="py-2 font-bold">
                      {p.isMod && (
                        <span className="inline-block bg-amber-400 text-slate-950 font-black px-1 rounded-xs mr-1.5 text-[10px]">
                          [MOD]
                        </span>
                      )}
                      {p.username}
                      {p.clanName ? <span className="text-[#7ce354] ml-1">({p.clanName})</span> : null}{' '}
                      {p.id === selfId ? <span className="text-sky-300">(You)</span> : null}
                    </td>
                    <td className="py-2 text-[#7ce354]">Lv.{p.level}</td>
                    <td className="py-2">{p.kills}</td>
                    <td className="py-2">{p.deaths}</td>
                    <td className="py-2">{p.blocksMined}</td>
                    <td className="py-2 text-right">
                      {p.id !== selfId && (
                        <button
                          onClick={() => setReportingTarget(p)}
                          className="px-2.5 py-1 rounded-sm mc-btn-stone text-rose-300 text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer"
                        >
                          <Flag className="w-3 h-3" />
                          Report
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

// ---- 5. Moderation & Anti-Cheat Console Modal ----
interface ModerationModalProps {
  profile: PlayerProfileState;
  playerSecret: string;
  onToast?: (msg: string) => void;
  onClose: () => void;
}

export const ModerationModal: React.FC<ModerationModalProps> = ({
  profile,
  playerSecret,
  onToast,
  onClose,
}) => {
  const [token, setToken] = useState<string | null>(null);
  const [modRole, setModRole] = useState<'owner' | 'mod'>('mod');
  const [modName, setModName] = useState<string>('');
  const [passcode, setPasscode] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [subTab, setSubTab] = useState<'players' | 'chat' | 'reports' | 'anticheat' | 'bans'>('players');

  const [banAmount, setBanAmount] = useState(60);
  const [banUnit, setBanUnit] = useState<'minutes' | 'hours' | 'days'>('minutes');
  const [banReason, setBanReason] = useState('Rule violation');
  const [manualUsername, setManualUsername] = useState('');
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  const [online, setOnline] = useState<
    Array<{ id: string; username: string; clanName?: string; isMod?: boolean; ip: string; cheatScore: number; muted: boolean }>
  >([]);
  const [knownPlayers, setKnownPlayers] = useState<
    Array<{ playerId: string; username: string; clanName?: string; level: number; isMod: boolean }>
  >([]);
  const [recentChat, setRecentChat] = useState<ChatMessage[]>([]);
  const [reports, setReports] = useState<ReportRecord[]>([]);
  const [bans, setBans] = useState<BanRecord[]>([]);
  const [alerts, setAlerts] = useState<CheatAlertRecord[]>([]);

  const loadOverview = async (tok: string) => {
    const res = await fetch('/api/admin/overview', {
      headers: { Authorization: `Bearer ${tok}` },
    });
    if (!res.ok) {
      setToken(null);
      return;
    }
    const data = await res.json();
    if (data.role === 'owner' || data.role === 'mod') {
      setModRole(data.role);
    }
    if (typeof data.modName === 'string') {
      setModName(data.modName);
    }
    setOnline(data.online || []);
    setKnownPlayers(data.knownPlayers || []);
    setRecentChat(data.recentChat || []);
    setReports(data.reports || []);
    setBans(data.bans || []);
    setAlerts(data.cheatAlerts || []);
  };

  useEffect(() => {
    if (profile.isMod && playerSecret) {
      fetch('/api/mod/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId: profile.playerId, playerSecret }),
      })
        .then(async (r) => {
          if (!r.ok) return;
          const d = await r.json();
          if (d.token) {
            setToken(d.token);
            setModRole(d.role === 'owner' ? 'owner' : 'mod');
            setModName(d.modName || profile.username);
            loadOverview(d.token);
          }
        })
        .catch(() => {});
    }
  }, [profile.isMod, profile.playerId, profile.username, playerSecret]);

  const computedMinutes = Math.max(
    1,
    Math.min(
      525600,
      Math.round(banAmount * (banUnit === 'days' ? 1440 : banUnit === 'hours' ? 60 : 1))
    )
  );

  const formatDurationLabel = () => `${banAmount} ${banUnit}`;

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ passcode }),
    });
    const data = await res.json();
    if (!res.ok) {
      setAuthError(data.error || 'Invalid moderator passcode');
      return;
    }
    setToken(data.token);
    setModRole(data.role === 'owner' ? 'owner' : 'mod');
    setModName(data.modName || 'Dev');
    setPasscode('');
    loadOverview(data.token);
  };

  const runAction = async (payload: Record<string, unknown>, feedback?: string) => {
    if (!token) return;
    setActionMsg(null);
    const res = await fetch('/api/admin/action', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) {
      const errTxt = d.error || 'Action failed';
      setActionMsg(errTxt);
      onToast?.(errTxt);
    } else if (feedback) {
      setActionMsg(feedback);
      onToast?.(feedback);
    }
    loadOverview(token);
  };

  const isOwner = modRole === 'owner';

  return (
    <div className="fixed inset-0 z-30 bg-black/75 flex items-center justify-center p-4">
      <div className="w-full max-w-4xl mc-panel rounded-md p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5 flex-wrap">
            <ShieldAlert className="w-5 h-5 text-rose-400" />
            <h2 className="font-display text-lg sm:text-xl font-bold text-white mc-text-shadow">
              Moderation &amp; Anti-Cheat
            </h2>
            {token && (
              <span
                className={`px-2 py-0.5 rounded-sm text-xs font-black tracking-wide ${
                  isOwner ? 'bg-rose-500 text-white' : 'bg-amber-400 text-slate-950'
                }`}
              >
                {isOwner ? `Original MOD: ${modName || 'Dev'}` : `[MOD] ${modName || profile.username}`}
              </span>
            )}
          </div>
          <button onClick={onClose} className="p-1.5 rounded-sm mc-btn-stone text-slate-200 cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        {!token ? (
          <form onSubmit={handleAuthSubmit} className="max-w-sm mx-auto py-6 flex flex-col gap-3">
            <div className="flex items-center gap-2 text-sm font-bold text-slate-100">
              <Lock className="w-4 h-4 text-amber-400" />
              Enter Moderator Passcode
            </div>
            <p className="text-xs text-slate-300">
              Original MOD Dev unlocks full controls with the server passcode. Promoted [MOD] players unlock automatically.
            </p>
            <input
              type="password"
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
              placeholder="Moderator passcode..."
              className="bg-[#1b1d20] border-2 border-[#0e0f11] px-3.5 py-2.5 text-sm text-white outline-none focus:border-[#6bc349]"
            />
            {authError && <div className="text-xs font-semibold text-rose-400">{authError}</div>}
            <button
              type="submit"
              className="mc-btn-green text-white font-display font-bold text-sm py-2.5 rounded-sm mc-text-shadow game-btn-depth cursor-pointer"
            >
              Unlock Console
            </button>
          </form>
        ) : (
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <div className="flex flex-wrap items-center gap-2">
                {(['players', 'chat', 'reports', 'anticheat', 'bans'] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => {
                      setSubTab(t);
                      loadOverview(token);
                    }}
                    className={`px-3 py-1.5 rounded-sm text-xs font-display font-bold capitalize cursor-pointer ${
                      subTab === t ? 'mc-btn-green text-white mc-text-shadow' : 'mc-btn-stone text-slate-200'
                    }`}
                  >
                    {t === 'anticheat'
                      ? `Anti-Cheat (${alerts.length})`
                      : t === 'chat'
                      ? `Chat (${recentChat.length})`
                      : t === 'reports'
                      ? `Reports (${reports.filter((r) => r.status === 'pending').length})`
                      : t === 'bans'
                      ? `Bans (${bans.length})`
                      : `Players (${online.length})`}
                  </button>
                ))}
              </div>
              {actionMsg && (
                <div className="text-xs font-bold text-amber-300 bg-black/40 px-2.5 py-1 rounded-sm">
                  {actionMsg}
                </div>
              )}
            </div>

            {subTab === 'players' && (
              <div className="mc-slot p-3 mb-3 flex flex-col gap-2.5">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-bold text-amber-300">Ban / Mute Duration:</span>
                  <input
                    type="number"
                    min={1}
                    max={9999}
                    value={banAmount}
                    onChange={(e) => setBanAmount(Math.max(1, Number(e.target.value) || 1))}
                    className="w-20 bg-[#141619] border border-[#0e0f11] px-2 py-1 text-xs font-mono-num text-white outline-none"
                  />
                  <select
                    value={banUnit}
                    onChange={(e) => setBanUnit(e.target.value as 'minutes' | 'hours' | 'days')}
                    className="bg-[#141619] border border-[#0e0f11] px-2 py-1 text-xs text-white outline-none"
                  >
                    <option value="minutes">Minutes</option>
                    <option value="hours">Hours</option>
                    <option value="days">Days</option>
                  </select>
                  <input
                    value={banReason}
                    maxLength={80}
                    onChange={(e) => setBanReason(e.target.value)}
                    placeholder="Reason..."
                    className="flex-1 min-w-[140px] bg-[#141619] border border-[#0e0f11] px-2.5 py-1 text-xs text-white outline-none"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <input
                    value={manualUsername}
                    maxLength={18}
                    onChange={(e) => setManualUsername(e.target.value)}
                    placeholder="Target username (online or offline)..."
                    className="flex-1 min-w-[180px] bg-[#141619] border border-[#0e0f11] px-2.5 py-1.5 text-xs text-white outline-none"
                  />
                  <button
                    disabled={!manualUsername.trim()}
                    onClick={() =>
                      runAction(
                        {
                          action: 'temp_ban',
                          targetUsername: manualUsername.trim(),
                          durationMinutes: computedMinutes,
                          reason: banReason,
                        },
                        `Banned ${manualUsername.trim()} for ${formatDurationLabel()}`
                      )
                    }
                    className="px-3 py-1.5 rounded-sm bg-orange-600 hover:bg-orange-500 disabled:opacity-45 text-[11px] font-bold text-white cursor-pointer"
                  >
                    Ban {formatDurationLabel()}
                  </button>
                  <button
                    disabled={!manualUsername.trim()}
                    onClick={() =>
                      runAction(
                        { action: 'make_mod', targetUsername: manualUsername.trim() },
                        `${manualUsername.trim()} promoted to [MOD]`
                      )
                    }
                    className="px-3 py-1.5 rounded-sm mc-btn-green disabled:opacity-45 text-[11px] font-bold text-white cursor-pointer"
                  >
                    Make MOD
                  </button>
                  {isOwner && (
                    <button
                      disabled={!manualUsername.trim()}
                      onClick={() =>
                        runAction(
                          { action: 'remove_mod', targetUsername: manualUsername.trim() },
                          `Removed [MOD] from ${manualUsername.trim()}`
                        )
                      }
                      className="px-3 py-1.5 rounded-sm mc-btn-stone disabled:opacity-45 text-[11px] font-bold text-amber-300 cursor-pointer"
                    >
                      Remove MOD
                    </button>
                  )}
                </div>
              </div>
            )}

            <div className="max-h-72 overflow-y-auto game-scroll flex flex-col gap-2 pr-1">
              {subTab === 'players' && (
                <>
                  {online.length === 0 ? (
                    <div className="text-xs text-slate-300 py-3 text-center">No players currently connected in-game.</div>
                  ) : (
                    online.map((p) => (
                      <div key={p.id} className="mc-slot p-3 flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <div className="font-bold text-sm text-white flex items-center gap-1.5">
                            {p.isMod && (
                              <span className="bg-amber-400 text-slate-950 font-black px-1.5 py-0.5 rounded-xs text-[10px]">
                                [MOD]
                              </span>
                            )}
                            <span>
                              {p.username}
                              {p.clanName ? <span className="text-[#7ce354] ml-1">({p.clanName})</span> : null}
                            </span>
                            {p.muted && <span className="text-xs text-amber-400">[Muted]</span>}
                          </div>
                          <div className="text-[11px] text-slate-300 font-mono-num">
                            IP: {p.ip} · Cheat flags: {p.cheatScore}
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          <button
                            onClick={() => runAction({ action: 'kick', targetPlayerId: p.id, reason: banReason }, `Kicked ${p.username}`)}
                            className="px-2.5 py-1 rounded-sm mc-btn-stone text-[11px] font-bold text-white inline-flex items-center gap-1 cursor-pointer"
                          >
                            <UserX className="w-3 h-3" /> Kick
                          </button>
                          <button
                            onClick={() =>
                              runAction(
                                { action: 'mute', targetPlayerId: p.id, targetUsername: p.username, durationMinutes: computedMinutes, reason: banReason },
                                `Muted ${p.username} for ${formatDurationLabel()}`
                              )
                            }
                            className="px-2.5 py-1 rounded-sm mc-btn-stone text-[11px] font-bold text-amber-300 inline-flex items-center gap-1 cursor-pointer"
                          >
                            <VolumeX className="w-3 h-3" /> Mute {formatDurationLabel()}
                          </button>
                          <button
                            onClick={() =>
                              runAction(
                                { action: 'temp_ban', targetPlayerId: p.id, targetUsername: p.username, durationMinutes: computedMinutes, reason: banReason },
                                `Banned ${p.username} for ${formatDurationLabel()}`
                              )
                            }
                            className="px-2.5 py-1 rounded-sm bg-orange-700 hover:bg-orange-600 text-[11px] font-bold text-white cursor-pointer"
                          >
                            Ban {formatDurationLabel()}
                          </button>
                          <button
                            onClick={() =>
                              runAction(
                                { action: 'perm_ban', targetPlayerId: p.id, targetUsername: p.username, reason: banReason },
                                `Permanently banned ${p.username}`
                              )
                            }
                            className="px-2.5 py-1 rounded-sm mc-btn-stone text-[11px] font-bold text-rose-300 inline-flex items-center gap-1 cursor-pointer"
                          >
                            <Ban className="w-3 h-3" /> Perm
                          </button>
                          <button
                            onClick={() =>
                              runAction(
                                { action: 'ip_ban', targetPlayerId: p.id, targetUsername: p.username, targetIp: p.ip, reason: banReason },
                                `IP banned ${p.username}`
                              )
                            }
                            className="px-2.5 py-1 rounded-sm bg-rose-700 hover:bg-rose-600 border border-rose-950 text-[11px] font-bold text-white cursor-pointer"
                          >
                            IP Ban
                          </button>
                          {!p.isMod ? (
                            <button
                              onClick={() =>
                                runAction(
                                  { action: 'make_mod', targetPlayerId: p.id, targetUsername: p.username },
                                  `${p.username} is now [MOD]`
                                )
                              }
                              className="px-2.5 py-1 rounded-sm mc-btn-green text-[11px] font-bold text-white cursor-pointer"
                            >
                              Make MOD
                            </button>
                          ) : isOwner ? (
                            <button
                              onClick={() =>
                                runAction(
                                  { action: 'remove_mod', targetPlayerId: p.id, targetUsername: p.username },
                                  `Removed MOD from ${p.username}`
                                )
                              }
                              className="px-2.5 py-1 rounded-sm mc-btn-stone text-[11px] font-bold text-amber-300 cursor-pointer"
                            >
                              Remove MOD
                            </button>
                          ) : null}
                        </div>
                      </div>
                    ))
                  )}

                  {knownPlayers.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-black/35">
                      <div className="text-[11px] font-bold uppercase tracking-wider text-slate-300 mb-1.5">
                        Registered Players Directory ({knownPlayers.length})
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                        {knownPlayers.map((kp) => (
                          <div key={kp.playerId} className="mc-slot px-2.5 py-2 flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <div className="text-xs font-bold text-white truncate flex items-center gap-1">
                                {kp.isMod && (
                                  <span className="bg-amber-400 text-slate-950 font-black px-1 rounded-xs text-[9px]">
                                    [MOD]
                                  </span>
                                )}
                                <span className="truncate">
                                  {kp.username}
                                  {kp.clanName ? ` (${kp.clanName})` : ''}
                                </span>
                              </div>
                              <div className="text-[10px] text-slate-400">Lv.{kp.level}</div>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                onClick={() =>
                                  runAction(
                                    { action: 'temp_ban', targetPlayerId: kp.playerId, targetUsername: kp.username, durationMinutes: computedMinutes, reason: banReason },
                                    `Banned ${kp.username} for ${formatDurationLabel()}`
                                  )
                                }
                                className="px-2 py-1 rounded-sm bg-orange-700 hover:bg-orange-600 text-[10px] font-bold text-white cursor-pointer"
                              >
                                Ban {formatDurationLabel()}
                              </button>
                              {!kp.isMod ? (
                                <button
                                  onClick={() =>
                                    runAction(
                                      { action: 'make_mod', targetPlayerId: kp.playerId, targetUsername: kp.username },
                                      `${kp.username} is now [MOD]`
                                    )
                                  }
                                  className="px-2 py-1 rounded-sm mc-btn-green text-[10px] font-bold text-white cursor-pointer"
                                >
                                  Make MOD
                                </button>
                              ) : isOwner ? (
                                <button
                                  onClick={() =>
                                    runAction(
                                      { action: 'remove_mod', targetPlayerId: kp.playerId, targetUsername: kp.username },
                                      `Removed MOD from ${kp.username}`
                                    )
                                  }
                                  className="px-2 py-1 rounded-sm mc-btn-stone text-[10px] font-bold text-amber-300 cursor-pointer"
                                >
                                  Un-MOD
                                </button>
                              ) : null}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}

              {subTab === 'chat' && (
                recentChat.length === 0 ? (
                  <div className="text-xs text-slate-300 py-6 text-center">No recent chat messages.</div>
                ) : (
                  [...recentChat].reverse().map((m) => (
                    <div key={m.id} className="mc-slot p-3 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-white flex items-center gap-1.5 flex-wrap">
                          {m.isMod && (
                            <span className="bg-amber-400 text-slate-950 font-black px-1 rounded-xs text-[10px]">
                              [MOD]
                            </span>
                          )}
                          <span className={m.system ? 'text-amber-300' : 'text-[#7ce354]'}>{m.username}</span>
                          <span className="text-[10px] text-slate-400 font-mono-num">
                            {new Date(m.timestamp).toLocaleTimeString()}
                          </span>
                        </div>
                        <div className="text-xs text-slate-200 mt-0.5 break-words">{m.text}</div>
                      </div>
                      <button
                        onClick={() => runAction({ action: 'delete_chat', messageId: m.id }, 'Message deleted')}
                        className="px-2.5 py-1.5 rounded-sm bg-rose-700 hover:bg-rose-600 text-[11px] font-bold text-white inline-flex items-center gap-1 shrink-0 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Delete
                      </button>
                    </div>
                  ))
                )
              )}

              {subTab === 'reports' && (
                reports.length === 0 ? (
                  <div className="text-xs text-slate-300 py-6 text-center">No player reports submitted.</div>
                ) : (
                  reports.map((r) => (
                    <div key={r.id} className="mc-slot p-3 flex items-center justify-between gap-3">
                      <div>
                        <div className="text-xs font-bold text-white">
                          {r.targetName} <span className="text-slate-300">reported by</span> {r.reporterName} ·{' '}
                          <span className={r.status === 'pending' ? 'text-amber-400' : 'text-[#7ce354]'}>{r.status}</span>
                        </div>
                        <div className="text-xs text-rose-300 mt-0.5">{r.reason}</div>
                        {r.details && <div className="text-[11px] text-slate-300 mt-0.5">{r.details}</div>}
                      </div>
                      {r.status === 'pending' && (
                        <div className="flex gap-1.5 shrink-0">
                          <button
                            onClick={() => runAction({ action: 'resolve_report', reportId: r.id })}
                            className="px-2.5 py-1 rounded-sm mc-btn-green text-[11px] font-bold text-white inline-flex items-center gap-1 cursor-pointer"
                          >
                            <Check className="w-3 h-3" /> Verify
                          </button>
                          <button
                            onClick={() => runAction({ action: 'dismiss_report', reportId: r.id })}
                            className="px-2.5 py-1 rounded-sm mc-btn-stone text-[11px] font-bold text-slate-200 cursor-pointer"
                          >
                            Dismiss
                          </button>
                        </div>
                      )}
                    </div>
                  ))
                )
              )}

              {subTab === 'anticheat' && (
                alerts.length === 0 ? (
                  <div className="text-xs text-slate-300 py-6 text-center">No anti-cheat violations flagged.</div>
                ) : (
                  alerts.map((a) => (
                    <div key={a.id} className="mc-slot p-3 flex items-center gap-3">
                      <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                      <div>
                        <div className="text-xs font-bold text-white">
                          {a.username} · <span className="text-amber-300 uppercase">{a.type}</span>
                        </div>
                        <div className="text-[11px] text-slate-300">{a.detail}</div>
                      </div>
                    </div>
                  ))
                )
              )}

              {subTab === 'bans' && (
                bans.length === 0 ? (
                  <div className="text-xs text-slate-300 py-6 text-center">No active bans or mutes.</div>
                ) : (
                  bans.map((b) => (
                    <div key={b.id} className="mc-slot p-3 flex items-center justify-between gap-2">
                      <div>
                        <div className="text-xs font-bold text-white">
                          {b.targetUsername || b.targetIp || b.targetPlayerId} ·{' '}
                          <span className="text-rose-400 uppercase">{b.type}</span>
                          {b.expiresAt && (
                            <span className="text-amber-300 ml-2 font-mono-num">
                              ({Math.max(1, Math.ceil((b.expiresAt - Date.now()) / 60000))}m left)
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-300">
                          {b.reason} · by {b.issuedBy}
                        </div>
                      </div>
                      <button
                        onClick={() => runAction({ action: 'unban', banId: b.id }, 'Ban revoked')}
                        className="px-3 py-1 rounded-sm mc-btn-green text-[11px] font-bold text-white cursor-pointer"
                      >
                        Revoke
                      </button>
                    </div>
                  ))
                )
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ---- 6. First-Visit Username Modal ----
interface UsernamePromptModalProps {
  defaultName: string;
  onConfirm: (username: string) => void;
}

export const UsernamePromptModal: React.FC<UsernamePromptModalProps> = ({ defaultName, onConfirm }) => {
  const [name, setName] = useState(defaultName === 'Explorer' ? '' : defaultName);
  const [err, setErr] = useState<string | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = name.trim();
    if (cleaned.length < 2 || cleaned.length > 16) {
      setErr('Username must be 2 to 16 characters.');
      return;
    }
    onConfirm(cleaned);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
      <form onSubmit={submit} className="w-full max-w-sm mc-panel rounded-md p-6 flex flex-col gap-4">
        <div className="flex items-center gap-2.5">
          <UserCheck className="w-6 h-6 text-[#7ce354]" />
          <h2 className="font-display text-lg font-bold text-white mc-text-shadow">
            Setup Your Username
          </h2>
        </div>
        <p className="text-xs text-slate-300 leading-relaxed">
          Welcome to VoxelStrike! Choose your player username before entering the server.
        </p>
        <input
          autoFocus
          maxLength={16}
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setErr(null);
          }}
          placeholder="Your username..."
          className="bg-[#141619] border-2 border-[#6bc349] rounded-sm px-3.5 py-2.5 text-sm font-bold text-white outline-none"
        />
        {err && <div className="text-xs font-semibold text-rose-400">{err}</div>}
        <button
          type="submit"
          className="mc-btn-green rounded-sm py-3 text-white font-display font-bold text-sm mc-text-shadow game-btn-depth cursor-pointer"
        >
          CONTINUE
        </button>
      </form>
    </div>
  );
};

// ---- 7. Guns Armory & Gun Skins Modal ----
interface GunsArmoryModalProps {
  profile: PlayerProfileState;
  onGunAction: (gunId: string) => void;
  onGunSkinAction: (gunSkinId: string) => void;
  onClose: () => void;
}

export const GunsArmoryModal: React.FC<GunsArmoryModalProps> = ({
  profile,
  onGunAction,
  onGunSkinAction,
  onClose,
}) => {
  const [subTab, setSubTab] = useState<'guns' | 'finishes'>('guns');
  const equippedGunId = profile.hotbarSlots[0] || 'rifle';

  return (
    <div className="fixed inset-0 z-30 bg-black/70 flex items-center justify-center p-4">
      <div className="w-full max-w-3xl mc-panel rounded-md p-5">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSubTab('guns')}
              className={`px-4 py-1.5 rounded-sm text-xs sm:text-sm font-display font-bold flex items-center gap-1.5 cursor-pointer ${
                subTab === 'guns' ? 'mc-btn-green text-white mc-text-shadow' : 'mc-btn-stone text-slate-200'
              }`}
            >
              <Crosshair className="w-4 h-4" />
              Firearms ({profile.unlockedGuns?.length ?? 1}/{GUN_LIST.length})
            </button>
            <button
              onClick={() => setSubTab('finishes')}
              className={`px-4 py-1.5 rounded-sm text-xs sm:text-sm font-display font-bold flex items-center gap-1.5 cursor-pointer ${
                subTab === 'finishes' ? 'mc-btn-green text-white mc-text-shadow' : 'mc-btn-stone text-slate-200'
              }`}
            >
              <Sparkles className="w-4 h-4" />
              Gun Skins
            </button>
          </div>
          <div className="flex items-center gap-2.5">
            <div className="mc-slot px-3 py-1 flex items-center gap-1.5 text-xs font-bold text-[#7ce354]">
              Lv.{profile.level}
            </div>
            <div className="mc-slot px-3 py-1 flex items-center gap-1.5 text-xs font-bold text-amber-300 tabular-nums">
              <Coins className="w-3.5 h-3.5" />
              {profile.coins}
            </div>
            <button onClick={onClose} className="p-1.5 rounded-sm mc-btn-stone text-slate-200 cursor-pointer">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {subTab === 'guns' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[380px] overflow-y-auto game-scroll pr-1">
            {GUN_LIST.map((gun) => {
              const unlocked = profile.unlockedGuns?.includes(gun.id) ?? gun.id === 'rifle';
              const equipped = equippedGunId === gun.id;
              const levelOk = profile.level >= gun.unlockLevel;
              const canUnlock = !unlocked && levelOk && profile.coins >= gun.price;

              const totalDmg = gun.damage * gun.pellets;
              const dmgPct = Math.min(100, Math.round((totalDmg / 75) * 100));
              const ratePct = Math.min(100, Math.round((1000 / gun.fireIntervalMs / 15) * 100));
              const rangePct = Math.min(100, Math.round((gun.range / 155) * 100));

              return (
                <div
                  key={gun.id}
                  className={`p-3.5 flex flex-col justify-between gap-3 ${
                    equipped ? 'mc-slot-active' : 'mc-slot'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <div className="w-12 h-12 bg-[#1e2024] border border-black/50 flex items-center justify-center shrink-0">
                          <ItemIcon itemId={gun.id} size={36} />
                        </div>
                        <div>
                          <div className="font-display font-bold text-sm text-white">{gun.name}</div>
                          <div className="text-[11px] font-semibold text-sky-300">{gun.category}</div>
                        </div>
                      </div>
                      <span className="text-[11px] font-mono-num font-bold text-amber-300 bg-black/35 px-2 py-0.5 rounded-sm">
                        {gun.magSize} MAG
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-300 mt-2 leading-snug">{gun.description}</p>

                    {/* Stat Bars */}
                    <div className="mt-2.5 flex flex-col gap-1.5 text-[10px] font-mono-num">
                      <div className="flex items-center gap-2">
                        <span className="w-11 text-slate-300">DMG</span>
                        <div className="flex-1 h-1.5 bg-[#141619]">
                          <div className="h-full bg-rose-400" style={{ width: `${dmgPct}%` }} />
                        </div>
                        <span className="w-10 text-right text-slate-200">
                          {gun.pellets > 1 ? `${gun.damage}×${gun.pellets}` : gun.damage}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="w-11 text-slate-300">RATE</span>
                        <div className="flex-1 h-1.5 bg-[#141619]">
                          <div className="h-full bg-amber-400" style={{ width: `${ratePct}%` }} />
                        </div>
                        <span className="w-10 text-right text-slate-200">{gun.fireIntervalMs}ms</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="w-11 text-slate-300">RANGE</span>
                        <div className="flex-1 h-1.5 bg-[#141619]">
                          <div className="h-full bg-sky-400" style={{ width: `${rangePct}%` }} />
                        </div>
                        <span className="w-10 text-right text-slate-200">{gun.range}m</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-black/35">
                    <div className="text-[11px] font-bold">
                      {unlocked ? (
                        <span className="text-[#7ce354]">
                          {equipped ? 'Equipped Slot #1' : gun.price === 0 ? 'Free · Unlocked' : 'Owned'}
                        </span>
                      ) : !levelOk ? (
                        <span className="text-rose-400">Requires Lv.{gun.unlockLevel}</span>
                      ) : (
                        <span className="text-amber-300">
                          {gun.price === 0 ? 'FREE' : `${gun.price} Coins · Lv.${gun.unlockLevel}+`}
                        </span>
                      )}
                    </div>
                    <button
                      disabled={!unlocked && !canUnlock}
                      onClick={() => onGunAction(gun.id)}
                      className={`px-3.5 py-1.5 rounded-sm text-xs font-display font-bold game-btn-depth ${
                        equipped
                          ? 'mc-btn-green text-white mc-text-shadow cursor-pointer'
                          : unlocked || canUnlock
                          ? 'mc-btn-stone text-amber-300 cursor-pointer'
                          : 'mc-btn-stone opacity-45 text-slate-400 cursor-not-allowed'
                      }`}
                    >
                      {equipped ? 'Active' : unlocked ? 'Equip' : 'Unlock Free'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-[380px] overflow-y-auto game-scroll pr-1">
            {GUN_SKINS.map((gs) => {
              const unlocked = profile.unlockedGunSkins?.includes(gs.id);
              const equipped = profile.gunSkinId === gs.id;
              return (
                <div
                  key={gs.id}
                  className={`p-3 flex items-center justify-between gap-3 ${
                    equipped ? 'mc-slot-active' : 'mc-slot'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-14 h-12 border-2 border-black/40 flex flex-col items-center justify-center shrink-0 relative overflow-hidden"
                      style={{ background: `linear-gradient(135deg, ${gs.primaryHex}, ${gs.secondaryHex})` }}
                    >
                      <div className="w-10 h-2.5 relative" style={{ backgroundColor: gs.primaryHex, border: `1px solid ${gs.accentHex}` }}>
                        <div className="absolute -top-1.5 left-3 w-3 h-1.5" style={{ backgroundColor: gs.accentHex }} />
                        <div className="absolute top-2.5 left-4 w-2 h-2.5" style={{ backgroundColor: gs.secondaryHex }} />
                        <div className="absolute top-0.5 -right-2 w-2.5 h-1" style={{ backgroundColor: gs.accentHex }} />
                      </div>
                    </div>
                    <div>
                      <div className="font-bold text-sm text-white">{gs.name}</div>
                      <div className="text-xs text-slate-300 mt-0.5 capitalize">
                        {unlocked ? (equipped ? 'Equipped' : 'Free · Unlocked') : gs.price === 0 ? 'FREE' : `${gs.price} Coins`} · {gs.pattern}
                      </div>
                    </div>
                  </div>
                  <button
                    disabled={!unlocked && profile.coins < gs.price}
                    onClick={() => onGunSkinAction(gs.id)}
                    className={`px-3 py-1.5 rounded-sm text-xs font-display font-bold game-btn-depth ${
                      equipped
                        ? 'mc-btn-green text-white mc-text-shadow cursor-pointer'
                        : unlocked || profile.coins >= gs.price
                        ? 'mc-btn-stone text-amber-300 cursor-pointer'
                        : 'mc-btn-stone opacity-45 text-slate-400 cursor-not-allowed'
                    }`}
                  >
                    {equipped ? 'Active' : unlocked ? 'Equip' : 'Unlock'}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

// ---- 8. Clans Modal (Level 5+ & Cross-Device Password Management) ----
interface ClansModalProps {
  profile: PlayerProfileState;
  playerSecret: string;
  onProfileSync: (p: PlayerProfileState) => void;
  onToast: (msg: string) => void;
  onClose: () => void;
}

export const ClansModal: React.FC<ClansModalProps> = ({
  profile,
  playerSecret,
  onProfileSync,
  onToast,
  onClose,
}) => {
  const [clans, setClans] = useState<ClanRecord[]>([]);
  const [leftTab, setLeftTab] = useState<'create' | 'manage'>('create');
  const [clanName, setClanName] = useState('');
  const [clanTag, setClanTag] = useState('');
  const [clanDesc, setClanDesc] = useState('');
  const [clanPassword, setClanPassword] = useState('');

  // Cross-device password management state
  const [manageIdentifier, setManageIdentifier] = useState('');
  const [managePassword, setManagePassword] = useState('');
  const [managedClan, setManagedClan] = useState<ClanRecord | null>(null);
  const [newMotto, setNewMotto] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const loadClans = () => {
    fetch('/api/clans')
      .then((r) => r.json())
      .then((d) => setClans(d.clans || []))
      .catch(() => {});
  };

  useEffect(() => {
    loadClans();
  }, []);

  const canUseClans = profile.level >= CLAN_MIN_LEVEL;
  const myClan = clans.find((c) => c.id === profile.clanId);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canUseClans) return;
    if (clanPassword.length < 4) {
      onToast('Clan password must be at least 4 characters');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/clans/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          playerId: profile.playerId,
          name: clanName,
          tag: clanTag,
          description: clanDesc,
          password: clanPassword,
        }),
      });
      const d = await res.json();
      if (!res.ok) {
        onToast(d.error || 'Failed to create clan');
      } else {
        if (d.profile) onProfileSync(d.profile);
        setClanName('');
        setClanTag('');
        setClanDesc('');
        setClanPassword('');
        onToast(`Created clan [${d.clan.tag}] ${d.clan.name}!`);
        loadClans();
      }
    } finally {
      setLoading(false);
    }
  };

  const handleJoin = async (clanId: string) => {
    setLoading(true);
    try {
      const res = await fetch('/api/clans/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId: profile.playerId, clanId }),
      });
      const d = await res.json();
      if (!res.ok) {
        onToast(d.error || 'Could not join clan');
      } else {
        if (d.profile) onProfileSync(d.profile);
        onToast(`Joined clan [${d.clan.tag}]!`);
        loadClans();
      }
    } finally {
      setLoading(false);
    }
  };

  const handleLeave = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/clans/leave', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId: profile.playerId }),
      });
      const d = await res.json();
      if (res.ok && d.profile) {
        onProfileSync(d.profile);
        onToast('Left clan.');
        loadClans();
      }
    } finally {
      setLoading(false);
    }
  };

  const handleManageVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch('/api/clans/manage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          playerId: profile.playerId,
          playerSecret,
          identifier: manageIdentifier.trim(),
          password: managePassword,
          action: 'verify',
        }),
      });
      const d = await res.json();
      if (!res.ok) {
        onToast(d.error || 'Verification failed');
      } else {
        setManagedClan(d.clan);
        setNewMotto(d.clan?.description || '');
        onToast(`Unlocked management for [${d.clan.tag}] ${d.clan.name}`);
      }
    } finally {
      setLoading(false);
    }
  };

  const runManageAction = async (
    action: 'claim_leader' | 'update_desc' | 'kick_member' | 'change_password' | 'disband',
    extra: Record<string, string> = {},
    successMsg?: string
  ) => {
    if (!managedClan) return;
    setLoading(true);
    try {
      const res = await fetch('/api/clans/manage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          playerId: profile.playerId,
          playerSecret,
          clanId: managedClan.id,
          password: managePassword,
          action,
          ...extra,
        }),
      });
      const d = await res.json();
      if (!res.ok) {
        onToast(d.error || 'Clan action failed');
      } else {
        if (d.profile) onProfileSync(d.profile);
        if (d.disbanded) {
          setManagedClan(null);
          setManagePassword('');
          setLeftTab('create');
        } else if (d.clan) {
          setManagedClan(d.clan);
          if (action === 'change_password' && extra.newPassword) {
            setManagePassword(extra.newPassword);
            setNewPassword('');
          }
        }
        if (successMsg) onToast(successMsg);
        loadClans();
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-30 bg-black/70 flex items-center justify-center p-4">
      <div className="w-full max-w-3xl mc-panel rounded-md p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <Shield className="w-5 h-5 text-[#7ce354]" />
            <h2 className="font-display text-lg sm:text-xl font-bold text-white mc-text-shadow">
              Survivor Clans (Lv.{CLAN_MIN_LEVEL}+)
            </h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-sm mc-btn-stone text-slate-200 cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        {!canUseClans && (
          <div className="mb-4 bg-amber-950/75 border-2 border-amber-500/70 rounded-sm px-3.5 py-2.5 text-xs font-semibold text-amber-200 flex items-center gap-2">
            <Lock className="w-4 h-4 shrink-0 text-amber-300" />
            <span>
              Mine ores and eliminate rivals to reach <strong>Level {CLAN_MIN_LEVEL}</strong> before creating or joining a clan (Current: Lv.{profile.level}). Leaders on a new device can still unlock Clan Management with password.
            </span>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Left: Your Clan / Create Clan / Manage Clan with Password */}
          <div className="mc-slot p-3.5 flex flex-col gap-3">
            {managedClan ? (
              <div className="flex flex-col gap-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="font-display text-sm font-bold text-amber-300 truncate">
                    Manage [{managedClan.tag}] {managedClan.name}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setManagedClan(null);
                      setManagePassword('');
                    }}
                    className="px-2 py-0.5 rounded-sm mc-btn-stone text-[10px] font-bold text-slate-200 cursor-pointer"
                  >
                    Back
                  </button>
                </div>

                {managedClan.leaderId !== profile.playerId && (
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() =>
                      runManageAction(
                        'claim_leader',
                        {},
                        `Claimed leadership of [${managedClan.tag}] on this device!`
                      )
                    }
                    className="py-1.5 rounded-sm mc-btn-green text-xs font-display font-bold text-white cursor-pointer"
                  >
                    Claim Leadership on This Device
                  </button>
                )}

                <div className="flex gap-1.5">
                  <input
                    maxLength={80}
                    value={newMotto}
                    onChange={(e) => setNewMotto(e.target.value)}
                    placeholder="Clan motto..."
                    className="flex-1 bg-[#1b1d20] border border-[#0e0f11] px-2 py-1 text-xs text-white outline-none"
                  />
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() =>
                      runManageAction('update_desc', { description: newMotto }, 'Updated clan motto!')
                    }
                    className="px-2.5 py-1 rounded-sm mc-btn-stone text-[11px] font-bold text-amber-300 cursor-pointer"
                  >
                    Save
                  </button>
                </div>

                <div className="text-[11px] font-bold text-slate-300 uppercase">
                  Members ({managedClan.memberIds.length})
                </div>
                <div className="flex flex-col gap-1 max-h-24 overflow-y-auto game-scroll">
                  {managedClan.memberIds.map((mid) => (
                    <div
                      key={mid}
                      className="flex items-center justify-between bg-[#1b1d20] px-2 py-1 rounded-sm text-xs"
                    >
                      <span className="text-slate-100 truncate">
                        {managedClan.memberNames[mid] || mid}
                        {mid === managedClan.leaderId && (
                          <span className="text-amber-300 ml-1 text-[10px]">(Leader)</span>
                        )}
                      </span>
                      {mid !== managedClan.leaderId && (
                        <button
                          type="button"
                          disabled={loading}
                          onClick={() =>
                            runManageAction('kick_member', { targetPlayerId: mid }, 'Member removed')
                          }
                          className="text-[10px] font-bold text-rose-400 hover:text-rose-300 cursor-pointer"
                        >
                          Kick
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                <div className="flex gap-1.5">
                  <input
                    type="password"
                    maxLength={64}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="New password (4+ chars)..."
                    className="flex-1 bg-[#1b1d20] border border-[#0e0f11] px-2 py-1 text-xs text-white outline-none"
                  />
                  <button
                    type="button"
                    disabled={loading || newPassword.length < 4}
                    onClick={() =>
                      runManageAction('change_password', { newPassword }, 'Clan password updated!')
                    }
                    className="px-2.5 py-1 rounded-sm mc-btn-stone disabled:opacity-45 text-[11px] font-bold text-sky-300 cursor-pointer"
                  >
                    Set Pass
                  </button>
                </div>

                <button
                  type="button"
                  disabled={loading}
                  onClick={() => runManageAction('disband', {}, 'Clan disbanded')}
                  className="py-1.5 rounded-sm bg-rose-700 hover:bg-rose-600 border border-rose-950 text-xs font-display font-bold text-white cursor-pointer"
                >
                  Disband Clan
                </button>
              </div>
            ) : myClan && leftTab === 'create' ? (
              <>
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="font-display text-base font-bold text-[#7ce354]">
                      [{myClan.tag}] {myClan.name}
                    </div>
                    <div className="text-[11px] text-slate-300 mt-0.5">
                      Leader: {myClan.leaderName} · {myClan.totalKills} Clan Kills
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setManageIdentifier(myClan.tag);
                      setLeftTab('manage');
                    }}
                    className="px-2.5 py-1 rounded-sm mc-btn-stone text-[11px] font-bold text-amber-300 flex items-center gap-1 cursor-pointer"
                  >
                    <KeyRound className="w-3 h-3" />
                    Manage
                  </button>
                </div>
                {myClan.description && (
                  <p className="text-xs text-slate-200 bg-black/25 p-2 rounded-sm">{myClan.description}</p>
                )}
                <div className="text-xs font-bold text-slate-300 uppercase">
                  Members ({myClan.memberIds.length})
                </div>
                <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto game-scroll">
                  {myClan.memberIds.map((mid) => (
                    <span key={mid} className="bg-[#1b1d20] border border-white/10 px-2 py-0.5 text-xs text-slate-100 rounded-sm">
                      {myClan.memberNames[mid] || mid}
                    </span>
                  ))}
                </div>
                <button
                  disabled={loading}
                  onClick={handleLeave}
                  className="mt-auto py-2 rounded-sm bg-rose-700 hover:bg-rose-600 border-2 border-rose-950 text-xs font-display font-bold text-white cursor-pointer"
                >
                  Leave Clan
                </button>
              </>
            ) : (
              <div className="flex flex-col gap-2.5">
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => setLeftTab('create')}
                    className={`flex-1 py-1.5 rounded-sm text-xs font-display font-bold cursor-pointer ${
                      leftTab === 'create' ? 'mc-btn-green text-white' : 'mc-btn-stone text-slate-200'
                    }`}
                  >
                    {myClan ? 'My Clan' : 'Create Clan'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setLeftTab('manage')}
                    className={`flex-1 py-1.5 rounded-sm text-xs font-display font-bold flex items-center justify-center gap-1 cursor-pointer ${
                      leftTab === 'manage' ? 'mc-btn-green text-white' : 'mc-btn-stone text-slate-200'
                    }`}
                  >
                    <KeyRound className="w-3.5 h-3.5" />
                    Manage (Pass)
                  </button>
                </div>

                {leftTab === 'manage' ? (
                  <form onSubmit={handleManageVerify} className="flex flex-col gap-2">
                    <div className="text-[11px] text-slate-300">
                      On a new device? Enter your Clan Name or Tag and Password to manage or reclaim leadership.
                    </div>
                    <input
                      required
                      maxLength={24}
                      value={manageIdentifier}
                      onChange={(e) => setManageIdentifier(e.target.value)}
                      placeholder="Clan Name or Tag (e.g. VOX)"
                      className="bg-[#1b1d20] border-2 border-[#0e0f11] px-2.5 py-1.5 text-xs text-white outline-none focus:border-[#6bc349]"
                    />
                    <input
                      required
                      type="password"
                      maxLength={64}
                      value={managePassword}
                      onChange={(e) => setManagePassword(e.target.value)}
                      placeholder="Clan Password..."
                      className="bg-[#1b1d20] border-2 border-[#0e0f11] px-2.5 py-1.5 text-xs text-white outline-none focus:border-[#6bc349]"
                    />
                    <button
                      type="submit"
                      disabled={loading || !manageIdentifier.trim() || managePassword.length < 4}
                      className="py-2 rounded-sm mc-btn-green disabled:opacity-45 text-xs font-display font-bold text-white cursor-pointer"
                    >
                      Unlock Clan Controls
                    </button>
                  </form>
                ) : (
                  <form onSubmit={handleCreate} className="flex flex-col gap-2">
                    <input
                      disabled={!canUseClans || loading}
                      maxLength={18}
                      value={clanName}
                      onChange={(e) => setClanName(e.target.value)}
                      placeholder="Clan Name (3-18 chars)"
                      className="bg-[#1b1d20] border-2 border-[#0e0f11] px-2.5 py-1.5 text-xs text-white outline-none focus:border-[#6bc349] disabled:opacity-50"
                    />
                    <input
                      disabled={!canUseClans || loading}
                      maxLength={4}
                      value={clanTag}
                      onChange={(e) => setClanTag(e.target.value.toUpperCase())}
                      placeholder="Tag (2-4 chars, e.g. VOX)"
                      className="bg-[#1b1d20] border-2 border-[#0e0f11] px-2.5 py-1.5 text-xs text-white uppercase outline-none focus:border-[#6bc349] disabled:opacity-50"
                    />
                    <input
                      disabled={!canUseClans || loading}
                      maxLength={80}
                      value={clanDesc}
                      onChange={(e) => setClanDesc(e.target.value)}
                      placeholder="Short motto (optional)"
                      className="bg-[#1b1d20] border-2 border-[#0e0f11] px-2.5 py-1.5 text-xs text-white outline-none focus:border-[#6bc349] disabled:opacity-50"
                    />
                    <input
                      required
                      type="password"
                      disabled={!canUseClans || loading}
                      maxLength={64}
                      value={clanPassword}
                      onChange={(e) => setClanPassword(e.target.value)}
                      placeholder="Clan Password (4+ chars, saves for new device)"
                      className="bg-[#1b1d20] border-2 border-[#0e0f11] px-2.5 py-1.5 text-xs text-white outline-none focus:border-[#6bc349] disabled:opacity-50"
                    />
                    <button
                      type="submit"
                      disabled={!canUseClans || loading}
                      className={`py-2 rounded-sm text-xs font-display font-bold game-btn-depth ${
                        canUseClans
                          ? 'mc-btn-green text-white mc-text-shadow cursor-pointer'
                          : 'mc-btn-stone opacity-45 text-slate-400 cursor-not-allowed'
                      }`}
                    >
                      Create Clan
                    </button>
                  </form>
                )}
              </div>
            )}
          </div>

          {/* Right: Browse Clans */}
          <div className="flex flex-col gap-2 max-h-80 overflow-y-auto game-scroll pr-1">
            {clans.length === 0 ? (
              <div className="mc-slot p-6 text-center text-xs text-slate-300">
                No clans founded yet. Reach Lv.{CLAN_MIN_LEVEL} to start the first one!
              </div>
            ) : (
              clans.map((c) => {
                const isMember = profile.clanId === c.id;
                return (
                  <div key={c.id} className="mc-slot p-3 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-bold text-xs text-white truncate">
                        <span className="text-[#7ce354] mr-1">[{c.tag}]</span>
                        {c.name}
                      </div>
                      <div className="text-[11px] text-slate-300 flex items-center gap-2 mt-0.5">
                        <span className="flex items-center gap-1">
                          <Users className="w-3 h-3" /> {c.memberIds.length}
                        </span>
                        <span>·</span>
                        <span>{c.totalKills} Kills</span>
                      </div>
                    </div>
                    {isMember ? (
                      <span className="text-[11px] font-bold text-[#7ce354]">Joined</span>
                    ) : (
                      <button
                        disabled={!canUseClans || Boolean(profile.clanId) || loading}
                        onClick={() => handleJoin(c.id)}
                        className={`px-3 py-1 rounded-sm text-xs font-display font-bold ${
                          canUseClans && !profile.clanId
                            ? 'mc-btn-green text-white cursor-pointer'
                            : 'mc-btn-stone opacity-45 text-slate-400 cursor-not-allowed'
                        }`}
                      >
                        Join
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// ---- 9. YouTubers & Discord Community Modal ----
interface CreatorsDiscordModalProps {
  onClose: () => void;
}

export const CreatorsDiscordModal: React.FC<CreatorsDiscordModalProps> = ({ onClose }) => {
  return (
    <div className="fixed inset-0 z-30 bg-black/70 flex items-center justify-center p-4">
      <div className="w-full max-w-lg mc-panel rounded-md p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-lg sm:text-xl font-bold text-white mc-text-shadow">
            YouTubers &amp; Discord
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-sm mc-btn-stone text-slate-200 cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex flex-col gap-3">
          <a
            href="https://www.youtube.com/@PlusMinus09"
            target="_blank"
            rel="noopener noreferrer"
            className="mc-slot hover:bg-[#494c52] p-3.5 flex items-center justify-between gap-3 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-sm bg-white flex items-center justify-center shrink-0 border border-black/40 p-1 overflow-hidden">
                <img
                  src="https://pngdownload.io/wp-content/uploads/2024/02/YouTube-logo-social-media-video-sharing-transparent-PNG-image-jpg.webp"
                  alt="YouTube"
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-contain"
                />
              </div>
              <div>
                <div className="font-display font-bold text-sm text-white">PlusMinus_</div>
                <div className="text-xs text-rose-300 font-semibold">YouTube Featured Creator</div>
              </div>
            </div>
            <span className="mc-btn-stone px-3 py-1.5 rounded-sm text-xs font-bold text-white flex items-center gap-1.5">
              Watch <ExternalLink className="w-3.5 h-3.5" />
            </span>
          </a>

          <a
            href="https://www.youtube.com/@Gaming_Master-h9o"
            target="_blank"
            rel="noopener noreferrer"
            className="mc-slot hover:bg-[#494c52] p-3.5 flex items-center justify-between gap-3 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-sm bg-white flex items-center justify-center shrink-0 border border-black/40 p-1 overflow-hidden">
                <img
                  src="https://pngdownload.io/wp-content/uploads/2024/02/YouTube-logo-social-media-video-sharing-transparent-PNG-image-jpg.webp"
                  alt="YouTube"
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-contain"
                />
              </div>
              <div>
                <div className="font-display font-bold text-sm text-white">The Gaming Master</div>
                <div className="text-xs text-rose-300 font-semibold">YouTube Featured Creator</div>
              </div>
            </div>
            <span className="mc-btn-stone px-3 py-1.5 rounded-sm text-xs font-bold text-white flex items-center gap-1.5">
              Watch <ExternalLink className="w-3.5 h-3.5" />
            </span>
          </a>

          <a
            href="https://discord.gg/R7eReD66V"
            target="_blank"
            rel="noopener noreferrer"
            className="mc-slot hover:bg-[#494c52] p-3.5 flex items-center justify-between gap-3 transition-colors border-[#5865F2]"
          >
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-sm bg-[#5865F2]/25 flex items-center justify-center shrink-0 border border-[#5865F2]/50 overflow-hidden">
                <img
                  src="https://static.vecteezy.com/system/resources/thumbnails/056/850/688/small_2x/discord-app-icon-with-transparent-background-free-png.png"
                  alt="Discord"
                  referrerPolicy="no-referrer"
                  className="w-9 h-9 object-contain"
                />
              </div>
              <div>
                <div className="font-display font-bold text-sm text-white">VoxelStrike Discord</div>
                <div className="text-xs text-indigo-300 font-semibold">Official Game Community Server</div>
              </div>
            </div>
            <span className="mc-btn-green px-3 py-1.5 rounded-sm text-xs font-display font-bold text-white flex items-center gap-1.5">
              Join <ExternalLink className="w-3.5 h-3.5" />
            </span>
          </a>
        </div>
      </div>
    </div>
  );
};

// ---- 10. Credits Modal ----
interface CreditsModalProps {
  onClose: () => void;
}

export const CreditsModal: React.FC<CreditsModalProps> = ({ onClose }) => {
  return (
    <div className="fixed inset-0 z-30 bg-black/70 flex items-center justify-center p-4">
      <div className="w-full max-w-md mc-panel rounded-md p-6 text-center flex flex-col items-center gap-4">
        <div className="w-full flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Award className="w-5 h-5 text-purple-300" />
            <h2 className="font-display text-lg font-bold text-white mc-text-shadow">Credits</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-sm mc-btn-stone text-slate-200 cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="w-full mc-slot p-4 flex flex-col items-center gap-1.5">
          <div className="text-xs font-bold uppercase tracking-widest text-[#7ce354]">Lead Developer</div>
          <div className="font-display text-2xl font-bold text-white mc-text-shadow">
            DEV: Qadeer
          </div>
          <div className="text-xs text-slate-300">
            VoxelStrike Multiplayer Voxel Survival Engine
          </div>
        </div>

        <div className="w-full mc-slot p-4 flex flex-col items-center gap-2">
          <div className="text-xs font-bold uppercase tracking-widest text-amber-300">
            Moderators &amp; Game Suggestions
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <span className="px-2.5 py-1 rounded-sm bg-[#1b1d20] border border-amber-400/50 text-xs font-bold text-white">
              Lagendx <span className="text-amber-300">(MOD)</span>
            </span>
            <span className="px-2.5 py-1 rounded-sm bg-[#1b1d20] border border-amber-400/50 text-xs font-bold text-white">
              PlusMinus_ <span className="text-amber-300">(MOD)</span>
            </span>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            Special thanks for giving great game suggestions and helping keep VoxelStrike fair and fun!
          </p>
        </div>

        <button
          onClick={onClose}
          className="w-full mc-btn-green py-2.5 rounded-sm text-sm font-display font-bold text-white mc-text-shadow cursor-pointer"
        >
          Close
        </button>
      </div>
    </div>
  );
};

// ---- 10C. VoxelStrike Rules Modal ----
interface RulesModalProps {
  requireAccept?: boolean;
  onAccept?: () => void;
  onClose?: () => void;
}

export const RulesModal: React.FC<RulesModalProps> = ({ requireAccept = false, onAccept, onClose }) => {
  const rules = [
    { num: 'Rule #1', text: 'Derper Not allowed for 99 years.', highlight: true },
    { num: 'Rule #2', text: 'No bad words, abuse, or toxic language in chat.' },
    { num: 'Rule #3', text: 'No hacks, speed/fly cheats, or unfair exploits.' },
    { num: 'Rule #4', text: 'No chat spam or flooding messages.' },
    { num: 'Rule #5', text: 'Respect [MOD] moderators and fellow players.' },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
      <div className="w-full max-w-md mc-panel rounded-md p-6 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <BookOpen className="w-5 h-5 text-[#7ce354]" />
            <h2 className="font-display text-lg sm:text-xl font-bold text-white mc-text-shadow">
              VoxelStrike Rules
            </h2>
          </div>
          {!requireAccept && onClose && (
            <button onClick={onClose} className="p-1.5 rounded-sm mc-btn-stone text-slate-200 cursor-pointer">
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        <div className="flex flex-col gap-2">
          {rules.map((r) => (
            <div
              key={r.num}
              className={`mc-slot p-3 text-xs leading-relaxed ${
                r.highlight ? 'border-rose-500/80 bg-rose-950/35' : ''
              }`}
            >
              <span className={`font-display font-bold mr-2 ${r.highlight ? 'text-rose-400' : 'text-[#7ce354]'}`}>
                {r.num}:
              </span>
              <span className="text-slate-100 font-semibold">{r.text}</span>
            </div>
          ))}
        </div>

        {requireAccept ? (
          <button
            onClick={onAccept}
            className="w-full mc-btn-green py-3 rounded-sm text-sm font-display font-bold text-white mc-text-shadow game-btn-depth cursor-pointer"
          >
            I Agree &amp; Accept Rules
          </button>
        ) : (
          <button
            onClick={onClose}
            className="w-full mc-btn-green py-2.5 rounded-sm text-sm font-display font-bold text-white mc-text-shadow cursor-pointer"
          >
            Close
          </button>
        )}
      </div>
    </div>
  );
};

// ---- 10D. About Us Modal ----
interface AboutUsModalProps {
  onClose: () => void;
}

export const AboutUsModal: React.FC<AboutUsModalProps> = ({ onClose }) => {
  return (
    <div className="fixed inset-0 z-30 bg-black/70 flex items-center justify-center p-4">
      <div className="w-full max-w-lg mc-panel rounded-md p-6 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Info className="w-5 h-5 text-sky-300" />
            <h2 className="font-display text-xl font-bold text-white mc-text-shadow">
              About VoxelStrike
            </h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-sm mc-btn-stone text-slate-200 cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="mc-slot p-4 flex flex-col gap-3 text-xs sm:text-sm text-slate-200 leading-relaxed text-left">
          <p>
            VoxelStrike is a multiplayer voxel survival game where you can mine, fight, chat, and play with others in the same world.
          </p>
          <p>
            We started making VoxelStrike to build our own game, have fun, and give players a place to enjoy survival gameplay without limits. Inspired by voxel games, but built our own way.
          </p>
          <ul className="list-disc list-inside space-y-1 text-[#7ce354] font-semibold">
            <li><span className="text-slate-100">Mine and explore</span></li>
            <li><span className="text-slate-100">Fight other players</span></li>
            <li><span className="text-slate-100">Multiplayer world</span></li>
            <li><span className="text-slate-100">In-game chat</span></li>
            <li><span className="text-slate-100">Create and join clans</span></li>
          </ul>
          <p>
            The game is playable, and we&apos;re still improving graphics, features, and gameplay.
          </p>
          <p className="font-display text-base text-amber-300 pt-1">
            VoxelStrike — our game, our rules.
          </p>
        </div>

        <button
          onClick={onClose}
          className="w-full mc-btn-green py-2.5 rounded-sm text-sm font-display font-bold text-white mc-text-shadow cursor-pointer"
        >
          Close
        </button>
      </div>
    </div>
  );
};

// ---- 11. Live World Map Modal (Press M) ----
interface WorldMapModalProps {
  selfId: string;
  coords: { x: number; y: number; z: number };
  yaw: number;
  players: PlayerPublicState[];
  onClose: () => void;
}

export const WorldMapModal: React.FC<WorldMapModalProps> = ({
  selfId,
  coords,
  yaw,
  players,
  onClose,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const terrainBackdrop = useMemo(() => {
    const sampleW = 375;
    const sampleH = 150;
    const off = document.createElement('canvas');
    off.width = sampleW;
    off.height = sampleH;
    const ctx = off.getContext('2d');
    if (!ctx) return off;

    const img = ctx.createImageData(sampleW, sampleH);
    const spanX = WORLD_MAX_X - WORLD_MIN_X;
    const spanZ = WORLD_MAX_Z - WORLD_MIN_Z;

    for (let py = 0; py < sampleH; py++) {
      const wz = Math.round(WORLD_MIN_Z + (py / sampleH) * spanZ);
      for (let px = 0; px < sampleW; px++) {
        const wx = Math.round(WORLD_MIN_X + (px / sampleW) * spanX);
        const h = getTerrainHeight(wx, wz);
        const river = getRiverSample(wx, wz);
        const desert = isDesertBiome(wx, wz);

        let r = 98;
        let g = 175;
        let b = 62;

        if (river.isBridge) {
          r = 184;
          g = 138;
          b = 80;
        } else if (river.inRiver && h < WATER_LEVEL) {
          r = 48;
          g = 122;
          b = 236;
        } else if (desert) {
          const shade = Math.max(-18, Math.min(24, (h - 22) * 3));
          r = 228 + shade;
          g = 211 + shade;
          b = 148 + shade;
        } else {
          const shade = Math.max(-20, Math.min(28, (h - 22) * 3.5));
          r = 94 + shade;
          g = 172 + shade;
          b = 60 + shade;
        }

        const idx = (py * sampleW + px) * 4;
        img.data[idx] = Math.max(0, Math.min(255, r));
        img.data[idx + 1] = Math.max(0, Math.min(255, g));
        img.data[idx + 2] = Math.max(0, Math.min(255, b));
        img.data[idx + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return off;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    const toCanvasX = (wx: number) => ((wx - WORLD_MIN_X) / (WORLD_MAX_X - WORLD_MIN_X)) * W;
    const toCanvasZ = (wz: number) => ((wz - WORLD_MIN_Z) / (WORLD_MAX_Z - WORLD_MIN_Z)) * H;

    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(terrainBackdrop, 0, 0, W, H);

    // Subtle grid lines
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.14)';
    ctx.lineWidth = 1;
    for (let gx = -600; gx <= 600; gx += 150) {
      const cx = toCanvasX(gx);
      ctx.beginPath();
      ctx.moveTo(cx, 0);
      ctx.lineTo(cx, H);
      ctx.stroke();
    }
    for (let gz = -200; gz <= 200; gz += 100) {
      const cz = toCanvasZ(gz);
      ctx.beginPath();
      ctx.moveTo(0, cz);
      ctx.lineTo(W, cz);
      ctx.stroke();
    }

    const drawPlaceBadge = (label: string, x: number, y: number, color = '#f8fafc') => {
      ctx.font = 'bold 11px "Plus Jakarta Sans", sans-serif';
      ctx.textAlign = 'center';
      const w = ctx.measureText(label).width + 12;
      ctx.fillStyle = 'rgba(15, 23, 42, 0.86)';
      ctx.fillRect(x - w / 2, y, w, 16);
      ctx.fillStyle = color;
      ctx.fillText(label, x, y + 12);
    };

    // Lava Craters
    for (let i = 0; i < LAVA_CRATERS.length; i++) {
      const c = LAVA_CRATERS[i];
      const lx = toCanvasX(c.x);
      const lz = toCanvasZ(c.z);
      const lr = Math.max(5, (c.radius / (WORLD_MAX_X - WORLD_MIN_X)) * W);
      ctx.fillStyle = '#ea580c';
      ctx.beginPath();
      ctx.arc(lx, lz, lr, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#fde047';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      if (i === 1 || i === 3) {
        drawPlaceBadge('Lava Pool', lx, lz + lr + 4, '#fdba74');
      }
    }

    // Central Citadel Marker
    const citX = toCanvasX(0);
    const citZ = toCanvasZ(0);
    ctx.fillStyle = '#0ea5e9';
    ctx.fillRect(citX - 6, citZ - 6, 12, 12);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.strokeRect(citX - 6, citZ - 6, 12, 12);
    drawPlaceBadge('Central Citadel', citX, citZ - 26, '#7dd3fc');

    // Spawn Zones
    for (const z of SPAWN_ZONES) {
      const zx = toCanvasX(z.x);
      const zz = toCanvasZ(z.z);
      ctx.fillStyle = '#22c55e';
      ctx.beginPath();
      ctx.arc(zx, zz, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      const offsetY = z.id === 'frontier' ? zz + 18 : zz + 9;
      drawPlaceBadge(z.name, zx, offsetY, '#f8fafc');
    }

    // 3 Stone Sniper Towers
    for (const t of SNIPER_TOWERS) {
      const tx = toCanvasX(t.x);
      const tz = toCanvasZ(t.z);
      ctx.fillStyle = '#334155';
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.rect(tx - 6, tz - 6, 12, 12);
      ctx.fill();
      ctx.stroke();

      const labelY = t.id === 'frontier_tower' ? tz + 7 : tz - 25;
      const labelX = t.id === 'frontier_tower' ? tx + 24 : tx;
      drawPlaceBadge(t.name, labelX, labelY, '#fde047');
    }

    // Remote Players
    for (const p of players) {
      if (p.id === selfId || !p.alive) continue;
      const px = toCanvasX(p.x);
      const pz = toCanvasZ(p.z);
      ctx.fillStyle = p.isMod ? '#fbbf24' : '#ef4444';
      ctx.beginPath();
      ctx.arc(px, pz, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      const label = `${p.isMod ? '[MOD] ' : ''}${p.username}${p.clanName ? ` (${p.clanName})` : ''}`;
      drawPlaceBadge(label, px, pz + 7, '#f8fafc');
    }

    // Self Player Directional Arrow
    const sx = toCanvasX(coords.x);
    const sz = toCanvasZ(coords.z);
    ctx.save();
    ctx.translate(sx, sz);
    // In Three.js: forward at yaw=0 is -Z (up on map), yaw>0 rotates counter-clockwise (+X left -> -yaw on screen)
    ctx.rotate(-yaw);
    ctx.fillStyle = '#22c55e';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -10);
    ctx.lineTo(7, 8);
    ctx.lineTo(0, 4);
    ctx.lineTo(-7, 8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    drawPlaceBadge('You', sx, sz + 12, '#86efac');
  }, [terrainBackdrop, coords, yaw, players, selfId]);

  return (
    <div className="fixed inset-0 z-30 bg-black/75 flex items-center justify-center p-4">
      <div className="w-full max-w-4xl mc-panel rounded-md p-2">
        <div className="relative border-2 border-[#0e0f11] bg-[#141619] rounded-sm overflow-hidden">
          <button
            onClick={onClose}
            aria-label="Close Map"
            className="absolute top-2.5 right-2.5 z-10 p-1.5 rounded-sm mc-btn-stone text-slate-100 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
          <canvas ref={canvasRef} width={900} height={360} className="w-full h-auto block" />
        </div>
      </div>
    </div>
  );
};
