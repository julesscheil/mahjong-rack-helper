const SAMPLE = `# Sample card (made up, for practice: replace with your card)
# Evens
FF 222a 4444b 666c 88a | 25 X
222a 444a 666a 888a DDa | 25 X
# Consecutive
11a 222a 3333a 444a 55a | 30 C shift
FF 11a 222b 3333c 444a | 25 X shift
# Year
NN EEE WWW SS 2026a | 30 C
FFF 2026a 222b 2026c | 25 X
# Like numbers
FFFF 1111a 11b 1111c | 25 X shift
# Odds
11a 333a 5555b 777b 99c | 25 X
# Winds & Dragons
NNNN EEE WWW SSSS | 25 X
FFF DDDa DDDb DDDc NN | 30 C`;

const RULES = {
  'Jokers': `<ul>
    <li><span class="yes">✓</span> Any group of <b>3 or more</b> identical tiles</li>
    <li><span class="no">✗</span> Pairs or singles (year tiles, single winds)</li>
    <li><span class="no">✗</span> Passing them in the Charleston</li>
    <li>🔄 On your turn, swap a real tile for a joker in any exposed group</li>
    <li>⭐ No jokers in your winning hand = double points (not Singles &amp; Pairs)</li></ul>`,
  'Calling': `<ul>
    <li><span class="yes">✓</span> To complete a group of <b>3 or more</b>, which you then expose</li>
    <li><span class="yes">✓</span> Any tile that wins the game</li>
    <li><span class="no">✗</span> A pair or single, unless it wins</li>
    <li><span class="no">✗</span> Concealed (C) hands: only your winning tile</li>
    <li>🎯 Exposures must match the card exactly: a pung for a pung, a kong for a kong.</li>
    <li>⏱ Call before the next player draws and racks</li>
    <li>🥇 A Mah Jongg call beats an exposure call. A tie goes to whoever is next in turn.</li></ul>`,
  'Charleston': `<ul>
    <li><b>1st (required):</b> right → across → left</li>
    <li><b>2nd (optional):</b> left → across → right. Anyone can stop it.</li>
    <li><b>Courtesy:</b> 0–3 tiles across, if you both agree</li>
    <li><b>Blind pass:</b> on the last pass of each round, you can pass along tiles you just received, unseen</li></ul>`,
  'Card': `<ul>
    <li>Colors = <b>different</b> suits, and you choose which</li>
    <li>0 = Soap (white dragon)</li>
    <li>Green ↔ Bam · Red ↔ Crak · Soap ↔ Dot</li>
    <li><b>X</b> = exposed · <b>C</b> = concealed</li></ul>`,
  'Strategy': `<ul>
    <li>Keep 2–3 hands in mind during the Charleston</li>
    <li>Already holding the pairs? That hand is worth chasing.</li>
    <li>2+ jokers? Favor hands with big groups</li>
    <li>Hang onto flowers until you know you don’t need them</li>
    <li>All 4 of a tile gone? Hands needing a pair of it are dead.</li></ul>`
};

const STORE_CARD = 'mj-card-v1', STORE_RACK = 'mj-rack-v1', STORE_EXP = 'mj-exposed-v1';
function load(k){ try { return localStorage.getItem(k); } catch(e){ return null; } }
function save(k,v){ try { localStorage.setItem(k,v); } catch(e){} }

let cardText = load(STORE_CARD) || SAMPLE;
let rack = []; try { rack = JSON.parse(load(STORE_RACK) || '[]'); } catch(e){ rack = []; }
// Called groups on the table: [{tile, size, jokers}]
let exposed = []; try { exposed = JSON.parse(load(STORE_EXP) || '[]'); if (!Array.isArray(exposed)) exposed = []; } catch(e){ exposed = []; }
let hands = parseCard(cardText).hands;
let history = [], showAll = false, last = null;
// Undo restores the rack and exposures together
const snapshot = () => history.push({ rack: [...rack], exposed: exposed.map(e=>({...e})) });
const exposedCount = () => exposed.reduce((s,e)=>s+e.size, 0);
// Tiles of each kind already on the table (exposures), for the 4-of-each limit
function exposedTiles(){ const c = {}; for (const e of exposed){ c[e.tile]=(c[e.tile]||0)+e.size-e.jokers; c.J=(c.J||0)+e.jokers; } return c; }
let fx = null, prevPass = '', prevBars = {}, wasMahj = false, removing = false;
// Heatmap focus: a section name, or null. A temporary view: cleared whenever the rack, exposures or card change.
let focusSection = null, focusSig = '';

