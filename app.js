// ---- 状態管理（localStorage） ----
const KEY = "simoffice-shiwake-steps";
const initState = () => ({
  currentStep: 1,   // 1..5
  idxInStep: 0,     // 0..9（1Step=10問想定）
  xp: 0,            // 最大 50 (= 5step * 10問)
  // 履歴: { step, idx, correct, choiceIndex }
  history: []
});
const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || initState(); } catch { return initState(); } };
const save = (s) => localStorage.setItem(KEY, JSON.stringify(s));
let state = load();

// ==== 再挑戦用の一時状態（localStorageには保存しない） ====
let retry = {
  active: false,     // 再挑戦ラウンド中か
  step: null,        // 対象Step番号（1始まり）
  list: [],          // 再挑戦する設問index配列（0始まり）
  current: 0,        // 何問目を出しているか（0..total-1）
  get total(){ return this.list.length; }
};
// 通常ラウンド中に間違えた index を集める（参考用・今回の仕様では再挑戦は「未クリア全て」）
let wrongFirst = new Set();

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
// 10/10 を一度見せてから遷移するフラグ
let showFinalProgressOnce = false;

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
    // そのStepで「正解済み」の数（重複配慮）
    const corrects = st.items.reduce((acc, _, idx) => {
      return acc + (state.history.some(h => h.step === stepNo && h.idx === idx && h.correct) ? 1 : 0);
    }, 0);
    const done = corrects === st.items.length && st.items.length > 0;
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

  // 次に出すのは「未クリア（correct=false または記録なし）」の最初
  const cleared = new Set(
    state.history.filter(h => h.step === stepNo && h.correct).map(h => h.idx)
  );
  let nextIdx = 0;
  while (cleared.has(nextIdx)) nextIdx++;
  state.idxInStep = Math.min(nextIdx, steps[stepNo - 1].items.length - 1);

  // 再挑戦状態リセット
  retry.active = false; retry.step = stepNo; retry.list = []; retry.current = 0;
  wrongFirst.clear();

  save(state);
  renderQuestion();
  show('step');
}

// ---- タイトル右側の (x/y) を専用要素で強制表示 ----
function getStepCountEl() {
  let el = document.getElementById('stepCount');
  if (!el) {
    el = document.createElement('span');
    el.id = 'stepCount';
    el.style.marginLeft = '8px';
    el.style.opacity = '0.9';
    // 既存の (x/y) がタイトルに含まれていたら除去してベースだけ残す
    if (stepTitle && stepTitle.textContent) {
      stepTitle.textContent = stepTitle.textContent.replace(/\([^)]*\)\s*$/, '').trim();
    }
    stepTitle.insertAdjacentElement('afterend', el);
  }
  return el;
}
function updateProgressUI({ st, stepNo, current, total, retryMode }) {
  if (stepProg) {
    stepProg.textContent = retryMode
      ? `再挑戦：${current} / ${total}`
      : `進捗：${current} / ${total}`;
  }
  if (stepTitle && st) {
    const base = `${st.title}（Step ${stepNo}）`;
    stepTitle.textContent = base.replace(/\([^)]*\)\s*$/, '').trim();
  }
  const countEl = getStepCountEl();
  countEl.textContent = retryMode ? `（再挑戦 ${current}/${total}）` : `（${current}/${total}）`;
}

