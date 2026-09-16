'use client';

import { useEffect, useRef, useState } from 'react';
import { LayoutGrid, X, Save, Trash2, Download, Loader2, ImageOff, Upload, FileDown, Globe, FolderOpen, Users, Check, Wand2 } from 'lucide-react';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { imageSrc } from '../../lib/api';
import type { MapTemplateDTO } from '@nestwork/shared';

export function MapsPanel() {
  const {
    mapsOpen,
    setMapsOpen,
    mapTemplates,
    loadMapTemplates,
    saveMapTemplate,
    generateMapTemplate,
    applyMapTemplate,
    deleteMapTemplate,
    exportMapTemplate,
    importMapTemplate,
    publicMaps,
    loadPublicMaps,
    setMapPublic,
    copyPublicMap,
  } = useWorkspace();

  const [tab, setTab] = useState<'mine' | 'community'>('mine');
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmApply, setConfirmApply] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Load the relevant list when the panel opens or the tab changes.
  useEffect(() => {
    if (!mapsOpen) return;
    if (tab === 'mine') loadMapTemplates();
    else loadPublicMaps();
  }, [mapsOpen, tab, loadMapTemplates, loadPublicMaps]);

  if (!mapsOpen) return null;

  const mine = mapTemplates.filter((t) => t.kind === 'user');
  const backups = mapTemplates.filter((t) => t.kind === 'backup');

  async function onImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setMsg(null);
    try {
      const tpl = await importMapTemplate(await file.text());
      setMsg(tpl ? { ok: true, text: `« ${tpl.name} » importée ✓` } : { ok: false, text: 'Fichier invalide ou illisible.' });
    } catch {
      setMsg({ ok: false, text: 'Impossible de lire le fichier.' });
    }
  }

  async function onSave() {
    if (saving) return;
    setSaving(true);
    await saveMapTemplate(name);
    setName('');
    setSaving(false);
  }

  async function onGenerate() {
    if (generating) return;
    setMsg(null);
    setGenerating(true);
    const tpl = await generateMapTemplate();
    setGenerating(false);
    setMsg(tpl ? { ok: true, text: 'Open-space généré ✓ — clique « Charger » pour l’essayer.' } : { ok: false, text: 'Échec de la génération.' });
  }

  async function onApply(id: string) {
    setConfirmApply(null);
    setMsg(null);
    setBusyId(id);
    try {
      await applyMapTemplate(id);
      setMapsOpen(false);
    } catch (error) {
      setMsg({
        ok: false,
        text: error instanceof Error ? error.message : 'Impossible de charger cette carte.',
      });
    } finally {
      setBusyId(null);
    }
  }

  async function onDelete(id: string) {
    setConfirmDelete(null);
    setBusyId(id);
    await deleteMapTemplate(id);
    setBusyId(null);
  }

  async function onUse(t: MapTemplateDTO) {
    setBusyId(t.id);
    const copy = await copyPublicMap(t.id);
    setBusyId(null);
    setMsg(copy ? { ok: true, text: `« ${t.name} » ajoutée à tes modèles ✓` } : { ok: false, text: 'Échec de la récupération.' });
  }

  function Thumb({ t }: { t: MapTemplateDTO }) {
    return (
      <div className="relative aspect-[16/10] w-full bg-[var(--color-panel-bg)]">
        {t.preview ? (
          <img src={imageSrc(t.preview)} alt={t.name} loading="lazy" decoding="async" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-[var(--color-text-tertiary)]"><ImageOff size={22} /></div>
        )}
      </div>
    );
  }

  // A card from MY library (apply / publish / export / delete).
  function MineCard({ t }: { t: MapTemplateDTO }) {
    const date = new Date(t.createdAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
    const publishable = t.kind === 'user';
    return (
      <div className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-hover-bg)]">
        <Thumb t={t} />
        <div className="flex items-center justify-between gap-2 px-2.5 py-2">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="truncate text-sm font-medium text-[var(--color-text-primary)]">{t.name}</span>
              {t.isPublic && <Globe size={12} className="shrink-0 text-honey" aria-label="Publié" />}
            </div>
            <div className="text-[11px] text-[var(--color-text-tertiary)]">{date}</div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button onClick={() => { setConfirmDelete(null); setConfirmApply(t.id); }} disabled={busyId === t.id} title="Charger cette carte" className="rounded-md bg-honey px-2 py-1 text-xs font-semibold text-hive-800 transition-colors hover:brightness-95 disabled:opacity-50">
              {busyId === t.id ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
            </button>
            {publishable && (
              <button
                onClick={() => setMapPublic(t.id, !t.isPublic)}
                title={t.isPublic ? 'Retirer de la communauté' : 'Publier dans la communauté'}
                className={`rounded-md p-1.5 transition-colors ${t.isPublic ? 'bg-honey/20 text-honey' : 'text-[var(--color-text-tertiary)] hover:bg-[var(--color-hover-bg)] hover:text-[var(--color-text-primary)]'}`}
              >
                <Globe size={14} />
              </button>
            )}
            <button onClick={() => exportMapTemplate(t.id)} disabled={busyId === t.id} title="Exporter vers un fichier (.json)" className="rounded-md p-1.5 text-[var(--color-text-tertiary)] transition-colors hover:bg-[var(--color-hover-bg)] hover:text-[var(--color-text-primary)] disabled:opacity-50">
              <FileDown size={14} />
            </button>
            <button onClick={() => { setConfirmApply(null); setConfirmDelete(t.id); }} disabled={busyId === t.id} title="Supprimer" className="rounded-md p-1.5 text-[var(--color-text-tertiary)] transition-colors hover:bg-red/10 hover:text-red disabled:opacity-50">
              <Trash2 size={14} />
            </button>
          </div>
        </div>
        {confirmApply === t.id && (
          <div className="border-t border-[var(--color-border)] bg-[var(--color-panel-bg)] px-2.5 py-2 text-xs">
            <p className="mb-1.5 text-[var(--color-text-secondary)]">Charger « {t.name} » ? Ton décor actuel sera <strong>sauvegardé automatiquement</strong> avant.</p>
            <div className="flex gap-1.5">
              <button onClick={() => onApply(t.id)} className="rounded bg-honey px-2 py-1 font-semibold text-hive-800 hover:brightness-95">Charger</button>
              <button onClick={() => setConfirmApply(null)} className="rounded px-2 py-1 text-[var(--color-text-secondary)] hover:bg-[var(--color-hover-bg)]">Annuler</button>
            </div>
          </div>
        )}
        {confirmDelete === t.id && (
          <div className="border-t border-[var(--color-border)] bg-[var(--color-panel-bg)] px-2.5 py-2 text-xs">
            <p className="mb-1.5 text-[var(--color-text-secondary)]">Supprimer « {t.name} » ? Irréversible.</p>
            <div className="flex gap-1.5">
              <button onClick={() => onDelete(t.id)} className="rounded bg-red px-2 py-1 font-semibold text-white hover:brightness-95">Supprimer</button>
              <button onClick={() => setConfirmDelete(null)} className="rounded px-2 py-1 text-[var(--color-text-secondary)] hover:bg-[var(--color-hover-bg)]">Annuler</button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // A card from the community gallery (use → copies to my library).
  function CommunityCard({ t }: { t: MapTemplateDTO }) {
    return (
      <div className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-hover-bg)]">
        <Thumb t={t} />
        <div className="flex items-center justify-between gap-2 px-2.5 py-2">
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-[var(--color-text-primary)]">{t.name}</div>
            <div className="truncate text-[11px] text-[var(--color-text-tertiary)]">par {t.authorName ?? 'Anonyme'}</div>
          </div>
          <button onClick={() => onUse(t)} disabled={busyId === t.id} title="Ajouter à mes modèles" className="flex shrink-0 items-center gap-1 rounded-md bg-honey px-2 py-1 text-xs font-semibold text-hive-800 transition-colors hover:brightness-95 disabled:opacity-50">
            {busyId === t.id ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />} Utiliser
          </button>
        </div>
      </div>
    );
  }

  const TabBtn = ({ id, icon, label }: { id: 'mine' | 'community'; icon: React.ReactNode; label: string }) => (
    <button
      onClick={() => { setMsg(null); setTab(id); }}
      className={`flex flex-1 items-center justify-center gap-1.5 border-b-2 py-2 text-xs font-medium transition-colors ${
        tab === id ? 'border-honey text-[var(--color-text-primary)]' : 'border-transparent text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]'
      }`}
    >
      {icon} {label}
    </button>
  );

  return (
    <div className="absolute right-0 top-0 z-20 flex h-full w-[360px] max-w-[90vw] flex-col border-l border-[var(--color-border)] bg-[var(--color-panel-bg)] shadow-xl">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--color-border)] px-3 py-2">
        <span className="flex items-center gap-2 text-sm font-semibold text-[var(--color-text-primary)]">
          <LayoutGrid size={16} /> Bibliothèque de cartes
        </span>
        <div className="flex items-center gap-1">
          {tab === 'mine' && (
            <>
              <input ref={fileRef} type="file" accept=".json,application/json" onChange={onImportFile} className="hidden" />
              <button onClick={() => fileRef.current?.click()} title="Importer une carte depuis un fichier .json" className="flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-hover-bg)] hover:text-[var(--color-text-primary)]">
                <Upload size={14} /> Importer
              </button>
            </>
          )}
          <button onClick={() => setMapsOpen(false)} title="Fermer" className="rounded p-1 text-[var(--color-text-tertiary)] hover:bg-[var(--color-hover-bg)] hover:text-[var(--color-text-primary)]">
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-[var(--color-border)]">
        <TabBtn id="mine" icon={<FolderOpen size={14} />} label="Mes modèles" />
        <TabBtn id="community" icon={<Users size={14} />} label="Communauté" />
      </div>

      {msg && (
        <div className={`flex items-center justify-between gap-2 px-3 py-1.5 text-xs ${msg.ok ? 'bg-honey/15 text-hive-800' : 'bg-red/10 text-red'}`}>
          <span className="flex items-center gap-1">{msg.ok && <Check size={13} />}{msg.text}</span>
          <button onClick={() => setMsg(null)} className="opacity-60 hover:opacity-100"><X size={13} /></button>
        </div>
      )}

      {tab === 'mine' ? (
        <>
          {/* Save current map */}
          <div className="border-b border-[var(--color-border)] p-2.5">
            <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-[var(--color-text-tertiary)]">Enregistrer la carte actuelle</label>
            <div className="flex gap-1.5">
              <input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') onSave(); }} placeholder="Nom du modèle…" className="min-w-0 flex-1 rounded-lg border border-[var(--color-input-border)] bg-[var(--color-input-bg)] px-2.5 py-1.5 text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-tertiary)] outline-none focus:border-honey" />
              <button onClick={onSave} disabled={saving} className="flex shrink-0 items-center gap-1 rounded-lg bg-honey px-2.5 py-1.5 text-sm font-semibold text-hive-800 transition-colors hover:brightness-95 disabled:opacity-50">
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Enregistrer
              </button>
            </div>
            <button
              onClick={onGenerate}
              disabled={generating}
              className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-honey/60 px-2.5 py-1.5 text-sm font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-honey/10 hover:text-[var(--color-text-primary)] disabled:opacity-50"
            >
              {generating ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />} Générer un open-space
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-2.5">
            {mapTemplates.length === 0 ? (
              <p className="mt-6 px-2 text-center text-sm text-[var(--color-text-tertiary)]">Aucun modèle pour l’instant. Construis ta carte, puis enregistre-la ci-dessus. 🗺️</p>
            ) : (
              <div className="space-y-4">
                {mine.length > 0 && (
                  <section className="space-y-2">
                    <h3 className="px-0.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-tertiary)]">Mes modèles</h3>
                    {mine.map((t) => <MineCard key={t.id} t={t} />)}
                  </section>
                )}
                {backups.length > 0 && (
                  <section className="space-y-2">
                    <h3 className="px-0.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-tertiary)]">Sauvegardes auto</h3>
                    {backups.map((t) => <MineCard key={t.id} t={t} />)}
                  </section>
                )}
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="flex-1 overflow-y-auto p-2.5">
          {publicMaps.length === 0 ? (
            <p className="mt-6 px-2 text-center text-sm text-[var(--color-text-tertiary)]">Aucune carte publiée pour l’instant. Publie l’une des tiennes (icône 🌐) pour lancer la communauté !</p>
          ) : (
            <div className="space-y-2">
              {publicMaps.map((t) => <CommunityCard key={t.id} t={t} />)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
