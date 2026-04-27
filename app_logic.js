
// ── Save / Load ──
const SAVE_KEY = 'revdrills_v1';

function defaultSave() {
  return { penalty: {}, history: {}, attempts: {}, timerRecords: {}, sessionAccuracy: {} };
}

let save = defaultSave();

function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) save = Object.assign(defaultSave(), JSON.parse(raw));
  } catch(e) { save = defaultSave(); }
}

function persistSave() {
  localStorage.setItem(SAVE_KEY, JSON.stringify(save));
}

// ── Helpers ──
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function verseRef(ch, v) { return `${ch}-${v}`; }

function chapterVerseCount(ch) {
  return (bibleData[ch] || []).length;
}

function getVerseData(ch, v) {
  return (bibleData[ch] || [])[v - 1] || null;
}

function isTypeable(char) {
  const c = char.charCodeAt(0);
  return (c >= 0xAC00 && c <= 0xD7A3) || (c >= 0x61 && c <= 0x7A) || (c >= 0x41 && c <= 0x5A) || (c >= 0x30 && c <= 0x39);
}

function charsMatch(a, b) {
  return a === b;
}

function poolSize(ch) {
  const n = chapterVerseCount(ch);
  let total = 0;
  for (let v = 1; v <= n; v++) total += 1 + (save.penalty[verseRef(ch, v)] || 0);
  return total;
}

function chapterPenaltyTotal(ch) {
  const n = chapterVerseCount(ch);
  let extra = 0;
  for (let v = 1; v <= n; v++) extra += save.penalty[verseRef(ch, v)] || 0;
  return extra;
}

function recentAccuracy(ch) {
  const n = chapterVerseCount(ch);
  let total = 0, correct = 0;
  for (let v = 1; v <= n; v++) {
    const hist = save.history[verseRef(ch, v)] || [];
    hist.forEach(r => { total++; if (r) correct++; });
  }
  if (!total) return null;
  return Math.round(correct / total * 100);
}

// ── Font size ──
const FONT_KEY = 'revdrills_font';
function setFontSize(size) {
  document.body.classList.remove('fsz-small','fsz-medium','fsz-large');
  document.body.classList.add('fsz-' + size);
  localStorage.setItem(FONT_KEY, size);
  document.querySelectorAll('.font-size-btn').forEach(b => b.classList.remove('selected'));
  const btn = el('fsz-' + size);
  if (btn) btn.classList.add('selected');
}
function loadFontSize() {
  setFontSize(localStorage.getItem(FONT_KEY) || 'medium');
}

// ── Settings screen ──
function openSettings() {
  showScreen('screen-settings');
}

function resetAllData() {
  if (!confirm('모든 학습 기록을 초기화하시겠습니까?\n이 작업은 되돌릴 수 없습니다.')) return;
  localStorage.removeItem(SAVE_KEY);
  save = defaultSave();
  goHome();
}

// ── Timer state ──
let timerInterval = null;
let timerSeconds = 0;
let timerEnabled = false;
let setupTimerOn = true;

function selectTimer(on) {
  setupTimerOn = on;
  el('timer-btn-on').classList.toggle('selected', on);
  el('timer-btn-off').classList.toggle('selected', !on);
}

function startTimer() {
  timerSeconds = 0;
  timerEnabled = true;
  const disp = el('timer-display');
  if (disp) disp.style.display = '';
  timerInterval = setInterval(function() {
    timerSeconds++;
    updateTimerDisplay();
  }, 1000);
}

function stopTimer() {
  if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
}

function updateTimerDisplay() {
  const disp = el('timer-display');
  if (!disp) return;
  const m = Math.floor(timerSeconds / 60);
  const s = timerSeconds % 60;
  disp.textContent = m + ':' + (s < 10 ? '0' : '') + s;
}

function formatTime(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m + '분 ' + (s < 10 ? '0' : '') + s + '초';
}

// ── Session state ──
let session = null;

function buildQueue(ch) {
  const n = chapterVerseCount(ch);
  const items = [];
  for (let v = 1; v <= n; v++) {
    const ref = verseRef(ch, v);
    const copies = 1 + (save.penalty[ref] || 0);
    for (let i = 0; i < copies; i++) items.push(ref);
  }
  return shuffle(items);
}

function startSession(ch, mode) {
  stopTimer();
  timerEnabled = setupTimerOn;
  timerSeconds = 0;
  session = {
    chapter: ch,
    mode,
    queue: buildQueue(ch),
    queueIdx: 0,
    wrongCounts: {},
    attemptCounts: {},
    done: false,
  };
}

