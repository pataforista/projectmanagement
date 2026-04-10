/**
 * js/views/graph.js
 * Force-Graph visualization for Knowledge Management
 */
import { store } from '../store.js';
import { esc, isMobileRuntime, renderCompatibilityNotice } from '../utils.js';

// Lazy-load vault export utility
async function loadVaultExport() {
    if (!window.exportVault) {
        await import('../utils/vault-export.js');
    }
    return window.exportVault;
}

export const renderGraph = (root) => {
    if (isMobileRuntime()) {
        root.innerHTML = `
            <div class="view-inner">
                <div class="view-header">
                    <div class="view-header-text">
                        <h1>Grafo de Conocimiento</h1>
                        <p class="view-subtitle">Escanea la red de la madriguera y visualiza tus enlaces.</p>
                    </div>
                </div>
                ${renderCompatibilityNotice({
                    icon: 'monitor',
                    title: 'Esta función solo está disponible en escritorio',
                    description: 'El renderizado de grafos interactivos requiere más GPU/CPU y una pantalla amplia. En móvil, usa Biblioteca y Escritura para navegar por metadatos y enlaces.'
                })}
            </div>
        `;
        if (window.feather) feather.replace();
        return;
    }

    root.innerHTML = `
        <div class="view-container" style="padding:0; overflow:hidden; display:flex; flex-direction:column; height:100%;">
            <header class="view-header" style="padding:15px 20px;">
                <div class="view-title">
                    <h1>Malla de Inteligencia</h1>
                    <p>Visualiza y vincula los nodos de la madriguera.</p>
                </div>
                <div class="header-actions" style="display:flex; gap:8px;">
                    <button class="btn btn-primary btn-sm" id="btn-toggle-link" title="Vincular proyectos manualmente">
                        <i data-feather="link"></i> <span id="text-toggle-link">Modo Vincular</span>
                    </button>
                    <div style="width:1px; background:var(--border-color); margin:0 4px;"></div>
                    <button class="btn btn-secondary btn-sm" id="btn-export-graphml" title="Exportar grafo como GraphML (Gephi / Cytoscape)">
                        <i data-feather="share-2"></i> GraphML
                    </button>
                    <button class="btn btn-secondary btn-sm" id="btn-export-vault" title="Exportar todos los documentos como vault Markdown (Zettlr / Logseq)">
                        <i data-feather="archive"></i> Vault ZIP
                    </button>
                    <button class="btn btn-secondary btn-sm" onclick="router.navigate('/writing')">Volver a Escritura</button>
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

        <!-- Phase 7 Legend Overlay -->
        <div class="glass-panel" style="position:absolute; bottom:20px; left:20px; padding:12px; border-radius:16px; z-index:10; font-size:0.75rem;">
            <div style="font-weight:700; margin-bottom:8px; text-transform:uppercase; letter-spacing:0.05em; opacity:0.6;">Leyenda del Grafo</div>
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px;">
                <div style="display:flex; align-items:center; gap:8px;"><span style="width:8px;height:8px;border-radius:50%;background:#4f46e5;"></span> Proyectos</div>
                <div style="display:flex; align-items:center; gap:8px;"><span style="width:8px;height:8px;border-radius:50%;background:#a78bfa;"></span> Equipo</div>
                <div style="display:flex; align-items:center; gap:8px;"><span style="width:8px;height:8px;border-radius:50%;background:#f59e0b;"></span> Wiki / Libros</div>
                <div style="display:flex; align-items:center; gap:8px;"><span style="width:8px;height:8px;border-radius:50%;background:#14b8a6;"></span> Documentos</div>
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
        // Custom semantic links
        if (p.related && Array.isArray(p.related)) {
            p.related.forEach(targetId => {
                data.links.push({ source: p.id, target: targetId, type: 'custom_link' });
            });
        }
    });

    // 2. Add Documents (including Wiki Pages)
    documents.forEach(d => {
        const isWiki = d.wikiType && d.wikiType.startsWith('wiki-');
        const nodeColor = isWiki
            ? (d.wikiType === 'wiki-book' ? '#ef4444' : d.wikiType === 'wiki-chapter' ? '#f59e0b' : '#38bdf8')
            : '#14b8a6';

        data.nodes.push({
            id: d.id,
            name: d.title || 'Sin título',
            type: isWiki ? d.wikiType : 'doc',
            val: isWiki ? (d.wikiType === 'wiki-book' ? 20 : 12) : 10,
            color: nodeColor
        });

        // Project/Wiki hierarchy links
        if (d.projectId) {
            data.links.push({ source: d.projectId, target: d.id, type: 'containment' });
        } else if (d.parentId) {
            data.links.push({ source: d.parentId, target: d.id, type: 'hierarchy' });
        }

        // Networked connections: Wiki-links & Tags
        if (d.content) {
            const contentLow = d.content.toLowerCase();

            // Wiki-links [[Doc Title]]
            documents.forEach(other => {
                if (other.id !== d.id && contentLow.includes(`[[${(other.title || '').toLowerCase()}]]`)) {
                    data.links.push({ source: d.id, target: other.id, type: 'crosslink' });
                }
            });

            // Tag detection #tag
            const tagRegex = /(?:^|\s)#([a-zA-Z0-9_\-]+)/g;
            let match;
            while ((match = tagRegex.exec(d.content)) !== null) {
                const tagName = match[1];
                const tagId = `tag-${tagName}`;
                if (!data.nodes.find(n => n.id === tagId)) {
                    data.nodes.push({
                        id: tagId,
                        name: `#${tagName}`,
                        type: 'tag',
                        val: 8,
                        color: '#2dd4bf'
                    });
                }
                data.links.push({ source: d.id, target: tagId, type: 'tag_link' });
            }
        }
    });

    // 3. Add Members
    const members = store.get.members();
    members.forEach(m => {
        data.nodes.push({
            id: `member-${m.id}`,
            name: m.name,
            type: 'member',
            val: 18,
            color: '#a78bfa', // Purple for personnel
            avatar: m.avatar || '?'
        });

        // Link member to tasks they are assigned to
        const assignedTasks = store.get.allTasks().filter(t => t.assigneeId === m.id);
        assignedTasks.forEach(t => {
            if (data.nodes.find(n => n.id === t.id)) {
                data.links.push({ source: `member-${m.id}`, target: t.id, type: 'assignment' });
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

    // Link Mode State
    let linkModeActive = false;
    let linkSourceNode = null;

    root.querySelector('#btn-toggle-link').addEventListener('click', (e) => {
        linkModeActive = !linkModeActive;
        const btn = e.currentTarget;
        if (linkModeActive) {
            btn.classList.replace('btn-primary', 'btn-danger'); // Use red/danger to denote active status safely
            root.querySelector('#text-toggle-link').textContent = 'Cancelar Vinculación';
            if (window.showToast) showToast('Modo Vincular Activado. Haz clic en el proyecto de origen.', 'info');
        } else {
            btn.classList.replace('btn-danger', 'btn-primary');
            root.querySelector('#text-toggle-link').textContent = 'Modo Vincular';
            if (linkSourceNode) {
                linkSourceNode.color = linkSourceNode._originalColor;
                linkSourceNode = null;
                Graph.nodeColor('color'); // trigger re-render
            }
        }
    });

    // Render Graph
    const Graph = ForceGraph()(container)
        .graphData(data)
        .backgroundColor('transparent')
        .nodeId('id')
        .nodeVal('val')
        .nodeLabel('name')
        .nodeColor('color')
        .linkColor(link => {
            if (link.type === 'hierarchy' || link.type === 'containment') return 'rgba(99, 102, 241, 0.4)';
            if (link.type === 'crosslink') return 'rgba(20, 184, 166, 0.7)';
            if (link.type === 'custom_link') return 'rgba(245, 158, 11, 0.7)';
            if (link.type === 'assignment') return 'rgba(167, 139, 250, 0.4)';
            if (link.type === 'tag_link') return 'rgba(45, 212, 191, 0.4)';
            return 'rgba(255,255,255,0.1)';
        })
        .linkWidth(link => link.type === 'hierarchy' ? 3 : link.type === 'custom_link' ? 2 : 1)
        .linkDirectionalArrowLength(link => link.type === 'hierarchy' ? 4 : 0)
        .linkDirectionalParticles(link => (link.type === 'crosslink' || link.type === 'custom_link') ? 3 : 0)
        .linkDirectionalParticleSpeed(0.005)
        .onNodeClick(node => {
            if (linkModeActive) {
                if (node.type !== 'project') {
                    if (window.showToast) showToast('Solo puedes vincular proyectos en esta versión.', 'warning');
                    return;
                }

                if (!linkSourceNode) {
                    // Start link
                    linkSourceNode = node;
                    linkSourceNode._originalColor = node.color;
                    node.color = '#f59e0b'; // Amber for selected
                    Graph.nodeColor('color'); // Re-evaluate colors
                    if (window.showToast) showToast(`Origen: ${node.name}. Ahora selecciona el destino.`, 'info');
                } else {
                    // Complete link
                    if (node.id === linkSourceNode.id) {
                        linkSourceNode.color = linkSourceNode._originalColor;
                        linkSourceNode = null;
                        Graph.nodeColor('color');
                        if (window.showToast) showToast('Vinculación cancelada.', 'info');
                        return;
                    }

                    const targetNode = node;
                    const sourceProj = store.get.projects().find(p => p.id === linkSourceNode.id);
                    if (sourceProj) {
                        const related = sourceProj.related || [];
                        if (!related.includes(targetNode.id)) {
                            related.push(targetNode.id);

                            // Update store (this will persist it)
                            store.dispatch('UPDATE_PROJECT', { id: sourceProj.id, related });

                            // Visually update the graph immediately
                            const { nodes, links } = Graph.graphData();
                            links.push({ source: sourceProj.id, target: targetNode.id, type: 'custom_link' });
                            Graph.graphData({ nodes, links });

                            if (window.showToast) showToast(`Vínculo creado: ${sourceProj.name} ➔ ${targetNode.name}`, 'success');
                        } else {
                            if (window.showToast) showToast('Estos proyectos ya están vinculados.', 'warning');
                        }
                    }

                    // Reset
                    linkSourceNode.color = linkSourceNode._originalColor;
                    linkSourceNode = null;
                    Graph.nodeColor('color');

                    // Automatically turn off link mode for convenience
                    const toggleBtn = root.querySelector('#btn-toggle-link');
                    linkModeActive = false;
                    toggleBtn.classList.replace('btn-danger', 'btn-primary');
                    root.querySelector('#text-toggle-link').textContent = 'Modo Vincular';
                }
                return;
            }

            // Normal node click logic
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

            // Member Node Special Rendering (Avatar Circular)
            if (node.type === 'member') {
                ctx.beginPath();
                ctx.arc(node.x, node.y, 6 / globalScale, 0, 2 * Math.PI, false);
                ctx.fillStyle = '#1e1b4b'; // Deep background for avatar text
                ctx.fill();
                ctx.fillStyle = '#ffffff';
                ctx.font = `bold ${8 / globalScale}px Inter`;
                ctx.textAlign = 'center';
                ctx.fillText(node.avatar, node.x, node.y);
            } else {
                // Node Circle
                ctx.beginPath();
                ctx.arc(node.x, node.y, node.type === 'project' ? 8 / globalScale : 4 / globalScale, 0, 2 * Math.PI, false);
                ctx.fillStyle = node.color;
                ctx.fill();
            }

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
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
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
