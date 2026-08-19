/* Trigonometry tool: draggable unit circle synced with a live sin/cos/tan graph. */
class UnitCircle {
  constructor(canvas, onChange) {
    this.plane = new GraphPlane(canvas, { minSpan: 1.3, maxSpan: 1.3 });
    this.plane.resetView(0, 0, 1.35);
    this.angle = Math.PI / 4; // radians
    this.dragging = false;
    this.onChange = onChange || function () {};
    this.plane.onDraw = (p) => this._draw(p);
    this.plane.onPointerDown = (e, p) => this._pointerDown(e, p);
    this.plane.onPointerMove = (e, p) => this._pointerMove(e, p);
    this.plane.onPointerUp = () => { this.dragging = false; };
  }

  setAngle(rad) { this.angle = rad; this.plane.render(); this.onChange(this.angle); }

  _pointerDown(e, plane) {
    const rect = plane.canvas.getBoundingClientRect();
    const world = plane.screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
    this.dragging = true;
    this.setAngle(Math.atan2(world.y, world.x));
  }
  _pointerMove(e, plane) {
    if (!this.dragging) return;
    const rect = plane.canvas.getBoundingClientRect();
    const world = plane.screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
    this.setAngle(Math.atan2(world.y, world.x));
  }

  _draw(plane) {
    const ctx = plane.ctx;
    const showLabels = window.APP_STATE && window.APP_STATE.showLabels;

    // unit circle
    ctx.strokeStyle = '#1d4ed8';
    ctx.lineWidth = 2;
    ctx.beginPath();
    const c = plane.worldToScreen(0, 0);
    const r = plane.scale * 1;
    ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
    ctx.stroke();

    const px = Math.cos(this.angle), py = Math.sin(this.angle);
    const P = plane.worldToScreen(px, py);
    const Ox = plane.worldToScreen(px, 0);
    const Oy = plane.worldToScreen(0, py);

    // cos / sin projections
    ctx.setLineDash([5, 4]);
    ctx.strokeStyle = '#059669';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(P.x, P.y); ctx.lineTo(Ox.x, Ox.y); ctx.stroke();
    ctx.strokeStyle = '#db2777';
    ctx.beginPath(); ctx.moveTo(P.x, P.y); ctx.lineTo(Oy.x, Oy.y); ctx.stroke();
    ctx.setLineDash([]);

    // radius line (angle)
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.lineTo(P.x, P.y); ctx.stroke();

    // arc for the angle itself
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(c.x, c.y, r * 0.18, 0, -this.angle, this.angle > 0);
    ctx.stroke();

    // handle
    ctx.beginPath();
    ctx.arc(P.x, P.y, 8, 0, Math.PI * 2);
    ctx.fillStyle = '#f59e0b';
    ctx.fill();
    ctx.strokeStyle = '#78350f';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    if (showLabels) {
      ctx.fillStyle = '#059669';
      ctx.font = 'bold 12px sans-serif';
      ctx.fillText('cos \u03B8 = ' + px.toFixed(2), Ox.x - 20, Ox.y + (py >= 0 ? 16 : -8));
      ctx.fillStyle = '#db2777';
      ctx.fillText('sin \u03B8 = ' + py.toFixed(2), Oy.x + (px >= 0 ? 6 : -78), Oy.y - 6);
    }
  }
}

class TrigGrapher {
  constructor(canvas) {
    this.plane = new GraphPlane(canvas);
    this.plane.resetView(0, 0, 2.2);
    this.fn = 'sin';
    this.a = 1; this.b = 1; this.c = 0; // a*fn(b*x + c)
    this.angleMarker = null; // radians, or null
    this.plane.onDraw = (p) => this._draw(p);
  }

  setParams(fn, a, b, c) { this.fn = fn; this.a = a; this.b = b; this.c = c; this.plane.render(); }
  setMarker(angle) { this.angleMarker = angle; this.plane.render(); }

  _f(x) {
    const v = this.b * x + this.c;
    const fn = { sin: Math.sin, cos: Math.cos, tan: Math.tan }[this.fn];
    return this.a * fn(v);
  }

  _draw(plane) {
    const ctx = plane.ctx;
    // pi-scaled x tick labels
    ctx.fillStyle = '#5b6472';
    ctx.font = '11px sans-serif';
    const left = plane.cx - plane.width / (2 * plane.scale);
    const right = plane.cx + plane.width / (2 * plane.scale);
    for (let k = Math.ceil(left / (Math.PI / 2)); k * (Math.PI / 2) <= right; k++) {
      const x = k * (Math.PI / 2);
      if (Math.abs(k) % 2 !== 0 || k === 0) {
        const s = plane.worldToScreen(x, 0);
        const frac = k === 0 ? '0' : (k % 4 === 0 ? `${k / 2}\u03C0` : `${k}\u03C0/2`);
        ctx.fillText(frac, s.x - 8, plane.height / 2 + 16);
      }
    }

    ctx.strokeStyle = '#e63946';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    let started = false;
    for (let px = 0; px <= plane.width; px++) {
      const wx = plane.screenToWorld(px, 0).x;
      const wy = this._f(wx);
      if (!isFinite(wy) || Math.abs(wy) > 1e4) { started = false; continue; }
      const s = plane.worldToScreen(wx, wy);
      if (!started) { ctx.moveTo(s.x, s.y); started = true; } else ctx.lineTo(s.x, s.y);
    }
    ctx.stroke();

    if (this.angleMarker !== null) {
      const wy = this._f(this.angleMarker);
      if (isFinite(wy)) {
        const s = plane.worldToScreen(this.angleMarker, wy);
        ctx.beginPath();
        ctx.arc(s.x, s.y, 7, 0, Math.PI * 2);
        ctx.fillStyle = '#0f172a';
        ctx.fill();
      }
    }
  }
}
