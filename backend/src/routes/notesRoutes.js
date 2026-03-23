import { Hono } from 'hono';
import NotesController from '../controllers/notesController.js';
import { authMiddleware } from '../middleware/auth.js';

export function createNotesRoutes() {
  const router = new Hono();
  const notesController = new NotesController();

  router.use('*', authMiddleware);

  router.get('/', (c) => notesController.getNotes(c));
  router.get('/:id', (c) => notesController.getNote(c));
  router.post('/', (c) => notesController.createNote(c));
  router.put('/:id', (c) => notesController.updateNote(c));
  router.delete('/:id', (c) => notesController.deleteNote(c));

  return router;
}
