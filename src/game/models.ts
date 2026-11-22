import * as THREE from 'three';
import { GUN_SKINS, type GunSkinDef, type SkinDef } from '../shared/constants.ts';
import type { TeamSide } from '../shared/protocol.ts';
import { createCharacterTextures, createGunSkinTexture } from './textures.ts';

export interface CharacterRig {
  group: THREE.Group;
  torso: THREE.Mesh;
  pack: THREE.Mesh;
  packTrim: THREE.Mesh;
  head: THREE.Group;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  leftLeg: THREE.Group;
  rightLeg: THREE.Group;
  rifleMesh: THREE.Group;
  gunMeshes: Record<string, THREE.Group>;
  pickaxeMesh: THREE.Group;
  carrierFlagRed: THREE.Group;
  carrierFlagBlue: THREE.Group;
  hpBg: THREE.Mesh;
  hpBarFill: THREE.Mesh;
  nameSprite: THREE.Sprite;
  skinId: string;
  gunSkinId: string;
  clanTag?: string;
  clanName?: string;
  isMod?: boolean;
  team?: TeamSide;
}

export function createNameplateTexture(
  username: string,
  clanName?: string,
  isMod?: boolean,
  team?: TeamSide
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 384;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, 384, 64);

  ctx.fillStyle =
    team === 'red'
      ? 'rgba(127, 29, 29, 0.88)'
      : team === 'blue'
      ? 'rgba(30, 58, 138, 0.88)'
      : 'rgba(15, 23, 42, 0.84)';
  ctx.beginPath();
  ctx.roundRect(10, 12, 364, 40, 10);
  ctx.fill();

  ctx.strokeStyle =
    team === 'red'
      ? 'rgba(248, 113, 113, 0.92)'
      : team === 'blue'
      ? 'rgba(96, 165, 250, 0.92)'
      : isMod
      ? 'rgba(251, 191, 36, 0.85)'
      : clanName
      ? 'rgba(124, 227, 84, 0.65)'
      : 'rgba(255, 255, 255, 0.28)';
  ctx.lineWidth = 2.5;
  ctx.stroke();

  const teamPrefix = team === 'red' ? '[RED] ' : team === 'blue' ? '[BLUE] ' : '';
  const modPrefix = isMod ? '[MOD] ' : '';
  const clanSuffix = clanName ? ` (${clanName.slice(0, 12)})` : '';
  const label = `${teamPrefix}${modPrefix}${username.slice(0, 14)}${clanSuffix}`;
  ctx.fillStyle = team === 'red' ? '#fecaca' : team === 'blue' ? '#bfdbfe' : isMod ? '#fde68a' : '#f8fafc';
  ctx.font = 'bold 21px "Plus Jakarta Sans", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, 192, 33, 344);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createCtfFlagPole(team: TeamSide, includeStand = true): THREE.Group {
  const group = new THREE.Group();
  const isRed = team === 'red';
  const colorMain = isRed ? '#ef4444' : '#3b82f6';
  const colorTrim = isRed ? '#991b1b' : '#1d4ed8';

  const poleMat = new THREE.MeshStandardMaterial({ color: '#e2e8f0', roughness: 0.25, metalness: 0.85 });
  const clothMat = new THREE.MeshStandardMaterial({
    color: colorMain,
    emissive: colorMain,
    emissiveIntensity: 0.28,
    roughness: 0.6,
    side: THREE.DoubleSide,
  });
  const trimMat = new THREE.MeshStandardMaterial({ color: colorTrim, roughness: 0.5, metalness: 0.2 });
  const goldMat = new THREE.MeshStandardMaterial({
    color: '#fbbf24',
    emissive: '#d97706',
    emissiveIntensity: 0.3,
    roughness: 0.25,
    metalness: 0.85,
  });

  if (includeStand) {
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.05, 0.12, 16), trimMat);
    pad.position.y = 0.06;
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.75, 0.92, 24),
      new THREE.MeshBasicMaterial({ color: colorMain, side: THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.13;
    group.add(pad, ring);
  }

  const poleH = includeStand ? 3.2 : 1.7;
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.065, poleH, 10), poleMat);
  pole.position.y = poleH / 2 + (includeStand ? 0.08 : 0);
  const finial = new THREE.Mesh(new THREE.OctahedronGeometry(0.14, 0), goldMat);
  finial.position.y = poleH + (includeStand ? 0.16 : 0.06);
  group.add(pole, finial);

  const bannerGroup = new THREE.Group();
  bannerGroup.position.set(0.05, poleH - (includeStand ? 0.35 : 0.25), 0);
  const b1 = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.62, 0.05), clothMat);
  b1.position.set(0.32, 0, 0);
  const b2 = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.56, 0.05), clothMat);
  b2.position.set(0.88, -0.02, 0.06);
  b2.rotation.y = 0.18;
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.24, 0.07), goldMat);
  stripe.position.set(0.38, 0, 0);
  bannerGroup.add(b1, b2, stripe);
  bannerGroup.name = 'flagBanner';
  group.add(bannerGroup);
  group.userData.banner = bannerGroup;

  return group;
}

function makeCylZ(
  radiusTop: number,
  radiusBottom: number,
  length: number,
  mat: THREE.Material,
  segs = 12
): THREE.Mesh {
  const geo = new THREE.CylinderGeometry(radiusTop, radiusBottom, length, segs);
  geo.rotateX(Math.PI / 2);
  return new THREE.Mesh(geo, mat);
}

