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
      // d: the die's sides ('F' for fate), so the chat can draw it rolling (see chatAnimateRolls)
      parts.push({ s: label, k, m: e.match || undefined, d: fate ? 'F' : sides });
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

// ============================================================
// DICE ROLLING ACROSS THE CHAT
// ============================================================
// A new message with dice in it (a /roll, an [[inline roll]], a template)
// sends those dice tumbling across the chat's message area. Each lands
// showing what it really rolled (the parts' d says its sides; rolls made
// before that was stored don't animate). Crits and fumbles are coloured as
// in the roll text, dropped dice are dimmed. The 🎲 button in the chat
// header turns it off for this browser.

const DICE_ANIM_MAX = 12;           // more dice than this: the rest as "+N more"
const DICE_ANIM_KEY = 'gs_dice_anim';
const diceAnimSeen = new Set();     // message ids already animated
function diceAnimEnabled() {
  try { return localStorage.getItem(DICE_ANIM_KEY) !== 'off'; } catch (e) { return true; }
}
function toggleDiceAnim() {
  try { localStorage.setItem(DICE_ANIM_KEY, diceAnimEnabled() ? 'off' : 'on'); } catch (e) {}
  const b = document.getElementById('dice-anim-btn');
  if (b) b.outerHTML = diceAnimButtonHtml();
}
function diceAnimButtonHtml() {
  const on = diceAnimEnabled();
  return `<button id="dice-anim-btn" class="btn btn-dim chat-head-btn" title="Chat animations (dice rolling, critical hits, fumbles): ${on ? 'on' : 'off'}" onclick="toggleDiceAnim()">🎲 ${on ? 'On' : 'Off'}</button>`;
}

// The outline of a die with this many sides, in a 100 x 100 box, and how far
// its number sits off centre (a d4's is low, in the wide part of the triangle).
function diceAnimShape(d) {
  const poly = (pts, extra) => `<polygon points="${pts}"/>${extra || ''}`;
  switch (d) {
    case 4:   return { svg: poly('50,6 96,90 4,90'), dy: 14 };
    case 6:
    case 'F': return { svg: '<rect x="9" y="9" width="82" height="82" rx="12"/>', dy: 0 };
    case 8:   return { svg: poly('50,3 97,50 50,97 3,50', '<line x1="3" y1="50" x2="97" y2="50"/>'), dy: 0 };
    case 10:
    case 100: return { svg: poly('50,3 95,42 50,97 5,42', '<polyline points="5,42 50,58 95,42" fill="none"/><line x1="50" y1="58" x2="50" y2="97"/>'), dy: -6 };
    case 12:  return { svg: poly('50,3 97,37 79,95 21,95 3,37'), dy: 4 };
    case 20:  return { svg: poly('50,2 94,26 94,74 50,98 6,74 6,26', '<polygon points="50,22 78,70 22,70" fill="none"/>'), dy: 4 };
    default:  return { svg: '<circle cx="50" cy="50" r="45"/>', dy: 0 };
  }
}
function diceAnimFace(d, v) {
  if (d === 'F') return v > 0 ? '+' : v < 0 ? '−' : '0';
  return String(v);
}

