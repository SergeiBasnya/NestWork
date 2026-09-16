import type { Metadata } from 'next';
import Landing from '../Landing';

const SITE = 'https://nestwork.site';
const TITLE = 'NestWork, the 2D virtual office for remote teams';
const DESCRIPTION =
  'See who is around and start talking by walking up to a teammate. NestWork brings spontaneous conversations back to small remote teams.';

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  alternates: { canonical: '/en', languages: { 'fr-FR': '/', en: '/en' } },
  openGraph: {
    type: 'website',
    url: `${SITE}/en`,
    siteName: 'NestWork',
    locale: 'en_US',
    alternateLocale: ['fr_FR'],
    title: TITLE,
    description: DESCRIPTION,
  },
  twitter: { card: 'summary_large_image', title: TITLE, description: DESCRIPTION },
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'NestWork',
  url: `${SITE}/en`,
  applicationCategory: 'BusinessApplication',
  operatingSystem: 'Web',
  inLanguage: 'en',
  description: DESCRIPTION,
  author: { '@type': 'Person', name: 'Sébastien Lafontaine' },
};

export default function EnglishHomePage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <Landing locale="en" />
    </>
  );
}
