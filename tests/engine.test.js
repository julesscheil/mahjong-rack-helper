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