const SUIT_SHORT = {B:'BAM',C:'CRAK',D:'DOT'};
function tileHTML(id, extra='', inner='') {
  let cls='H', n='', s='';
  if (id==='J'){cls='J';n='J';s='JOKER';}
  else if (id==='F'){cls='F';n='✿';s='FLOWER';}
  else if (id==='GD'){cls='B';n='發';s='GREEN';}
  else if (id==='RD'){cls='C';n='中';s='RED';}
  else if (id==='WD'){cls='D soap';n='<i>0</i>';s='SOAP';}
  else if ('NEWS'.includes(id)&&id.length===1){n=id;s='WIND';}
  else if (id==='B1'){cls='B bird';n='🦚';s='BAM';inner='<span class="ix">1</span>'+inner;}
  else {cls=id[0];n=id[1];s=SUIT_SHORT[id[0]];}
  return `<div class="tile ${cls} ${extra}" data-t="${id}"><span class="n">${n}</span><span class="s">${s}</span>${inner}</div>`;
}
// Rack order: each suit 1–9 followed by its dragon (Bam→Green, Crak→Red, Dot→Soap), then winds, flowers, jokers on the right
const ORDER = [...[['B','GD'],['C','RD'],['D','WD']].flatMap(([s,d])=>[...[1,2,3,4,5,6,7,8,9].map(n=>s+n), d]),'N','E','W','S','F','J'];
const ord = t => ORDER.indexOf(t);
const SUIT_FULL = {B:'Bam', C:'Crak', D:'Dot'};
const DRAGON_NAME = {GD:'Green', RD:'Red', WD:'Soap'};
const COLOR_NAME = {g:'Green', r:'Red', k:'Black'};

// Which printed color each suit letter has on the card line
function colorMap(altText){
  const vars = [...new Set((altText.match(/[abc](?=\s|$)/g) || []))];
  if (vars.length <= 1) return {a:'k', b:'k', c:'k', z:'k'};
  return {a:'g', b:'r', c:'k', z:'k'};
}

// The line as printed on the card, in its colors
function printedHTML(h, ai){
  const t = h.altTexts[h.printedIdx[ai]];
  const cm = colorMap(t);
  return `<span class="printed">${t.split(/\s+/).map(tok=>{
    const m = tok.match(/[abcz]$/);
    return `<span class="c${m?cm[m[0]]:'k'}">${esc(plainText(tok))}</span>`;
  }).join(' ')}</span>`;
}

// The line with your actual numbers / wind filled in, e.g. 1234 DDD → 3456 DDD
function concreteText(altText, v){
  return altText.split(/\s+/).map(tok=>tok.replace(/[abcz]$/,'')
    .replace(/[1-9]/g, d=>String((v.numMap||{})[d] ?? d))
    .replace(/Q/g, v.q || 'N')).join(' ');
}

// Break a card note into clauses: "Any 4 Consec. Nos. in Any 1 Suit, Any 3 Dragons"
// -> ["Any 4 Consec. Nos.", "Any 1 Suit", "Any 3 Dragons"]
function noteClauses(note){
  return (note||'').split(/,\s+(?!or\b)(?=[A-Za-z])|\s+in\s+|\s+w\s+/i).map(s=>s.trim()).filter(Boolean);
}
function findClause(clauses, re){ return clauses.find(c=>re.test(c)); }
function because(...cs){
  const list = [...new Set(cs.filter(Boolean))];
  return list.length ? ` <span class="because">${list.map(c=>`“${esc(c)}”`).join(' + ')}</span>` : '';
}

