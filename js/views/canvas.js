/**
 * views/canvas.js — Native Whiteboard / "Excalidraw" Alternative
 * Saves strokes to IndexedDB automatically.
 */

let canvasState = {
    id: 'canvas_global',
    title: 'Borrador Principal',
    strokes: [],
    currentStroke: null,
    isDrawing: false,
    color: '#5e6ad2', // Default accent primary
    width: 2,
    mode: 'draw', // 'draw' | 'erase'
    diagramXml: '' // XML guardado para diagrams.net
};

let ctx;
let canvasEl;

const renderCanvas = (root) => {
    root.innerHTML = `
    <div class="view-inner" style="display:flex; flex-direction:column; height:100%; padding:0;">
      <div class="view-header" style="padding: 16px 24px; border-bottom: 1px solid var(--border-color); flex-shrink:0;">
        <div class="view-header-text" style="display:flex; align-items:center; gap:16px;">
          <div>
            <h1>Canvas Virtual</h1>
            <p class="view-subtitle">Esquemas y diagramas infinitos.</p>
          </div>
          <div style="height:32px; width:1px; background:var(--border-color);"></div>
          <div style="display:flex; flex-direction:column; gap:4px; position:relative;">
            <label style="font-size:0.7rem; color:var(--text-muted); font-weight:600;">Pizarra actual</label>
            <select id="canvas-selector" class="form-input" style="padding:2px 30px 2px 8px; font-size:0.85rem; height:28px; width:180px; background:var(--bg-surface-2); cursor:pointer;">
              <option value="canvas_global">Borrador Principal</option>
            </select>
          </div>
          <button class="btn btn-ghost btn-xs" id="btn-new-canvas" title="Crear nueva pizarra">
            <i data-feather="plus" style="width:14px;"></i> Nuevo
          </button>
          <button class="btn btn-ghost btn-xs" id="btn-rename-canvas" title="Renombrar actual">
             <i data-feather="edit-3" style="width:14px;"></i>
          </button>
        </div>

        <div class="view-actions" style="display:flex; gap:12px; align-items:center;">

           <!-- Toolbar -->
           <div class="btn-group" style="background: var(--bg-surface-2); border-radius: var(--radius-md); padding: 4px; display:flex;">
             <button class="btn btn-ghost btn-sm ${canvasState.mode === 'draw' ? 'active' : ''}" id="btn-draw" style="padding: 4px 8px;" title="Dibujar">
               <i data-feather="edit-2" style="width: 14px; height: 14px;"></i>
             </button>
             <button class="btn btn-ghost btn-sm ${canvasState.mode === 'erase' ? 'active' : ''}" id="btn-erase" style="padding: 4px 8px;" title="Borrar">
               <i data-feather="trash-2" style="width: 14px; height: 14px;"></i>
             </button>
           </div>

           <!-- Color Picker & Actions -->
           <input type="color" id="canvas-color-picker" value="${canvasState.color}" style="border:none; width:32px; height:32px; border-radius:4px; cursor:pointer; background:transparent;">
           <div class="divider" style="width:1px; height:24px; background:var(--border-color);"></div>

           <button class="btn btn-secondary btn-sm" id="btn-diagrams" title="Abrir editor de diagramas (diagrams.net)">
             <i data-feather="git-branch"></i> Diagramas
           </button>
           <button class="btn btn-secondary btn-sm" id="btn-export-png" title="Descargar como PNG">
             <i data-feather="download"></i> Exportar
           </button>
           <button class="btn btn-ghost btn-sm" id="btn-clear-canvas" title="Limpiar Pizarra" style="color:var(--accent-danger);">
             <i data-feather="trash-2"></i> Limpiar
           </button>
        </div>
      </div>

      <!-- Canvas Area -->
      <div style="flex:1; position:relative; overflow:hidden; background: var(--bg-body); cursor: ${canvasState.mode === 'draw' ? 'crosshair' : 'cell'};" id="canvas-container">
        <canvas id="whiteboard" style="display:block; width:100%; height:100%; touch-action:none;"></canvas>
      </div>
    </div>`;

    feather.replace();

    // Initialize Canvas
    canvasEl = root.querySelector('#whiteboard');
    ctx = canvasEl.getContext('2d');

    // Load available canvases
    refreshCanvasList(root);

    // Resize handler
    const resizeCanvas = () => {
        const container = root.querySelector('#canvas-container');
        if (!container) return;

        // Save current canvas content to restore after resize
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = canvasEl.width;
        tempCanvas.height = canvasEl.height;
        const tempCtx = tempCanvas.getContext('2d');
        tempCtx.drawImage(canvasEl, 0, 0);

        canvasEl.width = container.clientWidth;
        canvasEl.height = container.clientHeight;

        redrawCanvas(); // Restores scaled down or raw
    };

    window.addEventListener('resize', resizeCanvas);

    // Initial load
    loadCanvasState(canvasState.id).then(() => {
        resizeCanvas();
    });

    // Event Listeners (Mouse & Touch)
    const isTouch = (e) => e.touches && e.touches.length > 0;

    const getPos = (e) => {
        const rect = canvasEl.getBoundingClientRect();
        const clientX = isTouch(e) ? e.touches[0].clientX : e.clientX;
        const clientY = isTouch(e) ? e.touches[0].clientY : e.clientY;
        return {
            x: clientX - rect.left,
            y: clientY - rect.top
        };
    };

    const startDraw = (e) => {
        e.preventDefault();
        canvasState.isDrawing = true;
        const pos = getPos(e);

        canvasState.currentStroke = {
            color: canvasState.mode === 'erase' ? getComputedStyle(document.body).getPropertyValue('--bg-body').trim() || '#09090b' : canvasState.color,
            width: canvasState.mode === 'erase' ? 20 : canvasState.width,
            points: [pos]
        };

        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.strokeStyle = canvasState.currentStroke.color;
        ctx.lineWidth = canvasState.currentStroke.width;
        ctx.beginPath();
        ctx.moveTo(pos.x, pos.y);
    };

    const draw = (e) => {
        if (!canvasState.isDrawing) return;
        e.preventDefault();

        const pos = getPos(e);
        canvasState.currentStroke.points.push(pos);

        ctx.lineTo(pos.x, pos.y);
        ctx.stroke();
    };

    const endDraw = async () => {
        if (!canvasState.isDrawing) return;
        canvasState.isDrawing = false;
        if (canvasState.currentStroke && canvasState.currentStroke.points.length > 1) {
            canvasState.strokes.push(canvasState.currentStroke);
            await saveCanvasState();
        }
        canvasState.currentStroke = null;
    };

    canvasEl.addEventListener('mousedown', startDraw);
    canvasEl.addEventListener('mousemove', draw);
    canvasEl.addEventListener('mouseup', endDraw);
    canvasEl.addEventListener('mouseout', endDraw);

    canvasEl.addEventListener('touchstart', startDraw, { passive: false });
    canvasEl.addEventListener('touchmove', draw, { passive: false });
    canvasEl.addEventListener('touchend', endDraw);

    // Toolbar Listeners
    root.querySelector('#btn-draw').addEventListener('click', () => setMode('draw', root));
    root.querySelector('#btn-erase').addEventListener('click', () => setMode('erase', root));

    root.querySelector('#canvas-color-picker').addEventListener('input', (e) => {
        canvasState.color = e.target.value;
        setMode('draw', root);
    });

    root.querySelector('#btn-clear-canvas').addEventListener('click', async () => {
        if (confirm('¿Seguro que quieres borrar toda la pizarra? Esta acción no se puede deshacer.')) {
            canvasState.strokes = [];
            ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
            await saveCanvasState();
        }
    });

    // Multi-canvas handlers
    const selector = root.querySelector('#canvas-selector');
    selector.addEventListener('change', async (e) => {
        const id = e.target.value;
        await loadCanvasState(id);
        redrawCanvas();
    });

    root.querySelector('#btn-new-canvas').addEventListener('click', async () => {
        const title = prompt("Asigna un nombre a la nueva pizarra:");
        if (!title) return;
        const id = `canvas_${Date.now()}`;
        canvasState.id = id;
        canvasState.title = title;
        canvasState.strokes = [];
        await saveCanvasState();
        await refreshCanvasList(root);
        selector.value = id;
        redrawCanvas();
        showToast('Pizarra creada', 'success');
    });

    root.querySelector('#btn-rename-canvas').addEventListener('click', async () => {
        const title = prompt("Nuevo nombre para esta pizarra:", canvasState.title);
        if (!title || title === canvasState.title) return;
        canvasState.title = title;
        await saveCanvasState();
        await refreshCanvasList(root);
        selector.value = canvasState.id;
    });

    // PNG Export
    root.querySelector('#btn-export-png').addEventListener('click', () => {
        // Create a temporary canvas to draw with a solid background (instead of transparent)
        const exportCanvas = document.createElement('canvas');
        exportCanvas.width = canvasEl.width;
        exportCanvas.height = canvasEl.height;
        const exportCtx = exportCanvas.getContext('2d');

        // Fill background
        exportCtx.fillStyle = getComputedStyle(document.body).getPropertyValue('--bg-base').trim() || '#fff';
        exportCtx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);

        // Draw original canvas
        exportCtx.drawImage(canvasEl, 0, 0);

        const dataURL = exportCanvas.toDataURL('image/png');
        const a = document.createElement('a');
        a.href = dataURL;
        a.download = `${canvasState.title || 'Canvas'}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    });

    // ── Diagrams.net integration ──────────────────────────────────────────────
    root.querySelector('#btn-diagrams').addEventListener('click', () => {
        openDiagramsEditor(canvasState.id, canvasState.diagramXml);
    });

    // Return cleanup function to Router to prevent memory leaks
    return () => {
        window.removeEventListener('resize', resizeCanvas);
        // Canvas events are on elements that get destroyed, so they GC naturally,
        // but window listeners must be explicitly removed.
    };
};

function redrawCanvas() {
    if (!ctx || !canvasEl) return;
    ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (const stroke of canvasState.strokes) {
        if (stroke.points.length === 0) continue;

        ctx.beginPath();
        ctx.strokeStyle = stroke.color;
        ctx.lineWidth = stroke.width;

        ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
        for (let i = 1; i < stroke.points.length; i++) {
            ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
        }
        ctx.stroke();
    }
}

function setMode(mode, rootEl) {
    canvasState.mode = mode;
    if (rootEl) {
        rootEl.querySelector('#btn-draw').classList.toggle('active', mode === 'draw');
        rootEl.querySelector('#btn-erase').classList.toggle('active', mode === 'erase');
        const container = rootEl.querySelector('#canvas-container');
        if (container) container.style.cursor = mode === 'draw' ? 'crosshair' : 'cell';
    }
}

async function refreshCanvasList(root) {
    if (!root) return;
    const selector = root.querySelector('#canvas-selector');
    if (!selector) return;
    try {
        const data = await window.dbAPI.getAll('documents');
        const canvases = data.filter(d => d.type === 'canvas' || d.id === 'canvas_global');

        // Rebuild selector options
        selector.innerHTML = '';

        // Ensure global exists
        if (!canvases.find(c => c.id === 'canvas_global')) {
            canvases.unshift({ id: 'canvas_global', title: 'Borrador Principal' });
        }

        canvases.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c.id;
            opt.textContent = c.title || 'Canvas Sin Título';
            // Mark selected
            if (c.id === canvasState.id) opt.selected = true;
            selector.appendChild(opt);
        });
    } catch (e) {
        console.error(e);
    }
}

async function loadCanvasState(id = 'canvas_global') {
    try {
        const data = await window.dbAPI.getAll('documents');
        const doc = data.find(d => d.id === id);

        canvasState.id = id;
        if (doc) {
            canvasState.strokes = doc.strokes || [];
            canvasState.title = doc.title || (id === 'canvas_global' ? 'Borrador Principal' : 'Canvas');
            canvasState.diagramXml = doc.diagramXml || '';
        } else {
            canvasState.strokes = [];
            canvasState.title = id === 'canvas_global' ? 'Borrador Principal' : 'Nuevo Canvas';
            canvasState.diagramXml = '';
        }
    } catch (e) {
        console.error('Failed to load canvas', e);
    }
}

async function saveCanvasState() {
    try {
        await window.dbAPI.put('documents', {
            id: canvasState.id,
            type: 'canvas', // Explicitly marking it to differentiate from markdown/rich-text notes
            title: canvasState.title,
            strokes: canvasState.strokes,
            diagramXml: canvasState.diagramXml,
            updatedAt: Date.now()
        });
    } catch (e) {
        console.error('Failed to save canvas', e);
    }
}

/**
 * Abre el editor de diagramas diagrams.net en un overlay de pantalla completa.
 * Usa la API de embebido oficial (proto=json) para cargar/guardar el XML del diagrama.
 * @param {string} canvasId - ID del canvas activo (para guardar correctamente).
 * @param {string} initialXml - XML previo del diagrama (vacío si es nuevo).
 */
function openDiagramsEditor(canvasId, initialXml = '') {
    // Detectar tema actual para pasar a diagrams.net
    const isDark = document.body.classList.contains('theme-dark');
    const uiTheme = isDark ? 'dark' : 'kennedy';

    // Crear overlay de pantalla completa
    const overlay = document.createElement('div');
    overlay.id = 'diagrams-overlay';
    overlay.style.cssText = `
        position: fixed; inset: 0; z-index: 9999;
        background: var(--bg-body);
        display: flex; flex-direction: column;
    `;

    overlay.innerHTML = `
        <div style="display:flex; align-items:center; gap:12px; padding:8px 16px;
                    background:var(--bg-card); border-bottom:1px solid var(--border-color); flex-shrink:0;">
            <i data-feather="git-branch" style="width:16px; color:var(--accent-primary);"></i>
            <span style="font-weight:600; font-size:0.9rem;">Diagrams.net — ${canvasState.title}</span>
            <span style="font-size:0.75rem; color:var(--text-muted); margin-left:4px;">
                El diagrama se guarda automáticamente al cerrar.
            </span>
            <button id="btn-diagrams-close" class="btn btn-ghost btn-sm" style="margin-left:auto;">
                <i data-feather="x"></i> Cerrar y guardar
            </button>
        </div>
        <iframe id="diagrams-iframe"
            src="https://embed.diagrams.net/?embed=1&spin=1&proto=json&ui=${uiTheme}&lang=es&noSaveBtn=0&saveAndExit=1&noExitBtn=0"
            style="flex:1; border:none; width:100%; height:100%;"
            allow="clipboard-read; clipboard-write">
        </iframe>
    `;

    document.body.appendChild(overlay);
    if (window.feather) feather.replace();

    const iframe = overlay.querySelector('#diagrams-iframe');
    let diagramLoaded = false;

    // Handler para mensajes del iframe de diagrams.net
    const onDiagramMessage = async (e) => {
        if (e.source !== iframe.contentWindow) return;

        let msg;
        try { msg = JSON.parse(e.data); } catch { return; }

        if (msg.event === 'init') {
            // Enviar XML existente (o plantilla vacía) cuando el editor esté listo
            iframe.contentWindow.postMessage(JSON.stringify({
                action: 'load',
                autosave: 1,
                xml: initialXml || '<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/></root></mxGraphModel>'
            }), '*');
            diagramLoaded = true;
        } else if (msg.event === 'autosave' || msg.event === 'save') {
            // Guardar XML en estado y persistir
            canvasState.diagramXml = msg.xml;
            canvasState.id = canvasId;
            await saveCanvasState();
            if (msg.event === 'save') {
                showToast('Diagrama guardado.', 'success');
            }
        } else if (msg.event === 'exit') {
            // El usuario cerró el editor con el botón interno
            closeDiagramsOverlay();
        }
    };

    const closeDiagramsOverlay = async () => {
        window.removeEventListener('message', onDiagramMessage);
        overlay.remove();
    };

    window.addEventListener('message', onDiagramMessage);

    overlay.querySelector('#btn-diagrams-close').addEventListener('click', async () => {
        // Solicitar el XML actual antes de cerrar
        if (diagramLoaded) {
            iframe.contentWindow.postMessage(JSON.stringify({ action: 'export', format: 'xml' }), '*');
            // Pequeña espera para recibir el export antes de cerrar
            await new Promise(r => setTimeout(r, 300));
        }
        closeDiagramsOverlay();
        showToast('Diagrama guardado.', 'success');
    });
}

window.renderCanvas = renderCanvas;
