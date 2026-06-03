const questionForm = document.querySelector('#question-form');
const bulkForm = document.querySelector('#bulk-form');
const bulkFile = document.querySelector('#bulk-file');
const inlineUploadFile = document.querySelector('#inline-upload-file');
const questionAttachmentPreview = document.querySelector('#question-attachment-preview');
const questionStatus = document.querySelector('#question-status');
const bulkStatus = document.querySelector('#bulk-status');
const storageStatus = document.querySelector('#storage-status');
const subtestSelect = questionForm.elements.subtest_key;
const materiSelect = questionForm.elements.materi_key;
const catalogSummary = document.querySelector('#catalog-summary');
const questionList = document.querySelector('#question-list');
const questionCount = document.querySelector('#question-count');
const previewDialog = document.querySelector('#preview-dialog');
const previewTitle = document.querySelector('#preview-title');
const previewProgress = document.querySelector('#preview-progress');
const previewHeading = document.querySelector('#preview-heading');
const previewQuestionText = document.querySelector('#preview-question-text');
const previewOptions = document.querySelector('#preview-answer-options');
const previewPalette = document.querySelector('#preview-palette');
const previewPrev = document.querySelector('#preview-prev');
const previewNext = document.querySelector('#preview-next');
const previewFormButton = document.querySelector('#preview-form-question');
const previewBulkButton = document.querySelector('#preview-bulk-question');
const closePreviewButton = document.querySelector('#close-preview');

let catalog = [];
let questions = [];
let previewQuestions = [];
let previewIndex = 0;
let activeUploadTarget = null;

function attachmentMarkup(record) {
  if (!record || !record.attachment_url) return '';
  const name = record.attachment_name || 'Lampiran';
  const isImage = String(record.attachment_mime || '').startsWith('image/');
  return `
    <div class="record-attachment">
      <strong>Lampiran</strong>
      ${isImage ? `<img src="${record.attachment_url}" alt="${name}">` : ''}
      <a href="${record.attachment_url}" target="_blank" rel="noreferrer">${name}</a>
    </div>
  `;
}

function setQuestionAttachment(file) {
  questionForm.elements.attachment_url.value = file.url || '';
  questionForm.elements.attachment_key.value = file.key || '';
  questionForm.elements.attachment_name.value = file.name || file.key || 'Lampiran';
  questionForm.elements.attachment_mime.value = file.mimeType || file.mime_type || '';
  questionAttachmentPreview.hidden = !file.url;
  questionAttachmentPreview.innerHTML = attachmentMarkup({
    attachment_url: file.url,
    attachment_name: questionForm.elements.attachment_name.value,
    attachment_mime: questionForm.elements.attachment_mime.value,
  });
}

function uploadSnippet(file, uploaded) {
  const url = uploaded && uploaded.url;
  const name = file.name || 'Lampiran';
  if (!url) return '';
  if (file.type.startsWith('image/')) {
    return `<img src="${url}" alt="${name}">`;
  }
  return `<a href="${url}" target="_blank" rel="noreferrer">${name}</a>`;
}

function uploadTargetLabel(name) {
  const labels = {
    question_text: 'Teks soal',
    option_a: 'Opsi A',
    option_b: 'Opsi B',
    option_c: 'Opsi C',
    option_d: 'Opsi D',
    option_e: 'Opsi E',
    explanation: 'Pembahasan',
  };
  return labels[name] || 'field tujuan';
}

function insertAtCursor(textarea, snippet) {
  const start = textarea.selectionStart ?? textarea.value.length;
  const end = textarea.selectionEnd ?? textarea.value.length;
  const before = textarea.value.slice(0, start);
  const after = textarea.value.slice(end);
  const prefix = before && !before.endsWith('\n') ? '\n' : '';
  const suffix = after && !after.startsWith('\n') ? '\n' : '';
  textarea.value = `${before}${prefix}${snippet}${suffix}${after}`;
  const cursor = before.length + prefix.length + snippet.length;
  textarea.focus();
  textarea.setSelectionRange(cursor, cursor);
}

