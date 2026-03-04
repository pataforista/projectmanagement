/**
 * pomodoro.js — Floating Pomodoro timer widget
 * 25 min work / 5 min short break / 15 min long break
 * Uses Web Audio API for sound notifications
 */

const pomodoroManager = (() => {
    const MODES = {
        work:       { label: 'Trabajo',      minutes: 25, color: 'var(--accent-primary)' },
        shortBreak: { label: 'Pausa corta',  minutes: 5,  color: 'var(--accent-teal)'    },
        longBreak:  { label: 'Pausa larga',  minutes: 15, color: 'var(--accent-warning)'  },
    };

    let _mode       = 'work';
    let _seconds    = MODES.work.minutes * 60;
    let _running    = false;
    let _interval   = null;
    let _rounds     = 0;
    let _taskLabel  = '';
    let _visible    = false;
    let _audioCtx   = null;

    // ── Sound ─────────────────────────────────────────────────────────────────
    function _beep(freq = 880, duration = 0.15, times = 3) {
        try {
            if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            let t = _audioCtx.currentTime;
            for (let i = 0; i < times; i++) {
                const osc = _audioCtx.createOscillator();
                const gain = _audioCtx.createGain();
                osc.connect(gain);
                gain.connect(_audioCtx.destination);
                osc.frequency.value = freq;
                osc.type = 'sine';
                gain.gain.setValueAtTime(0.4, t + i * (duration + 0.05));
                gain.gain.exponentialRampToValueAtTime(0.001, t + i * (duration + 0.05) + duration);
                osc.start(t + i * (duration + 0.05));
                osc.stop(t + i * (duration + 0.05) + duration);
            }
        } catch (e) { /* audio not available */ }
    }

    // ── Timer logic ───────────────────────────────────────────────────────────
    function _tick() {
        if (_seconds > 0) {
            _seconds--;
            _render();
            _updatePageTitle();
        } else {
            _onFinish();
        }
    }

    function _onFinish() {
        clearInterval(_interval);
        _interval = null;
        _running = false;

        if (_mode === 'work') {
            _rounds++;
            _beep(660, 0.2, 3);
            if (window.showToast) showToast('¡Tiempo! Tómate un descanso.', 'success');
            // After 4 rounds, suggest long break
            _setMode(_rounds % 4 === 0 ? 'longBreak' : 'shortBreak');
        } else {
            _beep(440, 0.2, 2);
            if (window.showToast) showToast('¡Pausa terminada! A trabajar.', 'info');
            _setMode('work');
        }
        _render();
        _updatePageTitle();
    }

    function _setMode(mode) {
        _mode = mode;
        _seconds = MODES[mode].minutes * 60;
        _running = false;
        clearInterval(_interval);
        _interval = null;
    }

    function _fmt(s) {
        const m = Math.floor(s / 60);
        const sec = s % 60;
        return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
    }

    function _updatePageTitle() {
        if (_visible && _running) {
            document.title = `${_fmt(_seconds)} — Workspace`;
        } else {
            document.title = 'Workspace de Producción';
        }
    }

    // ── Render ────────────────────────────────────────────────────────────────
    function _render() {
        const widget = document.getElementById('pomodoro-widget');
        if (!widget || !_visible) return;

        const pct = 1 - (_seconds / (MODES[_mode].minutes * 60));
        const circumference = 2 * Math.PI * 28;
        const dashOffset = circumference * (1 - pct);
        const modeInfo = MODES[_mode];

        widget.style.display = 'block';
        widget.innerHTML = `
          <div class="pomodoro-panel glass-panel" id="pomodoro-inner">
            <div class="pomodoro-header">
              <span class="pomodoro-mode-label" style="color:${modeInfo.color};">${modeInfo.label}</span>
              ${_taskLabel ? `<span class="pomodoro-task">${esc(_taskLabel)}</span>` : ''}
              <button class="btn btn-icon" id="pomo-close" title="Cerrar" style="margin-left:auto;">
                <i data-feather="x"></i>
              </button>
            </div>

            <div class="pomodoro-ring-wrap">
              <svg class="pomodoro-ring" viewBox="0 0 64 64">
                <circle cx="32" cy="32" r="28" fill="none"
                  stroke="var(--border-color)" stroke-width="3"/>
                <circle cx="32" cy="32" r="28" fill="none"
                  stroke="${modeInfo.color}" stroke-width="3"
                  stroke-dasharray="${circumference}"
                  stroke-dashoffset="${dashOffset}"
                  stroke-linecap="round"
                  transform="rotate(-90 32 32)"
                  style="transition:stroke-dashoffset 0.9s linear;"/>
              </svg>
              <span class="pomodoro-time">${_fmt(_seconds)}</span>
            </div>

            <div class="pomodoro-mode-btns">
              <button class="btn btn-icon pomo-mode-btn ${_mode === 'work' ? 'active' : ''}" data-mode="work" title="Trabajo (25 min)">25</button>
              <button class="btn btn-icon pomo-mode-btn ${_mode === 'shortBreak' ? 'active' : ''}" data-mode="shortBreak" title="Pausa corta (5 min)">5</button>
              <button class="btn btn-icon pomo-mode-btn ${_mode === 'longBreak' ? 'active' : ''}" data-mode="longBreak" title="Pausa larga (15 min)">15</button>
            </div>

            <div class="pomodoro-controls">
              <button class="btn btn-icon" id="pomo-reset" title="Reiniciar">
                <i data-feather="rotate-ccw"></i>
              </button>
              <button class="btn btn-primary pomo-main-btn" id="pomo-toggle" style="min-width:80px;justify-content:center;">
                <i data-feather="${_running ? 'pause' : 'play'}"></i>
                ${_running ? 'Pausar' : 'Iniciar'}
              </button>
            </div>

            <div class="pomodoro-rounds">
              ${Array.from({ length: 4 }, (_, i) =>
                `<span class="pomo-round-dot ${i < (_rounds % 4) ? 'done' : ''}"></span>`
              ).join('')}
              <span style="font-size:0.68rem;color:var(--text-muted);margin-left:4px;">#${Math.floor(_rounds / 4) + 1}</span>
            </div>
          </div>`;

        feather.replace();

        // Bind events
        document.getElementById('pomo-close').addEventListener('click', hide);
        document.getElementById('pomo-toggle').addEventListener('click', toggleRunning);
        document.getElementById('pomo-reset').addEventListener('click', reset);

        widget.querySelectorAll('.pomo-mode-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                _setMode(btn.dataset.mode);
                _render();
            });
        });

        // Drag to reposition
        _makeDraggable(document.getElementById('pomodoro-inner'));
    }

    function _makeDraggable(el) {
        if (!el) return;
        let startX, startY, origLeft, origTop;
        const header = el.querySelector('.pomodoro-header');
        if (!header) return;

        header.style.cursor = 'grab';
        header.addEventListener('mousedown', onDown);

        function onDown(e) {
            if (e.target.closest('.btn')) return;
            startX = e.clientX; startY = e.clientY;
            const rect = el.getBoundingClientRect();
            origLeft = rect.left; origTop = rect.top;
            el.style.right = 'auto';
            el.style.bottom = 'auto';
            el.style.left = origLeft + 'px';
            el.style.top = origTop + 'px';
            header.style.cursor = 'grabbing';
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
        }

        function onMove(e) {
            el.style.left = (origLeft + e.clientX - startX) + 'px';
            el.style.top  = (origTop  + e.clientY - startY) + 'px';
        }

        function onUp() {
            header.style.cursor = 'grab';
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
        }
    }

    // ── Public API ────────────────────────────────────────────────────────────
    function show(taskLabel = '') {
        _taskLabel = taskLabel;
        _visible = true;
        _render();
    }

    function hide() {
        _visible = false;
        const widget = document.getElementById('pomodoro-widget');
        if (widget) widget.style.display = 'none';
        clearInterval(_interval);
        _interval = null;
        _running = false;
        document.title = 'Workspace de Producción';
    }

    function toggleRunning() {
        if (_running) {
            clearInterval(_interval);
            _interval = null;
            _running = false;
        } else {
            _running = true;
            _interval = setInterval(_tick, 1000);
        }
        _render();
    }

    function reset() {
        clearInterval(_interval);
        _interval = null;
        _running = false;
        _seconds = MODES[_mode].minutes * 60;
        _render();
        _updatePageTitle();
    }

    function init() {
        document.getElementById('btn-pomodoro')?.addEventListener('click', () => {
            if (_visible) { hide(); } else { show(); }
        });
    }

    return { init, show, hide, toggleRunning, reset };
})();

window.pomodoroManager = pomodoroManager;
document.addEventListener('DOMContentLoaded', () => pomodoroManager.init());
