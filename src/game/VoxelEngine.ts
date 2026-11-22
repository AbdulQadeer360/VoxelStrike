import * as THREE from 'three';
import {
  BLOCK_META,
  BlockId,
  CHUNK_SIZE,
  CROUCH_EYE_HEIGHT,
  CROUCH_HEIGHT,
  CROUCH_SPEED,
  DEFAULT_KEYBINDINGS,
  EYE_HEIGHT,
  GRAVITY,
  GUNS,
  GUN_SKINS,
  ITEMS,
  JUMP_VELOCITY,
  MAX_REACH,
  PLAYER_HEIGHT,
  PLAYER_WIDTH,
  SKINS,
  SPRINT_SPEED,
  WALK_SPEED,
  WORLD_HEIGHT,
  type BlockType,
  type GameModeId,
  type GunSkinDef,
  type KeybindingsConfig,
  type SkinDef,
} from '../shared/constants.ts';
import type { BlockModEntry, FlagRuntimeState, PlayerPublicState, WorldDropState } from '../shared/protocol.ts';
import {
  CTF_FLAG_BASES,
  generateChunkDataForMode,
  getChunkKey,
  getModeBounds,
  isInsideModeWorld,
  localIndex,
  worldToChunk,
} from '../shared/worldGen.ts';
import { audioEngine } from './audio.ts';
import { buildChunkGeometryFast } from './chunkMesher.ts';
import {
  createCtfFlagPole,
  createFirstPersonViewModel,
  createHomeDiorama,
  createVoxelCharacter,
  setCharacterCrouchPose,
  type CharacterRig,
  type ViewModelRig,
} from './models.ts';
import { createBreakCrackTexture, createVoxelAtlasTexture } from './textures.ts';

// Pre-allocated math objects (zero GC in render loop)
const _vec3 = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();

export interface EngineSettings {
  fov: number;
  renderDistance: number;
  sensitivity: number;
}

export interface EngineCallbacks {
  onMoveSend: (state: {
    x: number;
    y: number;
    z: number;
    yaw: number;
    pitch: number;
    sprinting: boolean;
    crouching: boolean;
    heldItemId: string;
  }) => void;
  onRequestChunks: (chunks: Array<{ cx: number; cz: number }>) => void;
  onMineBlock: (x: number, y: number, z: number) => void;
  onPlaceBlock: (x: number, y: number, z: number, itemId: string) => void;
  onShoot: (origin: THREE.Vector3, dir: THREE.Vector3, gunId: string) => void;
  onReloadRequest: (gunId: string) => void;
  onUseMedkit: () => void;
  onHudTick: (hud: {
    x: number;
    y: number;
    z: number;
    yaw: number;
    stamina: number;
    crouching: boolean;
    scoped: boolean;
    targetBlockName: string | null;
    mineProgress: number;
    reloadProgress: number;
    pointerLocked: boolean;
    fps: number;
  }) => void;
  onPointerLockChange: (locked: boolean) => void;
}

interface ChunkEntry {
  cx: number;
  cz: number;
  data: Uint8Array;
  opaqueMesh: THREE.Mesh | null;
  waterMesh: THREE.Mesh | null;
  lavaMesh: THREE.Mesh | null;
  dirty: boolean;
  requestedDeltas: boolean;
}

interface ParticleCube {
  mesh: THREE.Mesh;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
}

interface TracerBeam {
  mesh: THREE.Mesh;
  life: number;
}

interface RemoteActor {
  rig: CharacterRig;
  targetX: number;
  targetY: number;
  targetZ: number;
  targetYaw: number;
  targetPitch: number;
  sprinting: boolean;
  crouching: boolean;
  heldItemId: string;
  walkPhase: number;
}

export class VoxelEngine {
  private container: HTMLElement;
  private callbacks: EngineCallbacks;
  private renderer: THREE.WebGLRenderer;
  private isSoftwareGl: boolean;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private sunLight: THREE.DirectionalLight;
  private atlasTexture: THREE.CanvasTexture;
  private chunkMaterial: THREE.MeshStandardMaterial;
  private waterMaterial: THREE.MeshStandardMaterial;
  private lavaMaterial: THREE.MeshStandardMaterial;

  private worldGroup = new THREE.Group();
  private worldClouds = new THREE.Group();
  private sunMesh: THREE.Mesh;
  private dioramaGroup: THREE.Group | null = null;
  private dioramaHero: CharacterRig | null = null;
  private dioramaClouds: THREE.Group | null = null;
  private dioramaCrystal: THREE.Group | null = null;

  private viewModel: ViewModelRig;
  private targetWireframe: THREE.LineSegments;
  private breakCrackTexture: THREE.CanvasTexture;
  private breakOverlayMesh: THREE.Mesh;
  private chunks = new Map<string, ChunkEntry>();
  private pendingChunkGenQueue: Array<{ cx: number; cz: number; distSq: number }> = [];
  private neededChunkKeys = new Set<string>();
  private lastChunkCx = Number.NaN;
  private lastChunkCz = Number.NaN;
  private remoteActors = new Map<string, RemoteActor>();
  private worldDrops = new Map<string, { mesh: THREE.Mesh; baseY: number; phase: number }>();
  private particles: ParticleCube[] = [];
  private tracers: TracerBeam[] = [];

  private mode: 'menu' | 'playing' = 'menu';
  private mapMode: GameModeId = 'survival';
  private ctfFlagRed: THREE.Group;
  private ctfFlagBlue: THREE.Group;
  private settings: EngineSettings = { fov: 75, renderDistance: 5, sensitivity: 0.0022 };
  private keybinds: KeybindingsConfig = { ...DEFAULT_KEYBINDINGS };
  private selfId = '';
  private currentSkin: SkinDef = SKINS[0];
  private currentGunSkin: GunSkinDef = GUN_SKINS[0];
  private pickaxeTier = 1;
  private alive = true;

  // Player kinematics
  private px = 0.5;
  private py = 25;
  private pz = 0.5;
  private vx = 0;
  private vy = 0;
  private vz = 0;
  private yaw = 0;
  private pitch = 0;
  private onGround = false;
  private crouching = false;
  private scoped = false;
  private currentEyeHeight = EYE_HEIGHT;
  private coyoteTimer = 0;
  private jumpBuffer = 0;
  private stamina = 100;
  private walkBob = 0;
  private bobBlend = 0;
  private recoilOffset = 0;
  private recoilPitch = 0;

  // Input state
  private keys = new Set<string>();
  private mouseDownLeft = false;
  private mouseDownRight = false;
  private touchMoveX = 0;
  private touchMoveY = 0;
  private touchSprint = false;
  private touchJumpQueued = false;
  private touchMining = false;
  private pointerLocked = false;

  // Held Item & Actions
  private heldItemId = 'rifle';
  private gunMags: Record<string, number> = { rifle: 30, smg: 36, shotgun: 8, sniper: 5 };
  private ammoReserve = 90;
  private lastShotAt = 0;
  private reloadingUntil = 0;
  private activeReloadMs = 1450;
  private muzzleFlashTimer = 0;
  private swingTimer = 0;

  // Block mining state
  private miningBlockKey = '';
  private miningElapsed = 0;
  private lastMineSoundAt = 0;
  private lastPlaceAt = 0;

  // Loop timers
  private frameId = 0;
  private lastTime = performance.now();
  private lastNetMoveAt = 0;
  private lastHudAt = 0;
  private fpsFrames = 0;
  private fpsWindowAt = performance.now();
  private currentFps = 60;
  private disposed = false;

  private particleGeo = new THREE.BoxGeometry(0.14, 0.14, 0.14);
  private particleMaterials = new Map<string, THREE.MeshStandardMaterial>();
  private dropGeo = new THREE.BoxGeometry(0.32, 0.32, 0.32);
  private dropMaterials = new Map<string, THREE.MeshStandardMaterial>();

