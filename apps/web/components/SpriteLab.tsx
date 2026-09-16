'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { characterSpriteSpec, TILE_SIZE } from '../game/constants';
import type { FurnitureCatalogEntry } from '../game/furnitureTypes';
import { placementFromPointer } from '../game/gridPlacement';
import {
  catalogGridEdgeSnap,
  catalogRenderOffset,
  familyKeyForSheet,
  sheetForCatalogId,
  sheetFamilies,
  type SheetDef,
} from '../game/sheets';
import { surfaceRenderRect } from '../game/surfaceRender';
import { createRepeatedSurfaceCanvas } from '../game/surfaceTexture';
import styles from './SpriteLab.module.css';

const LAB_WIDTH = 960;
const LAB_HEIGHT = 576;
const ORIGINAL_FAMILIES = sheetFamilies().filter((family) => family.original);
const ORIGINAL_SHEETS = ORIGINAL_FAMILIES.flatMap((family) => family.sheets);

function entriesForSheet(sheet: SheetDef): readonly FurnitureCatalogEntry[] {
  if (sheet.presets) return sheet.presets.filter((item) => !item.hiddenInCatalog);
  if (!sheet.tileFill) return [];

  return [
    {
      id: `${sheet.key}_0_0_1x1`,
      name: sheet.label,
      category: sheet.key,
      col: 0,
      row: 0,
      w: 1,
      h: 1,
      depth: sheet.depth,
    },
  ];
}

interface SpriteLabCanvasProps {
  item: FurnitureCatalogEntry;
  clearSignal: number;
}

