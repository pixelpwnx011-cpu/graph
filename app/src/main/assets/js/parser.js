/* Lightweight math expression parser & evaluator (no external deps, fully offline).
 * Supports: + - * / % ^, unary minus, parentheses, implicit multiplication (2x, 3(x+1)),
 * absolute value bars |x|, comparisons < > <= >= = ==, Iverson brackets {condition}
 * (evaluate to 1 if true, 0 if false - chain them for logical AND, e.g. {x>0}{x<5}),
 * constants pi/e, variables (x, y, t, theta, or any custom parameter letter),
 * functions: sin cos tan asin acos atan sinh cosh tanh cot sec csc sqrt abs exp
 *            ln log log2 floor ceil round sign pow atan2 min max mod
 */
const MathParser = (function () {
  const CONSTANTS = { pi: Math.PI, e: Math.E };

  const FUNCS1 = {
    sin: Math.sin, cos: Math.cos, tan: Math.tan,
    asin: Math.asin, acos: Math.acos, atan: Math.atan,
    sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh,
    cot: (x) => 1 / Math.tan(x), sec: (x) => 1 / Math.cos(x), csc: (x) => 1 / Math.sin(x),
    sqrt: Math.sqrt, abs: Math.abs, exp: Math.exp,
    ln: Math.log, log2: Math.log2,
    floor: Math.floor, ceil: Math.ceil, round: Math.round, sign: Math.sign
  };
  const FUNC_NAMES = new Set(Object.keys(FUNCS1).concat(['pow', 'atan2', 'min', 'max', 'log', 'sqrt', 'mod']));

  function floorMod(a, b) { return a - b * Math.floor(a / b); }

  function tokenize(src) {
    // let people type/insert "nicer" math glyphs that aren't on a number pad -
    // normalize them to the ASCII the tokenizer below understands.
    src = src
      .replace(/≤/g, '<=').replace(/≥/g, '>=').replace(/≠/g, '!=')
      .replace(/⟨/g, '(').replace(/⟩/g, ')')
      .replace(/×/g, '*').replace(/÷/g, '/')
      .replace(/√/g, 'sqrt').replace(/θ/g, 'theta').replace(/π/g, 'pi')
      .replace(/φ/g, '1.6180339887');
    const raw = [];
    let i = 0;
    const n = src.length;
    while (i < n) {
      const c = src[i];
      if (/\s/.test(c)) { i++; continue; }
      if (/[0-9.]/.test(c)) {
        let j = i;
        while (j < n && /[0-9.]/.test(src[j])) j++;
        raw.push({ type: 'num', value: parseFloat(src.slice(i, j)) });
        i = j; continue;
      }
      if (/[a-zA-Z_]/.test(c)) {
        let j = i;
        while (j < n && /[a-zA-Z0-9_]/.test(src[j])) j++;
        raw.push({ type: 'id', value: src.slice(i, j) });
        i = j; continue;
      }
      if (c === '<' || c === '>') {
        if (src[i + 1] === '=') { raw.push({ type: c + '=' }); i += 2; } else { raw.push({ type: c }); i++; }
        continue;
      }
      if (c === '=') {
        if (src[i + 1] === '=') { raw.push({ type: '==' }); i += 2; } else { raw.push({ type: '==' }); i++; }
        continue;
      }
      if (c === '!' && src[i + 1] === '=') { raw.push({ type: '!=' }); i += 2; continue; }
      if ('+-*/^%(),{}|'.includes(c)) { raw.push({ type: c }); i++; continue; }
      i++; // ignore unknown characters
    }

    // resolve '|' into 'absopen' / 'absclose' by simple alternating parity (no true nesting support)
    let absDepth = 0;
    for (let k = 0; k < raw.length; k++) {
      if (raw[k].type === '|') {
        if (absDepth === 0) { raw[k] = { type: 'absopen' }; absDepth = 1; }
        else { raw[k] = { type: 'absclose' }; absDepth = 0; }
      }
    }

    // insert implicit multiplication
    const out = [];
    for (let k = 0; k < raw.length; k++) {
      out.push(raw[k]);
      const cur = raw[k], next = raw[k + 1];
      if (!next) continue;
      const curIsFunc = cur.type === 'id' && FUNC_NAMES.has(cur.value.toLowerCase());
      const curEnds = cur.type === 'num' || cur.type === 'id' || cur.type === ')' || cur.type === 'absclose' || cur.type === '}';
      const nextStarts = next.type === 'num' || next.type === 'id' || next.type === '(' || next.type === 'absopen' || next.type === '{';
      if (curEnds && nextStarts && !(curIsFunc && next.type === '(')) {
        out.push({ type: '*' });
      }
    }
    return out;
  }

  const CMP_OPS = new Set(['<', '>', '<=', '>=', '==', '!=']);

  function parse(tokens) {
    let pos = 0;
    const peek = () => tokens[pos];
    const next = () => tokens[pos++];
    const expect = (type) => {
      if (!peek() || peek().type !== type) throw new Error('Expected ' + type);
      return next();
    };

    // top level: allow chained comparisons, e.g. {0 < x < 5} => (0<x) AND (x<5)
    function parseRelational() {
      let node = parseExpr();
      let chain = null;
      while (peek() && CMP_OPS.has(peek().type)) {
        const op = next().type;
        const right = parseExpr();
        const cmp = { type: 'cmp', op, left: node, right };
        chain = chain ? { type: 'and', left: chain, right: cmp } : cmp;
        node = right;
      }
      return chain || node;
    }

    function parseExpr() {
      let node = parseTerm();
      while (peek() && (peek().type === '+' || peek().type === '-')) {
        const op = next().type;
        node = { type: 'bin', op, left: node, right: parseTerm() };
      }
      return node;
    }
    function parseTerm() {
      let node = parseUnary();
      while (peek() && (peek().type === '*' || peek().type === '/' || peek().type === '%')) {
        const op = next().type;
        node = { type: 'bin', op, left: node, right: parseUnary() };
      }
      return node;
    }
    function parseUnary() {
      if (peek() && peek().type === '-') { next(); return { type: 'neg', node: parseUnary() }; }
      if (peek() && peek().type === '+') { next(); return parseUnary(); }
      return parsePower();
    }
    function parsePower() {
      let node = parsePrimary();
      if (peek() && peek().type === '^') {
        next();
        node = { type: 'bin', op: '^', left: node, right: parseUnary() };
      }
      return node;
    }
    function parsePrimary() {
      const t = peek();
      if (!t) throw new Error('Unexpected end of expression');
      if (t.type === 'num') { next(); return { type: 'num', value: t.value }; }
      if (t.type === '(') {
        next();
        const node = parseExpr();
        expect(')');
        return node;
      }
      if (t.type === 'absopen') {
        next();
        const node = parseExpr();
        expect('absclose');
        return { type: 'call', name: 'abs', args: [node] };
      }
      if (t.type === '{') {
        next();
        const node = parseRelational();
        expect('}');
        return node;
      }
      if (t.type === 'id') {
        next();
        if (peek() && peek().type === '(') {
          next();
          const args = [parseExpr()];
          while (peek() && peek().type === ',') { next(); args.push(parseExpr()); }
          expect(')');
          return { type: 'call', name: t.value, args };
        }
        return { type: 'id', name: t.value };
      }
      throw new Error('Unexpected token: ' + t.type);
    }

    if (!tokens.length) throw new Error('Empty expression');
    const result = parseRelational();
    if (pos !== tokens.length) throw new Error('Unexpected trailing tokens');
    return result;
  }

  function evalNode(node, vars) {
    switch (node.type) {
      case 'num': return node.value;
      case 'neg': return -evalNode(node.node, vars);
      case 'id': {
        const nm = node.name.toLowerCase();
        if (nm in CONSTANTS) return CONSTANTS[nm];
        if (node.name in vars) return vars[node.name];
        if (nm in vars) return vars[nm];
        return NaN;
      }
      case 'call': {
        const args = node.args.map((a) => evalNode(a, vars));
        const nm = node.name.toLowerCase();
        if (nm === 'log') return args.length === 2 ? Math.log(args[1]) / Math.log(args[0]) : Math.log10(args[0]);
        if (nm === 'pow') return Math.pow(args[0], args[1]);
        if (nm === 'atan2') return Math.atan2(args[0], args[1]);
        if (nm === 'mod') return floorMod(args[0], args[1]);
        if (nm === 'min') return Math.min(...args);
        if (nm === 'max') return Math.max(...args);
        if (FUNCS1[nm]) return FUNCS1[nm](args[0]);
        return NaN;
      }
      case 'cmp': {
        const l = evalNode(node.left, vars), r = evalNode(node.right, vars);
        switch (node.op) {
          case '<': return l < r ? 1 : 0;
          case '>': return l > r ? 1 : 0;
          case '<=': return l <= r ? 1 : 0;
          case '>=': return l >= r ? 1 : 0;
          case '==': return Math.abs(l - r) < 1e-9 ? 1 : 0;
          case '!=': return Math.abs(l - r) >= 1e-9 ? 1 : 0;
        }
        return NaN;
      }
      case 'and': return (evalNode(node.left, vars) && evalNode(node.right, vars)) ? 1 : 0;
      case 'bin': {
        const l = evalNode(node.left, vars), r = evalNode(node.right, vars);
        switch (node.op) {
          case '+': return l + r;
          case '-': return l - r;
          case '*': return l * r;
          case '/': return l / r;
          case '%': return floorMod(l, r);
          case '^': return Math.pow(l, r);
        }
      }
    }
    return NaN;
  }

  function findParams(node, exclude, found) {
    if (!node) return;
    if (node.type === 'id') {
      if (!(node.name.toLowerCase() in CONSTANTS) && !exclude.includes(node.name)) found.add(node.name);
    } else if (node.type === 'neg') {
      findParams(node.node, exclude, found);
    } else if (node.type === 'bin' || node.type === 'cmp' || node.type === 'and') {
      findParams(node.left, exclude, found);
      findParams(node.right, exclude, found);
    } else if (node.type === 'call') {
      node.args.forEach((a) => findParams(a, exclude, found));
    }
  }

  // Flatten a chain of top-level multiplications, e.g. "x^2 * {a} * {b}" -> [x^2, {a}, {b}],
  // regardless of how the * operators happened to associate in the parse tree.
  function collectMultiplicativeFactors(node, list) {
    if (node.type === 'bin' && node.op === '*') {
      collectMultiplicativeFactors(node.left, list);
      collectMultiplicativeFactors(node.right, list);
    } else {
      list.push(node);
    }
  }

  // compile(expr, excludeVars) -> { params: [...], eval(varsObj), maskEval(varsObj)|null }
  // maskEval isolates just the Iverson-bracket ({...}) factors multiplied into the
  // expression (e.g. "x^2 {|y|<f(x)} {|x|<g(y)}") and reports whether the point is
  // inside all of them (1) or outside any of them (0) - independent of what the
  // rest of the expression's numeric value happens to be at that point. Callers
  // (the 3D surface renderer) use this to know which grid cells are genuinely
  // "outside the region" versus points that are legitimately zero-height but
  // still inside it. maskEval is null when the expression has no such brackets,
  // meaning every point should be considered visible.
  function compile(expr, excludeVars) {
    const exclude = excludeVars || ['x', 'y', 't', 'theta'];
    const ast = parse(tokenize(expr));
    const params = new Set();
    findParams(ast, exclude, params);
    const factors = [];
    collectMultiplicativeFactors(ast, factors);
    const maskFactors = factors.filter((f) => f.type === 'cmp' || f.type === 'and');
    const maskEval = maskFactors.length
      ? (vars) => (maskFactors.every((f) => evalNode(f, vars) !== 0) ? 1 : 0)
      : null;
    return { ast, params: Array.from(params), eval: (vars) => evalNode(ast, vars), maskEval };
  }

  // Split "LHS op RHS" at the top-level comparison operator (=, ==, <, >, <=, >=).
  // Returns {lhs, rhs, op} or null if no top-level comparison operator is found.
  function splitRelation(src) {
    const tokens = tokenize(src);
    let depth = 0;
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i].type;
      if (t === '(' || t === 'absopen' || t === '{') depth++;
      else if (t === ')' || t === 'absclose' || t === '}') depth--;
      else if (depth === 0 && CMP_OPS.has(t)) {
        const lhsTokens = tokens.slice(0, i);
        const rhsTokens = tokens.slice(i + 1);
        if (!lhsTokens.length || !rhsTokens.length) return null;
        return { lhs: detokenize(lhsTokens), rhs: detokenize(rhsTokens), op: t === '==' ? '=' : t };
      }
    }
    return null;
  }

  // Reconstruct a rough source string from tokens (used after splitting on '=').
  function detokenize(tokens) {
    const map = { absopen: '|', absclose: '|' };
    return tokens.map((t) => (t.type === 'num' ? t.value : t.type === 'id' ? t.value : (map[t.type] || t.type))).join(' ');
  }

  // Does this expression reference the given variable name at all (as an identifier)?
  function usesVariable(src, varName) {
    try {
      const tokens = tokenize(src);
      return tokens.some((t) => t.type === 'id' && t.value.toLowerCase() === varName.toLowerCase());
    } catch (e) { return false; }
  }

  return { compile, tokenize, parse, evalNode, splitRelation, usesVariable };
})();
