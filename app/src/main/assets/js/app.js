window.APP_STATE = { showLabels: true };

const FN_PALETTE = ['sin(', 'cos(', 'tan(', 'sqrt(', 'log(', 'ln(', 'abs(', '^', 'pi', 'e', '(', ')'];

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
    b.addEventListener('click', () => insertAtCursor(tok));
    container.appendChild(b);
  });
}

/* ---------------- Tabs ---------------- */
const tabInstancesInit = {};
function initTabInstance(tab) {
  if (tabInstancesInit[tab]) return;
  tabInstancesInit[tab] = true;
  if (tab === 'graph2d') grapher2d.plane._resize();
  if (tab === 'graph3d') grapher3d._resize();
  if (tab === 'geom') geomTool.plane._resize();
  if (tab === 'trig') { unitCircle.plane._resize(); trigGrapher.plane._resize(); }
}
function goToTab(tab) {
  document.querySelectorAll('.nav-btn').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('.tab').forEach((s) => s.classList.toggle('active', s.id === 'tab-' + tab));
  // force a resize even on repeat visits since layout may have changed while hidden
  requestAnimationFrame(() => {
    if (tab === 'graph2d') grapher2d.plane._resize();
    if (tab === 'graph3d') grapher3d._resize();
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

    const typeSel = document.createElement('select');
    typeSel.className = 'eq-type';
    [['y', 'y=f(x)'], ['x', 'x=f(y)'], ['r', 'r=f(\u03B8)'], ['param', 'x,y=f(t)']].forEach(([v, t]) => {
      const o = document.createElement('option'); o.value = v; o.textContent = t; if (v === eq.type) o.selected = true;
      typeSel.appendChild(o);
    });
    typeSel.addEventListener('change', () => { eq.type = typeSel.value; grapher2d.recompile(eq); renderEqList(); grapher2d.plane.render(); });

    const input = document.createElement('input');
    input.className = 'eq-input';
    input.placeholder = eq.type === 'param' ? 'x(t) = ...' : (eq.type === 'r' ? 'r(\u03B8) = ...' : (eq.type === 'x' ? 'x(y) = ...' : 'y = ...'));
    input.value = eq.expr;
    trackFocus(input);
    input.addEventListener('input', () => {
      eq.expr = input.value;
      grapher2d.recompile(eq);
      input.classList.toggle('error', !!eq.error);
      errBox.textContent = eq.error || '';
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
    top.appendChild(typeSel);
    top.appendChild(input);
    top.appendChild(visBtn);
    top.appendChild(delBtn);
    row.appendChild(top);

    let input2 = null;
    if (eq.type === 'param') {
      input2 = document.createElement('input');
      input2.className = 'eq-input2';
      input2.placeholder = 'y(t) = ...';
      input2.value = eq.exprY;
      trackFocus(input2);
      input2.addEventListener('input', () => { eq.exprY = input2.value; grapher2d.recompile(eq); renderParams(); grapher2d.plane.render(); });
      row.appendChild(input2);
    }

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
    const eq = grapher2d.addEquation(result.expr, 'y');
    renderEqList();
    grapher2d.plane.render();
    resultBox.innerHTML = `<b>y = </b>${result.expr}<br/>R\u00B2 = ${(Math.round(result.r2 * 1000) / 1000)}`;
  } catch (err) {
    resultBox.innerHTML = `<span style="color:#dc2626">${err.message}</span>`;
  }
});

/* ================= 3D GRAPHING ================= */
const grapher3d = new Grapher3D(document.getElementById('canvas3d'));
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

    list.appendChild(row);
  });
}
document.getElementById('addSurfBtn').addEventListener('click', () => { grapher3d.addSurface(''); renderSurfList(); });
document.getElementById('resSlider').addEventListener('input', (e) => { grapher3d.resolution = parseInt(e.target.value, 10); grapher3d.render(); });
document.getElementById('wireframeToggle').addEventListener('change', (e) => { grapher3d.wireframe = e.target.checked; grapher3d.render(); });
document.getElementById('resetView3d').addEventListener('click', () => grapher3d.resetView());

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
  } else if (points.length === 2) {
    const [a, b] = points;
    html += `<b>Distance A\u2192B:</b> ${GeometryTool.dist(a, b).toFixed(3)}<br/>`;
    html += `<b>Dist. A from origin:</b> ${GeometryTool.distFromOrigin(a).toFixed(3)}<br/>`;
    html += `<b>Dist. B from origin:</b> ${GeometryTool.distFromOrigin(b).toFixed(3)}<br/>`;
    const m = GeometryTool.midpoint(a, b);
    html += `<b>Midpoint:</b> (${m.x.toFixed(2)}, ${m.y.toFixed(2)})<br/>`;
    const m2 = GeometryTool.slope(a, b);
    html += `<b>Slope:</b> ${m2 === null ? 'undefined (vertical)' : m2.toFixed(3)}<br/>`;
    html += `<b>Line equation:</b> ${GeometryTool.lineEquation(a, b)}`;
  } else if (points.length >= 3) {
    html += `<b>Perimeter:</b> ${GeometryTool.polygonPerimeter(points).toFixed(3)}<br/>`;
    html += `<b>Area (shoelace):</b> ${GeometryTool.polygonArea(points).toFixed(3)}<br/>`;
    html += `<b>Points from origin:</b><br/>`;
    points.forEach((p, i) => { html += `${GeometryTool.label(i)}: ${GeometryTool.distFromOrigin(p).toFixed(2)}&nbsp;&nbsp;`; });
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
  box.innerHTML =
    `<b>\u03B8 =</b> ${angleTxt}<br/>` +
    `<b>sin \u03B8 =</b> ${Math.sin(angleRad).toFixed(3)}<br/>` +
    `<b>cos \u03B8 =</b> ${Math.cos(angleRad).toFixed(3)}<br/>` +
    `<b>tan \u03B8 =</b> ${Math.abs(Math.cos(angleRad)) < 1e-6 ? 'undefined' : Math.tan(angleRad).toFixed(3)}`;
  trigGrapher.setMarker(angleRad);
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
updateTrigEqLabel();

/* ================= Seed demo content ================= */
grapher2d.addEquation('sin(x)');
grapher2d.addEquation('0.5*x^2 - 2');
renderEqList();
grapher3d.addSurface('sin(sqrt(x^2+y^2))');
renderSurfList();
onAngleChange(unitCircle.angle);
