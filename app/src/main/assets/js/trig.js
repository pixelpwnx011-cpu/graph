/* Trigonometry tool: draggable unit circle synced with a live sin/cos/tan graph. */
const TRIG_RECIPROCAL = { sin: 'csc', cos: 'sec', tan: 'cot', cot: 'tan', sec: 'cos', csc: 'sin' };

// Exact (unsigned) values at the standard reference angles taught in every trig
// class - used to show "\u221A3/2" instead of a decimal like 0.866 when the
// current angle lands on (or very near) one of these.
const TRIG_EXACT_BASE = {
  0: { sin: '0', cos: '1', tan: '0', cot: 'undefined', sec: '1', csc: 'undefined' },
  30: { sin: '1/2', cos: '\u221A3/2', tan: '\u221A3/3', cot: '\u221A3', sec: '2\u221A3/3', csc: '2' },
  45: { sin: '\u221A2/2', cos: '\u221A2/2', tan: '1', cot: '1', sec: '\u221A2', csc: '\u221A2' },
  60: { sin: '\u221A3/2', cos: '1/2', tan: '\u221A3', cot: '\u221A3/3', sec: '2', csc: '2\u221A3/3' },
  90: { sin: '1', cos: '0', tan: 'undefined', cot: '0', sec: 'undefined', csc: '1' }
};
const TRIG_EXACT_SIGNS = {
  1: { sin: 1, cos: 1, tan: 1, cot: 1, sec: 1, csc: 1 },
  2: { sin: 1, cos: -1, tan: -1, cot: -1, sec: -1, csc: 1 },
  3: { sin: -1, cos: -1, tan: 1, cot: 1, sec: -1, csc: -1 },
  4: { sin: -1, cos: 1, tan: -1, cot: -1, sec: 1, csc: -1 }
};

// Returns an exact-form string (e.g. "\u221A3/2", "-1/2") for the given trig
// function at angleDeg, or null if angleDeg isn't close to a standard
// reference angle (0/30/45/60/90 and their reflections across all 4 quadrants).
function exactTrigLabel(angleDeg, fnKey) {
  const a = ((angleDeg % 360) + 360) % 360;
  let ref, quadrant;
  if (a <= 90) { ref = a; quadrant = 1; }
  else if (a <= 180) { ref = 180 - a; quadrant = 2; }
  else if (a <= 270) { ref = a - 180; quadrant = 3; }
  else { ref = 360 - a; quadrant = 4; }

  let matched = null;
  for (const k of [0, 30, 45, 60, 90]) { if (Math.abs(ref - k) < 0.4) { matched = k; break; } }
  if (matched === null) return null;

  const base = TRIG_EXACT_BASE[matched][fnKey];
  if (base === 'undefined' || base === '0') return base;
  const sign = TRIG_EXACT_SIGNS[quadrant][fnKey];
  return (sign < 0 ? '-' : '') + base;
}

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

  // All six trig ratios for the current angle (used by the side panel).
  allValues() {
    const a = this.angle;
    const sin = Math.sin(a), cos = Math.cos(a);
    return {
      sin, cos,
      tan: Math.abs(cos) < 1e-9 ? NaN : Math.tan(a),
      cot: Math.abs(sin) < 1e-9 ? NaN : 1 / Math.tan(a),
      sec: Math.abs(cos) < 1e-9 ? NaN : 1 / cos,
      csc: Math.abs(sin) < 1e-9 ? NaN : 1 / sin
    };
  }
}

class TrigGrapher {
  constructor(canvas) {
    this.plane = new GraphPlane(canvas);
    this.plane.resetView(0, 0, 2.2);
    this.fn = 'sin';
    this.a = 1; this.b = 1; this.c = 0; // a*fn(b*x + c)
    this.showReciprocal = false; // also overlay the reciprocal function (e.g. sin & csc together)
    this.angleMarker = null; // radians, or null
    this.plane.onDraw = (p) => this._draw(p);
  }

  setParams(fn, a, b, c) { this.fn = fn; this.a = a; this.b = b; this.c = c; this.plane.render(); }
  setShowReciprocal(v) { this.showReciprocal = v; this.plane.render(); }
  setMarker(angle) { this.angleMarker = angle; this.plane.render(); }

  static evalFn(name, v) {
    switch (name) {
      case 'sin': return Math.sin(v);
      case 'cos': return Math.cos(v);
      case 'tan': return Math.tan(v);
      case 'cot': return 1 / Math.tan(v);
      case 'sec': return 1 / Math.cos(v);
      case 'csc': return 1 / Math.sin(v);
      default: return NaN;
    }
  }

  _f(x, fnName) {
    const v = this.b * x + this.c;
    return this.a * TrigGrapher.evalFn(fnName || this.fn, v);
  }

  _plotCurve(plane, fnName, color, width) {
    const ctx = plane.ctx;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    let started = false;
    for (let px = 0; px <= plane.width; px++) {
      const wx = plane.screenToWorld(px, 0).x;
      const wy = this._f(wx, fnName);
      if (!isFinite(wy) || Math.abs(wy) > 1e4) { started = false; continue; }
      const s = plane.worldToScreen(wx, wy);
      if (!started) { ctx.moveTo(s.x, s.y); started = true; } else ctx.lineTo(s.x, s.y);
    }
    ctx.stroke();
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

    if (this.showReciprocal) {
      this._plotCurve(plane, TRIG_RECIPROCAL[this.fn], '#94a3b8', 1.5);
    }
    this._plotCurve(plane, this.fn, '#e63946', 2.5);

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