  constructor(container: HTMLElement, callbacks: EngineCallbacks) {
    this.container = container;
    this.callbacks = callbacks;

    // Software WebGL detection
    this.isSoftwareGl = (() => {
      try {
        const probe = document.createElement('canvas').getContext('webgl2');
        if (!probe) return true;
        const ext = probe.getExtension('WEBGL_debug_renderer_info');
        const param = ext ? ext.UNMASKED_RENDERER_WEBGL : probe.RENDERER;
        const gpu = String(probe.getParameter(param));
        probe.getExtension('WEBGL_lose_context')?.loseContext();
        return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
      } catch {
        return true;
      }
    })();

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.setPixelRatio(this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(container.clientWidth || window.innerWidth, container.clientHeight || window.innerHeight);
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    const skyColor = new THREE.Color('#86b5ff');
    this.scene.background = skyColor;
    this.scene.fog = new THREE.Fog('#b5d6ff', 44, 118);

    this.camera = new THREE.PerspectiveCamera(
      this.settings.fov,
      (container.clientWidth || window.innerWidth) / (container.clientHeight || window.innerHeight),
      0.1,
      260
    );
    this.camera.rotation.order = 'YXZ';
    this.scene.add(this.camera);

    // Classic Crisp Minecraft Daylight Lighting Rig (no glossy PMREM wash-out)
    const hemi = new THREE.HemisphereLight('#d6ecff', '#5e503f', 0.95);
    this.scene.add(hemi);

    this.sunLight = new THREE.DirectionalLight('#fffef5', 1.25);
    this.sunLight.position.set(42, 68, 34);
    this.sunLight.castShadow = !this.isSoftwareGl;
    this.sunLight.shadow.mapSize.set(1024, 1024);
    const d = 32;
    this.sunLight.shadow.camera.left = -d;
    this.sunLight.shadow.camera.right = d;
    this.sunLight.shadow.camera.top = d;
    this.sunLight.shadow.camera.bottom = -d;
    this.sunLight.shadow.camera.near = 1;
    this.sunLight.shadow.camera.far = 150;
    this.sunLight.shadow.bias = -0.0005;
    this.sunLight.shadow.normalBias = 0.02;
    this.scene.add(this.sunLight);
    this.scene.add(this.sunLight.target);

    // Classic Blocky Square Minecraft Sun in the sky
    this.sunMesh = new THREE.Mesh(
      new THREE.BoxGeometry(11, 11, 1.2),
      new THREE.MeshBasicMaterial({ color: '#fff7ba', fog: false })
    );
    this.sunMesh.position.set(60, 88, -68);
    this.sunMesh.lookAt(0, 22, 0);
    this.scene.add(this.sunMesh);

    // Voxel Materials
    const maxAniso = this.renderer.capabilities.getMaxAnisotropy();
    this.atlasTexture = createVoxelAtlasTexture(maxAniso);
    this.chunkMaterial = new THREE.MeshStandardMaterial({
      map: this.atlasTexture,
      vertexColors: true,
      roughness: 0.96,
      metalness: 0.0,
    });
    this.waterMaterial = new THREE.MeshStandardMaterial({
      map: this.atlasTexture,
      color: '#e6f1ff',
      transparent: true,
      opacity: 0.78,
      roughness: 0.18,
      metalness: 0.02,
      side: THREE.DoubleSide,
    });
    this.lavaMaterial = new THREE.MeshStandardMaterial({
      map: this.atlasTexture,
      emissiveMap: this.atlasTexture,
      emissive: '#ff5e14',
      emissiveIntensity: 1.05,
      roughness: 0.28,
      metalness: 0.04,
    });

    this.scene.add(this.worldGroup);
    this.buildWorldClouds();
    this.worldGroup.add(this.worldClouds);

    // 3D Capture the Flag base stands (shown in CTF mode)
    this.ctfFlagRed = createCtfFlagPole('red', true);
    this.ctfFlagRed.position.set(CTF_FLAG_BASES.red.x + 0.5, CTF_FLAG_BASES.red.y, CTF_FLAG_BASES.red.z + 0.5);
    this.ctfFlagRed.visible = false;
    this.ctfFlagBlue = createCtfFlagPole('blue', true);
    this.ctfFlagBlue.position.set(CTF_FLAG_BASES.blue.x + 0.5, CTF_FLAG_BASES.blue.y, CTF_FLAG_BASES.blue.z + 0.5);
    this.ctfFlagBlue.visible = false;
    this.worldGroup.add(this.ctfFlagRed, this.ctfFlagBlue);

    // Minecraft-style crisp dark block target outline
    const boxEdges = new THREE.EdgesGeometry(new THREE.BoxGeometry(1.004, 1.004, 1.004));
    this.targetWireframe = new THREE.LineSegments(
      boxEdges,
      new THREE.LineBasicMaterial({ color: '#0f172a', transparent: true, opacity: 0.78 })
    );
    this.targetWireframe.visible = false;
    this.scene.add(this.targetWireframe);

    // Block breaking crack overlay
    this.breakCrackTexture = createBreakCrackTexture();
    this.breakOverlayMesh = new THREE.Mesh(
      new THREE.BoxGeometry(1.003, 1.003, 1.003),
      new THREE.MeshBasicMaterial({
        map: this.breakCrackTexture,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -1,
      })
    );
    this.breakOverlayMesh.visible = false;
    this.scene.add(this.breakOverlayMesh);

    // First-person ViewModel
    this.viewModel = createFirstPersonViewModel(this.currentSkin, this.currentGunSkin);
    this.viewModel.root.visible = false;
    this.camera.add(this.viewModel.root);

    // Home Diorama
    this.buildDiorama();

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    this.bindEvents();
    this.tick();
  }

  private disposeObjectTree(root: THREE.Object3D): void {
    root.traverse((obj) => {
      const mesh = obj as THREE.Mesh | THREE.Sprite;
      if ((mesh as THREE.Mesh).geometry) (mesh as THREE.Mesh).geometry.dispose();
      if (mesh.material) {
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const m of mats) {
          const std = m as THREE.MeshStandardMaterial;
          std.map?.dispose();
          m.dispose();
        }
      }
    });
  }

  private buildWorldClouds(): void {
    const cloudMat = new THREE.MeshBasicMaterial({
      color: '#ffffff',
      transparent: true,
      opacity: 0.82,
    });
    const layout: Array<[number, number, number, number]> = [
      [-64, 0, -42, 1.5],
      [-22, 1.2, 24, 1.9],
      [26, 0.5, -20, 1.6],
      [68, -0.5, 44, 1.4],
      [-54, 0.8, 52, 1.5],
      [10, -0.8, -62, 1.8],
    ];
    for (const [cx, cy, cz, sc] of layout) {
      const cluster = new THREE.Group();
      cluster.userData = { baseX: cx, baseY: 51 + cy, baseZ: cz };
      cluster.position.set(cx, 51 + cy, cz);
      const b1 = new THREE.Mesh(new THREE.BoxGeometry(10 * sc, 1.4, 6 * sc), cloudMat);
      const b2 = new THREE.Mesh(new THREE.BoxGeometry(6 * sc, 1.2, 4.5 * sc), cloudMat);
      b2.position.set(2 * sc, 1.0, 0.5 * sc);
      cluster.add(b1, b2);
      this.worldClouds.add(cluster);
    }
  }

  private buildDiorama(): void {
    if (this.dioramaGroup) {
      this.scene.remove(this.dioramaGroup);
      this.disposeObjectTree(this.dioramaGroup);
    }
    const diorama = createHomeDiorama(this.currentSkin, this.currentGunSkin);
    this.dioramaGroup = diorama.group;
    this.dioramaHero = diorama.hero;
    this.dioramaClouds = diorama.clouds;
    this.dioramaCrystal = diorama.crystalCluster;
    this.dioramaGroup.visible = this.mode === 'menu';
    this.scene.add(this.dioramaGroup);
  }

  // ---- Mode & State Control ----
  public setMapMode(nextMapMode: GameModeId): void {
    if (this.mapMode !== nextMapMode || this.chunks.size > 0) {
      this.mapMode = nextMapMode;
      this.clearAllChunks();
      this.lastChunkCx = Number.NaN;
      this.lastChunkCz = Number.NaN;
    }
    if (nextMapMode === 'ctf') {
      this.ctfFlagRed.visible = true;
      this.ctfFlagBlue.visible = true;
    } else {
      this.ctfFlagRed.visible = false;
      this.ctfFlagBlue.visible = false;
    }
  }

  public syncCtfFlags(flags?: { red: FlagRuntimeState; blue: FlagRuntimeState }): void {
    if (this.mapMode !== 'ctf' || !flags) {
      this.ctfFlagRed.visible = false;
      this.ctfFlagBlue.visible = false;
      return;
    }
    this.ctfFlagRed.visible = flags.red.state === 'base';
    this.ctfFlagRed.position.set(flags.red.baseX + 0.5, flags.red.baseY, flags.red.baseZ + 0.5);
    this.ctfFlagBlue.visible = flags.blue.state === 'base';
    this.ctfFlagBlue.position.set(flags.blue.baseX + 0.5, flags.blue.baseY, flags.blue.baseZ + 0.5);
  }

  private clearAllChunks(): void {
    for (const entry of this.chunks.values()) {
      if (entry.opaqueMesh) {
        this.worldGroup.remove(entry.opaqueMesh);
        entry.opaqueMesh.geometry.dispose();
      }
      if (entry.waterMesh) {
        this.worldGroup.remove(entry.waterMesh);
        entry.waterMesh.geometry.dispose();
      }
      if (entry.lavaMesh) {
        this.worldGroup.remove(entry.lavaMesh);
        entry.lavaMesh.geometry.dispose();
      }
    }
    this.chunks.clear();
    this.pendingChunkGenQueue = [];
    this.neededChunkKeys.clear();
  }

  public setMode(mode: 'menu' | 'playing'): void {
    this.mode = mode;
    if (this.dioramaGroup) this.dioramaGroup.visible = mode === 'menu';
    this.worldGroup.visible = mode === 'playing';
    this.viewModel.root.visible = mode === 'playing' && this.alive;
    this.targetWireframe.visible = false;
    this.breakOverlayMesh.visible = false;
    if (mode === 'menu') {
      this.exitPointerLock();
      this.keys.clear();
      this.mouseDownLeft = false;
      this.mouseDownRight = false;
      this.clearWorldDrops();
      this.clearAllChunks();
      for (const actor of this.remoteActors.values()) {
        this.worldGroup.remove(actor.rig.group);
        this.disposeObjectTree(actor.rig.group);
      }
      this.remoteActors.clear();
    }
  }

  public spawnPlayer(selfId: string, x: number, y: number, z: number): void {
    this.selfId = selfId;
    this.px = x;
    this.py = y;
    this.pz = z;
    this.vx = 0;
    this.vy = 0;
    this.vz = 0;
    this.yaw = 0;
    this.pitch = 0;
    this.crouching = false;
    this.scoped = false;
    this.currentEyeHeight = EYE_HEIGHT;
    this.recoilPitch = 0;
    this.recoilOffset = 0;
    this.camera.rotation.set(0, 0, 0, 'YXZ');
    this.alive = true;
    this.stamina = 100;
    this.viewModel.root.visible = this.mode === 'playing';
    this.lastChunkCx = Math.floor(this.px / CHUNK_SIZE);
    this.lastChunkCz = Math.floor(this.pz / CHUNK_SIZE);
    this.updateActiveChunks(true, true);
    // Synchronously mesh immediate 3x3 spawn chunks so ground is solid instantly
    this.rebuildDirtyChunks(9, 40);
    this.onGround = this.collidesAt(this.px, this.py - 0.05, this.pz);
  }

