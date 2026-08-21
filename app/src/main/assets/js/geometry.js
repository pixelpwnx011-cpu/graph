/* Coordinate Geometry tool: tap to place points, see distances, midpoint,
 * slope, line equation, and polygon perimeter/area — with distance from
 * the origin always shown for every point.
 */
class GeometryTool {
  constructor(canvas, onChange) {
    this.plane = new GraphPlane(canvas);
    this.points = []; // {x, y}
    this.dragIdx = -1;
    this.closed = false;      // true once the shape has been closed into a polygon
    this._downPt = null;      // pointerdown screen position, to distinguish a tap from a drag
    this._downOnFirst = false;
    this.snapEnabled = false; // when on, points snap to the nearest grid scale marking
    this.onChange = onChange || function () {};

    this.plane.onDraw = (p) => this._draw(p);
    this.plane.onPointerDown = (e, p) => this._pointerDown(e, p);
    this.plane.onPointerMove = (e, p, dx, dy) => this._pointerMove(e, p, dx, dy);
    this.plane.onPointerUp = (e) => this._pointerUp(e);
  }

  static label(i) {
    let s = '';
    i = i + 1;
    while (i > 0) { const r = (i - 1) % 26; s = String.fromCharCode(65 + r) + s; i = Math.floor((i - 1) / 26); }
    return s;
  }

  // When snapping is on, rounds to the nearest current grid line (the same
  // spacing shown on the axes); otherwise just rounds to 2 decimal places.
  _snap(x, y) {
    if (!this.snapEnabled) return { x: (Math.round(x * 100) / 100) || 0, y: (Math.round(y * 100) / 100) || 0 };
    const step = this.plane.getGridStep();
    return { x: (Math.round(x / step) * step) || 0, y: (Math.round(y / step) * step) || 0 };
  }

  setSnapEnabled(on) {
    this.snapEnabled = on;
    if (on) {
      // re-snap every existing point immediately so turning the toggle on
      // has an obvious, immediate effect instead of only affecting new points
      this.points = this.points.map((p) => this._snap(p.x, p.y));
      this.plane.render();
      this.onChange(this.points);
    }
  }

  addPoint(x, y) {
    this.points.push(this._snap(x, y));
    this.plane.render();
    this.onChange(this.points);
  }
  // Directly set/edit a point's coordinates (used by the "type coordinates" table).
  setPoint(i, x, y) {
    if (i < 0 || i >= this.points.length || !isFinite(x) || !isFinite(y)) return;
    this.points[i] = this._snap(x, y);
    this.plane.render();
    this.onChange(this.points);
  }
  removePoint(i) {
    this.points.splice(i, 1);
    if (this.points.length < 3) this.closed = false;
    this.plane.render();
    this.onChange(this.points);
  }
  undo() { this.points.pop(); if (this.points.length < 3) this.closed = false; this.plane.render(); this.onChange(this.points); }
  clear() { this.points = []; this.closed = false; this.plane.render(); this.onChange(this.points); }
  toggleClosed() {
    if (this.points.length < 3) return;
    this.closed = !this.closed;
    this.plane.render();
    this.onChange(this.points);
  }

  _pointerDown(e, plane) {
    const rect = plane.canvas.getBoundingClientRect();
    const px = e.clientX - rect.left, py = e.clientY - rect.top;
    this._downPt = { x: e.clientX, y: e.clientY };
    this._downOnFirst = false;
    for (let i = 0; i < this.points.length; i++) {
      const s = plane.worldToScreen(this.points[i].x, this.points[i].y);
      if (Math.hypot(s.x - px, s.y - py) < 18) {
        this.dragIdx = i;
        if (i === 0 && this.points.length >= 3) this._downOnFirst = true;
        return;
      }
    }
    const world = plane.screenToWorld(px, py);
    this.addPoint(world.x, world.y);
  }

  _pointerMove(e, plane, dx, dy) {
    if (this.dragIdx >= 0) {
      const rect = plane.canvas.getBoundingClientRect();
      const px = e.clientX - rect.left, py = e.clientY - rect.top;
      const world = plane.screenToWorld(px, py);
      this.points[this.dragIdx] = this._snap(world.x, world.y);
      plane.render();
      this.onChange(this.points);
      return;
    }
    plane.cx -= dx / plane.scale;
    plane.cy += dy / plane.scale;
    plane.render();
  }

