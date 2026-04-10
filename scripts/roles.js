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
    // Global Role Priority (Lower value = Higher permission)
    ROLES: {
        ADMIN: 'Administrador',
        COLAB: 'Colaborador',
        REVIEWER: 'Revisor',
        OBSERVER: 'Observador'
    },

    PRIORITY: {
        'Administrador': 0,
        'Colaborador': 1,
        'Revisor': 2,
        'Observador': 3
    },

    /**
     * Checks if a role has the required minimum permission level.
     * @param {string} userRole - Current user's role
     * @param {string} minRole - Minimum required role
     */
    atLeast(userRole, minRole) {
        const userLevel = this.PRIORITY[userRole] ?? 99;
        const minLevel = this.PRIORITY[minRole] ?? 0;
        return userLevel <= minLevel;
    },

    /**
     * Centralized authority to check if a user can perform an action globally.
     */
    can(action, userRole = 'Observador') {
        if (userRole === this.ROLES.ADMIN) return true;

        switch (action) {
            case 'ADD_MEMBER':
            case 'DELETE_MEMBER':
            case 'DELETE_PROJECT':
                return this.atLeast(userRole, this.ROLES.ADMIN);
            
            case 'ADD_PROJECT':
            case 'ADD_TASK':
            case 'UPDATE_TASK':
            case 'SAVE_DOCUMENT':
                return this.atLeast(userRole, this.ROLES.COLAB);

            case 'CHANGE_STATUS':
                return this.atLeast(userRole, this.ROLES.REVIEWER);

            default:
                return this.atLeast(userRole, this.ROLES.COLAB);
        }
    },

    /** Backward compatibility for note/item level roles */
    getRoles(item) {
        return item?.metadata?.roles || {};
    },

    isLead(item, currentUser) {
        return this.getRoles(item).lead === currentUser;
    },

    isReviewer(item, currentUser) {
        const roles = this.getRoles(item);
        const reviewers = Array.isArray(roles.reviewer) ? roles.reviewer : (roles.reviewer ? [roles.reviewer] : []);
        return reviewers.includes(currentUser);
    },

    isAuthor(item, currentUser) {
        return item?.createdBy === currentUser;
    },

    /**
     * Context-aware edit check: Admin can edit anything,
     * authors/leads can edit their items, others follow global Colab permission.
     */
    canEditContent(item, userLabel, userRole) {
        if (userRole === this.ROLES.ADMIN) return true;
        if (this.isLead(item, userLabel) || this.isAuthor(item, userLabel)) return true;
        return this.can('EDIT', userRole);
    },

    suggestRoles(tags = []) {
        const normalized = tags.map(t => String(t).toLowerCase());
        if (normalized.includes('médico') || normalized.includes('medico')) return ['Administrador', 'Colaborador', 'Revisor'];
        return ['Colaborador'];
    }
};
