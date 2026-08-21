window.APP_STATE = { showLabels: true };

const FN_PALETTE = [
  'sin(', 'cos(', 'tan(', 'cot(', 'sec(', 'csc(',
  'sqrt(', 'log(', 'ln(', 'abs(', 'mod(',
  '|', '{', '}', '(', ')', '⟨', '⟩',
  '<', '>', '≤', '≥', '≠',
  '^', 'π', 'θ', 'e', '∞'
];

let activeInput = null;
function trackFocus(el) { el.addEventListener('focus', () => { activeInput = el; }); }
function insertAtCursor(text) {
  const input = activeInput;
  if (!input) return;
  const start = input.selectionStart != null ? input.selectionStart : input.value.length;
  const end = input.selectionEnd != null ? input.selectionEnd : input.value.length;
  input.value = input.value.slice(0, start) + text + input.value.slice(end);
  const pos = start + text.length;
  input.focus();
  if (input.setSelectionRange) input.setSelectionRange(pos, pos);
  input.dispatchEvent(new Event('input'));
}
function buildPalette(container) {
  container.innerHTML = '';
  FN_PALETTE.forEach((tok) => {
    const b = document.createElement('button');
    b.textContent = tok;
    b.title = tok;
    b.addEventListener('click', () => insertAtCursor(tok));
    container.appendChild(b);
  });
  // degree symbol needs a small macro rather than a single glyph the parser understands
  const deg = document.createElement('button');
  deg.textContent = '°';
  deg.title = 'degrees (inserts *(pi/180) - put a number before it, e.g. 45°)';
  deg.addEventListener('click', () => insertAtCursor('*(pi/180)'));
  container.appendChild(deg);
}

/* ---------------- Tabs ---------------- */
function goToTab(tab) {
  document.querySelectorAll('.nav-btn').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('.tab').forEach((s) => s.classList.toggle('active', s.id === 'tab-' + tab));
  // force a resize even on repeat visits since layout may have changed while hidden
  requestAnimationFrame(() => {
    if (tab === 'graph') {
      grapher2d.plane._resize();
      grapher3d._resize();
      if (graphMode === '3d') { grapher3d._resizeGizmo(); replayReveal3D(); } else { replayReveal2D(); }
      grapher3d.render();
    }
    if (tab === 'geom') geomTool.plane._resize();
    if (tab === 'trig') { unitCircle.plane._resize(); trigGrapher.plane._resize(); }
  });
}
document.querySelectorAll('.nav-btn').forEach((b) => b.addEventListener('click', () => goToTab(b.dataset.tab)));
document.querySelectorAll('.tool-card').forEach((c) => c.addEventListener('click', () => goToTab(c.dataset.goto)));
window.__handleBack = function () {
  const active = document.querySelector('.nav-btn.active');
  if (active && active.dataset.tab !== 'home') goToTab('home');
};

document.getElementById('labelsToggle').addEventListener('change', (e) => {
  APP_STATE.showLabels = e.target.checked;
  grapher2d.plane.render();
  geomTool.plane.render();
  unitCircle.plane.render();
});

/* ---------------- 2D / 3D mode toggle (merged Graphing tab; opens in 3D by default) ---------------- */
let graphMode = '3d';
function setGraphMode(mode) {
  graphMode = mode;
  document.getElementById('mode2dBtn').classList.toggle('active', mode === '2d');
  document.getElementById('mode3dBtn').classList.toggle('active', mode === '3d');
  document.getElementById('panel2d').classList.toggle('hidden', mode !== '2d');
  document.getElementById('panel3d').classList.toggle('hidden', mode !== '3d');
  document.getElementById('canvas2d').classList.toggle('hidden', mode !== '2d');
  document.getElementById('canvas3d').classList.toggle('hidden', mode !== '3d');
  document.getElementById('gizmoCanvas').classList.toggle('hidden', mode !== '3d');
  requestAnimationFrame(() => {
    if (mode === '2d') { grapher2d.plane._resize(); replayReveal2D(); }
    else { grapher3d._resize(); grapher3d._resizeGizmo(); replayReveal3D(); grapher3d.render(); }
  });
}
document.getElementById('mode2dBtn').addEventListener('click', () => setGraphMode('2d'));
document.getElementById('mode3dBtn').addEventListener('click', () => setGraphMode('3d'));