export function createGunGroup(
  gunId: string = 'rifle',
  gunSkin: GunSkinDef = GUN_SKINS[0]
): THREE.Group {
  const gun = new THREE.Group();
  const gunTex = createGunSkinTexture(gunSkin);

  const primaryMat = new THREE.MeshStandardMaterial({
    map: gunTex,
    roughness: 0.42,
    metalness: 0.48,
  });
  const polymerMat = new THREE.MeshStandardMaterial({
    color: '#16191e',
    roughness: 0.78,
    metalness: 0.1,
  });
  const steelMat = new THREE.MeshStandardMaterial({
    color: '#222831',
    roughness: 0.28,
    metalness: 0.88,
  });
  const gunmetalDarkMat = new THREE.MeshStandardMaterial({
    color: '#111418',
    roughness: 0.34,
    metalness: 0.82,
  });
  const chromeMat = new THREE.MeshStandardMaterial({
    color: '#cbd5e1',
    roughness: 0.18,
    metalness: 0.94,
  });
  const glassMat = new THREE.MeshStandardMaterial({
    color: '#0c4a6e',
    emissive: '#075985',
    emissiveIntensity: 0.22,
    roughness: 0.08,
    metalness: 0.92,
  });
  const brassMat = new THREE.MeshStandardMaterial({
    color: '#d97706',
    roughness: 0.26,
    metalness: 0.88,
  });
  const shellRedMat = new THREE.MeshStandardMaterial({
    color: '#b91c1c',
    roughness: 0.55,
    metalness: 0.12,
  });

  const addPicatinnyRail = (y: number, zStart: number, teethCount: number, step = 0.036) => {
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.044, 0.014, teethCount * step), gunmetalDarkMat);
    base.position.set(0, y, zStart - (teethCount * step) / 2);
    gun.add(base);
    for (let i = 0; i < teethCount; i++) {
      const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.052, 0.01, step * 0.55), steelMat);
      tooth.position.set(0, y + 0.01, zStart - i * step - step * 0.5);
      gun.add(tooth);
    }
  };

  const addTriggerAssembly = (y: number, z: number) => {
    const guardBottom = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.012, 0.078), steelMat);
    guardBottom.position.set(0, y - 0.052, z);
    const guardFront = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.052, 0.012), steelMat);
    guardFront.position.set(0, y - 0.026, z - 0.036);
    const trigger = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.036, 0.014), chromeMat);
    trigger.position.set(0, y - 0.02, z - 0.005);
    trigger.rotation.x = 0.32;
    gun.add(guardBottom, guardFront, trigger);
  };

  if (gunId === 'smg') {
    // Realistic Striker-9 Tactical SMG (MP5-SD / Vector Inspired)
    const upper = new THREE.Mesh(new THREE.BoxGeometry(0.078, 0.088, 0.34), primaryMat);
    upper.position.set(0, 0.022, -0.14);
    const lower = new THREE.Mesh(new THREE.BoxGeometry(0.068, 0.048, 0.25), polymerMat);
    lower.position.set(0, -0.042, -0.11);
    const boltPlate = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.028, 0.065), chromeMat);
    boltPlate.position.set(0.038, 0.032, -0.15);
    gun.add(upper, lower, boltPlate);

    addPicatinnyRail(0.068, 0.01, 8, 0.038);
    addTriggerAssembly(-0.042, -0.065);

    // Ergonomic Knurled Pistol Grip
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.052, 0.135, 0.064), polymerMat);
    grip.position.set(0, -0.112, 0.005);
    grip.rotation.x = -0.26;
    gun.add(grip);

    // Ribbed Cylindrical Integral Suppressor & Barrel Shroud
    const shroud = makeCylZ(0.042, 0.042, 0.15, polymerMat, 12);
    shroud.position.set(0, 0.018, -0.37);
    const suppressor = makeCylZ(0.036, 0.036, 0.24, gunmetalDarkMat, 14);
    suppressor.position.set(0, 0.018, -0.55);
    const supCollar = makeCylZ(0.04, 0.04, 0.025, steelMat, 14);
    supCollar.position.set(0, 0.018, -0.44);
    const boreTip = makeCylZ(0.02, 0.02, 0.018, polymerMat, 10);
    boreTip.position.set(0, 0.018, -0.668);
    gun.add(shroud, suppressor, supCollar, boreTip);

    // Vertical Foregrip
    const vfg = makeCylZ(0.02, 0.022, 0.095, polymerMat, 10);
    vfg.rotation.x = Math.PI / 2;
    vfg.position.set(0, -0.068, -0.36);
    gun.add(vfg);

    // Curved 36rd Stick Magazine
    const magTop = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.11, 0.052), steelMat);
    magTop.position.set(0, -0.105, -0.2);
    magTop.rotation.x = 0.12;
    const magBot = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.12, 0.05), steelMat);
    magBot.position.set(0, -0.205, -0.225);
    magBot.rotation.x = 0.25;
    const magPad = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.02, 0.056), polymerMat);
    magPad.position.set(0, -0.264, -0.242);
    magPad.rotation.x = 0.25;
    gun.add(magTop, magBot, magPad);

    // Folding Wire Stock & Rubber Buttpad
    const stockTop = makeCylZ(0.012, 0.012, 0.18, steelMat, 8);
    stockTop.position.set(0.022, 0.028, 0.11);
    const stockBot = makeCylZ(0.012, 0.012, 0.18, steelMat, 8);
    stockBot.position.set(-0.022, -0.012, 0.11);
    const buttPad = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.115, 0.028), polymerMat);
    buttPad.position.set(0, -0.005, 0.2);
    gun.add(stockTop, stockBot, buttPad);

    // Compact Micro Reflex Optic
    const opticMount = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.022, 0.065), gunmetalDarkMat);
    opticMount.position.set(0, 0.084, -0.13);
    const opticRing = makeCylZ(0.028, 0.028, 0.055, steelMat, 12);
    opticRing.position.set(0, 0.112, -0.13);
    const opticLens = makeCylZ(0.022, 0.022, 0.058, glassMat, 12);
    opticLens.position.set(0, 0.112, -0.13);
    gun.add(opticMount, opticRing, opticLens);

    const muzzleNode = new THREE.Object3D();
    muzzleNode.position.set(0, 0.018, -0.68);
    gun.add(muzzleNode);
    gun.userData.muzzleNode = muzzleNode;
    gun.userData.muzzleZ = -0.68;
    gun.userData.muzzleY = 0.018;
    return gun;
  }

  if (gunId === 'shotgun') {
    // Realistic Breacher-12 Tactical Pump Shotgun (M870 / M1014 Style)
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.092, 0.105, 0.36), primaryMat);
    receiver.position.set(0, 0.012, -0.12);
    const ejectionPort = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.032, 0.085), chromeMat);
    ejectionPort.position.set(0.044, 0.025, -0.11);
    gun.add(receiver, ejectionPort);

    // Side-saddle 12-gauge shells (4 realistic brass-base red shells)
    for (let i = 0; i < 4; i++) {
      const sz = -0.05 - i * 0.042;
      const shellBody = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.055, 8), shellRedMat);
      shellBody.position.set(-0.052, 0.01, sz);
      const shellBrass = new THREE.Mesh(new THREE.CylinderGeometry(0.0115, 0.0115, 0.016, 8), brassMat);
      shellBrass.position.set(-0.052, -0.02, sz);
      gun.add(shellBody, shellBrass);
    }

    addPicatinnyRail(0.068, 0.02, 7, 0.042);
    addTriggerAssembly(-0.048, 0.01);

    // Ergonomic Stock & Grip
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.062, 0.13, 0.075), polymerMat);
    grip.position.set(0, -0.105, 0.065);
    grip.rotation.x = -0.34;
    const stockNeck = new THREE.Mesh(new THREE.BoxGeometry(0.068, 0.088, 0.24), polymerMat);
    stockNeck.position.set(0, -0.02, 0.18);
    stockNeck.rotation.x = -0.08;
    const buttPad = new THREE.Mesh(new THREE.BoxGeometry(0.074, 0.135, 0.032), gunmetalDarkMat);
    buttPad.position.set(0, -0.035, 0.3);
    gun.add(grip, stockNeck, buttPad);

    // Cylindrical Steel Barrel + Under-Barrel Magazine Tube + Clamp
    const barrel = makeCylZ(0.026, 0.028, 0.56, steelMat, 12);
    barrel.position.set(0, 0.038, -0.57);
    const choke = makeCylZ(0.031, 0.028, 0.05, gunmetalDarkMat, 12);
    choke.position.set(0, 0.038, -0.855);
    const tubeMag = makeCylZ(0.022, 0.022, 0.49, gunmetalDarkMat, 12);
    tubeMag.position.set(0, -0.014, -0.53);
    const barrelClamp = new THREE.Mesh(new THREE.BoxGeometry(0.056, 0.082, 0.032), steelMat);
    barrelClamp.position.set(0, 0.012, -0.74);
    const frontBead = new THREE.Mesh(new THREE.SphereGeometry(0.01, 8, 8), brassMat);
    frontBead.position.set(0, 0.068, -0.84);
    gun.add(barrel, choke, tubeMag, barrelClamp, frontBead);

    // Ribbed Pump Forend
    const pumpCore = makeCylZ(0.042, 0.042, 0.21, polymerMat, 10);
    pumpCore.position.set(0, -0.016, -0.46);
    gun.add(pumpCore);
    for (let r = 0; r < 5; r++) {
      const rib = makeCylZ(0.046, 0.046, 0.014, gunmetalDarkMat, 10);
      rib.position.set(0, -0.016, -0.38 - r * 0.038);
      gun.add(rib);
    }

    // Rear Ghost-Ring Sight
    const ghostBase = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.022, 0.04), steelMat);
    ghostBase.position.set(0, 0.082, -0.02);
    const ghostRing = makeCylZ(0.018, 0.018, 0.018, steelMat, 10);
    ghostRing.position.set(0, 0.098, -0.02);
    gun.add(ghostBase, ghostRing);

    const muzzleNode = new THREE.Object3D();
    muzzleNode.position.set(0, 0.038, -0.885);
    gun.add(muzzleNode);
    gun.userData.muzzleNode = muzzleNode;
    gun.userData.muzzleZ = -0.885;
    gun.userData.muzzleY = 0.038;
    return gun;
  }

  if (gunId === 'sniper') {
    // Realistic Valkyrie .50 Precision Bolt-Action Sniper (AWM / M200 Inspired)
    const chassis = new THREE.Mesh(new THREE.BoxGeometry(0.088, 0.098, 0.46), primaryMat);
    chassis.position.set(0, 0.008, -0.14);
    const upperReceiver = new THREE.Mesh(new THREE.BoxGeometry(0.076, 0.056, 0.34), steelMat);
    upperReceiver.position.set(0, 0.055, -0.12);
    const boltBody = makeCylZ(0.018, 0.018, 0.14, chromeMat, 10);
    boltBody.position.set(0.018, 0.058, -0.11);
    const boltStem = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.014, 0.014), chromeMat);
    boltStem.position.set(0.052, 0.048, -0.06);
    boltStem.rotation.z = -0.45;
    const boltKnob = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 8), steelMat);
    boltKnob.position.set(0.076, 0.032, -0.06);
    gun.add(chassis, upperReceiver, boltBody, boltStem, boltKnob);

    addPicatinnyRail(0.085, 0.04, 10, 0.038);
    addTriggerAssembly(-0.048, -0.025);

    // Precision Adjustable Stock + Cheek Riser + Buttpad
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.056, 0.135, 0.07), polymerMat);
    grip.position.set(0, -0.11, 0.045);
    grip.rotation.x = -0.25;
    const stockBeam = new THREE.Mesh(new THREE.BoxGeometry(0.066, 0.072, 0.29), primaryMat);
    stockBeam.position.set(0, 0.002, 0.22);
    const stockStrut = new THREE.Mesh(new THREE.BoxGeometry(0.046, 0.03, 0.22), steelMat);
    stockStrut.position.set(0, -0.055, 0.22);
    stockStrut.rotation.x = 0.2;
    const cheekRiser = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.034, 0.14), polymerMat);
    cheekRiser.position.set(0, 0.052, 0.22);
    const buttPad = new THREE.Mesh(new THREE.BoxGeometry(0.074, 0.138, 0.032), gunmetalDarkMat);
    buttPad.position.set(0, -0.022, 0.365);
    gun.add(grip, stockBeam, stockStrut, cheekRiser, buttPad);

    // Detachable .50 Cal Box Magazine
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.056, 0.115, 0.118), gunmetalDarkMat);
    mag.position.set(0, -0.095, -0.18);
    const magBase = new THREE.Mesh(new THREE.BoxGeometry(0.062, 0.018, 0.124), steelMat);
    magBase.position.set(0, -0.155, -0.18);
    gun.add(mag, magBase);

    // Vented Handguard + Free-Floated Fluted Steel Barrel + Heavy Muzzle Brake
    const handguard = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.076, 0.28), primaryMat);
    handguard.position.set(0, 0.024, -0.5);
    const barrel = makeCylZ(0.022, 0.026, 0.68, steelMat, 12);
    barrel.position.set(0, 0.036, -0.72);
    const brakeBody = new THREE.Mesh(new THREE.BoxGeometry(0.072, 0.052, 0.115), gunmetalDarkMat);
    brakeBody.position.set(0, 0.036, -1.07);
    const brakePort = new THREE.Mesh(new THREE.BoxGeometry(0.076, 0.02, 0.03), steelMat);
    brakePort.position.set(0, 0.036, -1.06);
    gun.add(handguard, barrel, brakeBody, brakePort);

    // Folding Front Bipod Legs
    const bipodMount = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.03, 0.05), steelMat);
    bipodMount.position.set(0, -0.025, -0.61);
    const legL = makeCylZ(0.012, 0.01, 0.18, steelMat, 8);
    legL.position.set(-0.045, -0.09, -0.65);
    legL.rotation.set(0.45, 0, 0.35);
    const legR = makeCylZ(0.012, 0.01, 0.18, steelMat, 8);
    legR.position.set(0.045, -0.09, -0.65);
    legR.rotation.set(0.45, 0, -0.35);
    gun.add(bipodMount, legL, legR);

    // Cylindrical Telescopic Sniper Scope (Rings, Tube, Bells, Turrets, Glass)
    const ring1 = new THREE.Mesh(new THREE.BoxGeometry(0.054, 0.048, 0.032), gunmetalDarkMat);
    ring1.position.set(0, 0.115, -0.07);
    const ring2 = new THREE.Mesh(new THREE.BoxGeometry(0.054, 0.048, 0.032), gunmetalDarkMat);
    ring2.position.set(0, 0.115, -0.22);
    const scopeTube = makeCylZ(0.024, 0.024, 0.24, gunmetalDarkMat, 14);
    scopeTube.position.set(0, 0.148, -0.14);
    const scopeObj = makeCylZ(0.039, 0.028, 0.11, gunmetalDarkMat, 14);
    scopeObj.position.set(0, 0.148, -0.3);
    const scopeEye = makeCylZ(0.03, 0.025, 0.08, gunmetalDarkMat, 14);
    scopeEye.position.set(0, 0.148, 0.005);
    const frontGlass = makeCylZ(0.034, 0.034, 0.012, glassMat, 14);
    frontGlass.position.set(0, 0.148, -0.354);
    const rearGlass = makeCylZ(0.024, 0.024, 0.012, glassMat, 14);
    rearGlass.position.set(0, 0.148, 0.044);
    const topTurret = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.028, 10), steelMat);
    topTurret.position.set(0, 0.178, -0.145);
    const sideTurret = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.024, 10), steelMat);
    sideTurret.rotation.z = Math.PI / 2;
    sideTurret.position.set(0.03, 0.148, -0.145);
    gun.add(ring1, ring2, scopeTube, scopeObj, scopeEye, frontGlass, rearGlass, topTurret, sideTurret);

    const muzzleNode = new THREE.Object3D();
    muzzleNode.position.set(0, 0.036, -1.135);
    gun.add(muzzleNode);
    gun.userData.muzzleNode = muzzleNode;
    gun.userData.muzzleZ = -1.135;
    gun.userData.muzzleY = 0.036;
    return gun;
  }

  // Default: Realistic VX-47 Auto Rifle (AK-47 / M4 Tactical Carbine)
  const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.084, 0.095, 0.4), primaryMat);
  receiver.position.set(0, 0.014, -0.14);
  const lowerFrame = new THREE.Mesh(new THREE.BoxGeometry(0.074, 0.044, 0.3), polymerMat);
  lowerFrame.position.set(0, -0.048, -0.1);
  const ejectionPort = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.03, 0.075), chromeMat);
  ejectionPort.position.set(0.04, 0.028, -0.13);
  const chargeHandle = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.015, 0.024), steelMat);
  chargeHandle.position.set(0.05, 0.024, -0.09);
  gun.add(receiver, lowerFrame, ejectionPort, chargeHandle);

  addPicatinnyRail(0.064, 0.03, 11, 0.038);
  addTriggerAssembly(-0.048, -0.055);

  // Pistol Grip
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.054, 0.135, 0.068), polymerMat);
  grip.position.set(0, -0.118, 0.015);
  grip.rotation.x = -0.26;
  gun.add(grip);

  // Vented Handguard + Gas Tube + Cylindrical Steel Barrel + Flash Hider
  const handguard = new THREE.Mesh(new THREE.BoxGeometry(0.078, 0.082, 0.26), primaryMat);
  handguard.position.set(0, 0.018, -0.45);
  const gasTube = makeCylZ(0.015, 0.015, 0.28, steelMat, 10);
  gasTube.position.set(0, 0.048, -0.48);
  const barrel = makeCylZ(0.02, 0.022, 0.34, steelMat, 12);
  barrel.position.set(0, 0.018, -0.66);
  const frontSight = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.058, 0.032), gunmetalDarkMat);
  frontSight.position.set(0, 0.055, -0.71);
  const muzzleBrake = makeCylZ(0.026, 0.024, 0.075, gunmetalDarkMat, 12);
  muzzleBrake.position.set(0, 0.018, -0.84);
  gun.add(handguard, gasTube, barrel, frontSight, muzzleBrake);

  // Tactical Adjustable Stock & Buffer Tube
  const bufferTube = makeCylZ(0.024, 0.024, 0.22, steelMat, 10);
  bufferTube.position.set(0, 0.015, 0.15);
  const stockBody = new THREE.Mesh(new THREE.BoxGeometry(0.068, 0.108, 0.19), polymerMat);
  stockBody.position.set(0, -0.014, 0.19);
  const buttPad = new THREE.Mesh(new THREE.BoxGeometry(0.072, 0.128, 0.028), gunmetalDarkMat);
  buttPad.position.set(0, -0.02, 0.285);
  gun.add(bufferTube, stockBody, buttPad);

  // Curved 30rd Banana Magazine
  const magTop = new THREE.Mesh(new THREE.BoxGeometry(0.052, 0.1, 0.078), gunmetalDarkMat);
  magTop.position.set(0, -0.105, -0.195);
  magTop.rotation.x = 0.14;
  const magBot = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.1, 0.074), gunmetalDarkMat);
  magBot.position.set(0, -0.185, -0.222);
  magBot.rotation.x = 0.34;
  const magPad = new THREE.Mesh(new THREE.BoxGeometry(0.056, 0.018, 0.08), steelMat);
  magPad.position.set(0, -0.23, -0.238);
  magPad.rotation.x = 0.34;
  gun.add(magTop, magBot, magPad);

  // Compact Holographic / Red-Dot Sight
  const opticBase = new THREE.Mesh(new THREE.BoxGeometry(0.056, 0.022, 0.088), gunmetalDarkMat);
  opticBase.position.set(0, 0.082, -0.13);
  const opticHood = new THREE.Mesh(new THREE.BoxGeometry(0.056, 0.05, 0.068), steelMat);
  opticHood.position.set(0, 0.114, -0.13);
  const opticGlass = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.034, 0.072), glassMat);
  opticGlass.position.set(0, 0.114, -0.13);
  gun.add(opticBase, opticHood, opticGlass);

  const muzzleNode = new THREE.Object3D();
  muzzleNode.position.set(0, 0.018, -0.885);
  gun.add(muzzleNode);
  gun.userData.muzzleNode = muzzleNode;
  gun.userData.muzzleZ = -0.885;
  gun.userData.muzzleY = 0.018;
  return gun;
}

