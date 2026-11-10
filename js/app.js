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

const STORE_CARD = 'mj-card-v1', STORE_RACK = 'mj-rack-v1';
function load(k){ try { return localStorage.getItem(k); } catch(e){ return null; } }
function save(k,v){ try { localStorage.setItem(k,v); } catch(e){} }

let cardText = load(STORE_CARD) || SAMPLE;
let rack = []; try { rack = JSON.parse(load(STORE_RACK) || '[]'); } catch(e){ rack = []; }
let hands = parseCard(cardText).hands;
let history = [], showAll = false, last = null;

const SUIT_SHORT = {B:'BAM',C:'CRAK',D:'DOT'};
function tileHTML(id, extra='', inner='') {
  let cls='H', n='', s='';
  if (id==='J'){cls='J';n='J';s='JOKER';}
  else if (id==='F'){n='✿';s='FLOWER';}
  else if (id==='GD'){cls='B';n='G';s='DRAGON';}
  else if (id==='RD'){cls='C';n='R';s='DRAGON';}
  else if (id==='WD'){cls='D';n='0';s='SOAP';}
  else if ('NEWS'.includes(id)&&id.length===1){n=id;s='WIND';}
  else {cls=id[0];n=id[1];s=SUIT_SHORT[id[0]];}
  return `<div class="tile ${cls} ${extra}" data-t="${id}"><span class="n">${n}</span><span class="s">${s}</span>${inner}</div>`;
}
const ORDER = [...['B','C','D'].flatMap(s=>[1,2,3,4,5,6,7,8,9].map(n=>s+n)),'GD','RD','WD','N','E','W','S','F','J'];
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
function openSheet(title, html){ document.getElementById('shTitle').textContent = title; document.getElementById('shBody').innerHTML = html; bg.hidden = false; }
function closeSheet(){ bg.hidden = true; }
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
  document.getElementById('fmtBtn').onclick = ()=>{ const f=document.getElementById('fmt'); f.hidden=!f.hidden; };
  document.getElementById('sampleCard').onclick = ()=>{ ta.value = SAMPLE; msg(); };
  document.getElementById('saveCard').onclick = ()=>{ cardText = ta.value; hands = parseCard(cardText).hands; save(STORE_CARD, cardText); closeSheet(); render(); };
}
document.getElementById('openRules').onclick = ()=>openRules();
document.getElementById('openCard').onclick = openCard;

function buildPicker(){
  const rows = [
    [1,2,3,4,5,6,7,8,9].map(n=>'B'+n), [1,2,3,4,5,6,7,8,9].map(n=>'C'+n),
    [1,2,3,4,5,6,7,8,9].map(n=>'D'+n), ['GD','RD','WD','N','E','W','S','F','J']];
  document.getElementById('picker').innerHTML = rows.map(r=>`<div class="row">${r.map(t=>tileHTML(t)).join('')}</div>`).join('');
}

function handTips(h, s){
  const t = [];
  if (h.concealed) t.push('Concealed: you can only call your winning tile.');
  if (s.missingSmall) t.push(`${s.missingSmall} missing tile${s.missingSmall>1?'s are':' is'} in a pair or single, so ${s.missingSmall>1?'they need':'it needs'} the real tile. No jokers.`);
  if (s.jokersUsed) t.push(`Uses ${s.jokersUsed} of your jokers.`);
  return t;
}

