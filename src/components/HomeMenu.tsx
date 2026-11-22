import React, { useState } from 'react';
import {
  Award,
  BookOpen,
  Coins,
  Crosshair,
  ExternalLink,
  Info,
  Pencil,
  Play,
  Settings,
  Shield,
  ShieldAlert,
  Sparkles,
  Trophy,
  Volume2,
  VolumeX,
} from 'lucide-react';
import survivorAvatar from '../assets/images/survivor_avatar_1795260352064.jpg';
import homeBgImage from '../assets/images/terravox_home_bg_1795267570327.jpg';
import type { PlayerProfileState } from '../shared/protocol.ts';

export type HomeTab =
  | 'guns'
  | 'clans'
  | 'skins'
  | 'shop'
  | 'leaderboard'
  | 'creators'
  | 'about'
  | 'rules'
  | 'credits'
  | 'settings'
  | 'moderation';

const DISCORD_INVITE_URL = 'https://discord.gg/R7eReD66V';
const DISCORD_ICON_URL =
  'https://static.vecteezy.com/system/resources/thumbnails/056/850/688/small_2x/discord-app-icon-with-transparent-background-free-png.png';
const YOUTUBE_LOGO_URL =
  'https://pngdownload.io/wp-content/uploads/2024/02/YouTube-logo-social-media-video-sharing-transparent-PNG-image-jpg.webp';

const YOUTUBERS = [
  {
    name: 'PlusMinus_',
    url: 'https://www.youtube.com/@PlusMinus09',
  },
  {
    name: 'The Gaming Master',
    url: 'https://www.youtube.com/@Gaming_Master-h9o',
  },
] as const;

interface HomeMenuProps {
  profile: PlayerProfileState;
  muted: boolean;
  connectionError: string | null;
  onPlay: () => void;
  onUsernameChange: (name: string) => void;
  onToggleMute: () => void;
  onOpenTab: (tab: HomeTab) => void;
}

const YoutubeFallbackIcon: React.FC<{ className?: string }> = ({ className = 'w-6 h-4' }) => (
  <svg className={className} viewBox="0 0 24 17" fill="none" aria-hidden="true">
    <path
      d="M23.5 2.7A3 3 0 0 0 21.4.6C19.5 0 12 0 12 0S4.5 0 2.6.6A3 3 0 0 0 .5 2.7C0 4.6 0 8.5 0 8.5s0 3.9.5 5.8a3 3 0 0 0 2.1 2.1c1.9.6 9.4.6 9.4.6s7.5 0 9.4-.6a3 3 0 0 0 2.1-2.1c.5-1.9.5-5.8.5-5.8s0-3.9-.5-5.8Z"
      fill="#FF0000"
    />
    <path d="M9.6 12.1 15.8 8.5 9.6 4.9v7.2Z" fill="#FFFFFF" />
  </svg>
);

