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
    this.interacting = false;   // true while the user is actively panning/zooming - used to drop render quality for smoothness
    this._interactTimer = null;
    this._resize();
    this._attachEvents();
    window.addEventListener('resize', () => this._resize());
  }

  _resize() {
    // Measure the canvas element's own box, not its parent's - several canvases
    // (e.g. the two stacked trig graphs, or a canvas plus its absolutely-positioned
    // gizmo overlay) share one wrapper, so the parent's size isn't always this
    // canvas's actual allotted size once flexbox/absolute positioning is applied.
    const rect = this.canvas.getBoundingClientRect();
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

  // The current major grid line spacing in world units - i.e. "one graph scale
  // marking" at the current zoom level. Used both for drawing the grid and for
  // snap-to-grid point placement in the geometry tool.
  getGridStep() {
    const xSpanWorld = this.width / this.scale;
    const targetDiv = this.width / 90;
    return this._niceStep(xSpanWorld / targetDiv);
  }

  drawGrid(opts = {}) {
    const ctx = this.ctx;
    const showLabels = opts.labels !== false;
    ctx.clearRect(0, 0, this.width, this.height);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, this.width, this.height);

    const step = this.getGridStep();
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

  _markInteracting() {
    this.interacting = true;
    if (this._interactTimer) clearTimeout(this._interactTimer);
    this._interactTimer = setTimeout(() => { this.interacting = false; this.render(); }, 160);
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
          this._markInteracting();
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
        this._markInteracting();
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
      this._markInteracting();
      this.render();
    }, { passive: false });
  }
}

/* ---------------- Implicit relation rendering helpers ---------------- */

// Trace the zero-contour of fn(x,y) over a world-space window using marching squares.
function marchingSquares(fn, xMin, xMax, yMin, yMax, nx, ny, plane, ctx) {
  const dx = (xMax - xMin) / nx, dy = (yMax - yMin) / ny;
  if (!(dx > 0) || !(dy > 0)) return;
  const grid = [];
  for (let j = 0; j <= ny; j++) {
    const row = [];
    const y = yMin + j * dy;
    for (let i = 0; i <= nx; i++) {
      const x = xMin + i * dx;
      let v;
      try { v = fn(x, y); } catch (e) { v = NaN; }
      row.push(v);
    }
    grid.push(row);
  }
  const lerp = (a, b, va, vb) => {
    const t = va === vb ? 0.5 : (-va) / (vb - va);
    return a + (b - a) * t;
  };
  ctx.beginPath();
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const x0 = xMin + i * dx, x1 = x0 + dx, y0 = yMin + j * dy, y1 = y0 + dy;
      const v00 = grid[j][i], v10 = grid[j][i + 1], v11 = grid[j + 1][i + 1], v01 = grid[j + 1][i];
      if (!isFinite(v00) || !isFinite(v10) || !isFinite(v11) || !isFinite(v01)) continue;
      const b00 = v00 >= 0, b10 = v10 >= 0, b11 = v11 >= 0, b01 = v01 >= 0;
      if (b00 === b10 && b10 === b11 && b11 === b01) continue;
      const eTop = b00 !== b10 ? { x: lerp(x0, x1, v00, v10), y: y0 } : null;
      const eRight = b10 !== b11 ? { x: x1, y: lerp(y0, y1, v10, v11) } : null;
      const eBottom = b01 !== b11 ? { x: lerp(x0, x1, v01, v11), y: y1 } : null;
      const eLeft = b00 !== b01 ? { x: x0, y: lerp(y0, y1, v00, v01) } : null;
      const pts = [eTop, eRight, eBottom, eLeft].filter(Boolean);
      for (let k = 0; k + 1 < pts.length; k += 2) {
        const p1 = plane.worldToScreen(pts[k].x, pts[k].y);
        const p2 = plane.worldToScreen(pts[k + 1].x, pts[k + 1].y);
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
      }
    }
  }
  ctx.stroke();
}