// Why this concrete version counts, each reason tied to the part of the note that allows it
function whyList(h, v){
  const out = [];
  const cl = noteClauses(h.note);
  const numClause = findClause(cl, /consec|like|nos\.?|odd|even|run/i);
  const optClause = findClause(cl, /kong|pair/i);
  const suitClause = findClause(cl, /suit/i);
  const dragonClause = findClause(cl, /dragon|\bDs\b/i);
  const windClause = findClause(cl, /wind/i);

  const actual = h.altTexts[v.ai], printedI = h.printedIdx[v.ai];
  const derived = printedI !== v.ai;
  const moved = Object.entries(v.numMap||{}).filter(([d,n])=>+d!==n);
  const yours = concreteText(actual, v), printed = plainText(h.altTexts[printedI]);
  if (yours !== printed)
    out.push(`You’d play it as <b>${esc(yours)}</b> instead of <b>${esc(printed)}</b>` +
      because(derived ? optClause : null, moved.length ? numClause : null, v.q ? windClause : null));

  const cm = colorMap(h.altTexts[printedI]);
  const toks = actual.split(/\s+/);
  const vars = [...new Set((actual.match(/[abc](?=\s|$)/g) || []))].sort();
  const varHasNums = x => toks.some(t => t.endsWith(x) && /[1-9]/.test(t));
  const varHasDragon = x => toks.some(t => t.endsWith(x) && /D/.test(t));
  const DR = {B:'GD', C:'RD', D:'WD'};
  const desc = x => varHasNums(x) ? `<b>${SUIT_FULL[v.suitMap[x]]}</b>` : `<b>${DRAGON_NAME[DR[v.suitMap[x]]]} dragon</b>`;
  const anyNums = vars.some(varHasNums), anyDr = vars.some(varHasDragon);
  const suitBecause = because(anyNums ? suitClause : null, anyDr ? dragonClause : null);
  if (vars.length === 1) out.push((varHasNums(vars[0]) ? `All in ${desc(vars[0])}` : `Dragon: ${desc(vars[0])}`) + suitBecause);
  else if (vars.length > 1) out.push(vars.map(x=>`${COLOR_NAME[cm[x]]} = ${desc(x)}`).join(' · ') + suitBecause);

  if (/z(?=\s|$)/.test(actual)) {
    const zTok = toks.find(t=>/z$/.test(t));
    out.push(/[1-9]/.test(zTok)
      ? `Numbers in <b>${SUIT_FULL[v.suitMap.z]}</b>` + because(suitClause)
      : `Dragon: <b>${DRAGON_NAME[DR[v.suitMap.z]]}</b>` + because(dragonClause));
  }
  if (v.q) out.push(`Wind: <b>${tileLabel(v.q)}</b>` + because(windClause));
  if (moved.length) {
    const deltas = [...new Set(moved.map(([d,n])=>n-d))];
    out.push((deltas.length===1 && Object.keys(v.numMap).length===moved.length
      ? `Numbers moved ${deltas[0]>0?'up':'down'} ${Math.abs(deltas[0])}`
      : 'Numbers: ' + moved.map(([d,n])=>`${d}→<b>${n}</b>`).join(' · ')) + because(numClause));
  }
  return out;
}

function esc(s){return String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));}

// ---- sheet ----
const bg = document.getElementById('sheetBg');
const sheetEl = document.getElementById('sheet');
// secDot: optional heatmap section index, shown as a colored dot before the title
function openSheet(title, html, secDot){ const st = document.getElementById('shTitle'); st.textContent = title;
  if (secDot != null) st.insertAdjacentHTML('afterbegin', `<span class="sd k${secDot}"></span>`); document.getElementById('shBody').innerHTML = html; sheetEl.style.transform = ''; sheetEl.scrollTop = 0; bg.hidden = false; document.body.classList.add('locked'); }
function closeSheet(){ bg.hidden = true; document.body.classList.remove('locked'); }
// Swipe the sheet down to close it
let swipeY = null, swipeD = 0;
sheetEl.addEventListener('touchstart', e=>{
  if (sheetEl.scrollTop > 0 || e.target.closest('textarea,.tabs')) { swipeY = null; return; }
  swipeY = e.touches[0].clientY; swipeD = 0; sheetEl.style.transition = 'none';
}, {passive:true});
sheetEl.addEventListener('touchmove', e=>{
  if (swipeY === null) return;
  swipeD = Math.max(0, e.touches[0].clientY - swipeY);
  sheetEl.style.transform = swipeD ? `translateY(${swipeD}px)` : '';
}, {passive:true});
sheetEl.addEventListener('touchend', ()=>{
  if (swipeY === null) return;
  sheetEl.style.transition = ''; swipeY = null;
  if (swipeD > 90) closeSheet(); else sheetEl.style.transform = '';
});
bg.addEventListener('click', e=>{ if(e.target===bg) closeSheet(); });
document.getElementById('shClose').onclick = closeSheet;