function chatAnimateRolls(msg) {
  if (!msg || !msg.id || diceAnimSeen.has(msg.id)) return;
  diceAnimSeen.add(msg.id);
  if (!diceAnimEnabled() || msg.deleted_at) return;
  if (msg.created_at && Date.now() - new Date(msg.created_at).getTime() > 60000) return; // only fresh rolls
  const p = msg.payload || {};
  const rolls = [...(p.rolls || []), ...(p.inline || [])].filter(r => r && !r.error);
  const dice = [];
  for (const r of rolls) for (const part of r.parts || []) {
    if (part.d !== undefined && ['die', 'crit', 'fumble', 'success', 'failure', 'dropped'].includes(part.k)) dice.push(part);
  }
  const box = document.getElementById('chat-messages');
  if (!dice.length || !box) return;
  const rect = box.getBoundingClientRect();
  if (rect.width < 60 || rect.height < 60) return;

  const tray = document.createElement('div');
  tray.className = 'dice-tray';
  Object.assign(tray.style, { left: rect.left + 'px', top: rect.top + 'px', width: rect.width + 'px', height: rect.height + 'px' });
  document.body.appendChild(tray);

  const fs = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--fs')) || 1;
  const size = Math.round(46 * fs);
  const shown = dice.slice(0, DICE_ANIM_MAX);
  const perRow = Math.max(1, Math.floor((rect.width - 20) / (size + 10)));
  const rows = Math.ceil(shown.length / perRow);
  const floorY = Math.max(10, Math.min(rect.height - rows * (size + 8) - 24, rect.height * 0.55 - rows * (size + 8) / 2));
  const still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const rnd = (a, b) => a + Math.random() * (b - a);
  let longest = 0;

  shown.forEach((part, i) => {
    const d = part.d === 'F' ? 'F' : parseInt(part.d) || 0;
    const shape = diceAnimShape(d);
    const el = document.createElement('div');
    el.className = 'anim-die' + (part.k === 'crit' || part.k === 'success' ? ' crit' : part.k === 'fumble' || part.k === 'failure' ? ' fumble' : part.k === 'dropped' ? ' dropped' : '');
    el.style.width = el.style.height = size + 'px';
    el.innerHTML = `<svg viewBox="0 0 100 100" aria-hidden="true">${shape.svg}</svg><span class="anim-die-num"></span>`;
    const num = el.querySelector('.anim-die-num');
    num.style.marginTop = (shape.dy * size / 100) + 'px';
    num.style.fontSize = Math.round(size * (String(part.s).length > 2 ? 0.3 : 0.38)) + 'px';
    tray.appendChild(el);
    // where it lands: its place in a row, a little off true
    const row = Math.floor(i / perRow), col = i % perRow, inRow = Math.min(perRow, shown.length - row * perRow);
    const startX = (rect.width - inRow * (size + 10)) / 2;
    const endX = startX + col * (size + 10) + rnd(-4, 4), endY = floorY + row * (size + 8) + rnd(-4, 4);
    const endRot = rnd(-15, 15);
    const setFinal = () => { num.textContent = d === 'F' ? diceAnimFace('F', part.s === '+' ? 1 : part.s === '-' ? -1 : 0) : String(part.s); el.classList.add('landed'); };
    if (still) { el.style.transform = `translate(${endX}px, ${endY}px) rotate(${endRot}deg)`; setFinal(); return; }
    const dur = 1100 + i * 90 + rnd(0, 200);
    longest = Math.max(longest, dur);
    const fromY = rnd(0, Math.max(0, rect.height - size));
    const spin = (Math.random() < 0.5 ? -1 : 1) * 360 * (Math.random() < 0.5 ? 2 : 3); // whole turns: it lands upright
    el.animate([
      { transform: `translate(${-size - 10}px, ${fromY}px) rotate(0deg)`, offset: 0 },
      { transform: `translate(${endX * 0.55}px, ${endY - 40}px) rotate(${spin * 0.6}deg)`, offset: 0.45 },
      { transform: `translate(${endX * 0.85}px, ${endY}px) rotate(${spin * 0.85}deg)`, offset: 0.7 },
      { transform: `translate(${endX * 0.95}px, ${endY - 12}px) rotate(${spin * 0.95}deg)`, offset: 0.85 },
      { transform: `translate(${endX}px, ${endY}px) rotate(${spin + endRot}deg)`, offset: 1 }
    ], { duration: dur, easing: 'cubic-bezier(.25,.6,.35,1)', fill: 'forwards' });
    // the faces flicker while it rolls, then it shows what it rolled
    const maxFace = d === 'F' ? 3 : Math.max(2, d || 6);
    num.textContent = diceAnimFace(d, d === 'F' ? 0 : 1 + Math.floor(Math.random() * maxFace));
    const flick = setInterval(() => { num.textContent = diceAnimFace(d, d === 'F' ? Math.floor(Math.random() * 3) - 1 : 1 + Math.floor(Math.random() * maxFace)); }, 70);
    setTimeout(() => { clearInterval(flick); setFinal(); }, dur);
  });
  if (dice.length > shown.length) {
    const more = document.createElement('div');
    more.className = 'anim-die-more';
    more.textContent = `+${dice.length - shown.length} more`;
    more.style.top = (floorY + rows * (size + 8)) + 'px';
    tray.appendChild(more);
  }
  // they rest a moment, then fade away
  setTimeout(() => {
    tray.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 500, fill: 'forwards' });
    setTimeout(() => tray.remove(), 520);
  }, longest + 1800);
}

// ============================================================
// A CRITICAL HIT CUTS THE CHAT
// ============================================================
// /att's "critically hits" line carries payload.att_crit (js/attack.js).
// When it arrives, a red slash tears across the chat's message area and
// blood drips from it for a few seconds, then it all fades. The same 🎲
// button turns it off.

