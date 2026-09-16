import * as Phaser from 'phaser';
import { Socket } from 'socket.io-client';
import {
  TILE_SIZE,
  PLAYER_SPEED,
  PLAYER_SPEED_SPRINT,
  CHARACTER_NAMES,
  availableCharacter,
  characterSpriteSpec,
  defaultCharacterFor,
  CHAR_ANIMS,
  CHAR_IDLE_ANIMS,
} from './constants';
import type { FurnitureItem, FurnitureCatalogEntry } from './furnitureTypes';
import {
  catalogCollisionCells,
  catalogGridEdgeSnap,
  catalogRenderOffset,
  catalogSemanticDepth,
  sheetForCatalogId,
  sheetNeedsEdgeBleed,
  sheetTextures,
} from './sheets';
import { EMOTE_KEYS, emoteFile } from './emotes';
import { AVAILABLE_ANIM_OBJECTS, animObjectForCatalog } from './animObjects';
import { tileFillRect, type TileFillRect } from './tileFill';
import { placementFromPointer, snapToGrid } from './gridPlacement';
import { SURFACE_RENDER_BLEED, surfaceRenderRect } from './surfaceRender';
import { createRepeatedSurfaceCanvas } from './surfaceTexture';
import { nextDecorDepth, resolveDecorDepth } from './furnitureDepth';

// Hooks exposed on window so the React toolbar (+/- zoom, flip buttons)
// can drive the scene without a direct reference.
interface NwWindow extends Window {
  __nwZoom?: (factor: number) => void;
  __nwFlip?: () => void;
  __nwBringToFront?: () => void;
  __nwSendToBack?: () => void;
  __nwGoTo?: (userId: string) => void;
  __nwCaptureMap?: (maxW?: number) => Promise<string | null>;
  // Minimap: live player positions, world bounds, and walk-to-point.
  __nwGetPlayers?: () => Array<{ userId: string; x: number; y: number; name: string; self: boolean }>;
  __nwGetWorldBounds?: () => { width: number; height: number };
  __nwMoveTo?: (x: number, y: number) => void;
  // Minimap hover: scrub the camera to a world point (preview) without moving
  // the player, and end the preview (pan the camera back to the player).
  __nwPreviewAt?: (x: number, y: number) => void;
  __nwEndPreview?: () => void;
  // Avatar head positions in canvas pixels, for DOM video bubbles that follow them.
  __nwGetScreenPositions?: () => Array<{ userId: string; x: number; y: number }>;
}

export interface RoomData {
  id: string;
  name: string;
  type: string;
  capacity: number;
  posX: number;
  posY: number;
  width: number;
  height: number;
}

type PlayerDirection = 'up' | 'down' | 'left' | 'right';

interface RemotePlayer {
  userId: string;
  name: string;
  x: number;
  y: number;
  sprite: Phaser.GameObjects.Container;
  charSprite: Phaser.GameObjects.Sprite;
  nameplate: Nameplate;
  direction: PlayerDirection;
  directionSynced: boolean;
  charName: string;
}

type FurnitureSprite = Phaser.GameObjects.Image | Phaser.GameObjects.Sprite;

interface TileFillDrag {
  room: RoomData;
  startCol: number;
  startRow: number;
  rect: TileFillRect;
}

// A rounded name pill (background Graphics + Text) that resizes to its text.
interface Nameplate {
  container: Phaser.GameObjects.Container;
  setText: (s: string) => void;
}

export interface SpaceSceneData {
  rooms: RoomData[];
  socket: Socket;
  userId: string;
  userName: string;
  workspaceSlug: string;
  character?: string | null;
  spawnDesk?: { x: number; y: number } | null;
  onRoomChange?: (roomId: string | null, roomName: string | null) => void;
  // Decorator callbacks
  onFurniturePlace?: (roomId: string, catalogId: string, col: number, row: number, w: number, h: number, x: number, y: number, depth: number, flip: boolean) => void;
  onFurnitureMove?: (id: string, x: number, y: number) => void;
  onFurnitureRemove?: (id: string) => void;
  onFurnitureTransform?: (id: string, flip: boolean) => void;
  onFurnitureDepth?: (id: string, depth: number) => void;
  onReady?: () => void;
}

export class SpaceScene extends Phaser.Scene {
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: { W: Phaser.Input.Keyboard.Key; A: Phaser.Input.Keyboard.Key; S: Phaser.Input.Keyboard.Key; D: Phaser.Input.Keyboard.Key; Z: Phaser.Input.Keyboard.Key; Q: Phaser.Input.Keyboard.Key };
  private playerContainer!: Phaser.GameObjects.Container;
  private playerSprite!: Phaser.GameObjects.Sprite;
  private playerNameplate!: Nameplate;
  private playerDirection: PlayerDirection = 'down';
  private remotePlayers: Map<string, RemotePlayer> = new Map();
  // Users with "Ne pas déranger" on — their nameplate shows a 🔒 prefix and a
  // closed desk barrier is drawn at their lock anchor.
  private dndUsers: Set<string> = new Set();
  private deskBarriers: Map<string, Phaser.GameObjects.Container> = new Map();
  private deskFootprints: Map<string, { x0: number; y0: number; x1: number; y1: number }> = new Map();
  private rooms: RoomData[] = [];
  // World bounds (px) — the avatar is clamped inside these.
  private worldW = 0;
  private worldH = 0;
  private shiftKey!: Phaser.Input.Keyboard.Key;
  // "My desk" spawn override + 🏠 markers for every claimed desk.
  private spawnDesk: { x: number; y: number } | null = null;
  private deskMarkers: Map<string, Phaser.GameObjects.Container> = new Map();
  private socket!: Socket;
  private userId!: string;
  private userName!: string;
  private workspaceSlug!: string;
  private lastSentX = 0;
  private lastSentY = 0;
  private lastSentDirection: PlayerDirection = 'down';
  private currentRoomId: string | null = null;
  private onRoomChange?: (roomId: string | null, roomName: string | null) => void;
  // Easter egg: type "MJ" to moonwalk 🕺
  private moonwalk = false;
  private keyBuffer = '';
  private playerCharName = defaultCharacterFor('');
  // Unsubscribe thunks for every socket listener, so teardown removes exactly
  // ours (the socket is shared app-wide; a bare socket.off(event) would also
  // drop listeners registered elsewhere).
  private socketSubs: Array<() => void> = [];
  private _torndown = false;
  // Mutes the scene keyboard while a DOM text field is focused (see create()).
  private _syncKeyboardFocus?: () => void;

  // ── Decorator mode state ──────────────────────────────
  private _decoratorMode = false;
  private _eraseMode = false;
  private _collisionMode = false; // painting impassable tiles
  private _painting = false; // a collision brush stroke is in progress
  private _paintedThisStroke = new Set<string>();
  private tileFillDrag: TileFillDrag | null = null;
  // Impassable rectangles (world coords) that block avatar movement.
  private collisionRects: { id: string; x: number; y: number; w: number; h: number }[] = [];
  private wallCollisionRects: { sourceId: string; x: number; y: number; w: number; h: number }[] = [];
  private furnitureSprites: Map<string, FurnitureSprite> = new Map();
  private furnitureCatalogIds: Map<string, string> = new Map();
  // Structural signature per furniture id, so reconcileFurniture() can skip the
  // (vast majority of) unchanged sprites instead of rebuilding them every sync.
  private furnitureSig: Map<string, string> = new Map();
  private ghostSprite: Phaser.GameObjects.Image | null = null;
  private placingCatalogItem: FurnitureCatalogEntry | null = null;
  private selectedFurnitureId: string | null = null;
  private lastSelectionEvent = '';
  // Bright outline drawn around the furniture being moved/selected.
  private selectionGfx!: Phaser.GameObjects.Graphics;
  private onFurniturePlace?: SpaceSceneData['onFurniturePlace'];
  private onFurnitureMove?: SpaceSceneData['onFurnitureMove'];
  private onFurnitureRemove?: SpaceSceneData['onFurnitureRemove'];
  private onFurnitureTransform?: SpaceSceneData['onFurnitureTransform'];
  private onFurnitureDepth?: SpaceSceneData['onFurnitureDepth'];
  private onReady?: () => void;
  private deleteKey!: Phaser.Input.Keyboard.Key;
  private backspaceKey!: Phaser.Input.Keyboard.Key; // alt delete (laptops/Mac without a Suppr key)
  private flipKey!: Phaser.Input.Keyboard.Key;
  // Orientation chosen for the item currently being placed.
  private placingFlip = false;

  // ── Camera pan (drag to look around) ──────────────────
  private _panning = false;
  private _panLastX = 0;
  private _panLastY = 0;
  private _panMoved = false; // did this gesture move past the click threshold?
  private _cameraFollowing = true;
  private _pointerDownX = 0;
  private _pointerDownY = 0;
  // Manual furniture grab/move (decorator select-mode), replaces Phaser drag.
  private _grabbedId: string | null = null;
  private _grabMoved = false;
  private _grabDX = 0;
  private _grabDY = 0;

  constructor() {
    super({ key: 'SpaceScene' });
  }

  init(data: SpaceSceneData) {
    this.rooms = data.rooms;
    this.socket = data.socket;
    this.userId = data.userId;
    this.userName = data.userName;
    this.workspaceSlug = data.workspaceSlug;
    this.onRoomChange = data.onRoomChange;
    this.onFurniturePlace = data.onFurniturePlace;
    this.onFurnitureMove = data.onFurnitureMove;
    this.onFurnitureRemove = data.onFurnitureRemove;
    this.onFurnitureTransform = data.onFurnitureTransform;
    this.onFurnitureDepth = data.onFurnitureDepth;
    this.onReady = data.onReady;
    this.spawnDesk = data.spawnDesk ?? null;
    this.playerCharName = availableCharacter(data.character || this.getCharNameForUser(data.userId));
  }

  preload() {
    // Every decorator sheet (compatibility sheets + full-pack themes + Room Builder).
    sheetTextures().forEach(({ key, file }) => this.load.image(key, file));

    CHARACTER_NAMES.forEach((name) => {
      const spec = characterSpriteSpec(name);
      this.load.spritesheet(`char_${name}_run`, spec.walkFile, {
        frameWidth: spec.frameWidth,
        frameHeight: spec.frameHeight,
      });
      this.load.spritesheet(`char_${name}_idle`, spec.idleFile, {
        frameWidth: spec.frameWidth,
        frameHeight: spec.frameHeight,
      });
    });

    EMOTE_KEYS.forEach((k) => this.load.image(`emote_${k}`, emoteFile(k)));

    AVAILABLE_ANIM_OBJECTS.forEach((o) =>
      this.load.spritesheet(`anim_${o.key}`, o.file, { frameWidth: o.frameW, frameHeight: o.frameH }),
    );
  }