function SpriteLabCanvas({ item, clearSignal }: SpriteLabCanvasProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<import('phaser').Game | null>(null);
  const sceneRef = useRef<{ clearPlacements: () => void } | null>(null);
  const itemRef = useRef(item);
  itemRef.current = item;

  useEffect(() => {
    sceneRef.current?.clearPlacements();
  }, [clearSignal]);

  useEffect(() => {
    if (!hostRef.current || gameRef.current) return;

    let cancelled = false;
    const host = hostRef.current;

    void import('phaser').then((Phaser) => {
      if (cancelled || gameRef.current) return;

      type PlacedAsset = {
        sprite: import('phaser').GameObjects.Image;
        logicalBox: import('phaser').GameObjects.Graphics;
        renderedBox: import('phaser').GameObjects.Graphics;
      };

      class SpriteLabScene extends Phaser.Scene {
        private ghost: import('phaser').GameObjects.Image | null = null;
        private ghostSignature = '';
        private logicalPreview!: import('phaser').GameObjects.Graphics;
        private renderedPreview!: import('phaser').GameObjects.Graphics;
        private placed: PlacedAsset[] = [];

        constructor() {
          super({ key: 'SpriteLabScene' });
        }

        preload() {
          const loaded = new Set<string>();
          for (const sheet of ORIGINAL_SHEETS) {
            if (loaded.has(sheet.tex)) continue;
            loaded.add(sheet.tex);
            this.load.image(sheet.tex, sheet.file);
          }

          const aurore = characterSpriteSpec('Aurore');
          this.load.spritesheet('sprite-lab-aurore', aurore.idleFile, {
            frameWidth: aurore.frameWidth,
            frameHeight: aurore.frameHeight,
          });
        }

        create() {
          this.drawGrid();

          const aurore = characterSpriteSpec('Aurore');
          this.add
            .sprite(TILE_SIZE * 3.5, TILE_SIZE * 4, 'sprite-lab-aurore', 18)
            .setScale(aurore.scale)
            .setDepth(10);
          this.add
            .text(TILE_SIZE * 3.5, TILE_SIZE * 5, 'Aurore · 48 px affichés', {
              color: '#273344',
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: '11px',
              backgroundColor: '#fffdf7dd',
              padding: { x: 5, y: 3 },
            })
            .setOrigin(0.5, 0)
            .setDepth(20);

          this.logicalPreview = this.add.graphics().setDepth(80);
          this.renderedPreview = this.add.graphics().setDepth(81);

          this.input.mouse?.disableContextMenu();
          this.input.on('pointermove', (pointer: import('phaser').Input.Pointer) => {
            this.updatePreview(pointer.worldX, pointer.worldY);
          });
          this.input.on('pointerdown', (pointer: import('phaser').Input.Pointer) => {
            if (pointer.rightButtonDown()) {
              this.removeLastPlacement();
              return;
            }
            this.placeCurrent(pointer.worldX, pointer.worldY);
          });

          sceneRef.current = this;
        }

        update() {
          const entry = itemRef.current;
          if (this.ghostSignature !== `${entry.id}:${entry.w}x${entry.h}`) {
            this.destroyGhost();
            this.updatePreview(this.input.activePointer.worldX, this.input.activePointer.worldY);
          }
        }

        clearPlacements() {
          for (const placement of this.placed) {
            placement.sprite.destroy();
            placement.logicalBox.destroy();
            placement.renderedBox.destroy();
          }
          this.placed = [];
        }

        private drawGrid() {
          const background = this.add.graphics();
          background.fillStyle(0xf4f1ea, 1);
          background.fillRect(0, 0, LAB_WIDTH, LAB_HEIGHT);

          for (let row = 0; row < LAB_HEIGHT / TILE_SIZE; row += 1) {
            for (let col = 0; col < LAB_WIDTH / TILE_SIZE; col += 1) {
              if ((row + col) % 2 === 0) {
                background.fillStyle(0xffffff, 0.18);
                background.fillRect(col * TILE_SIZE, row * TILE_SIZE, TILE_SIZE, TILE_SIZE);
              }
            }
          }

          background.lineStyle(1, 0xc9c4ba, 0.72);
          for (let x = 0; x <= LAB_WIDTH; x += TILE_SIZE) background.lineBetween(x, 0, x, LAB_HEIGHT);
          for (let y = 0; y <= LAB_HEIGHT; y += TILE_SIZE) background.lineBetween(0, y, LAB_WIDTH, y);
          background.setDepth(0);
        }

        private getOrCreateTexture(entry: FurnitureCatalogEntry): string | null {
          const sheet = sheetForCatalogId(entry.id);
          if (sheet.tileFill) {
            const rendered = surfaceRenderRect(0, 0, entry.w * TILE_SIZE, entry.h * TILE_SIZE);
            return this.getOrCreateSurfaceTexture(sheet.tex, rendered.width, rendered.height);
          }

          const source = this.textures.get(sheet.tex).getSourceImage() as HTMLImageElement;
          const srcX = entry.col * TILE_SIZE;
          const srcY = entry.row * TILE_SIZE;
          const width = entry.w * TILE_SIZE;
          const height = entry.h * TILE_SIZE;
          if (srcX + width > source.width || srcY + height > source.height) return null;

          const bleed = sheet.bleedEdges ? 1 : 0;
          const key = `sprite-lab-${sheet.tex}-${entry.col}-${entry.row}-${entry.w}-${entry.h}-b${bleed}`;
          if (!this.textures.exists(key)) {
            const canvas = document.createElement('canvas');
            canvas.width = width + bleed;
            canvas.height = height + bleed;
            const context = canvas.getContext('2d');
            if (!context) return null;
            context.imageSmoothingEnabled = false;
            context.drawImage(source, srcX, srcY, width, height, 0, 0, width, height);
            if (bleed) {
              context.drawImage(source, srcX, srcY, 1, height, width, 0, bleed, height);
              context.drawImage(source, srcX, srcY, width, 1, 0, height, width, bleed);
              context.drawImage(source, srcX, srcY, 1, 1, width, height, bleed, bleed);
            }
            this.textures.addCanvas(key, canvas);
          }
          return key;
        }

        private getOrCreateSurfaceTexture(tex: string, width: number, height: number): string | null {
          if (!this.textures.exists(tex)) return null;

          const renderWidth = Math.max(1, Math.round(width));
          const renderHeight = Math.max(1, Math.round(height));
          const key = `sprite-lab-surface-${tex}-${renderWidth}-${renderHeight}`;
          if (this.textures.exists(key)) return key;

          const source = this.textures.get(tex).getSourceImage() as HTMLImageElement;
          const canvas = createRepeatedSurfaceCanvas(source, renderWidth, renderHeight);
          if (!canvas) return null;
          this.textures.addCanvas(key, canvas);
          return key;
        }

        private makeSprite(entry: FurnitureCatalogEntry, alpha: number) {
          const sheet = sheetForCatalogId(entry.id);
          const texture = this.getOrCreateTexture(entry);
          if (!texture) return null;

          const sprite = this.add.image(0, 0, texture);
          sprite.setAlpha(alpha).setDepth(sheet.depth + 10);
          return sprite;
        }

        private placementAt(worldX: number, worldY: number, entry: FurnitureCatalogEntry) {
          return placementFromPointer(
            worldX,
            worldY,
            { x: 0, y: 0 },
            TILE_SIZE,
            catalogGridEdgeSnap(entry.id),
          );
        }

        private positionSprite(
          sprite: import('phaser').GameObjects.Image,
          entry: FurnitureCatalogEntry,
          x: number,
          y: number,
        ) {
          const sheet = sheetForCatalogId(entry.id);
          const offset = catalogRenderOffset(entry.id);
          const width = entry.w * TILE_SIZE;
          const height = entry.h * TILE_SIZE;
          const rendered = sheet.bleedEdges || sheet.tileFill
            ? surfaceRenderRect(x, y, width, height)
            : null;
          sprite.setPosition(
            (rendered?.centerX ?? x + width / 2) + offset.x,
            (rendered?.centerY ?? y + height / 2) + offset.y,
          );
        }

        private drawBounds(
          logical: import('phaser').GameObjects.Graphics,
          rendered: import('phaser').GameObjects.Graphics,
          entry: FurnitureCatalogEntry,
          x: number,
          y: number,
          preview: boolean,
        ) {
          const offset = catalogRenderOffset(entry.id);
          const width = entry.w * TILE_SIZE;
          const height = entry.h * TILE_SIZE;
          logical.clear().lineStyle(2, 0x2784c7, preview ? 0.9 : 0.55);
          logical.strokeRect(x + 1, y + 1, width - 2, height - 2);
          rendered.clear().lineStyle(2, 0xe59b13, preview ? 1 : 0.72);
          rendered.strokeRect(x + offset.x + 2, y + offset.y + 2, width - 4, height - 4);
        }

        private updatePreview(worldX: number, worldY: number) {
          const entry = itemRef.current;
          const signature = `${entry.id}:${entry.w}x${entry.h}`;
          if (!this.ghost || this.ghostSignature !== signature) {
            this.destroyGhost();
            this.ghost = this.makeSprite(entry, 0.58);
            this.ghostSignature = signature;
          }
          if (!this.ghost) return;

          const placement = this.placementAt(worldX, worldY, entry);
          this.positionSprite(this.ghost, entry, placement.x, placement.y);
          this.drawBounds(this.logicalPreview, this.renderedPreview, entry, placement.x, placement.y, true);
        }

        private placeCurrent(worldX: number, worldY: number) {
          const entry = itemRef.current;
          const sprite = this.makeSprite(entry, 1);
          if (!sprite) return;
          const placement = this.placementAt(worldX, worldY, entry);
          this.positionSprite(sprite, entry, placement.x, placement.y);

          const logicalBox = this.add.graphics().setDepth(70);
          const renderedBox = this.add.graphics().setDepth(71);
          this.drawBounds(logicalBox, renderedBox, entry, placement.x, placement.y, false);
          this.placed.push({ sprite, logicalBox, renderedBox });
        }

        private removeLastPlacement() {
          const placement = this.placed.pop();
          if (!placement) return;
          placement.sprite.destroy();
          placement.logicalBox.destroy();
          placement.renderedBox.destroy();
        }

        private destroyGhost() {
          this.ghost?.destroy();
          this.ghost = null;
          this.ghostSignature = '';
          this.logicalPreview?.clear();
          this.renderedPreview?.clear();
        }
      }

      const scene = new SpriteLabScene();
      const game = new Phaser.Game({
        type: Phaser.CANVAS,
        parent: host,
        width: LAB_WIDTH,
        height: LAB_HEIGHT,
        backgroundColor: '#f4f1ea',
        pixelArt: true,
        // Add the scene only once Phaser has finished booting. Passing an
        // already-instantiated scene here can let the first game step run
        // before Systems.boot() has installed its update callback.
        scene: [],
        scale: {
          mode: Phaser.Scale.FIT,
          autoCenter: Phaser.Scale.CENTER_BOTH,
        },
        render: {
          antialias: false,
          pixelArt: true,
          roundPixels: true,
        },
      });
      gameRef.current = game;

      game.events.once('ready', () => {
        if (cancelled || gameRef.current !== game) return;
        game.scene.add('SpriteLabScene', scene, true);
      });
    });

    return () => {
      cancelled = true;
      sceneRef.current = null;
      gameRef.current?.destroy(true);
      gameRef.current = null;
    };
  }, []);

  return <div ref={hostRef} className={styles.canvasHost} aria-label="Grille Phaser de test des sprites" />;
}

