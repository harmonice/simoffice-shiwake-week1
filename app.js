// ---- 状態管理（localStorage） ----
const KEY = "simoffice-shiwake-week1";
const initState = () => ({ currentDay: 1, xp: 0, history: [] }); // history: {day, correct, choiceIndex}
const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || initState(); } catch { return initState(); } };
const save = (s) => localStorage.setItem(KEY, JSON.stringify(s));
let state = load();

// ---- 画面要素 ----
const secHome = document.getElementById('home');
const secDay = document.getElementById('day');
const secSummary = document.getElementById('summary');
const dayButtons = document.getElementById('dayButtons');
const xpText = document.getElementById('xpText');
const barFill = document.getElementById('barFill');
const goSummary = document.getElementById('goSummary');

const backHome = document.getElementById('backHome');
const backHome2 = document.getElementById('backHome2');
const dayTitle = document.getElementById('dayTitle');
const questionEl = document.getElementById('question');
const choicesEl = document.getElementById('choices');
const resultEl = document.getElementById('result');
const nextDayBtn = document.getElementById('nextDay');

const scoreLine = document.getElementById('scoreLine');
const hintsEl = document.getElementById('hints');

let problems = null;

// ---- 初期化 ----
async function boot() {
  problems = await fetch('./problems.json').then(r => r.json());
  renderHome();
  wire();
}
function wire() {
  goSummary.onclick = () => show('summary');
  backHome.onclick = () => show('home');
  backHome2.onclick = () => show('home');
  nextDayBtn.onclick = () => { show('home'); };
}
function show(which) {
  secHome.classList.toggle('hidden', which !== 'home');
  secDay.classList.toggle('hidden', which !== 'day');
  secSummary.classList.toggle('hidden', which !== 'summary');
  if (which === 'home') renderHome();
  if (which === 'summary') renderSummary();
}

// ---- Home描画 ----
function renderHome() {
  const xpPct = Math.min(100, Math.round((state.xp / 70) * 100));
  xpText.textContent = `${state.xp} / 70 XP`;
  barFill.style.width = xpPct + '%';

  dayButtons.innerHTML = '';
  for (let d = 1; d <= 6; d++) {
    const done = state.history.some(h => h.day === d);
    const btn = document.createElement('button');
    btn.className = 'daybtn' + (done ? ' done' : '');
    btn.textContent = `Day ${d}（仕訳）` + (done ? ' ✅' : '');
    btn.onclick = () => startDay(d);
    dayButtons.appendChild(btn);
  }
  const sunBtn = document.createElement('button');
  sunBtn.className = 'daybtn';
  sunBtn.textContent = 'Day 7（振り返り）';
  sunBtn.onclick = () => show('summary');
  dayButtons.appendChild(sunBtn);
}

// ---- Day開始 ----
function startDay(day) {
  const prob = problems[`day${day}`];
  if (!prob) return;
  show('day');
  dayTitle.textContent = `Day ${day}`;
  questionEl.textContent = prob.question;
  resultEl.classList.add('hidden');
  resultEl.textContent = '';
  nextDayBtn.classList.add('hidden');

  choicesEl.innerHTML = '';
  prob.choices.forEach((c, idx) => {
    const div = document.createElement('div');
    div.className = 'choice';
    div.innerHTML = `<strong>${['A','B','C'][idx]}.</strong> ${c}`;
    div.onclick = () => choose(day, prob, idx);
    choicesEl.appendChild(div);
  });
}

function choose(day, prob, idx) {
  // 二重回答ガード
  if (Array.from(choicesEl.children).some(ch => ch.classList.contains('correct') || ch.classList.contains('wrong'))) return;

  const isCorrect = (idx === prob.answer);

  // 見た目
  Array.from(choicesEl.children).forEach((ch, i) => {
    if (i === prob.answer) ch.classList.add('correct');
    if (i === idx && i !== prob.answer) ch.classList.add('wrong');
    ch.style.pointerEvents = 'none';
  });

  // --- 加点ロジック（未正解→正解は+10、既に正解済みは加点なし） ---
  const prev = state.history.find(h => h.day === day);
  let awarded = false;

  if (!prev) {
    // 初回答
    if (isCorrect) {
      state.xp = Math.min(70, state.xp + 10);
      awarded = true;
    }
    state.history.push({ day, correct: isCorrect, choiceIndex: idx });
  } else {
    // 再回答：未正解→正解なら加点、正解→再正解は加点なし
    if (!prev.correct && isCorrect) {
      state.xp = Math.min(70, state.xp + 10);
      awarded = true;
    }
    state.history = state.history.map(h => h.day === day ? { ...h, correct: isCorrect, choiceIndex: idx } : h);
  }
  save(state);

  // 結果表示（実際に加点されたかどうかを表示に反映）
  resultEl.classList.remove('hidden');
  const gainText = awarded ? ' +10 XP' : (isCorrect ? '（加点済み）' : '');
  resultEl.innerHTML = `
    <p>${isCorrect ? '✅ 正解！' : '❌ 不正解'}${gainText}</p>
    <p><strong>解説：</strong>${prob.explain}</p>
  `;
  nextDayBtn.classList.remove('hidden');
}

// ---- Summary描画 ----
function renderSummary() {
  const answered = state.history.length;
  const corrects = state.history.filter(h => h.correct).length;
  scoreLine.textContent = `正答 ${corrects} / 6（XP：${state.xp}/70）`;

  // ヒント一覧
  hintsEl.innerHTML = '';
  for (let d = 1; d <= 6; d++) {
    const prob = problems[`day${d}`];
    const h = document.createElement('div');
    h.className = 'hint';
    const you = state.history.find(x => x.day === d);
    h.innerHTML = `<strong>Day ${d}：</strong>${you?.correct ? '✅' : (you ? '❌' : '— 未回答 —')}<br>
      <em>ヒント：</em>${prob.hint}`;
    hintsEl.appendChild(h);
  }
}

boot();
