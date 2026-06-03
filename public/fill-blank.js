const uploadForm = document.querySelector('#cloze-upload');
const fileInput = document.querySelector('#cloze-file');
const statusEl = document.querySelector('#cloze-status');
const counterEl = document.querySelector('#cloze-counter');
const checkButton = document.querySelector('#cloze-check');
const titleEl = document.querySelector('#cloze-title');
const passageEl = document.querySelector('#cloze-passage');
const feedbackEl = document.querySelector('#cloze-feedback');
const prevButton = document.querySelector('#cloze-prev');
const nextButton = document.querySelector('#cloze-next');

let tests = [];
let currentIndex = 0;

function renderMath() {
  if (window.MathJax && window.MathJax.typesetPromise) window.MathJax.typesetPromise();
}

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle('error', isError);
}

function attachmentMarkup(test) {
  if (!test || !test.attachment_url) return '';
  const name = test.attachment_name || 'Lampiran';
  const isImage = String(test.attachment_mime || '').startsWith('image/');
  return `<div class="record-attachment">
    <strong>Lampiran</strong>
    ${isImage ? `<img src="${test.attachment_url}" alt="${name}">` : ''}
    <a href="${test.attachment_url}" target="_blank" rel="noreferrer">${name}</a>
  </div>`;
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

function normalizeTests(payload) {
  const rows = Array.isArray(payload) ? payload : payload.tests;
  if (!Array.isArray(rows) || rows.length === 0) throw new Error('JSON harus berisi array cloze test.');
  return rows;
}

function blankControl(blank) {
  const feedback = `<span class="cloze-answer-feedback" data-answer-feedback="${blank.id}"></span>`;
  if (blank.type === 'dropdown') {
    return `<span class="cloze-blank">
      <span class="cloze-dropdown" data-dropdown-id="${blank.id}">
        <select class="cloze-control cloze-native-select" data-blank-id="${blank.id}">
        <option value="">Pilih</option>
        ${blank.options.map((option) => `<option value="${option}">${option}</option>`).join('')}
        </select>
        <button class="cloze-dropdown-button" type="button" data-dropdown-toggle="${blank.id}">Pilih</button>
        <span class="cloze-dropdown-menu" hidden>
          ${blank.options.map((option) => `<button type="button" data-dropdown-option="${blank.id}" data-value="${option}">${option}</button>`).join('')}
        </span>
      </span>
      ${feedback}
    </span>`;
  }
  return `<span class="cloze-blank">
    <input class="cloze-control" data-blank-id="${blank.id}" type="text" placeholder="..." />
    ${feedback}
  </span>`;
}

function renderPassage(test) {
  let html = test.passage_html;
  for (const blank of test.blanks) {
    html = html.replaceAll(`[${blank.id}]`, blankControl(blank));
    html = html.replaceAll(`{{${blank.id}}}`, blankControl(blank));
  }
  return html;
}

function renderTest() {
  const test = tests[currentIndex];
  feedbackEl.textContent = '';
  if (!test) {
    counterEl.textContent = '0 teks';
    titleEl.textContent = 'Belum ada data';
    passageEl.innerHTML = 'Upload JSON Fill-in-the-Blank untuk mulai.';
    checkButton.disabled = true;
    prevButton.disabled = true;
    nextButton.disabled = true;
    return;
  }
  counterEl.textContent = `${currentIndex + 1} dari ${tests.length}`;
  titleEl.textContent = test.title;
  passageEl.innerHTML = renderPassage(test) + attachmentMarkup(test);
  checkButton.disabled = false;
  prevButton.disabled = currentIndex === 0;
  nextButton.disabled = currentIndex === tests.length - 1;
  renderMath();
}

async function loadTests() {
  const response = await fetch('/api/cloze');
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Gagal memuat cloze test.');
  tests = data.tests || [];
  currentIndex = Math.min(currentIndex, Math.max(0, tests.length - 1));
  renderTest();
}

uploadForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    const rows = normalizeTests(await readJsonFile(fileInput));
    const response = await fetch('/api/cloze/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tests: rows }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Import Fill-in-the-Blank gagal.');
    uploadForm.reset();
    setStatus(`${data.inserted_count} cloze test berhasil diimport.`);
    await loadTests();
  } catch (error) {
    setStatus(error.message, true);
  }
});

checkButton.addEventListener('click', () => {
  const test = tests[currentIndex];
  if (!test) return;
  let correct = 0;
  for (const blank of test.blanks) {
    const control = passageEl.querySelector(`[data-blank-id="${blank.id}"]`);
    const feedback = passageEl.querySelector(`[data-answer-feedback="${blank.id}"]`);
    const value = String(control.value || '').trim().toLowerCase();
    const answer = String(blank.answer || '').trim().toLowerCase();
    const isCorrect = value === answer;
    control.classList.toggle('correct', isCorrect);
    control.classList.toggle('wrong', !isCorrect);
    if (feedback) {
      feedback.classList.toggle('correct', isCorrect);
      feedback.classList.toggle('wrong', !isCorrect);
      feedback.innerHTML = isCorrect ? 'Benar' : `Jawaban: ${blank.answer}`;
    }
    if (isCorrect) correct += 1;
  }
  feedbackEl.textContent = `${correct} dari ${test.blanks.length} jawaban benar.`;
  renderMath();
});

passageEl.addEventListener('click', (event) => {
  const toggle = event.target.closest('[data-dropdown-toggle]');
  const option = event.target.closest('[data-dropdown-option]');

  if (toggle) {
    const wrapper = passageEl.querySelector(`[data-dropdown-id="${toggle.dataset.dropdownToggle}"]`);
    const menu = wrapper.querySelector('.cloze-dropdown-menu');
    menu.hidden = !menu.hidden;
    renderMath();
    return;
  }

  if (option) {
    const id = option.dataset.dropdownOption;
    const wrapper = passageEl.querySelector(`[data-dropdown-id="${id}"]`);
    const select = wrapper.querySelector('select');
    const button = wrapper.querySelector('.cloze-dropdown-button');
    const menu = wrapper.querySelector('.cloze-dropdown-menu');
    select.value = option.dataset.value;
    button.innerHTML = option.innerHTML;
    menu.hidden = true;
    select.classList.remove('correct', 'wrong');
    const feedback = passageEl.querySelector(`[data-answer-feedback="${id}"]`);
    if (feedback) {
      feedback.textContent = '';
      feedback.classList.remove('correct', 'wrong');
    }
    renderMath();
  }
});

passageEl.addEventListener('input', (event) => {
  const control = event.target.closest('[data-blank-id]');
  if (!control) return;
  control.classList.remove('correct', 'wrong');
  const feedback = passageEl.querySelector(`[data-answer-feedback="${control.dataset.blankId}"]`);
  if (feedback) {
    feedback.textContent = '';
    feedback.classList.remove('correct', 'wrong');
  }
});

prevButton.addEventListener('click', () => {
  currentIndex = Math.max(0, currentIndex - 1);
  renderTest();
});
nextButton.addEventListener('click', () => {
  currentIndex = Math.min(tests.length - 1, currentIndex + 1);
  renderTest();
});

loadTests().catch((error) => setStatus(error.message, true));
