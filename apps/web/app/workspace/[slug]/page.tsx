'use client';

import { useAuthStore } from '../../../stores/auth';
import { useWorkspace } from '../../../contexts/WorkspaceContext';
import { GameCanvas } from '../../../components/GameCanvas';
import { DecoratorBar } from '../../../components/DecoratorBar';
import { MessagingPanel } from '../../../components/workspace/MessagingPanel';
import { AwayNotice } from '../../../components/workspace/AwayNotice';
import { MapsPanel } from '../../../components/workspace/MapsPanel';
import { MiniMap } from '../../../components/workspace/MiniMap';

function SpaceView() {
  const user = useAuthStore((s) => s.user);
  const {
    rooms,
    socket,
    loading,
    error,
    slug,
    setCurrentRoomName,
    decoratorMode,
    moveMode,
    eraseMode,
    collisionMode,
    myDesk,
    desks,
    furnitureItems,
    workspaceAssets,
    selectedCatalogItem,
    placeFurniture,
    moveFurniture,
    removeFurniture,
    transformFurniture,
    changeFurnitureDepth,
  } = useWorkspace();

  function handleRoomChange(_roomId: string | null, roomName: string | null) {
    setCurrentRoomName(roomName);
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="font-pixel text-honey-700">Chargement du space...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <p className="text-red">{error}</p>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full">
      {socket && user && (
        <GameCanvas
          rooms={rooms}
          socket={socket}
          userId={user.id}
          userName={user.name}
          character={user.character}
          workspaceSlug={slug}
          onRoomChange={handleRoomChange}
          decoratorMode={decoratorMode}
          moveMode={moveMode}
          eraseMode={eraseMode}
          collisionMode={collisionMode}
          myDesk={myDesk}
          desks={desks}
          furnitureItems={furnitureItems}
          workspaceAssets={workspaceAssets}
          selectedCatalogItem={selectedCatalogItem}
          onFurniturePlace={placeFurniture}
          onFurnitureMove={moveFurniture}
          onFurnitureRemove={removeFurniture}
          onFurnitureTransform={transformFurniture}
          onFurnitureDepth={changeFurnitureDepth}
        />
      )}
      <DecoratorBar />
      <MessagingPanel />
      <MapsPanel />
      <AwayNotice />
      {!decoratorMode && <MiniMap />}
    </div>
  );
}

export default function WorkspacePage() {
  return <SpaceView />;
}
