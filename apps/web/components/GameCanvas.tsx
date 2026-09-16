'use client';

import { useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from 'react';
import { Socket } from 'socket.io-client';
import type { FurnitureItem, FurnitureCatalogEntry } from '../game/furnitureTypes';
import type { SpaceScene, RoomData } from '../game/SpaceScene';
import { syncDecoratorScene, type DecoratorSceneState } from '../game/decoratorBridge';

interface GameCanvasProps {
  rooms: Array<{
    id: string;
    name: string;
    type: string;
    capacity: number;
    posX: number;
    posY: number;
    width: number;
    height: number;
  }>;
  socket: Socket;
  userId: string;
  userName: string;
  character?: string | null;
  workspaceSlug: string;
  myDesk?: { x: number; y: number } | null;
  desks?: Array<{ userId: string; x: number; y: number; name: string }>;
  onRoomChange?: (roomId: string | null, roomName: string | null) => void;
  // Decorator mode
  decoratorMode?: boolean;
  moveMode?: boolean;
  eraseMode?: boolean;
  collisionMode?: boolean;
  furnitureItems?: FurnitureItem[];
  selectedCatalogItem?: FurnitureCatalogEntry | null;
  onFurniturePlace?: (roomId: string, catalogId: string, col: number, row: number, w: number, h: number, x: number, y: number, depth: number, flip: boolean) => void;
  onFurnitureMove?: (id: string, x: number, y: number) => void;
  onFurnitureRemove?: (id: string) => void;
  onFurnitureTransform?: (id: string, flip: boolean) => void;
  onFurnitureDepth?: (id: string, depth: number) => void;
}

export interface GameCanvasHandle {
  screenToWorld: (screenX: number, screenY: number) => { x: number; y: number } | null;
  findRoomAt: (worldX: number, worldY: number) => RoomData | null;
  getCanvasRect: () => DOMRect | null;
}

export const GameCanvas = forwardRef<GameCanvasHandle, GameCanvasProps>(function GameCanvas(
  {
    rooms,
    socket,
    userId,
    userName,
    character,
    workspaceSlug,
    myDesk,
    desks,
    onRoomChange,
    decoratorMode,
    moveMode,
    eraseMode,
    collisionMode,
    furnitureItems,
    selectedCatalogItem,
    onFurniturePlace,
    onFurnitureMove,
    onFurnitureRemove,
    onFurnitureTransform,
    onFurnitureDepth,
  },
  ref,
) {
  const gameRef = useRef<Phaser.Game | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<SpaceScene | null>(null);
  const sceneReadyRef = useRef(false);
  // Keep stable references to latest callback values
  const callbacksRef = useRef({ onFurniturePlace, onFurnitureMove, onFurnitureRemove, onFurnitureTransform, onFurnitureDepth });
  callbacksRef.current = { onFurniturePlace, onFurnitureMove, onFurnitureRemove, onFurnitureTransform, onFurnitureDepth };
  // Always-fresh reference to the furniture list (used by the ready callback)
  const furnitureRef = useRef(furnitureItems);
  furnitureRef.current = furnitureItems;
  const desksRef = useRef(desks);
  desksRef.current = desks;
  const decoratorStateRef = useRef<DecoratorSceneState>({
    enabled: !!decoratorMode,
    selectedItem: selectedCatalogItem ?? null,
    moveMode: !!moveMode,
    eraseMode: !!eraseMode,
    collisionMode: !!collisionMode,
  });
  decoratorStateRef.current = {
    enabled: !!decoratorMode,
    selectedItem: selectedCatalogItem ?? null,
    moveMode: !!moveMode,
    eraseMode: !!eraseMode,
    collisionMode: !!collisionMode,
  };
  // Spawn-at-desk is read once at mount (the scene spawns immediately).
  const myDeskRef = useRef(myDesk);
  // Always-fresh socket ref: in dev StrictMode the socket can be recreated after
  // mount; the scene must join/listen on the LIVE socket, not a stale closure.
  const socketRef = useRef(socket);
  socketRef.current = socket;

  // Reconcile the scene's furniture sprites with the current list. Safe to call
  // both when the list changes AND once the scene has finished booting.
  const syncFurniture = useCallback(() => {
    const scene = sceneRef.current;
    const items = furnitureRef.current;
    if (!scene || !items) return;
    // Incremental: only new/changed/removed sprites are touched (see the scene).
    scene.reconcileFurniture(items);
  }, []);

  // Expose methods to parent via ref
  useImperativeHandle(ref, () => ({
    screenToWorld: (screenX: number, screenY: number) =>
      sceneRef.current?.screenToWorld(screenX, screenY) ?? null,
    findRoomAt: (worldX: number, worldY: number) =>
      sceneRef.current?.findRoomAt(worldX, worldY) ?? null,
    getCanvasRect: () =>
      containerRef.current?.getBoundingClientRect() ?? null,
  }));

  // Stable callbacks that delegate to the latest ref
  const stableOnPlace = useCallback(
    (roomId: string, catalogId: string, col: number, row: number, w: number, h: number, x: number, y: number, depth: number, flip: boolean) =>
      callbacksRef.current.onFurniturePlace?.(roomId, catalogId, col, row, w, h, x, y, depth, flip),
    [],
  );
  const stableOnMove = useCallback(
    (id: string, x: number, y: number) => callbacksRef.current.onFurnitureMove?.(id, x, y),
    [],
  );
  const stableOnRemove = useCallback(
    (id: string) => callbacksRef.current.onFurnitureRemove?.(id),
    [],
  );
  const stableOnTransform = useCallback(
    (id: string, flip: boolean) => callbacksRef.current.onFurnitureTransform?.(id, flip),
    [],
  );
  const stableOnDepth = useCallback(
    (id: string, depth: number) => callbacksRef.current.onFurnitureDepth?.(id, depth),
    [],
  );
  // Called by the scene once create() has run (textures loaded) → draw saved furniture
  const stableOnReady = useCallback(() => {
    sceneReadyRef.current = true;
    syncFurniture();
    const scene = sceneRef.current;
    if (!scene) return;
    scene.setDesks(desksRef.current ?? []);
    syncDecoratorScene(scene, decoratorStateRef.current);
  }, [syncFurniture]);

  // Initialize Phaser game
  useEffect(() => {
    if (!containerRef.current || gameRef.current) return;

    const container = containerRef.current;
    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;

    // Guard against React StrictMode's double-invoke (which would otherwise
    // create two Phaser games because the dynamic import resolves async).
    let cancelled = false;

    import('phaser').then((Phaser) => {
      import('../game/SpaceScene').then(({ SpaceScene }) => {
        if (cancelled || gameRef.current) return;
        const scene = new SpaceScene();
        sceneRef.current = scene;

        const config: Phaser.Types.Core.GameConfig = {
          type: Phaser.CANVAS,
          parent: container,
          width: w,
          height: h,
          backgroundColor: '#e8e4df',
          pixelArt: true,
          scene: [],
          scale: {
            mode: Phaser.Scale.RESIZE,
            autoCenter: Phaser.Scale.CENTER_BOTH,
          },
          input: {
            keyboard: true,
          },
          render: {
            antialias: false,
            pixelArt: true,
            roundPixels: true,
          },
        };

        const game = new Phaser.Game(config);
        gameRef.current = game;

        game.events.once('ready', () => {
          game.scene.add('SpaceScene', scene, true, {
            rooms,
            socket: socketRef.current ?? socket,
            userId,
            userName,
            character,
            workspaceSlug,
            spawnDesk: myDeskRef.current ?? null,
            onRoomChange,
            onFurniturePlace: stableOnPlace,
            onFurnitureMove: stableOnMove,
            onFurnitureRemove: stableOnRemove,
            onFurnitureTransform: stableOnTransform,
            onFurnitureDepth: stableOnDepth,
            onReady: stableOnReady,
          });
        });
      });
    });

    return () => {
      cancelled = true;
      sceneReadyRef.current = false;
      sceneRef.current = null;
      if (gameRef.current) {
        gameRef.current.destroy(true);
        gameRef.current = null;
      }
    };
    // Only run once on mount — rooms/socket/etc are stable from context
  }, []); // eslint-disable-line

  // ── Bridge: decorator mode ──
  useEffect(() => {
    const scene = sceneRef.current;
    if (sceneReadyRef.current && scene) syncDecoratorScene(scene, decoratorStateRef.current);
  }, [decoratorMode, selectedCatalogItem, moveMode, eraseMode, collisionMode]);

  // ── Bridge: claimed-desk markers ──
  useEffect(() => {
    if (sceneReadyRef.current) sceneRef.current?.setDesks(desks ?? []);
  }, [desks]);

  // ── Bridge: reconcile furniture items from DB/socket ──
  // (also re-applied when the scene signals it's ready, via onReady above)
  useEffect(() => {
    syncFurniture();
  }, [furnitureItems, syncFurniture]);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0"
    />
  );
});
