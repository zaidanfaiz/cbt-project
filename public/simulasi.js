const listEl = document.querySelector('#subtest-list');
const emptyEl = document.querySelector('#empty-state');

function renderSubtests(subtests) {
  const totalQuestions = subtests.reduce((sum, subtest) => sum + subtest.question_count, 0);
  emptyEl.hidden = totalQuestions > 0;
  listEl.innerHTML = subtests
    .map(
      (subtest) => `
        <article class="subtest-card">
          <div>
            <p class="section-label">${subtest.question_count} soal · ${subtest.materi_count} materi</p>
            <h2>${subtest.name}</h2>
            <p>${subtest.full_name}</p>
          </div>
          <div class="subtest-meta">
            <span>${subtest.duration_minutes} menit</span>
            <a class="button primary" href="/tes?subtest_key=${subtest.key}">Mulai Latihan</a>
          </div>
        </article>
      `
    )
    .join('');
}

async function init() {
  const response = await fetch('/api/subtests');
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Gagal memuat subtes.');
  renderSubtests(data.subtests || []);
}

init().catch((error) => {
  listEl.innerHTML = `<section class="empty-state"><h2>Gagal memuat data</h2><p>${error.message}</p></section>`;
});
