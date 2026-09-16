'use client';

import { useEffect, useMemo, useState, MouseEvent } from 'react';
import { Paintbrush, X, Eraser, Ban, FlipHorizontal2, Hand, Undo2, BringToFront, SendToBack, Layers3, Upload, Trash2, ExternalLink } from 'lucide-react';
import {
  MAX_WORKSPACE_ASSET_BYTES,
  workspaceAssetCatalogKey,
  type WorkspaceAssetCreatePayload,
  type WorkspaceAssetKind,
  type WorkspaceAssetSource,
} from '@nestwork/shared';
import { useWorkspace } from '../contexts/WorkspaceContext';
import { familyKeyForSheet, SHEETS, sheetFamilies, type SheetDef, type SheetFamilyDef } from '../game/sheets';
import { AVAILABLE_ANIM_OBJECTS } from '../game/animObjects';

const CELL = 26; // displayed size per tile in the picker
const SOURCE_TILE = 32;
const ANIM_KEY = '__anim__'; // special category value for animated objects
const FAMILIES = sheetFamilies();
const DEFAULT_SHEET_KEY = FAMILIES[0]?.sheets[0]?.key ?? 'nw-floor-ivory';
const MODERN_INTERIORS_URL = 'https://limezu.itch.io/moderninteriors';

function fileNameWithoutExtension(name: string): string {
  return name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim() || 'Asset importé';
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Lecture du fichier impossible'));
    reader.onload = () => typeof reader.result === 'string'
      ? resolve(reader.result)
      : reject(new Error('Format de fichier invalide'));
    reader.readAsDataURL(file);
  });
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("L'image ne peut pas être décodée"));
    image.src = dataUrl;
  });
}

function decodedDataUrlSize(dataUrl: string): number {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  return Math.floor((base64.length * 3) / 4);
}