/* ================= 2D GRAPHING ================= */
const grapher2d = new Grapher2D(document.getElementById('canvas2d'));
buildPalette(document.getElementById('fnPalette2d'));

function renderEqList() {
  const list = document.getElementById('eqList');
  list.innerHTML = '';
  grapher2d.equations.forEach((eq) => {
    const row = document.createElement('div');
    row.className = 'eq-row';

    const top = document.createElement('div');
    top.className = 'eq-row-top';

    const swatch = document.createElement('div');
    swatch.className = 'eq-color';
    swatch.style.background = eq.color;

    const input = document.createElement('input');
    input.className = 'eq-input';
    input.placeholder = 'y=sin(x)  or  x^2+y^2=25  or  x=cos(t),y=sin(t)';
    input.value = eq.raw || '';
    trackFocus(input);
    input.addEventListener('input', () => {
      grapher2d.setEquationText(eq, input.value);
      input.classList.toggle('error', !!eq.error);
      errBox.textContent = eq.error || '';
      badge.textContent = Grapher2D.typeLabel(eq);
      extendBtn.style.display = (eq.type === 'y' || eq.type === 'x' || eq.type === 'rel') ? '' : 'none';
      renderParams();
      grapher2d.plane.render();
    });

    const visBtn = document.createElement('input');
    visBtn.type = 'checkbox'; visBtn.className = 'eq-visible'; visBtn.checked = eq.visible;
    visBtn.addEventListener('change', () => { eq.visible = visBtn.checked; grapher2d.plane.render(); });

    const delBtn = document.createElement('button');
    delBtn.className = 'eq-btn'; delBtn.textContent = '🗑';
    delBtn.addEventListener('click', () => { grapher2d.removeEquation(eq.id); renderEqList(); });

    top.appendChild(swatch);
    top.appendChild(input);
    top.appendChild(visBtn);
    top.appendChild(delBtn);
    row.appendChild(top);

    const metaRow = document.createElement('div');
    metaRow.className = 'eq-meta-row';
    const badge = document.createElement('span');
    badge.className = 'eq-badge';
    badge.textContent = Grapher2D.typeLabel(eq);
    const extendBtn = document.createElement('button');
    extendBtn.className = 'eq-extend-btn';
    extendBtn.textContent = '\u2B06 Extend to 3D';
    extendBtn.style.display = (eq.type === 'y' || eq.type === 'x' || eq.type === 'rel') ? '' : 'none';
    extendBtn.addEventListener('click', () => extendTo3D(eq));
    metaRow.appendChild(badge);
    metaRow.appendChild(extendBtn);
    row.appendChild(metaRow);

    const errBox = document.createElement('div');
    errBox.className = 'eq-err';
    errBox.textContent = eq.error || '';
    row.appendChild(errBox);

    const paramsBox = document.createElement('div');
    paramsBox.className = 'eq-params';
    row.appendChild(paramsBox);

    function renderParams() {
      paramsBox.innerHTML = '';
      Object.keys(eq.params).forEach((p) => {
        const wrap = document.createElement('div'); wrap.className = 'eq-param';
        const lbl = document.createElement('span'); lbl.textContent = p + '=' + Math.round(eq.params[p] * 100) / 100;
        const slider = document.createElement('input');
        slider.type = 'range'; slider.min = -10; slider.max = 10; slider.step = 0.1; slider.value = eq.params[p];
        slider.addEventListener('input', () => { eq.params[p] = parseFloat(slider.value); lbl.textContent = p + '=' + Math.round(eq.params[p] * 100) / 100; grapher2d.plane.render(); });
        wrap.appendChild(lbl); wrap.appendChild(slider);
        paramsBox.appendChild(wrap);
      });
    }
    renderParams();

    list.appendChild(row);
  });
}

