/**
 * notifications.js — Web Notifications & Reminders Logic
 */

/**
 * Gestor de Notificaciones del Escritorio y Recordatorios.
 */
const NotificationsManager = {
    /**
     * Inicializa el sistema de notificaciones. Solicita permiso al usuario si 
     * aún no lo ha concedido, verifica recordatorios pendientes inmediatamente 
     * y configura un intervalo de chequeo horario.
     */
    async init() {
        if (!('Notification' in window)) {
            console.warn('Este navegador no soporta notificaciones de escritorio');
            return;
        }

        // Check reminders immediately if already granted. If default, ask first.
        if (Notification.permission === 'default') {
            try {
                const permission = await Notification.requestPermission();
                if (permission === 'granted') this.checkReminders();
            } catch (e) {
                console.error('Error requesting notification permission', e);
            }
        } else if (Notification.permission === 'granted') {
            this.checkReminders();
        }

        // Check every hour (3600000 ms)
        setInterval(() => this.checkReminders(), 3600000);
    },

    /**
     * Evalúa todas las tareas locales no terminadas para determinar si hay 
     * tareas vencidas o por vencer (mañana o hoy) y dispara una alerta 
     * agrupada de recordatorio diario.
     */
    checkReminders() {
        if (Notification.permission !== 'granted') return;

        const lastCheck = localStorage.getItem('workspace_last_notif_date');
        const todayStr = new Date().toDateString();

        // Only notify once per calendar day to avoid spamming the user on every reload
        if (lastCheck === todayStr) return;

        try {
            const tasks = window.store.get.allTasks();
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            let urgentCount = 0;
            let overdueCount = 0;

            tasks.forEach(t => {
                if (t.status === 'Terminado' || t.status === 'Archivado') return;
                if (!t.dueDate) return;

                // Due date is YYYY-MM-DD
                const dueDate = new Date(t.dueDate);
                // Adjust for timezone differences by checking local time components
                const diffTime = dueDate.getTime() - today.getTime();
                const diffDays = diffTime / (1000 * 60 * 60 * 24);

                if (diffDays < 0) {
                    overdueCount++;
                } else if (diffDays <= 1) { // Due today or tomorrow
                    urgentCount++;
                }
            });

            if (urgentCount > 0 || overdueCount > 0) {
                let body = '';
                if (overdueCount > 0) body += `Tienes ${overdueCount} tareas atrasadas. `;
                if (urgentCount > 0) body += `Tienes ${urgentCount} tareas que vencen pronto.`;

                this.showNotification('Recordatorio de Workspace', {
                    body: body.trim(),
                    // icon: '/icons/icon-192x192.png' // Default browser icon if omitted
                });

                localStorage.setItem('workspace_last_notif_date', todayStr);
            }
        } catch (e) {
            console.warn('Could not check reminders yet (store might not be loaded).');
        }
    },

    /**
     * Levanta una notificación nativa del SO.
     * @param {string} title - Título de la notificación.
     * @param {Object} options - Parámetros de la notificación (body, icon, etc).
     */
    showNotification(title, options) {
        if (Notification.permission === 'granted') {
            try {
                const n = new Notification(title, options);
                n.onclick = function () {
                    window.focus();
                    n.close();
                };
            } catch (e) {
                console.error("Error showing notification:", e);
            }
        }
    },

    // For testing and demo purposes
    /**
     * Función de prueba para verificar que los permisos están correctamente configurados
     * y el navegador es capaz de renderizar las notificaciones nativas.
     */
    testNotification() {
        this.showNotification('Workspace de Producción', {
            body: 'Las notificaciones están funcionando correctamente.'
        });
    }
};

window.NotificationsManager = NotificationsManager;