async function prepareAssetFile(file: File, kind: WorkspaceAssetKind) {
  if (!['image/png', 'image/webp'].includes(file.type)) {
    throw new Error(`${file.name} : seuls PNG et WebP sont acceptés`);
  }
  if (file.size > MAX_WORKSPACE_ASSET_BYTES) {
    throw new Error(`${file.name} dépasse 2,6 Mo`);
  }
  const original = await readFileAsDataUrl(file);
  const image = await loadImage(original);
  if (image.naturalWidth < 1 || image.naturalHeight < 1) throw new Error(`${file.name} est vide`);

  if (kind === 'SHEET') {
    if (image.naturalWidth % SOURCE_TILE !== 0 || image.naturalHeight % SOURCE_TILE !== 0) {
      throw new Error(`${file.name} doit être aligné sur une grille de 32 px`);
    }
    const cols = image.naturalWidth / SOURCE_TILE;
    const rows = image.naturalHeight / SOURCE_TILE;
    if (cols > 128 || rows > 128) throw new Error(`${file.name} dépasse la grille maximale 128×128`);
    return { dataUrl: original, cols, rows };
  }

  const cols = Math.ceil(image.naturalWidth / SOURCE_TILE);
  const rows = Math.ceil(image.naturalHeight / SOURCE_TILE);
  if (cols > 128 || rows > 128) throw new Error(`${file.name} dépasse 4096×4096 px`);
  const canvas = document.createElement('canvas');
  canvas.width = cols * SOURCE_TILE;
  canvas.height = rows * SOURCE_TILE;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas indisponible');
  context.imageSmoothingEnabled = false;
  // Bottom-align a standalone object so its feet/base stay on the grid.
  context.drawImage(image, 0, canvas.height - image.naturalHeight);
  const dataUrl = canvas.toDataURL('image/png');
  if (decodedDataUrlSize(dataUrl) > MAX_WORKSPACE_ASSET_BYTES) {
    throw new Error(`${file.name} dépasse 2,6 Mo après normalisation`);
  }
  return { dataUrl, cols, rows };
}

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
    workspaceAssets,
    workspaceAssetsError,
    canManageWorkspaceAssets,
    uploadWorkspaceAsset,
    removeWorkspaceAsset,
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
  const [importOpen, setImportOpen] = useState(false);
  const [importSource, setImportSource] = useState<WorkspaceAssetSource>('CUSTOM');
  const [importKind, setImportKind] = useState<WorkspaceAssetKind>('OBJECT');
  const [importDepth, setImportDepth] = useState('3');
  const [importName, setImportName] = useState('');
  const [importFiles, setImportFiles] = useState<File[]>([]);
  const [licenseAccepted, setLicenseAccepted] = useState(false);
  const [importBusy, setImportBusy] = useState(false);
  const [importMessage, setImportMessage] = useState('');

  const workspaceSheets = useMemo<SheetDef[]>(() => workspaceAssets.map((asset) => ({
    key: workspaceAssetCatalogKey(asset.id),
    tex: `workspace-asset:${asset.id}`,
    file: asset.objectUrl,
    label: asset.name,
    group: asset.source === 'MODERN_INTERIORS' ? 'Modern Interiors privé' : 'Imports privés',
    cols: asset.cols,
    rows: asset.rows,
    depth: asset.depth,
  })), [workspaceAssets]);
  const workspaceAssetByKey = useMemo(() => new Map(
    workspaceAssets.map((asset) => [workspaceAssetCatalogKey(asset.id), asset]),
  ), [workspaceAssets]);
  const families = useMemo<SheetFamilyDef[]>(() => {
    const customSheets = workspaceSheets.filter((sheet) => workspaceAssetByKey.get(sheet.key)?.source === 'CUSTOM');
    const licensedSheets = workspaceSheets.filter((sheet) => workspaceAssetByKey.get(sheet.key)?.source === 'MODERN_INTERIORS');
    return [
      ...FAMILIES,
      ...(customSheets.length ? [{ key: 'workspace:custom', label: 'Mes imports', sheets: customSheets, original: false }] : []),
      ...(licensedSheets.length ? [{ key: 'workspace:modern', label: 'Modern Interiors privé', sheets: licensedSheets, original: false }] : []),
    ];
  }, [workspaceSheets, workspaceAssetByKey]);
  const isAnim = sheetKey === ANIM_KEY;
  const selectedWorkspaceAsset = workspaceAssetByKey.get(sheetKey);
  const sheet: SheetDef = SHEETS.find((s) => s.key === sheetKey)
    ?? workspaceSheets.find((candidate) => candidate.key === sheetKey)
    ?? families[0]?.sheets[0]
    ?? SHEETS[0];
  const familyKey = isAnim
    ? ANIM_KEY
    : selectedWorkspaceAsset
      ? selectedWorkspaceAsset.source === 'MODERN_INTERIORS' ? 'workspace:modern' : 'workspace:custom'
      : familyKeyForSheet(sheet.key) ?? families[0]?.key ?? '';
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
    const nextSheet = [...SHEETS, ...workspaceSheets].find((candidate) => candidate.key === nextKey);
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

  async function importAssets() {
    if (importFiles.length === 0) {
      setImportMessage('Choisis au moins un fichier PNG ou WebP.');
      return;
    }
    if (importSource === 'MODERN_INTERIORS' && !licenseAccepted) {
      setImportMessage("Confirme d'abord que tu possèdes une licence Modern Interiors.");
      return;
    }
    setImportBusy(true);
    setImportMessage('');
    let imported = 0;
    try {
      const kind: WorkspaceAssetKind = importSource === 'MODERN_INTERIORS' ? 'SHEET' : importKind;
      for (const file of importFiles) {
        const prepared = await prepareAssetFile(file, kind);
        const payload: WorkspaceAssetCreatePayload = {
          name: importFiles.length === 1 && importName.trim() ? importName.trim() : fileNameWithoutExtension(file.name),
          source: importSource,
          kind,
          cols: prepared.cols,
          rows: prepared.rows,
          depth: Number(importDepth),
          dataUrl: prepared.dataUrl,
          licenseAccepted: importSource === 'MODERN_INTERIORS' ? licenseAccepted : undefined,
        };
        const result = await uploadWorkspaceAsset(payload);
        if (!result.ok) throw new Error(result.error);
        imported += 1;
      }
      setImportFiles([]);
      setImportName('');
      setImportMessage(`${imported} asset${imported > 1 ? 's' : ''} importé${imported > 1 ? 's' : ''}.`);
    } catch (error: unknown) {
      setImportMessage(error instanceof Error ? error.message : "L'import a échoué");
    } finally {
      setImportBusy(false);
    }
  }

  async function deleteSelectedWorkspaceAsset() {
    if (!selectedWorkspaceAsset) return;
    if (!window.confirm(`Supprimer « ${selectedWorkspaceAsset.name} » de cette bibliothèque ?`)) return;
    const result = await removeWorkspaceAsset(selectedWorkspaceAsset.id);
    if (!result.ok) {
      setImportMessage(result.error ?? 'Suppression impossible');
      return;
    }
    setSheetKey(DEFAULT_SHEET_KEY);
    setSelectedCatalogItem(null);
    setImportMessage('Asset supprimé.');
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

        <div className="col-span-2 flex items-center justify-between gap-2">
          <p className="min-w-0 text-[11px] text-[var(--color-text-tertiary)]">
            {workspaceAssetsError || `${workspaceAssets.length} asset${workspaceAssets.length === 1 ? '' : 's'} privé${workspaceAssets.length === 1 ? '' : 's'}`}
          </p>
          {canManageWorkspaceAssets && (
            <button
              type="button"
              onClick={() => setImportOpen((open) => !open)}
              aria-expanded={importOpen}
              className="flex shrink-0 items-center gap-1 rounded-lg border border-[var(--color-border)] px-2 py-1 text-xs font-medium text-[var(--color-text-secondary)] hover:border-honey hover:text-[var(--color-text-primary)]"
            >
              <Upload size={13} aria-hidden /> Importer
            </button>
          )}
        </div>
      </div>

      {importOpen && (
        <div className="flex-1 overflow-auto p-3">
          <div className="space-y-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-hover-bg)] p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">Importer une bibliothèque privée</h3>
                <p className="mt-1 text-xs leading-relaxed text-[var(--color-text-secondary)]">
                  Les fichiers restent réservés aux membres de cet espace et ne sont jamais ajoutés aux cartes publiques.
                </p>
              </div>
              <button type="button" onClick={() => setImportOpen(false)} aria-label="Fermer l’import" className="rounded p-1 hover:bg-[var(--color-panel-bg)]">
                <X size={15} aria-hidden />
              </button>
            </div>

            <label className="block text-xs font-medium text-[var(--color-text-secondary)]">
              Origine
              <select
                value={importSource}
                onChange={(event) => {
                  const source = event.target.value as WorkspaceAssetSource;
                  setImportSource(source);
                  if (source === 'MODERN_INTERIORS') setImportKind('SHEET');
                  setImportMessage('');
                }}
                className="mt-1 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-panel-bg)] px-2 py-2 text-sm text-[var(--color-text-primary)]"
              >
                <option value="CUSTOM">Mes propres créations</option>
                <option value="MODERN_INTERIORS">Modern Interiors acheté séparément</option>
              </select>
            </label>

            {importSource === 'CUSTOM' && (
              <label className="block text-xs font-medium text-[var(--color-text-secondary)]">
                Type de fichier
                <select
                  value={importKind}
                  onChange={(event) => setImportKind(event.target.value as WorkspaceAssetKind)}
                  className="mt-1 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-panel-bg)] px-2 py-2 text-sm text-[var(--color-text-primary)]"
                >
                  <option value="OBJECT">Objet unique — cadrage automatique</option>
                  <option value="SHEET">Spritesheet — grille stricte de 32 px</option>
                </select>
              </label>
            )}

            <label className="block text-xs font-medium text-[var(--color-text-secondary)]">
              Fichiers PNG ou WebP
              <input
                type="file"
                accept="image/png,image/webp"
                multiple
                onChange={(event) => {
                  setImportFiles(Array.from(event.target.files ?? []));
                  setImportMessage('');
                }}
                className="mt-1 block w-full text-xs text-[var(--color-text-secondary)] file:mr-2 file:rounded-lg file:border-0 file:bg-honey/15 file:px-2 file:py-1.5 file:font-medium file:text-hive-800"
              />
              <span className="mt-1 block text-[11px] font-normal text-[var(--color-text-tertiary)]">2,6 Mo maximum par fichier, 100 assets ou 50 Mo par espace.</span>
            </label>

            <label className="block text-xs font-medium text-[var(--color-text-secondary)]">
              Nom {importFiles.length > 1 && '(les noms de fichiers seront utilisés)'}
              <input
                type="text"
                maxLength={80}
                value={importName}
                disabled={importFiles.length > 1}
                onChange={(event) => setImportName(event.target.value)}
                placeholder={importFiles[0] ? fileNameWithoutExtension(importFiles[0].name) : 'Ex. Canapé bleu'}
                className="mt-1 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-panel-bg)] px-2 py-2 text-sm text-[var(--color-text-primary)] disabled:opacity-50"
              />
            </label>

            <label className="block text-xs font-medium text-[var(--color-text-secondary)]">
              Plan par défaut
              <select
                value={importDepth}
                onChange={(event) => setImportDepth(event.target.value)}
                className="mt-1 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-panel-bg)] px-2 py-2 text-sm text-[var(--color-text-primary)]"
              >
                <option value="1">Sol</option>
                <option value="2">Mur / cloison</option>
                <option value="3">Mobilier / décoration</option>
              </select>
            </label>

            {importSource === 'MODERN_INTERIORS' && (
              <div className="rounded-lg border border-honey/40 bg-honey/10 p-2.5 text-xs leading-relaxed text-[var(--color-text-secondary)]">
                <a href={MODERN_INTERIORS_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-hive-800 underline">
                  Acheter Modern Interiors auprès de LimeZu <ExternalLink size={12} aria-hidden />
                </a>
                <label className="mt-2 flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={licenseAccepted}
                    onChange={(event) => setLicenseAccepted(event.target.checked)}
                    className="mt-0.5"
                  />
                  <span>Je confirme posséder une licence valide pour chaque fichier sélectionné et rester responsable du respect de ses conditions.</span>
                </label>
              </div>
            )}

            <div aria-live="polite" className="min-h-5 text-xs text-[var(--color-text-secondary)]">{importMessage}</div>
            <button
              type="button"
              onClick={() => void importAssets()}
              disabled={importBusy || importFiles.length === 0}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-honey px-3 py-2 text-sm font-semibold text-hive-900 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Upload size={15} aria-hidden /> {importBusy ? 'Import en cours…' : `Importer ${importFiles.length || ''}`}
            </button>
          </div>
        </div>
      )}

      {!importOpen && selectedWorkspaceAsset && (
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-3 py-2 text-xs text-[var(--color-text-secondary)]">
          <span>{selectedWorkspaceAsset.kind === 'OBJECT' ? 'Objet unique' : `Spritesheet ${selectedWorkspaceAsset.cols}×${selectedWorkspaceAsset.rows}`}</span>
          {canManageWorkspaceAssets && (
            <button
              type="button"
              onClick={() => void deleteSelectedWorkspaceAsset()}
              className="flex items-center gap-1 rounded px-2 py-1 text-red hover:bg-red/10"
            >
              <Trash2 size={13} aria-hidden /> Supprimer
            </button>
          )}
        </div>
      )}

      {/* Animated objects — thumbnail grid */}
      {!importOpen && isAnim && (
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
      {!importOpen && !isAnim && sheet.tileFill && (
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
      {!importOpen && !isAnim && !sheet.tileFill && sheet.presets && (
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

      {!importOpen && !isAnim && selectedWorkspaceAsset?.kind === 'OBJECT' && (
        <div className="flex flex-1 items-start justify-center overflow-auto p-4">
          <button
            type="button"
            onClick={() => selectPreset({
              id: `${sheet.key}_0_0_${sheet.cols}x${sheet.rows}`,
              name: sheet.label,
              category: sheet.key,
              col: 0,
              row: 0,
              w: sheet.cols,
              h: sheet.rows,
              depth: sheet.depth,
            })}
            className={`flex w-full max-w-xs flex-col items-center gap-3 rounded-xl border p-4 transition-colors ${
              selectedCatalogItem?.category === sheet.key
                ? 'border-honey bg-honey/10 ring-2 ring-honey/30'
                : 'border-[var(--color-border)] hover:border-honey/60'
            }`}
          >
            <img
              src={sheet.file}
              alt=""
              draggable={false}
              className="max-h-56 max-w-full object-contain"
              style={{ imageRendering: 'pixelated' }}
            />
            <span className="text-sm font-semibold text-[var(--color-text-primary)]">{sheet.label}</span>
          </button>
        </div>
      )}

      {/* Tile sheet — click or drag to pick one or many cells */}
      {!importOpen && !isAnim && !sheet.tileFill && !sheet.presets && selectedWorkspaceAsset?.kind !== 'OBJECT' && (
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
      {!importOpen && <div className="border-t border-[var(--color-border)] p-2 text-[11px] leading-snug text-[var(--color-text-tertiary)]">
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
      </div>}
    </div>
  );
}