// Fill every grid cell where boolFn(x,y) is true (used for inequality regions).
function shadeRegion(boolFn, xMin, xMax, yMin, yMax, nx, ny, plane, ctx) {
  const dx = (xMax - xMin) / nx, dy = (yMax - yMin) / ny;
  if (!(dx > 0) || !(dy > 0)) return;
  for (let j = 0; j < ny; j++) {
    const y = yMin + (j + 0.5) * dy;
    for (let i = 0; i < nx; i++) {
      const x = xMin + (i + 0.5) * dx;
      let ok;
      try { ok = boolFn(x, y); } catch (e) { ok = false; }
      if (!ok) continue;
      const s0 = plane.worldToScreen(xMin + i * dx, yMin + j * dy);
      const s1 = plane.worldToScreen(xMin + (i + 1) * dx, yMin + (j + 1) * dy);
      const rx = Math.min(s0.x, s1.x), ry = Math.min(s0.y, s1.y);
      ctx.fillRect(rx, ry, Math.abs(s1.x - s0.x) + 1, Math.abs(s1.y - s0.y) + 1);
    }
  }
}

function hexToRgba(hex, alpha) {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16), g = parseInt(h.substring(2, 4), 16), b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// Finds the index of the first occurrence of any char in `chars` that sits at
// bracket-nesting depth 0 (ignores characters inside (), {}, or |abs| pairs).
function findTopLevelChar(str, chars) {
  let depth = 0, absOpen = false;
  for (let i = 0; i < str.length; i++) {
    const c = str[i];
    if (c === '|') { absOpen = !absOpen; continue; }
    if (absOpen) continue;
    if ('([{'.includes(c)) depth++;
    else if (')]}'.includes(c)) depth--;
    else if (depth === 0 && chars.includes(c)) return i;
  }
  return -1;
}

/* ---------------- Equation grapher built on GraphPlane ---------------- */
const PALETTE = ['#e63946', '#1d4ed8', '#059669', '#f59e0b', '#7c3aed', '#db2777', '#0891b2', '#65a30d'];

class Grapher2D {
  constructor(canvas) {
    this.plane = new GraphPlane(canvas);
    this.equations = []; // {id, raw, type, expr, exprY, lhsExpr, rhsExpr, op, color, visible, compiled, error, params:{}}
    this._nextId = 1;
    this.fitPoints = [];      // points used for "draw / enter points -> equation"
    this.drawPointsMode = false;
    this._draggingFitIdx = -1;
    this.plane.onDraw = (p) => { this._drawEquations(p); this._drawFitPoints(p); };
    this.plane.onPointerDown = (e, p) => this._handlePointerDown(e, p);
    this.plane.onPointerMove = (e, p, dx, dy) => this._handlePointerMove(e, p, dx, dy);
    this.plane.onPointerUp = () => { this._draggingFitIdx = -1; };
  }

  // Reads a single typed-in line ("y = sin(x)", "x^2+y^2=25", "x=cos(t), y=sin(t)", "sin(x)")
  // and figures out on its own whether it's y=f(x), x=f(y), r=f(theta), a parametric pair,
  // or a general implicit relation (equality curve or inequality region).
  static autoDetect(raw) {
    const s = (raw || '').trim();
    const empty = { type: 'y', expr: '', exprY: '', lhsExpr: '', rhsExpr: '', op: '' };
    if (!s) return empty;

    const commaIdx = findTopLevelChar(s, ',');
    if (commaIdx !== -1) {
      const left = s.slice(0, commaIdx).trim();
      const right = s.slice(commaIdx + 1).trim();
      const splitVar = (part) => {
        const rel = MathParser.splitRelation(part);
        return rel ? { name: rel.lhs.trim().toLowerCase(), expr: rel.rhs.trim() } : null;
      };
      const l = splitVar(left), r = splitVar(right);
      let xExpr = null, yExpr = null;
      if (l && l.name === 'x') xExpr = l.expr; else if (r && r.name === 'x') xExpr = r.expr;
      if (l && l.name === 'y') yExpr = l.expr; else if (r && r.name === 'y') yExpr = r.expr;
      if (xExpr === null) xExpr = l ? l.expr : left;
      if (yExpr === null) yExpr = r ? r.expr : right;
      return { type: 'param', expr: xExpr, exprY: yExpr, lhsExpr: '', rhsExpr: '', op: '' };
    }

    let rel;
    try { rel = MathParser.splitRelation(s); } catch (e) { rel = null; }
    if (!rel) return { type: 'y', expr: s, exprY: '', lhsExpr: '', rhsExpr: '', op: '' };

    const lhsBare = rel.lhs.trim().toLowerCase();
    let rhsUsesX = false, rhsUsesY = false;
    try { rhsUsesX = MathParser.usesVariable(rel.rhs, 'x'); rhsUsesY = MathParser.usesVariable(rel.rhs, 'y'); } catch (e) { /* ignore */ }

    if (rel.op === '=' && lhsBare === 'y' && !rhsUsesY) return { type: 'y', expr: rel.rhs, exprY: '', lhsExpr: '', rhsExpr: '', op: '' };
    if (rel.op === '=' && lhsBare === 'x' && !rhsUsesX) return { type: 'x', expr: rel.rhs, exprY: '', lhsExpr: '', rhsExpr: '', op: '' };
    if (lhsBare === 'r') return { type: 'r', expr: rel.rhs, exprY: '', lhsExpr: '', rhsExpr: '', op: '' };

    return { type: 'rel', expr: s, exprY: '', lhsExpr: rel.lhs, rhsExpr: rel.rhs, op: rel.op };
  }

