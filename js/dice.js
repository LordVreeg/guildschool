// ============================================================
// DICE ROLLER (Roll20-style roll syntax, used by chat /roll and [[ ]])
// ============================================================
// Supported:
//   NdX, dX, d%, dF (fate: -1/0/+1), (expr)d(expr)
//   + - * / % ** and parentheses; floor() ceil() round() abs() max(a,b) min(a,b)
//   [label] after any term (ignored in the maths)
//   Dice modifiers (any order):
//     r<cp> reroll while matching, ro<cp> reroll once
//     ! explode, !! compound, !p penetrate (each optionally with <cp>)
//     k/kh N keep highest, kl N keep lowest, d/dl N drop lowest, dh N drop highest
//     >N <N =N count successes (> means at least, < at most), f<cp> count failures
//     cs<cp> cf<cp> what counts as a critical success / failure (default max / 1)
//     s/sa sort ascending, sd descending; m/mt[N] mark matching values / count matches
//   Groups: {expr, expr, ...} with kh/kl/dh/dl N, >N <N =N and f<cp>
//   A compare point <cp> is =N, >N (at least) or <N (at most); a bare N means =N.
//
// DiceRoller.roll(text) returns { expr, total, parts, crit, fumble } or throws
// an Error with a readable message. `parts` is plain data (text and dice
// tokens) so a roll can be stored and later drawn safely by any client.