export function createRifleGroup(gunSkin: GunSkinDef = GUN_SKINS[0]): THREE.Group {
  return createGunGroup('rifle', gunSkin);
}

export function createPickaxeGroup(): THREE.Group {
  const pickaxe = new THREE.Group();
  const handleMat = new THREE.MeshStandardMaterial({ color: '#9a5b2d', roughness: 0.78, metalness: 0.08 });
  const gripMat = new THREE.MeshStandardMaterial({ color: '#1e293b', roughness: 0.45, metalness: 0.55 });
  const steelMat = new THREE.MeshStandardMaterial({ color: '#94a3b8', roughness: 0.25, metalness: 0.85 });
  const tipMat = new THREE.MeshStandardMaterial({
    color: '#22d3ee',
    emissive: '#0891b2',
    emissiveIntensity: 0.38,
    roughness: 0.18,
    metalness: 0.78,
  });

  // Pommel Cap & Lower Grip
  const pommel = new THREE.Mesh(new THREE.BoxGeometry(0.072, 0.045, 0.072), steelMat);
  pommel.position.set(0, -0.18, 0);
  const lowerWrap = new THREE.Mesh(new THREE.BoxGeometry(0.064, 0.14, 0.064), gripMat);
  lowerWrap.position.set(0, -0.09, 0);
  pickaxe.add(pommel, lowerWrap);

  // Hardwood Timber Shaft
  const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.052, 0.7, 0.052), handleMat);
  shaft.position.set(0, 0.17, 0);
  pickaxe.add(shaft);

  // Steel Socket Collar & Mounting Crown
  const collar = new THREE.Mesh(new THREE.BoxGeometry(0.096, 0.105, 0.096), steelMat);
  collar.position.set(0, 0.48, 0);
  const topCap = new THREE.Mesh(new THREE.BoxGeometry(0.068, 0.045, 0.068), gripMat);
  topCap.position.set(0, 0.545, 0);
  pickaxe.add(collar, topCap);

  // Arched Pickaxe Head — Central Bridge
  const centerBridge = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.085, 0.24), steelMat);
  centerBridge.position.set(0, 0.49, 0);
  pickaxe.add(centerBridge);

  // Forward Curved Pick Arm & Sharp Point (aimed forward -Z)
  const fwdMid = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.068, 0.17), steelMat);
  fwdMid.position.set(0, 0.465, -0.17);
  fwdMid.rotation.x = 0.26;
  const fwdTip = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.046, 0.14), tipMat);
  fwdTip.position.set(0, 0.415, -0.295);
  fwdTip.rotation.x = 0.48;
  const fwdSpike = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.026, 0.06), tipMat);
  fwdSpike.position.set(0, 0.37, -0.37);
  fwdSpike.rotation.x = 0.58;
  pickaxe.add(fwdMid, fwdTip, fwdSpike);

  // Rear Curved Pick Arm & Sharp Point (+Z)
  const backMid = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.068, 0.16), steelMat);
  backMid.position.set(0, 0.465, 0.16);
  backMid.rotation.x = -0.26;
  const backTip = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.044, 0.12), tipMat);
  backTip.position.set(0, 0.42, 0.27);
  backTip.rotation.x = -0.45;
  pickaxe.add(backMid, backTip);

  return pickaxe;
}

