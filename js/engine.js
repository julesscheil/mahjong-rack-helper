// ===== Mahjong helper engine =====
// Tile ids: B1..B9 (bam), C1..C9 (crak), D1..D9 (dot), GD RD WD (green/red/soap dragons),
// N E W S (winds), F (flower), J (joker)
const SUITS = ['B', 'C', 'D'];
const SUIT_DRAGON = { B: 'GD', C: 'RD', D: 'WD' };
const SUIT_NAME = { B: 'Bam', C: 'Crak', D: 'Dot' };

function tileLabel(id) {
  if (id === 'J') return 'Joker';
  if (id === 'F') return 'Flower';
  if (id === 'GD') return 'Green';
  if (id === 'RD') return 'Red';
  if (id === 'WD') return 'Soap';
  if (['N', 'E', 'W', 'S'].includes(id)) return { N: 'North', E: 'East', W: 'West', S: 'South' }[id];
  return id[1] + ' ' + SUIT_NAME[id[0]];
}

// ---- Card parsing ----
// One hand per line:  tokens  [| points] [C|X] [shift|shift2]
// "# Section" lines start a new section.
// Token = run of tile chars + optional suit letter a/b/c.
//   digits 1-9 = numbers in that token's suit; 0 = Soap (white dragon)
//   D = dragon matching the token's suit;  R / G = red / green dragon
//   N E W S = winds;  F = flower
//   Q = any wind (same wind throughout the hand)
//   suit letters: a/b/c = different suits, z = any suit (can repeat)
//   alternatives: "pattern or pattern" (also -or-)
//   meta flags: shift (any run / like numbers), shift2 (odd/even steps), free (each number any, all different)
// Example:  FF 222a 4444b 666c 88a | 25 X
function parseCard(text) {
  const hands = [];
  const errors = [];
  let section = 'Card';
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;
    if (line.startsWith('#')) { section = line.replace(/^#+/, '').trim() || 'Card'; return; }
    const [pat, rawMeta = ''] = line.split('|');
    const noteM = rawMeta.match(/\(([^)]*)\)/);
    const note = noteM ? noteM[1].trim() : '';
    const meta = rawMeta.replace(/\([^)]*\)/, ' ');
    const metaTokens = meta.trim().split(/\s+/).filter(Boolean);
    let points = null, concealed = false, shift = 0, free = false;
    for (const m of metaTokens) {
      const ml = m.toLowerCase();
      if (/^\d+$/.test(m)) points = +m;
      else if (ml === 'c') concealed = true;
      else if (ml === 'x') concealed = false;
      else if (ml === 'shift') shift = 1;
      else if (ml === 'shift2') shift = 2;
      else if (ml === 'free') free = true;
    }
    // Alternatives: "A or B" / "A -or- B"
    // "or" / "-or-" = another line printed on the card; "also" = a variation the note allows
    const parts = pat.trim().split(/\s+(-?or-?|also)\s+/i);
    const altTexts = [], printedIdx = [];
    for (let p = 0; p < parts.length; p += 2) {
      const sep = p ? parts[p - 1].toLowerCase() : 'or';
      altTexts.push(parts[p].trim());
      printedIdx.push(sep === 'also' ? printedIdx[printedIdx.length - 1] : altTexts.length - 1);
    }
    const alts = [];
    let ok = true;
    for (const at of altTexts) {
      const groups = [];
      for (const tok of at.split(/\s+/).filter(Boolean)) {
        const m = tok.match(/^([0-9DRGNEWSFQ]+)([abcz])?$/);
        if (!m) { errors.push(`Line ${i + 1}: can't read "${tok}"`); ok = false; break; }
        const body = m[1], sv = m[2] || null;
        if (/[1-9D]/.test(body) && !sv) {
          errors.push(`Line ${i + 1}: "${tok}" needs a suit letter (a, b, c or z)`); ok = false; break;
        }
        let j = 0;
        while (j < body.length) {
          let k = j; while (k < body.length && body[k] === body[j]) k++;
          groups.push({ ch: body[j], size: k - j, sv });
          j = k;
        }
      }
      if (!ok) break;
      const total = groups.reduce((s, g) => s + g.size, 0);
      if (total !== 14) errors.push(`Line ${i + 1}: "${at}" has ${total} tiles (should be 14) — kept anyway`);
      alts.push(groups);
    }
    if (!ok) return;
    hands.push({ id: hands.length, section, text: pat.trim(), altTexts, printedIdx, note, points, concealed, shift, free, alts, groups: alts[0] });
  });
  return { hands, errors };
}

// Card-style text: drop suit letters, show "any wind" as N like the card prints it
function plainText(t) {
  return t.split(/\s+/).map(tok => tok.replace(/[abcz]$/, '').replace(/Q/g, 'N')).join(' ');
}

function permutations(arr, k) {
  if (k === 0) return [[]];
  const out = [];
  arr.forEach((x, i) => {
    const rest = arr.slice(0, i).concat(arr.slice(i + 1));
    for (const p of permutations(rest, k - 1)) out.push([x, ...p]);
  });
  return out;
}

