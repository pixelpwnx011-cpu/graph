/* Generic 2D coordinate plane: handles resizing, grid drawing, pan & zoom.
 * Other tools (equation grapher, geometry, trig) build on top of it via onDraw().
 */
class GraphPlane {
  constructor(canvas, opts) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.opts = Object.assign({ lockAspect: true, minSpan: 0.001, maxSpan: 1e6 }, opts);
    // world view window
    this.cx = 0; this.cy = 0;      // center of view in world coords
    this.span = 10;                // half-height of view in world units
    this.onDraw = null;
    this._pointers = new Map();
    this._pinchStartDist = null;
    this._pinchStartSpan = null;
    this._resize();
    this._attachEvents();
    window.addEventListener('resize', () => this._resize());
  }

  _resize() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.max(50, rect.width * dpr);
    this.canvas.height = Math.max(50, rect.height * dpr);
    this.canvas.style.width = rect.width + 'px';
    this.canvas.style.height = rect.height + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.width = rect.width;
    this.height = rect.height;
    this.render();
  }

  get scale() { return (this.height / 2) / this.span; } // pixels per world unit

  worldToScreen(x, y) {
    return {
      x: this.width / 2 + (x - this.cx) * this.scale,
      y: this.height / 2 - (y - this.cy) * this.scale
    };
  }
  screenToWorld(px, py) {
    return {
      x: this.cx + (px - this.width / 2) / this.scale,
      y: this.cy - (py - this.height / 2) / this.scale
    };
  }

  resetView(cx = 0, cy = 0, span = 10) { this.cx = cx; this.cy = cy; this.span = span; this.render(); }

  _niceStep(target) {
    const pow10 = Math.pow(10, Math.floor(Math.log10(target)));
    const n = target / pow10;
    let step;
    if (n < 1.5) step = 1; else if (n < 3.5) step = 2; else if (n < 7.5) step = 5; else step = 10;
    return step * pow10;
  }

  drawGrid(opts = {}) {
    const ctx = this.ctx;
    const showLabels = opts.labels !== false;
    ctx.clearRect(0, 0, this.width, this.height);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, this.width, this.height);

    const xSpanWorld = this.width / this.scale;
    const targetDiv = this.width / 90;
    const step = this._niceStep(xSpanWorld / targetDiv);
    const minorStep = step / 5;

    const left = this.cx - this.width / (2 * this.scale);
    const right = this.cx + this.width / (2 * this.scale);
    const top = this.cy + this.height / (2 * this.scale);
    const bottom = this.cy - this.height / (2 * this.scale);

    // minor grid
    ctx.strokeStyle = '#eef1f6';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = Math.ceil(left / minorStep) * minorStep; x <= right; x += minorStep) {
      const p = this.worldToScreen(x, 0);
      ctx.moveTo(p.x, 0); ctx.lineTo(p.x, this.height);
    }
    for (let y = Math.ceil(bottom / minorStep) * minorStep; y <= top; y += minorStep) {
      const p = this.worldToScreen(0, y);
      ctx.moveTo(0, p.y); ctx.lineTo(this.width, p.y);
    }
    ctx.stroke();

    // major grid
    ctx.strokeStyle = '#d3dae6';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = Math.ceil(left / step) * step; x <= right; x += step) {
      const p = this.worldToScreen(x, 0);
      ctx.moveTo(p.x, 0); ctx.lineTo(p.x, this.height);
    }
    for (let y = Math.ceil(bottom / step) * step; y <= top; y += step) {
      const p = this.worldToScreen(0, y);
      ctx.moveTo(0, p.y); ctx.lineTo(this.width, p.y);
    }
    ctx.stroke();

    // axes
    ctx.strokeStyle = '#33415c';
    ctx.lineWidth = 2;
    const o = this.worldToScreen(0, 0);
    ctx.beginPath();
    ctx.moveTo(0, o.y); ctx.lineTo(this.width, o.y);
    ctx.moveTo(o.x, 0); ctx.lineTo(o.x, this.height);
    ctx.stroke();

    if (showLabels) {
      ctx.fillStyle = '#5b6472';
      ctx.font = '12px sans-serif';
      for (let x = Math.ceil(left / step) * step; x <= right; x += step) {
        if (Math.abs(x) < step / 100) continue;
        const p = this.worldToScreen(x, 0);
        ctx.fillText(this._fmt(x), p.x + 3, Math.min(Math.max(o.y + 14, 14), this.height - 4));
      }
      for (let y = Math.ceil(bottom / step) * step; y <= top; y += step) {
        if (Math.abs(y) < step / 100) continue;
        const p = this.worldToScreen(0, y);
        ctx.fillText(this._fmt(y), Math.min(Math.max(o.x + 4, 4), this.width - 24), p.y - 3);
      }
    }
  }

  _fmt(v) {
    const r = Math.round(v * 1000) / 1000;
    return Math.abs(r) < 1e-9 ? '0' : String(r);
  }

  drawQuadrantLabels() {
    const ctx = this.ctx;
    const o = this.worldToScreen(0, 0);
    ctx.save();
    ctx.font = 'bold 15px sans-serif';
    ctx.fillStyle = 'rgba(37,99,235,0.35)';
    const pad = 18;
    const spots = [
      { label: 'I', x: this.width - pad, y: pad + 12, align: 'right' },
      { label: 'II', x: pad, y: pad + 12, align: 'left' },
      { label: 'III', x: pad, y: this.height - pad, align: 'left' },
      { label: 'IV', x: this.width - pad, y: this.height - pad, align: 'right' }
    ];
    spots.forEach((s) => {
      // only draw if that quadrant is actually visible around the origin on screen
      ctx.textAlign = s.align;
      ctx.fillText('Quadrant ' + s.label, s.x, s.y);
    });
    ctx.restore();
  }

  drawAxisNames() {
    const ctx = this.ctx;
    const o = this.worldToScreen(0, 0);
    ctx.save();
    ctx.font = '13px sans-serif';
    ctx.fillStyle = '#33415c';
    const oy = Math.min(Math.max(o.y, 16), this.height - 6);
    const ox = Math.min(Math.max(o.x, 4), this.width - 90);
    ctx.textAlign = 'right';
    ctx.fillText('X-axis (Abscissa) \u2192', this.width - 6, oy - 6);
    ctx.save();
    ctx.translate(ox + 12, 14);
    ctx.textAlign = 'left';
    ctx.fillText('\u2191 Y-axis (Ordinate)', 0, 0);
    ctx.restore();
    ctx.restore();
  }

  render() {
    this.drawGrid({ labels: !window.APP_STATE || window.APP_STATE.showLabels !== false });
    if (window.APP_STATE && window.APP_STATE.showLabels) {
      this.drawQuadrantLabels();
      this.drawAxisNames();
    }
    if (this.onDraw) this.onDraw(this);
  }

  _attachEvents() {
    const el = this.canvas;
    el.style.touchAction = 'none';

    el.addEventListener('pointerdown', (e) => {
      el.setPointerCapture(e.pointerId);
      this._pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this._pointers.size === 1) {
        if (this.onPointerDown) this.onPointerDown(e, this);
      }
      if (this._pointers.size === 2) {
        const pts = Array.from(this._pointers.values());
        this._pinchStartDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        this._pinchStartSpan = this.span;
      }
    });
    el.addEventListener('pointermove', (e) => {
      if (!this._pointers.has(e.pointerId)) return;
      const prev = this._pointers.get(e.pointerId);
      const cur = { x: e.clientX, y: e.clientY };
      this._pointers.set(e.pointerId, cur);

      if (this._pointers.size >= 2) {
        const pts = Array.from(this._pointers.values());
        const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        if (this._pinchStartDist) {
          const ratio = this._pinchStartDist / Math.max(dist, 1);
          this.span = Math.min(this.opts.maxSpan, Math.max(this.opts.minSpan, this._pinchStartSpan * ratio));
          this.render();
        }
        return;
      }

      const dx = cur.x - prev.x, dy = cur.y - prev.y;
      if (this.onPointerMove) {
        this.onPointerMove(e, this, dx, dy);
      } else {
        this.cx -= dx / this.scale;
        this.cy += dy / this.scale;
        this.render();
      }
    });
    const release = (e) => {
      this._pointers.delete(e.pointerId);
      if (this._pointers.size < 2) this._pinchStartDist = null;
      if (this.onPointerUp) this.onPointerUp(e, this);
    };
    el.addEventListener('pointerup', release);
    el.addEventListener('pointercancel', release);

    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      const factor = e.deltaY > 0 ? 1.1 : 0.9;
      this.span = Math.min(this.opts.maxSpan, Math.max(this.opts.minSpan, this.span * factor));
      this.render();
    }, { passive: false });
  }
}

