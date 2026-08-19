/* Custom lightweight 3D surface renderer: z = f(x, y).
 * No WebGL / three.js dependency (keeps the app tiny & fully offline) -
 * uses a simple rotation + orthographic projection with painter's algorithm.
 */
class Grapher3D {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.yaw = -0.7;
    this.pitch = 0.55;
    this.zoom = 1;
    this.range = 4;       // x,y in [-range, range]
    this.resolution = 28; // grid subdivisions
    this.wireframe = false;
    this.surfaces = [];   // {expr, compiled, color, error, params}
    this._nextId = 1;
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
      s.compiled = s.expr ? MathParser.compile(s.expr, ['x', 'y']) : null;
      const params = {};
      (s.compiled ? s.compiled.params : []).forEach((p) => { params[p] = (s.params && p in s.params) ? s.params[p] : 1; });
      s.params = params;
    } catch (err) {
      s.error = err.message;
      s.compiled = null;
    }
  }

  _resize() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.max(50, rect.width * dpr);
    this.canvas.height = Math.max(50, rect.height * dpr);
    this.canvas.style.width = rect.width + 'px';
    this.canvas.style.height = rect.height + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.width = rect.width; this.height = rect.height;
    this.render();
  }

  resetView() { this.yaw = -0.7; this.pitch = 0.55; this.zoom = 1; this.render(); }

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
      this._drawSurface(s);
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

  _drawSurface(s) {
    const ctx = this.ctx;
    const N = this.resolution;
    const R = this.range;
    const step = (2 * R) / N;
    const zmin = { v: Infinity }, zmax = { v: -Infinity };
    const pts = [];
    for (let i = 0; i <= N; i++) {
      const row = [];
      const x = -R + i * step;
      for (let j = 0; j <= N; j++) {
        const y = -R + j * step;
        let z = s.compiled.eval(Object.assign({ x, y }, s.params));
        if (!isFinite(z)) z = 0;
        z = Math.max(-R * 1.5, Math.min(R * 1.5, z));
        if (z < zmin.v) zmin.v = z;
        if (z > zmax.v) zmax.v = z;
        row.push({ x, y, z });
      }
      pts.push(row);
    }
    const zSpan = Math.max(1e-6, zmax.v - zmin.v);

    const quads = [];
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        const p00 = pts[i][j], p10 = pts[i + 1][j], p11 = pts[i + 1][j + 1], p01 = pts[i][j + 1];
        const proj = [p00, p10, p11, p01].map((p) => this._project(p.x, p.y, p.z));
        const avgDepth = (proj[0].depth + proj[1].depth + proj[2].depth + proj[3].depth) / 4;
        const avgZ = (p00.z + p10.z + p11.z + p01.z) / 4;
        // simple normal-based shading
        const ux = p10.x - p00.x, uy = p10.y - p00.y, uz = p10.z - p00.z;
        const vx = p01.x - p00.x, vy = p01.y - p00.y, vz = p01.z - p00.z;
        const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
        const nlen = Math.hypot(nx, ny, nz) || 1;
        const light = Math.abs(nz / nlen) * 0.6 + 0.4;
        quads.push({ proj, avgDepth, t: (avgZ - zmin.v) / zSpan, light });
      }
    }
    quads.sort((a, b) => b.avgDepth - a.avgDepth);

    for (const q of quads) {
      const [r, g, b] = this._heatColor(q.t);
      const L = q.light;
      ctx.fillStyle = `rgb(${Math.round(r * L)},${Math.round(g * L)},${Math.round(b * L)})`;
      ctx.beginPath();
      ctx.moveTo(q.proj[0].x, q.proj[0].y);
      ctx.lineTo(q.proj[1].x, q.proj[1].y);
      ctx.lineTo(q.proj[2].x, q.proj[2].y);
      ctx.lineTo(q.proj[3].x, q.proj[3].y);
      ctx.closePath();
      if (!this.wireframe) ctx.fill();
      ctx.strokeStyle = this.wireframe ? s.color : 'rgba(15,23,42,0.15)';
      ctx.lineWidth = this.wireframe ? 1 : 0.5;
      ctx.stroke();
    }
  }

  _attachEvents() {
    const el = this.canvas;
    el.style.touchAction = 'none';
    const pointers = new Map();
    let pinchStartDist = null, pinchStartZoom = null;

    el.addEventListener('pointerdown', (e) => {
      el.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
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
          this.render();
        }
        return;
      }
      const dx = cur.x - prev.x, dy = cur.y - prev.y;
      this.yaw += dx * 0.008;
      this.pitch = Math.max(-1.4, Math.min(1.4, this.pitch - dy * 0.008));
      this.render();
    });
    const release = (e) => { pointers.delete(e.pointerId); if (pointers.size < 2) pinchStartDist = null; };
    el.addEventListener('pointerup', release);
    el.addEventListener('pointercancel', release);

    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.zoom = Math.max(0.2, Math.min(4, this.zoom * (e.deltaY > 0 ? 0.9 : 1.1)));
      this.render();
    }, { passive: false });
  }
}
