// ---- 状態管理（localStorage） ----
const KEY = "simoffice-shiwake-steps";
const initState = () => ({
  currentStep: 1,         // 1..5
  idxInStep: 0,           // 0..9（10問）
  xp: 0,                  // 最大 50 (= 5step * 10問)
  // 履歴: { step, idx, correct, choiceIndex }
  history: [],
  // 各ステップの正解数（集計に便利）
  stepSummary: { 1:0, 2:0, 3:0, 4:0, 5:0 }
});
const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || initState(); } catch { return initState(); } };
const save = (s) => localStorage.setItem(KEY, JSON.stringify(s));
let state = load();

// ---- 画面要素 ----
const secHome = document.getElementById('home');
const secStep = document.getElementById('step');
const secSummary = document.getElementById('summary');
const stepButtons = document.getElementById('stepButtons');
const xpText = document.getElementById('xpText');
const barFill = document.getElementById('barFill');
const goSummary = document.getElementById('goSummary');

const backHome = document.getElementById('backHome');
const backHome2 = document.getElementById('backHome2');
const stepTitle = document.getElementById('stepTitle');
const stepProg = document.getElementById('stepProg');
const questionEl = document.getElementById('question');
const choicesEl = document.getElementById('choices');
const resultEl = document.getElementById('result');
const nextBtn = document.getElementById('nextBtn');

const scoreLine = document.getElementById('scoreLine');
const breakdownEl = document.getElementById('breakdown');

let steps = null;

// ---- 初期化 ----
async function boot() {
  steps = await fetch('./problems.json').then(r => r.json()).then(j => j.steps);
  renderHome();
  wire();
}
function wire() {
  goSummary.onclick = () => show('summary');
  backHome.onclick = () => show('home');
  backHome2.onclick = () => show('home');
  nextBtn.onclick = () => nextQuestion();
}
function show(which) {
  secHome.classList.toggle('hidden', which !== 'home');
  secStep.classList.toggle('hidden', which !== 'step');
  secSummary.classList.toggle('hidden', which !== 'summary');
  if (which === 'home') renderHome();
  if (which === 'summary') renderSummary();
}

// ---- Home描画 ----
function renderHome() {
  const xpPct = Math.min(100, Math.round((state.xp / 50) * 100));
  xpText.textContent = `${state.xp} / 50 XP`;
  barFill.style.width = xpPct + '%';

  stepButtons.innerHTML = '';
  steps.forEach((st, i) => {
    const stepNo = i + 1;
    const corrects = state.stepSummary[stepNo] || 0;
    const done = corrects >= st.items.length; // 全問正解で完了表示
    const btn = document.createElement('button');
    btn.className = 'daybtn' + (done ? ' done' : '');
    btn.textContent = `Step ${stepNo}（${corrects}/${st.items.length}）` + (done ? ' ✅' : '');
    btn.onclick = () => startStep(stepNo);
    stepButtons.appendChild(btn);
  });
}

// ---- Step開始 ----
function startStep(stepNo) {
  state.currentStep = stepNo;
  // 途中から再開するなら idxInStep を履歴から復元（未回答の最初へ）
  const answeredIdx = state.history
    .filter(h => h.step === stepNo)
    .map(h => h.idx);
  let nextIdx = 0;
  while (answeredIdx.includes(nextIdx)) nextIdx++;
  state.idxInStep = Math.min(nextIdx, steps[stepNo - 1].items.length - 1);
  save(state);
  renderQuestion();
  show('step');
}

function renderQuestion() {
  const stepNo = state.currentStep;
  const idx = state.idxInStep;
  const st = steps[stepNo - 1];
  const item = st.items[idx];
  stepTitle.textContent = `${st.title}（Step ${stepNo}）`;
  stepProg.textContent = `進捗：${idx + 1} / ${st.items.length}`;
  questionEl.textContent = item.q;
  resultEl.classList.add('hidden');
  resultEl.textContent = '';
  nextBtn.classList.add('hidden');

  choicesEl.innerHTML = '';
  item.choices.forEach((c, i) => {
    const div = document.createElement('div');
    div.className = 'choice';
    div.innerHTML = `<strong>${['A','B','C'][i]}.</strong> ${c}`;
    div.onclick = () => choose(stepNo, idx, item, i);
    choicesEl.appendChild(div);
  });
}

function choose(stepNo, idx, item, choiceIndex) {
  // 二重回答ガード
  if (Array.from(choicesEl.children).some(ch => ch.classList.contains('correct') || ch.classList.contains('wrong'))) return;

  const isCorrect = (choiceIndex === item.answer);

  // 見た目
  Array.from(choicesEl.children).forEach((ch, i) => {
    if (i === item.answer) ch.classList.add('correct');
    if (i === choiceIndex && i !== item.answer) ch.classList.add('wrong');
    ch.style.pointerEvents = 'none';
  });

  // 加点（その問題で未正解→正解のときだけ +1）
  const prev = state.history.find(h => h.step === stepNo && h.idx === idx);
  let awarded = false;
  if (!prev) {
    if (isCorrect) { state.xp = Math.min(50, state.xp + 1); awarded = true; state.stepSummary[stepNo] = (state.stepSummary[stepNo] || 0) + 1; }
    state.history.push({ step: stepNo, idx, correct: isCorrect, choiceIndex });
  } else {
    if (!prev.correct && isCorrect) { state.xp = Math.min(50, state.xp + 1); awarded = true; state.stepSummary[stepNo] = (state.stepSummary[stepNo] || 0) + 1; }
    state.history = state.history.map(h => (h.step === stepNo && h.idx === idx) ? { ...h, correct: isCorrect, choiceIndex } : h);
  }
  save(state);

  // 結果表示
  resultEl.classList.remove('hidden');
  resultEl.innerHTML = `
    <p>${isCorrect ? '✅ 正解！' : '❌ 不正解'}${awarded ? ' +1 XP' : (isCorrect ? '（加点済み）' : '')}</p>
    <p><strong>解説：</strong>${item.explain}</p>
  `;
  nextBtn.classList.remove('hidden');
}

function nextQuestion() {
  const stepNo = state.currentStep;
  const st = steps[stepNo - 1];
  if (state.idxInStep < st.items.length - 1) {
    state.idxInStep += 1;
    save(state);
    renderQuestion();
    return;
  }
  // Step終了 → 次のStep or Summaryへ
  if (stepNo < steps.length) {
    state.currentStep = stepNo + 1;
    state.idxInStep = 0;
    save(state);
    renderHome();
    show('home');
  } else {
    show('summary');
  }
}

// ---- Summary描画 ----
function renderSummary() {
  const totalCorrect = Object.values(state.stepSummary).reduce((a,b)=>a+b,0);
  scoreLine.textContent = `総正答：${totalCorrect} / ${steps.reduce((n,st)=>n+st.items.length,0)}（XP：${state.xp}/50）`;

  breakdownEl.innerHTML = '';
  steps.forEach((st, i) => {
    const stepNo = i + 1;
    const c = state.stepSummary[stepNo] || 0;
    const div = document.createElement('div');
    div.className = 'hint';
    div.innerHTML = `<strong>Step ${stepNo}：</strong>${c} / ${st.items.length} 正解<br><em>Topics：</em>${st.topic || '—'}`;
    breakdownEl.appendChild(div);
  });
}

boot();