  create() {
    // Create character animations
    CHARACTER_NAMES.forEach((name) => {
      Object.entries(CHAR_ANIMS).forEach(([key, range]) => {
        this.anims.create({
          key: `${name}_${key}`,
          frames: this.anims.generateFrameNumbers(`char_${name}_run`, { start: range.start, end: range.end }),
          frameRate: 10,
          repeat: -1,
        });
      });
      Object.entries(CHAR_IDLE_ANIMS).forEach(([key, range]) => {
        const durations = characterSpriteSpec(name).idleDurations;
        const frames = this.anims.generateFrameNumbers(`char_${name}_idle`, { start: range.start, end: range.end });
        this.anims.create({
          key: `${name}_${key}`,
          // Per-frame durations override the interval in the installed Phaser.
          frames: durations ? frames.map((frame, index) => ({ ...frame, duration: durations[index] })) : frames,
          frameRate: durations ? 10 : 6,
          repeat: -1,
        });
      });
    });

    // Looping animations for animated decor objects
    AVAILABLE_ANIM_OBJECTS.forEach((o) => {
      this.anims.create({
        key: `animobj_${o.key}`,
        frames: this.anims.generateFrameNumbers(`anim_${o.key}`, { start: 0, end: o.frames - 1 }),
        frameRate: o.fps,
        repeat: -1,
      });
    });

    const worldWidth = this.calculateWorldWidth();
    const worldHeight = this.calculateWorldHeight();
    this.worldW = worldWidth;
    this.worldH = worldHeight;

    this.drawBackground(worldWidth, worldHeight);
    // Open sandbox: rooms are no longer drawn as boxes (they only define the
    // area where furniture can be placed). The whole grid is one free space.

    // Create player — at the claimed desk if any, otherwise the first room's center.
    const spawnX = this.spawnDesk ? this.spawnDesk.x : this.rooms[0] ? this.rooms[0].posX + this.rooms[0].width / 2 : 200;
    const spawnY = this.spawnDesk ? this.spawnDesk.y : this.rooms[0] ? this.rooms[0].posY + this.rooms[0].height / 2 : 200;
    const charName = this.playerCharName;
    const { container, sprite, nameplate } = this.createCharacter(spawnX, spawnY, this.userName, charName);
    this.playerContainer = container;
    this.playerSprite = sprite;
    this.playerNameplate = nameplate;

    // Camera — follow without per-frame pixel rounding. Rounding the scroll while
    // also lerping makes the whole scene oscillate by a pixel as you walk (the
    // floor textures appear to shimmer); a smooth sub-pixel follow reads fluid.
    this.cameras.main.setBounds(0, 0, worldWidth, worldHeight);
    this.cameras.main.startFollow(this.playerContainer, false, 0.1, 0.1);
    this.cameras.main.setZoom(1.5);
    this.cameras.main.setBackgroundColor('#e8e4df');

    // Selection outline (drawn above furniture, below UI toasts).
    this.selectionGfx = this.add.graphics();
    this.selectionGfx.setDepth(100);

    // Zoom : mouse wheel + exposed hook for the +/- buttons
    this.input.on('wheel', (_p: unknown, _o: unknown, _dx: number, dy: number) => {
      this.setZoom(this.cameras.main.zoom - dy * 0.0016);
    });
    const nw = window as unknown as NwWindow;
    nw.__nwZoom = (factor: number) => this.setZoom(this.cameras.main.zoom * factor);
    nw.__nwFlip = () => this.applyFlip();
    nw.__nwBringToFront = () => this.restackSelected(true);
    nw.__nwSendToBack = () => this.restackSelected(false);
    nw.__nwGoTo = (userId: string) => this.teleportToUser(userId);
    nw.__nwCaptureMap = (maxW?: number) => this.captureMapThumbnail(maxW);
    nw.__nwGetPlayers = () => [
      { userId: this.userId, x: this.playerContainer.x, y: this.playerContainer.y, name: this.userName, self: true },
      ...Array.from(this.remotePlayers.values()).map((r) => ({
        userId: r.userId, x: r.sprite.x, y: r.sprite.y, name: r.name, self: false,
      })),
    ];
    nw.__nwGetWorldBounds = () => ({ width: this.worldW, height: this.worldH });
    nw.__nwMoveTo = (x: number, y: number) => this.moveTo(x, y);
    nw.__nwPreviewAt = (x: number, y: number) => this.previewAt(x, y);
    nw.__nwEndPreview = () => this.endPreview();
    nw.__nwGetScreenPositions = () => this.getScreenPositions();

    // ── Unified pointer model (works in every mode) ──
    //   • drag empty space → pan the camera (look around)
    //   • simple click     → place / select / erase (decorator) — see pointerup
    //   • drag a furniture → move it (Phaser drag events below; pan is suppressed)
    // Moving the avatar re-locks the camera onto it.
    const PAN_THRESHOLD = 6; // screen px before a press counts as a drag, not a click
    this.input.setDefaultCursor('grab');

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      this._panning = true;
      this._panMoved = false;
      this._pointerDownX = pointer.x;
      this._pointerDownY = pointer.y;
      this._panLastX = pointer.x;
      this._panLastY = pointer.y;
      this._grabbedId = null;
      this._grabMoved = false;
      // Collision brush: paint impassable cells on press + drag.
      if (this._decoratorMode && this._collisionMode) {
        this._painting = true;
        this._paintedThisStroke.clear();
        this.paintCollisionAt(pointer.worldX, pointer.worldY);
        return;
      }
      // Repeatable floor sheets (currently the NestWork lawn) are placed as one
      // rectangle instead of hundreds of individual DB rows. A simple click is
      // still a valid 1×1 fill; dragging grows the live preview.
      if (
        this._decoratorMode &&
        this.placingCatalogItem &&
        sheetForCatalogId(this.placingCatalogItem.id).tileFill &&
        this.beginTileFillDrag(pointer.worldX, pointer.worldY)
      ) {
        this._panning = false;
        return;
      }
      // Drag-to-move only grabs the object that's ALREADY selected — so a drag
      // over the map (even where floor tiles sit) pans the camera instead of
      // snatching a tile. A plain click selects what's under the cursor (see
      // pointerup); a second drag on that selected object then moves it.
      if (this._decoratorMode && !this.placingCatalogItem && !this._eraseMode) {
        const id = this.findFurnitureIdAt(pointer.worldX, pointer.worldY);
        if (id && id === this.selectedFurnitureId) {
          const spr = this.furnitureSprites.get(id)!;
          this._grabbedId = id;
          this._grabDX = spr.x - pointer.worldX;
          this._grabDY = spr.y - pointer.worldY;
        }
      }
    });

    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (!pointer.isDown) return;
      if (this._painting) {
        this.paintCollisionAt(pointer.worldX, pointer.worldY);
        return;
      }
      if (this.tileFillDrag) {
        this.updateTileFillDrag(pointer.worldX, pointer.worldY);
        return;
      }
      const moved = Math.hypot(pointer.x - this._pointerDownX, pointer.y - this._pointerDownY);

      // Moving a grabbed object (never pans).
      if (this._grabbedId) {
        if (moved < PAN_THRESHOLD && !this._grabMoved) return;
        this._grabMoved = true;
        const spr = this.furnitureSprites.get(this._grabbedId);
        if (spr) {
          spr.x = pointer.worldX + this._grabDX;
          spr.y = pointer.worldY + this._grabDY;
        }
        return;
      }

      // Otherwise: pan the camera once the pointer clearly moves.
      if (!this._panning) return;
      if (!this._panMoved) {
        if (moved < PAN_THRESHOLD) return;
        this._panMoved = true;
        if (this._cameraFollowing) {
          this.cameras.main.stopFollow();
          this._cameraFollowing = false;
        }
        this.input.setDefaultCursor('grabbing');
      }
      const cam = this.cameras.main;
      cam.scrollX -= (pointer.x - this._panLastX) / cam.zoom;
      cam.scrollY -= (pointer.y - this._panLastY) / cam.zoom;
      this._panLastX = pointer.x;
      this._panLastY = pointer.y;
    });

    this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      this._panning = false;
      this.refreshDecoratorCursor();

      if (this._painting) {
        this._painting = false;
        return;
      }

      if (this.tileFillDrag) {
        this.finishTileFillDrag();
        return;
      }

      // Finished moving a grabbed object: snap + persist.
      if (this._grabbedId) {
        const id = this._grabbedId;
        const spr = this.furnitureSprites.get(id);
        if (spr && this._grabMoved) {
          const renderOffset = catalogRenderOffset(this.furnitureCatalogIds.get(id) ?? '');
          const logicalX = spr.x - spr.width / 2 - renderOffset.x;
          const logicalY = spr.y - spr.height / 2 - renderOffset.y;
          // Placement, fills and collisions all use a room-relative grid. Moving
          // used to snap to world (0,0), shifting an asset whenever its room had
          // a non-grid-aligned origin.
          const room = this.findRoomAt(pointer.worldX, pointer.worldY) ?? this.findRoomAt(spr.x, spr.y);
          const snapped = snapToGrid(
            logicalX,
            logicalY,
            { x: room?.posX ?? 0, y: room?.posY ?? 0 },
            TILE_SIZE,
          );
          spr.x = snapped.x + spr.width / 2 + renderOffset.x;
          spr.y = snapped.y + spr.height / 2 + renderOffset.y;
          this.onFurnitureMove?.(id, snapped.x, snapped.y);
          this.selectedFurnitureId = id; // keep it selected so R/F act on it right away
        } else {
          this.selectFurnitureAt(pointer.worldX, pointer.worldY); // tap = select
        }
        this._grabbedId = null;
        this._grabMoved = false;
        this.drawSelectionHighlight();
        return;
      }

      // A genuine click (not a pan): place / erase / deselect in the decorator.
      if (!this._panMoved && this._decoratorMode) {
        this.handleDecoratorClick(pointer.worldX, pointer.worldY);
      }
    });

    // Input
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.wasd = {
      W: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.W, false),
      A: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.A, false),
      S: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.S, false),
      D: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.D, false),
      Z: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.Z, false),
      Q: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.Q, false),
    };
    this.deleteKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.DELETE, false);
    // Backspace deletes too (no preventDefault — the text-input focus guard below
    // already mutes the scene keyboard while typing, so chat editing is unaffected).
    this.backspaceKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.BACKSPACE, false);
    this.flipKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.F, false);
    this.shiftKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT, false);

    // ── Easter egg: type "MJ" to toggle moonwalk 🕺 ──
    this.input.keyboard!.on('keydown', (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k.length === 1 && k >= 'a' && k <= 'z') {
        this.keyBuffer = (this.keyBuffer + k).slice(-2);
        if (this.keyBuffer === 'mj') {
          this.moonwalk = !this.moonwalk;
          this.keyBuffer = '';
          this.showToast(this.moonwalk ? '🕺 Moonwalk ON' : 'Moonwalk OFF');
        }
      }
    });

    // ── Don't let the game keyboard hijack text inputs ──
    // Phaser's createCursorKeys() captures Space + arrows and preventDefaults them
    // globally, which swallows the spacebar while you type a message (and WASD/ZQSD
    // would move the avatar in the background). So whenever a text field is focused,
    // mute the scene keyboard + release any held keys, and restore it on blur.
    const kb = this.input.keyboard!;
    const isTextTarget = (el: Element | null) =>
      !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || (el as HTMLElement).isContentEditable);
    this._syncKeyboardFocus = () => {
      if (isTextTarget(document.activeElement)) {
        kb.enabled = false;
        kb.disableGlobalCapture();
        kb.resetKeys(); // drop held keys so the avatar doesn't keep walking
      } else {
        kb.enabled = true;
        kb.enableGlobalCapture();
      }
    };
    window.addEventListener('focusin', this._syncKeyboardFocus);
    window.addEventListener('focusout', this._syncKeyboardFocus);

    // (Furniture moving is handled by the unified pointer model above — no Phaser drag.)

    // Socket events
    this.setupSocketEvents();

    // Join now if the socket is already connected; otherwise the 'connect'
    // handler (in setupSocketEvents) fires the join — exactly once either way,
    // and again on every reconnect.
    if (this.socket.connected) this.joinSpace();

    // Clean up socket listeners + window hooks when the scene goes away
    // (game.destroy() emits these — a free destroy() method is never called).
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.teardown, this);
    this.events.once(Phaser.Scenes.Events.DESTROY, this.teardown, this);

    // Scene is fully built + textures loaded → let React draw any saved furniture
    this.onReady?.();
  }

  update() {
    if (!this.playerContainer) return;

    // ── Minimap hover preview (eased camera + landing ghost) ──
    this.updatePreview();

    // ── Delete / Backspace in decorator mode ──
    const deletePressed =
      Phaser.Input.Keyboard.JustDown(this.deleteKey) || Phaser.Input.Keyboard.JustDown(this.backspaceKey);
    if (this._decoratorMode && this.selectedFurnitureId && deletePressed) {
      this.onFurnitureRemove?.(this.selectedFurnitureId);
      this.selectedFurnitureId = null;
      this.drawSelectionHighlight();
    }

    // Keep the selection outline glued to the item while it's being dragged.
    if (this._grabbedId) this.drawSelectionHighlight();

    // ── Flip (F) — placing ghost or selected item ──
    if (Phaser.Input.Keyboard.JustDown(this.flipKey)) this.applyFlip();

    // ── Ghost sprite follows cursor when placing ──
    if (this._decoratorMode && this.ghostSprite && this.placingCatalogItem && !this.tileFillDrag) {
      const pointer = this.input.activePointer;
      const worldX = pointer.worldX;
      const worldY = pointer.worldY;
      const room = this.findRoomAt(worldX, worldY);
      if (room) {
        const placement = placementFromPointer(
          worldX,
          worldY,
          { x: room.posX, y: room.posY },
          TILE_SIZE,
          catalogGridEdgeSnap(this.placingCatalogItem.id),
        );
        const w = this.placingCatalogItem.w * TILE_SIZE;
        const h = this.placingCatalogItem.h * TILE_SIZE;
        const placingSheet = sheetForCatalogId(this.placingCatalogItem.id);
        const renderOffset = catalogRenderOffset(this.placingCatalogItem.id);
        if (placingSheet.bleedEdges || placingSheet.tileFill) {
          const rendered = surfaceRenderRect(placement.x, placement.y, w, h);
          this.ghostSprite.setPosition(rendered.centerX + renderOffset.x, rendered.centerY + renderOffset.y);
        } else {
          this.ghostSprite.setPosition(
            placement.x + w / 2 + renderOffset.x,
            placement.y + h / 2 + renderOffset.y,
          );
        }
        this.ghostSprite.setVisible(true);
      } else {
        this.ghostSprite.setVisible(false);
      }
    }

    // ── Player movement (disabled in decorator mode) ──
    if (!this._decoratorMode) {
      let vx = 0;
      let vy = 0;

      const left = this.cursors.left.isDown || this.wasd.A.isDown || this.wasd.Q.isDown;
      const right = this.cursors.right.isDown || this.wasd.D.isDown;
      const up = this.cursors.up.isDown || this.wasd.W.isDown || this.wasd.Z.isDown;
      const down = this.cursors.down.isDown || this.wasd.S.isDown;

      // Hold Shift to sprint.
      const speed = this.shiftKey?.isDown ? PLAYER_SPEED_SPRINT : PLAYER_SPEED;
      if (left) vx = -speed;
      else if (right) vx = speed;
      if (up) vy = -speed;
      else if (down) vy = speed;

      if (vx !== 0 && vy !== 0) {
        vx *= 0.707;
        vy *= 0.707;
      }

      const dt = this.game.loop.delta / 1000;
      // Per-axis move so the avatar slides along impassable cells instead of sticking,
      // then clamp inside the world so you can't walk off the map into the void.
      const tryX = Phaser.Math.Clamp(this.playerContainer.x + vx * dt, TILE_SIZE, this.worldW - TILE_SIZE);
      if (vx !== 0 && !this.blockedAt(tryX, this.playerContainer.y)) this.playerContainer.x = tryX;
      const tryY = Phaser.Math.Clamp(this.playerContainer.y + vy * dt, TILE_SIZE, this.worldH - TILE_SIZE);
      if (vy !== 0 && !this.blockedAt(this.playerContainer.x, tryY)) this.playerContainer.y = tryY;

      const charName = this.playerCharName;
      const isMoving = vx !== 0 || vy !== 0;

      // Moving the avatar re-locks the camera onto it (cancels free-look pan).
      if (isMoving && !this._cameraFollowing) {
        this.cameras.main.startFollow(this.playerContainer, false, 0.1, 0.1);
        this._cameraFollowing = true;
      }

      if (isMoving) {
        if (Math.abs(vx) > Math.abs(vy)) {
          this.playerDirection = vx < 0 ? 'left' : 'right';
        } else {
          this.playerDirection = vy < 0 ? 'up' : 'down';
        }
      }
      // Moonwalk 🕺 : the body faces the opposite of the travel direction,
      // so the character glides backwards while "walking" forwards.
      this.updateCharAnim(this.playerSprite, charName, this.playerDirection, isMoving, this.moonwalk);

      // Send position
      const dx = this.playerContainer.x - this.lastSentX;
      const dy = this.playerContainer.y - this.lastSentY;
      if (dx * dx + dy * dy > 4 || this.playerDirection !== this.lastSentDirection) {
        this.lastSentX = this.playerContainer.x;
        this.lastSentY = this.playerContainer.y;
        this.lastSentDirection = this.playerDirection;
        this.socket.emit('space:move', {
          x: this.playerContainer.x,
          y: this.playerContainer.y,
          direction: this.playerDirection,
        });
      }

      // Check room
      this.checkCurrentRoom();
    }

    // Interpolate remote players (always)
    this.remotePlayers.forEach((remote) => {
      const lerpSpeed = 0.15;
      const prevX = remote.sprite.x;
      const prevY = remote.sprite.y;
      remote.sprite.x += (remote.x - remote.sprite.x) * lerpSpeed;
      remote.sprite.y += (remote.y - remote.sprite.y) * lerpSpeed;

      const rmDx = remote.sprite.x - prevX;
      const rmDy = remote.sprite.y - prevY;
      const rmCharName = remote.charName;
      const rmMoving = Math.abs(rmDx) > 0.5 || Math.abs(rmDy) > 0.5;

      if (rmMoving && !remote.directionSynced) {
        if (Math.abs(rmDx) > Math.abs(rmDy)) {
          remote.direction = rmDx < 0 ? 'left' : 'right';
        } else {
          remote.direction = rmDy < 0 ? 'up' : 'down';
        }
      }
      this.updateCharAnim(remote.charSprite, rmCharName, remote.direction, rmMoving);
    });
  }

  // ═══════════════════════════════════════════════════════
  // Public methods — called from React via scene ref
  // ═══════════════════════════════════════════════════════

  setDecoratorMode(enabled: boolean) {
    this._decoratorMode = enabled;
    this._panning = false;
    this._painting = false;
    this.tileFillDrag = null;
    this._grabbedId = null;
    this._grabMoved = false;
    this.refreshDecoratorCursor();

    // Collision markers are only visible while decorating.
    const collisionIds = new Set(this.collisionRects.map((r) => r.id));
    this.furnitureSprites.forEach((spr, id) => {
      if (collisionIds.has(id)) spr.setVisible(enabled);
    });

    // Clear ghost & selection when disabling
    if (!enabled) {
      this.clearGhostSprite();
      this.placingCatalogItem = null;
      this.deselectFurniture();
    }
  }

  // "Move" tool: just disarms the current tile so clicks pan/select instead of
  // placing. Actual drag-to-pan and click-to-select live in the pointer handlers
  // and behave the same whether or not this tool is the highlighted one.
  setMoveMode(enabled: boolean) {
    if (enabled) {
      this.tileFillDrag = null;
      this.placingCatalogItem = null;
      this.clearGhostSprite();
      this.deselectFurniture();
    }
    this.refreshDecoratorCursor();
  }

  setEraseMode(enabled: boolean) {
    this._eraseMode = enabled;
    if (enabled) {
      this.tileFillDrag = null;
      // Erasing and placing are mutually exclusive
      this.placingCatalogItem = null;
      this.clearGhostSprite();
      this.deselectFurniture();
    }
    this.refreshDecoratorCursor();
  }

  setCollisionMode(enabled: boolean) {
    this._collisionMode = enabled;
    if (enabled) {
      this.tileFillDrag = null;
      this.placingCatalogItem = null;
      this.clearGhostSprite();
      this.deselectFurniture();
    }
    this.refreshDecoratorCursor();
  }

  // Draw a 🏠 + owner-name marker at each claimed desk (reconciled in place).
  setDesks(desks: Array<{ userId: string; x: number; y: number; name: string }>) {
    const present = new Set(desks.map((d) => d.userId));
    for (const [uid, m] of [...this.deskMarkers]) {
      if (!present.has(uid)) {
        m.destroy();
        this.deskMarkers.delete(uid);
      }
    }
    for (const d of desks) {
      let m = this.deskMarkers.get(d.userId);
      if (!m) {
        m = this.buildDeskMarker(d.name);
        this.deskMarkers.set(d.userId, m);
      } else {
        (m.getData('label') as Phaser.GameObjects.Text | undefined)?.setText(`🏠 ${d.name}`);
      }
      m.setPosition(d.x, d.y);
    }
  }

  private buildDeskMarker(name: string): Phaser.GameObjects.Container {
    const c = this.add.container(0, 0);
    const label = this.add.text(0, -2, `🏠 ${name}`, {
      fontSize: '11px',
      fontFamily: '"Outfit", "Segoe UI", system-ui, sans-serif',
      fontStyle: '600',
      color: '#7a5c00',
      stroke: '#ffffff',
      strokeThickness: 3,
    });
    label.setOrigin(0.5, 1);
    c.add(label);
    c.setData('label', label);
    c.setDepth(2); // on the floor, under furniture/avatars
    c.setAlpha(0.9);
    return c;
  }

  setPlacingItem(item: FurnitureCatalogEntry | null) {
    this.tileFillDrag = null;
    this.placingCatalogItem = item;
    this.placingFlip = false;
    this.deselectFurniture();

    // Create or update ghost sprite
    if (item) {
      this.createGhostSprite(item);
    } else {
      this.clearGhostSprite();
    }
    this.refreshDecoratorCursor();
  }

  private refreshDecoratorCursor() {
    if (!this.input) return;
    const cursor = !this._decoratorMode
      ? 'grab'
      : this._eraseMode
        ? 'not-allowed'
        : this._collisionMode || this.placingCatalogItem
          ? 'crosshair'
          : 'grab';
    this.input.setDefaultCursor(cursor);
  }

  addFurnitureFromData(item: FurnitureItem) {
    // Remove existing sprite if any (e.g. re-sync)
    this.removeFurnitureSpriteById(item.id);
    this.furnitureCatalogIds.set(item.id, item.catalogId);
    const position = this.snapFurniturePosition(item.x, item.y, item.roomId);

    // Animated decor object: a looping sprite.
    const anim = animObjectForCatalog(item.catalogId);
    if (anim) {
      const spr = this.add.sprite(position.x + anim.frameW / 2, position.y + anim.frameH / 2, `anim_${anim.key}`, 0);
      spr.setDepth(3);
      spr.play(`animobj_${anim.key}`);
      if (item.flip) spr.setFlipX(true);
      this.furnitureSprites.set(item.id, spr);
      return;
    }

    // Collision markers: invisible (except in decorator) impassable cells.
    if (item.catalogId.startsWith('collision')) {
      const cw = item.w * TILE_SIZE;
      const ch = item.h * TILE_SIZE;
      const marker = this.add.image(position.x + cw / 2, position.y + ch / 2, this.ensureCollisionTexture());
      marker.setDisplaySize(cw, ch);
      marker.setDepth(50);
      marker.setVisible(this._decoratorMode);
      this.furnitureSprites.set(item.id, marker);
      this.collisionRects.push({ id: item.id, x: position.x, y: position.y, w: cw, h: ch });
      return;
    }

    const { tex, depth: catDepth, tileFill } = this.sheetForCatalog(item.catalogId);
    const w = item.w * TILE_SIZE;
    const h = item.h * TILE_SIZE;
    const bleedEdges = sheetNeedsEdgeBleed(item.catalogId);
    const rendered = bleedEdges || tileFill ? surfaceRenderRect(position.x, position.y, w, h) : null;
    // Phaser's TileSprite intermittently resolves a loaded source as its
    // black/green missing texture under the Canvas renderer. Build one cached,
    // repeated canvas per surface size and display it as a regular Image.
    const texKey = tileFill && rendered
      ? this.getOrCreateSurfaceTexture(tex, rendered.width, rendered.height)
      : this.getOrCreateFurnitureTexture(tex, item.col, item.row, item.w, item.h, bleedEdges);
    if (!texKey) return;
    const renderOffset = catalogRenderOffset(item.catalogId);
    const img = this.add.image(
      (rendered?.centerX ?? position.x + w / 2) + renderOffset.x,
      (rendered?.centerY ?? position.y + h / 2) + renderOffset.y,
      texKey,
    );
    img.setDepth(this.renderDepthFor(item) ?? catDepth);
    if (item.flip) img.setFlipX(true);
    this.furnitureSprites.set(item.id, img);
    this.syncWallCollisionRects(item.id, item.catalogId, position.x, position.y);
  }

  // Catalog depth is the default; the persisted object index can override it.
  // Equal furniture indices still use the footprint bottom for natural sorting.
  private renderDepthFor(item: FurnitureItem): number | null {
    if (item.catalogId.startsWith('collision')) return null;
    if (animObjectForCatalog(item.catalogId)) return null;
    const { depth: catDepth } = this.sheetForCatalog(item.catalogId);
    const position = this.snapFurniturePosition(item.x, item.y, item.roomId);
    const sortAnchorY = position.y + item.h * TILE_SIZE;
    return resolveDecorDepth(
      catalogSemanticDepth(item.catalogId),
      item.depth,
      catDepth,
      sortAnchorY,
    );
  }

  // Bring the live sprites in line with `items`, touching only what changed:
  //   • new id            → create
  //   • structure changed → recreate that one (catalog/size/flip/depth)
  //   • only x/y changed   → reposition in place (no destroy/create)
  //   • unchanged          → skip
  //   • id gone            → remove
  // Replaces the old "destroy + recreate ALL 295 sprites on every update" path,
  // which made placing/moving a single item rebuild the whole map.
  reconcileFurniture(items: FurnitureItem[]) {
    const incoming = new Set<string>();
    for (const item of items) {
      incoming.add(item.id);
      // Depth is NOT in the signature: a z-order change is applied in place
      // (setDepth) instead of destroying/recreating the sprite.
      const sig = `${item.catalogId}|${item.col}|${item.row}|${item.w}|${item.h}|${item.flip}`;
      if (this.furnitureSprites.has(item.id) && this.furnitureSig.get(item.id) === sig) {
        this.moveFurnitureFromData(item.id, item.x, item.y, item.roomId); // cheap: just position
        const d = this.renderDepthFor(item);
        if (d != null) this.furnitureSprites.get(item.id)?.setDepth(d);
        continue;
      }
      this.addFurnitureFromData(item); // create or recreate just this one
      this.furnitureSig.set(item.id, sig);
    }
    const toRemove: string[] = [];
    for (const id of this.furnitureSprites.keys()) if (!incoming.has(id)) toRemove.push(id);
    for (const id of toRemove) {
      this.removeFurnitureFromData(id);
      this.furnitureSig.delete(id);
    }
  }

  moveFurnitureFromData(id: string, x: number, y: number, roomId?: string) {
    const spr = this.furnitureSprites.get(id);
    if (!spr) return;
    const position = this.snapFurniturePosition(x, y, roomId);
    const renderOffset = catalogRenderOffset(this.furnitureCatalogIds.get(id) ?? '');
    spr.setPosition(
      position.x + spr.width / 2 + renderOffset.x,
      position.y + spr.height / 2 + renderOffset.y,
    );
    this.syncWallCollisionRects(id, this.furnitureCatalogIds.get(id) ?? '', position.x, position.y);
    const collision = this.collisionRects.find((candidate) => candidate.id === id);
    if (collision) {
      collision.x = position.x;
      collision.y = position.y;
    }
  }

  private snapFurniturePosition(x: number, y: number, roomId?: string) {
    const room = roomId ? this.rooms.find((candidate) => candidate.id === roomId) : this.findRoomAt(x, y);
    return snapToGrid(x, y, { x: room?.posX ?? 0, y: room?.posY ?? 0 }, TILE_SIZE);
  }

  removeFurnitureFromData(id: string) {
    this.removeFurnitureSpriteById(id);
    if (this._grabbedId === id) this._grabbedId = null;
    if (this.selectedFurnitureId === id) {
      this.selectedFurnitureId = null;
      this.drawSelectionHighlight();
    }
  }

  screenToWorld(screenX: number, screenY: number): { x: number; y: number } {
    const cam = this.cameras.main;
    const point = cam.getWorldPoint(screenX, screenY);
    return { x: point.x, y: point.y };
  }

  // Grab a downscaled JPEG thumbnail of the whole map (the room fitted into view,
  // players/UI hidden), for a template preview. Briefly zooms out to fit, snapshots
  // one frame, then restores the camera. Resolves null if anything goes wrong.
  captureMapThumbnail(maxW = 360): Promise<string | null> {
    return new Promise((resolve) => {
      const room = this.rooms[0];
      const cam = this.cameras?.main;
      if (!room || !cam) return resolve(null);

      // Save camera + hide everything that isn't the decor.
      const prev = { sx: cam.scrollX, sy: cam.scrollY, zoom: cam.zoom, follow: this._cameraFollowing };
      const hidden: Array<{ setVisible: (v: boolean) => void }> = [];
      const hide = (o?: { visible?: boolean; setVisible?: (v: boolean) => void } | null) => {
        if (o && o.visible && o.setVisible) { o.setVisible(false); hidden.push(o as { setVisible: (v: boolean) => void }); }
      };
      hide(this.playerContainer);
      this.remotePlayers.forEach((r) => hide(r.sprite));
      hide(this.selectionGfx);
      hide(this.ghostSprite);

      cam.stopFollow();
      const W = this.scale.width || 1;
      const H = this.scale.height || 1;
      const z = Math.min(W / room.width, H / room.height);
      cam.setZoom(z);
      cam.centerOn(room.posX + room.width / 2, room.posY + room.height / 2);

      const restore = () => {
        hidden.forEach((o) => o.setVisible(true));
        cam.setZoom(prev.zoom);
        cam.setScroll(prev.sx, prev.sy);
        if (prev.follow && this.playerContainer) cam.startFollow(this.playerContainer, false, 0.1, 0.1);
      };

      try {
        // Snapshot fires after the next render (with the fitted camera applied).
        this.game.renderer.snapshot((image) => {
          restore();
          try {
            const img = image as HTMLImageElement;
            const sw = img.width || W;
            const sh = img.height || H;
            const scale = Math.min(1, maxW / sw);
            const cw = Math.max(1, Math.round(sw * scale));
            const ch = Math.max(1, Math.round(sh * scale));
            const c = document.createElement('canvas');
            c.width = cw;
            c.height = ch;
            const ctx = c.getContext('2d');
            if (!ctx) return resolve(null);
            ctx.drawImage(img, 0, 0, cw, ch);
            resolve(c.toDataURL('image/jpeg', 0.72));
          } catch {
            resolve(null);
          }
        });
      } catch {
        restore();
        resolve(null);
      }
    });
  }

  // ═══════════════════════════════════════════════════════
  // Private helpers
  // ═══════════════════════════════════════════════════════

  // Register a socket listener and remember how to remove it in teardown().
  private subscribe<T>(event: string, handler: (data: T) => void) {
    this.socket.on(event, handler as (...args: unknown[]) => void);
    this.socketSubs.push(() => this.socket.off(event, handler as (...args: unknown[]) => void));
  }

  // (Re)join the space at the current position. Called on initial connect and on
  // every reconnect (the server drops us on disconnect → removePlayer).
  private joinSpace() {
    this.socket.emit('space:join', {
      workspaceSlug: this.workspaceSlug,
      x: this.playerContainer?.x ?? this.lastSentX,
      y: this.playerContainer?.y ?? this.lastSentY,
      direction: this.playerDirection,
    });
  }

  private setupSocketEvents() {
    // Re-join on (re)connect; otherwise presence goes stale both ways.
    this.subscribe('connect', () => this.joinSpace());

    this.subscribe('space:players', (players: Array<{ userId: string; name: string; x: number; y: number; direction?: PlayerDirection; character?: string | null; dnd?: boolean; lockX?: number; lockY?: number }>) => {
      const present = new Set(players.map((p) => p.userId));
      players.forEach((p) => {
        if (p.userId !== this.userId) {
          const remote = this.remotePlayers.get(p.userId);
          if (remote) {
            remote.x = p.x;
            remote.y = p.y;
            if (p.direction) {
              remote.direction = p.direction;
              remote.directionSynced = true;
            }
          } else {
            this.addRemotePlayer(p.userId, p.name, p.x, p.y, p.character, p.direction);
          }
        }
        // Apply lock state + desk barrier (self included, so our own desk re-closes
        // after a reconnect — the roster is authoritative for the anchor).
        this.applyDnd(p.userId, !!p.dnd, p.lockX, p.lockY);
      });
      // Drop avatars for anyone no longer in the authoritative list (refresh /
      // reconnect cleans up ghosts left by a missed player-left).
      for (const [uid, remote] of [...this.remotePlayers]) {
        if (!present.has(uid)) {
          remote.sprite.destroy();
          this.remotePlayers.delete(uid);
          this.applyDnd(uid, false); // tear down a ghost's lock barrier too
        }
      }
    });

    this.subscribe('space:player-joined', (data: { userId: string; name: string; x: number; y: number; direction?: PlayerDirection; character?: string | null; dnd?: boolean; lockX?: number; lockY?: number }) => {
      if (data.userId !== this.userId) {
        this.addRemotePlayer(data.userId, data.name, data.x, data.y, data.character, data.direction);
        this.applyDnd(data.userId, !!data.dnd, data.lockX, data.lockY);
      }
    });

    // Live "Ne pas déranger" toggle (self echo or a remote player). x/y is the
    // lock anchor where the closed-desk barrier is drawn.
    this.subscribe('space:player-dnd', (data: { userId: string; dnd: boolean; x?: number; y?: number }) => {
      this.applyDnd(data.userId, data.dnd, data.x, data.y);
    });

    // Live avatar/skin change (self or a remote player)
    this.subscribe('space:player-skin', (data: { userId: string; character: string }) => {
      this.applySkin(data.userId, data.character);
    });

    // Live nickname change (self or a remote player)
    this.subscribe('space:player-name', (data: { userId: string; name: string }) => {
      this.applyName(data.userId, data.name);
    });

    // Reaction emote (self or a remote player)
    this.subscribe('space:player-emote', (data: { userId: string; emote: string }) => {
      this.showEmote(data.userId, data.emote);
    });

    this.subscribe('space:player-moved', (data: { userId: string; x: number; y: number; direction?: PlayerDirection }) => {
      const remote = this.remotePlayers.get(data.userId);
      if (remote) {
        remote.x = data.x;
        remote.y = data.y;
        if (data.direction) {
          remote.direction = data.direction;
          remote.directionSynced = true;
        }
      }
    });

    this.subscribe('space:player-left', (data: { userId: string }) => {
      const remote = this.remotePlayers.get(data.userId);
      if (remote) {
        remote.sprite.destroy();
        this.remotePlayers.delete(data.userId);
      }
      this.applyDnd(data.userId, false); // drop their lock barrier + footprint
    });
  }

  private addRemotePlayer(userId: string, name: string, x: number, y: number, character?: string | null, direction?: PlayerDirection) {
    if (this.remotePlayers.has(userId)) return;
    const charName = availableCharacter(character || this.getCharNameForUser(userId));
    const { container, sprite, nameplate } = this.createCharacter(x, y, name, charName);
    this.remotePlayers.set(userId, {
      userId,
      name,
      x,
      y,
      sprite: container,
      charSprite: sprite,
      nameplate,
      direction: direction ?? 'down',
      directionSynced: direction !== undefined,
      charName,
    });
    this.renderNameplate(userId);
  }

  // Swap a player's character sprite live (self or remote).
  private applySkin(userId: string, character: string) {
    if (!CHARACTER_NAMES.includes(character)) return;
    if (userId === this.userId) {
      this.playerCharName = character;
      this.playerSprite.setTexture(`char_${character}_idle`);
      this.playerSprite.setScale(characterSpriteSpec(character).scale);
      this.playerSprite.play(`${character}_idle_${this.playerDirection}`);
    } else {
      const remote = this.remotePlayers.get(userId);
      if (remote) {
        remote.charName = character;
        remote.charSprite.setTexture(`char_${character}_idle`);
        remote.charSprite.setScale(characterSpriteSpec(character).scale);
        remote.charSprite.play(`${character}_idle_${remote.direction}`);
      }
    }
  }

  // Pop a reaction emote bubble above a player (self or remote).
  private showEmote(userId: string, key: string) {
    if (!EMOTE_KEYS.includes(key)) return;
    const container = userId === this.userId ? this.playerContainer : this.remotePlayers.get(userId)?.sprite;
    if (!container) return;
    const tex = `emote_${key}`;
    if (!this.textures.exists(tex)) return;
    const e = this.add.image(0, -70, tex);
    e.setDepth(60);
    container.add(e);
    e.setScale(0);
    this.tweens.add({ targets: e, scale: 1, duration: 200, ease: 'Back.easeOut' });
    this.tweens.add({ targets: e, y: -92, alpha: 0, delay: 1600, duration: 500, onComplete: () => e.destroy() });
  }

  // Flip (F) the placing ghost or the selected item horizontally.
  private applyFlip() {
    if (this.placingCatalogItem) {
      this.placingFlip = !this.placingFlip;
      this.ghostSprite?.setFlipX(this.placingFlip);
      return;
    }
    if (this._decoratorMode && this.selectedFurnitureId) {
      const spr = this.furnitureSprites.get(this.selectedFurnitureId);
      if (!spr) return;
      const fl = !spr.flipX;
      spr.setFlipX(fl);
      this.onFurnitureTransform?.(this.selectedFurnitureId, fl);
      this.drawSelectionHighlight(); // bounds changed → refit the outline
    }
  }

  // Teleport the local player next to a remote player and recenter the camera.
  private teleportToUser(userId: string) {
    const remote = this.remotePlayers.get(userId);
    if (!remote) return;
    const tx = remote.sprite.x;
    const ty = remote.sprite.y + TILE_SIZE; // stand just below them
    this.playerContainer.x = tx;
    this.playerContainer.y = ty;
    this.lastSentX = tx;
    this.lastSentY = ty;
    this.socket.emit('space:move', { x: tx, y: ty, direction: this.playerDirection });
    this.recenterWithFx(tx, ty);
    this.checkCurrentRoom();
  }

  // Walk the local player to a world point (minimap click), clamped to the map.
  private moveTo(x: number, y: number) {
    if (!this.playerContainer) return;
    const tx = Phaser.Math.Clamp(x, TILE_SIZE, this.worldW - TILE_SIZE);
    const ty = Phaser.Math.Clamp(y, TILE_SIZE, this.worldH - TILE_SIZE);
    this.playerContainer.x = tx;
    this.playerContainer.y = ty;
    this.lastSentX = tx;
    this.lastSentY = ty;
    this.socket.emit('space:move', { x: tx, y: ty, direction: this.playerDirection });
    this.recenterWithFx(tx, ty);
    this.checkCurrentRoom();
  }

  // ── Minimap hover preview ─────────────────────────────
  // Scout the destination WITHOUT moving the player: the camera eases toward the
  // target and a translucent "ghost" of your avatar marks the exact landing tile.
  // Two anti-nausea guards: (1) a dwell gate — the camera only begins gliding
  // once the cursor settles, so a quick pass-over never lurches the screen;
  // (2) a damped per-frame lerp instead of an instant centerOn, so it glides.
  private _previewing = false; // cursor is on the minimap (a hover session is open)
  private _previewActive = false; // dwell passed → camera is gliding / ghost shown
  private _previewTargetX = 0;
  private _previewTargetY = 0;
  private _previewCamX = 0; // eased camera centre, chases the target
  private _previewCamY = 0;
  private _previewLastMove = 0; // time of the last cursor move (dwell gate)
  private _previewGhost?: Phaser.GameObjects.Container;
  private _previewGhostChar = ''; // char the ghost was built for (rebuild if it changes)
  private static PREVIEW_DWELL = 110; // ms the cursor must settle before the glide starts
  private static PREVIEW_LERP = 0.14; // camera damping per frame (lower = softer)

  // Called on every minimap mouse-move: just record the target + the move time.
  // The actual glide and ghost placement happen in update() once the dwell passes.
  private previewAt(x: number, y: number) {
    if (!this.playerContainer) return;
    this._previewTargetX = Phaser.Math.Clamp(x, 0, this.worldW);
    this._previewTargetY = Phaser.Math.Clamp(y, 0, this.worldH);
    this._previewLastMove = this.time.now;
    this._previewing = true;
  }

  // Per-frame: gate on dwell, then ease the camera + ghost toward the target.
  private updatePreview() {
    if (!this._previewing || !this.playerContainer) return;
    const cam = this.cameras.main;
    if (!this._previewActive) {
      // Dwell gate: wait for the cursor to settle so fast sweeps don't move us.
      if (this.time.now - this._previewLastMove < SpaceScene.PREVIEW_DWELL) return;
      // Arm: start the glide from the camera's current centre (no jump) and
      // pause follow so the avatar stays put while we scout.
      this._previewActive = true;
      cam.stopFollow();
      this._cameraFollowing = false;
      this._previewCamX = cam.midPoint.x;
      this._previewCamY = cam.midPoint.y;
      this.showPreviewGhost();
    }
    const t = SpaceScene.PREVIEW_LERP;
    this._previewCamX = Phaser.Math.Linear(this._previewCamX, this._previewTargetX, t);
    this._previewCamY = Phaser.Math.Linear(this._previewCamY, this._previewTargetY, t);
    cam.centerOn(this._previewCamX, this._previewCamY);
    this._previewGhost?.setPosition(this._previewTargetX, this._previewTargetY);
  }

  // Leaving the minimap without clicking: hide the ghost and (only if we'd
  // actually moved) glide the camera back to the player.
  private endPreview() {
    if (!this._previewing) return;
    this._previewing = false;
    this.hidePreviewGhost();
    if (!this._previewActive || !this.playerContainer) return;
    this._previewActive = false;
    const cam = this.cameras.main;
    cam.pan(this.playerContainer.x, this.playerContainer.y, 300, 'Sine.easeInOut', true, (_c, progress) => {
      if (progress === 1) {
        cam.startFollow(this.playerContainer, false, 0.1, 0.1);
        this._cameraFollowing = true;
      }
    });
  }

  // The landing marker shown in the world during a preview: a translucent,
  // amber-tinted copy of your own avatar standing on the destination tile, over
  // a soft ground ring. Built lazily and reused; rebuilt if the character changes.
  private showPreviewGhost() {
    if (this._previewGhost && this._previewGhostChar !== this.playerCharName) {
      this._previewGhost.destroy(true);
      this._previewGhost = undefined;
    }
    if (!this._previewGhost) {
      const ring = this.add.ellipse(0, 0, TILE_SIZE * 1.15, TILE_SIZE * 0.5, 0xffc500, 0);
      ring.setStrokeStyle(2, 0xffc500, 0.9);
      const sprite = this.add.sprite(0, 0, `char_${this.playerCharName}_idle`, 0);
      sprite.setOrigin(0.5, 1);
      sprite.setScale(characterSpriteSpec(this.playerCharName).scale);
      sprite.play(`${this.playerCharName}_idle_down`);
      sprite.setAlpha(0.5);
      sprite.setTint(0xffd86b); // warm tint → reads as a marker, not a real avatar
      const c = this.add.container(0, 0, [ring, sprite]);
      c.setDepth(SpaceScene.AVATAR_DEPTH - 1); // on the floor, under real avatars
      this._previewGhost = c;
      this._previewGhostChar = this.playerCharName;
    }
    const g = this._previewGhost;
    g.setVisible(true);
    g.setAlpha(0);
    g.setPosition(this._previewTargetX, this._previewTargetY);
    this.tweens.add({ targets: g, alpha: 1, duration: 160, ease: 'Quad.easeOut' });
  }

  private hidePreviewGhost() {
    const g = this._previewGhost;
    if (!g || !g.visible) return;
    this.tweens.add({
      targets: g,
      alpha: 0,
      duration: 140,
      ease: 'Quad.easeIn',
      onComplete: () => g.setVisible(false),
    });
  }

  // After a teleport the player snaps to (tx, ty) instantly. Rather than letting
  // the camera jump there, pan it across so you SEE where you landed, and drop a
  // brief ring on the spot. Camera follow is paused during the pan, then resumed.
  private recenterWithFx(tx: number, ty: number) {
    const cam = this.cameras.main;
    // A teleport supersedes any in-flight hover preview.
    this._previewing = false;
    this._previewActive = false;
    this.hidePreviewGhost();
    cam.stopFollow();
    this._cameraFollowing = false;
    cam.pan(tx, ty, 420, 'Sine.easeInOut', true, (_c, progress) => {
      if (progress === 1) {
        cam.startFollow(this.playerContainer, false, 0.1, 0.1);
        this._cameraFollowing = true;
      }
    });
    // Landing ping: an amber ring at the feet that expands and fades.
    const ring = this.add.circle(tx, ty, TILE_SIZE * 0.55, 0xffc500, 0);
    ring.setStrokeStyle(3, 0xffc500, 0.95);
    ring.setDepth(SpaceScene.AVATAR_DEPTH - 1); // on the floor, under the avatar
    this.tweens.add({
      targets: ring,
      scale: { from: 0.4, to: 1.7 },
      alpha: { from: 1, to: 0 },
      duration: 650,
      ease: 'Cubic.easeOut',
      onComplete: () => ring.destroy(),
    });
  }

  // Avatars sit above every semantic decor layer. They remain below the
  // decorator overlays (collision markers 50, edit handle 60, selection 100).
  private static AVATAR_DEPTH = 50;
  // Closed-desk barrier footprint, as half-extents (px) around the lock anchor
  // (the locked avatar's feet). The pen is a bit taller above the feet to wrap
  // the body, and short below so the gate sits just in front.
  private static BARRIER_HALF_W = 38;
  private static BARRIER_TOP = 40;
  private static BARRIER_BOTTOM = 16;

  // Avatar head positions in canvas pixels (for DOM video bubbles).
  private getScreenPositions(): Array<{ userId: string; x: number; y: number }> {
    const cam = this.cameras.main;
    if (!cam) return [];
    const view = cam.worldView;
    const z = cam.zoom;
    const HEAD = 76; // world px above the feet — clears the name pill above the head
    const toScreen = (wx: number, wy: number) => ({ x: (wx - view.x) * z, y: (wy - view.y) * z });
    const out: Array<{ userId: string; x: number; y: number }> = [];
    if (this.playerContainer) {
      const s = toScreen(this.playerContainer.x, this.playerContainer.y - HEAD);
      out.push({ userId: this.userId, x: s.x, y: s.y });
    }
    this.remotePlayers.forEach((r) => {
      const s = toScreen(r.sprite.x, r.sprite.y - HEAD);
      out.push({ userId: r.userId, x: s.x, y: s.y });
    });
    return out;
  }

  // Update a player's name tag live (self or remote).
  private applyName(userId: string, name: string) {
    const clean = (name ?? '').toString().trim();
    if (!clean) return;
    if (userId === this.userId) {
      this.userName = clean;
    } else {
      const remote = this.remotePlayers.get(userId);
      if (remote) remote.name = clean;
    }
    this.renderNameplate(userId);
  }

  // "Ne pas déranger": toggle the 🔒 nameplate prefix AND the closed desk barrier
  // for a player (self or remote). x/y is the lock anchor (the barrier is fixed
  // there, it does not follow the avatar). Omitting them (or dnd=false) opens it.
  private applyDnd(userId: string, dnd: boolean, x?: number, y?: number) {
    if (dnd) this.dndUsers.add(userId);
    else this.dndUsers.delete(userId);
    this.renderNameplate(userId);
    if (dnd && x != null && y != null) this.closeDeskBarrier(userId, x, y);
    else this.openDeskBarrier(userId);
  }

  // Draw (and animate shut) the closed-desk barrier at a lock anchor. A square
  // "pen" with corner posts and a gate carrying a 🔒, fixed in world space.
  private closeDeskBarrier(userId: string, x: number, y: number) {
    this.openDeskBarrier(userId); // replace any previous one (e.g. re-lock)

    const HW = SpaceScene.BARRIER_HALF_W;
    const top = -SpaceScene.BARRIER_TOP;
    const bot = SpaceScene.BARRIER_BOTTOM;
    const HONEY = 0xf5a623;
    const POST = 0x2a251f;

    const c = this.add.container(x, y);
    c.setDepth(SpaceScene.AVATAR_DEPTH - 1); // on the floor, under avatars

    // Tinted floor of the closed area.
    const fill = this.add.graphics();
    fill.fillStyle(HONEY, 0.1);
    fill.fillRoundedRect(-HW, top, HW * 2, bot - top, 8);
    // Barrier rails.
    fill.lineStyle(2, HONEY, 0.9);
    fill.strokeRoundedRect(-HW, top, HW * 2, bot - top, 8);
    c.add(fill);

    // Corner posts.
    for (const px of [-HW, HW]) {
      for (const py of [top, bot]) {
        const post = this.add.circle(px, py, 3, POST, 1);
        post.setStrokeStyle(1.5, HONEY, 1);
        c.add(post);
      }
    }

    // Gate badge (🔒) centred on the front rail.
    const lock = this.add.text(0, bot, '🔒', { fontSize: '13px' }).setOrigin(0.5, 0.5);
    c.add(lock);

    this.deskBarriers.set(userId, c);
    this.deskFootprints.set(userId, { x0: x - HW, y0: y + top, x1: x + HW, y1: y + bot });

    // "Closing" pop: scale + fade in.
    c.setScale(0.9);
    c.setAlpha(0);
    this.tweens.add({ targets: c, scale: 1, alpha: 1, duration: 200, ease: 'Back.easeOut' });
  }

  private openDeskBarrier(userId: string) {
    this.deskBarriers.get(userId)?.destroy();
    this.deskBarriers.delete(userId);
    this.deskFootprints.delete(userId);
  }

  // Render a player's nameplate text from its base name + DND lock prefix.
  private renderNameplate(userId: string) {
    const prefix = this.dndUsers.has(userId) ? '🔒 ' : '';
    if (userId === this.userId) {
      this.playerNameplate?.setText(prefix + this.userName);
    } else {
      const remote = this.remotePlayers.get(userId);
      remote?.nameplate.setText(prefix + remote.name);
    }
  }

  private createCharacter(
    x: number,
    y: number,
    name: string,
    charName: string,
  ): { container: Phaser.GameObjects.Container; sprite: Phaser.GameObjects.Sprite; nameplate: Nameplate } {
    const container = this.add.container(x, y);

    // Shadow at the character's feet (container origin)
    const shadow = this.add.ellipse(0, 0, 16, 5, 0x000000, 0.2);
    container.add(shadow);

    // Sprite anchored by its feet, with the same world height for both formats.
    const sprite = this.add.sprite(0, 0, `char_${charName}_idle`, 0);
    sprite.setOrigin(0.5, 1);
    sprite.setScale(characterSpriteSpec(charName).scale);
    sprite.play(`${charName}_idle_down`);
    container.add(sprite);

    const nameplate = this.createNameplate(name);
    nameplate.container.setPosition(0, -50); // bottom of the pill sits just above the head
    container.add(nameplate.container);

    container.setDepth(SpaceScene.AVATAR_DEPTH);
    return { container, sprite, nameplate };
  }

  // Rounded name pill (hive charcoal for everyone). White text (thin dark
  // outline) rendered at RES× then scaled down → crisp despite pixelArt + camera
  // zoom. Resizes to its text.
  private createNameplate(name: string): Nameplate {
    const RES = 3;
    const plate = this.add.container(0, 0);
    const bg = this.add.graphics();
    const txt = this.add.text(0, 0, name, {
      fontSize: `${9 * RES}px`,
      fontFamily: '"Outfit", "Segoe UI", system-ui, sans-serif',
      fontStyle: '600',
      color: '#ffffff',
      stroke: '#2A251F',
      strokeThickness: RES,
      align: 'center',
    });
    txt.setOrigin(0.5, 0.5);
    txt.setScale(1 / RES);
    plate.add(bg);
    plate.add(txt);

    // White text on dark charcoal for everyone.
    const fill = 0x1c1915;
    const alpha = 0.92;
    const redraw = () => {
      const padX = 5;
      const padY = 2;
      const w = Math.ceil(txt.displayWidth) + padX * 2;
      const h = Math.ceil(txt.displayHeight) + padY * 2;
      bg.clear();
      bg.fillStyle(fill, alpha);
      bg.fillRoundedRect(-w / 2, -h, w, h, Math.min(h / 2, 6)); // bottom edge at y=0
      txt.setPosition(0, -h / 2);
    };
    redraw();

    return {
      container: plate,
      setText: (s: string) => {
        txt.setText(s);
        redraw();
      },
    };
  }

  private drawBackground(width: number, height: number) {
    const bg = this.add.graphics();
    bg.fillStyle(0xe8e4df, 1);
    bg.fillRect(0, 0, width, height);

    bg.lineStyle(1, 0xd5d0ca, 0.5);
    for (let x = 0; x <= width; x += TILE_SIZE) {
      bg.lineBetween(x, 0, x, height);
    }
    for (let y = 0; y <= height; y += TILE_SIZE) {
      bg.lineBetween(0, y, width, y);
    }

    // The grid is static, so bake it into a single texture and blit that instead
    // of letting the renderer replay every lineBetween command on every frame
    // (hundreds of stroke ops/frame under the CANVAS renderer). The Graphics is
    // only a stencil here — destroyed once the texture is captured.
    const key = 'bg-grid';
    if (this.textures.exists(key)) this.textures.remove(key);
    bg.generateTexture(key, width, height);
    bg.destroy();
    this.add.image(0, 0, key).setOrigin(0, 0).setDepth(0);
  }

  // ── Furniture texture management ──────────────────────

  // Maps a stored catalogId to its source tileset + render depth via the shared
  // sheet registry (handles legacy furniture_/wall_/floor_ and full-pack sheets).
  private sheetForCatalog(catalogId: string): { tex: string; depth: number; tileFill: boolean; bleedEdges: boolean } {
    const sheet = sheetForCatalogId(catalogId);
    return { tex: sheet.tex, depth: sheet.depth, tileFill: !!sheet.tileFill, bleedEdges: !!sheet.bleedEdges };
  }

  private getOrCreateFurnitureTexture(
    tex: string,
    col: number,
    row: number,
    w: number,
    h: number,
    bleedSurfaceEdges = false,
  ): string | null {
    const source = this.textures.get(tex).getSourceImage() as HTMLImageElement;
    const srcW = source.width;
    const srcH = source.height;

    const srcX = col * TILE_SIZE;
    const srcY = row * TILE_SIZE;
    const pw = w * TILE_SIZE;
    const ph = h * TILE_SIZE;

    if (srcX + pw > srcW || srcY + ph > srcH) return null;

    const bleed = bleedSurfaceEdges ? SURFACE_RENDER_BLEED : 0;
    const baseKey = `tex_${tex}_${col}_${row}_${w}_${h}`;
    const key = bleed > 0 ? `${baseKey}_b${bleed}` : baseKey;
    if (!this.textures.exists(key)) {
      const canvas = document.createElement('canvas');
      canvas.width = pw + bleed;
      canvas.height = ph + bleed;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(source, srcX, srcY, pw, ph, 0, 0, pw, ph);
      if (bleed > 0) {
        // Continue the texture by one pixel instead of stretching it: the first
        // column/row is the expected next pixel when a surface swatch repeats.
        ctx.drawImage(source, srcX, srcY, 1, ph, pw, 0, bleed, ph);
        ctx.drawImage(source, srcX, srcY, pw, 1, 0, ph, pw, bleed);
        ctx.drawImage(source, srcX, srcY, 1, 1, pw, ph, bleed, bleed);
      }
      this.textures.addCanvas(key, canvas);
    }
    return key;
  }

  private getOrCreateSurfaceTexture(tex: string, width: number, height: number): string | null {
    if (!this.textures.exists(tex)) return null;

    const renderWidth = Math.max(1, Math.round(width));
    const renderHeight = Math.max(1, Math.round(height));
    const key = `surface_${tex}_${renderWidth}_${renderHeight}`;
    if (this.textures.exists(key)) return key;

    const source = this.textures.get(tex).getSourceImage() as HTMLImageElement;
    const canvas = createRepeatedSurfaceCanvas(source, renderWidth, renderHeight);
    if (!canvas) return null;
    this.textures.addCanvas(key, canvas);
    return key;
  }

  private syncWallCollisionRects(sourceId: string, catalogId: string, x: number, y: number) {
    this.wallCollisionRects = this.wallCollisionRects.filter((rect) => rect.sourceId !== sourceId);
    const cells = catalogCollisionCells(catalogId);
    if (!cells.length) return;

    const offset = catalogRenderOffset(catalogId);
    for (const cell of cells) {
      this.wallCollisionRects.push({
        sourceId,
        x: x + offset.x + cell.col * TILE_SIZE,
        y: y + offset.y + cell.row * TILE_SIZE,
        w: cell.w * TILE_SIZE,
        h: cell.h * TILE_SIZE,
      });
    }
  }

  private removeFurnitureSpriteById(id: string) {
    const spr = this.furnitureSprites.get(id);
    if (spr) {
      spr.destroy();
      this.furnitureSprites.delete(id);
    }
    this.furnitureCatalogIds.delete(id);
    this.wallCollisionRects = this.wallCollisionRects.filter((rect) => rect.sourceId !== id);
    const ci = this.collisionRects.findIndex((r) => r.id === id);
    if (ci !== -1) this.collisionRects.splice(ci, 1);
  }

  // ── Collisions ────────────────────────────────────────

  private ensureCollisionTexture(): string {
    const key = 'collision_marker';
    if (!this.textures.exists(key)) {
      const c = document.createElement('canvas');
      c.width = TILE_SIZE;
      c.height = TILE_SIZE;
      const ctx = c.getContext('2d')!;
      // Diagonal hatching (propolis): marks the blocked cell while keeping the
      // asset underneath visible — no opaque fill, just stripes + a thin border.
      ctx.strokeStyle = 'rgba(247,127,0,0.6)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      const step = 8;
      for (let d = -TILE_SIZE; d < TILE_SIZE; d += step) {
        ctx.moveTo(d, TILE_SIZE);
        ctx.lineTo(d + TILE_SIZE, 0); // ╱ stripes
      }
      ctx.stroke();
      ctx.strokeStyle = 'rgba(247,127,0,0.85)';
      ctx.lineWidth = 2;
      ctx.strokeRect(1, 1, TILE_SIZE - 2, TILE_SIZE - 2);
      this.textures.addCanvas(key, c);
    }
    return key;
  }

  // Resolve which room a collision click belongs to. Walls and edge decor are
  // drawn right at (or a hair past) a room's border, so a click there can land
  // just outside every room rect — fall back to the nearest room within a short
  // margin instead of giving up. Returns null only for clicks in open space.
  private roomForCollision(worldX: number, worldY: number): RoomData | null {
    const direct = this.findRoomAt(worldX, worldY);
    if (direct) return direct;
    const MARGIN = TILE_SIZE * 3;
    let best: RoomData | null = null;
    let bestDist = Infinity;
    for (const room of this.rooms) {
      const dx = Math.max(room.posX - worldX, 0, worldX - (room.posX + room.width));
      const dy = Math.max(room.posY - worldY, 0, worldY - (room.posY + room.height));
      const dist = Math.hypot(dx, dy);
      if (dist <= MARGIN && dist < bestDist) {
        bestDist = dist;
        best = room;
      }
    }
    return best;
  }

  // Paint one impassable cell at the pointer (snapped to the room grid).
  private paintCollisionAt(worldX: number, worldY: number) {
    const room = this.roomForCollision(worldX, worldY);
    if (!room) return;
    // Clamp into the room: an edge/wall click can fall outside the grid, and the
    // server rejects negative or out-of-room col/row (so the cell never lands).
    const tw = Math.max(1, Math.floor(room.width / TILE_SIZE));
    const th = Math.max(1, Math.floor(room.height / TILE_SIZE));
    const col = Math.min(tw - 1, Math.max(0, Math.floor((worldX - room.posX) / TILE_SIZE)));
    const row = Math.min(th - 1, Math.max(0, Math.floor((worldY - room.posY) / TILE_SIZE)));
    const x = room.posX + col * TILE_SIZE;
    const y = room.posY + row * TILE_SIZE;
    const key = `${x},${y}`;
    if (this._paintedThisStroke.has(key)) return;
    this._paintedThisStroke.add(key);
    // Skip if a collision cell already exists here.
    if (this.collisionRects.some((r) => r.x === x && r.y === y)) return;
    this.onFurniturePlace?.(room.id, `collision_${col}_${row}_1x1`, col, row, 1, 1, x, y, 50, false);
  }

  private beginTileFillDrag(worldX: number, worldY: number): boolean {
    const room = this.findRoomAt(worldX, worldY);
    if (!room) return false;
    const roomCols = Math.max(1, Math.floor(room.width / TILE_SIZE));
    const roomRows = Math.max(1, Math.floor(room.height / TILE_SIZE));
    const startCol = Math.min(roomCols - 1, Math.max(0, Math.floor((worldX - room.posX) / TILE_SIZE)));
    const startRow = Math.min(roomRows - 1, Math.max(0, Math.floor((worldY - room.posY) / TILE_SIZE)));
    const rect = tileFillRect(startCol, startRow, startCol, startRow, roomCols, roomRows);
    this.tileFillDrag = { room, startCol, startRow, rect };
    this.updateTileFillGhost();
    return true;
  }

  private updateTileFillDrag(worldX: number, worldY: number) {
    const drag = this.tileFillDrag;
    if (!drag) return;
    const roomCols = Math.max(1, Math.floor(drag.room.width / TILE_SIZE));
    const roomRows = Math.max(1, Math.floor(drag.room.height / TILE_SIZE));
    const targetCol = Math.floor((worldX - drag.room.posX) / TILE_SIZE);
    const targetRow = Math.floor((worldY - drag.room.posY) / TILE_SIZE);
    drag.rect = tileFillRect(drag.startCol, drag.startRow, targetCol, targetRow, roomCols, roomRows);
    this.updateTileFillGhost();
  }

  private updateTileFillGhost() {
    const drag = this.tileFillDrag;
    const ghost = this.ghostSprite;
    const item = this.placingCatalogItem;
    if (!drag || !ghost || !item) return;
    const w = drag.rect.w * TILE_SIZE;
    const h = drag.rect.h * TILE_SIZE;
    const rendered = surfaceRenderRect(
      drag.room.posX + drag.rect.col * TILE_SIZE,
      drag.room.posY + drag.rect.row * TILE_SIZE,
      w,
      h,
    );
    const tex = sheetForCatalogId(item.id).tex;
    const texture = this.getOrCreateSurfaceTexture(tex, rendered.width, rendered.height);
    if (!texture) {
      ghost.setVisible(false);
      return;
    }
    ghost.setTexture(texture);
    ghost.setPosition(rendered.centerX, rendered.centerY);
    ghost.setVisible(true);
  }

  private finishTileFillDrag() {
    const drag = this.tileFillDrag;
    const item = this.placingCatalogItem;
    this.tileFillDrag = null;
    if (!drag || !item || !sheetForCatalogId(item.id).tileFill) return;
    this.onFurniturePlace?.(
      drag.room.id,
      item.id,
      item.col,
      item.row,
      drag.rect.w,
      drag.rect.h,
      drag.room.posX + drag.rect.col * TILE_SIZE,
      drag.room.posY + drag.rect.row * TILE_SIZE,
      item.depth ?? 1,
      false,
    );
    // Return to a one-cell cursor preview, ready for the next lawn rectangle.
    this.createGhostSprite(item);
  }

  // Does the avatar's feet point fall inside any impassable cell?
  private blockedAt(x: number, y: number): boolean {
    for (const r of this.collisionRects) {
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return true;
    }
    for (const r of this.wallCollisionRects) {
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return true;
    }
    // A closed desk barrier ("Ne pas déranger") is a shut door for everyone.
    //  • My own desk: it's shut on me too — I can't step out until I unlock.
    //  • Someone else's desk: I can't step in from outside.
    if (this.deskFootprints.size && this.playerContainer) {
      const cx = this.playerContainer.x;
      const cy = this.playerContainer.y;
      for (const [uid, fp] of this.deskFootprints) {
        const candIn = x >= fp.x0 && x <= fp.x1 && y >= fp.y0 && y <= fp.y1;
        const curIn = cx >= fp.x0 && cx <= fp.x1 && cy >= fp.y0 && cy <= fp.y1;
        if (uid === this.userId) {
          if (curIn && !candIn) return true; // sealed in: block crossing out
        } else if (candIn && !curIn) {
          return true; // block crossing into a locked peer's desk
        }
      }
    }
    return false;
  }

  // ── Ghost sprite for placement preview ────────────────

  private createGhostSprite(item: FurnitureCatalogEntry) {
    this.clearGhostSprite();

    // Animated object ghost: first frame of its spritesheet.
    const anim = animObjectForCatalog(item.id);
    if (anim) {
      this.ghostSprite = this.add.image(0, 0, `anim_${anim.key}`, 0);
    } else {
      const { tex, tileFill, bleedEdges } = this.sheetForCatalog(item.id);
      const rendered = tileFill
        ? surfaceRenderRect(0, 0, item.w * TILE_SIZE, item.h * TILE_SIZE)
        : null;
      const texKey = tileFill && rendered
        ? this.getOrCreateSurfaceTexture(tex, rendered.width, rendered.height)
        : this.getOrCreateFurnitureTexture(tex, item.col, item.row, item.w, item.h, bleedEdges);
      if (!texKey) return;
      this.ghostSprite = this.add.image(0, 0, texKey);
    }
    this.ghostSprite.setAlpha(0.5);
    this.ghostSprite.setDepth(20);
    this.ghostSprite.setFlipX(this.placingFlip);
    this.ghostSprite.setVisible(false);
  }

  private clearGhostSprite() {
    if (this.ghostSprite) {
      this.ghostSprite.destroy();
      this.ghostSprite = null;
    }
  }

  // ── Selection helpers ─────────────────────────────────

  // A genuine click in decorator mode: erase / place / select (in that priority).
  private handleDecoratorClick(worldX: number, worldY: number) {
    // Erase tool: click any placed object to delete it
    if (this._eraseMode) {
      const id = this.findFurnitureIdAt(worldX, worldY);
      if (id) this.onFurnitureRemove?.(id);
      return;
    }

    // Placing a catalog item: snap to the room grid and emit
    if (this.placingCatalogItem) {
      const room = this.findRoomAt(worldX, worldY);
      if (!room) return;
      const item = this.placingCatalogItem;
      const placement = placementFromPointer(
        worldX,
        worldY,
        { x: room.posX, y: room.posY },
        TILE_SIZE,
        catalogGridEdgeSnap(item.id),
      );
      this.onFurniturePlace?.(
        room.id,
        item.id,
        item.col,
        item.row,
        item.w,
        item.h,
        placement.x,
        placement.y,
        item.depth ?? 3,
        this.placingFlip,
      );
      return;
    }

    // Otherwise, try to select existing furniture
    this.selectFurnitureAt(worldX, worldY);
  }

  private selectFurnitureAt(worldX: number, worldY: number) {
    // Topmost item under the cursor (so you select what you actually see).
    this.selectedFurnitureId = this.findFurnitureIdAt(worldX, worldY);
    this.drawSelectionHighlight();
  }

  private deselectFurniture() {
    this.selectedFurnitureId = null;
    this.drawSelectionHighlight();
  }

  private emitFurnitureSelection() {
    const id = this.selectedFurnitureId;
    const sprite = id ? this.furnitureSprites.get(id) : undefined;
    const canRestack = !!id && !!sprite && this.isRestackable(id);
    const signature = `${id ?? ''}|${canRestack}`;
    if (signature === this.lastSelectionEvent) return;
    this.lastSelectionEvent = signature;
    window.dispatchEvent(new CustomEvent('nw:furniture-selection', {
      detail: { id, canRestack },
    }));
  }

  private isRestackable(id: string): boolean {
    const catalogId = this.furnitureCatalogIds.get(id);
    if (!catalogId || catalogId.startsWith('collision') || animObjectForCatalog(catalogId)) return false;
    const sheet = sheetForCatalogId(catalogId);
    return !sheet.tileFill && sheet.depth > 1;
  }

  private restackSelected(toFront: boolean) {
    const id = this.selectedFurnitureId;
    if (!this._decoratorMode || !id) {
      this.showToast('Sélectionne d’abord un objet');
      return;
    }
    const sprite = this.furnitureSprites.get(id);
    if (!sprite || !this.isRestackable(id)) {
      this.showToast('Cet élément garde un plan fixe');
      return;
    }

    const otherDepths: number[] = [];
    for (const [otherId, otherSprite] of this.furnitureSprites) {
      if (otherId !== id && this.isRestackable(otherId)) otherDepths.push(otherSprite.depth);
    }
    const nextDepth = nextDecorDepth(otherDepths, toFront);
    sprite.setDepth(nextDepth);
    this.onFurnitureDepth?.(id, nextDepth);
    this.drawSelectionHighlight();
    this.showToast(toFront ? 'Objet placé devant' : 'Objet placé derrière');
  }

  // Outline the furniture being moved or selected, so it's obvious which item
  // F (flip) will act on. Tracks the live sprite bounds (flip included) and
  // follows it while dragging.
  private drawSelectionHighlight() {
    this.emitFurnitureSelection();
    const g = this.selectionGfx;
    if (!g) return;
    g.clear();
    const id = this._grabbedId ?? this.selectedFurnitureId;
    if (!id) return;
    const spr = this.furnitureSprites.get(id);
    if (!spr) return;
    const b = spr.getBounds();
    const pad = 2;
    g.lineStyle(2, 0xffc500, 1); // honey — pops on any asset
    g.strokeRect(b.x - pad, b.y - pad, b.width + pad * 2, b.height + pad * 2);
  }

  // Topmost furniture id under a world point (for the erase tool)
  private findFurnitureIdAt(worldX: number, worldY: number): string | null {
    let found: string | null = null;
    let bestDepth = -Infinity;
    for (const [id, spr] of this.furnitureSprites) {
      const left = spr.x - spr.width / 2;
      const right = spr.x + spr.width / 2;
      const top = spr.y - spr.height / 2;
      const bottom = spr.y + spr.height / 2;
      if (worldX >= left && worldX <= right && worldY >= top && worldY <= bottom) {
        if (spr.depth >= bestDepth) {
          bestDepth = spr.depth;
          found = id;
        }
      }
    }
    return found;
  }

  findRoomAt(worldX: number, worldY: number): RoomData | null {
    for (const room of this.rooms) {
      if (
        worldX >= room.posX &&
        worldX <= room.posX + room.width &&
        worldY >= room.posY &&
        worldY <= room.posY + room.height
      ) {
        return room;
      }
    }
    return null;
  }

  private checkCurrentRoom() {
    const room = this.findRoomAt(this.playerContainer.x, this.playerContainer.y);
    const newRoomId = room?.id ?? null;

    if (newRoomId !== this.currentRoomId) {
      this.currentRoomId = newRoomId;
      this.socket.emit('space:room-change', { roomId: newRoomId });
      this.onRoomChange?.(newRoomId, room?.name ?? null);
    }
  }

  private calculateWorldWidth(): number {
    if (this.rooms.length === 0) return 800;
    const maxX = Math.max(...this.rooms.map((r) => r.posX + r.width));
    return Math.max(maxX + 200, 800);
  }

  private calculateWorldHeight(): number {
    if (this.rooms.length === 0) return 600;
    const maxY = Math.max(...this.rooms.map((r) => r.posY + r.height));
    return Math.max(maxY + 200, 600);
  }

  private getCharNameForUser(userId: string): string {
    return defaultCharacterFor(userId);
  }

  private setZoom(z: number) {
    this.cameras.main.setZoom(Phaser.Math.Clamp(z, 0.4, 2.5));
  }

  private opposite(dir: string): string {
    switch (dir) {
      case 'left':  return 'right';
      case 'right': return 'left';
      case 'up':    return 'down';
      case 'down':  return 'up';
      default:      return dir;
    }
  }

  // Pick walk/idle for the given direction and (re)play it only when the anim
  // actually changes — replaying every frame would restart it at frame 0.
  // Shared by the local player and remote peers (moonwalk is local-only).
  private updateCharAnim(
    sprite: Phaser.GameObjects.Sprite,
    charName: string,
    dir: PlayerDirection,
    isMoving: boolean,
    moonwalk = false,
  ) {
    const animDir = moonwalk ? this.opposite(dir) : dir;
    const key = isMoving ? `${charName}_walk_${animDir}` : `${charName}_idle_${dir}`;
    if (sprite.anims.currentAnim?.key !== key) sprite.play(key);
  }

  // Brief on-screen toast (fixed to camera), used by the moonwalk easter egg.
  private showToast(text: string) {
    const cam = this.cameras.main;
    const toast = this.add.text(cam.width / 2, 48, text, {
      fontSize: '16px',
      fontFamily: 'Arial, Helvetica, sans-serif',
      fontStyle: 'bold',
      color: '#ffffff',
      backgroundColor: '#8b6cff',
      padding: { x: 12, y: 8 },
    });
    toast.setOrigin(0.5, 0.5);
    toast.setScrollFactor(0);
    toast.setDepth(1000);
    this.tweens.add({
      targets: toast,
      alpha: 0,
      delay: 1200,
      duration: 600,
      onComplete: () => toast.destroy(),
    });
  }

  // Phaser does NOT call an instance method named destroy() on teardown — it
  // emits SHUTDOWN/DESTROY on this.events (wired in create()). Both can fire for
  // a single game.destroy(), so guard against running twice.
  private teardown() {
    if (this._torndown) return;
    this._torndown = true;

    const nw = window as unknown as NwWindow;
    delete nw.__nwZoom;
    delete nw.__nwFlip;
    delete nw.__nwBringToFront;
    delete nw.__nwSendToBack;
    delete nw.__nwGoTo;
    delete nw.__nwCaptureMap;
    delete nw.__nwGetPlayers;
    delete nw.__nwGetWorldBounds;
    delete nw.__nwMoveTo;
    delete nw.__nwPreviewAt;
    delete nw.__nwEndPreview;
    delete nw.__nwGetScreenPositions;

    if (this._syncKeyboardFocus) {
      window.removeEventListener('focusin', this._syncKeyboardFocus);
      window.removeEventListener('focusout', this._syncKeyboardFocus);
      this._syncKeyboardFocus = undefined;
    }

    this.tweens.killAll();
    this.socketSubs.forEach((off) => off());
    this.socketSubs = [];
    this.socket.emit('space:leave');
  }
}