// Lifts a 2D relation into the 3D grapher as a raised ridge (equality curves)
// or a flat plateau region (inequalities), reusing the same {condition} bracket
// syntax the 3D surface parser already understands.
function extendTo3D(eq) {
  let expr = null;
  const HEIGHT = 3, TOL = 0.25;
  if (eq.type === 'rel') {
    expr = (eq.op === '=')
      ? `${HEIGHT}*{abs((${eq.lhsExpr}) - (${eq.rhsExpr})) < ${TOL}}`
      : `${HEIGHT}*{(${eq.lhsExpr}) ${eq.op} (${eq.rhsExpr})}`;
  } else if (eq.type === 'y' && eq.expr) {
    expr = `${HEIGHT}*{abs(y - (${eq.expr})) < ${TOL}}`;
  } else if (eq.type === 'x' && eq.expr) {
    expr = `${HEIGHT}*{abs(x - (${eq.expr})) < ${TOL}}`;
  }
  if (!expr) return;
  grapher3d.addSurface(expr, eq.color);
  renderSurfList();
  goToTab('graph');
  setGraphMode('3d');
}

document.getElementById('addEqBtn').addEventListener('click', () => {
  grapher2d.addEquation('');
  renderEqList();
  grapher2d.plane.render();
});
document.getElementById('resetView2d').addEventListener('click', () => grapher2d.plane.resetView());

/* ---- Draw / enter points -> equation ---- */
function renderFitPointsTable() {
  const box = document.getElementById('fitPointsTable');
  if (!grapher2d.fitPoints.length) { box.innerHTML = '<p class="hint">No points yet.</p>'; return; }
  let html = '<table>';
  grapher2d.fitPoints.forEach((p, i) => {
    html += `<tr><td>${GeometryTool.label(i)}</td><td>(${p.x}, ${p.y})</td><td data-i="${i}">✕</td></tr>`;
  });
  html += '</table>';
  box.innerHTML = html;
  box.querySelectorAll('td[data-i]').forEach((td) => td.addEventListener('click', () => {
    grapher2d.fitPoints.splice(parseInt(td.dataset.i, 10), 1);
    grapher2d.plane.render();
    renderFitPointsTable();
  }));
}
grapher2d.onFitPointsChanged = renderFitPointsTable;

const placeBtn = document.getElementById('togglePlacePoints');
placeBtn.addEventListener('click', () => {
  grapher2d.drawPointsMode = !grapher2d.drawPointsMode;
  placeBtn.textContent = '📍 Place Points: ' + (grapher2d.drawPointsMode ? 'On' : 'Off');
  placeBtn.classList.toggle('btn-primary', grapher2d.drawPointsMode);
});
document.getElementById('clearFitPoints').addEventListener('click', () => { grapher2d.clearFitPoints(); renderFitPointsTable(); document.getElementById('fitResult').innerHTML = ''; });
document.getElementById('addFitPointBtn').addEventListener('click', () => {
  const x = parseFloat(document.getElementById('fitX').value);
  const y = parseFloat(document.getElementById('fitY').value);
  if (isFinite(x) && isFinite(y)) {
    grapher2d.fitPoints.push({ x, y });
    grapher2d.plane.render();
    renderFitPointsTable();
    document.getElementById('fitX').value = ''; document.getElementById('fitY').value = '';
  }
});
document.getElementById('generateFitBtn').addEventListener('click', () => {
  const type = document.getElementById('fitType').value;
  const resultBox = document.getElementById('fitResult');
  try {
    const result = CurveFit.fit(grapher2d.fitPoints, type);
    const eq = grapher2d.addEquation(result.expr);
    renderEqList();
    grapher2d.plane.render();
    resultBox.innerHTML = `<b>y = </b>${result.expr}<br/>R\u00B2 = ${(Math.round(result.r2 * 1000) / 1000)}`;
  } catch (err) {
    resultBox.innerHTML = `<span style="color:#dc2626">${err.message}</span>`;
  }
});

