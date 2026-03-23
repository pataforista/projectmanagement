/**
 * Entry point del servidor
 */

import 'dotenv/config';
import { DatabaseInit } from './db/init.js';
import { createApp } from './app.js';
import logger from './config/logger.js';

const PORT = process.env.PORT || 3000;
const DB_URL = process.env.DATABASE_URL || './workspace.db';

// Inicializar BD
const init = new DatabaseInit(DB_URL);
init.init();
const db = init.db;

// Crear app
const app = createApp(db);

// Escuchar
const server = app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down');
  server.close(() => {
    logger.info('Server closed');
    db.close();
    process.exit(0);
  });
});

process.on('SIGINT', () => {
    logger.info('SIGINT received, shutting down');
    server.close(() => {
      logger.info('Server closed');
      db.close();
      process.exit(0);
    });
  });
