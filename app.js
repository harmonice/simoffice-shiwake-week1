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

/* =======================
   復習モードプラグイン v1
   使い方：このブロックを app.js の末尾にコピペ
   ======================= */
(function(){
  // 設定
  const REVIEW_MAX = 10;              // 復習は最大何問か
  const REVIEW_COUNTS_FOR_XP = true;  // 復習で正解→未クリアならXP+1するか

  // ---- Summaryに「未クリアを復習」ボタンを足す（renderSummary をラップ） ----
  const _renderSummary = window.renderSummary;
  window.renderSummary = function(){
    _renderSummary.apply(this, arguments);

    // コンテナ（なければ作る）
    let ctl = document.getElementById('reviewControls');
    if (!ctl) {
      ctl = document.createElement('div');
      ctl.id = 'reviewControls';
      ctl.style.marginTop = '12px';
      ctl.style.display = 'flex';
      ctl.style.gap = '8px';
      // breakdownEl（各Step内訳）の上に置く
      secSummary.insertBefore(ctl, breakdownEl);
    } else {
      ctl.innerHTML = '';
    }

    // ボタン作成
    const btn = document.createElement('button');
    btn.textContent = '未クリアを復習（最大10問）';
    styleBtn(btn);
    btn.onclick = startReview;
    ctl.appendChild(btn);

    // 未クリアゼロなら無効化
    if (countPendingAll() === 0) {
      btn.disabled = true;
      btn.textContent = '未クリアはありません 🎉';
      btn.style.opacity = '0.7';
      btn.style.cursor = 'default';
    }
  };

  function styleBtn(b){
    b.style.padding = '10px 14px';
    b.style.borderRadius = '10px';
    b.style.border = '1px solid #3a3a3a';
    b.style.background = '#2a2a2a';
    b.style.color = '#fff';
    b.style.cursor = 'pointer';
  }

  // ---- 復習開始 ----
  let review = { queue: [], pos: 0, overlay: null };
  function startReview(){
    // 未クリアのプールを作る
    review.queue = buildPendingPool();
    review.pos = 0;
    if (review.queue.length === 0){
      toast('未クリアはありません 🎉');
      return;
    }
    openOverlay();
    renderReviewQuestion();
  }

  // 全Stepの「まだ正解になっていない」問題を集めてシャッフル→最大 REVIEW_MAX 件
  function buildPendingPool(){
    const pool = [];
    steps.forEach((st, si)=>{
      const stepNo = si + 1;
      st.items.forEach((_, idx)=>{
        const solved = state.history.some(h => h.step === stepNo && h.idx === idx && h.correct);
        if (!solved) pool.push({ step: stepNo, idx });
      });
    });
    shuffleInPlace(pool);
    return pool.slice(0, REVIEW_MAX);
  }

  function countPendingAll(){
    let n = 0;
    steps.forEach((st, si)=>{
      const stepNo = si + 1;
      st.items.forEach((_, idx)=>{
        if (!state.history.some(h => h.step === stepNo && h.idx === idx && h.correct)) n++;
      });
    });
    return n;
  }

  // ---- Overlay UI ----
  let qEl, metaEl, choicesEl, footerBtn;
  function openOverlay(){
    closeOverlay(); // 既存があれば破棄

    const ov = document.createElement('div');
    ov.id = 'reviewOverlay';
    ov.style.position = 'fixed';
    ov.style.inset = '0';
    ov.style.background = 'rgba(0,0,0,.6)';
    ov.style.display = 'flex';
    ov.style.alignItems = 'center';
    ov.style.justifyContent = 'center';
    ov.style.zIndex = '9999';

    const card = document.createElement('div');
    card.style.background = '#1f1f1f';
    card.style.color = '#fff';
    card.style.padding = '16px';
    card.style.borderRadius = '12px';
    card.style.width = 'min(760px,90vw)';
    card.style.boxShadow = '0 10px 30px rgba(0,0,0,.35)';

    const title = document.createElement('div');
    title.textContent = '復習モード（未クリア）';
    title.style.fontWeight = '700';
    title.style.marginBottom = '8px';

    metaEl = document.createElement('div');
    metaEl.style.opacity = '.9';
    metaEl.style.marginBottom = '12px';

    qEl = document.createElement('div');
    qEl.style.fontSize = '16px';
    qEl.style.lineHeight = '1.6';
    qEl.style.marginBottom = '12px';

    choicesEl = document.createElement('div');

    const footer = document.createElement('div');
    footer.style.marginTop = '12px';
    footer.style.display = 'flex';
    footer.style.justifyContent = 'flex-end';
    footer.style.gap = '8px';

    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'やめる';
    styleBtn(cancelBtn);
    cancelBtn.onclick = () => { closeOverlay(); renderHome(); renderSummary(); };

    footerBtn = document.createElement('button');
    footerBtn.textContent = '次へ';
    styleBtn(footerBtn);
    footerBtn.style.display = 'none';
    footerBtn.onclick = nextReview;

    footer.appendChild(cancelBtn);
    footer.appendChild(footerBtn);

    card.appendChild(title);
    card.appendChild(metaEl);
    card.appendChild(qEl);
    card.appendChild(choicesEl);
    card.appendChild(footer);
    ov.appendChild(card);
    document.body.appendChild(ov);
    review.overlay = ov;
  }
  function closeOverlay(){
    if (review.overlay){ review.overlay.remove(); review.overlay = null; }
  }

  function renderReviewQuestion(){
    const cur = review.queue[review.pos];
    if (!cur){ finishReview(); return; }

    const st = steps[cur.step - 1];
    const item = st.items[cur.idx];

    metaEl.textContent = `問題 ${review.pos + 1} / ${review.queue.length}　|　Step ${cur.step}`;
    qEl.textContent = item.q;

    footerBtn.style.display = 'none';
    choicesEl.innerHTML = '';
    item.choices.forEach((ch, i)=>{
      const b = document.createElement('button');
      b.textContent = ch;
      styleBtn(b);
      b.style.display = 'block';
      b.style.width = '100%';
      b.style.textAlign = 'left';
      b.style.margin = '6px 0';
      b.onclick = ()=>{
        // ロック
        Array.from(choicesEl.children).forEach(x=>x.style.pointerEvents='none');

        const isCorrect = (i === item.answer);
        // 成績に反映（未クリア→正解ならXP+1）
        applyAnswerRecordReview(cur.step, cur.idx, isCorrect);

        const fb = document.createElement('div');
        fb.style.marginTop = '8px';
        fb.innerHTML = isCorrect
          ? '🎯 <b>正解！</b> よく復習できました。'
          : '😢 <b>不正解</b> — 解説を見直してもう一度挑戦しよう。';
        choicesEl.appendChild(fb);

        const expl = document.createElement('div');
        expl.style.opacity = '.9';
        expl.style.marginTop = '6px';
        expl.innerHTML = `<b>解説：</b>${item.explain}`;
        choicesEl.appendChild(expl);

        footerBtn.style.display = 'inline-block';
      };
      choicesEl.appendChild(b);
    });
  }

  function nextReview(){
    review.pos++;
    if (review.pos < review.queue.length){
      renderReviewQuestion();
    } else {
      finishReview();
    }
  }

  function finishReview(){
    toast('復習おつかれさま！');
    closeOverlay();
    // 画面再描画（進捗が反映される）
    renderHome();
    renderSummary();
  }

  // 既存ルールに合わせて「未クリア→正解になったら+1XP、二重加算なし」を適用
  function applyAnswerRecordReview(stepNo, idx, isCorrect){
    const item = steps[stepNo - 1].items[idx];
    let rec = state.history.find(h => h.step === stepNo && h.idx === idx);
    if (!rec){
      // 新規
      rec = { step: stepNo, idx, correct: !!isCorrect, choiceIndex: isCorrect ? item.answer : null };
      if (REVIEW_COUNTS_FOR_XP && isCorrect) state.xp = Math.min(50, state.xp + 1);
      state.history.push(rec);
    } else {
      // 「一度正解したら正解のまま」を維持
      const wasCorrect = !!rec.correct;
      const nowCorrect = wasCorrect || !!isCorrect;
      if (!wasCorrect && nowCorrect && REVIEW_COUNTS_FOR_XP) state.xp = Math.min(50, state.xp + 1);
      rec.correct = nowCorrect;
      if (isCorrect) rec.choiceIndex = item.answer;
      state.history = state.history.map(h => (h.step===stepNo && h.idx===idx) ? rec : h);
    }
    save(state);
  }

  // ---- 小物 ----
  function shuffleInPlace(arr){
    for (let i = arr.length - 1; i > 0; i--){
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
  function toast(msg){
    const t = document.createElement('div');
    t.textContent = msg;
    t.style.position = 'fixed';
    t.style.left = '50%';
    t.style.bottom = '40px';
    t.style.transform = 'translateX(-50%)';
    t.style.background = '#222';
    t.style.color = '#fff';
    t.style.padding = '10px 14px';
    t.style.borderRadius = '10px';
    t.style.boxShadow = '0 6px 18px rgba(0,0,0,.25)';
    t.style.zIndex = '10000';
    document.body.appendChild(t);
    setTimeout(()=>{ t.style.transition = 'opacity .3s'; t.style.opacity = '0'; }, 1700);
    setTimeout(()=>{ t.remove(); }, 2100);
  }
})();