  static typeLabel(eq) {
    switch (eq.type) {
      case 'y': return 'y = f(x)';
      case 'x': return 'x = f(y)';
      case 'r': return 'r = f(\u03B8)  polar';
      case 'param': return 'x,y = f(t)  parametric';
      case 'rel': return eq.op === '=' ? 'implicit curve' : 'inequality region';
      default: return '';
    }
  }

  setEquationText(eq, raw) {
    eq.raw = raw;
    const det = Grapher2D.autoDetect(raw);
    Object.assign(eq, det);
    this.recompile(eq);
    if (!eq.error) this._startReveal(eq);
  }

  // Kick off a short "draw the curve in" animation whenever an equation is
  // (re)plotted, instead of it just popping onto the screen instantly.
  _startReveal(eq) {
    eq._revealStart = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    this._runAnimLoop();
  }
  _revealProgress(eq) {
    if (!eq._revealStart) return 1;
    const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const t = Math.min(1, (now - eq._revealStart) / 550);
    return 1 - Math.pow(1 - t, 3); // easeOutCubic
  }
  _runAnimLoop() {
    if (this._animRunning) return;
    this._animRunning = true;
    const step = () => {
      this.plane.render();
      const stillGoing = this.equations.some((eq) => eq._revealStart && this._revealProgress(eq) < 1);
      if (stillGoing) requestAnimationFrame(step);
      else this._animRunning = false;
    };
    requestAnimationFrame(step);
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
    plane._markInteracting();
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

  addEquation(raw = '') {
    const eq = {
      id: this._nextId++,
      raw: '',
      type: 'y', expr: '', exprY: '', lhsExpr: '', rhsExpr: '', op: '',
      color: PALETTE[(this.equations.length) % PALETTE.length],
      visible: true,
      compiled: null,
      compiledY: null,
      compiledLhs: null,
      compiledRhs: null,
      error: null,
      params: {},
      extended3d: false
    };
    this.setEquationText(eq, raw);
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
      } else if (eq.type === 'rel') {
        eq.compiledLhs = eq.lhsExpr ? MathParser.compile(eq.lhsExpr, ['x', 'y']) : null;
        eq.compiledRhs = eq.rhsExpr ? MathParser.compile(eq.rhsExpr, ['x', 'y']) : null;
        eq.compiled = eq.compiledLhs;
        if (!eq.compiledLhs || !eq.compiledRhs) throw new Error('Incomplete relation');
      } else {
        eq.compiled = eq.expr ? MathParser.compile(eq.expr, ['x']) : null;
      }
      const params = {};
      const src = eq.type === 'rel'
        ? (eq.compiledLhs.params).concat(eq.compiledRhs.params)
        : (eq.compiled ? eq.compiled.params : []).concat(eq.compiledY ? eq.compiledY.params : []);
      src.forEach((p) => { params[p] = (eq.params && p in eq.params) ? eq.params[p] : 1; });
      eq.params = params;
    } catch (err) {
      eq.error = err.message;
      eq.compiled = null;
    }
  }

  _drawEquations(plane) {
    const ctx = plane.ctx;
    const interacting = plane.interacting;
    for (const eq of this.equations) {
      if (!eq.visible || eq.error) continue;
      const progress = this._revealProgress(eq);
      if (progress <= 0) continue;

      if (eq.type === 'rel') {
        if (!eq.compiledLhs || !eq.compiledRhs) continue;
        const fn = (x, y) => eq.compiledLhs.eval(Object.assign({ x, y }, eq.params)) - eq.compiledRhs.eval(Object.assign({ x, y }, eq.params));
        const left = plane.cx - plane.width / (2 * plane.scale);
        const right = plane.cx + plane.width / (2 * plane.scale);
        const top = plane.cy + plane.height / (2 * plane.scale);
        const bottom = plane.cy - plane.height / (2 * plane.scale);
        // drop the sampling grid resolution while panning/zooming so it stays smooth,
        // then redraw at full quality once the gesture settles.
        const qualityScale = interacting ? 0.45 : 1;
        const nx = Math.max(18, Math.min(220, Math.round(plane.width / 4.5 * qualityScale)));
        const ny = Math.max(18, Math.min(220, Math.round(plane.height / 4.5 * qualityScale)));
        ctx.save();
        ctx.globalAlpha = progress;
        if (eq.op === '=') {
          ctx.strokeStyle = eq.color;
          ctx.lineWidth = 2.5;
          marchingSquares(fn, left, right, bottom, top, nx, ny, plane, ctx);
        } else {
          const cmpFn = { '<': (v) => v < 0, '<=': (v) => v <= 0, '>': (v) => v > 0, '>=': (v) => v >= 0 }[eq.op] || ((v) => v < 0);
          ctx.fillStyle = hexToRgba(eq.color, 0.22);
          shadeRegion((x, y) => cmpFn(fn(x, y)), left, right, bottom, top, Math.max(16, Math.round(nx * 0.7)), Math.max(16, Math.round(ny * 0.7)), plane, ctx);
          ctx.strokeStyle = eq.color;
          ctx.lineWidth = 1.5;
          marchingSquares(fn, left, right, bottom, top, nx, ny, plane, ctx);
        }
        ctx.restore();
        continue;
      }

      if (!eq.compiled) continue;
      ctx.strokeStyle = eq.color;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      let started = false;

      if (eq.type === 'y') {
        const limit = Math.round(plane.width * progress);
        for (let px = 0; px <= limit; px += 1) {
          const wx = plane.screenToWorld(px, 0).x;
          const wy = eq.compiled.eval(Object.assign({ x: wx }, eq.params));
          if (!isFinite(wy)) { started = false; continue; }
          const s = plane.worldToScreen(wx, wy);
          if (s.y < -1e5 || s.y > plane.height + 1e5) { started = false; continue; }
          if (!started) { ctx.moveTo(s.x, s.y); started = true; } else ctx.lineTo(s.x, s.y);
        }
      } else if (eq.type === 'x') {
        const limit = Math.round(plane.height * progress);
        for (let py = 0; py <= limit; py += 1) {
          const wy = plane.screenToWorld(0, py).y;
          const wx = eq.compiled.eval(Object.assign({ y: wy }, eq.params));
          if (!isFinite(wx)) { started = false; continue; }
          const s = plane.worldToScreen(wx, wy);
          if (!started) { ctx.moveTo(s.x, s.y); started = true; } else ctx.lineTo(s.x, s.y);
        }
      } else if (eq.type === 'r') {
        const steps = 2000;
        const limit = Math.round(steps * progress);
        for (let i = 0; i <= limit; i++) {
          const theta = (i / steps) * Math.PI * 4; // two full turns for spirals etc
          const r = eq.compiled.eval(Object.assign({ theta }, eq.params));
          if (!isFinite(r)) { started = false; continue; }
          const wx = r * Math.cos(theta), wy = r * Math.sin(theta);
          const s = plane.worldToScreen(wx, wy);
          if (!started) { ctx.moveTo(s.x, s.y); started = true; } else ctx.lineTo(s.x, s.y);
        }
      } else if (eq.type === 'param' && eq.compiledY) {
        const steps = 2000;
        const limit = Math.round(steps * progress);
        const tMin = (eq.params.tMin !== undefined) ? eq.params.tMin : -10;
        const tMax = (eq.params.tMax !== undefined) ? eq.params.tMax : 10;
        for (let i = 0; i <= limit; i++) {
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
