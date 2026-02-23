import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  console.error('Error:', err.message);

  if (err instanceof ZodError) {
    res.status(400).json({
      error: 'Validation error',
      details: err.errors,
    });
    return;
  }

  if (err.message.includes('CORS policy')) {
    res.status(403).json({ error: err.message });
    return;
  }

  if (err.message.includes('Claude did not return')) {
    res.status(502).json({
      error: 'AI service error',
      message: err.message,
    });
    return;
  }

  res.status(500).json({
    error: 'Internal server error',
    message: err.message,
  });
}
