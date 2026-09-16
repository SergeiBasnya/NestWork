import type { ErrorRequestHandler, NextFunction, Request, RequestHandler, Response } from 'express';

type AsyncRequestHandler = (req: Request, res: Response, next: NextFunction) => Promise<unknown>;

/**
 * Express 4 does not forward rejected handler promises to its error pipeline.
 * Keep that compatibility concern at the transport boundary so route code can
 * use async/await without repeating try/catch blocks.
 */
export function asyncHandler(handler: AsyncRequestHandler): RequestHandler {
  return (req, res, next) => {
    void handler(req, res, next).catch(next);
  };
}

export const notFoundHandler: RequestHandler = (_req, res) => {
  res.status(404).json({ error: 'Not found' });
};

function getErrorStatus(error: unknown): number {
  if (typeof error !== 'object' || error === null || !('status' in error)) return 500;
  const status = error.status;
  return typeof status === 'number' && status >= 400 && status < 600 ? status : 500;
}

export const errorHandler: ErrorRequestHandler = (error: unknown, _req, res, next) => {
  if (res.headersSent) {
    next(error);
    return;
  }

  console.error('[server] request failed:', error instanceof Error ? error.stack ?? error.message : error);

  const status = getErrorStatus(error);
  res.status(status).json({
    error: process.env.NODE_ENV === 'production' || !(error instanceof Error)
      ? 'Internal server error'
      : error.message,
  });
};