// ---- 出題 ----
function renderQuestion() {
  const stepNo = state.currentStep;
  const st = steps[stepNo - 1];

  const idx = (retry.active && retry.step === stepNo) ? retry.list[retry.current] : state.idxInStep;
  const item = st.items[idx];

  updateProgressUI({
    st, stepNo,
    current: (retry.active && retry.step === stepNo) ? (retry.current + 1) : (idx + 1),
    total:   (retry.active && retry.step === stepNo) ? retry.total : st.items.length,
    retryMode: !!(retry.active && retry.step === stepNo)
  });

  questionEl.textContent = (retry.active ? '【再挑戦】' : '') + item.q;
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

// ---- 回答 ----
function choose(stepNo, idx, item, choiceIndex) {
  if (Array.from(choicesEl.children).some(ch => ch.classList.contains('correct') || ch.classList.contains('wrong'))) return;

  const isCorrect = (choiceIndex === item.answer);

  Array.from(choicesEl.children).forEach((ch, i) => {
    if (i === item.answer) ch.classList.add('correct');
    if (i === choiceIndex && i !== item.answer) ch.classList.add('wrong');
    ch.style.pointerEvents = 'none';
  });

  if (!isCorrect && !retry.active) wrongFirst.add(idx);

  // ---- 成績更新（単調増加：一度正解なら以後ずっと correct=true）----
  const prev = state.history.find(h => h.step === stepNo && h.idx === idx);
  let awarded = false;

  if (!prev) {
    if (isCorrect) { state.xp = Math.min(50, state.xp + 1); awarded = true; }
    state.history.push({ step: stepNo, idx, correct: !!isCorrect, choiceIndex });
  } else {
    const newCorrect = prev.correct || isCorrect; // ←重要：正解は上書きで消さない
    if (!prev.correct && isCorrect) { state.xp = Math.min(50, state.xp + 1); awarded = true; }
    state.history = state.history.map(h =>
      (h.step === stepNo && h.idx === idx) ? { ...h, correct: newCorrect, choiceIndex } : h
    );
  }
  save(state);

  resultEl.classList.remove('hidden');
  resultEl.innerHTML = `
    <p>${isCorrect ? '✅ 正解！' : '❌ 不正解'}${awarded ? ' +1 XP' : (isCorrect ? '（加点済み）' : '')}</p>
    <p><strong>解説：</strong>${item.explain}</p>
  `;

  // --- 最終問なら 10/10 を強制表示してワンクッション ---
  const st = steps[stepNo - 1];
  const isLastQuestionInStep = !retry.active && (idx === st.items.length - 1);
  if (isLastQuestionInStep) {
    updateProgressUI({ st, stepNo, current: st.items.length, total: st.items.length, retryMode: false });
    showFinalProgressOnce = true;
    nextBtn.textContent = 'Step完了 → 次へ';
  } else {
    nextBtn.textContent = '次の問題へ';
  }
  nextBtn.classList.remove('hidden');
}

// ---- 次へ ----
function nextQuestion() {
  if (showFinalProgressOnce) { showFinalProgressOnce = false; return; }

  const stepNo = state.currentStep;
  const st = steps[stepNo - 1];

  // 再挑戦ラウンド中の遷移
  if (retry.active && retry.step === stepNo) {
    retry.current += 1;
    if (retry.current < retry.total) { renderQuestion(); return; }
    // 再挑戦1周終了
    retry.active = false; retry.step = null; retry.list = []; retry.current = 0; wrongFirst.clear();
    // （ここでは続行して終了判定へ）
  }

  // 通常ラウンドの遷移
  if (state.idxInStep < st.items.length - 1) {
    state.idxInStep += 1;
    save(state);
    renderQuestion();
    return;
  }

  // ---- Step末：まだ正解になっていない問題をすべて再挑戦 ----
  const pending = st.items
    .map((_, i) => i)
    .filter(i => !state.history.some(h => h.step === stepNo && h.idx === i && h.correct));
  if (pending.length > 0) {
    retry.active = true;
    retry.step = stepNo;
    retry.list = pending.slice(); // 必要ならシャッフル可
    retry.current = 0;
    renderQuestion();
    return;
  }

  // 誤答ゼロ（＝全問正解）なら通常どおり次Step or Summaryへ
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
  const totalCorrect = steps.reduce((acc, st, i) => {
    const stepNo = i + 1;
    return acc + st.items.reduce((a, _, idx) => a + (state.history.some(h => h.step === stepNo && h.idx === idx && h.correct) ? 1 : 0), 0);
  }, 0);
  const totalQuestions = steps.reduce((n, st) => n + st.items.length, 0);
  scoreLine.textContent = `総正答：${totalCorrect} / ${totalQuestions}（XP：${state.xp}/50）`;

  breakdownEl.innerHTML = '';
  steps.forEach((st, i) => {
    const stepNo = i + 1;
    const c = st.items.reduce((a, _, idx) => a + (state.history.some(h => h.step === stepNo && h.idx === idx && h.correct) ? 1 : 0), 0);
    const div = document.createElement('div');
    div.className = 'hint';
    div.innerHTML = `<strong>Step ${stepNo}：</strong>${c} / ${st.items.length} 正解<br><em>Topics：</em>${st.topic || '—'}`;
    breakdownEl.appendChild(div);
  });
}

boot();

