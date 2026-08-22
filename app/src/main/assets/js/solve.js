/* Quadratic / cubic solver: roots, vertex/inflection point, and "I already
 * know one root -> find the rest" via Vieta's formulas / synthetic division.
 * No symbolic algebra needed - coefficients are recovered by sampling the
 * user's (already-compiled) expression at exactly degree+1 points and solving
 * the resulting linear system exactly (reusing CurveFit's machinery), then an
 * extra held-out point is checked to confirm the expression really is that
 * degree before any answer is reported.
 */
const PolySolve = (function () {
  function extractPolyCoeffs(exprString, degree) {
    let rhs = (exprString || '').trim();
    if (!rhs) throw new Error('Type an equation first.');
    let rel = null;
    try { rel = MathParser.splitRelation(rhs); } catch (e) { rel = null; }
    if (rel && rel.lhs.trim().toLowerCase() === 'y') rhs = rel.rhs;

    const compiled = MathParser.compile(rhs, ['x']);
    const samplePoints = [];
    for (let i = 0; i <= degree; i++) samplePoints.push({ x: i, y: compiled.eval({ x: i }) });
    if (samplePoints.some((p) => !isFinite(p.y))) {
      throw new Error('Could not evaluate that equation at simple x values (0, 1, 2, ...).');
    }
    const coeffs = CurveFit.polyFit(samplePoints, degree); // low -> high degree

    // confirm it's really degree N by checking a point that wasn't used to fit
    const testX = -1;
    const actual = compiled.eval({ x: testX });
    const predicted = coeffs.reduce((s, c, i) => s + c * Math.pow(testX, i), 0);
    if (!isFinite(actual) || Math.abs(actual - predicted) > 1e-6 * (Math.abs(actual) + 1)) {
      throw new Error(`That doesn't look like a degree-${degree} polynomial - try the other degree, or double-check the equation.`);
    }
    if (Math.abs(coeffs[degree]) < 1e-9) {
      throw new Error(`The x^${degree} term is (essentially) zero, so this isn't really degree ${degree}.`);
    }
    return coeffs; // [c0, c1, ..., c_degree]
  }

  function round(n, dp) {
    dp = dp == null ? 4 : dp;
    const r = Math.round(n * Math.pow(10, dp)) / Math.pow(10, dp);
    return Object.is(r, -0) ? 0 : r;
  }

  // ---- Quadratic: a x^2 + b x + c ----
  function solveQuadratic(a, b, c) {
    if (Math.abs(a) < 1e-12) throw new Error('Leading coefficient is zero - not actually quadratic.');
    const disc = b * b - 4 * a * c;
    let roots = [], complexRoots = null;
    if (disc > 1e-9) {
      const s = Math.sqrt(disc);
      roots = [round((-b + s) / (2 * a)), round((-b - s) / (2 * a))];
    } else if (Math.abs(disc) <= 1e-9) {
      roots = [round(-b / (2 * a))];
    } else {
      const s = Math.sqrt(-disc);
      complexRoots = [
        { re: round(-b / (2 * a)), im: round(s / (2 * a)) },
        { re: round(-b / (2 * a)), im: round(-s / (2 * a)) }
      ];
    }
    const vx = -b / (2 * a);
    const vy = a * vx * vx + b * vx + c;
    return { roots, complexRoots, vertex: { x: round(vx), y: round(vy) }, discriminant: round(disc) };
  }

  // other root via Vieta's formulas: sum = -b/a, product = c/a
  function otherRootFromOneQuadratic(a, b, c, known) {
    const check = a * known * known + b * known + c;
    if (Math.abs(check) > 1e-4 * (Math.abs(a * known * known) + Math.abs(b * known) + Math.abs(c) + 1)) {
      throw new Error(`x = ${known} doesn't actually satisfy that equation (got ${round(check)}, expected 0). Check the root or the equation.`);
    }
    const other = (-b / a) - known;
    const vx = -b / (2 * a);
    const vy = a * vx * vx + b * vx + c;
    return { other: round(other), vertex: { x: round(vx), y: round(vy) } };
  }

  // ---- Cubic: a x^3 + b x^2 + c x + d ----
  function solveCubic(a, b, c, d) {
    if (Math.abs(a) < 1e-12) throw new Error('Leading coefficient is zero - not actually cubic.');
    b /= a; c /= a; d /= a; // work with monic x^3+bx^2+cx+d for the depression step (a folded in below)
    const p = c - (b * b) / 3;
    const q = (2 * b * b * b) / 27 - (b * c) / 3 + d;
    const shift = -b / 3;
    const disc = (q * q) / 4 + (p * p * p) / 27;
    let roots = [];
    if (Math.abs(p) < 1e-9 && Math.abs(q) < 1e-9) {
      roots = [shift];
    } else if (disc > 1e-9) {
      const sq = Math.sqrt(disc);
      const u = Math.cbrt(-q / 2 + sq);
      const v = Math.cbrt(-q / 2 - sq);
      roots = [u + v + shift];
    } else if (Math.abs(disc) <= 1e-9) {
      const u = Math.cbrt(-q / 2);
      roots = [2 * u + shift, -u + shift];
    } else {
      const r = Math.sqrt((-p * p * p) / 27);
      const phi = Math.acos(Math.max(-1, Math.min(1, -q / (2 * r))));
      const t = 2 * Math.sqrt(-p / 3);
      roots = [0, 1, 2].map((k) => t * Math.cos((phi + 2 * Math.PI * k) / 3) + shift);
    }
    roots = roots.map((r) => round(r)).sort((x, y) => x - y);
    // inflection point of the ORIGINAL (non-monic) cubic: second derivative 6ax+2b_orig = 0
    // (b here has already been divided by the original a above, so recompute cleanly)
    return roots;
  }

  function cubicInflection(a, b) { // a,b are the ORIGINAL (non-monic) coefficients
    const ix = -b / (3 * a);
    return ix;
  }

  // synthetic division of a x^3+b x^2+c x+d by (x-known) -> quotient a x^2 + qb x + qc, remainder
  function deflateCubic(a, b, c, d, known) {
    const qb = b + a * known;
    const qc = c + qb * known;
    const remainder = d + qc * known;
    return { qa: a, qb, qc, remainder };
  }

  return {
    extractPolyCoeffs, solveQuadratic, otherRootFromOneQuadratic,
    solveCubic, cubicInflection, deflateCubic, round
  };
})();