/* ================= 3D GRAPHING ================= */
const grapher3d = new Grapher3D(document.getElementById('canvas3d'));
grapher3d.attachGizmo(document.getElementById('gizmoCanvas'));

// Replay the "draw the graph in" formation animation whenever the relevant
// mode/tab actually becomes visible, rather than letting it finish silently
// in the background before the person ever looks at it.
function replayReveal2D() { grapher2d.equations.forEach((eq) => { if (!eq.error) grapher2d._startReveal(eq); }); }
function replayReveal3D() { grapher3d.surfaces.forEach((s) => { if (!s.error) grapher3d._startReveal(s); }); }
buildPalette(document.getElementById('fnPalette3d'));

function renderSurfList() {
  const list = document.getElementById('surfList');
  list.innerHTML = '';
  grapher3d.surfaces.forEach((s) => {
    const row = document.createElement('div');
    row.className = 'eq-row';
    const top = document.createElement('div');
    top.className = 'eq-row-top';

    const swatch = document.createElement('div'); swatch.className = 'eq-color'; swatch.style.background = s.color;
    const label = document.createElement('span'); label.textContent = 'z ='; label.style.fontSize = '13px'; label.style.color = '#475569';

    const input = document.createElement('input');
    input.className = 'eq-input';
    input.placeholder = 'f(x, y) e.g. sin(sqrt(x^2+y^2))';
    input.value = s.expr;
    trackFocus(input);
    input.addEventListener('input', () => {
      s.expr = input.value; grapher3d.recompile(s);
      input.classList.toggle('error', !!s.error);
      errBox.textContent = s.error || '';
      renderParams();
      grapher3d.render();
    });

    const visBtn = document.createElement('input');
    visBtn.type = 'checkbox'; visBtn.className = 'eq-visible'; visBtn.checked = s.visible;
    visBtn.addEventListener('change', () => { s.visible = visBtn.checked; grapher3d.render(); });

    const delBtn = document.createElement('button');
    delBtn.className = 'eq-btn'; delBtn.textContent = '🗑';
    delBtn.addEventListener('click', () => { grapher3d.removeSurface(s.id); renderSurfList(); });

    top.appendChild(swatch); top.appendChild(label); top.appendChild(input); top.appendChild(visBtn); top.appendChild(delBtn);
    row.appendChild(top);

    const errBox = document.createElement('div'); errBox.className = 'eq-err'; errBox.textContent = s.error || '';
    row.appendChild(errBox);

    const paramsBox = document.createElement('div');
    paramsBox.className = 'eq-params';
    row.appendChild(paramsBox);
    function renderParams() {
      paramsBox.innerHTML = '';
      Object.keys(s.params).forEach((p) => {
        const wrap = document.createElement('div'); wrap.className = 'eq-param';
        const lbl = document.createElement('span'); lbl.textContent = p + '=' + Math.round(s.params[p] * 100) / 100;
        const slider = document.createElement('input');
        slider.type = 'range'; slider.min = -10; slider.max = 10; slider.step = 0.1; slider.value = s.params[p];
        slider.addEventListener('input', () => { s.params[p] = parseFloat(slider.value); lbl.textContent = p + '=' + Math.round(s.params[p] * 100) / 100; grapher3d.render(); });
        wrap.appendChild(lbl); wrap.appendChild(slider);
        paramsBox.appendChild(wrap);
      });
    }
    renderParams();

    list.appendChild(row);
  });
}
document.getElementById('addSurfBtn').addEventListener('click', () => { grapher3d.addSurface(''); renderSurfList(); });
document.getElementById('exampleSurfBtn').addEventListener('click', () => { insertButterflyExample(); });

