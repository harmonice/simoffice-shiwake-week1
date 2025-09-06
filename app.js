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
// 通常ラウンド中に間違えた index を集める（Stepごとにクリア）
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
// 10/10 をいったん見せてから遷移するためのワンショットフラグ
let showFinalProgressOnce = false;


// ---- 初期化 ----
async function boot() {
  // problems.json の { "steps": [...] } を読み込み
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
    // そのStepで正解済みの数を履歴から集計
    const corrects = state.history.filter(h => h.step === stepNo && h.correct).length;
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

  // 未回答の最初の問題へ（履歴から決定）
  const answeredIdx = state.history
    .filter(h => h.step === stepNo)
    .map(h => h.idx);
  let nextIdx = 0;
  while (answeredIdx.includes(nextIdx)) nextIdx++;
  state.idxInStep = Math.min(nextIdx, steps[stepNo - 1].items.length - 1);

  // 再挑戦状態をリセット
  retry.active = false;
  retry.step = stepNo;
  retry.list = [];
  retry.current = 0;
  wrongFirst.clear();

  save(state);
  renderQuestion();
  show('step');
}
// 進捗ラベル＆タイトルを同時に更新するヘルパー
function updateProgressUI({ st, stepNo, current, total, retryMode }) {
  // ラベル
  stepProg.textContent = retryMode
    ? `再挑戦：${current} / ${total}`
    : `進捗：${current} / ${total}`;

  // タイトル（右側に (x/y) を常に出す）
  // ※テーマが「Step 2 (9/10)」のようにタイトル連動で表示しているケースに対応
  const right = retryMode
    ? `（Step ${stepNo} 再挑戦 ${current}/${total}）`
    : `（Step ${stepNo} ${current}/${total}）`;
  stepTitle.textContent = `${st.title}${right}`;
}

function renderQuestion() {
  const stepNo = state.currentStep;
  const st = steps[stepNo - 1];

  // 通常 or 再挑戦で出す index を決定
  const idx = (retry.active && retry.step === stepNo)
    ? retry.list[retry.current]
    : state.idxInStep;

  const item = st.items[idx];

updateProgressUI({
  st,
  stepNo,
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
    // ここで idx は「実際に出題中の index」（再挑戦中も正しく渡る）
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

  // 通常ラウンド中に間違えたものを収集（再挑戦ラウンドでは収集しない）
  if (!isCorrect && !retry.active) {
    wrongFirst.add(idx);
  }

  // XP付与：その問題で「未正解→正解」になったときだけ +1（既存仕様維持）
  const prev = state.history.find(h => h.step === stepNo && h.idx === idx);
  let awarded = false;

  if (!prev) {
    if (isCorrect) { state.xp = Math.min(50, state.xp + 1); awarded = true; }
    state.history.push({ step: stepNo, idx, correct: isCorrect, choiceIndex });
  } else {
    if (!prev.correct && isCorrect) { state.xp = Math.min(50, state.xp + 1); awarded = true; }
    state.history = state.history.map(h =>
      (h.step === stepNo && h.idx === idx) ? { ...h, correct: isCorrect, choiceIndex } : h
    );
  }
  save(state);

  // 結果表示
  resultEl.classList.remove('hidden');
  resultEl.innerHTML = `
    <p>${isCorrect ? '✅ 正解！' : '❌ 不正解'}${awarded ? ' +1 XP' : (isCorrect ? '（加点済み）' : '')}</p>
    <p><strong>解説：</strong>${item.explain}</p>
  `;

  // ▼ 追加：最後の問題は 10/10 を一度見せてから遷移
  const st = steps[stepNo - 1];
  const isLastQuestionInStep = !retry.active && (idx === st.items.length - 1);
  if (isLastQuestionInStep) {// ラベル＆タイトルを 10/10 に更新
  updateProgressUI({
    st,
    stepNo,
    current: st.items.length,
    total: st.items.length,
    retryMode: false
  });

  showFinalProgressOnce = true;
  nextBtn.textContent = 'Step完了 → 次へ';
} else {
  nextBtn.textContent = '次の問題へ';
}

  nextBtn.classList.remove('hidden');
}
function nextQuestion() {  // 10/10 を見せるためのワンクッション
  if (showFinalProgressOnce) {
    showFinalProgressOnce = false;
    return; // このクリックではまだ遷移しない（10/10を見せたままにする）
  }

  const stepNo = state.currentStep;
  const st = steps[stepNo - 1];

  // 再挑戦ラウンド中の遷移
  if (retry.active && retry.step === stepNo) {
    retry.current += 1; // 次の再挑戦問へ
    if (retry.current < retry.total) {
      renderQuestion();
      return;
    } else {
      // 再挑戦を完了
      retry.active = false;
      retry.step = null;
      retry.list = [];
      retry.current = 0;
      wrongFirst.clear();
      // 以降は通常のStep終了と同じフローへ
    }
  }

  // 通常ラウンドの遷移
  if (state.idxInStep < st.items.length - 1) {
    state.idxInStep += 1;
    save(state);
    renderQuestion();
    return;
  }

  // 通常ラウンドが末尾に到達 → 再挑戦ラウンドへ移行 or Step終了
  if (wrongFirst.size > 0) {
    retry.active = true;
    retry.step = stepNo;
    // 集めた誤答Indexを配列化（順番はそのまま。ランダムにしたければシャッフル可）
    retry.list = Array.from(wrongFirst);
    retry.current = 0;
    // 表示に移る（renderQuestionが retry.current=0 の問題を出す）
    renderQuestion();
    return;
  }

  // 誤答ゼロなら通常どおり次Step or Summaryへ
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

// ---- Summary描画（historyから都度集計するので過剰カウントしない） ----
function renderSummary() {
  const totalCorrect = state.history.filter(h => h.correct).length;
  const totalQuestions = steps.reduce((n, st) => n + st.items.length, 0);
  scoreLine.textContent = `総正答：${totalCorrect} / ${totalQuestions}（XP：${state.xp}/50）`;

  breakdownEl.innerHTML = '';
  steps.forEach((st, i) => {
    const stepNo = i + 1;
    const c = state.history.filter(h => h.step === stepNo && h.correct).length;
    const div = document.createElement('div');
    div.className = 'hint';
    div.innerHTML = `<strong>Step ${stepNo}：</strong>${c} / ${st.items.length} 正解<br><em>Topics：</em>${st.topic || '—'}`;
    breakdownEl.appendChild(div);
  });
}

boot();