function currentRef() {
  return session.queue[session.queueIdx];
}

function currentVerse() {
  const ref = currentRef();
  const [ch, v] = ref.split('-').map(Number);
  return { ch, v, ref, data: getVerseData(ch, v) };
}

function advanceQueue() {
  session.queueIdx++;
  if (session.queueIdx >= session.queue.length) session.done = true;
}

function onCorrect() {
  const ref = currentRef();
  session.attemptCounts[ref] = (session.attemptCounts[ref] || 0) + 1;
  advanceQueue();
}

function onWrong() {
  const ref = currentRef();
  session.wrongCounts[ref] = (session.wrongCounts[ref] || 0) + 1;
  session.attemptCounts[ref] = (session.attemptCounts[ref] || 0) + 1;
  const remaining = session.queue.length - session.queueIdx - 1;
  if (remaining > 0) {
    const ahead = Math.min(3 + Math.floor(Math.random() * 3), remaining);
    session.queue.splice(session.queueIdx + 1 + ahead, 0, ref);
  } else {
    session.queue.push(ref);
  }
  advanceQueue();
}

function finalizeSession() {
  stopTimer();
  const ch = session.chapter;
  const n = chapterVerseCount(ch);
  let totalWrong = 0;
  for (let v = 1; v <= n; v++) {
    const ref = verseRef(ch, v);
    const wrongs = session.wrongCounts[ref] || 0;
    totalWrong += wrongs;
    save.penalty[ref] = wrongs;
    if (!save.history[ref]) save.history[ref] = [];
    save.history[ref].push(wrongs === 0);
    if (save.history[ref].length > 5) save.history[ref].shift();
    save.attempts[ref] = (save.attempts[ref] || 0) + (session.attemptCounts[ref] || 0);
  }
  // session accuracy for graph (정답률 %)
  if (!save.sessionAccuracy) save.sessionAccuracy = {};
  const totalQ = Object.values(session.attemptCounts).reduce(function(a,b){ return a+b; }, 0) || n;
  const pct = Math.round((totalQ - totalWrong) / totalQ * 100);
  if (!save.sessionAccuracy[ch]) save.sessionAccuracy[ch] = [];
  save.sessionAccuracy[ch].push(pct);
  if (save.sessionAccuracy[ch].length > 5) save.sessionAccuracy[ch].shift();

  // timer record: only if timer was on and no wrong answers (완벽 클리어)
  if (!save.timerRecords) save.timerRecords = {};
  if (timerEnabled && totalWrong === 0) {
    if (!save.timerRecords[ch]) save.timerRecords[ch] = [];
    save.timerRecords[ch].push(timerSeconds);
    save.timerRecords[ch].sort(function(a,b){ return a-b; });
    if (save.timerRecords[ch].length > 10) save.timerRecords[ch].pop();
  }
  persistSave();
}

// ── Rendering helpers ──
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function el(id) { return document.getElementById(id); }

