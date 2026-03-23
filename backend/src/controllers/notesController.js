import { NotesService } from '../services/notesService.js';

export default class NotesController {
  constructor() {
    this.notesService = new NotesService();
  }

  async getNotes(c) {
    const userId = c.get('userId');
    try {
      const notes = await this.notesService.getNotes(c.env.DB, userId);
      return c.json({ status: 'success', data: notes });
    } catch (error) {
      console.error('[NotesController] getNotes error:', error);
      return c.json({ status: 'error', message: error.message }, 500);
    }
  }

  async getNote(c) {
    const userId = c.get('userId');
    const id = c.req.param('id');
    try {
      const note = await this.notesService.getNoteById(c.env.DB, userId, id);
      if (!note) {
        return c.json({ status: 'error', message: 'Note not found' }, 404);
      }
      return c.json({ status: 'success', data: note });
    } catch (error) {
      console.error('[NotesController] getNote error:', error);
      return c.json({ status: 'error', message: error.message }, 500);
    }
  }

  async createNote(c) {
    const userId = c.get('userId');
    const body = await c.req.json();
    try {
      const note = await this.notesService.createNote(c.env.DB, userId, body);
      return c.json({ status: 'success', data: note }, 201);
    } catch (error) {
      console.error('[NotesController] createNote error:', error);
      return c.json({ status: 'error', message: error.message }, 500);
    }
  }

  async updateNote(c) {
    const userId = c.get('userId');
    const id = c.req.param('id');
    const body = await c.req.json();
    try {
      const note = await this.notesService.updateNote(c.env.DB, userId, id, body);
      return c.json({ status: 'success', data: note });
    } catch (error) {
      console.error('[NotesController] updateNote error:', error);
      return c.json({ status: 'error', message: error.message }, 500);
    }
  }

  async deleteNote(c) {
    const userId = c.get('userId');
    const id = c.req.param('id');
    try {
      const success = await this.notesService.deleteNote(c.env.DB, userId, id);
      if (!success) {
        return c.json({ status: 'error', message: 'Note not found' }, 404);
      }
      return c.json({ status: 'success', message: 'Note deleted' });
    } catch (error) {
      console.error('[NotesController] deleteNote error:', error);
      return c.json({ status: 'error', message: error.message }, 500);
    }
  }
}
