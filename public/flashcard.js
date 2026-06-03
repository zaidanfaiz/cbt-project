const uploadForm = document.querySelector('#flashcard-upload');
const fileInput = document.querySelector('#flashcard-file');
const statusEl = document.querySelector('#flashcard-status');
const counterEl = document.querySelector('#flashcard-counter');
const deckEl = document.querySelector('#flashcard-deck');
const cardEl = document.querySelector('#flashcard-card');
const frontEl = document.querySelector('#flashcard-front');
const backEl = document.querySelector('#flashcard-back');
const prevButton = document.querySelector('#flashcard-prev');
const nextButton = document.querySelector('#flashcard-next');
const flipButton = document.querySelector('#flashcard-flip');
const editForm = document.querySelector('#flashcard-edit');
const editLoadButton = document.querySelector('#flashcard-edit-load');
const editSaveButton = document.querySelector('#flashcard-edit-save');
const deleteButton = document.querySelector('#flashcard-delete');
const editStatusEl = document.querySelector('#flashcard-edit-status');

let flashcards = [];
let currentIndex = 0;
let editingId = null;

function renderMath() {
  if (window.MathJax && window.MathJax.typesetPromise) window.MathJax.typesetPromise();
}

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle('error', isError);
}

function setEditStatus(message, isError = false) {
  editStatusEl.textContent = message;
  editStatusEl.classList.toggle('error', isError);
}

function attachmentMarkup(card) {
  if (!card || !card.attachment_url) return '';
  const name = card.attachment_name || 'Lampiran';
  const isImage = String(card.attachment_mime || '').startsWith('image/');
  return `<span class="record-attachment">
    <strong>Lampiran</strong>
    ${isImage ? `<img src="${card.attachment_url}" alt="${name}">` : ''}
    <a href="${card.attachment_url}" target="_blank" rel="noreferrer">${name}</a>
  </span>`;
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

function normalizeFlashcards(payload) {
  const rows = Array.isArray(payload) ? payload : payload.flashcards;
  if (!Array.isArray(rows) || rows.length === 0) throw new Error('JSON harus berisi array flashcard.');
  return rows;
}

function renderCard() {
  const card = flashcards[currentIndex];
  cardEl.classList.remove('flipped');
  if (!card) {
    counterEl.textContent = '0 kartu';
    deckEl.textContent = 'Deck';
    frontEl.innerHTML = 'Belum ada flashcard. Upload JSON untuk mulai.';
    backEl.innerHTML = 'Belum ada data.';
    prevButton.disabled = true;
    nextButton.disabled = true;
    editLoadButton.disabled = true;
    editSaveButton.disabled = true;
    deleteButton.disabled = true;
    return;
  }
  counterEl.textContent = `${currentIndex + 1} dari ${flashcards.length}`;
  deckEl.textContent = card.deck || 'Tanpa deck';
  frontEl.innerHTML = card.front_content + attachmentMarkup(card);
  backEl.innerHTML = card.back_content;
  prevButton.disabled = currentIndex === 0;
  nextButton.disabled = currentIndex === flashcards.length - 1;
  editLoadButton.disabled = false;
  editSaveButton.disabled = !editingId;
  deleteButton.disabled = false;
  renderMath();
}

function loadActiveCardIntoForm() {
  const card = flashcards[currentIndex];
  if (!card) return;
  editingId = card.id;
  editForm.elements.deck.value = card.deck || '';
  editForm.elements.front_content.value = card.front_content || '';
  editForm.elements.back_content.value = card.back_content || '';
  editSaveButton.disabled = false;
  setEditStatus('Mode edit aktif. Ubah data lalu klik Update Kartu.');
}

async function loadFlashcards() {
  const response = await fetch('/api/flashcards');
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Gagal memuat flashcard.');
  flashcards = data.flashcards || [];
  currentIndex = Math.min(currentIndex, Math.max(0, flashcards.length - 1));
  renderCard();
}

uploadForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    const rows = normalizeFlashcards(await readJsonFile(fileInput));
    const response = await fetch('/api/flashcards/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ flashcards: rows }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Import flashcard gagal.');
    uploadForm.reset();
    setStatus(`${data.inserted_count} flashcard berhasil diimport.`);
    await loadFlashcards();
  } catch (error) {
    setStatus(error.message, true);
  }
});

cardEl.addEventListener('click', () => cardEl.classList.toggle('flipped'));
flipButton.addEventListener('click', () => cardEl.classList.toggle('flipped'));
prevButton.addEventListener('click', () => {
  currentIndex = Math.max(0, currentIndex - 1);
  renderCard();
});
nextButton.addEventListener('click', () => {
  currentIndex = Math.min(flashcards.length - 1, currentIndex + 1);
  renderCard();
});

editLoadButton.addEventListener('click', loadActiveCardIntoForm);

editForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!editingId) {
    setEditStatus('Klik Edit Kartu Ini terlebih dahulu.', true);
    return;
  }

  try {
    const payload = Object.fromEntries(new FormData(editForm).entries());
    const response = await fetch(`/api/flashcards/${editingId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Update flashcard gagal.');
    const updated = data.flashcard;
    flashcards = flashcards.map((card) => (String(card.id) === String(updated.id) ? updated : card));
    renderCard();
    setEditStatus('Flashcard berhasil diperbarui.');
  } catch (error) {
    setEditStatus(error.message, true);
  }
});

deleteButton.addEventListener('click', async () => {
  const card = flashcards[currentIndex];
  if (!card || !confirm('Hapus flashcard ini?')) return;

  try {
    const response = await fetch(`/api/flashcards/${card.id}`, { method: 'DELETE' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Hapus flashcard gagal.');
    flashcards = flashcards.filter((item) => String(item.id) !== String(card.id));
    currentIndex = Math.min(currentIndex, Math.max(0, flashcards.length - 1));
    if (String(editingId) === String(card.id)) {
      editingId = null;
      editForm.reset();
    }
    renderCard();
    setEditStatus('Flashcard berhasil dihapus.');
  } catch (error) {
    setEditStatus(error.message, true);
  }
});

loadFlashcards().catch((error) => setStatus(error.message, true));
