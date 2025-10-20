import { Request, Response, NextFunction } from 'express';

export interface ApiError extends Error {
  status?: number;
}

export function errorHandler(
  error: ApiError,
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  const status = error.status || 500;
  const message = error.message || 'Internal server error';

  console.error('Error:', error);

  res.status(status).json({
    success: false,
    error: {
      message,
      status,
    },
  });
}

export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json({
    success: false,
    error: {
      message: 'Route not found',
      status: 404,
    },
  });
}