const critAnimSeen = new Set();
function chatAnimateCrit(msg) {
  if (!msg || !msg.id || critAnimSeen.has(msg.id)) return;
  critAnimSeen.add(msg.id);
  if (!diceAnimEnabled() || msg.deleted_at || !(msg.payload && msg.payload.att_crit)) return;
  if (msg.created_at && Date.now() - new Date(msg.created_at).getTime() > 60000) return;
  const box = document.getElementById('chat-messages');
  if (!box) return;
  const rect = box.getBoundingClientRect();
  if (rect.width < 80 || rect.height < 80) return;
  const W = rect.width, H = rect.height;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const tray = document.createElement('div');
  tray.className = 'crit-tray';
  Object.assign(tray.style, { left: rect.left + 'px', top: rect.top + 'px', width: W + 'px', height: H + 'px' });
  document.body.appendChild(tray);

  // the cut: a ragged line from upper left to lower right, wide in the middle
  const x1 = W * rnd(0.04, 0.12), y1 = H * rnd(0.15, 0.32);
  const x2 = W * rnd(0.88, 0.96), y2 = H * rnd(0.52, 0.7);
  const at = t => ({ x: x1 + (x2 - x1) * t, y: y1 + (y2 - y1) * t });
  const nx = -(y2 - y1), ny = x2 - x1, nl = Math.hypot(nx, ny) || 1;   // the cut's sideways direction
  const steps = 14, top = [], bottom = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, p = at(t);
    const half = Math.sin(Math.PI * t) * rnd(4, 7) + 0.5;               // widest mid-cut, a point at each end
    const jag = i && i < steps ? rnd(-3, 3) : 0;
    top.push(`${(p.x + nx / nl * (half + jag)).toFixed(1)},${(p.y + ny / nl * (half + jag)).toFixed(1)}`);
    bottom.unshift(`${(p.x - nx / nl * (half - jag)).toFixed(1)},${(p.y - ny / nl * (half - jag)).toFixed(1)}`);
  }
  const len = Math.hypot(x2 - x1, y2 - y1);
  tray.innerHTML = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" aria-hidden="true">
    <defs><clipPath id="crit-reveal"><rect class="crit-reveal" x="0" y="0" width="${still ? W : 0}" height="${H}"/></clipPath></defs>
    <g clip-path="url(#crit-reveal)">
      <polygon class="crit-cut" points="${top.concat(bottom).join(' ')}"/>
      <line class="crit-cut-core" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>
    </g></svg>`;
  // the blade's sweep: the cut opens left to right
  const reveal = tray.querySelector('.crit-reveal');
  if (!still) reveal.animate([{ width: '0px' }, { width: W + 'px' }], { duration: 220, easing: 'cubic-bezier(.6,0,.2,1)', fill: 'forwards' });
  if (!still) tray.animate([{ transform: 'translate(0,0)' }, { transform: 'translate(-4px,3px)' }, { transform: 'translate(3px,-2px)' }, { transform: 'translate(0,0)' }], { duration: 260, delay: 200 });

  // the drips: from points along the cut, running down at their own pace
  const drips = Math.max(5, Math.min(11, Math.round(len / 45)));
  for (let i = 0; i < drips; i++) {
    const p = at(rnd(0.12, 0.88));
    const d = document.createElement('div');
    d.className = 'blood-drip';
    const w = rnd(3, 7), fall = rnd(H * 0.12, Math.max(H * 0.15, H - p.y - 10));
    Object.assign(d.style, { left: (p.x - w / 2) + 'px', top: (p.y - 2) + 'px', width: w + 'px', '--drop': (w * 1.7) + 'px' });
    tray.appendChild(d);
    if (still) { d.style.height = Math.min(fall, 30) + 'px'; continue; }
    d.animate([{ height: '0px' }, { height: (fall * 0.25) + 'px', offset: 0.3 }, { height: fall + 'px' }],
      { duration: rnd(1800, 3200), delay: 250 + rnd(0, 700), easing: 'cubic-bezier(.5,0,.9,.6)', fill: 'forwards' });
  }
  setTimeout(() => {
    tray.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 900, fill: 'forwards' });
    setTimeout(() => tray.remove(), 920);
  }, still ? 2000 : 4200);
}
// ============================================================
// A FUMBLE DROPS A BANANA PEEL
// ============================================================
// /att's "fumbles with the …!" line carries payload.att_fumble
// (js/attack.js). When it arrives, a banana peel slides down the chat's
// message area, skidding as it goes, spins out at the bottom and fades.
// The same 🎲 button turns it off.

const fumbleAnimSeen = new Set();
const BANANA_PEEL_SVG = `<svg viewBox="0 0 100 100" aria-hidden="true">
  <g stroke="#6e4f0c" stroke-width="2" stroke-linejoin="round">
    <path d="M50 46 C 31 50, 15 66, 7 91 C 22 86, 35 73, 46 58 Z" fill="#f2cf3a"/>
    <path d="M50 46 C 69 50, 85 66, 93 91 C 78 86, 65 73, 54 58 Z" fill="#f2cf3a"/>
    <path d="M50 46 C 43 62, 43 80, 50 98 C 57 80, 57 62, 50 46 Z" fill="#f8de6a"/>
    <path d="M43 50 C 43 38, 46 30, 50 25 C 54 30, 57 38, 57 50 Z" fill="#f2cf3a"/>
    <rect x="47.5" y="13" width="5" height="14" rx="2" fill="#5a4210"/>
  </g>
  <g fill="#8a6418" stroke="none">
    <circle cx="22" cy="78" r="1.8"/><circle cx="30" cy="68" r="1.2"/>
    <circle cx="79" cy="80" r="1.8"/><circle cx="70" cy="66" r="1.3"/><circle cx="51" cy="86" r="1.4"/>
  </g>