function escHtml(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ── Home screen ──
function renderHome() {
  const grid = el('chapter-grid');
  let html = '';
  let totalDone = 0, totalVerses = 0;
  for (let ch = 1; ch <= 22; ch++) {
    const n = chapterVerseCount(ch);
    totalVerses += n;
    const penalty = chapterPenaltyTotal(ch);
    const acc = recentAccuracy(ch);
    const hasData = Object.keys(save.attempts).some(r => r.startsWith(ch + '-'));
    if (hasData && penalty === 0) totalDone += n;
    let cardClass = 'chapter-card';
    if (hasData && penalty === 0) cardClass += ' perfect';
    else if (penalty > 0) cardClass += ' has-penalty';
    let statusHtml = '';
    if (!hasData) {
      statusHtml = '<span class="ch-status" style="color:var(--text2)">미시작</span>';
    } else if (acc !== null) {
      const color = acc >= 80 ? 'var(--success)' : acc >= 50 ? 'var(--warning)' : '#e17055';
      statusHtml = '<span class="ch-status" style="color:' + color + '">최근 ' + acc + '%</span>';
    }
    const dotHtml = penalty > 0 ? '<div class="penalty-dot" title="+' + penalty + '문제"></div>' : '';
    html += '<div class="' + cardClass + '" onclick="openSetup(' + ch + ')">' +
      dotHtml +
      '<span class="ch-num">' + ch + '장</span>' +
      '<span class="ch-label">' + n + '절</span>' +
      statusHtml +
      '</div>';
  }
  grid.innerHTML = html;
  const pct = totalVerses ? Math.round(totalDone / totalVerses * 100) : 0;
  el('home-progress-bar').style.width = pct + '%';
  el('home-progress-text').textContent = totalDone + ' / ' + totalVerses + '절 완료';
}

// ── Setup screen ──
let setupChapter = 1;
let setupMode = 'address';

function openSetup(ch) {
  setupChapter = ch;
  setupMode = 'address';
  el('setup-chapter-title').textContent = '계시록 ' + ch + '장';
  el('setup-chapter-sub').textContent = chapterVerseCount(ch) + '절';
  renderSetupMode();
  renderPoolPreview();
  // timer best record label
  const rec = save.timerRecords && save.timerRecords[ch];
  const bestLabel = el('timer-best-label');
  if (bestLabel) bestLabel.textContent = rec && rec.length ? '최고 ' + formatTime(rec[0]) : '';
  showScreen('screen-setup');
}

function renderSetupMode() {
  ['mode-btn-address', 'mode-btn-memory'].forEach(id => el(id).classList.remove('selected'));
  el('mode-btn-' + setupMode).classList.add('selected');
  el('timer-btn-on').classList.toggle('selected', setupTimerOn);
  el('timer-btn-off').classList.toggle('selected', !setupTimerOn);
}

function selectMode(mode) {
  setupMode = mode;
  renderSetupMode();
}

function renderPoolPreview() {
  const ch = setupChapter;
  const base = chapterVerseCount(ch);
  const extra = chapterPenaltyTotal(ch);
  const total = base + extra;
  el('pool-total').textContent = total;
  if (extra > 0) {
    el('pool-extra').textContent = '(기본 ' + base + '절 + 추가 ' + extra + '문제)';
    el('pool-extra').style.display = '';
  } else {
    el('pool-extra').style.display = 'none';
  }
}

function goStartSession() {
  startSession(setupChapter, setupMode);
  showScreen('screen-session');
  renderSession();
  if (timerEnabled) startTimer();
  const disp = el('timer-display');
  if (disp) disp.style.display = timerEnabled ? '' : 'none';
}

// ── Session screen ──
let memorySlots = [];
let memoryTyped = '';
let ultimateMode = false;
let awaitingNext = false;

function renderSession() {
  if (session.done) { showResult(); return; }
  awaitingNext = false;
  ultimateMode = false;
  memoryTyped = '';
  memorySlots = [];

  const { ch, v, data } = currentVerse();
  const total = session.queue.length;
  el('session-progress-label').textContent = (session.queueIdx + 1) + ' / ' + total;
  el('session-progress-bar').style.width = Math.round((session.queueIdx / total) * 100) + '%';

  if (session.mode === 'address') renderAddressMode(ch, v, data);
  else renderMemoryMode(ch, v, data);
}

function renderAddressMode(ch, v, data) {
  const field = el('session-field');
  const n = chapterVerseCount(ch);
  let btns = '';
  for (let i = 1; i <= n; i++) {
    btns += '<button class="verse-btn" id="vbtn-' + i + '" onclick="submitAddress(' + i + ')">' + i + '절</button>';
  }
  field.innerHTML =
    '<div class="verse-card" id="verse-card">' +
      '<div class="verse-text">' + escHtml(data.text) + '</div>' +
      '<div class="verse-reveal" id="verse-reveal"></div>' +
    '</div>' +
    '<div class="address-indicator">이 구절은 계시록 ' + ch + '장 몇 절인가요?</div>' +
    '<div class="verse-buttons">' + btns + '</div>' +
    '<div id="session-next-wrap" style="display:none;margin-top:4px">' +
    '<button class="btn btn-primary" onclick="nextVerse()">다음 ▶</button></div>';
}

function submitAddress(picked) {
  if (awaitingNext) return;
  const { ch, v } = currentVerse();
  const correct = picked === v;
  document.querySelectorAll('.verse-btn').forEach(b => b.setAttribute('disabled', ''));
  el('vbtn-' + picked).classList.add(correct ? 'correct' : 'wrong');
  if (!correct) el('vbtn-' + v).classList.add('correct');

  const card = el('verse-card');
  card.classList.add(correct ? 'card-correct' : 'card-wrong');
  const reveal = el('verse-reveal');
  reveal.innerHTML = '<span style="color:' + (correct ? 'var(--success)' : 'var(--danger)') + '">' + (correct ? '●' : '✕') + '</span>  계시록 ' + ch + '장 ' + v + '절';
  reveal.classList.add('visible');

  if (correct) onCorrect(); else onWrong();
  awaitingNext = true;
  setTimeout(function() { el('session-next-wrap').style.display = ''; }, 300);
}

function renderMemoryMode(ch, v, data) {
  const field = el('session-field');
  memorySlots = buildMemorySlots(data.text);
  memoryTyped = '';
  field.innerHTML =
    '<div class="verse-card" id="verse-card" style="text-align:center">' +
      '<div class="memory-ref-label">주소만 보고 전체 구절을 인출하세요</div>' +
      '<div class="memory-ref">계시록 ' + ch + '장 ' + v + '절</div>' +
      '<div class="verse-reveal" id="verse-reveal"></div>' +
    '</div>' +
    '<div class="typing-board" id="typing-board" onclick="focusMemoryInput()" ontouchstart="focusMemoryInput()">' +
    '<input id="hidden-input" class="hidden-input" type="text" ' +
    'autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" />' +
    '<div id="slots-display"></div></div>' +
    '<div class="memory-controls">' +
    '<button class="btn-ultimate" id="btn-ultimate" onclick="toggleUltimate()">궁극의 암기</button>' +
    '<button class="btn-reset" onclick="resetMemory()">초기화</button>' +
    '<button class="btn btn-primary" id="btn-submit" onclick="submitMemory()" style="flex:1">정답 확인</button>' +
    '</div>' +
    '<div id="memory-warn" style="font-size:13px;color:var(--danger);text-align:center;opacity:0;transition:opacity .3s;min-height:18px">글자 수를 모두 채운 후 정답을 확인하세요.</div>' +
    '<div id="session-next-wrap" style="display:none">' +
    '<button class="btn btn-primary" onclick="nextVerse()">다음 ▶</button></div>';
  renderMemorySlots();
  setTimeout(function() {
    const input = el('hidden-input');
    if (!input) return;
    let isComposing = false;
    let preCompositionValue = '';

    input.addEventListener('compositionstart', function() {
      isComposing = true;
      preCompositionValue = input.value;
    });

    input.addEventListener('compositionupdate', function(e) {
      // 조합 중 미리보기: 확정된 텍스트 + 현재 조합 중인 글자
      const preview = preCompositionValue + (e.data || '');
      handleMemoryInput({ target: { value: preview } });
    });

    input.addEventListener('compositionend', function(e) {
      isComposing = false;
      const committed = preCompositionValue + (e.data || '');
      input.value = committed;
      handleMemoryInput({ target: input });
      input.selectionStart = input.selectionEnd = input.value.length;
    });

    input.addEventListener('input', function(e) {
      if (isComposing) return;
      handleMemoryInput(e);
      input.selectionStart = input.selectionEnd = input.value.length;
    });

    input.focus();
  }, 120);
}

function buildMemorySlots(text) {
  return text.split('').map(function(char, i) {
    return { char: char, index: i, typeable: isTypeable(char), value: '', wrong: false };
  });
}

function renderMemorySlots() {
  const display = el('slots-display');
  if (!display) return;
  const board = el('typing-board');
  if (board) board.classList.toggle('ultimate-mode', ultimateMode);

  let filled = 0;
  for (let i = 0; i < memorySlots.length; i++) {
    const s = memorySlots[i];
    if (!s.typeable) continue;
    if (!s.value) break;
    filled++;
  }

  let html = '';
  let typeableIdx = 0;
  for (let i = 0; i < memorySlots.length; i++) {
    const s = memorySlots[i];
    if (!s.typeable) {
      if (s.char === ' ') html += '<span class="fixed-char space"> </span>';
      else html += '<span class="fixed-char">' + escHtml(s.char) + '</span>';
    } else {
      const isCurrent = typeableIdx === filled && !awaitingNext;
      let cls = 'char-slot';
      if (s.value) cls += ' filled';
      if (isCurrent) cls += ' active';
      if (s.wrong) cls += ' wrong';
      html += '<span class="' + cls + '" onclick="focusMemoryInput()">' + (s.value ? escHtml(s.value) : '&nbsp;') + '</span>';
      typeableIdx++;
    }
  }
  display.innerHTML = html;
}

function focusMemoryInput() {
  const input = el('hidden-input');
  if (input) input.focus();
}

function handleMemoryInput(e) {
  if (awaitingNext) return;
  const input = e.target;
  const typed = input.value;
  memoryTyped = typed;
  let idx = 0;
  for (let i = 0; i < memorySlots.length; i++) {
    const s = memorySlots[i];
    if (!s.typeable) continue;
    s.value = typed[idx] || '';
    s.wrong = false;
    idx++;
  }
  renderMemorySlots();
  // 한글 IME 조합 완료 후 커서가 앞으로 이동하는 문제 방지
  const len = input.value.length;
  input.selectionStart = len;
  input.selectionEnd = len;
}

function toggleUltimate() {
  ultimateMode = !ultimateMode;
  const btn = el('btn-ultimate');
  if (btn) {
    btn.textContent = ultimateMode ? '힌트 보기' : '궁극의 암기';
    btn.classList.toggle('active', ultimateMode);
  }
  renderMemorySlots();
}

function resetMemory() {
  if (awaitingNext) return;
  memoryTyped = '';
  const input = el('hidden-input');
  if (input) input.value = '';
  for (let i = 0; i < memorySlots.length; i++) { memorySlots[i].value = ''; memorySlots[i].wrong = false; }
  renderMemorySlots();
  focusMemoryInput();
}

function submitMemory() {
  if (awaitingNext) return;
  const typeableSlots = memorySlots.filter(function(s) { return s.typeable; });
  if (typeableSlots.some(function(s) { return !s.value; })) {
    const warn = el('memory-warn');
    if (warn) { warn.style.opacity = '1'; setTimeout(function(){ warn.style.opacity = '0'; }, 1800); }
    return;
  }
  let correct = true;
  for (let i = 0; i < memorySlots.length; i++) {
    const s = memorySlots[i];
    if (!s.typeable) continue;
    if (!charsMatch(s.value, s.char)) { s.wrong = true; correct = false; }
  }
  renderMemorySlots();
  const { ch, v, data } = currentVerse();
  const card = el('verse-card');
  card.classList.add(correct ? 'card-correct' : 'card-wrong');
  const reveal = el('verse-reveal');
  reveal.innerHTML = '<span style="color:' + (correct ? 'var(--success)' : 'var(--danger)') + '">' + (correct ? '●' : '✕') + '</span>  ' + escHtml(data.text);
  reveal.style.textAlign = 'left';
  reveal.classList.add('visible');

  if (correct) onCorrect(); else onWrong();
  const submitBtn = el('btn-submit');
  if (submitBtn) submitBtn.style.display = 'none';
  awaitingNext = true;
  setTimeout(function() { el('session-next-wrap').style.display = ''; }, 300);
  const input = el('hidden-input');
  if (input) input.blur();
}

function showFeedback(type, msg) {
  const bar = el('feedback-bar');
  if (!bar) return;
  bar.className = 'feedback-bar ' + type;
  bar.textContent = msg;
  bar.style.display = '';
}

function nextVerse() {
  renderSession();
}

// ── Result screen ──
function showResult() {
  finalizeSession();
  const ch = session.chapter;
  const n = chapterVerseCount(ch);
  const allPerfect = Object.keys(session.wrongCounts).length === 0;
  el('result-icon').textContent = allPerfect ? '🏆' : '✅';
  el('result-chapter-title').textContent = '계시록 ' + ch + '장 완료';

  // timer line
  const timerLine = el('result-timer-line');
  if (timerEnabled) {
    const rec = save.timerRecords && save.timerRecords[ch];
    const best = rec && rec.length ? rec[0] : null;
    let msg = '⏱ ' + formatTime(timerSeconds);
    if (allPerfect && best === timerSeconds) msg += '  🎉 신기록!';
    else if (best) msg += '  (최고: ' + formatTime(best) + ')';
    timerLine.textContent = msg;
    timerLine.style.display = '';
  } else {
    timerLine.style.display = 'none';
  }

  let rows = '';
  let wrongVerses = [];
  for (let v = 1; v <= n; v++) {
    const ref = verseRef(ch, v);
    const wrongs = session.wrongCounts[ref] || 0;
    const attempts = session.attemptCounts[ref] || 1;
    if (wrongs > 0) wrongVerses.push({ v: v, wrongs: wrongs });
    let badgeCls = 'badge-perfect', badgeText = '완벽';
    if (attempts === 2) { badgeCls = 'badge-warn'; badgeText = '2회'; }
    else if (attempts >= 3) { badgeCls = 'badge-bad'; badgeText = attempts + '회'; }
    rows += '<div class="result-row">' +
      '<span class="ref">계 ' + ch + ':' + v + '</span>' +
      '<span class="attempts">' + attempts + '번 만에 정답</span>' +
      '<span class="badge ' + badgeCls + '">' + badgeText + '</span></div>';
  }
  el('result-rows').innerHTML = rows;

  const nextBase = n;
  const nextExtra = chapterPenaltyTotal(ch);
  const nextTotal = nextBase + nextExtra;
  el('next-total').textContent = nextTotal;
  if (nextExtra > 0) {
    const details = wrongVerses.map(function(w) { return w.v + '절 +' + (save.penalty[verseRef(ch, w.v)] || 0); }).join(', ');
    el('next-extra-detail').textContent = '(기본 ' + nextBase + ' + 추가 ' + nextExtra + ': ' + details + ')';
  } else {
    el('next-extra-detail').textContent = '기본 ' + nextBase + '절만 출제';
  }
  el('next-extra-detail').style.display = '';

  showScreen('screen-result');
}

function retrySession() {
  startSession(session.chapter, session.mode);
  showScreen('screen-session');
  renderSession();
  if (timerEnabled) startTimer();
  const disp = el('timer-display');
  if (disp) disp.style.display = timerEnabled ? '' : 'none';
}

function goHome() {
  stopTimer();
  renderHome();
  showScreen('screen-home');
}

// ── Stats screen ──
function openStats(ch) {
  el('stats-ch-title').textContent = '계시록 ' + ch + '장 상세';
  el('stats-ch-sub').textContent = chapterVerseCount(ch) + '절';
  const n = chapterVerseCount(ch);
  let html = '';
  for (let v = 1; v <= n; v++) {
    const ref = verseRef(ch, v);
    const penalty = save.penalty[ref] || 0;
    const total = save.attempts[ref] || 0;
    const hist = save.history[ref] || [];
    let dots = '';
    for (let i = 0; i < 5; i++) {
      if (i < hist.length) dots += '<div class="dot ' + (hist[i] ? 'o' : 'x') + '"></div>';
      else dots += '<div class="dot"></div>';
    }
    const pCls = penalty === 0 ? 'v-penalty ok' : 'v-penalty';
    const pText = penalty === 0 ? '없음' : '+' + penalty;
    html += '<div class="stats-row">' +
      '<span class="v-ref">' + ch + ':' + v + '</span>' +
      '<span>' + total + '회</span>' +
      '<span class="' + pCls + '">' + pText + '</span>' +
      '<div class="recent-dots">' + dots + '</div></div>';
  }
  el('stats-table-body').innerHTML = html;

  // accuracy graph
  const sessions = (save.sessionAccuracy && save.sessionAccuracy[ch]) || [];
  const barsEl = el('stats-bars');
  if (barsEl) {
    if (sessions.length === 0) {
      barsEl.innerHTML = '<span style="font-size:12px;color:var(--text2)">세션 기록 없음</span>';
    } else {
      barsEl.innerHTML = sessions.map(function(pct, i) {
        const color = pct >= 80 ? 'var(--success)' : pct >= 50 ? 'var(--warning)' : 'var(--danger)';
        return '<div class="stats-bar-wrap">' +
          '<div class="stats-bar-pct">' + pct + '%</div>' +
          '<div class="stats-bar" style="height:' + Math.max(3, pct * 0.54) + 'px;background:' + color + '"></div>' +
          '<div class="stats-bar-label">' + (i + 1) + '회</div>' +
          '</div>';
      }).join('');
    }
  }

  // timer records
  const timerEl = el('stats-timer-record');
  if (timerEl) {
    const rec = save.timerRecords && save.timerRecords[ch];
    if (rec && rec.length) {
      timerEl.innerHTML = '⏱ 완벽 클리어 최고기록: <strong>' + formatTime(rec[0]) + '</strong>' +
        (rec.length > 1 ? '  &nbsp;2위: ' + formatTime(rec[1]) : '');
    } else {
      timerEl.textContent = '타이머 완벽 클리어 기록 없음';
    }
  }

  showScreen('screen-stats');
}

// ── Init ──
document.addEventListener('DOMContentLoaded', function() {
  loadSave();
  loadFontSize();
  renderHome();
  showScreen('screen-home');
});