export function createVoxelCharacter(
  username: string,
  skin: SkinDef,
  gunSkin: GunSkinDef = GUN_SKINS[0],
  clanTag?: string,
  clanName?: string,
  isMod?: boolean,
  team?: TeamSide
): CharacterRig {
  const group = new THREE.Group();
  const { faceTex, torsoTex } = createCharacterTextures(skin);

  const suitMat = new THREE.MeshStandardMaterial({
    color: team === 'red' ? '#dc2626' : team === 'blue' ? '#2563eb' : skin.bodyColor,
    roughness: 0.75,
    metalness: 0.08,
  });
  const torsoMat = new THREE.MeshStandardMaterial({ map: torsoTex, roughness: 0.68, metalness: 0.15 });
  const armorMat = new THREE.MeshStandardMaterial({ color: skin.accentColor, roughness: 0.45, metalness: 0.35 });
  const pantsMat = new THREE.MeshStandardMaterial({ color: skin.pantsColor, roughness: 0.82, metalness: 0.05 });
  const hairMat = new THREE.MeshStandardMaterial({
    color: skin.style === 'hood' || skin.style === 'ninja' || skin.style === 'parka' ? skin.bodyColor : skin.hairColor,
    roughness: 0.85,
  });
  const faceFrontMat = new THREE.MeshStandardMaterial({ map: faceTex, roughness: 0.82, metalness: 0.0 });
  const visorMat = new THREE.MeshStandardMaterial({
    color: team === 'red' ? '#fca5a5' : team === 'blue' ? '#93c5fd' : skin.visorColor,
    emissive: team === 'red' ? '#ef4444' : team === 'blue' ? '#3b82f6' : skin.visorColor,
    emissiveIntensity: 0.45,
    roughness: 0.18,
    metalness: 0.7,
  });

  // Legs (pivot at hip y = 0.68)
  const leftLeg = new THREE.Group();
  leftLeg.position.set(-0.135, 0.68, 0);
  const lLegMesh = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.5, 0.24), pantsMat);
  lLegMesh.position.y = -0.25;
  const lKnee = new THREE.Mesh(new THREE.BoxGeometry(0.235, 0.11, 0.255), armorMat);
  lKnee.position.y = -0.24;
  const lBoot = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.18, 0.28), armorMat);
  lBoot.position.set(0, -0.59, -0.015);
  leftLeg.add(lLegMesh, lKnee, lBoot);

  const rightLeg = new THREE.Group();
  rightLeg.position.set(0.135, 0.68, 0);
  const rLegMesh = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.5, 0.24), pantsMat);
  rLegMesh.position.y = -0.25;
  const rKnee = new THREE.Mesh(new THREE.BoxGeometry(0.235, 0.11, 0.255), armorMat);
  rKnee.position.y = -0.24;
  const rBoot = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.18, 0.28), armorMat);
  rBoot.position.set(0, -0.59, -0.015);
  rightLeg.add(rLegMesh, rKnee, rBoot);

  // Torso (textured front/back chest rig + tactical backpack)
  const torsoMaterials = [suitMat, suitMat, suitMat, armorMat, torsoMat, torsoMat];
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.64, 0.28), torsoMaterials);
  torso.position.set(0, 1.0, 0);

  const pack = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.42, 0.15), armorMat);
  pack.position.set(0, 1.04, 0.2);
  const packTrim = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.08, 0.03), visorMat);
  packTrim.position.set(0, 1.12, 0.28);

  const carrierFlagRed = createCtfFlagPole('red', false);
  carrierFlagRed.position.set(0, 1.08, 0.28);
  carrierFlagRed.rotation.x = 0.22;
  carrierFlagRed.visible = false;

  const carrierFlagBlue = createCtfFlagPole('blue', false);
  carrierFlagBlue.position.set(0, 1.08, 0.28);
  carrierFlagBlue.rotation.x = 0.22;
  carrierFlagBlue.visible = false;

  // Head
  const head = new THREE.Group();
  head.position.set(0, 1.32, 0);
  const headMaterials = [hairMat, hairMat, hairMat, hairMat, hairMat, faceFrontMat];
  const headCube = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.42), headMaterials);
  headCube.position.y = 0.21;
  head.add(headCube);

  if (skin.style === 'helmet' || skin.style === 'visor') {
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.14, 0.46), suitMat);
    cap.position.y = 0.37;
    head.add(cap);
    if (skin.style === 'visor') {
      const goggleStrap = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.08, 0.45), armorMat);
      goggleStrap.position.y = 0.34;
      const goggleLens = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.08, 0.05), visorMat);
      goggleLens.position.set(0, 0.35, -0.22);
      head.add(goggleStrap, goggleLens);
    } else {
      const visorBand = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.1, 0.05), visorMat);
      visorBand.position.set(0, 0.24, -0.21);
      head.add(visorBand);
    }
  } else if (skin.style === 'knight') {
    const helmRim = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.14, 0.46), armorMat);
    helmRim.position.y = 0.37;
    const crest = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.16, 0.36), visorMat);
    crest.position.y = 0.46;
    head.add(helmRim, crest);
  } else if (skin.style === 'parka') {
    const furTrim = new THREE.Mesh(new THREE.BoxGeometry(0.47, 0.12, 0.47), suitMat);
    furTrim.position.y = 0.38;
    head.add(furTrim);
  }

  // Arms (pivot at shoulder y = 1.24)
  const handMat = new THREE.MeshStandardMaterial({ color: skin.skinTone, roughness: 0.85 });
  const leftArm = new THREE.Group();
  leftArm.position.set(-0.365, 1.24, 0);
  const lPauldron = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.2, 0.26), armorMat);
  lPauldron.position.y = -0.06;
  const lArmMesh = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.36, 0.2), suitMat);
  lArmMesh.position.y = -0.28;
  const lHand = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.13, 0.19), skin.style === 'ninja' ? armorMat : handMat);
  lHand.position.y = -0.5;
  leftArm.add(lPauldron, lArmMesh, lHand);

  const rightArm = new THREE.Group();
  rightArm.position.set(0.365, 1.24, 0);
  const rPauldron = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.2, 0.26), armorMat);
  rPauldron.position.y = -0.06;
  const rArmMesh = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.36, 0.2), suitMat);
  rArmMesh.position.y = -0.28;
  const rHand = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.13, 0.19), skin.style === 'ninja' ? armorMat : handMat);
  rHand.position.y = -0.5;

  const gunMeshes: Record<string, THREE.Group> = {
    rifle: createGunGroup('rifle', gunSkin),
    smg: createGunGroup('smg', gunSkin),
    shotgun: createGunGroup('shotgun', gunSkin),
    sniper: createGunGroup('sniper', gunSkin),
  };
  for (const [gid, gm] of Object.entries(gunMeshes)) {
    gm.position.set(-0.14, -0.44, -0.18);
    gm.rotation.y = 0.08;
    gm.visible = gid === 'rifle';
    rightArm.add(gm);
  }

  const pickaxeMesh = createPickaxeGroup();
  pickaxeMesh.position.set(0, -0.48, -0.18);
  pickaxeMesh.rotation.x = Math.PI * 0.25;
  pickaxeMesh.visible = false;

  rightArm.add(rPauldron, rArmMesh, rHand, pickaxeMesh);

  // Nameplate Sprite
  const nameTex = createNameplateTexture(username, clanName, isMod, team);
  const nameSprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: nameTex, transparent: true, depthTest: false })
  );
  nameSprite.scale.set(2.05, 0.36, 1);
  nameSprite.position.set(0, 2.12, 0);

  // Health Bar above head
  const hpBg = new THREE.Mesh(
    new THREE.PlaneGeometry(0.76, 0.08),
    new THREE.MeshBasicMaterial({ color: '#0f172a', side: THREE.DoubleSide })
  );
  hpBg.position.set(0, 1.88, 0);
  const hpBarFill = new THREE.Mesh(
    new THREE.PlaneGeometry(0.72, 0.05),
    new THREE.MeshBasicMaterial({ color: '#22c55e', side: THREE.DoubleSide })
  );
  hpBarFill.position.set(0, 1.88, 0.005);

  group.add(
    leftLeg,
    rightLeg,
    torso,
    pack,
    packTrim,
    carrierFlagRed,
    carrierFlagBlue,
    head,
    leftArm,
    rightArm,
    nameSprite,
    hpBg,
    hpBarFill
  );

  group.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });

  return {
    group,
    torso,
    pack,
    packTrim,
    head,
    leftArm,
    rightArm,
    leftLeg,
    rightLeg,
    rifleMesh: gunMeshes.rifle,
    gunMeshes,
    pickaxeMesh,
    carrierFlagRed,
    carrierFlagBlue,
    hpBg,
    hpBarFill,
    nameSprite,
    skinId: skin.id,
    gunSkinId: gunSkin.id,
    clanTag,
    clanName,
    isMod,
    team,
  };
}