  _pointerUp(e) {
    // A short tap (barely any movement) landing back on the first point,
    // once at least 3 points already exist, closes the shape into a polygon
    // instead of dragging point A. A real drag still moves it as normal.
    if (this._downOnFirst && this._downPt && e) {
      const moved = Math.hypot(e.clientX - this._downPt.x, e.clientY - this._downPt.y);
      if (moved < 6) {
        this.closed = true;
        this.plane.render();
        this.onChange(this.points);
      }
    }
    this.dragIdx = -1;
    this._downOnFirst = false;
    this._downPt = null;
  }

  _draw(plane) {
    const ctx = plane.ctx;
    const showLabels = window.APP_STATE && window.APP_STATE.showLabels;

    // connecting lines
    if (this.points.length > 1) {
      ctx.strokeStyle = this.closed ? '#1d4ed8' : '#2563eb';
      ctx.lineWidth = this.closed ? 2.5 : 2;
      ctx.beginPath();
      this.points.forEach((p, i) => {
        const s = plane.worldToScreen(p.x, p.y);
        if (i === 0) ctx.moveTo(s.x, s.y); else ctx.lineTo(s.x, s.y);
      });
      if (this.closed && this.points.length >= 3) {
        const s0 = plane.worldToScreen(this.points[0].x, this.points[0].y);
        ctx.lineTo(s0.x, s0.y);
      }
      ctx.stroke();
      if (this.closed && this.points.length >= 3) {
        ctx.fillStyle = 'rgba(37,99,235,0.12)';
        ctx.fill();
      }
    }

    // lines from origin (distance-from-origin visualisation)
    if (showLabels) {
      ctx.strokeStyle = 'rgba(220,38,38,0.35)';
      ctx.setLineDash([5, 4]);
      ctx.lineWidth = 1.5;
      const o = plane.worldToScreen(0, 0);
      this.points.forEach((p) => {
        const s = plane.worldToScreen(p.x, p.y);
        ctx.beginPath(); ctx.moveTo(o.x, o.y); ctx.lineTo(s.x, s.y); ctx.stroke();
      });
      ctx.setLineDash([]);
    }

    // hint ring around point A once it can be tapped to close the polygon
    if (!this.closed && this.points.length >= 3) {
      const s0 = plane.worldToScreen(this.points[0].x, this.points[0].y);
      ctx.beginPath();
      ctx.arc(s0.x, s0.y, 13, 0, Math.PI * 2);
      ctx.strokeStyle = '#f59e0b';
      ctx.setLineDash([3, 3]);
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // points
    this.points.forEach((p, i) => {
      const s = plane.worldToScreen(p.x, p.y);
      ctx.beginPath();
      ctx.arc(s.x, s.y, 7, 0, Math.PI * 2);
      ctx.fillStyle = (i === 0 && this.closed) ? '#059669' : '#1d4ed8';
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 13px sans-serif';
      const lbl = GeometryTool.label(i);
      ctx.fillText(showLabels ? `${lbl}(${p.x}, ${p.y})` : lbl, s.x + 10, s.y - 10);
    });
  }

  static dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
  static distFromOrigin(a) { return Math.hypot(a.x, a.y); }
  static midpoint(a, b) { return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; }
  static slope(a, b) { return Math.abs(b.x - a.x) < 1e-9 ? null : (b.y - a.y) / (b.x - a.x); }

  static lineEquation(a, b) {
    const m = GeometryTool.slope(a, b);
    if (m === null) return `x = ${a.x}`;
    const c = a.y - m * a.x;
    const mr = Math.round(m * 1000) / 1000, cr = Math.round(c * 1000) / 1000;
    return `y = ${mr}x ${cr >= 0 ? '+ ' + cr : '- ' + Math.abs(cr)}`;
  }

  static polygonPerimeter(pts) {
    let per = 0;
    for (let i = 0; i < pts.length; i++) per += GeometryTool.dist(pts[i], pts[(i + 1) % pts.length]);
    return per;
  }
  static polygonArea(pts) {
    let area = 0;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      area += a.x * b.y - b.x * a.y;
    }
    return Math.abs(area) / 2;
  }
}
