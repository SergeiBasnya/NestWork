import { Router, type Request, type Response } from 'express';
import { authMiddleware } from '../middleware/auth';
import { asyncHandler } from '../middleware/errors';
import {
  FurnitureServiceError,
  furnitureMoveSchema,
  furniturePlaceSchema,
  furnitureRemoveSchema,
  furnitureService,
} from '../services/furniture';

const router: Router = Router();
router.use(authMiddleware);

function sendFurnitureError(res: Response, error: unknown): boolean {
  if (!(error instanceof FurnitureServiceError)) return false;
  res.status(error.status).json({ error: error.message });
  return true;
}

router.get('/:slug', asyncHandler(async (req: Request, res: Response) => {
  try {
    const furniture = await furnitureService.list(req.params.slug, req.user!.userId);
    res.json({ furniture });
  } catch (error) {
    if (!sendFurnitureError(res, error)) throw error;
  }
}));

router.post('/:slug', asyncHandler(async (req: Request, res: Response) => {
  const parsed = furniturePlaceSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors });
    return;
  }

  try {
    const furniture = await furnitureService.place(req.params.slug, req.user!.userId, parsed.data);
    res.status(201).json({ furniture });
  } catch (error) {
    if (!sendFurnitureError(res, error)) throw error;
  }
}));

router.patch('/:slug/:id', asyncHandler(async (req: Request, res: Response) => {
  const parsed = furnitureMoveSchema.safeParse({ ...req.body, id: req.params.id });
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors });
    return;
  }

  try {
    const furniture = await furnitureService.move(req.params.slug, req.user!.userId, parsed.data);
    res.json({ furniture });
  } catch (error) {
    if (!sendFurnitureError(res, error)) throw error;
  }
}));

router.delete('/:slug/:id', asyncHandler(async (req: Request, res: Response) => {
  const parsed = furnitureRemoveSchema.safeParse({ id: req.params.id });
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors });
    return;
  }

  try {
    await furnitureService.remove(req.params.slug, req.user!.userId, parsed.data);
    res.json({ message: 'Furniture deleted' });
  } catch (error) {
    if (!sendFurnitureError(res, error)) throw error;
  }
}));

export default router;
