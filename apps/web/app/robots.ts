import type { MetadataRoute } from 'next';

// Served at /robots.txt. The app shell under /workspace is auth-gated and has
// no SEO value, so keep crawlers on the public marketing surface.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/workspace/', '/join/'] },
    sitemap: 'https://nestwork.site/sitemap.xml',
    host: 'https://nestwork.site',
  };
}