function openRules(tab='Jokers'){
  const tabs = Object.keys(RULES).map(k=>`<button class="${k===tab?'on':''}" data-tab="${k}">${k}</button>`).join('');
  openSheet('Quick rules', `<div class="tabs">${tabs}</div>${RULES[tab]}`);
  document.querySelectorAll('.tabs button').forEach(b=>b.onclick=()=>openRules(b.dataset.tab));
}
function openCard(){
  openSheet('Your card', `
    <textarea id="cardText" spellcheck="false">${esc(cardText)}</textarea>
    <div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap">
      <button class="pill accent" id="saveCard">Save</button>
      <button class="pill" id="importBtn">Import file</button>
      <input type="file" id="importFile" accept=".txt,text/plain" hidden>
      <button class="pill" id="sampleCard">Sample</button>
      <button class="pill" id="fmtBtn">Format help</button></div>
    <div id="cardMsg"></div>
    <div class="help" id="fmt" hidden style="margin-top:10px">
      One hand per line · <code># Section</code> starts a section<br>
      <code>1–9</code> + suit <code>a</code>/<code>b</code>/<code>c</code> (different suits) or <code>z</code> (any suit) · <code>0</code> Soap · <code>D</code> dragon of that suit · <code>R</code>/<code>G</code> · <code>NEWS</code> · <code>Q</code> any wind · <code>F</code><br>
      Alternatives: <code>pattern or pattern</code><br>
      After <code>|</code>: points, <code>X</code>/<code>C</code>, <code>shift</code> (any run or like number), <code>shift2</code> (odd/even), <code>free</code> (any different numbers)<br>
      e.g. <code>FF 222a 4444b 666c 88a | 25 X</code></div>`);
  const ta = document.getElementById('cardText');
  const msg = ()=>{ const {hands:h, errors} = parseCard(ta.value);
    document.getElementById('cardMsg').innerHTML = (errors.length?`<div class="err">${errors.map(esc).join('<br>')}</div>`:'')+`<div class="ok">${h.length} hands read</div>`; };
  msg(); ta.oninput = msg;
  const fileIn = document.getElementById('importFile');
  document.getElementById('importBtn').onclick = ()=>fileIn.click();
  fileIn.onchange = ()=>{
    const f = fileIn.files && fileIn.files[0]; if (!f) return;
    const rd = new FileReader();
    rd.onload = ()=>{
      ta.value = String(rd.result || '');
      const {hands:h, errors} = parseCard(ta.value);
      if (h.length) { cardText = ta.value; hands = h; save(STORE_CARD, cardText); render(); }
      msg();
      document.getElementById('cardMsg').insertAdjacentHTML('afterbegin',
        h.length ? `<div class="ok"><b>Imported ${esc(f.name)}</b>: ${h.length} hands saved</div>`
                 : `<div class="err">No hands found in ${esc(f.name)}</div>`);
    };
    rd.onerror = ()=>{ document.getElementById('cardMsg').innerHTML = '<div class="err">Couldn’t read that file</div>'; };
    rd.readAsText(f);
    fileIn.value = '';
  };
  document.getElementById('fmtBtn').onclick = ()=>{ const f=document.getElementById('fmt'); f.hidden=!f.hidden; };
  document.getElementById('sampleCard').onclick = ()=>{ ta.value = SAMPLE; msg(); };
  document.getElementById('saveCard').onclick = ()=>{ cardText = ta.value; hands = parseCard(cardText).hands; save(STORE_CARD, cardText); closeSheet(); render(); };
}
document.getElementById('openRules').onclick = ()=>openRules();
document.getElementById('openCard').onclick = openCard;

// Compact 4-row tile grid (Bam, Crak, Dot, honors), shared by the picker and the Call? sheet
function tileGrid(withJoker=true){
  const rows = [
    [1,2,3,4,5,6,7,8,9].map(n=>'B'+n), [1,2,3,4,5,6,7,8,9].map(n=>'C'+n),
    [1,2,3,4,5,6,7,8,9].map(n=>'D'+n), ['GD','RD','WD','N','E','W','S','F',...(withJoker?['J']:[])]];
  return rows.map(r=>`<div class="row">${r.map(t=>tileHTML(t)).join('')}</div>`).join('');
}
function buildPicker(){ document.getElementById('picker').innerHTML = tileGrid(); }

function handTips(h, s){
  const t = [];
  if (h.concealed) t.push('Concealed: you can only call your winning tile.');
  if (s.missingSmall) t.push(`${s.missingSmall} missing tile${s.missingSmall>1?'s are':' is'} in a pair or single, so ${s.missingSmall>1?'they need':'it needs'} the real tile. No jokers.`);
  if (s.jokersUsed) t.push(`Uses ${s.jokersUsed} of your jokers.`);
  return t;
}

function miniHand(v, counts){
  const avail = {...counts}; let jk = avail.J||0; const out = [];
  // Exposed groups first (v.exposed lines up with the exposures list)
  (v.exposed||[]).forEach((g,k)=>{ const j = (exposed[k]||{}).jokers||0;
    for (let i=0;i<g.size;i++) out.push(tileHTML(i < g.size-j ? g.tile : 'J', 'xp')); });
  for (const g of v.groups) for (let i=0;i<g.size;i++){
    if (avail[g.tile]>0){avail[g.tile]--; out.push(tileHTML(g.tile));}
    else if (g.size>=3 && jk>0){jk--; out.push(tileHTML('J'));}
    else out.push(tileHTML(g.tile,'miss'));
  }
  return `<div class="mini">${out.join('')}</div>`;
}