export const HomeMenu: React.FC<HomeMenuProps> = ({
  profile,
  muted,
  connectionError,
  onPlay,
  onUsernameChange,
  onToggleMute,
  onOpenTab,
}) => {
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(profile.username);
  const [bgFailed, setBgFailed] = useState(false);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [discordImgFailed, setDiscordImgFailed] = useState(false);
  const [youtubeImgFailed, setYoutubeImgFailed] = useState(false);

  const commitName = () => {
    setEditingName(false);
    const trimmed = nameDraft.trim();
    if (trimmed.length >= 2 && trimmed !== profile.username) {
      onUsernameChange(trimmed);
    } else {
      setNameDraft(profile.username);
    }
  };

  return (
    <div className="fixed inset-0 z-10 pointer-events-none select-none p-4 sm:p-6 flex flex-col justify-between">
      {/* Full-bleed Voxel Landscape Background Image */}
      <div className="fixed inset-0 -z-10 bg-gradient-to-b from-sky-400 via-emerald-600 to-emerald-950 overflow-hidden">
        {!bgFailed && (
          <img
            src={homeBgImage}
            alt="VoxelStrike Frontier Landscape"
            referrerPolicy="no-referrer"
            onError={() => setBgFailed(true)}
            className="w-full h-full object-cover object-center"
          />
        )}
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(circle at 50% 44%, rgba(15,23,42,0.06) 0%, rgba(15,23,42,0.28) 100%)',
          }}
        />
      </div>

      <div className="relative flex-1 flex items-stretch justify-between gap-4">
        {/* LEFT SIDE: User Profile Account Card + Vibrant Arcade Dock (GUNS, CLANS, SKINS, RANK) */}
        <div className="flex flex-col justify-start items-start gap-3 z-20">
          {/* Bright User Profile Card (Left Side) */}
          <div className="pointer-events-auto game-card-bright rounded-2xl px-3 py-2 flex items-center gap-3">
            {/* Real Avatar Portrait */}
            <div className="w-12 h-12 rounded-xl overflow-hidden border-2 border-emerald-500 bg-emerald-50 shrink-0 shadow-sm">
              {!avatarFailed ? (
                <img
                  src={survivorAvatar}
                  alt={`${profile.username} avatar`}
                  referrerPolicy="no-referrer"
                  onError={() => setAvatarFailed(true)}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-emerald-500 font-display text-lg text-white">
                  {profile.username.slice(0, 2).toUpperCase()}
                </div>
              )}
            </div>

            <div className="min-w-0 text-left">
              {editingName ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    commitName();
                  }}
                >
                  <input
                    autoFocus
                    maxLength={16}
                    value={nameDraft}
                    onChange={(e) => setNameDraft(e.target.value)}
                    onBlur={commitName}
                    className="bg-white border-2 border-emerald-500 rounded-lg px-2 py-0.5 text-sm font-bold text-slate-900 w-32 outline-none text-left"
                  />
                </form>
              ) : (
                <button
                  onClick={() => {
                    setNameDraft(profile.username);
                    setEditingName(true);
                  }}
                  title="Click to edit username"
                  className="inline-flex items-center justify-start gap-1.5 font-display text-slate-900 text-base sm:text-lg hover:text-emerald-600 transition-colors truncate max-w-[220px] cursor-pointer"
                >
                  {profile.isMod && (
                    <span className="px-1.5 py-0.5 rounded-md bg-amber-400 text-slate-950 font-sans text-[10px] font-black tracking-wide shrink-0">
                      MOD
                    </span>
                  )}
                  <span className="truncate">
                    {profile.username}
                    {profile.clanName ? (
                      <span className="text-emerald-600 ml-1">({profile.clanName})</span>
                    ) : null}
                  </span>
                  <Pencil className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                </button>
              )}
              <div className="flex items-center justify-start gap-2 text-xs text-slate-600 tabular-nums mt-0.5 font-bold">
                <span className="text-emerald-600">Lv.{profile.level}</span>
                <span className="text-slate-300">·</span>
                <span className="text-sky-600">{profile.xp} XP</span>
                <span className="text-slate-300">·</span>
                <span className="inline-flex items-center gap-1 text-amber-600">
                  <Coins className="w-3.5 h-3.5 text-amber-500" />
                  {profile.coins}
                </span>
              </div>
            </div>
          </div>

          <div className="pointer-events-auto flex flex-col gap-2.5 w-48 sm:w-52">
            <button
              onClick={() => onOpenTab('guns')}
              className="arcade-btn arcade-btn-blue rounded-2xl px-4 py-2.5 flex items-center gap-3 text-left cursor-pointer whitespace-nowrap"
            >
              <div className="w-9 h-9 rounded-xl bg-white/25 border border-white/40 flex items-center justify-center shrink-0">
                <Crosshair className="w-5 h-5 text-white drop-shadow" />
              </div>
              <span className="font-display text-xl tracking-wide text-white arcade-text-shadow">
                GUNS
              </span>
            </button>

            <button
              onClick={() => onOpenTab('clans')}
              className="arcade-btn arcade-btn-green rounded-2xl px-4 py-2.5 flex items-center gap-3 text-left cursor-pointer whitespace-nowrap"
            >
              <div className="w-9 h-9 rounded-xl bg-white/25 border border-white/40 flex items-center justify-center shrink-0">
                <Shield className="w-5 h-5 text-white drop-shadow" />
              </div>
              <span className="font-display text-xl tracking-wide text-white arcade-text-shadow">
                CLANS
              </span>
            </button>

            <button
              onClick={() => onOpenTab('skins')}
              className="arcade-btn arcade-btn-amber rounded-2xl px-4 py-2.5 flex items-center gap-3 text-left cursor-pointer whitespace-nowrap"
            >
              <div className="w-9 h-9 rounded-xl bg-white/25 border border-white/40 flex items-center justify-center shrink-0">
                <Sparkles className="w-5 h-5 text-white drop-shadow" />
              </div>
              <span className="font-display text-xl tracking-wide text-white arcade-text-shadow">
                SKINS
              </span>
            </button>

            <button
              onClick={() => onOpenTab('leaderboard')}
              className="arcade-btn arcade-btn-purple rounded-2xl px-4 py-2.5 flex items-center gap-3 text-left cursor-pointer whitespace-nowrap"
            >
              <div className="w-9 h-9 rounded-xl bg-white/25 border border-white/40 flex items-center justify-center shrink-0">
                <Trophy className="w-5 h-5 text-white drop-shadow" />
              </div>
              <span className="font-display text-xl tracking-wide text-white arcade-text-shadow">
                RANK
              </span>
            </button>

            {/* Bright Secondary Utility Grid (ABOUT US, RULES, CREDITS, MOD) */}
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                onClick={() => onOpenTab('about')}
                title="About VoxelStrike"
                className="arcade-btn arcade-btn-light rounded-xl py-2 px-1 flex flex-col items-center justify-center gap-0.5 text-[11px] font-display tracking-wide text-slate-800 cursor-pointer whitespace-nowrap"
              >
                <Info className="w-4 h-4 text-sky-600" />
                ABOUT US
              </button>
              <button
                onClick={() => onOpenTab('rules')}
                title="Server Rules"
                className="arcade-btn arcade-btn-light rounded-xl py-2 px-1 flex flex-col items-center justify-center gap-0.5 text-[11px] font-display tracking-wide text-slate-800 cursor-pointer whitespace-nowrap"
              >
                <BookOpen className="w-4 h-4 text-emerald-600" />
                RULES
              </button>
              <button
                onClick={() => onOpenTab('credits')}
                title="Credits"
                className="arcade-btn arcade-btn-light rounded-xl py-2 px-1 flex flex-col items-center justify-center gap-0.5 text-[11px] font-display tracking-wide text-slate-800 cursor-pointer whitespace-nowrap"
              >
                <Award className="w-4 h-4 text-purple-600" />
                CREDITS
              </button>
              <button
                onClick={() => onOpenTab('moderation')}
                title="Moderation"
                className="arcade-btn arcade-btn-light rounded-xl py-2 px-1 flex flex-col items-center justify-center gap-0.5 text-[11px] font-display tracking-wide text-slate-800 cursor-pointer whitespace-nowrap"
              >
                <ShieldAlert className="w-4 h-4 text-rose-500" />
                MOD
              </button>
            </div>
          </div>
        </div>

        {/* CENTER STAGE: Bold Lilita One VoxelStrike Logo + PLAY GAME Button */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none px-4">
          <div className="flex flex-col items-center gap-6">
            <div className="flex flex-col items-center text-center">
              <h1
                className="font-display text-6xl sm:text-7xl md:text-8xl tracking-wider text-white leading-none"
                style={{
                  WebkitTextStroke: '3px #14532d',
                  textShadow: '0 6px 0 #15803d, 0 12px 24px rgba(0,0,0,0.38)',
                }}
              >
                VoxelStrike
              </h1>
            </div>

            {connectionError && (
              <div className="pointer-events-auto bg-rose-600 border-2 border-rose-200 rounded-2xl px-4 py-2 text-sm font-bold text-white shadow-lg max-w-md text-center">
                {connectionError}
              </div>
            )}

            <button
              onClick={onPlay}
              className="pointer-events-auto arcade-btn arcade-btn-green rounded-2xl px-12 py-4 text-white font-display text-3xl sm:text-4xl tracking-wider arcade-text-shadow flex items-center gap-3.5 cursor-pointer whitespace-nowrap"
            >
              <Play className="w-8 h-8 fill-current" />
              PLAY GAME
            </button>
          </div>
        </div>

        {/* RIGHT SIDE: Top Audio/Settings + YouTubers, Bottom-Right Discord Server */}
        <div className="flex flex-col justify-between items-end gap-3 z-20 ml-auto">
          <div className="flex flex-col items-end gap-3">
            <div className="pointer-events-auto flex items-center gap-2">
              <button
                onClick={onToggleMute}
                title={muted ? 'Unmute Audio' : 'Mute Audio'}
                className="arcade-btn arcade-btn-light w-11 h-11 rounded-xl flex items-center justify-center text-slate-800 cursor-pointer"
              >
                {muted ? <VolumeX className="w-5 h-5 text-rose-500" /> : <Volume2 className="w-5 h-5 text-emerald-600" />}
              </button>
              <button
                onClick={() => onOpenTab('settings')}
                title="Settings & Keyboard Controls"
                className="arcade-btn arcade-btn-light w-11 h-11 rounded-xl flex items-center justify-center text-slate-800 cursor-pointer"
              >
                <Settings className="w-5 h-5 text-slate-700" />
              </button>
            </div>

            {/* Right Side Top: Bright YouTubers Panel with Official Logo */}
            <div className="pointer-events-auto game-card-bright rounded-2xl p-3 w-64 sm:w-72 flex flex-col gap-2">
              <div className="flex items-center gap-2 px-1">
                {!youtubeImgFailed ? (
                  <img
                    src={YOUTUBE_LOGO_URL}
                    alt="YouTube"
                    referrerPolicy="no-referrer"
                    onError={() => setYoutubeImgFailed(true)}
                    className="h-5 w-auto object-contain shrink-0"
                  />
                ) : (
                  <YoutubeFallbackIcon className="w-6 h-4 shrink-0" />
                )}
                <span className="font-display text-sm tracking-wide text-slate-900 uppercase">
                  YouTubers
                </span>
              </div>

              {YOUTUBERS.map((yt) => (
                <a
                  key={yt.url}
                  href={yt.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-xl bg-rose-50 hover:bg-rose-100 border-2 border-rose-200 hover:border-rose-400 px-3 py-2 flex items-center justify-between gap-2.5 transition-all group"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-9 h-9 rounded-lg bg-white border border-rose-200 flex items-center justify-center shrink-0 shadow-xs overflow-hidden p-1">
                      {!youtubeImgFailed ? (
                        <img
                          src={YOUTUBE_LOGO_URL}
                          alt="YouTube"
                          referrerPolicy="no-referrer"
                          onError={() => setYoutubeImgFailed(true)}
                          className="w-full h-full object-contain"
                        />
                      ) : (
                        <YoutubeFallbackIcon className="w-6 h-4" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="font-display text-sm text-slate-900 truncate">
                        {yt.name}
                      </div>
                      <div className="text-[11px] font-bold text-rose-600">
                        Watch Channel
                      </div>
                    </div>
                  </div>
                  <ExternalLink className="w-4 h-4 text-rose-400 group-hover:text-rose-600 shrink-0 transition-colors" />
                </a>
              ))}
            </div>
          </div>

          {/* BOTTOM-RIGHT: Bright Discord Server Card */}
          <a
            href={DISCORD_INVITE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="pointer-events-auto arcade-btn arcade-btn-indigo rounded-2xl px-3.5 py-2.5 flex items-center gap-3 group max-w-[260px]"
          >
            <div className="w-11 h-11 rounded-xl bg-white flex items-center justify-center shrink-0 overflow-hidden shadow-sm">
              {!discordImgFailed ? (
                <img
                  src={DISCORD_ICON_URL}
                  alt="Discord"
                  referrerPolicy="no-referrer"
                  onError={() => setDiscordImgFailed(true)}
                  className="w-9 h-9 object-contain"
                />
              ) : (
                <svg width="26" height="20" viewBox="0 0 24 18" fill="none" aria-hidden="true">
                  <path
                    d="M20.3 1.5A19.6 19.6 0 0 0 15.4 0a13.4 13.4 0 0 0-.6 1.3 18.2 18.2 0 0 0-5.6 0A13.4 13.4 0 0 0 8.6 0 19.6 19.6 0 0 0 3.7 1.5C.6 6.2-.2 10.7.2 15.2a19.8 19.8 0 0 0 6 3 14.3 14.3 0 0 0 1.3-2.1 12.6 12.6 0 0 1-2-.9l.5-.4a14 14 0 0 0 12 0l.5.4a12.6 12.6 0 0 1-2 .9c.4.8.8 1.5 1.3 2.1a19.8 19.8 0 0 0 6-3c.5-5.2-.8-9.7-3.5-13.7ZM8 12.4c-1.2 0-2.1-1.1-2.1-2.4s.9-2.4 2.1-2.4 2.2 1.1 2.1 2.4c0 1.3-.9 2.4-2.1 2.4Zm8 0c-1.2 0-2.1-1.1-2.1-2.4s.9-2.4 2.1-2.4 2.2 1.1 2.1 2.4c0 1.3-.9 2.4-2.1 2.4Z"
                    fill="#5865F2"
                  />
                </svg>
              )}
            </div>
            <div className="min-w-0">
              <div className="font-display text-base tracking-wide text-white arcade-text-shadow flex items-center gap-1.5 whitespace-nowrap">
                DISCORD SERVER
                <ExternalLink className="w-3.5 h-3.5 text-indigo-100" />
              </div>
              <div className="text-[11px] font-bold text-indigo-100 truncate">
                Join Community
              </div>
            </div>
          </a>
        </div>
      </div>
    </div>
  );
};
