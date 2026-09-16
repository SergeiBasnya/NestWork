import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { FurnitureDTO } from '@nestwork/shared';
import {
  createFurnitureService,
  furnitureDepthSchema,
  furniturePlaceSchema,
  FurnitureServiceError,
  type FurnitureRepository,
} from '../src/services/furniture';

const item: FurnitureDTO = {
  id: 'furniture-1',
  roomId: 'room-1',
  placedBy: 'user-1',
  catalogId: 'desk',
  col: 0,
  row: 0,
  w: 2,
  h: 1,
  x: 100,
  y: 200,
  depth: 3.25,
  flip: false,
};

function repository(overrides: Partial<FurnitureRepository> = {}): FurnitureRepository {
  return {
    findWorkspace: async () => ({ memberRoles: { 'user-1': 'OWNER' }, roomIds: ['room-1'] }),
    findFurniture: async () => item,
    listFurniture: async () => [item],
    createFurniture: async (input) => ({ ...item, ...input }),
    updateFurniture: async (_id, data) => ({ ...item, ...data }),
    deleteFurniture: async () => item,
    ...overrides,
  };
}

const placeInput = furniturePlaceSchema.parse({
  roomId: 'room-1',
  catalogId: 'desk',
  col: 0,
  row: 0,
  w: 2,
  h: 1,
  x: 100,
  y: 200,
  depth: 3.25,
  flip: false,
});

describe('furniture service', () => {
  test('rejects a caller who is not a workspace member', async () => {
    let didCreate = false;
    const service = createFurnitureService(repository({
      findWorkspace: async () => ({ memberRoles: { 'someone-else': 'OWNER' }, roomIds: ['room-1'] }),
      createFurniture: async (input) => {
        didCreate = true;
        return { ...item, ...input };
      },
    }));

    await assert.rejects(
      () => service.place('workspace', 'user-1', placeInput),
      (error) => error instanceof FurnitureServiceError && error.status === 404,
    );
    assert.equal(didCreate, false);
  });

  test('allows intentional workspace co-editing by members', async () => {
    const service = createFurnitureService(repository({
      findWorkspace: async () => ({ memberRoles: { 'user-1': 'MEMBER' }, roomIds: ['room-1'] }),
    }));
    assert.equal((await service.list('workspace', 'user-1')).length, 1);
    assert.equal((await service.place('workspace', 'user-1', placeInput)).catalogId, 'desk');
  });

  test('rejects placement in a room outside the workspace', async () => {
    const service = createFurnitureService(repository());

    await assert.rejects(
      () => service.place('workspace', 'user-1', { ...placeInput, roomId: 'room-2' }),
      (error) => error instanceof FurnitureServiceError && error.status === 400,
    );
  });

  test('rejects mutation of furniture from another workspace room', async () => {
    let didUpdate = false;
    const service = createFurnitureService(repository({
      findFurniture: async () => ({ ...item, roomId: 'room-2' }),
      updateFurniture: async (_id, data) => {
        didUpdate = true;
        return { ...item, ...data };
      },
    }));

    await assert.rejects(
      () => service.move('workspace', 'user-1', { id: item.id, x: 1, y: 2 }),
      (error) => error instanceof FurnitureServiceError && error.status === 404,
    );
    assert.equal(didUpdate, false);
  });

  test('preserves fractional depth on placement and restacking', async () => {
    const depths: number[] = [];
    const service = createFurnitureService(repository({
      createFurniture: async (input) => {
        depths.push(input.depth);
        return { ...item, ...input };
      },
      updateFurniture: async (_id, data) => {
        if (data.depth !== undefined) depths.push(data.depth);
        return { ...item, ...data };
      },
    }));

    const placed = await service.place('workspace', 'user-1', placeInput);
    const depthInput = furnitureDepthSchema.parse({ id: item.id, depth: 12.75 });
    const restacked = await service.setDepth('workspace', 'user-1', depthInput);

    assert.equal(placed.depth, 3.25);
    assert.equal(restacked.depth, 12.75);
    assert.deepEqual(depths, [3.25, 12.75]);
  });

  test('applies the same depth bounds to placement and restacking', () => {
    assert.equal(furniturePlaceSchema.safeParse({ ...placeInput, depth: 0.99 }).success, false);
    assert.equal(furniturePlaceSchema.safeParse({ ...placeInput, depth: 50.01 }).success, false);
    assert.equal(furnitureDepthSchema.safeParse({ id: item.id, depth: 0.99 }).success, false);
    assert.equal(furnitureDepthSchema.safeParse({ id: item.id, depth: 50.01 }).success, false);
    const withDefaultDepth = furniturePlaceSchema.parse({
      roomId: placeInput.roomId,
      catalogId: placeInput.catalogId,
      col: placeInput.col,
      row: placeInput.row,
      w: placeInput.w,
      h: placeInput.h,
      x: placeInput.x,
      y: placeInput.y,
      flip: placeInput.flip,
    });
    assert.equal(withDefaultDepth.depth, 3);
  });
});
