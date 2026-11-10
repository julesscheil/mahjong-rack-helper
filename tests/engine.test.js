const test = require('node:test');
const assert = require('node:assert');
const { parseCard, analyze } = require('../js/engine.js');

const card = `# Evens
FF 222a 4444b 666c 88a | 25 X
# Consecutive
11a 222a 3333a 444a 55a | 30 C shift`;

test('parses a card', () => {
  const { hands, errors } = parseCard(card);
  assert.strictEqual(hands.length, 2);
  assert.deepStrictEqual(errors, []);
});

test('flags a hand with the wrong tile count', () => {
  const { errors } = parseCard('FF 222a | 25 X');
  assert.match(errors[0], /should be 14/);
});

test('jokers fill groups of 3+ but not pairs', () => {
  const { hands } = parseCard(card);
  // Has everything for the Evens hand except the 88 pair, plus 2 jokers
  const rack = ['F','F','B2','B2','B2','C4','C4','C4','C4','D6','D6','D6','J','J'];
  const best = analyze(rack, hands).results[0];
  assert.strictEqual(best.hand.section, 'Evens');
  assert.strictEqual(best.missing, 2); // pair of 8s can't be jokers
});

test('never suggests passing a joker', () => {
  const { hands } = parseCard(card);
  const rack = ['J','J','J','J','J','J','J','J','N','E','W','S','RD'];
  const { pass } = analyze(rack, hands);
  assert.ok(pass.every(p => p.tile !== 'J'));
});

test('or-alternatives, any wind, any suit and free numbers expand', () => {
  const { hands, errors } = parseCard(`FFF QQQQ FFF DDDDz | 25 X
11111a 44444a DDDDb | 40 X free
NN 1111a 33a 5555a SS or NN 5555a 77a 9999a SS | 30 X`);
  assert.deepStrictEqual(errors, []);
  const { expandHand } = require('../js/engine.js');
  assert.strictEqual(expandHand(hands[0]).length, 12); // 4 winds x 3 dragons
  assert.strictEqual(hands[2].alts.length, 2);
  // a rack holding the 2nd alternative should be 0 away
  const rack = ['N','N','B5','B5','B5','B5','B7','B7','B9','B9','B9','B9','S','S'];
  const r = analyze(rack, [hands[2]]).results[0];
  assert.strictEqual(r.missing, 0);
  assert.match(r.variants[0].v.text, /^NN 5555a/);
});

test('your card parses cleanly', { skip: !require('fs').existsSync(__dirname + '/../my-card.txt') }, () => {
  const txt = require('fs').readFileSync(__dirname + '/../my-card.txt', 'utf8');
  const { errors } = parseCard(txt);
  assert.deepStrictEqual(errors, []);
});

// ---- Calling and exposures (invented hands only) ----
const { evaluateCall, pickTiles, rankHands } = require('../js/engine.js');
const evens = parseCard('# Evens\nFF 222a 4444b 666c 88a | 25 X').hands;
// Everything for Evens except one 6 Crak and the 8 Bam pair
const nearEvens = ['F','F','B2','B2','B2','D4','D4','D4','D4','C6','C6','N','E'];

test('call: a 6 Crak for a pung you hold two of', () => {
  const c = evaluateCall(nearEvens, evens, [], 'C6');
  assert.ok(['good', 'maybe'].includes(c.verdict), c.headline);
  assert.deepStrictEqual(c.options[0].expose, { tile: 'C6', size: 3, naturals: 3, jokers: 0 });
  assert.ok(c.options[0].discard && c.options[0].discard !== 'J');
});

test('call: a joker fills out the exposure', () => {
  const rack = ['F','F','B2','B2','B2','D4','D4','D4','D4','C6','J','B8','N'];
  const c = evaluateCall(rack, evens, [], 'C6');
  assert.deepStrictEqual(c.options[0].expose, { tile: 'C6', size: 3, naturals: 2, jokers: 1 });
});

test('call: a tile your hands only need as a pair is a no', () => {
  const c = evaluateCall(nearEvens, evens, [], 'B8');
  assert.strictEqual(c.verdict, 'no');
  assert.match(c.headline, /pair\/single/);
});

test('call: a tile only a concealed hand uses is a no', () => {
  const { hands } = parseCard('11a 222a 3333a 444a 55a | 30 C');
  const rack = ['B1','B1','B2','B2','B3','B3','B3','B3','B4','B4','B4','N','E'];
  const c = evaluateCall(rack, hands, [], 'B2');
  assert.strictEqual(c.verdict, 'no');
  assert.match(c.headline, /concealed/);
});

test('call: Mah Jongg on a pair tile', () => {
  const rack = ['F','F','B2','B2','B2','D4','D4','D4','D4','C6','C6','C6','B8'];
  assert.strictEqual(evaluateCall(rack, evens, [], 'B8').verdict, 'mahjong');
});

