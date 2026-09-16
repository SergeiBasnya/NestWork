export interface ApplyMapDependencies<TFurniture> {
  replaceFurniture: () => Promise<void>;
  readFurniture: () => Promise<TFurniture[]>;
  publishFurniture: (furniture: TFurniture[]) => void;
}

/**
 * Preserve the ordering guarantees of a map replacement independently from
 * Prisma and Socket.IO: clients only hear about state committed to the database
 * and successfully read back with its authoritative ids.
 */
export async function applyMap<TFurniture>(dependencies: ApplyMapDependencies<TFurniture>): Promise<void> {
  await dependencies.replaceFurniture();
  const furniture = await dependencies.readFurniture();
  dependencies.publishFurniture(furniture);
}
