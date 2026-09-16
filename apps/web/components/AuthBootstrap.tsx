'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { bootstrapSession, initializeAuthCoordination } from '../lib/authSession';

export function AuthBootstrap({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  useEffect(() => {
    // The sprite lab is a development-only visual harness. It deliberately
    // avoids auth so a production cookie is never required to inspect assets
    // on localhost; all real application routes keep the normal bootstrap.
    if (process.env.NODE_ENV !== 'production' && pathname === '/sprite-lab') return;

    const cleanup = initializeAuthCoordination();
    void bootstrapSession();
    return cleanup;
  }, [pathname]);

  return <>{children}</>;
}