function miniHand(v, counts){
  const avail = {...counts}; let jk = avail.J||0; const out = [];
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
  document.getElementById('count').textContent = rack.length + (rack.length ? '' : '');
  const res = (rack.length >= 4 && hands.length) ? analyze(rack, hands) : null;
  last = res;

  const marks = {};
  if (res) res.pass.forEach(p=>marks[p.tile]=(marks[p.tile]||0)+1);
  document.getElementById('rack').innerHTML = rack.length
    ? rack.map((t,i)=>{ let extra=''; if(marks[t]){extra='pass';marks[t]--;} return tileHTML(t,extra).replace('class="tile','data-i="'+i+'" class="tile'); }).join('')
    : `<span class="empty">${hands.length ? 'Tap tiles below, or Deal a practice hand' : 'Add your card first (top right)'}</span>`;

  document.getElementById('results').hidden = !res;
  if (!res) return;

  document.getElementById('pass').innerHTML = res.pass.map((p,i)=>tileHTML(p.tile,'',`<span class="q">?</span>`).replace('class="tile','data-p="'+i+'" class="tile')).join('');
  document.getElementById('keep').innerHTML = res.keepers.length
    ? `<span class="lbl">Keep</span><div class="mini">${res.keepers.map(k=>tileHTML(k.tile)).join('')}</div>` : '';
  document.getElementById('keep').hidden = !res.keepers.length;

  document.getElementById('lean').innerHTML = res.sections.slice(0,3).map(s=>{
    const pct = Math.max(4, Math.round(100*(14 - s.missing)/14));
    return `<div><div class="leanitem"><span>${esc(s.section)}</span><span>${s.missing} away</span></div><div class="bar"><i style="width:${pct}%"></i></div></div>`;
  }).join('');
  document.getElementById('tipBtn').hidden = !coachTips(res).length;

  const counts = {}; rack.forEach(t=>counts[t]=(counts[t]||0)+1);
  const list = res.results.slice(0, showAll ? 8 : 3);
  document.getElementById('hands').innerHTML = list.map((r,i)=>{
    const {v,s} = r.variants[0];
    const hasTips = handTips(r.hand, s).length;
    return `<button class="hand" data-h="${i}"><div class="top"><b>${esc(r.hand.section)}${hasTips?'<span class="dot"></span>':''}</b><span>${r.missing} away</span></div><div class="line">${printedHTML(r.hand, v.ai)}${(()=>{const y=concreteText(r.hand.altTexts[v.ai], v), p=plainText(r.hand.altTexts[r.hand.printedIdx[v.ai]]); return y!==p?` <span class="yours">→ ${esc(y)}</span>`:'';})()}</div>${miniHand(v,counts)}</button>`;
  }).join('');
  document.getElementById('moreBtn').textContent = showAll ? 'Show less' : 'Show more';
  document.getElementById('moreBtn').hidden = res.results.length <= 3;
}

function coachTips(res){
  const best = res.results[0], tips = [];
  if (res.flexible >= 4) tips.push(`${res.flexible} hands are within 2 tiles of your best. Stay flexible.`);
  else if (res.flexible <= 2 && best.missing <= 6) tips.push(`Only ${res.flexible===1?'one hand is':'a couple of hands are'} close. Start committing to <b>${esc(best.hand.section)}</b>.`);
  if (res.jokers >= 2) tips.push(`${res.jokers} jokers: favor hands with big groups.`);
  if (rack.length === 14) tips.push('14 tiles means you’re East. You discard first.');
  return tips;
}

// ---- events ----
document.getElementById('picker').addEventListener('click', e=>{
  const t = e.target.closest('.tile'); if(!t) return;
  const id = t.dataset.t;
  if (rack.length >= 14) return;
  if (rack.filter(x=>x===id).length >= (id==='J'||id==='F'?8:4)) return;
  history.push([...rack]); rack.push(id); render();
});
document.getElementById('rack').addEventListener('click', e=>{
  const t = e.target.closest('.tile'); if(!t || t.dataset.i===undefined) return;
  history.push([...rack]); rack.splice(+t.dataset.i,1); render();
});
document.getElementById('pass').addEventListener('click', e=>{
  const t = e.target.closest('.tile'); if(!t||!last) return;
  const p = last.pass[+t.dataset.p];
  openSheet('Why pass this?', `<div class="big" style="margin-bottom:6px">${tileHTML(p.tile)}</div><p>${esc(p.why)}</p>${p.warn?`<div class="warn">⚠️ ${esc(p.warn)}</div>`:''}`);
});
document.getElementById('hands').addEventListener('click', e=>{
  const b = e.target.closest('.hand'); if(!b||!last) return;
  const r = last.results[+b.dataset.h], {v,s} = r.variants[0], h = r.hand;
  const counts = {}; rack.forEach(t=>counts[t]=(counts[t]||0)+1);
  const meta = [h.points!=null?h.points+' pts':null, h.concealed?'Concealed':'Exposed', r.missing+' away'].filter(Boolean).join(' · ');
  const tips = handTips(h, s), why = whyList(h, v);
  openSheet(h.section, `<div class="cardline">${printedHTML(h, v.ai)}${h.note?`<div class="noteline">(${esc(h.note)})</div>`:''}<div class="help">${meta}</div></div>
    <div class="lbl2">Your version</div>${miniHand(v,counts)}<div class="help" style="margin-top:4px">Faded = still needed</div>
    ${why.length?`<div class="lbl2">Why it counts</div><ul>${why.map(t=>`<li>${t}</li>`).join('')}</ul>`:''}
    ${tips.length?`<div class="lbl2">Tips</div><ul>${tips.map(t=>`<li>${t}</li>`).join('')}</ul>`:''}`);
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
document.getElementById('deal').onclick = ()=>{ history.push([...rack]); rack = dealHand(); render(); };
document.getElementById('undo').onclick = ()=>{ if(history.length){ rack = history.pop(); render(); } };
document.getElementById('clear').onclick = ()=>{ if(rack.length){ history.push([...rack]); rack=[]; render(); } };

buildPicker(); render();