export function SpriteLab() {
  const [sheetKey, setSheetKey] = useState(ORIGINAL_SHEETS[0]?.key ?? '');
  const activeSheet = ORIGINAL_SHEETS.find((sheet) => sheet.key === sheetKey) ?? ORIGINAL_SHEETS[0];
  const familyKey = activeSheet ? familyKeyForSheet(activeSheet.key) : null;
  const activeFamily = ORIGINAL_FAMILIES.find((family) => family.key === familyKey) ?? ORIGINAL_FAMILIES[0];
  const entries = useMemo(() => (activeSheet ? entriesForSheet(activeSheet) : []), [activeSheet]);
  const [selectedId, setSelectedId] = useState(entries[0]?.id ?? '');
  const [surfaceWidth, setSurfaceWidth] = useState(4);
  const [surfaceHeight, setSurfaceHeight] = useState(4);
  const [clearSignal, setClearSignal] = useState(0);

  useEffect(() => {
    if (!entries.some((entry) => entry.id === selectedId)) setSelectedId(entries[0]?.id ?? '');
  }, [entries, selectedId]);

  const baseItem = entries.find((entry) => entry.id === selectedId) ?? entries[0];
  const selectedItem = useMemo(() => {
    if (!baseItem || !activeSheet?.tileFill) return baseItem;
    return { ...baseItem, w: surfaceWidth, h: surfaceHeight };
  }, [activeSheet?.tileFill, baseItem, surfaceHeight, surfaceWidth]);

  if (!activeSheet || !activeFamily || !selectedItem) return null;

  const offset = catalogRenderOffset(selectedItem.id);
  const edgeSnap = catalogGridEdgeSnap(selectedItem.id);

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Outil local · grille réelle 32 px</p>
          <h1>Laboratoire de sprites</h1>
          <p>
            Pose les assets exactement comme dans le décorateur, puis compare leur emprise à Aurore.
          </p>
        </div>
        <button className={styles.resetButton} type="button" onClick={() => setClearSignal((value) => value + 1)}>
          <RotateCcw size={16} aria-hidden="true" />
          Effacer les poses
        </button>
      </header>

      <section className={styles.workspace}>
        <aside className={styles.controls}>
          <div className={styles.librarySelectors}>
            <label>
              Famille
              <select
                value={activeFamily.key}
                onChange={(event) => {
                  const nextFamily = ORIGINAL_FAMILIES.find((family) => family.key === event.target.value);
                  const firstSheet = nextFamily?.sheets[0];
                  if (firstSheet) setSheetKey(firstSheet.key);
                }}
              >
                {ORIGINAL_FAMILIES.map((family) => (
                  <option key={family.key} value={family.key}>{family.label.replace('NestWork · ', '')}</option>
                ))}
              </select>
            </label>

            <label>
              Collection
              <select value={sheetKey} onChange={(event) => setSheetKey(event.target.value)}>
                {activeFamily.sheets.map((sheet) => (
                  <option key={sheet.key} value={sheet.key}>{sheet.label}</option>
                ))}
              </select>
            </label>
          </div>

          <div className={styles.assetList} aria-label="Assets disponibles">
            {entries.map((entry) => (
              <button
                key={entry.id}
                type="button"
                className={entry.id === selectedItem.id ? styles.assetActive : styles.assetButton}
                onClick={() => setSelectedId(entry.id)}
              >
                <span>{entry.name}</span>
                <small>{entry.w} × {entry.h}</small>
              </button>
            ))}
          </div>

          {activeSheet.tileFill && (
            <fieldset className={styles.surfaceControls}>
              <legend>Zone à remplir</legend>
              <label>
                Largeur
                <input type="number" min={1} max={12} value={surfaceWidth} onChange={(event) => setSurfaceWidth(Math.min(12, Math.max(1, Number(event.target.value) || 1)))} />
              </label>
              <label>
                Hauteur
                <input type="number" min={1} max={12} value={surfaceHeight} onChange={(event) => setSurfaceHeight(Math.min(12, Math.max(1, Number(event.target.value) || 1)))} />
              </label>
            </fieldset>
          )}

          <dl className={styles.metrics}>
            <div><dt>Sprite</dt><dd>{selectedItem.w * TILE_SIZE} × {selectedItem.h * TILE_SIZE} px</dd></div>
            <div><dt>Offset</dt><dd>x {offset.x}, y {offset.y}</dd></div>
            <div><dt>Snap arête</dt><dd>{edgeSnap.x || edgeSnap.y ? `${edgeSnap.x ? 'X' : ''}${edgeSnap.y ? 'Y' : ''}` : 'non'}</dd></div>
          </dl>
        </aside>

        <div className={styles.stage}>
          <SpriteLabCanvas item={selectedItem} clearSignal={clearSignal} />
          <div className={styles.legend}>
            <span><i className={styles.logicalSwatch} /> emplacement enregistré</span>
            <span><i className={styles.renderedSwatch} /> cadre source après offset</span>
            <span>Clic : poser · clic droit : annuler la dernière pose</span>
          </div>
        </div>
      </section>
    </main>
  );
}
