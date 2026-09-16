import { z } from 'zod';
import type { FurnitureDTO } from '@nestwork/shared';
import { FURNITURE_DEPTH_MAX, FURNITURE_DEPTH_MIN } from '@nestwork/shared';
import { prisma } from '../lib/prisma';

const idSchema = z.string().trim().min(1).max(128);
const coordinateSchema = z.number().int().min(-5000).max(15000);

export const furniturePlaceSchema = z.object({
  roomId: idSchema,
  catalogId: z.string().trim().min(1).max(80),
  col: z.number().int().min(0).max(4096),
  row: z.number().int().min(0).max(4096),
  w: z.number().int().min(1).max(64).default(1),
  h: z.number().int().min(1).max(64).default(1),
  x: coordinateSchema,
  y: coordinateSchema,
  depth: z.number().finite().min(FURNITURE_DEPTH_MIN).max(FURNITURE_DEPTH_MAX).default(3),
  flip: z.boolean().default(false),
});

export const furnitureMoveSchema = z.object({
  id: idSchema,
  x: coordinateSchema,
  y: coordinateSchema,
});

export const furnitureTransformSchema = z.object({
  id: idSchema,
  flip: z.boolean(),
});

export const furnitureRemoveSchema = z.object({ id: idSchema });

export const furnitureDepthSchema = z.object({
  id: idSchema,
  depth: z.number().finite().min(FURNITURE_DEPTH_MIN).max(FURNITURE_DEPTH_MAX),
});

export type FurniturePlaceInput = z.infer<typeof furniturePlaceSchema>;
export type FurnitureMoveInput = z.infer<typeof furnitureMoveSchema>;
export type FurnitureTransformInput = z.infer<typeof furnitureTransformSchema>;
export type FurnitureRemoveInput = z.infer<typeof furnitureRemoveSchema>;
export type FurnitureDepthInput = z.infer<typeof furnitureDepthSchema>;

interface WorkspaceAccess {
  memberRoles: Record<string, string>;
  roomIds: string[];
}

export interface FurnitureRepository {
  findWorkspace(slug: string): Promise<WorkspaceAccess | null>;
  findFurniture(id: string): Promise<FurnitureDTO | null>;
  listFurniture(roomIds: string[]): Promise<FurnitureDTO[]>;
  createFurniture(input: FurniturePlaceInput & { placedBy: string }): Promise<FurnitureDTO>;
  updateFurniture(id: string, data: Partial<Pick<FurnitureDTO, 'x' | 'y' | 'depth' | 'flip'>>): Promise<FurnitureDTO>;
  deleteFurniture(id: string): Promise<FurnitureDTO>;
}

export class FurnitureServiceError extends Error {
  constructor(
    public readonly status: 400 | 404,
    message: string,
  ) {
    super(message);
    this.name = 'FurnitureServiceError';
  }
}

export function createFurnitureService(repository: FurnitureRepository) {
  async function workspaceFor(slug: string, userId: string): Promise<WorkspaceAccess> {
    const workspace = await repository.findWorkspace(slug);
    if (!workspace || !workspace.memberRoles[userId]) {
      throw new FurnitureServiceError(404, 'Workspace not found');
    }
    return workspace;
  }

  async function furnitureFor(workspace: WorkspaceAccess, id: string): Promise<FurnitureDTO> {
    const furniture = await repository.findFurniture(id);
    if (!furniture || !workspace.roomIds.includes(furniture.roomId)) {
      throw new FurnitureServiceError(404, 'Furniture not found');
    }
    return furniture;
  }

  return {
    async list(slug: string, userId: string): Promise<FurnitureDTO[]> {
      const workspace = await workspaceFor(slug, userId);
      return repository.listFurniture(workspace.roomIds);
    },

    async place(slug: string, userId: string, input: FurniturePlaceInput): Promise<FurnitureDTO> {
      // Co-editing is intentional: every workspace member can arrange the shared office.
      const workspace = await workspaceFor(slug, userId);
      if (!workspace.roomIds.includes(input.roomId)) {
        throw new FurnitureServiceError(400, 'Room does not belong to this workspace');
      }
      return repository.createFurniture({ ...input, placedBy: userId });
    },

    async move(slug: string, userId: string, input: FurnitureMoveInput): Promise<FurnitureDTO> {
      const workspace = await workspaceFor(slug, userId);
      await furnitureFor(workspace, input.id);
      return repository.updateFurniture(input.id, { x: input.x, y: input.y });
    },

    async transform(slug: string, userId: string, input: FurnitureTransformInput): Promise<FurnitureDTO> {
      const workspace = await workspaceFor(slug, userId);
      await furnitureFor(workspace, input.id);
      return repository.updateFurniture(input.id, { flip: input.flip });
    },

    async remove(slug: string, userId: string, input: FurnitureRemoveInput): Promise<FurnitureDTO> {
      const workspace = await workspaceFor(slug, userId);
      await furnitureFor(workspace, input.id);
      return repository.deleteFurniture(input.id);
    },

    async setDepth(slug: string, userId: string, input: FurnitureDepthInput): Promise<FurnitureDTO> {
      const workspace = await workspaceFor(slug, userId);
      await furnitureFor(workspace, input.id);
      return repository.updateFurniture(input.id, { depth: input.depth });
    },
  };
}

const FURNITURE_SELECT = {
  id: true,
  roomId: true,
  placedBy: true,
  catalogId: true,
  col: true,
  row: true,
  w: true,
  h: true,
  x: true,
  y: true,
  depth: true,
  flip: true,
} as const;

export const furnitureService = createFurnitureService({
  async findWorkspace(slug) {
    const workspace = await prisma.workspace.findUnique({
      where: { slug },
      select: { members: { select: { userId: true, role: true } }, rooms: { select: { id: true } } },
    });
    return workspace ? {
      memberRoles: Object.fromEntries(workspace.members.map((member) => [member.userId, member.role])),
      roomIds: workspace.rooms.map((room) => room.id),
    } : null;
  },
  findFurniture: (id) => prisma.furniture.findUnique({ where: { id }, select: FURNITURE_SELECT }),
  listFurniture: (roomIds) => prisma.furniture.findMany({
    where: { roomId: { in: roomIds } },
    orderBy: { createdAt: 'asc' },
    select: FURNITURE_SELECT,
  }),
  createFurniture: ({ placedBy, ...input }) => prisma.furniture.create({
    data: { ...input, placedBy },
    select: FURNITURE_SELECT,
  }),
  updateFurniture: (id, data) => prisma.furniture.update({
    where: { id },
    data,
    select: FURNITURE_SELECT,
  }),
  deleteFurniture: (id) => prisma.furniture.delete({ where: { id }, select: FURNITURE_SELECT }),
});
