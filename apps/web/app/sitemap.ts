import type { MetadataRoute } from 'next';

// Served at /sitemap.xml. Only the public landing is indexable today; add more
// public routes (pricing, about, blog) here as they ship.
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: 'https://nestwork.site',
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 1,
      alternates: { languages: { fr: 'https://nestwork.site', en: 'https://nestwork.site/en' } },
    },
    {
      url: 'https://nestwork.site/en',
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.9,
      alternates: { languages: { fr: 'https://nestwork.site', en: 'https://nestwork.site/en' } },
    },
    {
      url: 'https://nestwork.site/credits',
      lastModified: new Date(),
      changeFrequency: 'yearly',
      priority: 0.2,
    },
  ];
}