function render(){
  rack.sort((a,b)=>ord(a)-ord(b));
  save(STORE_RACK, JSON.stringify(rack));
  save(STORE_EXP, JSON.stringify(exposed));
  const xp = exposedCount(), total = rack.length + xp, onTable = exposedTiles();
  document.getElementById('count').textContent = rack.length;
  const res = (total >= 4 && hands.length) ? analyze(rack, hands, exposed) : null;
  last = res;
  const counts = {}; rack.forEach(t=>counts[t]=(counts[t]||0)+1);
  const playing = exposed.length > 0;

  // Charleston: outline the 3 passes. After a call: outline the discard, only while you hold 14.
  const marks = {};
  if (res && total >= 13 && (!playing || total >= 14)) res.pass.forEach(p=>marks[p.tile]=(marks[p.tile]||0)+1);
  const newIdx = fx && fx.type==='add' ? rack.lastIndexOf(fx.id) : -1;
  const dealing = fx && fx.type==='deal';
  fx = null;
  const sig = JSON.stringify([rack, exposed, cardText]);
  if (sig !== focusSig) { focusSection = null; focusSig = sig; }
  // Which top sections use each tile copy (copies line up with the sorted rack), for tap-to-focus
  const heat = res && res.heat.sections.length ? res.heat : null;
  document.getElementById('rack').innerHTML =
    rack.map((t,i)=>{ let extra='', inner=''; if(marks[t]){extra='pass';marks[t]--; if (playing) inner='<span class="dl">discard</span>';}
      if (i===newIdx) extra+=' new'; if (dealing) extra+=' deal';
      const c = heat && heat.copies[i], secs = !c ? '' : c.secs === 'any' ? 'any' : c.secs.join(' ');
      return tileHTML(t,extra,inner).replace('class="tile',`data-i="${i}" data-secs="${secs}" style="--i:${i}" class="tile`); }).join('')
    + '<div class="slot"></div>'.repeat(Math.max(0, 14 - total))
    + (total ? '' : `<span class="empty">${hands.length ? 'Tap tiles below, or 🎲 Practice' : 'Add your card first (top right)'}</span>`);

  document.querySelectorAll('#picker .tile').forEach(el=>{
    const id = el.dataset.t;
    el.classList.toggle('maxed', total >= 14 || (counts[id]||0) + (onTable[id]||0) >= maxOf(id));
  });

  // Exposed groups: mini tiles, separate from the concealed rack. Undo is the way back.
  const expEl = document.getElementById('exposed');
  expEl.hidden = !playing;
  expEl.innerHTML = playing ? `<span class="lbl">Exposed</span>${exposed.map(e=>
    `<div class="mini">${Array.from({length:e.size},(_,i)=>tileHTML(i < e.size-e.jokers ? e.tile : 'J')).join('')}</div>`).join('')}` : '';
  document.getElementById('callBtn').hidden = !(hands.length && rack.length);
  document.getElementById('deal').hidden = total > 0; // Practice only on a clear board
  document.getElementById('passLbl').textContent = playing ? 'Discard' : 'Pass';
  // Pass / Discard only once the whole hand is in (13, or 14 for East); exposed tiles count
  document.getElementById('passbox').hidden = total < 13;

  document.getElementById('results').hidden = !res;
  if (!res) { prevPass = ''; prevBars = {}; wasMahj = false; return; }

  const psig = res.pass.map(p=>p.tile).join();
  const flip = psig !== prevPass; prevPass = psig;
  document.getElementById('pass').innerHTML = res.pass.map((p,i)=>tileHTML(p.tile, flip?'flip':'', `<span class="q">?</span>`).replace('class="tile',`data-p="${i}" style="--i:${i}" class="tile`)).join('');
  document.getElementById('keep').innerHTML = res.keepers.length
    ? `<span class="lbl">Keep</span><div class="mini">${res.keepers.map(k=>tileHTML(k.tile)).join('')}</div>` : '';
  document.getElementById('keep').hidden = !res.keepers.length;

  const leanEl = document.getElementById('lean'), bars = {};
  const nHeat = heat ? heat.sections.length : 0; // heat sections are the first nHeat of these
  leanEl.innerHTML = res.sections.slice(0,3).map((s,k)=>{
    const pct = Math.max(4, Math.round(100*(14 - s.missing)/14));
    bars[s.section] = pct;
    const inner = `<div class="leanitem"><span>${k<nHeat?`<span class="sd k${k}"></span>`:''}${esc(s.section)}</span>${awayChip(s.missing)}</div><div class="bar"><i class="${k<nHeat?'k'+k:''}" style="width:${prevBars[s.section] ?? 0}%" data-w="${pct}"></i></div>`;
    return k < nHeat
      ? `<button class="leanrow" data-k="${k}" aria-pressed="false" aria-label="Focus ${esc(s.section)}, ${s.missing} away">${inner}</button>`
      : `<div class="leanrow">${inner}</div>`;
  }).join('');
  applyFocus();
  void leanEl.offsetWidth; // let the bars animate from their old width
  leanEl.querySelectorAll('.bar i').forEach(i=>i.style.width = i.dataset.w + '%');
  prevBars = bars;
  document.getElementById('tipBtn').hidden = !coachTips(res).length;

  const list = res.results.slice(0, showAll ? 8 : 3);
  document.getElementById('hands').innerHTML = list.map((r,i)=>{
    const {v,s} = r.variants[0];
    const hasTips = handTips(r.hand, s).length;
    return `<button class="hand" data-h="${i}"><div class="top"><b>${esc(r.hand.section)} <span class="lnum">line ${r.hand.line}</span>${hasTips?'<span class="dot"></span>':''}</b>${awayChip(r.missing)}</div><div class="line">${printedHTML(r.hand, v.ai)}${(()=>{const y=concreteText(r.hand.altTexts[v.ai], v), p=plainText(r.hand.altTexts[r.hand.printedIdx[v.ai]]); return y!==p?` <span class="yours">→ ${esc(y)}</span>`:'';})()}</div>${miniHand(v,counts)}</button>`;
  }).join('');
  document.getElementById('moreBtn').textContent = showAll ? 'Show less' : 'Show more';
  document.getElementById('moreBtn').hidden = res.results.length <= 3;

  const mahj = !!(res.results[0] && res.results[0].missing === 0);
  if (mahj && !wasMahj) celebrate();
  wasMahj = mahj;
}

