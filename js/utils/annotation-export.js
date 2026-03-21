/**
 * utils/annotation-export.js
 * Qualitative analysis helper — Exports annotations to CSV.
 */

export const annotationExport = (() => {
    /**
     * Generates and downloads a CSV file with all annotations of a project.
     * @param {string} projectId
     */
    function exportToCSV(projectId) {
        const project = store.get.projectById(projectId);
        const annotations = store.get.annotationsByProject(projectId);

        if (!annotations || annotations.length === 0) {
            if (window.showToast) showToast('No hay anotaciones para exportar en este proyecto.', 'warning');
            return;
        }

        // CSV Headers
        const headers = ['ID', 'Documento', 'Texto Original', 'Comentario', 'Etiquetas', 'Autor', 'Fecha'];

        // CSV Rows
        const rows = annotations.map(a => {
            const doc = store.get.documentById(a.documentId);
            const date = new Date(a.createdAt).toLocaleString();
            const tags = Array.isArray(a.tags) ? a.tags.join('; ') : '';

            return [
                a.id,
                doc ? doc.title : 'Documento desconocido',
                `"${(a.text || '').replace(/"/g, '""')}"`,
                `"${(a.comment || '').replace(/"/g, '""')}"`,
                `"${tags.replace(/"/g, '""')}"`,
                a.author || 'Anónimo',
                date
            ];
        });

        // Combine into CSV string
        const csvContent = [
            headers.join(','),
            ...rows.map(r => r.join(','))
        ].join('\n');

        // Create download
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        const fileName = `anotaciones-${project ? project.name.toLowerCase().replace(/\s+/g, '-') : 'proyecto'}-${new Date().toISOString().slice(0, 10)}.csv`;

        link.setAttribute('href', url);
        link.setAttribute('download', fileName);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        if (window.showToast) showToast(`Exportadas ${annotations.length} anotaciones a CSV.`, 'success');
    }

    return { exportToCSV };
})();

window.annotationExport = annotationExport;
