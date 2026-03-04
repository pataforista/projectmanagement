function parseNotionCsvStandalone(text) {
    const rows = text.split(/\r?\n/).filter(Boolean);
    if (rows.length < 2) return [];
    const headers = rows[0].split(',').map(h => h.trim().toLowerCase());
    return rows.slice(1).map((line, idx) => {
        const cols = line.split(',');
        const titleIdx = headers.findIndex(h => h.includes('name') || h.includes('tarea') || h.includes('title'));
        const statusIdx = headers.findIndex(h => h.includes('status') || h.includes('estado'));
        const dueIdx = headers.findIndex(h => h.includes('due') || h.includes('fecha'));
        return {
            id: 'nt-' + Date.now() + '-' + idx,
            title: (cols[titleIdx] || 'Notion Task ' + (idx + 1)).trim(),
            status: (cols[statusIdx] || 'Capturado').trim(),
            dueDate: (cols[dueIdx] || '').trim(),
            priority: 'media',
            type: 'task',
            createdAt: Date.now(),
            tags: ['notion-import'],
            subtasks: [],
        };
    });
}

function parseObsidianMarkdownStandalone(text) {
    const lines = text.split(/\r?\n/);
    return lines
        .filter(line => /^- \[( |x)\]/i.test(line.trim()))
        .map((line, idx) => {
            const done = /- \[x\]/i.test(line.trim());
            const title = line.replace(/^- \[( |x)\]\s*/i, '').trim();
            return {
                id: 'ob-' + Date.now() + '-' + idx,
                title: title || 'Nota ' + (idx + 1),
                status: done ? 'Terminado' : 'Capturado',
                priority: 'media',
                type: 'task',
                createdAt: Date.now(),
                tags: ['obsidian-import'],
                subtasks: [],
            };
        });
}

const csv = "Name,Status,Due Date\nRead papers,Terminado,2026-03-10\nWrite protocol,En elaboración,2026-03-15";
const md = "# Project Notes\n- [ ] Buy materials\n- [x] Send emails";

console.log("Notion Output:");
console.log(JSON.stringify(parseNotionCsvStandalone(csv), null, 2));

console.log("Obsidian Output:");
console.log(JSON.stringify(parseObsidianMarkdownStandalone(md), null, 2));