export function setCharacterCrouchPose(rig: CharacterRig, crouching: boolean, dt: number): void {
  const drop = crouching ? -0.34 : 0;
  rig.torso.position.y = THREE.MathUtils.damp(rig.torso.position.y, 1.0 + drop, 14, dt);
  rig.torso.rotation.x = THREE.MathUtils.damp(rig.torso.rotation.x, crouching ? 0.22 : 0, 14, dt);
  rig.pack.position.y = THREE.MathUtils.damp(rig.pack.position.y, 1.04 + drop, 14, dt);
  rig.pack.position.z = THREE.MathUtils.damp(rig.pack.position.z, crouching ? 0.25 : 0.2, 14, dt);
  rig.packTrim.position.y = THREE.MathUtils.damp(rig.packTrim.position.y, 1.12 + drop, 14, dt);
  rig.packTrim.position.z = THREE.MathUtils.damp(rig.packTrim.position.z, crouching ? 0.33 : 0.28, 14, dt);
  rig.head.position.y = THREE.MathUtils.damp(rig.head.position.y, 1.32 + drop, 14, dt);
  rig.leftArm.position.y = THREE.MathUtils.damp(rig.leftArm.position.y, 1.24 + drop, 14, dt);
  rig.rightArm.position.y = THREE.MathUtils.damp(rig.rightArm.position.y, 1.24 + drop, 14, dt);
  rig.leftLeg.position.y = THREE.MathUtils.damp(rig.leftLeg.position.y, 0.68 + drop * 0.55, 14, dt);
  rig.rightLeg.position.y = THREE.MathUtils.damp(rig.rightLeg.position.y, 0.68 + drop * 0.55, 14, dt);
  rig.hpBg.position.y = THREE.MathUtils.damp(rig.hpBg.position.y, 1.88 + drop, 14, dt);
  rig.hpBarFill.position.y = THREE.MathUtils.damp(rig.hpBarFill.position.y, 1.88 + drop, 14, dt);
  rig.nameSprite.position.y = THREE.MathUtils.damp(rig.nameSprite.position.y, 2.12 + drop, 14, dt);
}

