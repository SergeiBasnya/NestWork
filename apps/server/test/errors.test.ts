import assert from 'node:assert/strict';
import { afterEach, describe, test } from 'node:test';
import type { NextFunction, Request, Response } from 'express';
import { asyncHandler, errorHandler, notFoundHandler } from '../src/middleware/errors';

const originalNodeEnv = process.env.NODE_ENV;
const originalConsoleError = console.error;

afterEach(() => {
  if (originalNodeEnv === undefined) {
    delete process.env.NODE_ENV;
  } else {
    process.env.NODE_ENV = originalNodeEnv;
  }
  console.error = originalConsoleError;
});

function responseRecorder() {
  const result: { status?: number; body?: unknown } = {};
  const response = {
    headersSent: false,
    status(code: number) {
      result.status = code;
      return this;
    },
    json(body: unknown) {
      result.body = body;
      return this;
    },
  } as unknown as Response;
  return { response, result };
}

describe('Express error middleware', () => {
  test('forwards rejected async handlers and returns a JSON 500', async () => {
    process.env.NODE_ENV = 'development';
    console.error = () => undefined;
    const handler = asyncHandler(async () => {
      throw new Error('database unavailable');
    });
    const { response, result } = responseRecorder();
    await new Promise<void>((resolve, reject) => {
      handler({} as Request, response, ((error?: unknown) => {
        if (!error) return reject(new Error('Expected the rejected promise to be forwarded'));
        errorHandler(error, {} as Request, response, (() => undefined) as NextFunction);
        resolve();
      }) as NextFunction);
    });

    assert.equal(result.status, 500);
    assert.deepEqual(result.body, { error: 'database unavailable' });
  });

  test('does not expose internal errors in production', async () => {
    process.env.NODE_ENV = 'production';
    console.error = () => undefined;
    const { response, result } = responseRecorder();
    errorHandler(
      new Error('sensitive database detail'),
      {} as Request,
      response,
      (() => undefined) as NextFunction,
    );

    assert.equal(result.status, 500);
    assert.deepEqual(result.body, { error: 'Internal server error' });
  });

  test('returns a JSON 404 for an unknown route', async () => {
    const { response, result } = responseRecorder();
    notFoundHandler({} as Request, response, (() => undefined) as NextFunction);

    assert.equal(result.status, 404);
    assert.deepEqual(result.body, { error: 'Not found' });
  });
});
