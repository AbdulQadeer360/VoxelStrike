import React from 'react';
import { ITEMS } from '../shared/constants.ts';

interface ItemIconProps {
  itemId: string;
  size?: number;
}

export const ItemIcon: React.FC<ItemIconProps> = ({ itemId, size = 32 }) => {
  if (!itemId) return null;
  const def = ITEMS[itemId];
  if (!def) return null;

  if (itemId === 'rifle') {
    return (
      <svg width={size} height={size} viewBox="0 0 36 36" fill="none" aria-hidden="true">
        {/* Adjustable Stock & Buffer */}
        <path d="M2 15.5L8.5 14.8V19.5L4.5 22.8H2V15.5Z" fill="#1f242c" stroke="#0b0e12" strokeWidth="1.2" strokeLinejoin="round" />
        <rect x="6.5" y="15.3" width="3" height="2.4" fill="#3b434f" />
        {/* Trigger Guard & Ergonomic Grip */}
        <path d="M13.5 19.6H16.8L16.3 22H13.6" stroke="#1e242d" strokeWidth="1.1" strokeLinecap="round" />
        <path d="M10.5 19.5L8.7 26.8H11.6L13.3 19.5H10.5Z" fill="#181c22" stroke="#0b0e12" strokeWidth="1.2" strokeLinejoin="round" />
        {/* Curved 30rd Banana Magazine */}
        <path d="M16.8 19.5C16.8 23.4 17.8 26.6 19.8 28.6L22.6 27.5C20.9 25.5 20.1 22.8 20.1 19.5H16.8Z" fill="#2c333d" stroke="#0b0e12" strokeWidth="1.2" strokeLinejoin="round" />
        {/* Upper/Lower Receiver & Vented Handguard */}
        <path d="M8.5 14.5H20.5V19.6H8.5V14.5Z" fill="#3a424e" stroke="#0b0e12" strokeWidth="1.2" />
        <rect x="14.5" y="15.3" width="3.5" height="1.6" rx="0.4" fill="#cbd5e1" />
        <rect x="20.5" y="15" width="5.8" height="4.1" rx="0.8" fill="#282f38" stroke="#0b0e12" strokeWidth="1.1" />
        <line x1="21.8" y1="16.2" x2="25" y2="16.2" stroke="#64748b" strokeWidth="1" />
        <line x1="21.8" y1="17.8" x2="25" y2="17.8" stroke="#64748b" strokeWidth="1" />
        {/* Steel Barrel, Front Sight & Slotted Flash Hider */}
        <rect x="26.3" y="15.8" width="5.8" height="2.1" fill="#475569" stroke="#0b0e12" strokeWidth="1" />
        <path d="M27.8 15.8L28.6 12.6H29.6L30.2 15.8" fill="#1e242d" stroke="#0b0e12" strokeWidth="0.9" />
        <rect x="32.1" y="15.2" width="2.4" height="3.2" rx="0.5" fill="#1e242d" stroke="#0b0e12" strokeWidth="1" />
        {/* Picatinny Rail & Holographic Red Dot */}
        <rect x="11.5" y="11.3" width="5.8" height="3.2" rx="0.7" fill="#181c22" stroke="#0b0e12" strokeWidth="1.1" />
        <rect x="12.6" y="12" width="3.5" height="1.8" fill="#0ea5e9" fillOpacity="0.6" />
        <circle cx="14.4" cy="12.9" r="0.7" fill="#ef4444" />
      </svg>
    );
  }

  if (itemId === 'smg') {
    return (
      <svg width={size} height={size} viewBox="0 0 36 36" fill="none" aria-hidden="true">
        {/* Folding Wire Stock */}
        <path d="M3 15H8.5V19H7V16.6H4.2V20.5H3V15Z" fill="#334155" stroke="#0b0e12" strokeWidth="1.1" />
        {/* Grip & Trigger */}
        <path d="M12.5 19.2H15.4L15 21.3H12.7" stroke="#1e242d" strokeWidth="1" />
        <path d="M10.2 19L8.9 26.2H11.6L12.8 19H10.2Z" fill="#181c22" stroke="#0b0e12" strokeWidth="1.1" strokeLinejoin="round" />
        {/* Curved MP5 Stick Mag */}
        <path d="M16.8 19.2C17.1 22.8 18 26.5 19.4 29.3L22 28.5C20.7 25.8 19.9 22.4 19.7 19.2H16.8Z" fill="#2b313b" stroke="#0b0e12" strokeWidth="1.1" strokeLinejoin="round" />
        {/* Receiver & Foregrip */}
        <rect x="8.5" y="14.2" width="14.2" height="5" rx="1" fill="#333b47" stroke="#0b0e12" strokeWidth="1.2" />
        <rect x="14.5" y="15" width="3" height="1.5" fill="#cbd5e1" />
        <rect x="20.2" y="19.2" width="2.2" height="4.2" rx="0.6" fill="#181c22" stroke="#0b0e12" strokeWidth="1" />
        {/* Integral Ribbed Suppressor */}
        <rect x="22.7" y="14.9" width="10.8" height="3.6" rx="1" fill="#1f252e" stroke="#0b0e12" strokeWidth="1.2" />
        <line x1="25" y1="15.2" x2="25" y2="18.2" stroke="#475569" strokeWidth="1" />
        <line x1="27.5" y1="15.2" x2="27.5" y2="18.2" stroke="#475569" strokeWidth="1" />
        <line x1="30" y1="15.2" x2="30" y2="18.2" stroke="#475569" strokeWidth="1" />
        {/* Micro Reflex Optic */}
        <rect x="13" y="11.2" width="4.8" height="3" rx="0.8" fill="#181c22" stroke="#0b0e12" strokeWidth="1" />
        <circle cx="15.4" cy="12.6" r="0.8" fill="#38bdf8" />
      </svg>
    );
  }

  if (itemId === 'shotgun') {
    return (
      <svg width={size} height={size} viewBox="0 0 36 36" fill="none" aria-hidden="true">
        {/* Angled Walnut / Tactical Stock */}
        <path d="M2.2 20.6L10 15.8V19.8L5.5 24.8H2.2V20.6Z" fill="#6b3e1d" stroke="#0b0e12" strokeWidth="1.2" strokeLinejoin="round" />
        <path d="M10.8 19.6H13.5L13 21.8H10.5" stroke="#1e242d" strokeWidth="1" />
        {/* Steel Receiver + Red Side-Saddle Shells */}
        <rect x="9.8" y="15" width="10.8" height="4.8" rx="0.8" fill="#323944" stroke="#0b0e12" strokeWidth="1.2" />
        <rect x="12" y="16" width="1.4" height="2.7" fill="#dc2626" />
        <rect x="14.1" y="16" width="1.4" height="2.7" fill="#dc2626" />
        <rect x="16.2" y="16" width="1.4" height="2.7" fill="#dc2626" />
        {/* Long Steel Barrel & Under-Tube Mag */}
        <rect x="20.6" y="15.1" width="13.2" height="2.1" rx="0.4" fill="#475569" stroke="#0b0e12" strokeWidth="1.1" />
        <rect x="20.6" y="17.6" width="11.2" height="1.9" rx="0.4" fill="#272e37" stroke="#0b0e12" strokeWidth="1" />
        {/* Ribbed Pump Forend */}
        <rect x="22" y="17.2" width="6.5" height="3.1" rx="0.8" fill="#181c22" stroke="#0b0e12" strokeWidth="1.1" />
        <line x1="23.6" y1="17.6" x2="23.6" y2="19.9" stroke="#475569" strokeWidth="1" />
        <line x1="25.3" y1="17.6" x2="25.3" y2="19.9" stroke="#475569" strokeWidth="1" />
        <line x1="27" y1="17.6" x2="27" y2="19.9" stroke="#475569" strokeWidth="1" />
        {/* Brass Front Bead */}
        <circle cx="33" cy="14.4" r="0.9" fill="#f59e0b" stroke="#0b0e12" strokeWidth="0.6" />
      </svg>
    );
  }

  if (itemId === 'sniper') {
    return (
      <svg width={size} height={size} viewBox="0 0 36 36" fill="none" aria-hidden="true">
        {/* Precision Cheek-Riser Stock */}
        <path d="M2 16.5H9.2V20.5H6L4.5 23.8H2V16.5Z" fill="#2c352f" stroke="#0b0e12" strokeWidth="1.2" strokeLinejoin="round" />
        <rect x="3.2" y="15.4" width="4.4" height="1.3" rx="0.4" fill="#181c22" />
        {/* Grip, Trigger & .50 Box Mag */}
        <path d="M10.4 20.5L9 26H11.5L12.7 20.5H10.4Z" fill="#181c22" stroke="#0b0e12" strokeWidth="1.1" />
        <rect x="14.4" y="20.4" width="4.2" height="4.2" rx="0.6" fill="#20252d" stroke="#0b0e12" strokeWidth="1.1" />
        {/* Chassis & Bolt Handle */}
        <rect x="9" y="15.8" width="12.2" height="4.6" rx="0.9" fill="#3a463d" stroke="#0b0e12" strokeWidth="1.2" />
        <circle cx="13.2" cy="18.2" r="1.2" fill="#cbd5e1" stroke="#0b0e12" strokeWidth="0.7" />
        {/* Free-Floated Barrel, Folding Bipod & Heavy Muzzle Brake */}
        <rect x="21.2" y="16.8" width="10" height="2" rx="0.4" fill="#475569" stroke="#0b0e12" strokeWidth="1.1" />
        <line x1="24.5" y1="19" x2="27.2" y2="25.2" stroke="#334155" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="24.5" y1="19" x2="22.5" y2="24.8" stroke="#1e293b" strokeWidth="1.4" strokeLinecap="round" />
        <rect x="31" y="15.7" width="3.4" height="4.2" rx="0.6" fill="#1f252e" stroke="#0b0e12" strokeWidth="1.1" />
        {/* Telescopic Scope + Rings + Turrets */}
        <rect x="10.8" y="10.4" width="10.6" height="3.2" rx="0.9" fill="#181c22" stroke="#0b0e12" strokeWidth="1.1" />
        <rect x="9.4" y="9.8" width="2.2" height="4.4" rx="0.6" fill="#27303b" stroke="#0b0e12" strokeWidth="0.9" />
        <rect x="20.8" y="9.6" width="3" height="4.8" rx="0.7" fill="#27303b" stroke="#0b0e12" strokeWidth="0.9" />
        <rect x="15.2" y="9.1" width="1.8" height="1.4" fill="#64748b" />
        <line x1="13.2" y1="13.6" x2="13.2" y2="15.8" stroke="#0b0e12" strokeWidth="1.4" />
        <line x1="18.2" y1="13.6" x2="18.2" y2="15.8" stroke="#0b0e12" strokeWidth="1.4" />
      </svg>
    );
  }

  if (itemId === 'pickaxe') {
    return (
      <svg width={size} height={size} viewBox="0 0 36 36" fill="none" aria-hidden="true">
        {/* Diagonal Timber Shaft & Pommel */}
        <path d="M5.5 30.5L23.5 12.5" stroke="#0f172a" strokeWidth="5.4" strokeLinecap="round" />
        <path d="M5.5 30.5L23.5 12.5" stroke="#b4632b" strokeWidth="3.1" strokeLinecap="round" />
        <path d="M7 29L10.5 25.5" stroke="#1e293b" strokeWidth="3.6" strokeLinecap="round" />
        {/* Steel Socket Collar */}
        <rect
          x="20.4"
          y="9.4"
          width="5.6"
          height="5.6"
          rx="1"
          transform="rotate(-45 23.2 12.2)"
          fill="#94a3b8"
          stroke="#0f172a"
          strokeWidth="1.4"
        />
        {/* Curved Twin-Pointed Steel & Diamond-Edge Pickaxe Head */}
        <path
          d="M11 6.5C17.2 5.2 22.8 7.1 26.8 11.1C30.8 15.1 31.8 20.6 30.4 25.4L27.2 21.8C27.5 18.4 26.2 15.2 23.8 12.8C21.4 10.4 18.1 9.2 14.5 9.6L11 6.5Z"
          fill="#22d3ee"
          stroke="#0f172a"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        {/* Steel Spine & Edge Sheen */}
        <path
          d="M14.2 8.2C18.6 7.8 22.8 9.6 25.8 12.6C28.2 15 29.4 18.2 29.1 21.8"
          stroke="#cbd5e1"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        <path d="M12.2 7.2L15.4 7.7" stroke="#ffffff" strokeWidth="1.3" strokeLinecap="round" />
        <path d="M29.4 23.2L28.6 20.4" stroke="#ffffff" strokeWidth="1.3" strokeLinecap="round" />
      </svg>
    );
  }

  if (itemId === 'medkit') {
    return (
      <svg width={size} height={size} viewBox="0 0 36 36" fill="none" aria-hidden="true">
        <rect x="6" y="10" width="24" height="19" rx="3.5" fill="#ffffff" stroke="#0f172a" strokeWidth="1.6" />
        <rect x="13" y="6" width="10" height="4" rx="1.5" fill="#cbd5e1" stroke="#0f172a" strokeWidth="1.4" />
        <rect x="16" y="14" width="4" height="11" rx="0.8" fill="#ef4444" />
        <rect x="12.5" y="17.5" width="11" height="4" rx="0.8" fill="#ef4444" />
      </svg>
    );
  }

  if (itemId === 'ammo') {
    return (
      <svg width={size} height={size} viewBox="0 0 36 36" fill="none" aria-hidden="true">
        <rect x="9" y="14" width="4" height="14" rx="1" fill="#f59e0b" stroke="#0f172a" strokeWidth="1.2" />
        <path d="M9 14L11 8L13 14H9Z" fill="#fde047" stroke="#0f172a" strokeWidth="1" />
        <rect x="16" y="14" width="4" height="14" rx="1" fill="#f59e0b" stroke="#0f172a" strokeWidth="1.2" />
        <path d="M16 14L18 8L20 14H16Z" fill="#fde047" stroke="#0f172a" strokeWidth="1" />
        <rect x="23" y="14" width="4" height="14" rx="1" fill="#f59e0b" stroke="#0f172a" strokeWidth="1.2" />
        <path d="M23 14L25 8L27 14H23Z" fill="#fde047" stroke="#0f172a" strokeWidth="1" />
      </svg>
    );
  }

  if (itemId === 'cactus') {
    return (
      <svg width={size} height={size} viewBox="0 0 36 36" fill="none" aria-hidden="true">
        <rect x="11" y="7" width="14" height="23" rx="2" fill="#42962a" stroke="#0f172a" strokeWidth="1.6" />
        <line x1="15" y1="8" x2="15" y2="29" stroke="#265c17" strokeWidth="1.5" />
        <line x1="21" y1="8" x2="21" y2="29" stroke="#65c946" strokeWidth="1.5" />
        <circle cx="12.5" cy="13" r="1" fill="#fef08a" />
        <circle cx="23.5" cy="18" r="1" fill="#fef08a" />
        <circle cx="13" cy="23" r="1" fill="#fef08a" />
      </svg>
    );
  }

  if (itemId === 'sandstone') {
    return (
      <svg width={size} height={size} viewBox="0 0 36 36" fill="none" aria-hidden="true">
        <polygon points="18,5 30,11.5 18,18 6,11.5" fill="#ede1ab" stroke="#0f172a" strokeWidth="1.4" />
        <polygon points="6,11.5 18,18 18,31 6,24.5" fill="#dfd096" stroke="#0f172a" strokeWidth="1.4" />
        <polygon points="30,11.5 18,18 18,31 30,24.5" fill="#bfa966" stroke="#0f172a" strokeWidth="1.4" />
        <line x1="7" y1="18" x2="17" y2="23" stroke="#9e8748" strokeWidth="1.3" />
      </svg>
    );
  }

  if (itemId === 'stone_wall' || itemId === 'wood_wall') {
    const main = itemId === 'stone_wall' ? '#8d95a0' : '#c49252';
    const light = itemId === 'stone_wall' ? '#cbd5e1' : '#e2b578';
    const dark = itemId === 'stone_wall' ? '#525b68' : '#855828';
    return (
      <svg width={size} height={size} viewBox="0 0 36 36" fill="none" aria-hidden="true">
        <rect x="6" y="13" width="24" height="16" rx="1" fill={main} stroke="#0f172a" strokeWidth="1.5" />
        <rect x="12" y="7" width="12" height="22" rx="1" fill={light} stroke="#0f172a" strokeWidth="1.5" />
        <rect x="6" y="18" width="24" height="11" fill={dark} fillOpacity="0.45" />
        <line x1="6" y1="21" x2="30" y2="21" stroke="#0f172a" strokeWidth="1.1" strokeOpacity="0.55" />
      </svg>
    );
  }

  if (itemId === 'stone_stairs' || itemId === 'wood_stairs') {
    const top = itemId === 'stone_stairs' ? '#cbd5e1' : '#deb173';
    const front = itemId === 'stone_stairs' ? '#8d95a0' : '#b88b50';
    const dark = itemId === 'stone_stairs' ? '#5b6472' : '#7c5324';
    return (
      <svg width={size} height={size} viewBox="0 0 36 36" fill="none" aria-hidden="true">
        <path
          d="M6 20H18V10H30V28H6V20Z"
          fill={front}
          stroke="#0f172a"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
        <rect x="18" y="8" width="12" height="3.5" fill={top} stroke="#0f172a" strokeWidth="1.3" />
        <rect x="6" y="18" width="12" height="3.5" fill={top} stroke="#0f172a" strokeWidth="1.3" />
        <rect x="18" y="21.5" width="12" height="6.5" fill={dark} fillOpacity="0.4" />
      </svg>
    );
  }

  // Isometric Voxel Block / Ore Nugget
  const topColor = def.color;
  const sideColor = itemId === 'dirt' ? '#7a553a' : topColor;
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" fill="none" aria-hidden="true">
      <polygon points="18,5 30,11.5 18,18 6,11.5" fill={topColor} stroke="#0f172a" strokeWidth="1.4" />
      <polygon points="6,11.5 18,18 18,31 6,24.5" fill={sideColor} fillOpacity="0.86" stroke="#0f172a" strokeWidth="1.4" />
      <polygon points="30,11.5 18,18 18,31 30,24.5" fill={sideColor} fillOpacity="0.64" stroke="#0f172a" strokeWidth="1.4" />
    </svg>
  );
};