</svg>`;
function chatAnimateFumble(msg) {
  if (!msg || !msg.id || fumbleAnimSeen.has(msg.id)) return;
  fumbleAnimSeen.add(msg.id);
  if (!diceAnimEnabled() || msg.deleted_at || !(msg.payload && msg.payload.att_fumble)) return;
  if (msg.created_at && Date.now() - new Date(msg.created_at).getTime() > 60000) return;
  const box = document.getElementById('chat-messages');
  if (!box) return;
  const rect = box.getBoundingClientRect();
  if (rect.width < 80 || rect.height < 80) return;
  const W = rect.width, H = rect.height;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const tray = document.createElement('div');
  tray.className = 'banana-tray';
  Object.assign(tray.style, { left: rect.left + 'px', top: rect.top + 'px', width: W + 'px', height: H + 'px' });
  document.body.appendChild(tray);

  const fs = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--fs')) || 1;
  const size = Math.round(Math.min(72 * fs, W * 0.3, H * 0.3));
  const peel = document.createElement('div');
  peel.className = 'banana-peel';
  peel.style.width = peel.style.height = size + 'px';
  peel.innerHTML = BANANA_PEEL_SVG;
  tray.appendChild(peel);

  // from near the top on one side, sliding down and across, a skid each way,
  // then a spin-out at the bottom
  const dir = Math.random() < 0.5 ? 1 : -1;
  const x0 = dir > 0 ? W * rnd(0.05, 0.25) : W * rnd(0.55, 0.75) - size * 0.5;
  const x1 = Math.max(0, Math.min(W - size, x0 + dir * W * rnd(0.3, 0.45)));
  const yEnd = H - size * 0.9;
  const x = t => x0 + (x1 - x0) * t;
  const tilt = dir * 25;
  const endRot = dir * rnd(320, 420);
  if (still) {
    peel.style.transform = `translate(${x1}px, ${yEnd}px) rotate(${tilt}deg)`;
  } else {
    peel.animate([
      { transform: `translate(${x(0)}px, ${-size}px) rotate(${-tilt}deg)`, offset: 0 },
      { transform: `translate(${x(0.25) + dir * 14}px, ${yEnd * 0.22}px) rotate(${tilt}deg)`, offset: 0.25 },
      { transform: `translate(${x(0.45) - dir * 18}px, ${yEnd * 0.46}px) rotate(${-tilt * 1.4}deg)`, offset: 0.45 },
      { transform: `translate(${x(0.7) + dir * 20}px, ${yEnd * 0.74}px) rotate(${tilt * 1.6}deg)`, offset: 0.7 },
      { transform: `translate(${x(0.9)}px, ${yEnd}px) rotate(${tilt}deg)`, offset: 0.86 },
      { transform: `translate(${x1}px, ${yEnd}px) rotate(${endRot}deg)`, offset: 1 }
    ], { duration: 1900, easing: 'cubic-bezier(.45,.05,.55,.95)', fill: 'forwards' });
  }
  setTimeout(() => {
    tray.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 600, fill: 'forwards' });
    setTimeout(() => tray.remove(), 620);
  }, still ? 1800 : 3000);
}

// Everything a new chat message sets off.
function chatAnimateMessage(msg) {
  chatAnimateRolls(msg);
  chatAnimateCrit(msg);
  chatAnimateFumble(msg);
}
