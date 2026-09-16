'use client';

import { useEffect, useMemo, useState, MouseEvent } from 'react';
import { Paintbrush, X, Eraser, Ban, FlipHorizontal2, Hand, Undo2, BringToFront, SendToBack, Layers3 } from 'lucide-react';
import { useWorkspace } from '../contexts/WorkspaceContext';
import { familyKeyForSheet, SHEETS, sheetFamilies, type SheetDef } from '../game/sheets';
import { AVAILABLE_ANIM_OBJECTS } from '../game/animObjects';

const CELL = 26; // displayed size per tile in the picker
const SOURCE_TILE = 32;
const ANIM_KEY = '__anim__'; // special category value for animated objects
const FAMILIES = sheetFamilies();
const DEFAULT_SHEET_KEY = FAMILIES[0]?.sheets[0]?.key ?? 'nw-floor-ivory';

export function DecoratorBar() {
  const {
    decoratorMode,
    setDecoratorMode,
    furnitureItems,
    selectedCatalogItem,
    setSelectedCatalogItem,
    moveMode,
    setMoveMode,
    eraseMode,
    setEraseMode,
    collisionMode,
    setCollisionMode,
    changeFurnitureDepth,
    undoFurniture,
    canUndoFurniture,
  } = useWorkspace();
  const [sheetKey, setSheetKey] = useState<string>(DEFAULT_SHEET_KEY);
  // Rectangle being dragged in the picker (cell coords). null = not dragging.
  const [drag, setDrag] = useState<{ c0: number; r0: number; c1: number; r1: number } | null>(null);
  const [selection, setSelection] = useState<{ id: string | null; canRestack: boolean }>({
    id: null,
    canRestack: false,
  });
  const selectedPlacedItem = selection.id
    ? furnitureItems.find((item) => item.id === selection.id) ?? null
    : null;
  const [depthDraft, setDepthDraft] = useState('');

  const families = useMemo(() => FAMILIES, []);
  const isAnim = sheetKey === ANIM_KEY;
  const sheet: SheetDef = SHEETS.find((s) => s.key === sheetKey) ?? families[0]?.sheets[0] ?? SHEETS[0];
  const familyKey = isAnim ? ANIM_KEY : familyKeyForSheet(sheet.key) ?? families[0]?.key ?? '';
  const activeFamily = families.find((family) => family.key === familyKey);
  const rowStart = sheet.rowStart ?? 0;
  const rowEnd = sheet.rowEnd ?? sheet.rows;

  function activateTileFill(target: SheetDef) {
    setMoveMode(false);
    setEraseMode(false);
    setCollisionMode(false);
    setSelectedCatalogItem({
      id: `${target.key}_0_0_1x1`,
      name: target.label,
      category: target.key,
      col: 0,
      row: 0,
      w: 1,
      h: 1,
      depth: target.depth,
    });
  }

  function selectAnim(o: (typeof AVAILABLE_ANIM_OBJECTS)[number]) {
    setMoveMode(false);
    setEraseMode(false);
    setCollisionMode(false);
    const id = `anim_${o.key}`;
    setSelectedCatalogItem(
      selectedCatalogItem?.id === id
        ? null
        : { id, name: o.label, category: id, col: 0, row: 0, w: o.tilesW, h: o.tilesH, depth: 3 },
    );
  }

  function selectPreset(item: NonNullable<SheetDef['presets']>[number]) {
    setMoveMode(false);
    setEraseMode(false);
    setCollisionMode(false);
    setSelectedCatalogItem(selectedCatalogItem?.id === item.id ? null : item);
  }

  function selectSheet(nextKey: string) {
    const nextSheet = SHEETS.find((candidate) => candidate.key === nextKey);
    setSheetKey(nextKey);
    setDrag(null);
    // Changing collection always disarms the previous tool. A single-tile
    // fill activates immediately: there is no hidden second click.
    setMoveMode(false);
    setEraseMode(false);
    setCollisionMode(false);
    if (nextSheet?.tileFill) activateTileFill(nextSheet);
    else setSelectedCatalogItem(null);
  }

  // Ctrl/Cmd+Z undoes the last furniture action while decorating.
  useEffect(() => {
    if (!decoratorMode) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault();
        undoFurniture();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [decoratorMode, undoFurniture]);

  useEffect(() => {
    if (!decoratorMode) {
      setSelection({ id: null, canRestack: false });
      return;
    }
    const onSelection = (event: Event) => {
      const detail = (event as CustomEvent<{ id: string | null; canRestack?: boolean }>).detail;
      setSelection({ id: detail?.id ?? null, canRestack: !!detail?.canRestack });
    };
    window.addEventListener('nw:furniture-selection', onSelection);
    return () => window.removeEventListener('nw:furniture-selection', onSelection);
  }, [decoratorMode]);

  useEffect(() => {
    setDepthDraft(selectedPlacedItem ? String(Number(selectedPlacedItem.depth.toFixed(3))) : '');
  }, [selectedPlacedItem]);

  function commitDepth() {
    if (!selection.canRestack || !selection.id) return;
    const parsed = Number(depthDraft);
    if (!Number.isFinite(parsed)) {
      setDepthDraft(selectedPlacedItem ? String(Number(selectedPlacedItem.depth.toFixed(3))) : '');
      return;
    }
    const depth = Math.min(49.999, Math.max(1.001, parsed));
    setDepthDraft(String(Number(depth.toFixed(3))));
    changeFurnitureDepth(selection.id, depth);
  }

  // The toggle lives in the left nav rail; render nothing when off.
  if (!decoratorMode) return null;

  function cellAt(e: MouseEvent<HTMLDivElement>): { col: number; row: number } | null {
    const rect = e.currentTarget.getBoundingClientRect();
    const col = Math.floor((e.clientX - rect.left) / CELL);
    const row = rowStart + Math.floor((e.clientY - rect.top) / CELL);
    if (col < 0 || col >= sheet.cols || row < rowStart || row >= rowEnd) return null;
    return { col, row };
  }

  function down(e: MouseEvent<HTMLDivElement>) {
    const c = cellAt(e);
    if (!c) return;
    setMoveMode(false);
    setEraseMode(false);
    setDrag({ c0: c.col, r0: c.row, c1: c.col, r1: c.row });
  }
  function move(e: MouseEvent<HTMLDivElement>) {
    if (!drag) return;
    const c = cellAt(e);
    if (c) setDrag({ ...drag, c1: c.col, r1: c.row });
  }
  function up() {
    if (!drag) return;
    const col = Math.min(drag.c0, drag.c1);
    const row = Math.min(drag.r0, drag.r1);
    const w = Math.abs(drag.c1 - drag.c0) + 1;
    const h = Math.abs(drag.r1 - drag.r0) + 1;
    setDrag(null);
    setMoveMode(false); // picking a tile exits navigate mode
    setCollisionMode(false); // picking a tile exits collision-paint mode
    const id = `${sheet.key}_${col}_${row}_${w}x${h}`;
    if (sheet.tileFill) {
      activateTileFill(sheet);
      return;
    }
    setSelectedCatalogItem(
      selectedCatalogItem?.id === id
        ? null
        : { id, name: sheet.tileFill ? sheet.label : `${sheet.label} ${w}×${h}`, category: sheet.key, col, row, w, h, depth: sheet.depth },
    );
  }

  const viewW = sheet.cols * CELL;
  const viewH = (rowEnd - rowStart) * CELL;
  // Highlight: the live drag rectangle, else the current selection (this sheet only)
  const sel = selectedCatalogItem && selectedCatalogItem.category === sheet.key ? selectedCatalogItem : null;
  const box = drag
    ? { col: Math.min(drag.c0, drag.c1), row: Math.min(drag.r0, drag.r1), w: Math.abs(drag.c1 - drag.c0) + 1, h: Math.abs(drag.r1 - drag.r0) + 1 }
    : sel
      ? { col: sel.col, row: sel.row, w: sel.w, h: sel.h }
      : null;

  return (
    <div className="absolute left-0 top-0 z-10 flex h-full w-[480px] max-w-[85vw] flex-col border-r border-[var(--color-border)] bg-[var(--color-panel-bg)] shadow-xl">
      {/* Header — title + close on top, the tool row below so labels never get
          squeezed (it wraps by whole buttons instead of cutting a label in two). */}
      <div className="border-b border-[var(--color-border)] px-3 py-2">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-sm font-semibold text-[var(--color-text-primary)]">
            <Paintbrush size={16} /> Décorateur
          </span>
          <button
            onClick={() => setDecoratorMode(false)}
            title="Terminer"
            className="rounded p-1 text-[var(--color-text-tertiary)] hover:bg-[var(--color-hover-bg)] hover:text-[var(--color-text-primary)]"
          >
            <X size={16} />
          </button>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1">
          <button
            onClick={() => undoFurniture()}
            disabled={!canUndoFurniture}
            title="Annuler la dernière action (Ctrl/Cmd+Z)"
            className="shrink-0 rounded p-1.5 text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-hover-bg)] hover:text-[var(--color-text-primary)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Undo2 size={15} />
          </button>
          <button
            onClick={() => {
              const next = !moveMode;
              setMoveMode(next);
              if (next) {
                setSelectedCatalogItem(null);
                setEraseMode(false);
                setCollisionMode(false);
              }
            }}
            title="Déplacer — glisse pour bouger la carte ; clique un objet puis glisse-le pour le déplacer"
            className={`shrink-0 rounded p-1.5 transition-colors ${
              moveMode ? 'bg-honey text-hive-800' : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-hover-bg)] hover:text-[var(--color-text-primary)]'
            }`}
          >
            <Hand size={15} />
          </button>
          <button
            onClick={() => (window as { __nwFlip?: () => void }).__nwFlip?.()}
            title="Miroir (F)"
            className="shrink-0 rounded p-1.5 text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-hover-bg)] hover:text-[var(--color-text-primary)]"
          >
            <FlipHorizontal2 size={15} />
          </button>
          <button
            type="button"
            onClick={() => (window as { __nwSendToBack?: () => void }).__nwSendToBack?.()}
            disabled={!selection.canRestack}
            title="Envoyer l’objet sélectionné derrière les autres"
            aria-label="Envoyer derrière"
            className="shrink-0 rounded p-1.5 text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-hover-bg)] hover:text-[var(--color-text-primary)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <SendToBack size={15} />
          </button>
          <label
            title="Index d’affichage de l’objet sélectionné (1 = derrière, 50 = devant)"
            className={`flex h-7 shrink-0 items-center gap-1 rounded border px-1.5 text-xs ${
              selection.canRestack
                ? 'border-[var(--color-border)] text-[var(--color-text-secondary)]'
                : 'border-transparent text-[var(--color-text-tertiary)] opacity-40'
            }`}
          >
            <Layers3 size={14} aria-hidden />
            <span className="sr-only">Index du plan</span>
            <input
              type="number"
              min="1.001"
              max="49.999"
              step="0.1"
              value={depthDraft}
              disabled={!selection.canRestack}
              onChange={(event) => setDepthDraft(event.target.value)}
              onBlur={commitDepth}
              onKeyDown={(event) => {
                if (event.key === 'Enter') event.currentTarget.blur();
              }}
              className="w-14 bg-transparent text-center tabular-nums text-[var(--color-text-primary)] outline-none disabled:cursor-not-allowed"
              aria-label="Index d’affichage"
            />
          </label>
          <button
            type="button"
            onClick={() => (window as { __nwBringToFront?: () => void }).__nwBringToFront?.()}
            disabled={!selection.canRestack}
            title="Mettre l’objet sélectionné devant les autres"
            aria-label="Mettre devant"
            className="shrink-0 rounded p-1.5 text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-hover-bg)] hover:text-[var(--color-text-primary)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <BringToFront size={15} />
          </button>
          <button
            onClick={() => {
              const next = !eraseMode;
              setEraseMode(next);
              if (next) {
                setMoveMode(false);
                setSelectedCatalogItem(null);
                setCollisionMode(false);
              }
            }}
            title="Gomme — supprimer un objet posé"
            aria-label="Gomme"
            className={`shrink-0 rounded p-1.5 transition-colors ${
              eraseMode ? 'bg-red text-white' : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-hover-bg)] hover:text-[var(--color-text-primary)]'
            }`}
          >
            <Eraser size={15} />
          </button>
          <span className="mx-0.5 h-5 w-px shrink-0 bg-[var(--color-border)]" aria-hidden />
          <button
            onClick={() => {
              const next = !collisionMode;
              setCollisionMode(next);
              if (next) {
                setMoveMode(false);
                setEraseMode(false);
                setSelectedCatalogItem(null);
              }
            }}
            title="Collisions — les hachures orange indiquent le passage bloqué, pas les limites des sprites"
            className={`flex shrink-0 items-center gap-1 whitespace-nowrap rounded px-2 py-1 text-xs font-medium transition-colors ${
              collisionMode ? 'bg-propolis text-white' : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-hover-bg)] hover:text-[var(--color-text-primary)]'
            }`}
          >
            <Ban size={14} /> Collisions
          </button>
        </div>
      </div>

      {/* Two-level library navigation keeps each list short as assets grow. */}
      <div className="grid grid-cols-2 gap-2 border-b border-[var(--color-border)] p-2">
        <label className="block text-[11px] font-medium uppercase tracking-wide text-[var(--color-text-tertiary)]">
          Famille
          <select
            value={familyKey}
            onChange={(event) => {
              const nextFamilyKey = event.target.value;
              if (nextFamilyKey === ANIM_KEY) {
                selectSheet(ANIM_KEY);
                return;
              }
              const nextFamily = families.find((family) => family.key === nextFamilyKey);
              const firstSheet = nextFamily?.sheets[0];
              if (firstSheet) selectSheet(firstSheet.key);
            }}
            className="mt-1 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-hover-bg)] px-2 py-1.5 text-sm normal-case tracking-normal text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-honey/50"
          >
            {families.map((family) => (
              <option key={family.key} value={family.key}>{family.label}</option>
            ))}
            {AVAILABLE_ANIM_OBJECTS.length > 0 && <option value={ANIM_KEY}>Décor animé</option>}
          </select>
        </label>

        <label className="block text-[11px] font-medium uppercase tracking-wide text-[var(--color-text-tertiary)]">
          Collection
          <select
            value={isAnim ? ANIM_KEY : sheet.key}
            disabled={isAnim}
            onChange={(event) => selectSheet(event.target.value)}
            className="mt-1 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-hover-bg)] px-2 py-1.5 text-sm normal-case tracking-normal text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-honey/50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isAnim ? (
              <option value={ANIM_KEY}>Objets animés</option>
            ) : (
              activeFamily?.sheets.map((familySheet) => (
                <option key={familySheet.key} value={familySheet.key}>{familySheet.label}</option>
              ))
            )}
          </select>
        </label>
      </div>

      {/* Animated objects — thumbnail grid */}
      {isAnim && (
        <div className="grid flex-1 grid-cols-3 content-start gap-2 overflow-auto p-2">
          {AVAILABLE_ANIM_OBJECTS.map((o) => {
            const id = `anim_${o.key}`;
            const active = selectedCatalogItem?.id === id;
            const s = 44 / o.frameW; // ~44px per frame in the thumbnail
            return (
              <button
                key={o.key}
                onClick={() => selectAnim(o)}
                title={o.label}
                className={`flex flex-col items-center gap-1 rounded-xl border p-2 transition-colors ${
                  active ? 'border-honey bg-honey/10' : 'border-[var(--color-border)] hover:border-honey/50'
                }`}
              >
                <div className="relative overflow-hidden" style={{ width: o.frameW * s, height: o.frameH * s }}>
                  <img
                    src={o.file}
                    alt={o.label}
                    style={{
                      position: 'absolute',
                      left: 0,
                      top: 0,
                      width: o.frameW * o.frames * s,
                      height: o.frameH * s,
                      maxWidth: 'none',
                      imageRendering: 'pixelated',
                    }}
                  />
                </div>
                <span className="w-full truncate text-center text-[10px] text-[var(--color-text-secondary)]">{o.label}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Repeatable ground sheet — one explicit brush instead of a tiny,
          ambiguous 1×1 spritesheet picker. */}
      {!isAnim && sheet.tileFill && (
        <div className="flex-1 p-3">
          <button
            type="button"
            aria-pressed={selectedCatalogItem?.category === sheet.key}
            onClick={() => activateTileFill(sheet)}
            className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors ${
              selectedCatalogItem?.category === sheet.key
                ? 'border-honey bg-honey/10 ring-2 ring-honey/30'
                : 'border-[var(--color-border)] hover:border-honey/60'
            }`}
          >
            <span
              className="h-12 w-12 shrink-0 border border-[var(--color-border)]"
              style={{ backgroundImage: `url(${sheet.file})`, backgroundSize: 'cover', imageRendering: 'pixelated' }}
              aria-hidden
            />
            <span>
              <span className="block text-sm font-semibold text-[var(--color-text-primary)]">Pinceau {sheet.label}</span>
              <span className="mt-0.5 block text-xs text-[var(--color-text-secondary)]">Actif dès que cette catégorie est choisie</span>
            </span>
          </button>

        </div>
      )}

      {/* Original NestWork sheets expose named objects so users never need to
          guess a multi-tile selection rectangle in the raw spritesheet. */}
      {!isAnim && !sheet.tileFill && sheet.presets && (
        <div className="grid flex-1 grid-cols-3 content-start gap-2 overflow-auto p-2">
          {sheet.presets.filter((item) => !item.hiddenInCatalog).map((item) => {
            const active = selectedCatalogItem?.id === item.id;
            const pixelW = item.w * SOURCE_TILE;
            const pixelH = item.h * SOURCE_TILE;
            const scale = Math.min(72 / pixelW, 64 / pixelH);
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => selectPreset(item)}
                title={item.name}
                className={`flex min-h-28 flex-col items-center justify-between gap-1 rounded-xl border p-2 transition-colors ${
                  active
                    ? 'border-honey bg-honey/10 ring-2 ring-honey/30'
                    : 'border-[var(--color-border)] hover:border-honey/60'
                }`}
              >
                <span
                  className="relative block overflow-hidden"
                  style={{ width: pixelW * scale, height: pixelH * scale }}
                  aria-hidden
                >
                  <img
                    src={sheet.file}
                    alt=""
                    draggable={false}
                    style={{
                      position: 'absolute',
                      left: -item.col * SOURCE_TILE * scale,
                      top: -item.row * SOURCE_TILE * scale,
                      width: sheet.cols * SOURCE_TILE * scale,
                      height: sheet.rows * SOURCE_TILE * scale,
                      maxWidth: 'none',
                      imageRendering: 'pixelated',
                    }}
                  />
                </span>
                <span className="w-full text-center text-[10px] leading-tight text-[var(--color-text-secondary)]">
                  {item.name}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Tile sheet — click or drag to pick one or many cells */}
      {!isAnim && !sheet.tileFill && !sheet.presets && (
      <div className="flex-1 overflow-auto p-2">
        <div
          onMouseDown={down}
          onMouseMove={move}
          onMouseUp={up}
          onMouseLeave={up}
          className="relative cursor-crosshair select-none"
          style={{
            width: viewW,
            height: viewH,
            backgroundImage: `url(${sheet.file})`,
            backgroundSize: `${sheet.cols * CELL}px ${sheet.rows * CELL}px`,
            backgroundPosition: `0px ${-rowStart * CELL}px`,
            imageRendering: 'pixelated',
          }}
        >
          {/* Grid overlay */}
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              backgroundImage:
                'linear-gradient(to right, rgba(0,0,0,0.12) 1px, transparent 1px), linear-gradient(to bottom, rgba(0,0,0,0.12) 1px, transparent 1px)',
              backgroundSize: `${CELL}px ${CELL}px`,
            }}
          />
          {/* Selection / drag rectangle */}
          {box && (
            <div
              className="pointer-events-none absolute bg-honey/20"
              style={{
                left: box.col * CELL,
                top: (box.row - rowStart) * CELL,
                width: box.w * CELL,
                height: box.h * CELL,
                outline: '2px solid #F77F00',
                outlineOffset: '-1px',
              }}
            />
          )}
        </div>
      </div>
      )}

      {/* Hint */}
      <div className="border-t border-[var(--color-border)] p-2 text-[11px] leading-snug text-[var(--color-text-tertiary)]">
        {moveMode
          ? '✋ Déplacer — glisse pour te promener sur la carte (même sur les sols). Pour bouger un objet : clique-le d’abord (il se surligne), puis glisse-le. Reprends une tuile dans la liste pour repasser en pose.'
          : collisionMode
          ? '🚫 Collisions — les cases orange représentent uniquement les zones infranchissables, pas la taille des sprites. Clique ou glisse pour les peindre ; la Gomme les retire.'
          : eraseMode
            ? '🧽 Gomme active — clique un objet sur la carte pour le supprimer.'
            : selectedCatalogItem && sheet.tileFill
              ? `${selectedCatalogItem.name} actif — maintiens le clic sur la carte, glisse, puis relâche (jusqu’à 64×64 cases).`
            : selectedCatalogItem
              ? `➕ ${selectedCatalogItem.name} sélectionné — clique sur la carte pour le poser.`
              : sheet.presets
                ? `Choisis un objet « ${sheet.label} », puis clique sur la carte pour le poser.`
              : isAnim
                ? '✨ Choisis un objet animé, puis clique sur la carte pour le poser.'
                : `« ${sheet.label} » : clique OU glisse pour sélectionner plusieurs cases, puis clique sur la carte.`}
      </div>
    </div>
  );
}
