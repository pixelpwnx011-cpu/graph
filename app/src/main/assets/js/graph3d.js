/* Custom lightweight 3D surface renderer: z = f(x, y).
 * No WebGL / three.js dependency (keeps the app tiny & fully offline) -
 * uses a simple rotation + orthographic projection with painter's algorithm.
 */
/* ---------------- Blender-style axis navigation gizmo ---------------- */
const GIZMO_AXES = [
    { dir: [1, 0, 0], label: 'X', color: '#dc2626', yaw: -Math.PI / 2, pitch: 0 },
    { dir: [-1, 0, 0], label: '', color: '#7f1d1d', yaw: Math.PI / 2, pitch: 0 },
    { dir: [0, 1, 0], label: 'Y', color: '#059669', yaw: 0, pitch: 0 },
    { dir: [0, -1, 0], label: '', color: '#064e3b', yaw: Math.PI, pitch: 0 },
    { dir: [0, 0, 1], label: 'Z', color: '#1d4ed8', yaw: -0.7, pitch: 1.5 },
    { dir: [0, 0, -1], label: '', color: '#1e3a8a', yaw: -0.7, pitch: -1.5 }
];

class Grapher3D {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.yaw = -0.7;
    this.pitch = 0.55;
    this.zoom = 1;
    this.range = 4;       // x,y in [-range, range]
    this.resolution = 42; // grid subdivisions - full-detail default; see _shouldReduceQuality()
    this.wireframe = false;
    this.surfaces = [];   // {expr, compiled, color, error, params}
    this.curves = [];     // {exprX,exprY,exprZ, compiled..., tMin,tMax, color, markerT}
    this._nextId = 1;
    this.interacting = false; // true while rotating/zooming - drops quality for smoothness
    this._interactTimer = null;
    this._animRunning = false;
    this._viewAnim = null; // {fromYaw,fromPitch,toYaw,toPitch,start,duration}
    this.time = 0;           // reserved animated variable 't' fed into surface/curve formulas
    this.timeRunning = false;
    this.timeSpeed = 1;      // units of t per second
    this._lastFrameTime = null;
    this.gizmoCanvas = null;
    this._resize();
    this._attachEvents();
    window.addEventListener('resize', () => this._resize());
  }

  addSurface(expr, color) {
    const s = { id: this._nextId++, expr, color: color || '#1d4ed8', compiled: null, error: null, params: {}, visible: true };
    this.recompile(s);
    this.surfaces.push(s);
    return s;
  }
  removeSurface(id) { this.surfaces = this.surfaces.filter((s) => s.id !== id); this.render(); }

  recompile(s) {
    s.error = null;
    try {
      // 't' is reserved as the animated time variable (see startTimeAnimation), not a slider param
      s.compiled = s.expr ? MathParser.compile(s.expr, ['x', 'y', 't']) : null;
      const params = {};
      (s.compiled ? s.compiled.params : []).forEach((p) => { params[p] = (s.params && p in s.params) ? s.params[p] : 1; });
      s.params = params;
      // If the formula only actually depends on x (or only on y), it's really a
      // plane curve, not a surface - rendering it as a full trough extruded across
      // the whole missing axis shows a big, ugly "wall" at the domain boundary.
      // Detect that and draw a clean line instead (see _drawSurfaceAsCurve).
      s.usesX = s.expr ? MathParser.usesVariable(s.expr, 'x') : true;
      s.usesY = s.expr ? MathParser.usesVariable(s.expr, 'y') : true;
      if (!s.error) this._startReveal(s);
    } catch (err) {
      s.error = err.message;
      s.compiled = null;
    }
  }

  // Parametric 3D curve x(t), y(t), z(t) over [tMin, tMax] - used for things like
  // the classic sin/cos helix in the Trigonometry tab. Rendered as a line, not a
  // filled mesh, since a full implicit-surface solver is out of scope here.
  addCurve(exprX, exprY, exprZ, color, tMin, tMax) {
    const c = {
      id: this._nextId++, exprX, exprY, exprZ,
      color: color || '#7c3aed', compiledX: null, compiledY: null, compiledZ: null,
      error: null, params: {}, visible: true,
      tMin: tMin != null ? tMin : 0, tMax: tMax != null ? tMax : Math.PI * 4,
      markerT: null
    };
    this.recompileCurve(c);
    this.curves.push(c);
    return c;
  }
  removeCurve(id) { this.curves = this.curves.filter((c) => c.id !== id); this.render(); }
  recompileCurve(c) {
    c.error = null;
    try {
      c.compiledX = MathParser.compile(c.exprX, ['t']);
      c.compiledY = MathParser.compile(c.exprY, ['t']);
      c.compiledZ = MathParser.compile(c.exprZ, ['t']);
      const params = {};
      [c.compiledX, c.compiledY, c.compiledZ].forEach((cc) => cc.params.forEach((p) => { params[p] = (c.params && p in c.params) ? c.params[p] : 1; }));
      c.params = params;
      this._startReveal(c); // trace the curve in, same as a freshly (re)plotted surface
    } catch (err) {
      c.error = err.message;
    }
  }

  _startReveal(s) {
    s._revealStart = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    this._runAnimLoop();
  }
  _revealProgress(s) {
    if (!s._revealStart) return 1;
    const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const t = Math.min(1, (now - s._revealStart) / 700);
    return 1 - Math.pow(1 - t, 3); // easeOutCubic
  }
  _runAnimLoop() {
    if (this._animRunning) return;
    this._animRunning = true;
    this._lastFrameTime = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const step = () => {
      const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
      if (this.timeRunning) {
        const dt = Math.min(0.25, (now - this._lastFrameTime) / 1000);
        this.time += dt * this.timeSpeed;
        if (this.onTimeChange) this.onTimeChange(this.time);
      }
      this._lastFrameTime = now;
      this._applyViewAnim();
      this.render();
      const surfacesGoing = this.surfaces.some((s) => s._revealStart && this._revealProgress(s) < 1);
      const curvesGoing = this.curves.some((c) => c._revealStart && this._revealProgress(c) < 1);
      const viewGoing = !!this._viewAnim;
      if (surfacesGoing || curvesGoing || viewGoing || this.timeRunning) requestAnimationFrame(step);
      else this._animRunning = false;
    };
    requestAnimationFrame(step);
  }

  startTimeAnimation() { this.timeRunning = true; this._runAnimLoop(); }
  stopTimeAnimation() { this.timeRunning = false; }
  resetTime() { this.time = 0; if (this.onTimeChange) this.onTimeChange(this.time); this.render(); }

  _resize() {
    // Measure the canvas's own box, not its parent's (see the same fix in
    // GraphPlane._resize for why - keeps this correct if it ever shares a
    // wrapper with another sized element instead of just an absolute overlay).
    const rect = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.max(50, rect.width * dpr);
    this.canvas.height = Math.max(50, rect.height * dpr);
    this.canvas.style.width = rect.width + 'px';
    this.canvas.style.height = rect.height + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.width = rect.width; this.height = rect.height;
    this.render();
  }

  resetView() { this._animateTo(-0.7, 0.55); this.zoom = 1; }

  // Smoothly tween the camera to a target yaw/pitch - used by resetView() and
  // by the axis-navigation gizmo (click a coloured ball to snap to that view,
  // the same interaction Blender's viewport gizmo offers).
  _animateTo(targetYaw, targetPitch, duration) {
    // take the shortest path around for yaw
    let from = this.yaw;
    let delta = ((targetYaw - from + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
    this._viewAnim = {
      fromYaw: from, toYaw: from + delta,
      fromPitch: this.pitch, toPitch: targetPitch,
      start: (typeof performance !== 'undefined' ? performance.now() : Date.now()),
      duration: duration || 320
    };
    this._runAnimLoop();
  }
  _applyViewAnim() {
    if (!this._viewAnim) return;
    const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const t = Math.min(1, (now - this._viewAnim.start) / this._viewAnim.duration);
    const eased = 1 - Math.pow(1 - t, 3);
    this.yaw = this._viewAnim.fromYaw + (this._viewAnim.toYaw - this._viewAnim.fromYaw) * eased;
    this.pitch = this._viewAnim.fromPitch + (this._viewAnim.toPitch - this._viewAnim.fromPitch) * eased;
    if (t >= 1) this._viewAnim = null;
  }

  _rotate(x, y, z) {
    const cosY = Math.cos(this.yaw), sinY = Math.sin(this.yaw);
    const x1 = x * cosY - z * sinY;
    const z1 = x * sinY + z * cosY;
    const y1 = y;
    const cosP = Math.cos(this.pitch), sinP = Math.sin(this.pitch);
    const y2 = y1 * cosP - z1 * sinP;
    const z2 = y1 * sinP + z1 * cosP;
    return { x: x1, y: y2, z: z2 };
  }

  _project(x, y, z) {
    const r = this._rotate(x, y, z);
    const scale = Math.min(this.width, this.height) * 0.16 * this.zoom;
    return { x: this.width / 2 + r.x * scale, y: this.height / 2 - r.y * scale, depth: r.z };
  }

  _heatColor(t) {
    // t in [0,1]: blue -> teal -> green -> yellow -> red
    t = Math.max(0, Math.min(1, isFinite(t) ? t : 0));
    const stops = [
      [37, 99, 235], [16, 185, 129], [234, 179, 8], [220, 38, 38]
    ];
    const seg = 1 / (stops.length - 1);
    const idx = Math.min(stops.length - 2, Math.floor(t / seg));
    const localT = (t - idx * seg) / seg;
    const c0 = stops[idx], c1 = stops[idx + 1];
    const r = Math.round(c0[0] + (c1[0] - c0[0]) * localT);
    const g = Math.round(c0[1] + (c1[1] - c0[1]) * localT);
    const b = Math.round(c0[2] + (c1[2] - c0[2]) * localT);
    return [r, g, b];
  }

  render() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, this.width, this.height);

    this._drawAxes();

    for (const s of this.surfaces) {
      if (!s.visible || !s.compiled || s.error) continue;
      if (!s.usesX || !s.usesY) this._drawSurfaceAsCurve(s);
      else this._drawSurface(s);
    }
    for (const c of this.curves) {
      if (!c.visible || c.error || !c.compiledX) continue;
      this._drawCurve(c);
    }
    this._renderGizmo();
  }

  // A formula that only actually depends on one of x/y is really a plane curve
  // (e.g. z=x^2 is just a parabola) - draw it as a clean line rather than
  // extruding it into a trough-shaped surface with a visible boundary wall.
  _drawSurfaceAsCurve(s) {
    const ctx = this.ctx;
    const R = this.range;
    const steps = Math.max(80, this.resolution * 3);
    const grow = this._revealProgress(s);
    const limit = Math.round(steps * grow);
    const freeVar = s.usesY ? 'y' : 'x'; // whichever variable actually appears (defaults to x if neither does)
    const maskEval = s.compiled.maskEval;
    ctx.strokeStyle = s.color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    let started = false;
    for (let i = 0; i <= limit; i++) {
      const v = -R + (2 * R) * (i / steps);
      const x = freeVar === 'x' ? v : 0;
      const y = freeVar === 'y' ? v : 0;
      const vars = Object.assign({ x, y, t: this.time }, s.params);
      const zRaw = s.compiled.eval(vars);
      const domainInvalid = !isFinite(zRaw);
      const outsideBracket = maskEval ? maskEval(vars) === 0 : false;
      if (domainInvalid || outsideBracket) { started = false; continue; }
      const z = Math.max(-R * 1.5, Math.min(R * 1.5, zRaw));
      const p = this._project(x, y, z);
      if (!started) { ctx.moveTo(p.x, p.y); started = true; } else ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
  }

  _drawCurve(c) {
    const ctx = this.ctx;
    const steps = 240;
    const progress = this._revealProgress(c); // trace the curve in as t sweeps forward
    const limit = Math.round(steps * progress);
    ctx.strokeStyle = c.color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    let started = false;
    let markerPt = null;
    for (let i = 0; i <= limit; i++) {
      const t = c.tMin + (c.tMax - c.tMin) * (i / steps);
      const vars = Object.assign({ t }, c.params);
      const x = c.compiledX.eval(vars), y = c.compiledY.eval(vars), z = c.compiledZ.eval(vars);
      if (!isFinite(x) || !isFinite(y) || !isFinite(z)) { started = false; continue; }
      const p = this._project(x, y, z);
      if (!started) { ctx.moveTo(p.x, p.y); started = true; } else ctx.lineTo(p.x, p.y);
      if (c.markerT !== null && Math.abs(t - c.markerT) < (c.tMax - c.tMin) / steps) markerPt = p;
    }
    ctx.stroke();
    if (markerPt) {
      ctx.beginPath();
      ctx.arc(markerPt.x, markerPt.y, 6, 0, Math.PI * 2);
      ctx.fillStyle = '#f59e0b';
      ctx.fill();
      ctx.strokeStyle = '#78350f';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }

  _drawAxes() {
    const ctx = this.ctx;
    const R = this.range * 1.15;
    const axes = [
      { from: [-R, 0, 0], to: [R, 0, 0], label: 'X', color: '#dc2626' },
      { from: [0, -R, 0], to: [0, R, 0], label: 'Y', color: '#059669' },
      { from: [0, 0, -R], to: [0, 0, R], label: 'Z', color: '#1d4ed8' }
    ];
    ctx.lineWidth = 1.5;
    ctx.font = '13px sans-serif';
    for (const ax of axes) {
      const a = this._project(...ax.from), b = this._project(...ax.to);
      ctx.strokeStyle = ax.color;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      ctx.fillStyle = ax.color;
      ctx.fillText(ax.label, b.x + 4, b.y);
    }
  }

  // True whenever the view is being continuously redrawn for any reason
  // (dragging, a gizmo snap tween, the formation animation, or the sin(t)
  // clock) - in all of these cases we drop mesh density for smoothness and
  // restore full detail the moment everything settles down again.
  _shouldReduceQuality() {
    if (this.interacting || this.timeRunning || this._viewAnim) return true;
    if (this.surfaces.some((s) => s._revealStart && this._revealProgress(s) < 1)) return true;
    return this.curves.some((c) => c._revealStart && this._revealProgress(c) < 1);
  }

  _drawSurface(s) {
    const ctx = this.ctx;
    const N = this._shouldReduceQuality() ? Math.max(10, Math.round(this.resolution * 0.5)) : this.resolution;
    const R = this.range;
    const step = (2 * R) / N;
    const grow = this._revealProgress(s); // 0->1 "growing out of the plane" formation animation
    const maskEval = s.compiled.maskEval; // isolates {condition} bracket factors, if any
    const zmin = { v: Infinity }, zmax = { v: -Infinity };
    const pts = [];
    for (let i = 0; i <= N; i++) {
      const row = [];
      const x = -R + i * step;
      for (let j = 0; j <= N; j++) {
        const y = -R + j * step;
        const vars = Object.assign({ x, y, t: this.time }, s.params);
        const zRaw = s.compiled.eval(vars);
        // a value outside the real domain (sqrt of a negative, log of <=0, etc.)
        // means "no surface here" - treat it as a hole, not a flat z=0 patch.
        const domainInvalid = !isFinite(zRaw);
        const outsideBracket = maskEval ? maskEval(vars) === 0 : false;
        const masked = domainInvalid || outsideBracket;
        const z = (domainInvalid ? 0 : Math.max(-R * 1.5, Math.min(R * 1.5, zRaw))) * grow;
        if (!masked) {
          if (z < zmin.v) zmin.v = z;
          if (z > zmax.v) zmax.v = z;
        }
        row.push({ x, y, z, masked });
      }
      pts.push(row);
    }
    if (zmin.v === Infinity) { zmin.v = 0; zmax.v = 0; } // whole grid masked out - nothing to draw
    const zSpan = Math.max(1e-6, zmax.v - zmin.v);

    const quads = [];
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        const p00 = pts[i][j], p10 = pts[i + 1][j], p11 = pts[i + 1][j + 1], p01 = pts[i][j + 1];
        // skip cells that sit entirely outside every {condition} bracket - this is
        // what carves the actual butterfly/region shape out of the grid instead of
        // drawing a full flat sheet everywhere the formula happens to be zero.
        if (p00.masked && p10.masked && p11.masked && p01.masked) continue;
        const proj = [p00, p10, p11, p01].map((p) => this._project(p.x, p.y, p.z));
        const avgDepth = (proj[0].depth + proj[1].depth + proj[2].depth + proj[3].depth) / 4;
        const avgZ = (p00.z + p10.z + p11.z + p01.z) / 4;
        // simple normal-based shading
        const ux = p10.x - p00.x, uy = p10.y - p00.y, uz = p10.z - p00.z;
        const vx = p01.x - p00.x, vy = p01.y - p00.y, vz = p01.z - p00.z;
        const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
        const nlen = Math.hypot(nx, ny, nz) || 1;
        // a narrower light range hides the flat-shaded facet edges much better -
        // a big light/dark swing between neighbouring quads is what reads as "blocky"
        const light = Math.abs(nz / nlen) * 0.35 + 0.55;
        quads.push({ proj, avgDepth, t: (avgZ - zmin.v) / zSpan, light });
      }
    }
    quads.sort((a, b) => b.avgDepth - a.avgDepth);

    for (const q of quads) {
      const [r, g, b] = this._heatColor(q.t);
      const L = q.light;
      ctx.fillStyle = `rgb(${Math.round(r * L)},${Math.round(g * L)},${Math.round(b * L)})`;
      if (this.wireframe) {
        ctx.beginPath();
        ctx.moveTo(q.proj[0].x, q.proj[0].y);
        ctx.lineTo(q.proj[1].x, q.proj[1].y);
        ctx.lineTo(q.proj[2].x, q.proj[2].y);
        ctx.lineTo(q.proj[3].x, q.proj[3].y);
        ctx.closePath();
        ctx.strokeStyle = s.color;
        ctx.lineWidth = 1;
        ctx.stroke();
        continue;
      }
      // Fill only - no per-quad outline stroke. At a grazing/edge-on viewing
      // angle a curved surface's quads can overlap heavily in screen space, and
      // stroking every one of them (even in a matching colour) stacks up into a
      // dense mass of lines that looks like it's "sticking out" of the surface.
      // Instead, nudge each vertex slightly outward from the quad's centre
      // before filling, which closes the hairline anti-aliasing seams between
      // neighbouring quads without adding any extra stroked ink.
      const cx = (q.proj[0].x + q.proj[1].x + q.proj[2].x + q.proj[3].x) / 4;
      const cy = (q.proj[0].y + q.proj[1].y + q.proj[2].y + q.proj[3].y) / 4;
      ctx.beginPath();
      q.proj.forEach((p, idx) => {
        const dx = p.x - cx, dy = p.y - cy;
        const len = Math.hypot(dx, dy) || 1;
        const ex = p.x + (dx / len) * 0.5, ey = p.y + (dy / len) * 0.5;
        if (idx === 0) ctx.moveTo(ex, ey); else ctx.lineTo(ex, ey);
      });
      ctx.closePath();
      ctx.fill();
    }
  }

  /* ---------------- Blender-style axis navigation gizmo ---------------- */

  attachGizmo(canvasEl) {
    this.gizmoCanvas = canvasEl;
    this.gizmoCtx = canvasEl.getContext('2d');
    this._resizeGizmo();
    canvasEl.addEventListener('pointerdown', (e) => this._gizmoClick(e));
    window.addEventListener('resize', () => this._resizeGizmo());
  }
  _resizeGizmo() {
    if (!this.gizmoCanvas) return;
    const rect = this.gizmoCanvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.gizmoCanvas.width = Math.max(10, rect.width * dpr);
    this.gizmoCanvas.height = Math.max(10, rect.height * dpr);
    this.gizmoCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this._gizmoW = rect.width; this._gizmoH = rect.height;
  }
  _gizmoDotPositions() {
    const cx = this._gizmoW / 2, cy = this._gizmoH / 2;
    const R = Math.min(this._gizmoW, this._gizmoH) / 2 - 12;
    return GIZMO_AXES.map((ax) => {
      const r = this._rotate(ax.dir[0], ax.dir[1], ax.dir[2]);
      return { ax, x: cx + r.x * R, y: cy - r.y * R, depth: r.z };
    });
  }
  _renderGizmo() {
    if (!this.gizmoCanvas) return;
    const ctx = this.gizmoCtx;
    ctx.clearRect(0, 0, this._gizmoW, this._gizmoH);
    const dots = this._gizmoDotPositions().sort((a, b) => a.depth - b.depth);
    for (const d of dots) {
      const isPositive = !!d.ax.label;
      const radius = isPositive ? 9 : 7;
      ctx.beginPath();
      ctx.arc(d.x, d.y, radius, 0, Math.PI * 2);
      ctx.fillStyle = d.ax.color;
      ctx.globalAlpha = 0.55 + 0.45 * ((d.depth + 1) / 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      if (isPositive) {
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 10px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(d.ax.label, d.x, d.y + 0.5);
      }
    }
  }
  _gizmoClick(e) {
    const rect = this.gizmoCanvas.getBoundingClientRect();
    const px = e.clientX - rect.left, py = e.clientY - rect.top;
    const dots = this._gizmoDotPositions();
    let best = null, bestDist = 18;
    for (const d of dots) {
      const dist = Math.hypot(d.x - px, d.y - py);
      if (dist < bestDist) { bestDist = dist; best = d; }
    }
    if (best) this._animateTo(best.ax.yaw, best.ax.pitch);
  }

  _attachEvents() {
    const el = this.canvas;
    el.style.touchAction = 'none';
    const pointers = new Map();
    let pinchStartDist = null, pinchStartZoom = null;

    const markInteracting = () => {
      this.interacting = true;
      if (this._interactTimer) clearTimeout(this._interactTimer);
      this._interactTimer = setTimeout(() => { this.interacting = false; this.render(); }, 160);
    };

    el.addEventListener('pointerdown', (e) => {
      el.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      this._viewAnim = null; // a manual drag cancels any in-flight gizmo snap
      if (pointers.size === 2) {
        const pts = Array.from(pointers.values());
        pinchStartDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        pinchStartZoom = this.zoom;
      }
    });
    el.addEventListener('pointermove', (e) => {
      if (!pointers.has(e.pointerId)) return;
      const prev = pointers.get(e.pointerId);
      const cur = { x: e.clientX, y: e.clientY };
      pointers.set(e.pointerId, cur);

      if (pointers.size >= 2) {
        const pts = Array.from(pointers.values());
        const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        if (pinchStartDist) {
          this.zoom = Math.max(0.2, Math.min(4, pinchStartZoom * (dist / Math.max(pinchStartDist, 1))));
          markInteracting();
          this.render();
        }
        return;
      }
      const dx = cur.x - prev.x, dy = cur.y - prev.y;
      this.yaw += dx * 0.008;
      this.pitch = Math.max(-1.4, Math.min(1.4, this.pitch - dy * 0.008));
      markInteracting();
      this.render();
    });
    const release = (e) => { pointers.delete(e.pointerId); if (pointers.size < 2) pinchStartDist = null; };
    el.addEventListener('pointerup', release);
    el.addEventListener('pointercancel', release);

    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.zoom = Math.max(0.2, Math.min(4, this.zoom * (e.deltaY > 0 ? 0.9 : 1.1)));
      markInteracting();
      this.render();
    }, { passive: false });
  }
}