// Generic parametric-curve list UI, shared by the Graphing tab's 3D panel and
// the Trigonometry tab's 3D panel - lets a person add, edit (make/change),
// recolour, show/hide (select), and remove x(t)/y(t)/z(t) curves.
function renderCurveList(grapher, listElId) {
  const list = document.getElementById(listElId);
  list.innerHTML = '';
  grapher.curves.forEach((c) => {
    const row = document.createElement('div');
    row.className = 'eq-row';

    const top = document.createElement('div');
    top.className = 'eq-row-top';
    const colorPicker = document.createElement('input');
    colorPicker.type = 'color'; colorPicker.className = 'eq-color-picker'; colorPicker.value = c.color;
    colorPicker.addEventListener('input', () => { c.color = colorPicker.value; grapher.render(); });
    const titleLbl = document.createElement('span'); titleLbl.textContent = 'Curve'; titleLbl.style.fontSize = '13px'; titleLbl.style.color = '#475569'; titleLbl.style.flex = '1';
    const visBtn = document.createElement('input');
    visBtn.type = 'checkbox'; visBtn.className = 'eq-visible'; visBtn.checked = c.visible;
    visBtn.addEventListener('change', () => { c.visible = visBtn.checked; grapher.render(); });
    const delBtn = document.createElement('button');
    delBtn.className = 'eq-btn'; delBtn.textContent = '🗑';
    delBtn.addEventListener('click', () => { grapher.removeCurve(c.id); renderCurveList(grapher, listElId); });
    top.appendChild(colorPicker); top.appendChild(titleLbl); top.appendChild(visBtn); top.appendChild(delBtn);
    row.appendChild(top);

    const errBox = document.createElement('div'); errBox.className = 'eq-err'; errBox.textContent = c.error || '';

    const xyz = document.createElement('div');
    xyz.className = 'curve-xyz-row';
    const makeAxisInput = (axisLabel, exprKey) => {
      const line = document.createElement('div'); line.className = 'curve-input-line';
      const lbl = document.createElement('span'); lbl.textContent = axisLabel + '=';
      const inp = document.createElement('input');
      inp.className = 'eq-input'; inp.value = c[exprKey]; inp.placeholder = axisLabel + '(t)';
      trackFocus(inp);
      inp.addEventListener('input', () => {
        c[exprKey] = inp.value;
        grapher.recompileCurve(c);
        inp.classList.toggle('error', !!c.error);
        errBox.textContent = c.error || '';
        grapher.render();
      });
      line.appendChild(lbl); line.appendChild(inp);
      return line;
    };
    xyz.appendChild(makeAxisInput('x', 'exprX'));
    xyz.appendChild(makeAxisInput('y', 'exprY'));
    xyz.appendChild(makeAxisInput('z', 'exprZ'));
    row.appendChild(xyz);

    const trange = document.createElement('div');
    trange.className = 'curve-trange-row';
    const tMinInp = document.createElement('input'); tMinInp.type = 'number'; tMinInp.step = 'any'; tMinInp.value = Math.round(c.tMin * 1000) / 1000;
    const tMaxInp = document.createElement('input'); tMaxInp.type = 'number'; tMaxInp.step = 'any'; tMaxInp.value = Math.round(c.tMax * 1000) / 1000;
    tMinInp.addEventListener('change', () => { c.tMin = parseFloat(tMinInp.value) || 0; grapher.render(); });
    tMaxInp.addEventListener('change', () => { c.tMax = parseFloat(tMaxInp.value) || 0; grapher.render(); });
    trange.appendChild(document.createTextNode('t:'));
    trange.appendChild(tMinInp);
    trange.appendChild(document.createTextNode('to'));
    trange.appendChild(tMaxInp);
    row.appendChild(trange);

    row.appendChild(errBox);
    list.appendChild(row);
  });
}
document.getElementById('addCurve3dBtn').addEventListener('click', () => {
  grapher3d.addCurve('cos(t)', 'sin(t)', '0', PALETTE[grapher3d.curves.length % PALETTE.length], 0, Math.PI * 2);
  renderCurveList(grapher3d, 'curveList3d');
});

