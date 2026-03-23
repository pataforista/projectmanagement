/**
 * Middleware centralizado de manejo de errores
 */

import logger from '../config/logger.js';

export function createErrorHandler() {
  return (err, req, res, next) => {
    logger.error(`Error: ${err.message}`, {
      path: req.path,
      method: req.method,
      userId: req.userId,
      stack: err.stack,
    });

    if (err.name === 'ValidationError') {
      return res.status(400).json({
        status: 'error',
        code: 'VALIDATION_ERROR',
        message: err.message,
        details: err.details,
      });
    }

    return res.status(500).json({
      status: 'error',
      code: 'INTERNAL_SERVER_ERROR',
      message: process.env.NODE_ENV === 'production'
        ? 'An error occurred'
        : err.message,
    });
  };
}