/* ---------------- Equation grapher built on GraphPlane ---------------- */
const PALETTE = ['#e63946', '#1d4ed8', '#059669', '#f59e0b', '#7c3aed', '#db2777', '#0891b2', '#65a30d'];

class Grapher2D {
  constructor(canvas) {
    this.plane = new GraphPlane(canvas);
    this.equations = []; // {id, expr, type, color, visible, compiled, error, params:{}}
    this._nextId = 1;
    this.fitPoints = [];      // points used for "draw / enter points -> equation"
    this.drawPointsMode = false;
    this._draggingFitIdx = -1;
    this.plane.onDraw = (p) => { this._drawEquations(p); this._drawFitPoints(p); };
    this.plane.onPointerDown = (e, p) => this._handlePointerDown(e, p);
    this.plane.onPointerMove = (e, p, dx, dy) => this._handlePointerMove(e, p, dx, dy);
    this.plane.onPointerUp = () => { this._draggingFitIdx = -1; };
  }

  _handlePointerDown(e, plane) {
    const rect = plane.canvas.getBoundingClientRect();
    const px = e.clientX - rect.left, py = e.clientY - rect.top;
    const world = plane.screenToWorld(px, py);
    // check if grabbing an existing fit point
    for (let i = 0; i < this.fitPoints.length; i++) {
      const s = plane.worldToScreen(this.fitPoints[i].x, this.fitPoints[i].y);
      if (Math.hypot(s.x - px, s.y - py) < 16) { this._draggingFitIdx = i; return; }
    }
    if (this.drawPointsMode) {
      this.fitPoints.push({ x: Math.round(world.x * 100) / 100, y: Math.round(world.y * 100) / 100 });
      if (this.onFitPointsChanged) this.onFitPointsChanged(this.fitPoints);
      plane.render();
    }
  }

