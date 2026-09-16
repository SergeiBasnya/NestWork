'use client';

import { useParams } from 'next/navigation';
import { AuthGuard } from '../../../components/AuthGuard';
import { WorkspaceProvider } from '../../../contexts/WorkspaceContext';
import { MediaProvider } from '../../../contexts/MediaContext';
import { BottomStatusBar } from '../../../components/workspace/BottomStatusBar';
import { NavRail } from '../../../components/workspace/NavRail';
import { MembersSidebar } from '../../../components/workspace/MembersSidebar';
import { MediaToolbar } from '../../../components/workspace/MediaToolbar';
import { AvatarVideos } from '../../../components/workspace/AvatarVideos';
import { ScreenShareWindow } from '../../../components/workspace/ScreenShareWindow';
import { ZoomControls } from '../../../components/workspace/ZoomControls';

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const params = useParams();
  const slug = params.slug as string;

  return (
    <AuthGuard>
      <WorkspaceProvider slug={slug}>
        <MediaProvider>
          <div className="flex h-screen w-screen overflow-hidden">
            <NavRail />
            <MembersSidebar />
            <div className="relative flex flex-1 flex-col overflow-hidden">
              <main className="flex-1 overflow-hidden">{children}</main>
              <AvatarVideos />
              <ScreenShareWindow />
              <ZoomControls />
              <MediaToolbar />
              <BottomStatusBar />
            </div>
          </div>
        </MediaProvider>
      </WorkspaceProvider>
    </AuthGuard>
  );
}