async function uploadFileToStorage(file) {
  const formData = new FormData();
  formData.append('file', file);
  const response = await fetch('/api/storage/upload', {
    method: 'POST',
    body: formData,
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Upload file gagal.');
  return data.file;
}

function setStatus(target, message, isError = false) {
  target.textContent = message;
  target.classList.toggle('error', isError);
}

function renderMath() {
  if (window.MathJax && window.MathJax.typesetPromise) {
    window.MathJax.typesetPromise();
  }
}

function selectedSubtest() {
  return catalog.find((subtest) => subtest.key === subtestSelect.value) || catalog[0];
}

function findSubtest(key) {
  return catalog.find((subtest) => subtest.key === key);
}

function findMateri(subtestKey, materiKey) {
  const subtest = findSubtest(subtestKey);
  return subtest ? subtest.materi.find((materi) => materi.key === materiKey) : null;
}

function renderSubtestOptions() {
  subtestSelect.innerHTML = catalog
    .map((subtest) => `<option value="${subtest.key}">${subtest.name}</option>`)
    .join('');
  renderMateriOptions();
}

function renderMateriOptions() {
  const subtest = selectedSubtest();
  materiSelect.innerHTML = subtest
    ? subtest.materi.map((materi) => `<option value="${materi.key}">${materi.name}</option>`).join('')
    : '';
}

function optionRows(question) {
  return ['A', 'B', 'C', 'D', 'E']
    .map((letter) => {
      const key = `option_${letter.toLowerCase()}`;
      const className = question.correct_answer === letter ? ' class="correct"' : '';
      return `<span${className}>${letter}. ${question[key]}</span>`;
    })
    .join('');
}

function renderCatalogSummary() {
  catalogSummary.innerHTML = catalog
    .map(
      (subtest) => `
        <article class="summary-item">
          <div>
            <strong>${subtest.name}</strong>
            <span>${subtest.full_name} - ${subtest.duration_minutes} menit - ${subtest.question_count} soal</span>
          </div>
        </article>
      `
    )
    .join('');
}

function renderQuestions() {
  questionCount.textContent = `${questions.length} soal`;
  questionList.innerHTML = questions.length
    ? questions
        .map(
          (question, index) => `
            <article class="question-preview">
              <div class="question-preview-header">
                <span class="question-preview-title">${index + 1}. ${question.subtest_name} - ${question.materi_name} - ${question.points} poin</span>
                <button class="delete-button" data-question-id="${question.id}" type="button">Hapus</button>
              </div>
              <div>${question.question_text}</div>
              ${attachmentMarkup(question)}
              <div class="preview-options">${optionRows(question)}</div>
              ${question.explanation ? `<div class="explanation-preview"><strong>Pembahasan:</strong> ${question.explanation}</div>` : ''}
            </article>
          `
        )
        .join('')
    : '<p class="muted-text">Belum ada soal. Silakan masukkan soal asli Anda.</p>';
  renderMath();
}

function payloadFromForm() {
  const payload = Object.fromEntries(new FormData(questionForm).entries());
  payload.points = Number(payload.points || 4);
  return payload;
}

function hydrateQuestionForPreview(question) {
  const subtest = findSubtest(question.subtest_key);
  const materi = findMateri(question.subtest_key, question.materi_key);
  return {
    ...question,
    subtest_name: question.subtest_name || (subtest ? subtest.name : question.subtest_key),
    materi_name: question.materi_name || (materi ? materi.name : question.materi_key),
    points: Number(question.points || 4),
  };
}

function validatePreviewQuestion(question, index) {
  const required = ['subtest_key', 'materi_key', 'question_text', 'option_a', 'option_b', 'option_c', 'option_d', 'option_e', 'correct_answer'];
  const missing = required.filter((field) => !String(question[field] || '').trim());
  if (missing.length) throw new Error(`Soal nomor ${index + 1} belum lengkap: ${missing.join(', ')}.`);
  if (!findSubtest(question.subtest_key)) throw new Error(`Soal nomor ${index + 1}: Subtes tidak valid.`);
  if (!findMateri(question.subtest_key, question.materi_key)) throw new Error(`Soal nomor ${index + 1}: Materi tidak cocok dengan Subtes.`);
  if (!['A', 'B', 'C', 'D', 'E'].includes(String(question.correct_answer).toUpperCase())) {
    throw new Error(`Soal nomor ${index + 1}: Jawaban benar harus A, B, C, D, atau E.`);
  }
}

function normalizeBulkContent(content) {
  const parsed = JSON.parse(content);
  const rows = Array.isArray(parsed) ? parsed : parsed.questions;
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error('File JSON harus berisi array soal atau objek { "questions": [...] }.');
  }
  rows.forEach(validatePreviewQuestion);
  return rows.map(hydrateQuestionForPreview);
}

function readBulkFile() {
  return new Promise((resolve, reject) => {
    const file = bulkFile.files && bulkFile.files[0];
    if (!file) {
      reject(new Error('Pilih file JSON terlebih dahulu.'));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      try {
        resolve(normalizeBulkContent(String(reader.result || '')));
      } catch (error) {
        reject(error);
      }
    };
    reader.onerror = () => reject(new Error('File tidak dapat dibaca.'));
    reader.readAsText(file);
  });
}

function previewOptionMarkup(question) {
  return ['A', 'B', 'C', 'D', 'E']
    .map((letter) => {
      const key = `option_${letter.toLowerCase()}`;
      return `
        <label class="answer-option${question.correct_answer === letter ? ' selected' : ''}">
          <input type="radio" name="preview-answer" value="${letter}" ${question.correct_answer === letter ? 'checked' : ''} />
          <span class="answer-letter">${letter}</span>
          <span class="answer-text">${question[key]}</span>
        </label>
      `;
    })
    .join('');
}

function renderPreview() {
  const question = previewQuestions[previewIndex];
  if (!question) return;
  previewTitle.textContent = `${question.subtest_name} - ${question.materi_name}`;
  previewProgress.textContent = `Soal ${previewIndex + 1} dari ${previewQuestions.length}`;
  previewHeading.textContent = `Soal ${previewIndex + 1}`;
  previewQuestionText.innerHTML = `<p class="materi-chip">${question.materi_name}</p>${question.question_text}`;
  previewQuestionText.innerHTML += attachmentMarkup(question);
  previewOptions.innerHTML = previewOptionMarkup(question);
  previewPalette.innerHTML = previewQuestions
    .map((_, index) => `<button class="palette-button ${index === previewIndex ? 'current answered' : ''}" data-preview-index="${index}" type="button">${index + 1}</button>`)
    .join('');
  previewPrev.disabled = previewIndex === 0;
  previewNext.disabled = previewIndex === previewQuestions.length - 1;
  renderMath();
}

function openPreview(rows) {
  previewQuestions = rows.map(hydrateQuestionForPreview);
  previewQuestions.forEach(validatePreviewQuestion);
  previewIndex = 0;
  renderPreview();
  previewDialog.showModal();
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Permintaan gagal.');
  return data;
}

async function loadData() {
  const [catalogData, questionData] = await Promise.all([
    fetchJson('/api/catalog'),
    fetchJson('/api/questions'),
  ]);
  catalog = catalogData.subtests || [];
  questions = questionData.questions || [];
  renderSubtestOptions();
  renderCatalogSummary();
  renderQuestions();
}

subtestSelect.addEventListener('change', renderMateriOptions);

questionForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const payload = payloadFromForm();

  try {
    await fetchJson('/api/questions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const currentSubtest = payload.subtest_key;
    const currentMateri = payload.materi_key;
    questionForm.reset();
    questionForm.points.value = 4;
    setQuestionAttachment({});
    questionForm.subtest_key.value = currentSubtest;
    renderMateriOptions();
    questionForm.materi_key.value = currentMateri;
    setStatus(questionStatus, 'Soal berhasil disimpan.');
    await loadData();
  } catch (error) {
    setStatus(questionStatus, error.message, true);
  }
});