  _handlePointerMove(e, plane, dx, dy) {
    if (this._draggingFitIdx >= 0) {
      const rect = plane.canvas.getBoundingClientRect();
      const px = e.clientX - rect.left, py = e.clientY - rect.top;
      const world = plane.screenToWorld(px, py);
      this.fitPoints[this._draggingFitIdx] = { x: Math.round(world.x * 100) / 100, y: Math.round(world.y * 100) / 100 };
      if (this.onFitPointsChanged) this.onFitPointsChanged(this.fitPoints);
      plane.render();
      return;
    }
    if (this.drawPointsMode) return; // don't pan while placing points
    plane.cx -= dx / plane.scale;
    plane.cy += dy / plane.scale;
    plane.render();
  }

  clearFitPoints() { this.fitPoints = []; this.plane.render(); if (this.onFitPointsChanged) this.onFitPointsChanged(this.fitPoints); }

  _drawFitPoints(plane) {
    const ctx = plane.ctx;
    ctx.fillStyle = '#0f172a';
    ctx.font = '12px sans-serif';
    this.fitPoints.forEach((pt, i) => {
      const s = plane.worldToScreen(pt.x, pt.y);
      ctx.beginPath();
      ctx.arc(s.x, s.y, 6, 0, Math.PI * 2);
      ctx.fillStyle = '#f59e0b';
      ctx.fill();
      ctx.strokeStyle = '#78350f';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      if (window.APP_STATE && window.APP_STATE.showLabels) {
        ctx.fillStyle = '#0f172a';
        ctx.fillText(`(${pt.x}, ${pt.y})`, s.x + 9, s.y - 9);
      }
    });
  }

