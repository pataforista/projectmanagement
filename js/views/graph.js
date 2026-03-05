/**
 * js/views/graph.js
 * Force-Graph visualization for Knowledge Management
 */
import { store } from '../store.js';
import { esc } from '../utils.js';

export const renderGraph = (root) => {
    root.innerHTML = `
        <div class="view-container" style="padding:0; overflow:hidden; display:flex; flex-direction:column; height:100vh;">
            <header class="view-header" style="padding:15px 20px;">
                <div class="view-title">
                    <h1>Grafo de Conocimiento</h1>
                    <p>Visualiza las conexiones entre tus ideas, proyectos y referencias.</p>
                </div>
                <div class="header-actions">
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

    projects.forEach(p => {
        data.nodes.push({ id: p.id, name: p.name, type: 'project', color: p.color || 'var(--accent-primary)' });
    });

    documents.forEach(d => {
        data.nodes.push({ id: d.id, name: d.title, type: 'doc', color: 'var(--accent-teal)' });
        if (d.projectId) {
            data.links.push({ source: d.projectId, target: d.id });
        }

        // Detect linkages [[Doc Title]]
        documents.forEach(other => {
            if (other.id !== d.id && d.content && d.content.includes(`[[${other.title}]]`)) {
                data.links.push({ source: d.id, target: other.id, type: 'crosslink' });
            }
        });
    });

    const container = root.querySelector('#graph-canvas-wrap');
    if (typeof ForceGraph === 'undefined') {
        container.innerHTML = '<div style="color:var(--accent-danger); padding:20px;">Error: No se pudo cargar Force-Graph JS desde CDN. Verifica tu conexión a internet o los scripts en index.html.</div>';
        return;
    }

    // Remove loading overlay
    const overlay = root.querySelector('#graph-container > div:first-child');
    if (overlay) overlay.style.display = 'none';

    // Get current theme background
    const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg-surface').trim() || '#0f0f12';

    // Render Graph
    const Graph = ForceGraph()(container)
        .graphData(data)
        .backgroundColor('transparent')
        .nodeId('id')
        .nodeVal(node => node.type === 'project' ? 25 : 10)
        .nodeLabel('name')
        .nodeColor('color')
        .linkColor(link => link.type === 'crosslink' ? 'var(--accent-teal)' : 'var(--border-focus)')
        .linkWidth(link => link.type === 'crosslink' ? 2 : 1)
        .linkDirectionalParticles(link => link.type === 'crosslink' ? 2 : 0)
        .linkDirectionalParticleSpeed(d => 0.005)
        .onNodeClick(node => {
            // Navigate based on type
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
            // Draw Node Circle
            const size = node.type === 'project' ? 8 : 4;
            ctx.beginPath();
            ctx.arc(node.x, node.y, size, 0, 2 * Math.PI, false);
            ctx.fillStyle = node.color;
            ctx.fill();

            // Draw Label
            const label = node.name;
            const fontSize = 12 / globalScale;
            ctx.font = `${fontSize}px var(--font-family)`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = 'var(--text-primary)';
            ctx.fillText(label, node.x, node.y + size + fontSize);
        });

    // Resize observer to make canvas responsive
    const resizeObserver = new ResizeObserver(() => {
        Graph.width(container.clientWidth);
        Graph.height(container.clientHeight);
    });
    resizeObserver.observe(container);

    feather.replace();
};

window.renderGraph = renderGraph;
