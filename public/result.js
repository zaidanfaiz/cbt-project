const titleEl = document.querySelector('#result-title');
const summaryEl = document.querySelector('#score-summary');
const reviewEl = document.querySelector('#review-list');

function renderMath() {
  if (window.MathJax && window.MathJax.typesetPromise) {
    window.MathJax.typesetPromise();
  }
}

function answerText(detail, letter) {
  if (!letter) return 'Kosong';
  return `${letter}. ${detail.options[letter] || ''}`;
}

function statusLabel(status) {
  if (status === 'benar') return 'Benar';
  if (status === 'salah') return 'Salah';
  return 'Kosong';
}

function renderResult(result) {
  titleEl.textContent = `${result.subtest.name} selesai dikerjakan`;
  summaryEl.innerHTML = [
    ['Skor', result.score],
    ['Benar', result.correct],
    ['Salah', result.wrong],
    ['Kosong', result.blank],
    ['Total Soal', result.total_questions],
    ['Status', result.auto_submitted ? 'Otomatis terkumpul' : 'Terkumpul'],
  ]
    .map(([label, value]) => `<div class="result-stat"><span>${label}</span><strong>${value}</strong></div>`)
    .join('');

  reviewEl.innerHTML = result.details
    .map(
      (detail) => `
        <article class="review-card ${detail.status}">
          <div class="review-header">
            <div>
              <p class="section-label">Soal ${detail.number}</p>
              <h2>${statusLabel(detail.status)} · ${detail.points} poin</h2>
            </div>
          </div>
          <div class="question-text">${detail.question_text}</div>
          <div class="review-answers">
            <div>
              <span>Jawaban Anda</span>
              <strong>${answerText(detail, detail.selected)}</strong>
            </div>
            <div>
              <span>Jawaban Benar</span>
              <strong>${answerText(detail, detail.correct_answer)}</strong>
            </div>
          </div>
          <div class="preview-options">
            ${Object.entries(detail.options)
              .map(([letter, value]) => `<span class="${letter === detail.correct_answer ? 'correct' : ''}">${letter}. ${value}</span>`)
              .join('')}
          </div>
          <div class="explanation-preview">
            <strong>Pembahasan:</strong> ${detail.explanation || 'Belum ada pembahasan untuk soal ini.'}
          </div>
        </article>
      `
    )
    .join('');
  renderMath();
}

try {
  const result = JSON.parse(sessionStorage.getItem('cbt-last-result') || 'null');
  if (!result) {
    titleEl.textContent = 'Belum ada hasil tes';
    summaryEl.innerHTML = '<p class="muted-text">Kerjakan dan kumpulkan tes terlebih dahulu.</p>';
    reviewEl.innerHTML = '<a class="button primary" href="/simulasi">Mulai Simulasi</a>';
  } else {
    renderResult(result);
  }
} catch (_error) {
  titleEl.textContent = 'Hasil tidak dapat dibaca';
  summaryEl.innerHTML = '<p class="muted-text">Data hasil di browser rusak atau sudah tidak valid.</p>';
}
