export const ACADEMIC_TEMPLATES = {
    research_paper: {
        title: "Nuevo Artículo de Investigación",
        content: `# Resumen\n\n# Introducción\n\n# Metodología\n\n# Resultados\n\n# Discusión\n\n# Conclusión\n\n# Bibliografía`
    },
    thesis_chapter: {
        title: "Nuevo Capítulo de Tesis",
        content: `# Objetivo del Capítulo\n\n# Marco Teórico Relacionado\n\n# Desarrollo\n\n# Síntesis Parcial`
    },
    medical_case: {
        title: "Reporte de Caso Clínico",
        content: `# Resumen del Caso\n\n# Antecedentes\n\n# Examen Físico\n\n# Diagnóstico Diferencial\n\n# Plan de Tratamiento\n\n# Seguimiento`
    }
};

export function applyTemplate(templateId, projectId) {
    const template = ACADEMIC_TEMPLATES[templateId];
    if (!template) return null;
    return {
        projectId,
        title: template.title,
        content: template.content,
        updatedAt: Date.now()
    };
}