export interface ViewModelRig {
  root: THREE.Group;
  leftArmGroup: THREE.Group;
  rifle: THREE.Group;
  gunMeshes: Record<string, THREE.Group>;
  pickaxe: THREE.Group;
  blockMesh: THREE.Mesh;
  medkit: THREE.Group;
  muzzleFlash: THREE.Mesh;
}

export function createFirstPersonViewModel(
  skin: SkinDef,
  gunSkin: GunSkinDef = GUN_SKINS[0]
): ViewModelRig {
  const root = new THREE.Group();
  root.position.set(0.32, -0.28, -0.48);

  const armMat = new THREE.MeshStandardMaterial({ color: skin.bodyColor, roughness: 0.72, metalness: 0.1 });
  const gloveMat = new THREE.MeshStandardMaterial({ color: skin.accentColor, roughness: 0.48, metalness: 0.32 });
  const cuffMat = new THREE.MeshStandardMaterial({ color: '#0f172a', roughness: 0.6, metalness: 0.2 });

  // Right Hand & Forearm gripping trigger/pistol grip
  const forearm = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.38), armMat);
  forearm.position.set(0.08, -0.09, 0.14);
  forearm.rotation.set(0.16, -0.18, 0);
  const rightWrist = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.13, 0.05), cuffMat);
  rightWrist.position.set(0.04, -0.06, -0.02);
  const glove = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.13, 0.12), gloveMat);
  glove.position.set(0.015, -0.075, -0.03);
  const rightThumb = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.045, 0.07), gloveMat);
  rightThumb.position.set(-0.04, -0.04, -0.05);
  root.add(forearm, rightWrist, glove, rightThumb);

  // Left Support Arm & Gloved Hand gripping the weapon handguard / foregrip (2 hands on gun)
  const leftArmGroup = new THREE.Group();
  const leftForearm = new THREE.Mesh(new THREE.BoxGeometry(0.115, 0.115, 0.46), armMat);
  leftForearm.position.set(-0.26, -0.11, -0.23);
  leftForearm.rotation.set(0.14, 0.62, -0.18);
  const leftCuff = new THREE.Mesh(new THREE.BoxGeometry(0.122, 0.122, 0.045), cuffMat);
  leftCuff.position.set(-0.095, -0.048, -0.37);
  leftCuff.rotation.set(0.12, 0.55, -0.15);
  const leftPalm = new THREE.Mesh(new THREE.BoxGeometry(0.125, 0.11, 0.13), gloveMat);
  leftPalm.position.set(-0.02, -0.03, -0.45);
  leftPalm.rotation.set(0.08, 0.25, 0.05);
  const leftFingers = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.09, 0.12), gloveMat);
  leftFingers.position.set(0.045, -0.025, -0.455);
  leftFingers.rotation.set(0.08, 0.15, -0.22);
  leftArmGroup.add(leftForearm, leftCuff, leftPalm, leftFingers);
  root.add(leftArmGroup);

  const gunMeshes: Record<string, THREE.Group> = {
    rifle: createGunGroup('rifle', gunSkin),
    smg: createGunGroup('smg', gunSkin),
    shotgun: createGunGroup('shotgun', gunSkin),
    sniper: createGunGroup('sniper', gunSkin),
  };
  for (const [gid, gm] of Object.entries(gunMeshes)) {
    gm.scale.setScalar(1.22);
    gm.position.set(0, 0.02, -0.04);
    gm.visible = gid === 'rifle';
    root.add(gm);
  }

  const muzzleFlash = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.09, 0),
    new THREE.MeshBasicMaterial({ color: '#fde047', transparent: true, opacity: 0.9 })
  );
  muzzleFlash.position.set(0, 0.04, -1.06);
  muzzleFlash.visible = false;
  root.add(muzzleFlash);

  const pickaxe = createPickaxeGroup();
  pickaxe.scale.setScalar(1.1);
  pickaxe.position.set(0.02, -0.08, -0.12);
  pickaxe.rotation.set(0.2, 0.18, 0.12);
  pickaxe.visible = false;

  const blockMesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.24, 0.24, 0.24),
    new THREE.MeshStandardMaterial({ color: '#8b5a3c', roughness: 0.85, metalness: 0.05 })
  );
  blockMesh.position.set(0.02, 0.02, -0.14);
  blockMesh.rotation.set(0.2, -0.4, 0.1);
  blockMesh.visible = false;

  const medkit = new THREE.Group();
  const medBox = new THREE.Mesh(
    new THREE.BoxGeometry(0.22, 0.16, 0.24),
    new THREE.MeshStandardMaterial({ color: '#f8fafc', roughness: 0.4, metalness: 0.1 })
  );
  const cross1 = new THREE.Mesh(
    new THREE.BoxGeometry(0.12, 0.04, 0.04),
    new THREE.MeshStandardMaterial({ color: '#ef4444', roughness: 0.4 })
  );
  cross1.position.set(0, 0.085, 0);
  const cross2 = new THREE.Mesh(
    new THREE.BoxGeometry(0.04, 0.04, 0.12),
    new THREE.MeshStandardMaterial({ color: '#ef4444', roughness: 0.4 })
  );
  cross2.position.set(0, 0.085, 0);
  medkit.add(medBox, cross1, cross2);
  medkit.position.set(0, 0, -0.14);
  medkit.visible = false;

  root.add(pickaxe, blockMesh, medkit);
  return { root, leftArmGroup, rifle: gunMeshes.rifle, gunMeshes, pickaxe, blockMesh, medkit, muzzleFlash };
}