// The classic Desmos-3D "butterfly", built from the polar rose curve
// r = (sin(2*theta))^3 + (cos(0.5*theta))^3, rendered as a 3D parametric curve
// x=r*cos(t), y=r*sin(t), z=0 so it can be freely rotated and inspected.
function insertButterflyExample() {
  grapher3d.surfaces = [];
  grapher3d.curves = [];
  const r = '((sin(2*t))^3 + (cos(0.5*t))^3)';
  grapher3d.addCurve(`${r}*cos(t)`, `${r}*sin(t)`, '0', '#dc2626', 0, Math.PI * 4);
  grapher3d.range = 2.5;
  renderSurfList();
  renderCurveList(grapher3d, 'curveList3d');
  grapher3d.render();
}
document.getElementById('resSlider').addEventListener('input', (e) => { grapher3d.resolution = parseInt(e.target.value, 10); grapher3d.render(); });
document.getElementById('wireframeToggle').addEventListener('change', (e) => { grapher3d.wireframe = e.target.checked; grapher3d.render(); });
document.getElementById('resetView3d').addEventListener('click', () => grapher3d.resetView());

/* ---- Animation clock (t) - drives sin(t)/cos(t) style time-based surfaces ---- */
grapher3d.onTimeChange = (t) => { document.getElementById('timeValueLabel').textContent = 't = ' + t.toFixed(2); };
document.getElementById('timeToggleBtn').addEventListener('click', () => {
  const btn = document.getElementById('timeToggleBtn');
  if (grapher3d.timeRunning) { grapher3d.stopTimeAnimation(); btn.textContent = '▶ Animate (t)'; }
  else { grapher3d.startTimeAnimation(); btn.textContent = '⏸ Pause (t)'; }
});
document.getElementById('timeResetBtn').addEventListener('click', () => grapher3d.resetTime());

/* ================= GEOMETRY ================= */
const geomTool = new GeometryTool(document.getElementById('canvasGeom'), onGeomChange);

function onGeomChange(points) {
  const table = document.getElementById('geomPointsTable');
  if (!points.length) { table.innerHTML = '<p class="hint">Tap the plane, or type coordinates above, to add a point.</p>'; }
  else {
    let html = '<table>';
    points.forEach((p, i) => {
      const d0 = GeometryTool.distFromOrigin(p).toFixed(2);
      html += `<tr>
        <td>${GeometryTool.label(i)}</td>
        <td><input type="number" step="any" class="pt-edit" data-i="${i}" data-axis="x" value="${p.x}" /></td>
        <td><input type="number" step="any" class="pt-edit" data-i="${i}" data-axis="y" value="${p.y}" /></td>
        <td title="distance from origin">O: ${d0}</td>
        <td data-del="${i}">✕</td>
      </tr>`;
    });
    html += '</table>';
    table.innerHTML = html;
    table.querySelectorAll('.pt-edit').forEach((inp) => inp.addEventListener('change', () => {
      const i = parseInt(inp.dataset.i, 10);
      const p = geomTool.points[i];
      const x = inp.dataset.axis === 'x' ? parseFloat(inp.value) : p.x;
      const y = inp.dataset.axis === 'y' ? parseFloat(inp.value) : p.y;
      geomTool.setPoint(i, x, y);
    }));
    table.querySelectorAll('[data-del]').forEach((td) => td.addEventListener('click', () => {
      geomTool.removePoint(parseInt(td.dataset.del, 10));
    }));
  }

  const closeBtn = document.getElementById('closePolygonBtn');
  closeBtn.disabled = points.length < 3;
  closeBtn.textContent = geomTool.closed ? '⬠ Open Polygon' : '⬠ Close Polygon';
  closeBtn.classList.toggle('btn-primary', geomTool.closed);

  const results = document.getElementById('geomResults');
  let html = '';
  if (points.length === 1) {
    html += `<b>Distance from origin:</b> ${GeometryTool.distFromOrigin(points[0]).toFixed(3)}`;
  } else if (points.length >= 2) {
    // distance from origin, for every point
    html += `<b>Distance from origin:</b><br/>`;
    points.forEach((p, i) => { html += `${GeometryTool.label(i)}: ${GeometryTool.distFromOrigin(p).toFixed(2)}&nbsp;&nbsp;`; });
    html += `<br/><br/><b>Distance between every pair of points:</b><br/>`;
    for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < points.length; j++) {
        html += `${GeometryTool.label(i)}\u2192${GeometryTool.label(j)}: ${GeometryTool.dist(points[i], points[j]).toFixed(3)}<br/>`;
      }
    }
    if (points.length === 2) {
      const [a, b] = points;
      const m = GeometryTool.midpoint(a, b);
      html += `<br/><b>Midpoint:</b> (${m.x.toFixed(2)}, ${m.y.toFixed(2)})<br/>`;
      const m2 = GeometryTool.slope(a, b);
      html += `<b>Slope:</b> ${m2 === null ? 'undefined (vertical)' : m2.toFixed(3)}<br/>`;
      html += `<b>Line equation:</b> ${GeometryTool.lineEquation(a, b)}`;
    } else {
      html += `<br/><b>Perimeter:</b> ${GeometryTool.polygonPerimeter(points).toFixed(3)}<br/>`;
      html += `<b>Area (shoelace):</b> ${GeometryTool.polygonArea(points).toFixed(3)}`;
    }
  } else {
    html = '<span style="color:#64748b">Add at least one point to see measurements.</span>';
  }
  results.innerHTML = html;
}
onGeomChange([]);
document.getElementById('undoPointBtn').addEventListener('click', () => geomTool.undo());
document.getElementById('clearPointsBtn').addEventListener('click', () => geomTool.clear());
document.getElementById('resetViewGeom').addEventListener('click', () => geomTool.plane.resetView());
document.getElementById('closePolygonBtn').addEventListener('click', () => geomTool.toggleClosed());
document.getElementById('snapToggle').addEventListener('change', (e) => geomTool.setSnapEnabled(e.target.checked));
document.getElementById('addGeomPointBtn').addEventListener('click', () => {
  const x = parseFloat(document.getElementById('geomX').value);
  const y = parseFloat(document.getElementById('geomY').value);
  if (isFinite(x) && isFinite(y)) {
    geomTool.addPoint(x, y);
    document.getElementById('geomX').value = '';
    document.getElementById('geomY').value = '';
  }
});

