import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Rejoindre un espace NestWork',
  robots: { index: false, follow: false, noarchive: true },
};

export default function JoinLayout({ children }: { children: React.ReactNode }) {
  return children;
}