  public setServerCorrection(x: number, y: number, z: number): void {
    const err = Math.hypot(x - this.px, y - this.py, z - this.pz);
    if (err > 1.8) {
      this.px = x;
      this.py = y;
      this.pz = z;
      this.vx = 0;
      this.vy = 0;
      this.vz = 0;
    } else if (err > 0.12) {
      this.px = THREE.MathUtils.lerp(this.px, x, 0.35);
      this.py = THREE.MathUtils.lerp(this.py, y, 0.35);
      this.pz = THREE.MathUtils.lerp(this.pz, z, 0.35);
    }
  }

  public setAlive(alive: boolean): void {
    this.alive = alive;
    this.viewModel.root.visible = this.mode === 'playing' && alive && !this.isScopeActive();
    if (!alive) {
      this.crouching = false;
      this.scoped = false;
      this.mouseDownLeft = false;
      this.mouseDownRight = false;
      this.exitPointerLock();
    }
  }

  public toggleSniperScope(): void {
    if (this.mode !== 'playing' || !this.alive || this.heldItemId !== 'sniper') return;
    this.scoped = !this.scoped;
  }

  private isScopeActive(): boolean {
    const now = performance.now();
    return (
      this.mode === 'playing' &&
      this.alive &&
      this.heldItemId === 'sniper' &&
      this.reloadingUntil <= now &&
      (this.scoped || this.mouseDownRight)
    );
  }

  private rebuildViewModel(): void {
    this.camera.remove(this.viewModel.root);
    this.disposeObjectTree(this.viewModel.root);
    this.viewModel = createFirstPersonViewModel(this.currentSkin, this.currentGunSkin);
    this.viewModel.root.visible = this.mode === 'playing' && this.alive;
    this.camera.add(this.viewModel.root);
    this.setHeldItem(this.heldItemId);
  }

  public setSkin(skinId: string): void {
    const found = SKINS.find((s) => s.id === skinId) || SKINS[0];
    if (found.id === this.currentSkin.id) return;
    this.currentSkin = found;
    this.rebuildViewModel();
    this.buildDiorama();
  }

  public setGunSkin(gunSkinId: string): void {
    const found = GUN_SKINS.find((g) => g.id === gunSkinId) || GUN_SKINS[0];
    if (found.id === this.currentGunSkin.id) return;
    this.currentGunSkin = found;
    this.rebuildViewModel();
    this.buildDiorama();
  }

  public setHeldItem(itemId: string): void {
    if (this.heldItemId !== itemId) {
      this.reloadingUntil = 0;
      this.scoped = false;
    }
    this.heldItemId = itemId;
    const def = ITEMS[itemId];
    const isGun = Boolean(GUNS[itemId]);
    this.viewModel.leftArmGroup.visible = isGun;
    if (itemId === 'smg') {
      this.viewModel.leftArmGroup.position.set(0.01, -0.02, 0.08);
    } else if (itemId === 'shotgun') {
      this.viewModel.leftArmGroup.position.set(0.0, -0.02, -0.05);
    } else if (itemId === 'sniper') {
      this.viewModel.leftArmGroup.position.set(0.0, -0.01, -0.04);
    } else {
      this.viewModel.leftArmGroup.position.set(0, 0, 0);
    }
    for (const [gid, gm] of Object.entries(this.viewModel.gunMeshes)) {
      const isActive = gid === itemId;
      gm.visible = isActive;
      if (isActive) {
        const mz = (gm.userData.muzzleZ as number | undefined) ?? -0.83;
        const my = (gm.userData.muzzleY as number | undefined) ?? 0.02;
        this.viewModel.muzzleFlash.position.set(0, 0.02 + my * 1.22, -0.04 + mz * 1.22);
      }
    }
    this.viewModel.pickaxe.visible = itemId === 'pickaxe';
    this.viewModel.medkit.visible = itemId === 'medkit';
    if (def && def.kind === 'block') {
      this.viewModel.blockMesh.visible = true;
      (this.viewModel.blockMesh.material as THREE.MeshStandardMaterial).color.set(def.color);
    } else {
      this.viewModel.blockMesh.visible = false;
    }
  }

  public setGunMags(gunMags: Record<string, number>, reserve: number): void {
    const gun = GUNS[this.heldItemId];
    if (gun) {
      const prev = this.gunMags[gun.id] ?? 0;
      const next = gunMags[gun.id] ?? 0;
      if (next > prev && this.reloadingUntil > performance.now()) {
        this.reloadingUntil = 0;
      }
    }
    this.gunMags = { ...this.gunMags, ...gunMags };
    this.ammoReserve = reserve;
  }

  public setAmmoState(inMag: number, reserve: number): void {
    if (inMag > (this.gunMags.rifle ?? 0) && this.reloadingUntil > performance.now()) {
      this.reloadingUntil = 0;
    }
    this.gunMags.rifle = inMag;
    this.ammoReserve = reserve;
  }

  public setPickaxeTier(tier: number): void {
    this.pickaxeTier = Math.max(1, tier);
  }

  public updateSettings(partial: Partial<EngineSettings>): void {
    this.settings = { ...this.settings, ...partial };
    this.camera.fov = this.settings.fov;
    this.camera.updateProjectionMatrix();
    if (partial.renderDistance !== undefined && this.mode === 'playing') {
      this.updateActiveChunks(true);
    }
  }

  public setKeybinds(kb: KeybindingsConfig): void {
    this.keybinds = { ...kb };
  }

  public setTouchInput(moveX: number, moveY: number, sprint: boolean): void {
    this.touchMoveX = moveX;
    this.touchMoveY = moveY;
    this.touchSprint = sprint;
  }

  public addTouchLookDelta(dx: number, dy: number): void {
    const sensScale = this.isScopeActive() ? 0.36 : 1.0;
    this.yaw -= dx * this.settings.sensitivity * 1.45 * sensScale;
    this.pitch = Math.max(-1.54, Math.min(1.54, this.pitch - dy * this.settings.sensitivity * 1.45 * sensScale));
  }

  public triggerTouchJump(): void {
    this.touchJumpQueued = true;
  }

  public setTouchMining(active: boolean): void {
    this.touchMining = active;
  }

  public triggerTouchPlace(): void {
    this.tryPlaceBlock();
  }

  public triggerReload(): void {
    const gun = GUNS[this.heldItemId];
    if (!gun) return;
    const now = performance.now();
    const curMag = this.gunMags[gun.id] ?? 0;
    if (this.reloadingUntil > now || this.ammoReserve <= 0 || curMag >= gun.magSize) {
      return;
    }
    this.scoped = false;
    this.activeReloadMs = gun.reloadMs;
    this.reloadingUntil = now + gun.reloadMs;
    audioEngine.playReload();
    const reloadGunId = gun.id;
    setTimeout(() => {
      if (!this.disposed) {
        this.callbacks.onReloadRequest(reloadGunId);
      }
    }, gun.reloadMs - 120);
  }

  public triggerDamageShake(): void {
    // Visual damage feedback is shown via HUD vignette without camera jitter
    audioEngine.playDamage();
  }

  public requestPointerLock(): void {
    if (this.mode !== 'playing' || !this.alive) return;
    try {
      this.renderer.domElement.requestPointerLock?.();
    } catch {
      // Ignore on unsupported touch devices
    }
  }

  public exitPointerLock(): void {
    if (document.pointerLockElement === this.renderer.domElement) {
      document.exitPointerLock?.();
    }
  }

  // ---- World Chunks & Deltas ----
  public getBlock(wx: number, wy: number, wz: number): number {
    if (!isInsideModeWorld(this.mapMode, wx, wy, wz)) return BlockId.AIR;
    const { cx, cz, lx, lz } = worldToChunk(wx, wz);
    const key = getChunkKey(cx, cz);
    const entry = this.chunks.get(key);
    if (!entry) return BlockId.AIR;
    return entry.data[localIndex(lx, wy, lz)];
  }

  public applyBlockUpdate(wx: number, wy: number, wz: number, blockId: BlockType, byPlayerId?: string): void {
    if (!isInsideModeWorld(this.mapMode, wx, wy, wz)) return;
    const { cx, cz, lx, lz } = worldToChunk(wx, wz);
    const key = getChunkKey(cx, cz);
    const entry = this.chunks.get(key);
    if (!entry) return;

    const oldBlock = entry.data[localIndex(lx, wy, lz)];
    entry.data[localIndex(lx, wy, lz)] = blockId;
    entry.dirty = true;

    // Mark adjacent chunks dirty if on boundary
    if (lx === 0) this.markChunkDirty(cx - 1, cz);
    if (lx === CHUNK_SIZE - 1) this.markChunkDirty(cx + 1, cz);
    if (lz === 0) this.markChunkDirty(cx, cz - 1);
    if (lz === CHUNK_SIZE - 1) this.markChunkDirty(cx, cz + 1);

    if (blockId === BlockId.AIR && oldBlock !== BlockId.AIR) {
      const color = BLOCK_META[oldBlock]?.colorHex || '#94a3b8';
      this.spawnBlockParticles(wx + 0.5, wy + 0.5, wz + 0.5, color, 8);
      if (byPlayerId !== this.selfId) {
        // subtle spatial cue skipped
      }
    }
  }

