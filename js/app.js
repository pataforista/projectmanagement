/**
 * app.js
 * Core logic for the Vanilla JS Workspace de Producción shell
 */

document.addEventListener('DOMContentLoaded', () => {
    // Initialize Feather Icons
    feather.replace();

    // Simple routing logic to switch active states on sidebar
    const navItems = document.querySelectorAll('.sidebar-nav .nav-item[data-view]');
    
    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            
            // Remove active class from all
            navItems.forEach(nav => nav.classList.remove('active'));
            
            // Add active class to clicked
            item.classList.add('active');
            
            // Update breadcrumb
            const viewName = item.textContent.trim();
            const breadcrumbCurrent = document.querySelector('.breadcrumbs .current');
            if (breadcrumbCurrent) {
                breadcrumbCurrent.textContent = viewName;
            }
            
            // Note: In a real app without React, we would fetch/render HTML templates here.
            // For now, we just change the header visually.
            const headerTitle = document.querySelector('.view-header h1');
            const headerSubtitle = document.querySelector('.view-header .subtitle');
            
            if (headerTitle) {
                headerTitle.textContent = viewName;
            }
            
            if (headerSubtitle) {
                if (item.dataset.view === 'projects') {
                    headerSubtitle.textContent = 'Gestión de tus proyectos activos y archivados.';
                } else if (item.dataset.view === 'cycles') {
                    headerSubtitle.textContent = 'Planificación temporal y timeboxing.';
                } else {
                    headerSubtitle.textContent = 'Resumen de tu actividad y próximos entregables.';
                }
            }
            
        });
    });
});
