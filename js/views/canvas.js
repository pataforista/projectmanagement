/**
 * views/canvas.js — Native Whiteboard / "Excalidraw" Alternative
 * Saves strokes to IndexedDB automatically.
 */

let canvasState = {
    strokes: [],
    currentStroke: null,
    isDrawing: false,
    color: '#5e6ad2', // Default accent primary
    width: 2,
    mode: 'draw' // 'draw' | 'erase'
};

let ctx;
let canvasEl;

function renderCanvas(root) {
    root.innerHTML = `
    <div class="view-inner" style="display:flex; flex-direction:column; height:100%; padding:0;">
      <div class="view-header" style="padding: 16px 24px; border-bottom: 1px solid var(--border-color); flex-shrink:0;">
        <div class="view-header-text">
          <h1>Canvas Virtual</h1>
          <p class="view-subtitle">Diagramas rápidos y esquemas conceptuales.</p>
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
           
           <!-- Color Picker -->
           <input type="color" id="canvas-color-picker" value="${canvasState.color}" style="border:none; width:32px; height:32px; border-radius:4px; cursor:pointer; background:transparent;">
           
           <div class="divider" style="width:1px; height:24px; background:var(--border-color);"></div>
           
           <button class="btn btn-secondary btn-sm" id="btn-clear-canvas" title="Limpiar Pizarra">
             <i data-feather="x-circle"></i> Limpiar
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
    canvasEl = document.getElementById('whiteboard');
    ctx = canvasEl.getContext('2d');

    // Resize handler
    const resizeCanvas = () => {
        const container = document.getElementById('canvas-container');
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

    // Load from DB
    loadCanvasState().then(() => {
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
            color: canvasState.mode === 'erase' ? getComputedStyle(document.body).getPropertyValue('--bg-body').trim() : canvasState.color,
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
        if (canvasState.currentStroke && canvasState.currentStroke.points.length > 0) {
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
    document.getElementById('btn-draw').addEventListener('click', () => setMode('draw'));
    document.getElementById('btn-erase').addEventListener('click', () => setMode('erase'));

    document.getElementById('canvas-color-picker').addEventListener('input', (e) => {
        canvasState.color = e.target.value;
        setMode('draw');
    });

    document.getElementById('btn-clear-canvas').addEventListener('click', async () => {
        if (confirm('¿Seguro que quieres borrar toda la pizarra?')) {
            canvasState.strokes = [];
            ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
            await saveCanvasState();
        }
    });

    // Clean up memory on view change
    return () => {
        window.removeEventListener('resize', resizeCanvas);
    };
}

function setMode(mode) {
    canvasState.mode = mode;
    document.getElementById('btn-draw').classList.toggle('active', mode === 'draw');
    document.getElementById('btn-erase').classList.toggle('active', mode === 'erase');

    const container = document.getElementById('canvas-container');
    if (container) {
        container.style.cursor = mode === 'draw' ? 'crosshair' : 'cell';
    }
}

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

async function loadCanvasState() {
    try {
        const data = await dbAPI.getAll('documents'); // Using documents store for simplicity, id = 'canvas_global'
        const globalCanvas = data.find(d => d.id === 'canvas_global');
        if (globalCanvas && globalCanvas.strokes) {
            canvasState.strokes = globalCanvas.strokes;
        } else {
            canvasState.strokes = [];
        }
    } catch (e) {
        console.error('Failed to load canvas', e);
    }
}

async function saveCanvasState() {
    try {
        await dbAPI.put('documents', {
            id: 'canvas_global',
            strokes: canvasState.strokes,
            updatedAt: Date.now()
        });
    } catch (e) {
        console.error('Failed to save canvas', e);
    }
}

window.renderCanvas = renderCanvas;
