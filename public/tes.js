const params = new URLSearchParams(window.location.search);
const subtestKey = String(params.get('subtest_key') || '');
const storageKey = `cbt-session-${subtestKey || 'unknown'}`;

const state = {
  subtest: null,
  questions: [],
  currentIndex: 0,
  answers: {},
  flagged: {},
  startedAt: Date.now(),
  submitted: false,
  timerId: null,
};

const elements = {
  title: document.querySelector('#exam-title'),
  timer: document.querySelector('#timer'),
  progress: document.querySelector('#question-progress'),
  heading: document.querySelector('#question-heading'),
  questionText: document.querySelector('#question-text'),
  options: document.querySelector('#answer-options'),
  palette: document.querySelector('#question-palette'),
  previous: document.querySelector('#previous-question'),
  next: document.querySelector('#next-question'),
  flagTop: document.querySelector('#flag-question'),
  flagBottom: document.querySelector('#flag-question-bottom'),
  submit: document.querySelector('#submit-test'),
};

function saveState() {
  const snapshot = {
    currentIndex: state.currentIndex,
    answers: state.answers,
    flagged: state.flagged,
    startedAt: state.startedAt,
    submitted: state.submitted,
  };
  localStorage.setItem(storageKey, JSON.stringify(snapshot));
}

function restoreState() {
  try {
    const snapshot = JSON.parse(localStorage.getItem(storageKey) || '{}');
    state.currentIndex = Number(snapshot.currentIndex) || 0;
    state.answers = snapshot.answers || {};
    state.flagged = snapshot.flagged || {};
    state.startedAt = Number(snapshot.startedAt) || Date.now();
    state.submitted = Boolean(snapshot.submitted);
  } catch (_error) {
    localStorage.removeItem(storageKey);
  }
}

function renderMath() {
  if (window.MathJax && window.MathJax.typesetPromise) {
    window.MathJax.typesetPromise();
  }
}

function currentQuestion() {
  return state.questions[state.currentIndex];
}

function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
}

function remainingSeconds() {
  const duration = state.subtest ? state.subtest.duration_minutes * 60 : 0;
  const elapsed = Math.floor((Date.now() - state.startedAt) / 1000);
  return Math.max(0, duration - elapsed);
}

function elapsedSeconds() {
  return Math.max(0, Math.floor((Date.now() - state.startedAt) / 1000));
}

function optionMarkup(question) {
  return ['A', 'B', 'C', 'D', 'E']
    .map((letter) => {
      const key = `option_${letter.toLowerCase()}`;
      const checked = state.answers[question.id] === letter;
      return `
        <label class="answer-option${checked ? ' selected' : ''}">
          <input type="radio" name="answer" value="${letter}" ${checked ? 'checked' : ''} />
          <span class="answer-letter">${letter}</span>
          <span class="answer-text">${question[key]}</span>
        </label>
      `;
    })
    .join('');
}

function renderPalette() {
  elements.palette.innerHTML = state.questions
    .map((question, index) => {
      const classes = ['palette-button'];
      if (state.answers[question.id]) classes.push('answered');
      if (state.flagged[question.id]) classes.push('flagged');
      if (index === state.currentIndex) classes.push('current');
      return `<button class="${classes.join(' ')}" data-index="${index}" type="button">${index + 1}</button>`;
    })
    .join('');
}

function renderQuestion() {
  const question = currentQuestion();
  if (!question) {
    elements.heading.textContent = 'Belum ada soal';
    elements.progress.textContent = 'Soal 0 dari 0';
    elements.questionText.textContent = 'Subtes ini belum memiliki soal. Tambahkan soal asli Anda melalui halaman Input Soal.';
    elements.options.innerHTML = '';
    renderPalette();
    return;
  }

  elements.progress.textContent = `Soal ${state.currentIndex + 1} dari ${state.questions.length}`;
  elements.heading.textContent = `Soal ${state.currentIndex + 1}`;
  elements.questionText.innerHTML = `<p class="materi-chip">${question.materi_name}</p>${question.question_text}`;
  elements.options.innerHTML = optionMarkup(question);

  const flagged = Boolean(state.flagged[question.id]);
  elements.flagTop.textContent = flagged ? 'Batal Ragu-ragu' : 'Ragu-ragu';
  elements.flagBottom.textContent = flagged ? 'Batal Ragu-ragu' : 'Ragu-ragu';
  elements.previous.disabled = state.currentIndex === 0;
  elements.next.disabled = state.currentIndex === state.questions.length - 1;

  renderPalette();
  renderMath();
}