const DiceRoller = (() => {
  const MAX_DICE = 1000, MAX_SIDES = 1000000, MAX_EXPLODE = 100;

  function rand(n) { // unbiased integer in [0, n)
    const buf = new Uint32Array(1), limit = Math.floor(0x100000000 / n) * n;
    do { crypto.getRandomValues(buf); } while (buf[0] >= limit);
    return buf[0] % n;
  }

  // ---------- parser ----------
  function parse(src) {
    let p = 0;
    const err = msg => { throw new Error(`${msg} (at "${src.slice(p, p + 12) || 'end'}")`); };
    const ws = () => { while (p < src.length && /\s/.test(src[p])) p++; };
    const peek = s => { ws(); return src.startsWith(s, p); };
    const eat = s => { if (peek(s)) { p += s.length; return true; } return false; };
    const peekRaw = s => src.startsWith(s, p);
    const eatRaw = s => { if (peekRaw(s)) { p += s.length; return true; } return false; };
    const intRaw = () => { const m = /^\d+/.exec(src.slice(p)); if (!m) return null; p += m[0].length; return parseInt(m[0], 10); };
    const number = () => { ws(); const m = /^\d+(\.\d+)?/.exec(src.slice(p)); if (!m) return null; p += m[0].length; return parseFloat(m[0]); };

    function comparePoint(required) {
      let op = '=';
      if (eatRaw('>')) op = '>'; else if (eatRaw('<')) op = '<'; else if (eatRaw('=')) op = '=';
      else if (!required && !/^\d/.test(src.slice(p))) return null;
      const n = intRaw();
      if (n === null) err('Expected a number');
      return { op, n };
    }

    function label(node) {
      ws();
      if (src[p] === '[' && src[p + 1] !== '[') {
        const end = src.indexOf(']', p);
        if (end < 0) err('Unclosed [label]');
        node.label = src.slice(p + 1, end).trim();
        p = end + 1;
      }
      return node;
    }

    function expr() {
      let left = term();
      for (;;) {
        if (eat('+')) left = { t: 'bin', op: '+', a: left, b: term() };
        else if (peek('-')) { p++; left = { t: 'bin', op: '-', a: left, b: term() }; }
        else return left;
      }
    }
    function term() {
      let left = power();
      for (;;) {
        ws();
        if (peekRaw('**')) return left;
        if (eatRaw('*')) left = { t: 'bin', op: '*', a: left, b: power() };
        else if (eatRaw('/')) left = { t: 'bin', op: '/', a: left, b: power() };
        else if (eatRaw('%')) left = { t: 'bin', op: '%', a: left, b: power() };
        else return left;
      }
    }
    function power() {
      const base = unary();
      if (eat('**')) return { t: 'bin', op: '**', a: base, b: power() };
      return base;
    }
    function unary() {
      if (eat('-')) return { t: 'neg', a: unary() };
      if (eat('+')) return unary();
      return label(primary());
    }
    function primary() {
      ws();
      const fn = /^(floor|ceil|round|abs)\s*\(/i.exec(src.slice(p));
      if (fn) {
        p += fn[0].length;
        const a = expr();
        if (!eat(')')) err('Expected )');
        return { t: 'fn', name: fn[1].toLowerCase(), a };
      }
      // max(a, b, ...) and min(a, b, ...): the largest / smallest of the values.
      const mm = /^(max|min)\s*\(/i.exec(src.slice(p));
      if (mm) {
        p += mm[0].length;
        const args = [expr()];
        while (eat(',')) args.push(expr());
        if (!eat(')')) err('Expected )');
        return { t: 'fnn', name: mm[1].toLowerCase(), args };
      }
      if (eat('(')) {
        const inner = expr();
        if (!eat(')')) err('Expected )');
        if (/^[dD][\d(%Ff]/.test(src.slice(p))) return dice(inner);
        return { t: 'paren', a: inner };
      }
      if (eat('{')) return group();
      const n = number();
      if (n !== null) {
        if (/^[dD][\d(%Ff]/.test(src.slice(p))) return dice({ t: 'num', v: n });
        return { t: 'num', v: n };
      }
      if (/^[dD][\d(%Ff]/.test(src.slice(p))) return dice({ t: 'num', v: 1 });
      err(p >= src.length ? 'Roll ended early' : 'Unexpected character');
    }
    function dice(count) {
      p++; // the d
      let sides;
      if (eatRaw('%')) sides = { t: 'num', v: 100 };
      else if (eatRaw('F') || eatRaw('f')) sides = 'F';
      else if (eatRaw('(')) { sides = expr(); if (!eat(')')) err('Expected )'); }
      else { const n = intRaw(); if (n === null) err('Expected number of sides'); sides = { t: 'num', v: n }; }
      const node = { t: 'dice', count, sides, reroll: [], keep: null, explode: null };
      for (;;) {
        if (eatRaw('ro')) node.reroll.push({ cp: comparePoint(true), once: true });
        else if (eatRaw('r')) node.reroll.push({ cp: comparePoint(true), once: false });
        else if (eatRaw('!!')) node.explode = { kind: 'compound', cp: comparePoint(false) };
        else if (eatRaw('!p')) node.explode = { kind: 'penetrate', cp: comparePoint(false) };
        else if (eatRaw('!')) node.explode = { kind: 'explode', cp: comparePoint(false) };
        else if (eatRaw('kh')) node.keep = { mode: 'kh', n: intRaw() ?? 1 };
        else if (eatRaw('kl')) node.keep = { mode: 'kl', n: intRaw() ?? 1 };
        else if (eatRaw('dh')) node.keep = { mode: 'dh', n: intRaw() ?? 1 };
        else if (eatRaw('dl')) node.keep = { mode: 'dl', n: intRaw() ?? 1 };
        else if (/^k\d/.test(src.slice(p))) { p++; node.keep = { mode: 'kh', n: intRaw() }; }
        else if (/^d\d/.test(src.slice(p))) { p++; node.keep = { mode: 'dl', n: intRaw() }; }
        else if (eatRaw('cs')) node.cs = comparePoint(true);
        else if (eatRaw('cf')) node.cf = comparePoint(true);
        else if (/^f[<>=\d]/.test(src.slice(p))) { p++; node.fail = comparePoint(true); }
        else if (/^[<>=]\d/.test(src.slice(p))) node.success = comparePoint(true);
        else if (eatRaw('sa') || (/^s(?![a-z])/.test(src.slice(p)) && eatRaw('s'))) node.sort = 'a';
        else if (eatRaw('sd')) node.sort = 'd';
        else if (eatRaw('mt')) node.match = { count: true, min: intRaw() ?? 2 };
        else if (/^m(?![a-z])|^m\d/.test(src.slice(p))) { p++; node.match = { count: false, min: intRaw() ?? 2 }; }
        else return node;
      }
    }
    function group() {
      const items = [expr()];
      while (eat(',')) items.push(expr());
      if (!eat('}')) err('Expected }');
      const node = { t: 'group', items, keep: null };
      for (;;) {
        if (eatRaw('kh')) node.keep = { mode: 'kh', n: intRaw() ?? 1 };
        else if (eatRaw('kl')) node.keep = { mode: 'kl', n: intRaw() ?? 1 };
        else if (eatRaw('dh')) node.keep = { mode: 'dh', n: intRaw() ?? 1 };
        else if (eatRaw('dl')) node.keep = { mode: 'dl', n: intRaw() ?? 1 };
        else if (/^k\d/.test(src.slice(p))) { p++; node.keep = { mode: 'kh', n: intRaw() }; }
        else if (/^d\d/.test(src.slice(p))) { p++; node.keep = { mode: 'dl', n: intRaw() }; }
        else if (/^f[<>=\d]/.test(src.slice(p))) { p++; node.fail = comparePoint(true); }
        else if (/^[<>=]\d/.test(src.slice(p))) node.success = comparePoint(true);
        else return node;
      }
    }

    const tree = expr();
    ws();
    if (p < src.length) err('Unexpected text');
    return tree;
  }

  // ---------- evaluation ----------
  const hits = (cp, v) => cp.op === '=' ? v === cp.n : cp.op === '>' ? v >= cp.n : v <= cp.n;
  const fmt = v => (Math.round(v * 10000) / 10000).toString();

  // Marks which entries are dropped by a keep/drop rule (entries: {v, dropped}).
  function applyKeep(entries, keep) {
    if (!keep) return;
    const live = entries.filter(e => !e.discarded);
    const byValue = live.slice().sort((x, y) => x.v - y.v);
    const n = Math.max(0, Math.min(keep.n, live.length));
    let drop = [];
    if (keep.mode === 'kh') drop = byValue.slice(0, live.length - n);
    if (keep.mode === 'kl') drop = byValue.slice(n);
    if (keep.mode === 'dl') drop = byValue.slice(0, n);
    if (keep.mode === 'dh') drop = byValue.slice(live.length - n);
    drop.forEach(e => { e.dropped = true; });
  }

  function evaluate(node, ctx) {
    const r = evalNode(node, ctx);
    if (node.label) r.parts.push({ s: `[${node.label}]`, k: 'label' });
    return r;
  }
  function evalNode(node, ctx) {
    switch (node.t) {
      case 'num': return { v: node.v, parts: [{ s: fmt(node.v) }] };
      case 'paren': { const r = evaluate(node.a, ctx); return { v: r.v, parts: [{ s: '(' }, ...r.parts, { s: ')' }] }; }
      case 'neg': { const r = evaluate(node.a, ctx); return { v: -r.v, parts: [{ s: '-' }, ...r.parts] }; }
      case 'fn': {
        const r = evaluate(node.a, ctx);
        const v = Math[node.name](r.v);
        return { v, parts: [{ s: node.name + '(' }, ...r.parts, { s: ')' }] };
      }
      case 'fnn': {
        const rs = node.args.map(a => evaluate(a, ctx));
        const parts = [{ s: node.name + '(' }];
        rs.forEach((r, i) => { if (i) parts.push({ s: ', ' }); parts.push(...r.parts); });
        parts.push({ s: ')' });
        return { v: Math[node.name](...rs.map(r => r.v)), parts };
      }
      case 'bin': {
        const a = evaluate(node.a, ctx), b = evaluate(node.b, ctx);
        let v;
        if (node.op === '+') v = a.v + b.v;
        else if (node.op === '-') v = a.v - b.v;
        else if (node.op === '*') v = a.v * b.v;
        else if (node.op === '/') { if (b.v === 0) throw new Error('Division by zero'); v = a.v / b.v; }
        else if (node.op === '%') { if (b.v === 0) throw new Error('Division by zero'); v = a.v % b.v; }
        else v = Math.pow(a.v, b.v);
        return { v, parts: [...a.parts, { s: node.op }, ...b.parts] };
      }
      case 'dice': return rollDice(node, ctx);
      case 'group': return rollGroup(node, ctx);
    }
    throw new Error('Bad roll');
  }

  function rollDice(node, ctx) {
    const count = Math.round(evaluate(node.count, ctx).v);
    const fate = node.sides === 'F';
    const sides = fate ? 3 : Math.round(evaluate(node.sides, ctx).v);
    if (count < 0 || count > MAX_DICE) throw new Error(`Between 0 and ${MAX_DICE} dice per roll`);
    if (!fate && (sides < 1 || sides > MAX_SIDES)) throw new Error('A die needs 1 to 1,000,000 sides');
    ctx.dice += count;
    if (ctx.dice > MAX_DICE * 2) throw new Error('Too many dice in one roll');
    const max = fate ? 1 : sides, min = fate ? -1 : 1;
    const one = () => fate ? rand(3) - 1 : rand(sides) + 1;
    const entries = [];
    for (let i = 0; i < count; i++) {
      let v = one();
      // Rerolls: the replaced results stay visible, struck through.
      for (const rr of node.reroll) {
        let guard = 0;
        while (hits(rr.cp, v) && guard++ < MAX_EXPLODE) {
          entries.push({ v, discarded: true });
          v = one();
          if (rr.once) break;
        }
      }
      const ex = node.explode;
      const exCp = ex && (ex.cp || { op: '=', n: max });
      if (ex && fate) throw new Error('Fate dice can\'t explode');
      if (ex && exCp.op !== '<' && exCp.n <= min && exCp.op !== '=') throw new Error('That explosion would never stop');
      if (ex && ex.kind === 'compound') {
        let total = v, last = v, guard = 0;
        while (hits(exCp, last) && guard++ < MAX_EXPLODE) { last = one(); total += last; }
        entries.push({ v: total, exploded: guard > 0, raw: v });
      } else {
        entries.push({ v, raw: v });
        let last = v, guard = 0;
        while (ex && hits(exCp, last) && guard++ < MAX_EXPLODE) {
          last = one();
          entries.push({ v: ex.kind === 'penetrate' ? last - 1 : last, raw: last, exploded: true });
        }
      }
    }
    applyKeep(entries, node.keep);
    const kept = entries.filter(e => !e.discarded && !e.dropped);
    const csCp = node.cs || (fate ? null : { op: '=', n: max });
    const cfCp = node.cf || (fate ? null : { op: '=', n: 1 });
    for (const e of kept) {
      const face = e.raw ?? e.v;
      if (csCp && hits(csCp, face)) { e.crit = true; ctx.crit = true; }
      if (cfCp && hits(cfCp, face)) { e.fumble = true; ctx.fumble = true; }
    }
    let v;
    if (node.success || node.fail) {
      v = 0;
      for (const e of kept) {
        if (node.success && hits(node.success, e.v)) { e.success = true; v++; }
        if (node.fail && hits(node.fail, e.v)) { e.failure = true; v--; }
      }
    } else v = kept.reduce((s, e) => s + e.v, 0);
    if (node.match) {
      const counts = new Map();
      kept.forEach(e => counts.set(e.v, (counts.get(e.v) || 0) + 1));
      const matched = [...counts.entries()].filter(([, c]) => c >= node.match.min).map(([val]) => val);
      kept.forEach(e => { const i = matched.indexOf(e.v); if (i >= 0) e.match = (i % 6) + 1; });
      if (node.match.count) v = matched.length;
    }
    let shown = entries;
    if (node.sort) shown = entries.slice().sort((x, y) => node.sort === 'a' ? x.v - y.v : y.v - x.v);
    const parts = [{ s: '(' }];
    shown.forEach((e, i) => {
      if (i) parts.push({ s: fate ? ', ' : '+' });
      let k = 'die';
      if (e.discarded) k = 'rerolled'; else if (e.dropped) k = 'dropped';
      else if (e.success) k = 'success'; else if (e.failure) k = 'failure';
      else if (e.crit && !e.fumble) k = 'crit'; else if (e.fumble && !e.crit) k = 'fumble';
      const label = fate ? (e.v > 0 ? '+' : e.v < 0 ? '-' : '0') : String(e.v);
      parts.push({ s: label, k, m: e.match || undefined });
    });
    parts.push({ s: ')' });
    return { v, parts };
  }

  function rollGroup(node, ctx) {
    const results = node.items.map(item => evaluate(item, ctx));
    const entries = results.map(r => ({ v: r.v }));
    if (results.length > 1) applyKeep(entries, node.keep);
    const kept = entries.filter(e => !e.dropped);
    let v;
    if (node.success || node.fail) {
      v = 0;
      kept.forEach(e => {
        if (node.success && hits(node.success, e.v)) { e.success = true; v++; }
        if (node.fail && hits(node.fail, e.v)) { e.failure = true; v--; }
      });
    } else v = kept.reduce((s, e) => s + e.v, 0);
    const parts = [{ s: '{' }];
    results.forEach((r, i) => {
      if (i) parts.push({ s: ', ' });
      const e = entries[i];
      const k = e.dropped ? 'dropped' : e.success ? 'success' : e.failure ? 'failure' : null;
      if (k) parts.push({ s: '', k: 'open-' + k });
      parts.push(...r.parts, { s: ' = ' + fmt(r.v) });
      if (k) parts.push({ s: '', k: 'close' });
    });
    parts.push({ s: '}' });
    return { v, parts };
  }

  // Resolves inner [[ ]] first, so "[[ [[1d4]]d6 ]]" rolls 1d4 then that many d6.
  function resolveNested(text) {
    for (let guard = 0; guard < 50; guard++) {
      const m = /\[\[([^\[\]]*(?:\[(?!\[)[^\[\]]*\][^\[\]]*)*)\]\]/.exec(text);
      if (!m) return text;
      text = text.slice(0, m.index) + fmt(roll(m[1]).total) + text.slice(m.index + m[0].length);
    }
    throw new Error('Too many nested rolls');
  }

  function roll(text) {
    const expr = String(text).trim();
    if (!expr) throw new Error('Nothing to roll');
    if (expr.length > 500) throw new Error('That roll is too long');
    const flat = expr.includes('[[') ? resolveNested(expr) : expr;
    const ctx = { dice: 0, crit: false, fumble: false };
    const r = evaluate(parse(flat), ctx);
    if (!Number.isFinite(r.v)) throw new Error('The result isn\'t a number');
    // Nested rolls are shown by what they rolled: "[[1d4]]d6" becomes "3d6".
    return { expr: flat, total: Math.round(r.v * 10000) / 10000, parts: r.parts, crit: ctx.crit, fumble: ctx.fumble };
  }

  // Finds top-level [[ ... ]] spans in text (nested ones stay inside).
  function findInline(text) {
    const spans = [];
    let i = 0;
    while ((i = text.indexOf('[[', i)) >= 0) {
      let depth = 0, j = i;
      for (; j < text.length - 1; j++) {
        if (text[j] === '[' && text[j + 1] === '[') { depth++; j++; }
        else if (text[j] === ']' && text[j + 1] === ']') { depth--; j++; if (depth === 0) break; }
      }
      if (depth !== 0) break;
      spans.push({ start: i, end: j + 1, expr: text.slice(i + 2, j - 1) });
      i = j + 1;
    }
    return spans;
  }

  const PART_CLASSES = ['die', 'rerolled', 'dropped', 'success', 'failure', 'crit', 'fumble', 'label'];

  // Draws stored parts as HTML. Only known classes are used and all text is
  // escaped, so a stored roll can't inject markup.
  function partsHtml(parts) {
    let html = '';
    for (const part of parts || []) {
      const k = String(part.k || '');
      if (k.startsWith('open-')) { const c = k.slice(5); if (PART_CLASSES.includes(c)) html += `<span class="dr-${c}">`; continue; }
      if (k === 'close') { html += '</span>'; continue; }
      const text = escapeHtml(String(part.s ?? ''));
      if (PART_CLASSES.includes(k)) {
        const m = Number.isInteger(part.m) && part.m >= 1 && part.m <= 6 ? ` dr-match${part.m}` : '';
        html += `<span class="dr-${k}${m}">${text}</span>`;
      } else html += text;
    }
    return html;
  }
  function partsText(parts) {
    return (parts || []).map(p => String(p.s ?? '')).join('');
  }

  return { roll, findInline, partsHtml, partsText };
})();