// Fade rack tiles the focused section doesn't use (jokers never fade), and mark its bar
function applyFocus(){
  const k = last && last.heat ? last.heat.sections.findIndex(x=>x.section===focusSection) : -1;
  if (k < 0) focusSection = null;
  document.querySelectorAll('#rack .tile').forEach(el=>{
    const secs = el.dataset.secs;
    el.classList.toggle('unfocused', k >= 0 && secs !== 'any' && !secs.split(' ').includes(String(k)));
  });
  document.querySelectorAll('#lean button.leanrow').forEach(b=>{
    const on = +b.dataset.k === k;
    b.classList.toggle('on', on); b.setAttribute('aria-pressed', on);
  });
}
document.getElementById('lean').addEventListener('click', e=>{
  const b = e.target.closest('button.leanrow'); if (!b || !last) return;
  const name = last.heat.sections[+b.dataset.k].section;
  focusSection = focusSection === name ? null : name;
  applyFocus();
});

function awayChip(m){
  return m === 0 ? '<span class="away a0">Mah Jongg!</span>' : `<span class="away a${Math.min(m,3)}">${m} away</span>`;
}
const maxOf = id => (id==='J'||id==='F') ? 8 : 4;

function celebrate(){
  try { if (matchMedia('(prefers-reduced-motion: reduce)').matches) return; } catch(e){}
  const colors = ['#23824f','#c8312b','#2a5db0','#f2b632','#c2457a'];
  let html = '<div class="mj">Mah Jongg! 🎉</div>';
  for (let i=0;i<70;i++) html += `<i style="left:${Math.random()*100}%;background:${colors[i%5]};animation-delay:${(Math.random()*.5).toFixed(2)}s;--x:${Math.round((Math.random()*2-1)*90)}px;--r:${Math.round(Math.random()*900)}deg"></i>`;
  const box = document.createElement('div'); box.className = 'party'; box.innerHTML = html;
  document.body.appendChild(box);
  setTimeout(()=>box.remove(), 2600);
}

function coachTips(res){
  const best = res.results[0], tips = [];
  if (!best) return exposed.length ? ['No hand on your card fits what you’ve exposed. Undo if that was a mistake.'] : [];
  if (res.flexible >= 4) tips.push(`${res.flexible} hands are within 2 tiles of your best. Stay flexible.`);
  else if (res.flexible <= 2 && best.missing <= 6) tips.push(`Only ${res.flexible===1?'one hand is':'a couple of hands are'} close. Start committing to <b>${esc(best.hand.section)}</b>.`);
  if (res.jokers >= 2) tips.push(`${res.jokers} jokers: favor hands with big groups.`);
  if (rack.length === 14 && !exposed.length) tips.push('14 tiles means you’re East. You discard first.');
  return tips;
}

// ---- Should I call it? ----
const VERDICT = {
  mahjong: ['🟢', 'Call it: Mah Jongg!', 'v-mj'],
  good:    ['🟢', 'Good call', 'v-good'],
  maybe:   ['🟡', 'Maybe', 'v-maybe'],
  no:      ['🔴', 'Don’t call', 'v-no'],
};
const GROUP = {3:'pung', 4:'kong', 5:'quint', 6:'sextet'};
const handName = r => plainText(r.hand.altTexts[r.hand.printedIdx[r.variants[0].v.ai]]);
const exposeTiles = e => Array.from({length:e.size}, (_,i)=>tileHTML(i < e.naturals ? e.tile : 'J')).join('');