// Expand an abstract hand into concrete variants: each is a list of {tile, size}
// a/b/c = distinct suits, z = any suit (may repeat), Q = any wind (one wind per hand)
function injective(n, values) {
  if (n === 0) return [[]];
  const out = [];
  for (const v of values) for (const rest of injective(n - 1, values.filter(x => x !== v))) out.push([v, ...rest]);
  return out;
}
function expandHand(h) {
  const seen = new Set();
  const variants = [];
  (h.alts || [h.groups]).forEach((alt, ai) => {
    const altText = (h.altTexts || [h.text])[ai];
    const vars = [...new Set(alt.map(g => g.sv).filter(v => v && v !== 'z'))].sort();
    const hasZ = alt.some(g => g.sv === 'z');
    const hasQ = alt.some(g => g.ch === 'Q');
    const digitVals = [...new Set(alt.filter(g => /[1-9]/.test(g.ch)).map(g => +g.ch))].sort();
    // number mappings: identity, shifted, or free (each distinct digit -> any distinct number)
    let numMaps = [Object.fromEntries(digitVals.map(d => [d, d]))];
    if (h.free && digitVals.length) {
      numMaps = injective(digitVals.length, [1,2,3,4,5,6,7,8,9]).map(arr => Object.fromEntries(digitVals.map((d, i) => [d, arr[i]])));
    } else if (h.shift && digitVals.length) {
      const lo = digitVals[0], hi = digitVals[digitVals.length - 1];
      for (let o = -(lo - 1); o <= 9 - hi; o++) if (o !== 0 && o % h.shift === 0)
        numMaps.push(Object.fromEntries(digitVals.map(d => [d, d + o])));
    }
    const zOpts = hasZ ? SUITS : [null];
    const qOpts = hasQ ? ['N', 'E', 'W', 'S'] : [null];
    for (const perm of permutations(SUITS, vars.length)) {
      for (const zs of zOpts) for (const q of qOpts) for (const nm of numMaps) {
        const map = { z: zs }; vars.forEach((v, i) => (map[v] = perm[i]));
        const groups = alt.map(g => {
          const s = g.sv ? map[g.sv] : null;
          let tile;
          if (/[1-9]/.test(g.ch)) tile = s + nm[+g.ch];
          else if (g.ch === '0') tile = 'WD';
          else if (g.ch === 'D') tile = SUIT_DRAGON[s];
          else if (g.ch === 'R') tile = 'RD';
          else if (g.ch === 'G') tile = 'GD';
          else if (g.ch === 'Q') tile = q;
          else tile = g.ch; // N E W S F
          return { tile, size: g.size };
        });
        const key = groups.map(g => g.tile + 'x' + g.size).sort().join(',');
        if (seen.has(key)) continue;
        seen.add(key);
        variants.push({ hand: h, groups, text: altText, ai, suitMap: map, q, numMap: nm });
      }
    }
  });
  return variants;
}

function countRack(rack) {
  const c = {};
  for (const t of rack) c[t] = (c[t] || 0) + 1;
  return c;
}

// How far is the rack from a concrete variant?
// Jokers only fill groups of 3+. Returns missing count + detail.
function scoreVariant(v, counts) {
  const need = {}; // tile -> {small, big}
  for (const g of v.groups) {
    need[g.tile] = need[g.tile] || { small: 0, big: 0 };
    if (g.size >= 3) need[g.tile].big += g.size; else need[g.tile].small += g.size;
  }
  let jokers = counts.J || 0;
  let missingSmall = 0, missingBig = 0;
  const used = {}; // naturals used per tile
  const usedSmall = {}; // of those, how many sit in pairs/singles (jokers can't replace them)
  const missingTiles = [];
  for (const [t, n] of Object.entries(need)) {
    const have = counts[t] || 0;
    const useSmall = Math.min(have, n.small);
    const useBig = Math.min(have - useSmall, n.big);
    used[t] = useSmall + useBig;
    usedSmall[t] = useSmall;
    const ms = n.small - useSmall, mb = n.big - useBig;
    missingSmall += ms; missingBig += mb;
    if (ms) missingTiles.push({ tile: t, n: ms, jokerOk: false });
    if (mb) missingTiles.push({ tile: t, n: mb, jokerOk: true });
  }
  const jokersUsed = Math.min(jokers, missingBig);
  const missing = missingSmall + missingBig - jokersUsed;
  return { missing, jokersUsed, used, usedSmall, missingTiles, missingSmall };
}

