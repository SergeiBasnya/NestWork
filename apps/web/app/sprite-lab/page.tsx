import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { SpriteLab } from '../../components/SpriteLab';

export const metadata: Metadata = {
  title: 'Laboratoire de sprites',
  robots: { index: false, follow: false },
};

export default function SpriteLabPage() {
  if (process.env.NODE_ENV === 'production') notFound();

  return <SpriteLab />;
}
