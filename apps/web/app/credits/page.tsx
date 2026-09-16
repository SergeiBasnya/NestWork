import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import { Logo } from '../../components/Logo';
import styles from './Credits.module.css';

export const metadata: Metadata = {
  title: 'Crédits',
  description: 'Crédits des assets graphiques utilisés dans NestWork.',
};

export default function CreditsPage() {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link href="/" aria-label="Retour à l’accueil NestWork">
          <Logo size={31} />
        </Link>
        <Link href="/" className={styles.backLink}>
          <ArrowLeft size={17} aria-hidden /> Retour à l’accueil
        </Link>
      </header>

      <section className={styles.content}>
        <p className={styles.kicker}>À propos du décor</p>
        <h1>Crédits graphiques</h1>
        <p className={styles.intro}>
          L’édition publique de NestWork utilise sa propre bibliothèque pixel art.
          Une bibliothèque commerciale distincte peut être installée séparément
          dans un déploiement privé.
        </p>

        <article className={styles.creditCard}>
          <div className={styles.grassMark} aria-hidden />
          <div>
            <p className={styles.cardLabel}>Bibliothèque open source</p>
            <h2>Assets originaux NestWork</h2>
            <p>
              Les sols, murs, meubles, émoticônes et personnages placés dans les
              dossiers originaux NestWork sont distribués sous CC BY 4.0.
            </p>
            <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">
              Lire la licence CC BY 4.0 <ExternalLink size={15} aria-hidden />
            </a>
          </div>
        </article>

        <article className={styles.creditCard}>
          <div className={styles.pixelMark} aria-hidden><i /><i /><i /></div>
          <div>
            <p className={styles.cardLabel}>Bibliothèque privée optionnelle</p>
            <h2>Modern Interiors — LimeZu</h2>
            <p>
              Les déploiements qui possèdent une licence peuvent installer cette
              collection séparément. Ses fichiers ne font pas partie de l’édition
              open source.
            </p>
            <a href="https://limezu.itch.io/moderninteriors" target="_blank" rel="noreferrer">
              Découvrir le travail de LimeZu <ExternalLink size={15} aria-hidden />
            </a>
          </div>
        </article>

        <aside className={styles.licenseNote}>
          Le code NestWork est proposé sous AGPL-3.0. Les licences des assets et
          les exclusions sont détaillées dans le{' '}
          <a href="https://github.com/SergeiBasnya/NestWork" target="_blank" rel="noreferrer">
            dépôt source <ExternalLink size={14} aria-hidden />
          </a>.
        </aside>
      </section>
    </main>
  );
}
