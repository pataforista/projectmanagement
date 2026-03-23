export class NotesService {
  constructor() {}

  async getNotes(db, userId) {
    const { results } = await db.prepare('SELECT * FROM notes WHERE user_id = ? AND _deleted = 0').bind(userId).all();
    return results;
  }

  async getNoteById(db, userId, noteId) {
    const { results } = await db.prepare('SELECT * FROM notes WHERE user_id = ? AND id = ?').bind(userId, noteId).all();
    return results[0];
  }

  async createNote(db, userId, noteData) {
    const now = Date.now();
    const noteId = noteData.id || crypto.randomUUID();
    const content = noteData.content || '';
    
    // Hash content using Web Crypto (SubtleCrypto)
    const msgUint8 = new TextEncoder().encode(content);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const contentHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    await db.prepare(`
      INSERT INTO notes (
        id, user_id, title, content, content_hash, type, tags, is_pinned, 
        links, frontmatter, local_version, created_by, updated_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)
    `).bind(
      noteId,
      userId,
      noteData.title || 'Nueva Nota',
      content,
      contentHash,
      noteData.type || 'general',
      JSON.stringify(noteData.tags || []),
      noteData.isPinned ? 1 : 0,
      JSON.stringify(noteData.links || []),
      noteData.frontmatter || null,
      userId,
      userId,
      now,
      now
    ).run();
    
    return this.getNoteById(db, userId, noteId);
  }

  async updateNote(db, userId, noteId, noteData) {
    const current = await this.getNoteById(db, userId, noteId);
    if (!current) throw new Error('Note not found');

    const now = Date.now();
    let contentHash = current.content_hash;
    if (noteData.content !== undefined) {
      const msgUint8 = new TextEncoder().encode(noteData.content || '');
      const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      contentHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }

    await db.prepare(`
      UPDATE notes SET 
        title = COALESCE(?, title),
        content = COALESCE(?, content),
        content_hash = ?,
        type = COALESCE(?, type),
        tags = COALESCE(?, tags),
        is_pinned = COALESCE(?, is_pinned),
        links = COALESCE(?, links),
        frontmatter = COALESCE(?, frontmatter),
        local_version = local_version + 1,
        updated_by = ?,
        updated_at = ?
      WHERE id = ? AND user_id = ?
    `).bind(
      noteData.title,
      noteData.content,
      contentHash,
      noteData.type,
      noteData.tags ? JSON.stringify(noteData.tags) : null,
      noteData.isPinned !== undefined ? (noteData.isPinned ? 1 : 0) : null,
      noteData.links ? JSON.stringify(noteData.links) : null,
      noteData.frontmatter,
      userId,
      now,
      noteId,
      userId
    ).run();

    return this.getNoteById(db, userId, noteId);
  }

  async deleteNote(db, userId, noteId) {
    const { success } = await db.prepare('UPDATE notes SET _deleted = 1, updated_at = ? WHERE id = ? AND user_id = ?')
                                 .bind(Date.now(), noteId, userId).run();
    return success;
  }
}

export default NotesService;
