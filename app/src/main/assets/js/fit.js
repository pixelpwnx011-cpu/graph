/* Curve fitting: given a set of {x,y} points, find the best-fit equation.
 * Pure least-squares, no external stats library (keeps the app lightweight).
 */
const CurveFit = (function () {
  function solveLinearSystem(A, b) {
    const n = b.length;
    const M = A.map((row, i) => row.slice().concat([b[i]]));
    for (let col = 0; col < n; col++) {
      let pivot = col;
      for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[pivot][col])) pivot = r;
      [M[col], M[pivot]] = [M[pivot], M[col]];
      if (Math.abs(M[col][col]) < 1e-12) continue;
      for (let r = 0; r < n; r++) {
        if (r === col) continue;
        const f = M[r][col] / M[col][col];
        for (let c = col; c <= n; c++) M[r][c] -= f * M[col][c];
      }
    }
    return M.map((row, i) => (Math.abs(row[i]) < 1e-12 ? 0 : row[n] / row[i]));
  }

  function polyFit(points, degree) {
    const n = degree + 1;
    const X = Array.from({ length: n }, () => new Array(n).fill(0));
    const Y = new Array(n).fill(0);
    for (const p of points) {
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) X[i][j] += Math.pow(p.x, i + j);
        Y[i] += Math.pow(p.x, i) * p.y;
      }
    }
    return solveLinearSystem(X, Y); // [c0, c1, c2, ...] low -> high degree
  }

  function simpleLinear(xs, ys) {
    const n = xs.length;
    const sx = xs.reduce((a, b) => a + b, 0), sy = ys.reduce((a, b) => a + b, 0);
    const sxx = xs.reduce((a, b) => a + b * b, 0), sxy = xs.reduce((a, b, i) => a + b * ys[i], 0);
    const denom = n * sxx - sx * sx;
    const slope = Math.abs(denom) < 1e-12 ? 0 : (n * sxy - sx * sy) / denom;
    const intercept = (sy - slope * sx) / n;
    return { slope, intercept };
  }

  function rSquared(points, predict) {
    const ys = points.map((p) => p.y);
    const mean = ys.reduce((a, b) => a + b, 0) / ys.length;
    let ssRes = 0, ssTot = 0;
    for (const p of points) {
      const yhat = predict(p.x);
      ssRes += (p.y - yhat) * (p.y - yhat);
      ssTot += (p.y - mean) * (p.y - mean);
    }
    return ssTot < 1e-12 ? 1 : Math.max(0, 1 - ssRes / ssTot);
  }

  function fmtCoef(c) {
    return Math.round(c * 1000) / 1000;
  }

  function buildPolyExpr(coeffs) {
    // coeffs low->high degree
    const terms = [];
    for (let i = coeffs.length - 1; i >= 0; i--) {
      const c = fmtCoef(coeffs[i]);
      if (c === 0 && coeffs.length > 1) continue;
      let term;
      if (i === 0) term = `${c}`;
      else if (i === 1) term = `${c}*x`;
      else term = `${c}*x^${i}`;
      terms.push(term);
    }
    if (!terms.length) return '0';
    return terms.join(' + ').replace(/\+ -/g, '- ');
  }

  // type: 'linear' | 'quadratic' | 'cubic' | 'quartic' | 'exponential' | 'power'
  function fit(points, type) {
    if (points.length < 2) throw new Error('Need at least 2 points');
    if (type === 'linear') {
      const coeffs = polyFit(points, 1); // [b, a] -> a x + b
      const expr = buildPolyExpr(coeffs);
      const r2 = rSquared(points, (x) => coeffs[0] + coeffs[1] * x);
      return { expr, r2, type: 'y' };
    }
    if (type === 'quadratic' || type === 'cubic' || type === 'quartic') {
      const degree = type === 'quadratic' ? 2 : type === 'cubic' ? 3 : 4;
      if (points.length < degree + 1) throw new Error(`Need at least ${degree + 1} points for a ${type} fit`);
      const coeffs = polyFit(points, degree);
      const expr = buildPolyExpr(coeffs);
      const r2 = rSquared(points, (x) => coeffs.reduce((s, c, i) => s + c * Math.pow(x, i), 0));
      return { expr, r2, type: 'y' };
    }
    if (type === 'exponential') {
      if (points.some((p) => p.y <= 0)) throw new Error('Exponential fit needs all y > 0');
      const xs = points.map((p) => p.x), lys = points.map((p) => Math.log(p.y));
      const { slope, intercept } = simpleLinear(xs, lys);
      const a = fmtCoef(Math.exp(intercept)), b = fmtCoef(slope);
      const expr = `${a}*e^(${b}*x)`;
      const r2 = rSquared(points, (x) => a * Math.exp(b * x));
      return { expr, r2, type: 'y' };
    }
    if (type === 'power') {
      if (points.some((p) => p.x <= 0 || p.y <= 0)) throw new Error('Power fit needs all x > 0 and y > 0');
      const lxs = points.map((p) => Math.log(p.x)), lys = points.map((p) => Math.log(p.y));
      const { slope, intercept } = simpleLinear(lxs, lys);
      const a = fmtCoef(Math.exp(intercept)), b = fmtCoef(slope);
      const expr = `${a}*x^${b}`;
      const r2 = rSquared(points, (x) => a * Math.pow(x, b));
      return { expr, r2, type: 'y' };
    }
    throw new Error('Unknown fit type');
  }

  return { fit, polyFit, buildPolyExpr };
})();