previewFormButton.addEventListener('click', () => {
  try {
    const payload = hydrateQuestionForPreview(payloadFromForm());
    validatePreviewQuestion(payload, 0);
    openPreview([payload]);
    setStatus(questionStatus, '');
  } catch (error) {
    setStatus(questionStatus, error.message, true);
  }
});

previewBulkButton.addEventListener('click', async () => {
  try {
    const rows = await readBulkFile();
    openPreview(rows);
    setStatus(bulkStatus, `${rows.length} soal siap dipreview.`);
  } catch (error) {
    setStatus(bulkStatus, error.message, true);
  }
});

bulkForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    const rows = await readBulkFile();
    const response = await fetch('/api/questions/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ questions: rows }),
    });
    const data = await response.json();
    if (!response.ok) {
      const firstError = data.errors && data.errors[0] ? ` Soal ${data.errors[0].number}: ${data.errors[0].error}` : '';
      throw new Error((data.error || 'Import gagal.') + firstError);
    }
    bulkForm.reset();
    setStatus(bulkStatus, `${data.inserted_count} soal berhasil diimport.`);
    await loadData();
  } catch (error) {
    setStatus(bulkStatus, error.message, true);
  }
});

document.addEventListener('click', (event) => {
  const button = event.target.closest('[data-upload-target]');
  if (!button) return;
  activeUploadTarget = button.dataset.uploadTarget;
  inlineUploadFile.value = '';
  inlineUploadFile.click();
});

inlineUploadFile.addEventListener('change', async () => {
  const file = inlineUploadFile.files && inlineUploadFile.files[0];
  if (!file) {
    return;
  }

  try {
    setStatus(storageStatus, `Mengupload ${file.name} ke ${uploadTargetLabel(activeUploadTarget)}...`);
    const uploaded = await uploadFileToStorage(file);
    const target = activeUploadTarget && questionForm.elements[activeUploadTarget];
    if (!target) throw new Error('Target field upload tidak ditemukan.');
    insertAtCursor(target, uploadSnippet(file, uploaded));
    setQuestionAttachment({
      ...uploaded,
      name: file.name,
      mimeType: file.type,
    });
    setStatus(storageStatus, `File berhasil disisipkan ke ${uploadTargetLabel(activeUploadTarget)}.`);
  } catch (error) {
    setStatus(storageStatus, error.message, true);
  }
});

closePreviewButton.addEventListener('click', () => previewDialog.close());
previewPrev.addEventListener('click', () => {
  previewIndex = Math.max(0, previewIndex - 1);
  renderPreview();
});
previewNext.addEventListener('click', () => {
  previewIndex = Math.min(previewQuestions.length - 1, previewIndex + 1);
  renderPreview();
});
previewPalette.addEventListener('click', (event) => {
  const button = event.target.closest('[data-preview-index]');
  if (!button) return;
  previewIndex = Number(button.dataset.previewIndex);
  renderPreview();
});

questionList.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-question-id]');
  if (!button) return;
  if (!confirm('Hapus soal ini?')) return;

  try {
    await fetchJson(`/api/questions/${button.dataset.questionId}`, { method: 'DELETE' });
    await loadData();
  } catch (error) {
    setStatus(questionStatus, error.message, true);
  }
});

loadData().catch((error) => {
  setStatus(questionStatus, error.message, true);
});
