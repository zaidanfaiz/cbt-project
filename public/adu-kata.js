const uploadForm = document.querySelector('#word-upload');
const fileInput = document.querySelector('#word-file');
const statusEl = document.querySelector('#word-status');
const counterEl = document.querySelector('#word-counter');
const typeEl = document.querySelector('#word-type');
const timerEl = document.querySelector('#word-timer');
const promptEl = document.querySelector('#word-prompt');
const optionsEl = document.querySelector('#word-options');
const feedbackEl = document.querySelector('#word-feedback');
const prevButton = document.querySelector('#word-prev');
const nextButton = document.querySelector('#word-next');

let questions = [];
let currentIndex = 0;
let remaining = 0;
let timerId = null;
let locked = false;

function renderMath() {
  if (window.MathJax && window.MathJax.typesetPromise) window.MathJax.typesetPromise();
}

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle('error', isError);
}

function readJsonFile(input) {
  return new Promise((resolve, reject) => {
    const file = input.files && input.files[0];
    if (!file) return reject(new Error('Pilih file JSON terlebih dahulu.'));
    const reader = new FileReader();
    reader.onload = () => {
      try {
        resolve(JSON.parse(String(reader.result || '')));
      } catch (_error) {
        reject(new Error('File JSON tidak valid.'));
      }
    };
    reader.onerror = () => reject(new Error('File tidak dapat dibaca.'));
    reader.readAsText(file);
  });
}

function normalizeQuestions(payload) {
  const rows = Array.isArray(payload) ? payload : payload.questions;
  if (!Array.isArray(rows) || rows.length === 0) throw new Error('JSON harus berisi array soal Adu Kata.');
  return rows;
}

function typeLabel(type) {
  if (type === 'sinonim') return 'Sinonim';
  if (type === 'antonim') return 'Antonim';
  return 'Analogi Kata';
}

function stopTimer() {
  clearInterval(timerId);
  timerId = null;
}

function startTimer() {
  stopTimer();
  const question = questions[currentIndex];
  remaining = Number(question.timer_seconds || 20);
  timerEl.textContent = String(remaining).padStart(2, '0');
  timerId = setInterval(() => {
    remaining -= 1;
    timerEl.textContent = String(Math.max(0, remaining)).padStart(2, '0');
    timerEl.classList.toggle('danger', remaining <= 5);
    if (remaining <= 0) {
      stopTimer();
      handleTimeout();
    }
  }, 1000);
}

function renderQuestion() {
  stopTimer();
  locked = false;
  const question = questions[currentIndex];
  feedbackEl.textContent = '';
  timerEl.classList.remove('danger');

  if (!question) {
    counterEl.textContent = '0 soal';
    typeEl.textContent = 'Jenis';
    timerEl.textContent = '00';
    promptEl.innerHTML = 'Belum ada soal Adu Kata. Upload JSON untuk mulai.';
    optionsEl.innerHTML = '';
    prevButton.disabled = true;
    nextButton.disabled = true;
    return;
  }

  counterEl.textContent = `${currentIndex + 1} dari ${questions.length}`;
  typeEl.textContent = typeLabel(question.question_type);
  promptEl.innerHTML = question.prompt;
  optionsEl.innerHTML = question.options
    .map((option, index) => `<button class="word-option speed-option" data-option-index="${index}" type="button"><span>${String.fromCharCode(65 + index)}</span><strong>${option}</strong></button>`)
    .join('');
  prevButton.disabled = currentIndex === 0;
  nextButton.disabled = currentIndex === questions.length - 1;
  renderMath();
  startTimer();
}

function goNextAfterDelay(delay = 850) {
  setTimeout(() => {
    if (currentIndex < questions.length - 1) {
      currentIndex += 1;
      renderQuestion();
    } else {
      feedbackEl.textContent = 'Sesi Adu Kata selesai.';
      stopTimer();
      timerEl.textContent = '00';
    }
  }, delay);
}

function markCorrectAnswer(question) {
  for (const item of optionsEl.querySelectorAll('[data-option-index]')) {
    const option = question.options[Number(item.dataset.optionIndex)];
    if (option === question.correct_answer) item.classList.add('correct');
  }
}

function handleTimeout() {
  if (locked) return;
  locked = true;
  const question = questions[currentIndex];
  markCorrectAnswer(question);
  feedbackEl.innerHTML = `Waktu habis. Jawaban benar: <strong>${question.correct_answer}</strong>.`;
  goNextAfterDelay(2000);
}

async function loadQuestions() {
  const response = await fetch('/api/adu-kata');
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Gagal memuat Adu Kata.');
  questions = data.questions || [];
  currentIndex = Math.min(currentIndex, Math.max(0, questions.length - 1));
  renderQuestion();
}

uploadForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    const rows = normalizeQuestions(await readJsonFile(fileInput));
    const response = await fetch('/api/adu-kata/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ questions: rows }),
    });
    const data = await response.json();
    if (!response.ok) {
      const firstError = data.errors && data.errors[0] ? ` Soal ${data.errors[0].number}: ${data.errors[0].error}` : '';
      throw new Error((data.error || 'Import Adu Kata gagal.') + firstError);
    }
    uploadForm.reset();
    setStatus(`${data.inserted_count} soal Adu Kata berhasil diimport.`);
    await loadQuestions();
  } catch (error) {
    setStatus(error.message, true);
  }
});

optionsEl.addEventListener('click', (event) => {
  const button = event.target.closest('[data-option-index]');
  const question = questions[currentIndex];
  if (!button || !question || locked) return;
  locked = true;
  stopTimer();
  const selected = question.options[Number(button.dataset.optionIndex)];
  const correct = selected === question.correct_answer;
  for (const item of optionsEl.querySelectorAll('.word-option')) item.disabled = true;
  button.classList.add(correct ? 'correct' : 'wrong');

  if (correct) {
    feedbackEl.textContent = 'Benar.';
    goNextAfterDelay(850);
  } else {
    markCorrectAnswer(question);
    feedbackEl.innerHTML = `Salah. Jawaban benar: <strong>${question.correct_answer}</strong>. ${question.explanation || ''}`;
    renderMath();
    goNextAfterDelay(2000);
  }
});

prevButton.addEventListener('click', () => {
  currentIndex = Math.max(0, currentIndex - 1);
  renderQuestion();
});
nextButton.addEventListener('click', () => {
  currentIndex = Math.min(questions.length - 1, currentIndex + 1);
  renderQuestion();
});

window.addEventListener('beforeunload', stopTimer);
loadQuestions().catch((error) => setStatus(error.message, true));
