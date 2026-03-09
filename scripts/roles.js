/**
 * scripts/roles.js
 *
 * Gestión de roles y permisos para colaboración en notas.
 * - Separación clara de permisos (editar, validar, cambiar status)
 * - Soporta reviewer como string o array
 * - Sugerencia de roles basada en tags
 */

/**
 * Convierte valor a array si es necesario
 */
function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value == null) return [];
  return [value];
}

export const RoleManager = {
  /**
   * Obtiene objeto de roles de una nota
   */
  getRoles(note) {
    return note?.metadata?.roles || {};
  },

  /**
   * Verifica si un usuario es el lead
   */
  isLead(note, currentUser) {
    const roles = this.getRoles(note);
    return roles.lead === currentUser;
  },

  /**
   * Verifica si un usuario es revisor
   * Soporta reviewer como string o array
   */
  isReviewer(note, currentUser) {
    const roles = this.getRoles(note);
    return asArray(roles.reviewer).includes(currentUser);
  },

  /**
   * Verifica si un usuario es el autor
   */
  isAuthor(note, currentUser) {
    return note?.createdBy === currentUser;
  },

  /**
   * Verifica si puede editar contenido
   * Lead o autor pueden editar
   */
  canEditContent(note, currentUser) {
    return this.isLead(note, currentUser) || this.isAuthor(note, currentUser);
  },

  /**
   * Verifica si puede validar/revisar
   * Lead o reviewer pueden validar
   */
  canValidate(note, currentUser) {
    return this.isLead(note, currentUser) || this.isReviewer(note, currentUser);
  },

  /**
   * Verifica si puede cambiar status
   * Lead o reviewer pueden cambiar status
   */
  canChangeStatus(note, currentUser) {
    return this.isLead(note, currentUser) || this.isReviewer(note, currentUser);
  },

  /**
   * Sugiere roles basados en tags de la nota
   *
   * @param {Array} tags - Array de tags
   * @returns {Array} Roles sugeridos
   */
  suggestRoles(tags = []) {
    const normalized = tags.map(t => String(t).toLowerCase());

    if (normalized.includes('médico') || normalized.includes('medico')) {
      return ['Lead clínico', 'Revisor', 'Colaborador'];
    }

    if (normalized.includes('académico') || normalized.includes('academico')) {
      return ['Investigador principal', 'Revisor', 'Editor'];
    }

    return ['Colaborador'];
  }
};