function openCall(){
  if (rack.length + exposedCount() >= 14) {
    openSheet('Call?', `<p>You have 14 tiles. Discard first.</p><div class="vbtns"><button class="pill" id="cClose">Close</button></div>`);
    document.getElementById('cClose').onclick = closeSheet;
    return;
  }
  openSheet('Which tile was discarded?', `<div class="picker callgrid">${tileGrid(false)}</div>`);
  const seen = {...exposedTiles()}; rack.forEach(t=>seen[t]=(seen[t]||0)+1);
  const grid = document.querySelector('#shBody .callgrid');
  grid.querySelectorAll('.tile').forEach(el=>el.classList.toggle('maxed', (seen[el.dataset.t]||0) >= maxOf(el.dataset.t)));
  grid.onclick = e=>{ const t = e.target.closest('.tile'); if (t && !t.classList.contains('maxed')) showVerdict(t.dataset.t); };
}

function showVerdict(tile, oi=0){
  const c = evaluateCall(rack, hands, exposed, tile);
  const [icon, label, cls] = VERDICT[c.verdict];
  const o = c.options[oi];
  const rows = [];
  if (c.verdict === 'mahjong') rows.push(['Expose', 'Your whole hand']);
  else if (o && c.verdict !== 'no') {
    rows.push(['Expose', `<div class="mini">${exposeTiles(o.expose)}</div>`]);
    const kept = o.helps.filter(x=>x.after!==null);
    rows.push(['Keeps', kept.length === 1 ? `Commits you to <b>${esc(handName(kept[0].result))}</b>`
      : `Keeps ${kept.length} of your ${o.closeTotal} close hands`]);
    if (o.discard) rows.push(['Then discard', `<div class="mini">${tileHTML(o.discard)}</div>`]);
  }

  // Details: affected hands (printed line, note, "You'd play it as…"), other options, rule reminders
  const handBlock = (r, chip) => { const v = r.variants[0].v, why = whyList(r.hand, v);
    return `<div class="aff"><div class="top"><b>${esc(r.hand.section)}</b>${chip}</div>
      <div class="line">${printedHTML(r.hand, v.ai)}</div>${r.hand.note?`<div class="noteline">(${esc(r.hand.note)})</div>`:''}
      ${why.length?`<ul>${why.map(t=>`<li>${t}</li>`).join('')}</ul>`:''}</div>`; };
  let det = '';
  if (c.win) det += `<div class="lbl2">Your hand</div>${handBlock(c.win, awayChip(0))}`;
  if (o) det += `<div class="lbl2">Your close hands</div>` + o.helps.slice(0,5).map(x=>handBlock(x.result,
    x.after===null ? '<span class="away">dropped</span>' : `<span class="away a${Math.min(x.after,3)}">${x.before} → ${x.after}</span>`)).join('');
  if (c.options.length > 1) det += `<div class="lbl2">Other ways to expose</div><div class="vbtns">${c.options.map((x,i)=>i===oi?'':
    `<button class="pill sm" data-oi="${i}">${esc(tileLabel(tile))} ${GROUP[x.expose.size]||'group'} · ${x.after} away</button>`).join('')}</div>`;
  if (c.reasons.length) det += `<div class="lbl2">Rules</div><ul>${c.reasons.map(t=>`<li>${esc(t)}</li>`).join('')}</ul>`;

  const canRecord = c.verdict === 'mahjong' || !!o;
  openSheet('Call?', `
    <div class="verdict"><div class="big">${tileHTML(tile)}</div>
      <div><span class="badge ${cls}">${icon} ${label}</span><div class="vhead">${esc(c.headline)}</div></div></div>
    ${rows.map(([k,v])=>`<div class="vrow"><span class="vk">${k}</span><span class="vv">${v}</span></div>`).join('')}
    <div class="vbtns">${canRecord?`<button class="pill accent" id="cDid">${c.verdict==='mahjong'?'I called it 🎉':'I called it'}</button>`:''}
      <button class="pill" id="cAgain">Pick another tile</button><button class="pill" id="cClose">Close</button></div>
    ${det?`<button class="dtoggle" id="cDet">Details ▾</button><div id="cDetails" hidden>${det}</div>`:''}`);
  if (canRecord) document.getElementById('cDid').onclick = ()=>recordCall(tile, c.verdict==='mahjong' ? null : o.expose);
  document.getElementById('cAgain').onclick = openCall;
  document.getElementById('cClose').onclick = closeSheet;
  const dt = document.getElementById('cDet');
  if (dt) dt.onclick = ()=>{ const d = document.getElementById('cDetails'); d.hidden = !d.hidden; dt.textContent = d.hidden ? 'Details ▾' : 'Details ▴'; };
  document.querySelectorAll('#cDetails [data-oi]').forEach(b=>b.onclick = ()=>showVerdict(tile, +b.dataset.oi));
}

