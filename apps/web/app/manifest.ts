import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'NestWork',
    short_name: 'NestWork',
    description: "Votre QG d'équipe en 2D",
    // Open straight into the space; the AuthGuard there sends you to /login only
    // if there's no session. Landing on '/' instead made the PWA show the public
    // home page (with a "Connexion" button) on every launch, even when logged in.
    start_url: '/workspace/nestwork',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#F77F00',
    icons: [
      {
        src: '/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
