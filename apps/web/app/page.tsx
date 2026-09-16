import type { Metadata } from 'next';
import Landing from './Landing';

// Homepage = the public landing. It's the only broadly indexable route (the app
// lives behind auth under /workspace, /login is noindex via robots), so it
// carries the brand's primary title, description, and structured data. The
// interactive landing itself is a client component (Landing.tsx); this server
// wrapper exists purely to attach metadata + JSON-LD, which a 'use client'
// module cannot export.

const SITE = 'https://nestwork.site';
const TITLE = 'NestWork, retrouve les échanges spontanés de ton équipe';
const DESCRIPTION =
  "Un espace d'équipe en 2D pour voir qui est là et parler simplement en s'approchant, sans planifier une réunion pour chaque petite question.";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  alternates: { canonical: '/', languages: { 'fr-FR': '/', en: '/en' } },
  openGraph: {
    type: 'website',
    url: SITE,
    siteName: 'NestWork',
    locale: 'fr_FR',
    title: TITLE,
    description: DESCRIPTION,
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: DESCRIPTION,
  },
};

// Organization + WebSite + SoftwareApplication, as one @graph. Lets search and
// AI engines name the product, its category, and its site in one pass.
const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': `${SITE}/#organization`,
      name: 'NestWork',
      url: SITE,
      logo: `${SITE}/icon-512.png`,
    },
    {
      '@type': 'WebSite',
      '@id': `${SITE}/#website`,
      name: 'NestWork',
      url: SITE,
      inLanguage: 'fr-FR',
      publisher: { '@id': `${SITE}/#organization` },
    },
    {
      '@type': 'SoftwareApplication',
      '@id': `${SITE}/#app`,
      name: 'NestWork',
      url: SITE,
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web',
      inLanguage: 'fr-FR',
      description: DESCRIPTION,
      publisher: { '@id': `${SITE}/#organization` },
    },
  ],
};

export default function Page() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <Landing locale="fr" />
    </>
  );
}
