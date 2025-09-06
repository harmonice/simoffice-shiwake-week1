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