function startTimer() {
  clearInterval(state.timerId);
  state.timerId = setInterval(() => {
    const remaining = remainingSeconds();
    elements.timer.textContent = formatTime(remaining);
    if (remaining <= 0) {
      clearInterval(state.timerId);
      submitTest(false, true);
    }
  }, 500);
}

async function submitTest(askConfirmation = true, autoSubmitted = false) {
  if (state.submitted || !state.subtest) return;
  if (askConfirmation && !confirm('Apakah Anda yakin ingin mengumpulkan?')) return;

  state.submitted = true;
  saveState();
  clearInterval(state.timerId);

  const response = await fetch('/api/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      subtest_key: state.subtest.key,
      answers: state.answers,
      duration_seconds: elapsedSeconds(),
    }),
  });
  const result = await response.json();
  if (!response.ok) {
    alert(result.error || 'Gagal mengumpulkan jawaban.');
    return;
  }

  result.auto_submitted = autoSubmitted;
  sessionStorage.setItem('cbt-last-result', JSON.stringify(result));
  localStorage.removeItem(storageKey);
  window.location.href = '/result.html';
}

function toggleFlag() {
  const question = currentQuestion();
  if (!question) return;
  state.flagged[question.id] = !state.flagged[question.id];
  if (!state.flagged[question.id]) delete state.flagged[question.id];
  saveState();
  renderQuestion();
}

elements.options.addEventListener('change', (event) => {
  const input = event.target.closest('input[type="radio"]');
  const question = currentQuestion();
  if (!input || !question) return;
  state.answers[question.id] = input.value;
  saveState();
  renderQuestion();
});

elements.palette.addEventListener('click', (event) => {
  const button = event.target.closest('[data-index]');
  if (!button) return;
  state.currentIndex = Number(button.dataset.index);
  saveState();
  renderQuestion();
});

elements.previous.addEventListener('click', () => {
  state.currentIndex = Math.max(0, state.currentIndex - 1);
  saveState();
  renderQuestion();
});

elements.next.addEventListener('click', () => {
  state.currentIndex = Math.min(state.questions.length - 1, state.currentIndex + 1);
  saveState();
  renderQuestion();
});

elements.flagTop.addEventListener('click', toggleFlag);
elements.flagBottom.addEventListener('click', toggleFlag);
elements.submit.addEventListener('click', () => submitTest(true, false));

async function init() {
  if (!subtestKey) {
    elements.heading.textContent = 'Subtes tidak valid';
    elements.questionText.textContent = 'Kembali ke halaman pilih subtes dan mulai dari kartu subtes yang tersedia.';
    return;
  }

  restoreState();
  const [catalogResponse, questionResponse] = await Promise.all([
    fetch('/api/catalog'),
    fetch(`/api/questions?subtest_key=${encodeURIComponent(subtestKey)}`),
  ]);
  const catalogData = await catalogResponse.json();
  const questionData = await questionResponse.json();
  if (!catalogResponse.ok) throw new Error(catalogData.error || 'Gagal memuat katalog ujian.');
  if (!questionResponse.ok) throw new Error(questionData.error || 'Gagal memuat soal.');

  state.subtest = (catalogData.subtests || []).find((item) => item.key === subtestKey);
  state.questions = questionData.questions || [];
  if (!state.subtest) throw new Error('Subtes tidak ditemukan.');
  state.currentIndex = Math.min(state.currentIndex, Math.max(0, state.questions.length - 1));
  elements.title.textContent = `${state.subtest.name} · ${state.subtest.duration_minutes} menit`;

  if (remainingSeconds() <= 0 && !state.submitted) {
    await submitTest(false, true);
    return;
  }

  elements.timer.textContent = formatTime(remainingSeconds());
  renderQuestion();
  startTimer();
}

init().catch((error) => {
  elements.heading.textContent = 'Gagal memuat tes';
  elements.questionText.textContent = error.message;
});
