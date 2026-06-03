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

let flashcards = [];
let currentIndex = 0;

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
    return;
  }
  counterEl.textContent = `${currentIndex + 1} dari ${flashcards.length}`;
  deckEl.textContent = card.deck || 'Tanpa deck';
  frontEl.innerHTML = card.front_content;
  backEl.innerHTML = card.back_content;
  prevButton.disabled = currentIndex === 0;
  nextButton.disabled = currentIndex === flashcards.length - 1;
  renderMath();
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

loadFlashcards().catch((error) => setStatus(error.message, true));
