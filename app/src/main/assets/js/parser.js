/* Lightweight math expression parser & evaluator (no external deps, fully offline).
 * Supports: + - * / % ^, unary minus, parentheses, implicit multiplication (2x, 3(x+1)),
 * constants pi/e, variables (x, y, t, theta, or any custom parameter letter),
 * functions: sin cos tan asin acos atan sinh cosh tanh cot sec csc sqrt abs exp
 *            ln log log2 floor ceil round sign pow atan2 min max
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
  const FUNC_NAMES = new Set(Object.keys(FUNCS1).concat(['pow', 'atan2', 'min', 'max', 'log', 'sqrt']));

  function tokenize(src) {
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
      if ('+-*/^%(),'.includes(c)) { raw.push({ type: c }); i++; continue; }
      i++; // ignore unknown characters
    }
    // insert implicit multiplication
    const out = [];
    for (let k = 0; k < raw.length; k++) {
      out.push(raw[k]);
      const cur = raw[k], next = raw[k + 1];
      if (!next) continue;
      const curIsFunc = cur.type === 'id' && FUNC_NAMES.has(cur.value.toLowerCase());
      const curEnds = cur.type === 'num' || cur.type === 'id' || cur.type === ')';
      const nextStarts = next.type === 'num' || next.type === 'id' || next.type === '(';
      if (curEnds && nextStarts && !(curIsFunc && next.type === '(')) {
        out.push({ type: '*' });
      }
    }
    return out;
  }

  function parse(tokens) {
    let pos = 0;
    const peek = () => tokens[pos];
    const next = () => tokens[pos++];
    const expect = (type) => {
      if (!peek() || peek().type !== type) throw new Error('Expected ' + type);
      return next();
    };

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
    const result = parseExpr();
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
        if (nm === 'min') return Math.min(...args);
        if (nm === 'max') return Math.max(...args);
        if (FUNCS1[nm]) return FUNCS1[nm](args[0]);
        return NaN;
      }
      case 'bin': {
        const l = evalNode(node.left, vars), r = evalNode(node.right, vars);
        switch (node.op) {
          case '+': return l + r;
          case '-': return l - r;
          case '*': return l * r;
          case '/': return l / r;
          case '%': return l % r;
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
    } else if (node.type === 'bin') {
      findParams(node.left, exclude, found);
      findParams(node.right, exclude, found);
    } else if (node.type === 'call') {
      node.args.forEach((a) => findParams(a, exclude, found));
    }
  }

  // compile(expr, excludeVars) -> { params: [...], eval(varsObj) }
  function compile(expr, excludeVars) {
    const exclude = excludeVars || ['x', 'y', 't', 'theta'];
    const ast = parse(tokenize(expr));
    const params = new Set();
    findParams(ast, exclude, params);
    return { ast, params: Array.from(params), eval: (vars) => evalNode(ast, vars) };
  }

  return { compile, tokenize, parse, evalNode };
})();
