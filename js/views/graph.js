/**
 * js/views/graph.js
 * Force-Graph visualization for Knowledge Management
 */
import { store } from '../store.js';
import { esc } from '../utils.js';

// Lazy-load vault export utility
async function loadVaultExport() {
    if (!window.exportVault) {
        await import('../utils/vault-export.js');
    }
    return window.exportVault;
}

export const renderGraph = (root) => {
    root.innerHTML = `
        <div class="view-container" style="padding:0; overflow:hidden; display:flex; flex-direction:column; height:100vh;">
            <header class="view-header" style="padding:15px 20px;">
                <div class="view-title">
                    <h1>Grafo de Conocimiento</h1>
                    <p>Visualiza las conexiones entre tus ideas, proyectos y referencias.</p>
                </div>
                <div class="header-actions" style="display:flex; gap:8px;">
                    <button class="btn btn-secondary btn-sm" id="btn-export-graphml" title="Exportar grafo como GraphML (Gephi / Cytoscape)">
                        <i data-feather="share-2"></i> GraphML
                    </button>
                    <button class="btn btn-secondary btn-sm" id="btn-export-vault" title="Exportar todos los documentos como vault Markdown (Zettlr / Logseq)">
                        <i data-feather="archive"></i> Vault ZIP
                    </button>
                    <button class="btn btn-secondary btn-sm" onclick="app.navigate('writing')">Volver a Escritura</button>
                </div>
            </header>
            <div id="graph-container" style="flex:1; background:var(--bg-surface); position:relative;">
                <div style="position:absolute; inset:0; display:flex; align-items:center; justify-content:center; color:var(--text-muted); z-index:1;">
                    <div style="text-align:center;">
                        <i data-feather="share-2" style="width:48px; height:48px; opacity:0.2; margin-bottom:16px;"></i>
                        <p>Cargando Motor de Grafo...</p>
                        <p style="font-size:0.75rem;">(Requiere Force-Graph JS)</p>
                    </div>
                </div>
                <div id="graph-canvas-wrap" style="width:100%; height:100%; position:relative; z-index:2;"></div>
            </div>
        </div>
    `;

    // Logic to build data for the graph
    const data = { nodes: [], links: [] };
    const projects = store.get.projects();
    const documents = store.get.documents();

    // 1. Add Projects
    projects.forEach(p => {
        data.nodes.push({
            id: p.id,
            name: p.name,
            type: 'project',
            val: 25,
            color: p.color || '#4f46e5'
        });
        // Hierarchy links: Project -> Project
        if (p.parentId) {
            data.links.push({ source: p.parentId, target: p.id, type: 'hierarchy' });
        }
    });

    // 2. Add Documents
    documents.forEach(d => {
        data.nodes.push({
            id: d.id,
            name: d.title,
            type: 'doc',
            val: 12,
            color: '#14b8a6'
        });
        // Project containment links: Project -> Document
        if (d.projectId) {
            data.links.push({ source: d.projectId, target: d.id, type: 'containment' });
        }

        // Cross-references [[Doc Title]]
        documents.forEach(other => {
            if (other.id !== d.id && d.content && d.content.includes(`[[${other.title}]]`)) {
                data.links.push({ source: d.id, target: other.id, type: 'crosslink' });
            }
        });
    });

    const container = root.querySelector('#graph-canvas-wrap');
    if (typeof ForceGraph === 'undefined') {
        container.innerHTML = '<div style="color:var(--accent-danger); padding:20px;">Error: No se pudo cargar Force-Graph JS desde CDN.</div>';
        return;
    }

    // Remove loading overlay
    const overlay = root.querySelector('#graph-container > div:first-child');
    if (overlay) overlay.style.display = 'none';

    // Render Graph
    const Graph = ForceGraph()(container)
        .graphData(data)
        .backgroundColor('transparent')
        .nodeId('id')
        .nodeVal('val')
        .nodeLabel('name')
        .nodeColor('color')
        .linkColor(link => {
            if (link.type === 'hierarchy') return '#6366f1';
            if (link.type === 'crosslink') return '#14b8a6';
            return 'rgba(255,255,255,0.1)';
        })
        .linkWidth(link => link.type === 'hierarchy' ? 3 : 1)
        .linkDirectionalArrowLength(link => link.type === 'hierarchy' ? 4 : 0)
        .linkDirectionalParticles(link => link.type === 'crosslink' ? 3 : 0)
        .linkDirectionalParticleSpeed(0.005)
        .onNodeClick(node => {
            if (node.type === 'doc') {
                const doc = documents.find(d => d.id === node.id);
                if (doc && doc.projectId) {
                    localStorage.setItem('active_writing_project', doc.projectId);
                    location.hash = '#/writing';
                }
            } else if (node.type === 'project') {
                location.hash = `#/board?project=${node.id}`;
            }
        })
        .nodeCanvasObject((node, ctx, globalScale) => {
            const label = node.name;
            const fontSize = node.type === 'project' ? 14 / globalScale : 10 / globalScale;
            ctx.font = `${fontSize}px Inter, sans-serif`;
            const textWidth = ctx.measureText(label).width;
            const bckgDimensions = [textWidth, fontSize].map(n => n + fontSize * 0.2);

            // Glow effect
            ctx.shadowBlur = 15 / globalScale;
            ctx.shadowColor = node.color;

            // Node Circle
            ctx.beginPath();
            ctx.arc(node.x, node.y, node.type === 'project' ? 6 : 3, 0, 2 * Math.PI, false);
            ctx.fillStyle = node.color;
            ctx.fill();

            // Reset shadow for text
            ctx.shadowBlur = 0;

            // Label
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            // Dynamic color based on theme
            const theme = document.documentElement.getAttribute('data-theme') || 'dark';
            const isLight = (theme === 'zen' || theme === 'light');

            ctx.fillStyle = isLight
                ? (node.type === 'project' ? '#1a1a1a' : 'rgba(26,26,26,0.8)')
                : (node.type === 'project' ? '#ffffff' : 'rgba(255,255,255,0.7)');

            ctx.fillText(label, node.x, node.y + (node.type === 'project' ? 12 : 8));
        });

    // Resize observer to make canvas responsive
    const resizeObserver = new ResizeObserver(() => {
        Graph.width(container.clientWidth);
        Graph.height(container.clientHeight);
    });
    resizeObserver.observe(container);

    // ── GraphML Export ────────────────────────────────────────────────────
    root.querySelector('#btn-export-graphml')?.addEventListener('click', () => {
        const xmlLines = [
            '<?xml version="1.0" encoding="UTF-8"?>',
            '<graphml xmlns="http://graphml.graphdrawing.org/graphml"',
            '         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"',
            '         xsi:schemaLocation="http://graphml.graphdrawing.org/graphml http://graphml.graphdrawing.org/graphml/graphml.xsd">',
            '  <key id="label" for="node" attr.name="label" attr.type="string"/>',
            '  <key id="type"  for="node" attr.name="type"  attr.type="string"/>',
            '  <key id="color" for="node" attr.name="color" attr.type="string"/>',
            '  <key id="etype" for="edge" attr.name="type"  attr.type="string"/>',
            '  <graph id="workspace" edgedefault="directed">',
        ];

        data.nodes.forEach(n => {
            xmlLines.push(`    <node id="${esc(n.id)}">`);
            xmlLines.push(`      <data key="label">${esc(n.name)}</data>`);
            xmlLines.push(`      <data key="type">${esc(n.type)}</data>`);
            xmlLines.push(`      <data key="color">${esc(n.color || '#888')}</data>`);
            xmlLines.push(`    </node>`);
        });

        data.links.forEach((l, i) => {
            const src = typeof l.source === 'object' ? l.source.id : l.source;
            const tgt = typeof l.target === 'object' ? l.target.id : l.target;
            xmlLines.push(`    <edge id="e${i}" source="${esc(src)}" target="${esc(tgt)}">`);
            xmlLines.push(`      <data key="etype">${esc(l.type || 'link')}</data>`);
            xmlLines.push(`    </edge>`);
        });

        xmlLines.push('  </graph>', '</graphml>');

        const blob = new Blob([xmlLines.join('\n')], { type: 'application/xml' });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href     = url;
        a.download = `workspace-graph-${new Date().toISOString().slice(0, 10)}.graphml`;
        a.click();
        URL.revokeObjectURL(url);
        if (window.showToast) showToast(`Grafo exportado: ${data.nodes.length} nodos, ${data.links.length} enlaces.`, 'success');
    });

    // ── Vault Export ──────────────────────────────────────────────────────
    root.querySelector('#btn-export-vault')?.addEventListener('click', async () => {
        try {
            const fn = await loadVaultExport();
            await fn(store);
        } catch (err) {
            console.error(err);
            if (window.showToast) showToast('Error al exportar el vault: ' + err.message, 'error');
        }
    });

    feather.replace();
};

window.renderGraph = renderGraph;