// Record the call: Mah Jongg takes the tile; an exposure moves its naturals and jokers out of the rack
function recordCall(tile, e){
  snapshot();
  if (!e) rack.push(tile);
  else {
    for (let i=0;i<e.naturals-1;i++) rack.splice(rack.indexOf(tile), 1);
    for (let i=0;i<e.jokers;i++) rack.splice(rack.indexOf('J'), 1);
    exposed.push({ tile, size: e.size, jokers: e.jokers });
  }
  closeSheet(); render();
}

// ---- events ----
document.getElementById('picker').addEventListener('click', e=>{
  const t = e.target.closest('.tile'); if(!t) return;
  const id = t.dataset.t;
  if (rack.length + exposedCount() >= 14 || rack.filter(x=>x===id).length + (exposedTiles()[id]||0) >= maxOf(id)) {
    t.classList.remove('nope'); void t.offsetWidth; t.classList.add('nope'); return;
  }
  snapshot(); rack.push(id); fx = {type:'add', id}; render();
});
document.getElementById('rack').addEventListener('click', e=>{
  const t = e.target.closest('.tile'); if(!t || t.dataset.i===undefined || removing) return;
  removing = true; t.classList.add('out');
  setTimeout(()=>{ snapshot(); rack.splice(+t.dataset.i,1); removing = false; render(); }, 130);
});
document.getElementById('pass').addEventListener('click', e=>{
  const t = e.target.closest('.tile'); if(!t||!last) return;
  const p = last.pass[+t.dataset.p];
  openSheet(exposed.length ? 'Why discard this?' : 'Why pass this?', `<div class="big" style="margin-bottom:6px">${tileHTML(p.tile)}</div><p>${esc(p.why)}</p>${p.warn?`<div class="warn">⚠️ ${esc(p.warn)}</div>`:''}`);
});
document.getElementById('hands').addEventListener('click', e=>{
  const b = e.target.closest('.hand'); if(!b||!last) return;
  const r = last.results[+b.dataset.h], {v,s} = r.variants[0], h = r.hand;
  const counts = {}; rack.forEach(t=>counts[t]=(counts[t]||0)+1);
  const meta = [h.points!=null?h.points+' pts':null, h.concealed?'Concealed':'Exposed', r.missing+' away'].filter(Boolean).join(' · ');
  const tips = handTips(h, s), why = whyList(h, v);
  const k = last.heat.sections.findIndex(x=>x.section===h.section);
  openSheet(`${h.section} · line ${h.line}`, `<div class="cardline">${printedHTML(h, v.ai)}${h.note?`<div class="noteline">(${esc(h.note)})</div>`:''}<div class="help">${meta}</div></div>
    <div class="lbl2">Your version</div>${miniHand(v,counts)}<div class="help" style="margin-top:4px">Faded = still needed</div>
    ${why.length?`<div class="lbl2">Why it counts</div><ul>${why.map(t=>`<li>${t}</li>`).join('')}</ul>`:''}
    ${tips.length?`<div class="lbl2">Tips</div><ul>${tips.map(t=>`<li>${t}</li>`).join('')}</ul>`:''}`, k >= 0 ? k : null);
});
document.getElementById('tipBtn').onclick = ()=>{ if(last) openSheet('Tip', `<ul>${coachTips(last).map(t=>`<li>${t}</li>`).join('')}</ul>`); };
document.getElementById('moreBtn').onclick = ()=>{ showAll=!showAll; render(); };
function dealHand(){
  const wall = [];
  for (const s of ['B','C','D']) for (let n=1;n<=9;n++) for (let i=0;i<4;i++) wall.push(s+n);
  for (const t of ['GD','RD','WD','N','E','W','S']) for (let i=0;i<4;i++) wall.push(t);
  for (let i=0;i<8;i++){ wall.push('F'); wall.push('J'); }
  for (let i=wall.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [wall[i],wall[j]]=[wall[j],wall[i]]; }
  return wall.slice(0,13);
}
document.getElementById('deal').onclick = ()=>{ snapshot(); rack = dealHand(); exposed = []; fx = {type:'deal'}; render(); };
document.getElementById('undo').onclick = ()=>{ if(history.length){ const h = history.pop(); rack = h.rack; exposed = h.exposed; render(); } };
document.getElementById('clear').onclick = ()=>{ if(rack.length || exposed.length){ snapshot(); rack=[]; exposed=[]; render(); } };
document.getElementById('callBtn').onclick = openCall;

buildPicker(); render();
