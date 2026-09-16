import type { Metadata } from 'next';
import { ThemeProvider } from '../components/ThemeProvider';
import { AuthBootstrap } from '../components/AuthBootstrap';
import './globals.css';

export const metadata: Metadata = {
  // Absolute base so og:image, canonical, and other relative URLs resolve.
  metadataBase: new URL('https://nestwork.site'),
  title: { default: 'NestWork', template: '%s · NestWork' },
  description: "Votre QG d'équipe en 2D",
  applicationName: 'NestWork',
  openGraph: { type: 'website', siteName: 'NestWork', locale: 'fr_FR' },
  twitter: { card: 'summary_large_image' },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html:
              "document.documentElement.lang=location.pathname==='/en'||location.pathname.startsWith('/en/')?'en':'fr'",
          }}
        />
      </head>
      <body className="min-h-screen font-sans">
        <ThemeProvider><AuthBootstrap>{children}</AuthBootstrap></ThemeProvider>
      </body>
    </html>
  );
}