/* ================= TRIGONOMETRY ================= */
const unitCircle = new UnitCircle(document.getElementById('canvasUnit'), onAngleChange);
const trigGrapher = new TrigGrapher(document.getElementById('canvasTrigGraph'));
let useDegrees = false;

function onAngleChange(angleRad) {
  const deg = angleRad * 180 / Math.PI;
  const box = document.getElementById('trigValues');
  const angleTxt = useDegrees ? `${deg.toFixed(1)}\u00B0` : `${angleRad.toFixed(3)} rad`;
  const v = unitCircle.allValues();
  const fmt = (n) => isNaN(n) ? 'undefined' : n.toFixed(3);
  // show the exact radical/fraction form too whenever the angle lands on a
  // standard reference angle (0/30/45/60/90 and their reflections), e.g. "0.866 (√3/2)"
  const withExact = (fnKey, n) => {
    const ex = exactTrigLabel(deg, fnKey);
    if (ex === null || ex === 'undefined') return fmt(n);
    return `${fmt(n)} (${ex})`;
  };
  box.innerHTML =
    `<b>\u03B8 =</b> ${angleTxt}<br/>` +
    `<b>sin \u03B8 =</b> ${withExact('sin', v.sin)}<br/>` +
    `<b>cos \u03B8 =</b> ${withExact('cos', v.cos)}<br/>` +
    `<b>tan \u03B8 =</b> ${withExact('tan', v.tan)}<br/>` +
    `<b>cot \u03B8 =</b> ${withExact('cot', v.cot)}<br/>` +
    `<b>sec \u03B8 =</b> ${withExact('sec', v.sec)}<br/>` +
    `<b>csc \u03B8 =</b> ${withExact('csc', v.csc)}`;
  trigGrapher.setMarker(angleRad);
  if (typeof helixCurve !== 'undefined') {
    helixCurve.markerT = ((angleRad % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    if (typeof trigMode !== 'undefined' && trigMode === '3d') trigGrapher3d.render();
  }
}
document.getElementById('degToggle').addEventListener('change', (e) => { useDegrees = e.target.checked; onAngleChange(unitCircle.angle); });
document.querySelectorAll('[data-angle]').forEach((b) => b.addEventListener('click', () => {
  unitCircle.setAngle(parseFloat(b.dataset.angle) * Math.PI / 180);
}));

function updateTrigEqLabel() {
  const fn = document.getElementById('trigFn').value;
  const a = parseFloat(document.getElementById('trigA').value);
  const b = parseFloat(document.getElementById('trigB').value);
  const c = parseFloat(document.getElementById('trigC').value);
  document.getElementById('trigEqLabel').innerHTML = `<b>y =</b> ${a} \u00B7 ${fn}(${b}x ${c >= 0 ? '+' : '-'} ${Math.abs(c).toFixed(2)})`;
  trigGrapher.setParams(fn, a, b, c);
}
['trigFn', 'trigA', 'trigB', 'trigC'].forEach((id) => document.getElementById(id).addEventListener('input', updateTrigEqLabel));
document.getElementById('trigReciprocal').addEventListener('change', (e) => trigGrapher.setShowReciprocal(e.target.checked));
updateTrigEqLabel();

/* ---- Trig 3D mode: the sin/cos helix (plus full curve add/edit/remove) ---- */
const trigGrapher3d = new Grapher3D(document.getElementById('canvasTrig3D'));
trigGrapher3d.attachGizmo(document.getElementById('gizmoTrigCanvas'));
trigGrapher3d.range = 3;
const helixCurve = trigGrapher3d.addCurve('cos(t)', 'sin(t)', 't*0.15', '#7c3aed', 0, Math.PI * 4);
buildPalette(document.getElementById('fnPaletteTrig3d'));
renderCurveList(trigGrapher3d, 'trigCurveList');
document.getElementById('addTrigCurveBtn').addEventListener('click', () => {
  trigGrapher3d.addCurve('cos(2*t)', 'sin(3*t)', '0', PALETTE[trigGrapher3d.curves.length % PALETTE.length], 0, Math.PI * 2);
  renderCurveList(trigGrapher3d, 'trigCurveList');
});

let trigMode = '2d';
function setTrigMode(mode) {
  trigMode = mode;
  document.getElementById('trigMode2dBtn').classList.toggle('active', mode === '2d');
  document.getElementById('trigMode3dBtn').classList.toggle('active', mode === '3d');
  document.getElementById('trigPanel2d').classList.toggle('hidden', mode !== '2d');
  document.getElementById('trigPanel3d').classList.toggle('hidden', mode !== '3d');
  document.getElementById('trigCanvas2dWrap').classList.toggle('hidden', mode === '3d');
  document.getElementById('trigCanvas3dWrap').classList.toggle('hidden', mode !== '3d');
  requestAnimationFrame(() => {
    if (mode === '2d') { unitCircle.plane._resize(); trigGrapher.plane._resize(); }
    else { trigGrapher3d._resize(); trigGrapher3d._resizeGizmo(); trigGrapher3d.render(); }
  });
}
document.getElementById('trigMode2dBtn').addEventListener('click', () => setTrigMode('2d'));
document.getElementById('trigMode3dBtn').addEventListener('click', () => setTrigMode('3d'));
document.getElementById('resetViewTrig3d').addEventListener('click', () => trigGrapher3d.resetView());

/* ================= Seed demo content ================= */
// The polar-rose "butterfly" r = (sin(2θ))^3 + (cos(0.5θ))^3 is the default
// graph shown to the teacher in both 2D (as a polar curve) and 3D (as the
// same curve traced out in space, free to rotate).
grapher2d.addEquation('r = (sin(2*theta))^3 + (cos(0.5*theta))^3');
renderEqList();
insertButterflyExample();

onAngleChange(unitCircle.angle);
