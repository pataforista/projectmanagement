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
    },
    quarto_article: {
        title: "Artículo Científico (Quarto)",
        content: `---
title: "Título del Artículo"
author: "Nombre del Autor"
date: last-modified
format:
  pdf:
    toc: true
    number-sections: true
    colorlinks: true
  html:
    toc: true
    theme: cosmo
bibliography: references.bib
---

# Resumen

# Introducción

# Metodología

# Resultados

# Discusión

# Referencias
`
    },
    quarto_report: {
        title: "Informe Reproducible (R + Quarto)",
        content: `---
title: "Informe de Análisis de Datos"
author: "Investigador"
format: html
execute:
  echo: false
  warning: false
---

# Introducción

Este informe es reproducible y utiliza datos del proyecto.

\`\`\`{r}
#| label: setup
#| include: false
library(ggplot2)
\`\`\`

# Análisis de Datos

\`\`\`{r}
#| label: plot-example
#| fig-cap: "Ejemplo de visualización"
ggplot(mtcars, aes(x=wt, y=mpg)) + geom_point() + geom_smooth(method="lm")
\`\`\`

# Conclusiones
`
    },
    clinical_report_advanced: {
        title: "Reporte Clínico Avanzado",
        content: `---
title: "Reporte Clínico Estructurado"
author: "Médico Especialista"
format: pdf
---

# 1. Identificación del Paciente
- **Nombre/ID:**
- **Edad:**
- **Fecha:** \`r Sys.Date()\`

# 2. Motivo de Consulta y Enfermedad Actual
[Describir...]

# 3. Antecedentes y Revisión por Sistemas
- **Médicos:**
- **Quirúrgicos:**

# 4. Evaluación y Hallazgos
[Examen físico / Resultados críticos]

# 5. Análisis Probabilístico
- **Hipótesis A:** [X%]
- **Hipótesis B:** [Y%]

# 6. Plan y Recomendaciones
1.
2.
`
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