  public applyChunkDeltas(chunks: Array<{ cx: number; cz: number; mods: BlockModEntry[] }>): void {
    for (const c of chunks) {
      const entry = this.chunks.get(getChunkKey(c.cx, c.cz));
      if (!entry) continue;
      for (const m of c.mods) {
        const { lx, lz } = worldToChunk(m.x, m.z);
        if (m.y >= 0 && m.y < WORLD_HEIGHT) {
          entry.data[localIndex(lx, m.y, lz)] = m.blockId;
        }
      }
      entry.dirty = true;
    }
  }

  private markChunkDirty(cx: number, cz: number): void {
    const entry = this.chunks.get(getChunkKey(cx, cz));
    if (entry) entry.dirty = true;
  }

  private createChunkEntry(cx: number, cz: number): ChunkEntry {
    const entry: ChunkEntry = {
      cx,
      cz,
      data: generateChunkDataForMode(this.mapMode, cx, cz),
      opaqueMesh: null,
      waterMesh: null,
      lavaMesh: null,
      dirty: true,
      requestedDeltas: true,
    };
    this.chunks.set(getChunkKey(cx, cz), entry);
    this.markChunkDirty(cx - 1, cz);
    this.markChunkDirty(cx + 1, cz);
    this.markChunkDirty(cx, cz - 1);
    this.markChunkDirty(cx, cz + 1);
    return entry;
  }