test('exposures: only hands with that exact group, and no concealed hands', () => {
  const { hands } = parseCard(`FF 222a 4444b 666c 88a | 25 X
FF 2222a 44b 6666c 88a | 25 X
FF 222a 4444b 666c 88a | 25 C
NNNN EEE WWW SSSS | 25 X`);
  const res = analyze(['B2','B2','D4','N','E'], hands, [{ tile: 'C6', size: 3, jokers: 0 }]);
  assert.deepStrictEqual(res.results.map(r => r.hand.id), [0]);
  assert.strictEqual(res.pass.length, 1); // with exposures, pick one discard
  // the exposed group is taken out of what's left to collect
  assert.strictEqual(res.results[0].variants[0].v.groups.reduce((s, g) => s + g.size, 0), 11);
});

test('pickTiles(…, 3) matches the Charleston pass', () => {
  const { hands } = parseCard(`# Evens
FF 222a 4444b 666c 88a | 25 X
222a 444a 666a 888a DDa | 25 X
# Consecutive
11a 222a 3333a 444a 55a | 30 C shift
# Odds
11a 333a 5555b 777b 99c | 25 X`);
  const rack = ['F','B2','B2','C4','C4','D6','D7','B9','N','E','RD','J','C1'];
  const picks = pickTiles(rack, rankHands(rack, hands), 3);
  assert.deepStrictEqual(picks.map(p => p.tile), ['D7', 'B9', 'N']); // recorded before the refactor
  assert.deepStrictEqual(analyze(rack, hands).pass.map(p => [p.tile, p.why]), picks.map(p => [p.tile, p.why]));
});

test('call: never a joker, never discard a joker', () => {
  assert.strictEqual(evaluateCall(nearEvens, evens, [], 'J').verdict, 'no');
  const jokery = ['J','J','J','J','C6','F','N','E','W','S','RD','GD','B9'];
  const c = evaluateCall(jokery, evens, [], 'C6');
  assert.ok(c.options.length);
  assert.ok(c.options.every(o => o.discard !== 'J'));
});

test('call: 14 tiles means discard first', () => {
  const c = evaluateCall(['B2','B2','D4','N','E','W','S','F','F','B9','B9'], evens, [{ tile: 'C6', size: 3, jokers: 0 }], 'B2');
  assert.strictEqual(c.verdict, 'no');
  assert.match(c.headline, /Discard first/);
});

// ---- Rack heatmap (invented hands only) ----
const { sectionHeat } = require('../js/engine.js');
const heatCard = parseCard(`# Winds
NNNN EEEE WWW SSS | 25 X
# Mixed
FFFF NNNN RRR GGG | 25 X
# Soap
FFFF 0000 RRR GGG | 25 X
# Far
111a 222a 333a 444a 55a | 25 X`).hands;
const heatRack = ['N','N','E','E','W','S','F','F','RD','GD','B9','J'];
const heatOf = rack => analyze(rack, heatCard).heat;
const secsOf = (heat, tile, idx = 0) => heat.copies.find(c => c.tile === tile && c.idx === idx).secs;

test('heat: a tile two sections use gets both', () => {
  const heat = heatOf(heatRack);
  assert.deepStrictEqual(heat.sections.map(s => s.section), ['Winds', 'Mixed', 'Soap']);
  assert.deepStrictEqual(secsOf(heat, 'N'), [0, 1]);
  assert.deepStrictEqual(secsOf(heat, 'F'), [1, 2]);
  assert.deepStrictEqual(secsOf(heat, 'RD'), [1, 2]);
});

test('heat: extra copies beyond what the best hand needs get no dot', () => {
  const { hands } = parseCard('# Pairs\nNN EEEE WWWW SSSS | 25 X');
  const heat = analyze(['N','N','N','E','W'], hands).heat;
  assert.deepStrictEqual([0, 1, 2].map(i => secsOf(heat, 'N', i)), [[0], [0], []]);
});

test('heat: a tile no top section uses is dead', () => {
  assert.deepStrictEqual(secsOf(heatOf(heatRack), 'B9'), []);
});

test('heat: jokers fit any section', () => {
  const heat = heatOf(['J', ...heatRack, 'J']);
  assert.ok(heat.copies.filter(c => c.tile === 'J').every(c => c.secs === 'any'));
  assert.strictEqual(heat.copies.filter(c => c.tile === 'J').length, 3);
});

test('heat: sections more than best+4 away are left out', () => {
  const heat = heatOf(heatRack);
  assert.ok(!heat.sections.some(s => s.section === 'Far'));
  // direct call with a cutoff that keeps only the closest
  const res = analyze(heatRack, heatCard);
  const only = sectionHeat(heatRack, res.results, res.sections, 1);
  assert.deepStrictEqual(only.sections.map(s => s.section), ['Winds']);
});

test('heat: copies follow the rack order with stable copy indices', () => {
  const heat = heatOf(heatRack);
  assert.deepStrictEqual(heat.copies.map(c => c.tile), heatRack);
  assert.deepStrictEqual(heat.copies.filter(c => c.tile === 'N').map(c => c.idx), [0, 1]);
  assert.deepStrictEqual(heat.copies.filter(c => c.tile === 'E').map(c => c.idx), [0, 1]);
});