  addEquation(expr = '', type = 'y') {
    const eq = {
      id: this._nextId++,
      expr,
      type, // 'y' -> y=f(x), 'x' -> x=f(y), 'r' -> r=f(theta), 'param' -> x=f(t),y=g(t)
      exprY: '',
      color: PALETTE[(this.equations.length) % PALETTE.length],
      visible: true,
      compiled: null,
      compiledY: null,
      error: null,
      params: {}
    };
    this.recompile(eq);
    this.equations.push(eq);
    return eq;
  }

  removeEquation(id) {
    this.equations = this.equations.filter((e) => e.id !== id);
    this.plane.render();
  }

  recompile(eq) {
    eq.error = null;
    try {
      if (eq.type === 'param') {
        eq.compiled = eq.expr ? MathParser.compile(eq.expr, ['t']) : null;
        eq.compiledY = eq.exprY ? MathParser.compile(eq.exprY, ['t']) : null;
      } else if (eq.type === 'r') {
        eq.compiled = eq.expr ? MathParser.compile(eq.expr, ['theta']) : null;
      } else if (eq.type === 'x') {
        eq.compiled = eq.expr ? MathParser.compile(eq.expr, ['y']) : null;
      } else {
        eq.compiled = eq.expr ? MathParser.compile(eq.expr, ['x']) : null;
      }
      const params = {};
      const src = (eq.compiled ? eq.compiled.params : []).concat(eq.compiledY ? eq.compiledY.params : []);
      src.forEach((p) => { params[p] = (eq.params && p in eq.params) ? eq.params[p] : 1; });
      eq.params = params;
    } catch (err) {
      eq.error = err.message;
      eq.compiled = null;
    }
  }

  _drawEquations(plane) {
    const ctx = plane.ctx;
    for (const eq of this.equations) {
      if (!eq.visible || !eq.compiled || eq.error) continue;
      ctx.strokeStyle = eq.color;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      let started = false;

      if (eq.type === 'y') {
        for (let px = 0; px <= plane.width; px += 1) {
          const wx = plane.screenToWorld(px, 0).x;
          const wy = eq.compiled.eval(Object.assign({ x: wx }, eq.params));
          if (!isFinite(wy)) { started = false; continue; }
          const s = plane.worldToScreen(wx, wy);
          if (s.y < -1e5 || s.y > plane.height + 1e5) { started = false; continue; }
          if (!started) { ctx.moveTo(s.x, s.y); started = true; } else ctx.lineTo(s.x, s.y);
        }
      } else if (eq.type === 'x') {
        for (let py = 0; py <= plane.height; py += 1) {
          const wy = plane.screenToWorld(0, py).y;
          const wx = eq.compiled.eval(Object.assign({ y: wy }, eq.params));
          if (!isFinite(wx)) { started = false; continue; }
          const s = plane.worldToScreen(wx, wy);
          if (!started) { ctx.moveTo(s.x, s.y); started = true; } else ctx.lineTo(s.x, s.y);
        }
      } else if (eq.type === 'r') {
        const steps = 2000;
        for (let i = 0; i <= steps; i++) {
          const theta = (i / steps) * Math.PI * 4; // two full turns for spirals etc
          const r = eq.compiled.eval(Object.assign({ theta }, eq.params));
          if (!isFinite(r)) { started = false; continue; }
          const wx = r * Math.cos(theta), wy = r * Math.sin(theta);
          const s = plane.worldToScreen(wx, wy);
          if (!started) { ctx.moveTo(s.x, s.y); started = true; } else ctx.lineTo(s.x, s.y);
        }
      } else if (eq.type === 'param' && eq.compiledY) {
        const steps = 2000;
        const tMin = (eq.params.tMin !== undefined) ? eq.params.tMin : -10;
        const tMax = (eq.params.tMax !== undefined) ? eq.params.tMax : 10;
        for (let i = 0; i <= steps; i++) {
          const t = tMin + (tMax - tMin) * (i / steps);
          const wx = eq.compiled.eval(Object.assign({ t }, eq.params));
          const wy = eq.compiledY.eval(Object.assign({ t }, eq.params));
          if (!isFinite(wx) || !isFinite(wy)) { started = false; continue; }
          const s = plane.worldToScreen(wx, wy);
          if (!started) { ctx.moveTo(s.x, s.y); started = true; } else ctx.lineTo(s.x, s.y);
        }
      }
      ctx.stroke();
    }
  }
}