  private updateActiveChunks(forceRequest = false, syncImmediateCore = false): void {
    const playerCx = Math.floor(this.px / CHUNK_SIZE);
    const playerCz = Math.floor(this.pz / CHUNK_SIZE);
    const r = this.settings.renderDistance;
    const bounds = getModeBounds(this.mapMode);

    this.neededChunkKeys.clear();
    const toRequest: Array<{ cx: number; cz: number }> = [];
    const missing: Array<{ cx: number; cz: number; distSq: number }> = [];

    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        const distSq = dx * dx + dz * dz;
        if (distSq > (r + 0.6) * (r + 0.6)) continue;
        const cx = playerCx + dx;
        const cz = playerCz + dz;
        // Skip chunks totally outside mode bounds
        if (
          (cx + 1) * CHUNK_SIZE <= bounds.minX ||
          cx * CHUNK_SIZE > bounds.maxX ||
          (cz + 1) * CHUNK_SIZE <= bounds.minZ ||
          cz * CHUNK_SIZE > bounds.maxZ
        ) {
          continue;
        }

        const key = getChunkKey(cx, cz);
        this.neededChunkKeys.add(key);

        const existing = this.chunks.get(key);
        if (!existing) {
          if (syncImmediateCore && Math.abs(dx) <= 1 && Math.abs(dz) <= 1) {
            this.createChunkEntry(cx, cz);
            toRequest.push({ cx, cz });
          } else {
            missing.push({ cx, cz, distSq });
          }
        } else if (!existing.requestedDeltas || forceRequest) {
          existing.requestedDeltas = true;
          toRequest.push({ cx, cz });
        }
      }
    }

    // Queue missing chunks sorted closest-first so generation spreads cleanly across frames with zero lag spikes
    missing.sort((a, b) => a.distSq - b.distSq);
    this.pendingChunkGenQueue = missing;

    if (toRequest.length > 0) {
      this.callbacks.onRequestChunks(toRequest);
    }

    // Unload far chunks
    for (const [key, entry] of this.chunks.entries()) {
      if (!this.neededChunkKeys.has(key)) {
        if (entry.opaqueMesh) {
          this.worldGroup.remove(entry.opaqueMesh);
          entry.opaqueMesh.geometry.dispose();
        }
        if (entry.waterMesh) {
          this.worldGroup.remove(entry.waterMesh);
          entry.waterMesh.geometry.dispose();
        }
        if (entry.lavaMesh) {
          this.worldGroup.remove(entry.lavaMesh);
          entry.lavaMesh.geometry.dispose();
        }
        this.chunks.delete(key);
      }
    }
  }

  private processChunkGenQueue(maxPerFrame = 2, timeBudgetMs = 2.2): void {
    if (this.pendingChunkGenQueue.length === 0) return;
    const startMs = performance.now();
    let generated = 0;
    const deltaRequests: Array<{ cx: number; cz: number }> = [];

    while (this.pendingChunkGenQueue.length > 0 && generated < maxPerFrame) {
      if (generated > 0 && performance.now() - startMs >= timeBudgetMs) break;
      const item = this.pendingChunkGenQueue.shift()!;
      const key = getChunkKey(item.cx, item.cz);
      if (!this.neededChunkKeys.has(key) || this.chunks.has(key)) continue;
      this.createChunkEntry(item.cx, item.cz);
      deltaRequests.push({ cx: item.cx, cz: item.cz });
      generated++;
    }

    if (deltaRequests.length > 0) {
      this.callbacks.onRequestChunks(deltaRequests);
    }
  }

  private rebuildDirtyChunks(budget = 4, timeBudgetMs = 4.2): void {
    let built = 0;
    const startMs = performance.now();

    // Build closest chunks first
    const playerCx = Math.floor(this.px / CHUNK_SIZE);
    const playerCz = Math.floor(this.pz / CHUNK_SIZE);
    const dirtyList: Array<{ distSq: number; entry: ChunkEntry }> = [];
    for (const entry of this.chunks.values()) {
      if (!entry.dirty) continue;
      const dx = entry.cx - playerCx;
      const dz = entry.cz - playerCz;
      dirtyList.push({ distSq: dx * dx + dz * dz, entry });
    }
    dirtyList.sort((a, b) => a.distSq - b.distSq);

    for (const item of dirtyList) {
      if (built >= budget) break;
      if (built > 0 && performance.now() - startMs >= timeBudgetMs) break;
      const entry = item.entry;
      entry.dirty = false;
      built++;

      if (entry.opaqueMesh) {
        this.worldGroup.remove(entry.opaqueMesh);
        entry.opaqueMesh.geometry.dispose();
        entry.opaqueMesh = null;
      }
      if (entry.waterMesh) {
        this.worldGroup.remove(entry.waterMesh);
        entry.waterMesh.geometry.dispose();
        entry.waterMesh = null;
      }
      if (entry.lavaMesh) {
        this.worldGroup.remove(entry.lavaMesh);
        entry.lavaMesh.geometry.dispose();
        entry.lavaMesh = null;
      }

      const cx = entry.cx;
      const cz = entry.cz;
      const { opaqueGeometry, waterGeometry, lavaGeometry } = buildChunkGeometryFast(entry.data, {
        nx: this.chunks.get(getChunkKey(cx - 1, cz))?.data ?? null,
        px: this.chunks.get(getChunkKey(cx + 1, cz))?.data ?? null,
        nz: this.chunks.get(getChunkKey(cx, cz - 1))?.data ?? null,
        pz: this.chunks.get(getChunkKey(cx, cz + 1))?.data ?? null,
        nxnz: this.chunks.get(getChunkKey(cx - 1, cz - 1))?.data ?? null,
        pxnz: this.chunks.get(getChunkKey(cx + 1, cz - 1))?.data ?? null,
        nxpz: this.chunks.get(getChunkKey(cx - 1, cz + 1))?.data ?? null,
        pxpz: this.chunks.get(getChunkKey(cx + 1, cz + 1))?.data ?? null,
      });

      const allowShadow = !this.isSoftwareGl && item.distSq <= 9;
      if (opaqueGeometry) {
        const mesh = new THREE.Mesh(opaqueGeometry, this.chunkMaterial);
        mesh.position.set(cx * CHUNK_SIZE, 0, cz * CHUNK_SIZE);
        mesh.receiveShadow = !this.isSoftwareGl;
        mesh.castShadow = allowShadow;
        this.worldGroup.add(mesh);
        entry.opaqueMesh = mesh;
      }
      if (waterGeometry) {
        const wMesh = new THREE.Mesh(waterGeometry, this.waterMaterial);
        wMesh.position.set(cx * CHUNK_SIZE, 0, cz * CHUNK_SIZE);
        this.worldGroup.add(wMesh);
        entry.waterMesh = wMesh;
      }
      if (lavaGeometry) {
        const lMesh = new THREE.Mesh(lavaGeometry, this.lavaMaterial);
        lMesh.position.set(cx * CHUNK_SIZE, 0, cz * CHUNK_SIZE);
        this.worldGroup.add(lMesh);
        entry.lavaMesh = lMesh;
      }
    }
  }

  // ---- Remote Players & Tracers ----
  public syncRemotePlayers(players: PlayerPublicState[]): void {
    const activeIds = new Set<string>();
    for (const p of players) {
      if (p.id === this.selfId) continue;
      activeIds.add(p.id);

      let actor = this.remoteActors.get(p.id);
      const targetGunSkinId = p.gunSkinId || 'carbon';
      if (
        !actor ||
        actor.rig.skinId !== p.skinId ||
        actor.rig.gunSkinId !== targetGunSkinId ||
        actor.rig.clanTag !== p.clanTag ||
        actor.rig.clanName !== p.clanName ||
        Boolean(actor.rig.isMod) !== Boolean(p.isMod) ||
        actor.rig.team !== p.team
      ) {
        if (actor) {
          this.worldGroup.remove(actor.rig.group);
          this.disposeObjectTree(actor.rig.group);
        }
        const skin = SKINS.find((s) => s.id === p.skinId) || SKINS[0];
        const gunSkin = GUN_SKINS.find((g) => g.id === targetGunSkinId) || GUN_SKINS[0];
        const rig = createVoxelCharacter(p.username, skin, gunSkin, p.clanTag, p.clanName, p.isMod, p.team);
        rig.group.position.set(p.x, p.y, p.z);
        this.worldGroup.add(rig.group);
        actor = {
          rig,
          targetX: p.x,
          targetY: p.y,
          targetZ: p.z,
          targetYaw: p.yaw,
          targetPitch: p.pitch,
          sprinting: p.sprinting,
          crouching: Boolean(p.crouching),
          heldItemId: p.heldItemId,
          walkPhase: 0,
        };
        this.remoteActors.set(p.id, actor);
      }

      actor.targetX = p.x;
      actor.targetY = p.y;
      actor.targetZ = p.z;
      actor.targetYaw = p.yaw;
      actor.targetPitch = p.pitch;
      actor.sprinting = p.sprinting;
      actor.crouching = Boolean(p.crouching);
      actor.heldItemId = p.heldItemId;
      actor.rig.group.visible = p.alive && this.mode === 'playing';
      actor.rig.carrierFlagRed.visible = p.carryingFlag === 'red';
      actor.rig.carrierFlagBlue.visible = p.carryingFlag === 'blue';

      const hpRatio = Math.max(0.01, Math.min(1, p.hp / p.maxHp));
      actor.rig.hpBarFill.scale.x = hpRatio;
      actor.rig.hpBarFill.position.x = -(1 - hpRatio) * 0.36;
      const hpMat = actor.rig.hpBarFill.material as THREE.MeshBasicMaterial;
      hpMat.color.set(hpRatio > 0.5 ? '#22c55e' : hpRatio > 0.25 ? '#f59e0b' : '#ef4444');

      let holdingGun = false;
      for (const [gid, gm] of Object.entries(actor.rig.gunMeshes)) {
        const show = gid === p.heldItemId;
        gm.visible = show;
        if (show) holdingGun = true;
      }
      actor.rig.pickaxeMesh.visible = !holdingGun;
    }

    for (const [id, actor] of this.remoteActors.entries()) {
      if (!activeIds.has(id)) {
        this.worldGroup.remove(actor.rig.group);
        this.disposeObjectTree(actor.rig.group);
        this.remoteActors.delete(id);
      }
    }
  }

  private getGunMuzzleWorldPos(shooterId: string, out: THREE.Vector3): boolean {
    if (shooterId === this.selfId) {
      this.camera.updateMatrixWorld(true);
      if (this.isScopeActive()) {
        // When zoomed into sniper optic, originate beam just below camera axis toward center reticle
        const fwd = new THREE.Vector3();
        this.camera.getWorldDirection(fwd);
        out.set(this.px, this.py + this.currentEyeHeight - 0.14, this.pz).addScaledVector(fwd, 0.9);
        return true;
      }
      const gm = this.viewModel.gunMeshes[this.heldItemId] || this.viewModel.rifle;
      const muzzleNode = gm?.userData?.muzzleNode as THREE.Object3D | undefined;
      if (muzzleNode) {
        muzzleNode.getWorldPosition(out);
        return true;
      }
      return false;
    }

    const actor = this.remoteActors.get(shooterId);
    if (!actor) return false;
    actor.rig.group.updateMatrixWorld(true);
    const gm = actor.rig.gunMeshes[actor.heldItemId] || actor.rig.rifleMesh;
    const muzzleNode = gm?.userData?.muzzleNode as THREE.Object3D | undefined;
    if (muzzleNode) {
      muzzleNode.getWorldPosition(out);
      return true;
    }
    return false;
  }

  public spawnTracer(
    shooterId: string,
    startX: number,
    startY: number,
    startZ: number,
    endX: number,
    endY: number,
    endZ: number,
    hitPlayer: boolean
  ): void {
    const startVec = new THREE.Vector3(startX, startY, startZ);
    this.getGunMuzzleWorldPos(shooterId, startVec);
    const endVec = new THREE.Vector3(endX, endY, endZ);
    const beamVec = new THREE.Vector3().subVectors(endVec, startVec);
    const len = Math.max(0.15, beamVec.length());
    const dir = beamVec.normalize();

    const geo = new THREE.CylinderGeometry(0.02, 0.02, len, 6);
    const mat = new THREE.MeshBasicMaterial({
      color: hitPlayer ? '#ff3b5c' : '#38bdf8',
      transparent: true,
      opacity: 0.96,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(startVec).addScaledVector(dir, len * 0.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);

    this.scene.add(mesh);
    this.tracers.push({ mesh, life: 0.1 });
    this.spawnBlockParticles(endX, endY, endZ, hitPlayer ? '#ef4444' : '#38bdf8', 5);
  }

  private clearWorldDrops(): void {
    for (const d of this.worldDrops.values()) {
      this.worldGroup.remove(d.mesh);
    }
    this.worldDrops.clear();
  }

  public syncDrops(drops: WorldDropState[]): void {
    this.clearWorldDrops();
    for (const drop of drops) {
      this.spawnDrop(drop);
    }
  }

  public spawnDrop(drop: WorldDropState): void {
    if (this.worldDrops.has(drop.id)) return;
    const colorHex = ITEMS[drop.itemId]?.color || '#cbd5e1';
    let mat = this.dropMaterials.get(colorHex);
    if (!mat) {
      mat = new THREE.MeshStandardMaterial({
        color: colorHex,
        emissive: colorHex,
        emissiveIntensity: 0.12,
        roughness: 0.55,
        metalness: 0.08,
      });
      this.dropMaterials.set(colorHex, mat);
    }
    const mesh = new THREE.Mesh(this.dropGeo, mat);
    mesh.castShadow = !this.isSoftwareGl;
    mesh.position.set(drop.x, drop.y, drop.z);
    this.worldGroup.add(mesh);
    this.worldDrops.set(drop.id, {
      mesh,
      baseY: drop.y,
      phase: Math.random() * Math.PI * 2,
    });
  }

  public removeDrop(id: string, byPlayerId?: string): void {
    const existing = this.worldDrops.get(id);
    if (existing) {
      this.worldGroup.remove(existing.mesh);
      this.worldDrops.delete(id);
    }
    if (byPlayerId && byPlayerId === this.selfId) {
      audioEngine.playPickup();
    }
  }

  private spawnBlockParticles(x: number, y: number, z: number, colorHex: string, count: number): void {
    let mat = this.particleMaterials.get(colorHex);
    if (!mat) {
      mat = new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.8 });
      this.particleMaterials.set(colorHex, mat);
    }
    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(this.particleGeo, mat);
      mesh.position.set(x + (Math.random() - 0.5) * 0.4, y + (Math.random() - 0.5) * 0.4, z + (Math.random() - 0.5) * 0.4);
      this.scene.add(mesh);
      this.particles.push({
        mesh,
        vx: (Math.random() - 0.5) * 4.5,
        vy: 1.5 + Math.random() * 3.5,
        vz: (Math.random() - 0.5) * 4.5,
        life: 0.45 + Math.random() * 0.25,
        maxLife: 0.65,
      });
    }
  }

  // ---- Raycast & Collision Helpers ----
  private raycastTargetBlock(): {
    x: number;
    y: number;
    z: number;
    nx: number;
    ny: number;
    nz: number;
    blockId: number;
  } | null {
    _vec3.set(this.px, this.py + this.currentEyeHeight, this.pz);
    this.camera.getWorldDirection(_dir);

    const step = 0.06;
    let prevX = Math.floor(_vec3.x);
    let prevY = Math.floor(_vec3.y);
    let prevZ = Math.floor(_vec3.z);

    for (let d = 0.1; d <= MAX_REACH; d += step) {
      const cx = Math.floor(_vec3.x + _dir.x * d);
      const cy = Math.floor(_vec3.y + _dir.y * d);
      const cz = Math.floor(_vec3.z + _dir.z * d);
      if (cx === prevX && cy === prevY && cz === prevZ) continue;

      const blk = this.getBlock(cx, cy, cz);
      if (blk !== BlockId.AIR && blk !== BlockId.WATER && blk !== BlockId.LAVA) {
        return {
          x: cx,
          y: cy,
          z: cz,
          nx: prevX - cx,
          ny: prevY - cy,
          nz: prevZ - cz,
          blockId: blk,
        };
      }
      prevX = cx;
      prevY = cy;
      prevZ = cz;
    }
    return null;
  }

  private isSolidAt(wx: number, wy: number, wz: number): boolean {
    const blk = this.getBlock(wx, wy, wz);
    return blk !== BlockId.AIR && blk !== BlockId.WATER && blk !== BlockId.LAVA;
  }

  private collidesAtHeight(x: number, y: number, z: number, height: number): boolean {
    const hw = PLAYER_WIDTH / 2;
    const eps = 0.0001;
    const minX = Math.floor(x - hw + eps);
    const maxX = Math.floor(x + hw - eps);
    const minY = Math.floor(y + eps);
    const maxY = Math.floor(y + height - eps);
    const minZ = Math.floor(z - hw + eps);
    const maxZ = Math.floor(z + hw - eps);

    for (let by = minY; by <= maxY; by++) {
      for (let bz = minZ; bz <= maxZ; bz++) {
        for (let bx = minX; bx <= maxX; bx++) {
          if (this.isSolidAt(bx, by, bz)) return true;
        }
      }
    }
    return false;
  }

  private collidesAt(x: number, y: number, z: number): boolean {
    return this.collidesAtHeight(x, y, z, this.crouching ? CROUCH_HEIGHT : PLAYER_HEIGHT);
  }

  private stepPhysics(dt: number): void {
    const bodyBlk = this.getBlock(Math.floor(this.px), Math.floor(this.py + 0.35), Math.floor(this.pz));
    const inWater = bodyBlk === BlockId.WATER;
    const inLava = bodyBlk === BlockId.LAVA;
    const inLiquid = inWater || inLava;

    const forwardInput =
      (this.keys.has(this.keybinds.forward) ? 1 : 0) -
      (this.keys.has(this.keybinds.backward) ? 1 : 0) -
      this.touchMoveY;
    const strafeInput =
      (this.keys.has(this.keybinds.right) ? 1 : 0) -
      (this.keys.has(this.keybinds.left) ? 1 : 0) +
      this.touchMoveX;

    const sprintHeld =
      this.keys.has(this.keybinds.sprint) ||
      (this.keybinds.sprint === 'ShiftLeft' && this.keys.has('ShiftRight')) ||
      this.touchSprint;

    const wantsSprint = sprintHeld && forwardInput > 0.1;

    if (wantsSprint && this.crouching) {
      if (!this.collidesAtHeight(this.px, this.py, this.pz, PLAYER_HEIGHT)) {
        this.crouching = false;
      }
    }

    this.stamina = 100;

    const baseSpeed = this.crouching
      ? CROUCH_SPEED
      : wantsSprint
      ? SPRINT_SPEED
      : WALK_SPEED;
    const speed = baseSpeed * (inLava ? 0.44 : inWater ? 0.62 : 1.0);

    _forward.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    _right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));

    let moveX = _forward.x * forwardInput + _right.x * strafeInput;
    let moveZ = _forward.z * forwardInput + _right.z * strafeInput;
    const mag = Math.hypot(moveX, moveZ);
    if (mag > 1e-4) {
      const clampMag = Math.min(1, mag);
      moveX = (moveX / mag) * speed * clampMag;
      moveZ = (moveZ / mag) * speed * clampMag;
      if (this.onGround) {
        this.walkBob += dt * (wantsSprint && !this.crouching ? 12.5 : this.crouching ? 5.5 : 8.5);
        this.bobBlend = THREE.MathUtils.damp(
          this.bobBlend,
          this.crouching ? 0.32 : wantsSprint ? 1.0 : 0.72,
          12,
          dt
        );
        if (!this.crouching) {
          audioEngine.playStep(wantsSprint);
        }
      } else {
        this.bobBlend = THREE.MathUtils.damp(this.bobBlend, 0, 14, dt);
      }
    } else {
      this.bobBlend = THREE.MathUtils.damp(this.bobBlend, 0, 14, dt);
    }

    this.vx = THREE.MathUtils.damp(this.vx, moveX, 16, dt);
    this.vz = THREE.MathUtils.damp(this.vz, moveZ, 16, dt);

    // Coyote time & jump buffer
    if (this.onGround) {
      this.coyoteTimer = 0.11;
    } else {
      this.coyoteTimer = Math.max(0, this.coyoteTimer - dt);
    }

    if (this.keys.has(this.keybinds.jump) || this.touchJumpQueued) {
      this.jumpBuffer = 0.11;
      this.touchJumpQueued = false;
      if (this.crouching && !this.collidesAtHeight(this.px, this.py, this.pz, PLAYER_HEIGHT)) {
        this.crouching = false;
      }
    } else {
      this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);
    }

    if (this.jumpBuffer > 0 && (this.coyoteTimer > 0 || inLiquid)) {
      this.vy = inLava ? 4.4 : inWater ? 5.6 : JUMP_VELOCITY;
      this.onGround = false;
      this.coyoteTimer = 0;
      this.jumpBuffer = 0;
    }

    this.vy -= (inLiquid ? GRAVITY * 0.42 : GRAVITY) * dt;
    this.vy = Math.max(-28, this.vy);

    const hasStairAtFoot = (tx: number, ty: number, tz: number): boolean => {
      const hw = PLAYER_WIDTH / 2 + 0.08;
      const by = Math.floor(ty + 0.1);
      for (const ox of [-hw, hw]) {
        for (const oz of [-hw, hw]) {
          const blk = this.getBlock(Math.floor(tx + ox), by, Math.floor(tz + oz));
          if (blk === BlockId.STONE_STAIRS || blk === BlockId.WOOD_STAIRS) return true;
        }
      }
      return false;
    };

    // Resolve X
    const bounds = getModeBounds(this.mapMode);
    const nextX = Math.max(bounds.minX + 1, Math.min(bounds.maxX - 1, this.px + this.vx * dt));
    if (!this.collidesAt(nextX, this.py, this.pz)) {
      this.px = nextX;
    } else if (
      this.onGround &&
      hasStairAtFoot(nextX, this.py, this.pz) &&
      !this.collidesAt(nextX, Math.floor(this.py) + 1.01, this.pz)
    ) {
      this.px = nextX;
      this.py = Math.floor(this.py) + 1;
    } else {
      this.vx = 0;
    }

    // Resolve Z
    const nextZ = Math.max(bounds.minZ + 1, Math.min(bounds.maxZ - 1, this.pz + this.vz * dt));
    if (!this.collidesAt(this.px, this.py, nextZ)) {
      this.pz = nextZ;
    } else if (
      this.onGround &&
      hasStairAtFoot(this.px, this.py, nextZ) &&
      !this.collidesAt(this.px, Math.floor(this.py) + 1.01, nextZ)
    ) {
      this.pz = nextZ;
      this.py = Math.floor(this.py) + 1;
    } else {
      this.vz = 0;
    }

    // Resolve Y (tight epsilon prevents standing/walking vertical micro-bounce)
    const wasOnGround = this.onGround;
    const nextY = this.py + this.vy * dt;
    if (!this.collidesAt(this.px, nextY, this.pz)) {
      this.py = nextY;
      this.onGround = false;
    } else {
      if (this.vy < 0) {
        this.onGround = true;
        this.py = Math.floor(nextY + 0.0001) + 1;
        if (!wasOnGround) {
          this.lastNetMoveAt = 0;
        }
      }
      this.vy = 0;
    }

    this.currentEyeHeight = THREE.MathUtils.damp(
      this.currentEyeHeight,
      this.crouching ? CROUCH_EYE_HEIGHT : EYE_HEIGHT,
      16,
      dt
    );

    // Smooth FOV transition (Sniper Scope 3.4x zoom OR Sprint FOV boost)
    const scopeActive = this.isScopeActive();
    const targetFov = scopeActive
      ? 22
      : this.settings.fov + (wantsSprint && !this.crouching && mag > 0.1 ? 5.5 : 0);
    if (Math.abs(this.camera.fov - targetFov) > 0.04) {
      this.camera.fov = THREE.MathUtils.damp(this.camera.fov, targetFov, scopeActive ? 18 : 10, dt);
      this.camera.updateProjectionMatrix();
    }
  }

  private tryPlaceBlock(): void {
    if (this.mode !== 'playing' || !this.alive) return;
    const def = ITEMS[this.heldItemId];
    if (!def) return;
    if (def.id === 'medkit') {
      this.callbacks.onUseMedkit();
      return;
    }
    if (def.kind !== 'block') return;
    const hit = this.raycastTargetBlock();
    if (!hit) return;

    const tx = hit.x + hit.nx;
    const ty = hit.y + hit.ny;
    const tz = hit.z + hit.nz;
    if (!isInsideModeWorld(this.mapMode, tx, ty, tz) || ty >= 62) return;

    const curH = this.crouching ? CROUCH_HEIGHT : PLAYER_HEIGHT;
    if (
      Math.abs(tx + 0.5 - this.px) < PLAYER_WIDTH * 0.5 + 0.45 &&
      Math.abs(tz + 0.5 - this.pz) < PLAYER_WIDTH * 0.5 + 0.45 &&
      ty + 1 > this.py + 0.05 &&
      ty < this.py + curH
    ) {
      return;
    }

    audioEngine.playBlockPlace();
    this.swingTimer = 0.18;
    this.callbacks.onPlaceBlock(tx, ty, tz, this.heldItemId);
  }

  private handleCombatAndMining(dt: number): { targetName: string | null; mineProgress: number } {
    const hit = this.raycastTargetBlock();
    const targetName = hit ? BLOCK_META[hit.blockId]?.name ?? null : null;

    if (hit) {
      this.targetWireframe.visible = true;
      this.targetWireframe.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);
    } else {
      this.targetWireframe.visible = false;
      this.breakOverlayMesh.visible = false;
    }

    const keyActionHeld = this.keys.has(this.keybinds.fireOrPlace);
    const activeLeft = this.mouseDownLeft || this.touchMining;
    const gunFireHeld = activeLeft || (keyActionHeld && Boolean(GUNS[this.heldItemId]));
    const now = performance.now();

    if ((activeLeft || gunFireHeld) && this.alive) {
      const gun = GUNS[this.heldItemId];
      if (gun && gunFireHeld) {
        this.breakOverlayMesh.visible = false;
        const magCount = this.gunMags[gun.id] ?? 0;
        if (this.reloadingUntil <= now && now - this.lastShotAt >= gun.fireIntervalMs) {
          if (magCount > 0) {
            this.lastShotAt = now;
            const recoilScale = this.crouching ? 0.65 : 1.0;
            this.recoilOffset = Math.min(0.14, gun.recoil * 5.2 * recoilScale);
            this.recoilPitch = Math.min(0.06, this.recoilPitch + gun.recoil * recoilScale);
            this.muzzleFlashTimer = 0.045;
            this.viewModel.muzzleFlash.visible = true;
            this.viewModel.muzzleFlash.rotation.z = Math.random() * Math.PI;
            audioEngine.playShoot(gun.id);

            _vec3.set(this.px, this.py + this.currentEyeHeight, this.pz);
            this.camera.getWorldDirection(_dir);
            this.callbacks.onShoot(_vec3, _dir, gun.id);
          } else {
            this.triggerReload();
          }
        }
      } else if (this.heldItemId === 'medkit' && activeLeft) {
        this.breakOverlayMesh.visible = false;
        this.mouseDownLeft = false;
        this.touchMining = false;
        this.callbacks.onUseMedkit();
      } else if (hit && activeLeft) {
        const meta = BLOCK_META[hit.blockId];
        if (meta && Number.isFinite(meta.hardness)) {
          const bKey = `${hit.x},${hit.y},${hit.z}`;
          if (bKey !== this.miningBlockKey) {
            this.miningBlockKey = bKey;
            this.miningElapsed = 0;
          }
          const speedMult = this.heldItemId === 'pickaxe' ? 1 + (this.pickaxeTier - 1) * 0.35 : 0.65;
          this.miningElapsed += dt * speedMult;
          this.swingTimer = 0.22;

          if (now - this.lastMineSoundAt > 180) {
            this.lastMineSoundAt = now;
            audioEngine.playMineTick();
          }

          const progress = Math.min(1, this.miningElapsed / meta.hardness);
          this.breakOverlayMesh.visible = true;
          this.breakOverlayMesh.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);
          (this.breakOverlayMesh.material as THREE.MeshBasicMaterial).opacity = 0.22 + progress * 0.68;

          if (this.miningElapsed >= meta.hardness) {
            this.miningElapsed = 0;
            this.miningBlockKey = '';
            this.breakOverlayMesh.visible = false;
            audioEngine.playBlockBreak();
            this.callbacks.onMineBlock(hit.x, hit.y, hit.z);
          }
          return {
            targetName,
            mineProgress: progress,
          };
        } else {
          this.breakOverlayMesh.visible = false;
        }
      }
    } else {
      this.miningElapsed = 0;
      this.miningBlockKey = '';
      this.breakOverlayMesh.visible = false;
    }

    const wantsPlaceWithKey = keyActionHeld && !GUNS[this.heldItemId];
    if (
      this.alive &&
      ((this.mouseDownRight && this.heldItemId !== 'sniper') || wantsPlaceWithKey) &&
      now - this.lastPlaceAt > 190
    ) {
      this.lastPlaceAt = now;
      this.tryPlaceBlock();
    }

    return { targetName, mineProgress: 0 };
  }

  // ---- Main Render Loop ----
  private tick = (): void => {
    if (this.disposed) return;

    const now = performance.now();
    const rawDt = (now - this.lastTime) / 1000;
    this.lastTime = now;
    const dt = Math.min(rawDt, 0.05);

    this.fpsFrames += 1;
    if (now - this.fpsWindowAt >= 500) {
      this.currentFps = Math.max(1, Math.round((this.fpsFrames * 1000) / (now - this.fpsWindowAt)));
      this.fpsFrames = 0;
      this.fpsWindowAt = now;
    }

    if (this.mode === 'menu') {
      // Clean static hero camera framing (no spinning)
      this.camera.position.set(6.4, 4.4, 9.2);
      this.camera.lookAt(-0.4, 2.0, 0.2);
    } else {
      if (this.alive) {
        const subSteps = dt > 0.02 ? 2 : 1;
        const subDt = dt / subSteps;
        for (let s = 0; s < subSteps; s++) {
          this.stepPhysics(subDt);
        }
      }

      const curCx = Math.floor(this.px / CHUNK_SIZE);
      const curCz = Math.floor(this.pz / CHUNK_SIZE);
      if (this.chunks.size === 0 || curCx !== this.lastChunkCx || curCz !== this.lastChunkCz) {
        this.lastChunkCx = curCx;
        this.lastChunkCz = curCz;
        this.updateActiveChunks(false, this.chunks.size === 0);
      }
      this.processChunkGenQueue(this.isSoftwareGl ? 1 : 2, this.isSoftwareGl ? 2.5 : 2.2);
      this.rebuildDirtyChunks(this.isSoftwareGl ? 2 : 3, this.isSoftwareGl ? 3.2 : 2.6);

      // Update camera smoothly with ZERO random shake or camera head-bob BEFORE combat raycasts
      this.recoilPitch = THREE.MathUtils.damp(this.recoilPitch, 0, 18, dt);
      const bobY = Math.sin(this.walkBob) * 0.016 * this.bobBlend;
      const bobX = Math.cos(this.walkBob * 0.5) * 0.01 * this.bobBlend;

      this.camera.position.set(this.px, this.py + this.currentEyeHeight, this.pz);
      this.camera.rotation.order = 'YXZ';
      this.camera.rotation.y = this.yaw;
      this.camera.rotation.x = Math.max(-1.54, Math.min(1.54, this.pitch + this.recoilPitch));
      this.camera.rotation.z = 0;
      this.camera.updateMatrixWorld(true);

      const { targetName, mineProgress } = this.handleCombatAndMining(dt);

      // Keep drifting flat Minecraft clouds, square sun & shadow-casting directional sun centered around player
      const drift = now * 0.0018;
      for (const ch of this.worldClouds.children) {
        const ud = ch.userData as { baseX: number; baseY: number; baseZ: number };
        const relX = ((((ud.baseX + drift - this.px) % 180) + 270) % 180) - 90;
        const relZ = ((((ud.baseZ - this.pz) % 180) + 270) % 180) - 90;
        ch.position.set(this.px + relX, ud.baseY, this.pz + relZ);
      }
      this.sunMesh.position.set(this.px + 60, 88, this.pz - 68);
      this.sunMesh.lookAt(this.px, 22, this.pz);
      this.waterMaterial.opacity = 0.76 + Math.sin(now * 0.0024) * 0.04;
      this.sunLight.position.set(this.px + 38, 68, this.pz + 28);
      this.sunLight.target.position.set(this.px, 20, this.pz);

      // Viewmodel animation (hide weapon model while zoomed into sniper scope optic)
      const scopeActive = this.isScopeActive();
      this.viewModel.root.visible = this.mode === 'playing' && this.alive && !scopeActive;
      this.recoilOffset = THREE.MathUtils.damp(this.recoilOffset, 0, 18, dt);
      if (this.muzzleFlashTimer > 0) {
        this.muzzleFlashTimer -= dt;
        if (this.muzzleFlashTimer <= 0) this.viewModel.muzzleFlash.visible = false;
      }
      if (this.swingTimer > 0) {
        this.swingTimer = Math.max(0, this.swingTimer - dt);
      }
      const reloadTilt =
        this.reloadingUntil > now
          ? Math.sin(((this.reloadingUntil - now) / Math.max(1, this.activeReloadMs)) * Math.PI) * 0.65
          : 0;
      const swingRot = this.swingTimer > 0 ? Math.sin(this.swingTimer * 28) * 0.55 : 0;
      const crouchVmDrop = this.crouching ? -0.04 : 0;
      this.viewModel.root.position.set(
        0.32 + bobX * 0.55,
        -0.28 + crouchVmDrop + bobY * 0.55 - reloadTilt * 0.14,
        -0.48 + this.recoilOffset
      );
      this.viewModel.root.rotation.set(-reloadTilt + swingRot + this.recoilOffset * 1.4, 0, -swingRot * 0.4);

      // Animate CTF flags waving smoothly
      if (this.ctfFlagRed.visible && this.ctfFlagRed.userData.banner) {
        (this.ctfFlagRed.userData.banner as THREE.Group).rotation.y = Math.sin(now * 0.004) * 0.25;
      }
      if (this.ctfFlagBlue.visible && this.ctfFlagBlue.userData.banner) {
        (this.ctfFlagBlue.userData.banner as THREE.Group).rotation.y = Math.sin(now * 0.004 + 1.2) * 0.25;
      }

      // Interpolate remote players (two-handed gun stance when holding a firearm)
      for (const actor of this.remoteActors.values()) {
        const g = actor.rig.group;
        const distMove = Math.hypot(actor.targetX - g.position.x, actor.targetZ - g.position.z);
        g.position.x = THREE.MathUtils.damp(g.position.x, actor.targetX, 14, dt);
        g.position.y = THREE.MathUtils.damp(g.position.y, actor.targetY, 14, dt);
        g.position.z = THREE.MathUtils.damp(g.position.z, actor.targetZ, 14, dt);
        g.rotation.y = actor.targetYaw;
        actor.rig.head.rotation.x = actor.targetPitch * 0.7;
        const isHoldingGun = Boolean(GUNS[actor.heldItemId]);
        if (isHoldingGun) {
          actor.rig.rightArm.rotation.set(actor.targetPitch * 0.65 + Math.PI * 0.44, 0.12, -0.06);
          actor.rig.leftArm.rotation.set(actor.targetPitch * 0.65 + Math.PI * 0.46, 0.56, 0.28);
        } else {
          actor.rig.rightArm.rotation.set(actor.targetPitch * 0.65 + Math.PI * 0.45, 0, 0);
        }
        setCharacterCrouchPose(actor.rig, actor.crouching, dt);

        if (actor.rig.carrierFlagRed.visible && actor.rig.carrierFlagRed.userData.banner) {
          (actor.rig.carrierFlagRed.userData.banner as THREE.Group).rotation.y = Math.sin(now * 0.006) * 0.28;
        }
        if (actor.rig.carrierFlagBlue.visible && actor.rig.carrierFlagBlue.userData.banner) {
          (actor.rig.carrierFlagBlue.userData.banner as THREE.Group).rotation.y = Math.sin(now * 0.006) * 0.28;
        }

        if (distMove > 0.02) {
          actor.walkPhase += dt * (actor.sprinting && !actor.crouching ? 14 : actor.crouching ? 6 : 9);
          const legSwing = Math.sin(actor.walkPhase) * (actor.crouching ? 0.4 : 0.65);
          actor.rig.leftLeg.rotation.x = legSwing;
          actor.rig.rightLeg.rotation.x = -legSwing;
          if (!isHoldingGun) {
            actor.rig.leftArm.rotation.set(-legSwing * 0.5, 0, 0);
          }
        } else {
          actor.rig.leftLeg.rotation.x = THREE.MathUtils.damp(actor.rig.leftLeg.rotation.x, 0, 12, dt);
          actor.rig.rightLeg.rotation.x = THREE.MathUtils.damp(actor.rig.rightLeg.rotation.x, 0, 12, dt);
          if (!isHoldingGun) {
            actor.rig.leftArm.rotation.x = THREE.MathUtils.damp(actor.rig.leftArm.rotation.x, 0, 12, dt);
            actor.rig.leftArm.rotation.y = THREE.MathUtils.damp(actor.rig.leftArm.rotation.y, 0, 12, dt);
            actor.rig.leftArm.rotation.z = THREE.MathUtils.damp(actor.rig.leftArm.rotation.z, 0, 12, dt);
          }
        }
      }

      // Animate floating world drops
      for (const drop of this.worldDrops.values()) {
        drop.mesh.rotation.y += dt * 2.1;
        drop.mesh.position.y = drop.baseY + Math.sin(now * 0.004 + drop.phase) * 0.11;
      }

      // Network movement sync (20 Hz)
      if (now - this.lastNetMoveAt >= 50 && this.alive) {
        this.lastNetMoveAt = now;
        const sprintHeldNet =
          this.keys.has(this.keybinds.sprint) ||
          (this.keybinds.sprint === 'ShiftLeft' && this.keys.has('ShiftRight')) ||
          this.touchSprint;
        const sprinting = sprintHeldNet && !this.crouching;
        this.callbacks.onMoveSend({
          x: this.px,
          y: this.py,
          z: this.pz,
          yaw: this.yaw,
          pitch: this.pitch,
          sprinting,
          crouching: this.crouching,
          heldItemId: this.heldItemId,
        });
      }

      // HUD tick (~15 Hz)
      if (now - this.lastHudAt >= 66) {
        this.lastHudAt = now;
        const reloadProgress =
          this.reloadingUntil > now ? 1 - (this.reloadingUntil - now) / Math.max(1, this.activeReloadMs) : 0;
        this.callbacks.onHudTick({
          x: Math.round(this.px),
          y: Math.round(this.py),
          z: Math.round(this.pz),
          yaw: this.yaw,
          stamina: Math.round(this.stamina),
          crouching: this.crouching,
          scoped: scopeActive,
          targetBlockName: targetName,
          mineProgress,
          reloadProgress,
          pointerLocked: this.pointerLocked,
          fps: this.currentFps,
        });
      }
    }

    // Update particles & tracers
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const pt = this.particles[i];
      pt.life -= dt;
      if (pt.life <= 0) {
        this.scene.remove(pt.mesh);
        this.particles.splice(i, 1);
        continue;
      }
      pt.vy -= 14 * dt;
      pt.mesh.position.x += pt.vx * dt;
      pt.mesh.position.y += pt.vy * dt;
      pt.mesh.position.z += pt.vz * dt;
      const s = Math.max(0.1, pt.life / pt.maxLife);
      pt.mesh.scale.setScalar(s);
    }

    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const tr = this.tracers[i];
      tr.life -= dt;
      if (tr.life <= 0) {
        this.scene.remove(tr.mesh);
        tr.mesh.geometry.dispose();
        (tr.mesh.material as THREE.Material).dispose();
        this.tracers.splice(i, 1);
      } else {
        (tr.mesh.material as THREE.MeshBasicMaterial).opacity = Math.min(1, tr.life * 10);
      }
    }

    this.renderer.render(this.scene, this.camera);

    if (this.isSoftwareGl) {
      this.afterDraw(this.tick);
    } else {
      this.frameId = requestAnimationFrame(this.tick);
    }
  };

  private afterDraw(cb: () => void): void {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    const sync = gl.fenceSync?.(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      if (this.disposed) return;
      const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
      if (state === gl.UNSIGNALED) {
        this.frameId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        this.frameId = window.setTimeout(cb, 80);
      }
    };
    this.frameId = window.setTimeout(poll, 5);
  }

  // ---- Input & Lifecycle Listeners ----
  private onResize = (): void => {
    if (this.disposed) return;
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  };

  private onKeyDown = (e: KeyboardEvent): void => {
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    this.keys.add(e.code);
    if (e.code === this.keybinds.reload && this.mode === 'playing') {
      this.triggerReload();
    }
    if (e.code === this.keybinds.scope && !e.repeat && this.mode === 'playing' && this.alive) {
      this.toggleSniperScope();
    }
    if (e.code === this.keybinds.fireOrPlace && !e.repeat && this.mode === 'playing' && this.alive) {
      if (!GUNS[this.heldItemId]) {
        this.lastPlaceAt = performance.now();
        this.tryPlaceBlock();
      }
    }
    if (e.code === this.keybinds.crouch && !e.repeat && this.mode === 'playing' && this.alive) {
      if (this.crouching) {
        if (!this.collidesAtHeight(this.px, this.py, this.pz, PLAYER_HEIGHT)) {
          this.crouching = false;
        }
      } else {
        this.crouching = true;
      }
    }
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.code);
  };

  private onBlur = (): void => {
    this.keys.clear();
    this.mouseDownLeft = false;
    this.mouseDownRight = false;
    this.scoped = false;
  };

  private onMouseMove = (e: MouseEvent): void => {
    if (!this.pointerLocked || this.mode !== 'playing' || !this.alive) return;
    const sensScale = this.isScopeActive() ? 0.36 : 1.0;
    this.yaw -= e.movementX * this.settings.sensitivity * sensScale;
    this.pitch = Math.max(-1.54, Math.min(1.54, this.pitch - e.movementY * this.settings.sensitivity * sensScale));
  };

  private onMouseDown = (e: MouseEvent): void => {
    if (this.mode !== 'playing' || !this.alive) return;
    if (!this.pointerLocked) {
      if (e.target === this.renderer.domElement) {
        this.requestPointerLock();
      }
      return;
    }
    if (e.button === 0) this.mouseDownLeft = true;
    if (e.button === 2) this.mouseDownRight = true;
  };

  private onMouseUp = (e: MouseEvent): void => {
    if (e.button === 0) this.mouseDownLeft = false;
    if (e.button === 2) this.mouseDownRight = false;
  };

  private onContextMenu = (e: MouseEvent): void => {
    if (this.mode === 'playing') e.preventDefault();
  };

  private onPointerLockChange = (): void => {
    this.pointerLocked = document.pointerLockElement === this.renderer.domElement;
    if (!this.pointerLocked) {
      this.keys.clear();
      this.mouseDownLeft = false;
      this.mouseDownRight = false;
      this.scoped = false;
    }
    this.callbacks.onPointerLockChange(this.pointerLocked);
  };

  private bindEvents(): void {
    window.addEventListener('resize', this.onResize);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    document.addEventListener('mousemove', this.onMouseMove);
    document.addEventListener('mousedown', this.onMouseDown);
    document.addEventListener('mouseup', this.onMouseUp);
    document.addEventListener('contextmenu', this.onContextMenu);
    document.addEventListener('pointerlockchange', this.onPointerLockChange);
    this.renderer.domElement.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
    });
  }

  public dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    document.removeEventListener('mousemove', this.onMouseMove);
    document.removeEventListener('mousedown', this.onMouseDown);
    document.removeEventListener('mouseup', this.onMouseUp);
    document.removeEventListener('contextmenu', this.onContextMenu);
    document.removeEventListener('pointerlockchange', this.onPointerLockChange);

    for (const entry of this.chunks.values()) {
      entry.opaqueMesh?.geometry.dispose();
      entry.waterMesh?.geometry.dispose();
      entry.lavaMesh?.geometry.dispose();
    }
    this.chunks.clear();
    this.atlasTexture.dispose();
    this.breakCrackTexture.dispose();
    this.breakOverlayMesh.geometry.dispose();
    (this.breakOverlayMesh.material as THREE.Material).dispose();
    this.targetWireframe.geometry.dispose();
    (this.targetWireframe.material as THREE.Material).dispose();
    this.sunMesh.geometry.dispose();
    (this.sunMesh.material as THREE.Material).dispose();
    this.disposeObjectTree(this.worldClouds);
    if (this.dioramaGroup) this.disposeObjectTree(this.dioramaGroup);
    this.disposeObjectTree(this.viewModel.root);
    this.chunkMaterial.dispose();
    this.waterMaterial.dispose();
    this.lavaMaterial.dispose();
    this.particleGeo.dispose();
    for (const mat of this.particleMaterials.values()) {
      mat.dispose();
    }
    this.particleMaterials.clear();
    this.clearWorldDrops();
    this.dropGeo.dispose();
    for (const mat of this.dropMaterials.values()) {
      mat.dispose();
    }
    this.dropMaterials.clear();
    this.renderer.dispose();
    if (this.renderer.domElement.parentElement === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