// Main analysis
function analyze(rack, hands) {
  const counts = countRack(rack);
  const results = [];
  for (const h of hands) {
    let best = null, bestVariants = [];
    for (const v of expandHand(h)) {
      const s = scoreVariant(v, counts);
      if (!best || s.missing < best.missing) { best = s; bestVariants = [{ v, s }]; }
      else if (s.missing === best.missing) bestVariants.push({ v, s });
    }
    if (best) results.push({ hand: h, missing: best.missing, variants: bestVariants });
  }
  results.sort((a, b) => a.missing - b.missing || (b.hand.points || 0) - (a.hand.points || 0));

  // Charleston: score each natural tile copy by how much the top hands want it
  const passable = rack.filter(t => t !== 'J');
  const top = results.length ? results[0].missing : 0;
  const candidates = results.filter(r => r.missing <= top + 2).slice(0, 12);
  const want = {}; // tile -> array of weight per copy index
  const usedBy = {}; // tile -> array (per copy) of Set of candidate results
  const maxNeed = {}; // tile -> most copies any candidate needs
  for (const r of candidates) {
    const w = Math.pow(0.2, r.missing - top); // closer hands count much more
    const share = w / r.variants.length;
    for (const { s } of r.variants) {
      for (const [t, u] of Object.entries(s.used)) {
        want[t] = want[t] || [];
        usedBy[t] = usedBy[t] || [];
        maxNeed[t] = Math.max(maxNeed[t] || 0, u);
        for (let i = 0; i < u; i++) {
          // a tile in a pair/single is worth more: a joker can't stand in for it later
          want[t][i] = (want[t][i] || 0) + share * (i < (s.usedSmall[t] || 0) ? 2 : 1);
          (usedBy[t][i] = usedBy[t][i] || new Set()).add(r);
        }
      }
    }
  }
  // Is a tile in ANY hand on the card (any variant)?
  const anywhere = new Set();
  for (const r of results) for (const v of expandHand(r.hand)) for (const g of v.groups) anywhere.add(g.tile);

  const copies = [];
  const seenIdx = {};
  for (const t of passable) {
    const i = seenIdx[t] = (seenIdx[t] ?? -1) + 1;
    const by = usedBy[t] && usedBy[t][i] ? [...usedBy[t][i]] : [];
    copies.push({ tile: t, idx: i, score: (want[t] && want[t][i]) || 0, by });
  }
  copies.sort((a, b) => a.score - b.score);
  // Pick greedily; each pick makes more copies of that same tile costlier,
  // so a forced pass is spread across groups instead of gutting one.
  const pool = copies.map(c => ({ ...c, eff: c.score }));
  const pass = [];
  while (pass.length < 3 && pool.length) {
    pool.sort((a, b) => a.eff - b.eff);
    const pick = pool.shift();
    pass.push(pick);
    pool.forEach(c => { if (c.tile === pick.tile) c.eff *= 1.6; });
  }

  // Explain each pass
  for (const p of pass) {
    const have = counts[p.tile];
    const keepingPairAfter = have - pass.filter(q => q.tile === p.tile).length;
    if (!anywhere.has(p.tile)) p.why = 'No hand on your card uses this tile at all.';
    else if (p.by.length === 0 && (maxNeed[p.tile] || 0) > 0 && have > maxNeed[p.tile])
      p.why = `You have ${have}. Your closest hands never need more than ${maxNeed[p.tile]}, so this one is extra.`;
    else if (p.by.length === 0) p.why = 'Some hands use it, but none of your closest ones do.';
    else {
      const best = p.by.sort((a, b) => a.missing - b.missing)[0];
      const bv = best.variants[0].v;
      const bt = plainText(bv.hand.altTexts[bv.hand.printedIdx[bv.ai]]);
      if (best.missing === top)
        p.why = `Your best hand (${bt}) uses this, but every other tile helps more of your hands. If you’d rather not break up your best hand, consider a blind pass on the last pass instead.`;
      else p.why = p.by.length === 1
        ? `Only helps ${bt} (${best.missing} away). Your best is ${top} away.`
        : `Helps ${p.by.length} of your closer hands, but less than anything else you hold.`;
    }
    if (have >= 2 && keepingPairAfter < have && keepingPairAfter < 2 && p.tile !== 'F')
      p.warn = 'This breaks up a pair. Pairs are worth guarding because jokers can’t fill them. It’s safe to pass only because your closest hands don’t need it.';
  }

  // Keepers: tiles that serve the most candidate hands
  const keepMap = {};
  for (const c of copies) {
    if (!c.by.length) continue;
    const k = keepMap[c.tile] || (keepMap[c.tile] = { tile: c.tile, hands: new Set(), score: 0 });
    c.by.forEach(r => k.hands.add(r)); k.score += c.score;
  }
  const keepers = Object.values(keepMap)
    .map(k => ({ tile: k.tile, n: k.hands.size, score: k.score }))
    .sort((a, b) => b.score - a.score).slice(0, 3);
  const flexible = results.filter(r => r.missing <= top + 2).length;

  // Section lean
  const sections = {};
  for (const r of results) {
    const s = r.hand.section;
    if (!sections[s] || r.missing < sections[s].missing) sections[s] = { section: s, missing: r.missing, hand: r.hand };
  }
  const sectionList = Object.values(sections).sort((a, b) => a.missing - b.missing);

  return { results, pass, copies, keepers, flexible, jokers: counts.J || 0, sections: sectionList };
}

if (typeof module !== 'undefined') module.exports = { parseCard, expandHand, analyze, tileLabel, plainText };