export function createHomeDiorama(
  skin: SkinDef,
  gunSkin: GunSkinDef = GUN_SKINS[0]
): {
  group: THREE.Group;
  hero: CharacterRig;
  clouds: THREE.Group;
  crystalCluster: THREE.Group;
} {
  const group = new THREE.Group();

  const grassMat = new THREE.MeshStandardMaterial({ color: '#78bd40', roughness: 0.85 });
  const dirtMat = new THREE.MeshStandardMaterial({ color: '#866043', roughness: 0.9 });
  const stoneMat = new THREE.MeshStandardMaterial({ color: '#7f838a', roughness: 0.78 });
  const woodMat = new THREE.MeshStandardMaterial({ color: '#6b5130', roughness: 0.85 });
  const leafMat = new THREE.MeshStandardMaterial({ color: '#3e942a', roughness: 0.8 });
  const plankMat = new THREE.MeshStandardMaterial({ color: '#b88b50', roughness: 0.75 });
  const sandMat = new THREE.MeshStandardMaterial({ color: '#e6dc9f', roughness: 0.9 });
  const cactusMat = new THREE.MeshStandardMaterial({ color: '#42962a', roughness: 0.85 });
  const waterMat = new THREE.MeshStandardMaterial({
    color: '#367ef5',
    transparent: true,
    opacity: 0.84,
    roughness: 0.18,
  });
  const lavaMat = new THREE.MeshStandardMaterial({
    color: '#fb923c',
    emissive: '#ea580c',
    emissiveIntensity: 0.95,
    roughness: 0.3,
  });
  const crystalMat = new THREE.MeshStandardMaterial({
    color: '#22d3ee',
    emissive: '#0891b2',
    emissiveIntensity: 0.75,
    roughness: 0.2,
    metalness: 0.4,
  });

  const blockGeo = new THREE.BoxGeometry(1, 1, 1);
  for (let x = -5; x <= 5; x++) {
    for (let z = -5; z <= 5; z++) {
      const dist = Math.hypot(x, z);
      if (dist > 5.4) continue;
      const isStream = x >= 2 && z >= 1 && z <= 3;
      const isLava = x <= -3 && z >= 1 && z <= 3;
      const isDesertPatch = x >= 1 && z >= -4 && z <= 0;
      const topH = isStream || isLava ? 0 : dist < 2.5 ? 1 : 0;
      const depth = Math.max(1, Math.round(4 - dist * 0.65));

      const topMat = isStream ? waterMat : isLava ? lavaMat : isDesertPatch ? sandMat : grassMat;
      const top = new THREE.Mesh(blockGeo, topMat);
      top.position.set(x, isStream || isLava ? -0.12 : topH, z);
      top.receiveShadow = true;
      top.castShadow = !isStream && !isLava;
      group.add(top);

      for (let d = 1; d <= depth; d++) {
        const sub = new THREE.Mesh(blockGeo, d >= depth ? stoneMat : isDesertPatch ? sandMat : dirtMat);
        sub.position.set(x, topH - d, z);
        sub.receiveShadow = true;
        group.add(sub);
      }
    }
  }

  // Stylized Voxel Tree on island left-back
  for (let y = 2; y <= 5; y++) {
    const trunk = new THREE.Mesh(blockGeo, woodMat);
    trunk.position.set(-2, y, -2);
    trunk.castShadow = true;
    group.add(trunk);
  }
  for (let lx = -3; lx <= -1; lx++) {
    for (let lz = -3; lz <= -1; lz++) {
      for (let ly = 5; ly <= 7; ly++) {
        if (ly === 7 && (lx !== -2 || lz !== -2)) continue;
        const leaf = new THREE.Mesh(blockGeo, leafMat);
        leaf.position.set(lx, ly, lz);
        leaf.castShadow = true;
        leaf.receiveShadow = true;
        group.add(leaf);
      }
    }
  }

  for (let cy = 1; cy <= 3; cy++) {
    const cactus = new THREE.Mesh(new THREE.BoxGeometry(0.84, 1, 0.84), cactusMat);
    cactus.position.set(4, cy, -2);
    cactus.castShadow = true;
    cactus.receiveShadow = true;
    group.add(cactus);
  }

  const crate = new THREE.Mesh(blockGeo, plankMat);
  crate.position.set(2, 1, -1);
  crate.castShadow = true;
  group.add(crate);

  const crate2 = new THREE.Mesh(blockGeo, plankMat);
  crate2.position.set(3, 1, -1);
  crate2.castShadow = true;
  group.add(crate2);

  const crystalCluster = new THREE.Group();
  crystalCluster.position.set(-2.2, 0.9, 2.4);
  const c1 = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.9, 0.45), crystalMat);
  c1.rotation.z = 0.15;
  const c2 = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.65, 0.35), crystalMat);
  c2.position.set(0.35, -0.1, -0.15);
  c2.rotation.z = -0.3;
  const c3 = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.55, 0.32), crystalMat);
  c3.position.set(-0.3, -0.15, 0.25);
  c3.rotation.x = 0.25;
  crystalCluster.add(c1, c2, c3);
  group.add(crystalCluster);

  const hero = createVoxelCharacter('Explorer', skin, gunSkin);
  hero.group.position.set(-0.3, 1.5, 0.8);
  hero.group.rotation.y = 0.42;
  hero.rightArm.rotation.set(Math.PI * 0.44, 0.12, -0.06);
  hero.leftArm.rotation.set(Math.PI * 0.46, 0.56, 0.28);
  hero.nameSprite.visible = false;
  hero.hpBg.visible = false;
  hero.hpBarFill.visible = false;
  group.add(hero.group);

  const clouds = new THREE.Group();
  const cloudMat = new THREE.MeshStandardMaterial({ color: '#f8fafc', roughness: 0.95 });
  const cloudOffsets: Array<[number, number, number, number]> = [
    [-6, 7.5, -5, 2.2],
    [5, 8.2, -6, 1.8],
    [1, 9.0, 5, 1.5],
  ];
  for (const [cx, cy, cz, scale] of cloudOffsets) {
    const cg = new THREE.Group();
    cg.position.set(cx, cy, cz);
    const m1 = new THREE.Mesh(new THREE.BoxGeometry(2.4 * scale, 0.65, 1.3 * scale), cloudMat);
    const m2 = new THREE.Mesh(new THREE.BoxGeometry(1.4 * scale, 0.55, 1.1 * scale), cloudMat);
    m2.position.set(0.3, 0.45, 0);
    cg.add(m1, m2);
    clouds.add(cg);
  }
  group.add(clouds);

  return { group, hero, clouds, crystalCluster };
}
