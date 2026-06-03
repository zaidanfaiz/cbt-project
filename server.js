require('dotenv').config();

const express = require('express');
const path = require('path');
const Busboy = require('busboy');

const app = express();
const PORT = process.env.PORT || 3000;
const INSFORGE_BASE_URL = process.env.INSFORGE_BASE_URL || 'https://insforge.butuncloud.online';
const INSFORGE_ANON_KEY = process.env.INSFORGE_ANON_KEY;
const STORAGE_BUCKET = process.env.INSFORGE_STORAGE_BUCKET || 'uploads';

const EXAM_CATALOG = [
  {
    key: 'tkdu',
    name: 'TKDU',
    full_name: 'Tes Kemampuan Dasar Umum',
    duration_minutes: 90,
    materi: [
      { key: 'matematika-dasar', name: 'Matematika Dasar' },
      { key: 'bahasa-indonesia', name: 'Bahasa Indonesia' },
      { key: 'bahasa-inggris', name: 'Bahasa Inggris' },
    ],
  },
  {
    key: 'tpa',
    name: 'TPA',
    full_name: 'Tes Potensi Akademik',
    duration_minutes: 90,
    materi: [
      { key: 'penalaran-verbal', name: 'Penalaran Verbal' },
      { key: 'penalaran-kuantitatif', name: 'Penalaran Kuantitatif' },
      { key: 'logika-figural', name: 'Logika Figural' },
    ],
  },
  {
    key: 'tka-matematika-ipa',
    name: 'TKA Matematika IPA',
    full_name: 'Tes Kemampuan Akademik Matematika IPA',
    duration_minutes: 120,
    materi: [
      { key: 'trigonometri-lanjutan', name: 'Trigonometri Lanjutan' },
      { key: 'kalkulus', name: 'Kalkulus' },
      { key: 'polinomial', name: 'Polinomial' },
      { key: 'geometri-analitik', name: 'Geometri Analitik' },
      { key: 'vektor-dimensi-tiga', name: 'Vektor & Dimensi Tiga' },
    ],
  },
  {
    key: 'tka-fisika',
    name: 'TKA Fisika',
    full_name: 'Tes Kemampuan Akademik Fisika',
    duration_minutes: 120,
    materi: [
      { key: 'mekanika', name: 'Mekanika' },
      { key: 'termodinamika', name: 'Termodinamika' },
      { key: 'listrik-magnet', name: 'Listrik dan Magnet' },
      { key: 'gelombang-optik', name: 'Gelombang dan Optik' },
      { key: 'fisika-modern', name: 'Fisika Modern' },
    ],
  },
];

let insforgeClientPromise;

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

async function insforge() {
  if (!INSFORGE_ANON_KEY) {
    throw new Error('INSFORGE_ANON_KEY belum diisi di environment variable.');
  }
  if (!insforgeClientPromise) {
    insforgeClientPromise = import('@insforge/sdk').then(({ createClient }) =>
      createClient({
        baseUrl: INSFORGE_BASE_URL,
        anonKey: INSFORGE_ANON_KEY,
      })
    );
  }
  return insforgeClientPromise;
}

function sendError(res, error, status = 500) {
  res.status(status).json({ error: error.message || String(error) });
}

function normalizeAnswer(answer) {
  return String(answer || '').trim().toUpperCase();
}

function findSubtest(key) {
  return EXAM_CATALOG.find((subtest) => subtest.key === key);
}

function findMateri(subtestKey, materiKey) {
  const subtest = findSubtest(subtestKey);
  if (!subtest) return null;
  return subtest.materi.find((materi) => materi.key === materiKey) || null;
}

function asArrayPayload(req, key) {
  if (Array.isArray(req.body)) return req.body;
  return Array.isArray(req.body && req.body[key]) ? req.body[key] : null;
}

function parseJsonColumn(value, fallback) {
  if (Array.isArray(value) || (value && typeof value === 'object')) return value;
  try {
    return JSON.parse(value);
  } catch (_error) {
    return fallback;
  }
}

function normalizeRows(data) {
  return Array.isArray(data) ? data : [];
}

async function dbSelect(table, columns = '*') {
  const client = await insforge();
  const { data, error } = await client.database.from(table).select(columns).order('id', { ascending: true });
  if (error) throw error;
  return normalizeRows(data);
}

async function dbInsert(table, values) {
  const client = await insforge();
  const { data, error } = await client.database.from(table).insert(values).select();
  if (error) throw error;
  return normalizeRows(data);
}

async function dbDeleteById(table, id) {
  const client = await insforge();
  const { error } = await client.database.from(table).delete().eq('id', id);
  if (error) throw error;
}

async function dbFilterEq(table, column, value) {
  const client = await insforge();
  const { data, error } = await client.database.from(table).select('*').eq(column, value).order('id', { ascending: true });
  if (error) throw error;
  return normalizeRows(data);
}

function validateQuestion(payload) {
  const required = ['subtest_key', 'materi_key', 'question_text', 'option_a', 'option_b', 'option_c', 'option_d', 'option_e'];
  const missing = required.filter((field) => !String(payload[field] || '').trim());
  const correct = normalizeAnswer(payload.correct_answer);
  const points = Number(payload.points ?? 4);

  if (missing.length) return `Field wajib belum lengkap: ${missing.join(', ')}.`;
  if (!findSubtest(payload.subtest_key)) return 'Subtes tidak valid.';
  if (!findMateri(payload.subtest_key, payload.materi_key)) return 'Materi tidak valid untuk subtes tersebut.';
  if (!['A', 'B', 'C', 'D', 'E'].includes(correct)) return 'Jawaban benar harus A, B, C, D, atau E.';
  if (!Number.isFinite(points) || points < 0) return 'Poin harus berupa angka tidak negatif.';
  return null;
}

function normalizeQuestionPayload(payload) {
  const subtest = findSubtest(payload.subtest_key);
  const materi = findMateri(payload.subtest_key, payload.materi_key);
  return {
    subtest_key: subtest.key,
    subtest_name: subtest.name,
    materi_key: materi.key,
    materi_name: materi.name,
    question_text: String(payload.question_text || '').trim(),
    option_a: String(payload.option_a || '').trim(),
    option_b: String(payload.option_b || '').trim(),
    option_c: String(payload.option_c || '').trim(),
    option_d: String(payload.option_d || '').trim(),
    option_e: String(payload.option_e || '').trim(),
    correct_answer: normalizeAnswer(payload.correct_answer),
    points: Number(payload.points ?? 4),
    explanation: String(payload.explanation || '').trim(),
  };
}

function validateFlashcard(card) {
  if (!String(card.front_content || '').trim()) return 'Sisi depan wajib diisi.';
  if (!String(card.back_content || '').trim()) return 'Sisi belakang wajib diisi.';
  return null;
}

function validateWordQuiz(item) {
  const type = String(item.question_type || '').trim().toLowerCase();
  const options = Array.isArray(item.options) ? item.options : [];
  const timerSeconds = Number(item.timer_seconds ?? 20);
  if (!['sinonim', 'antonim', 'analogi'].includes(type)) return 'Jenis soal harus sinonim, antonim, atau analogi.';
  if (!String(item.prompt || '').trim()) return 'Prompt soal wajib diisi.';
  if (options.length !== 5) return 'Opsi jawaban wajib berisi 5 item.';
  if (!String(item.correct_answer || '').trim()) return 'Jawaban benar wajib diisi.';
  if (!options.includes(item.correct_answer)) return 'Jawaban benar harus sama persis dengan salah satu opsi.';
  if (!Number.isInteger(timerSeconds) || timerSeconds <= 0) return 'Timer per soal harus berupa angka detik lebih dari 0.';
  return null;
}

function validateClozeTest(item) {
  const blanks = Array.isArray(item.blanks) ? item.blanks : [];
  if (!String(item.title || '').trim()) return 'Judul cloze test wajib diisi.';
  if (!String(item.passage_html || '').trim()) return 'Paragraf cloze test wajib diisi.';
  if (!blanks.length) return 'Daftar blank wajib berisi minimal 1 item.';
  for (const [index, blank] of blanks.entries()) {
    if (!String(blank.id || '').trim()) return `Blank nomor ${index + 1} belum memiliki id.`;
    if (!String(blank.answer || '').trim()) return `Blank ${blank.id} belum memiliki jawaban.`;
    if (!item.passage_html.includes(`[${blank.id}]`) && !item.passage_html.includes(`{{${blank.id}}}`)) {
      return `Marker [${blank.id}] tidak ditemukan di paragraf.`;
    }
    if (blank.type === 'dropdown' && (!Array.isArray(blank.options) || blank.options.length < 2)) {
      return `Blank ${blank.id} bertipe dropdown wajib memiliki minimal 2 opsi.`;
    }
  }
  return null;
}

async function questionCountsBySubtest() {
  const questions = await dbSelect('questions', 'id, subtest_key');
  return questions.reduce((acc, question) => {
    acc[question.subtest_key] = (acc[question.subtest_key] || 0) + 1;
    return acc;
  }, {});
}

function mapWordQuiz(row) {
  return {
    ...row,
    options: parseJsonColumn(row.options_json, []),
  };
}

function mapCloze(row) {
  return {
    ...row,
    blanks: parseJsonColumn(row.blanks_json, []),
  };
}

function safeFileName(name) {
  return String(name || 'upload.bin').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'upload.bin';
}

function parseMultipartUpload(req) {
  return new Promise((resolve, reject) => {
    const busboy = Busboy({ headers: req.headers });
    const chunks = [];
    let fileInfo = null;

    busboy.on('file', (_field, file, info) => {
      fileInfo = info;
      file.on('data', (chunk) => chunks.push(chunk));
    });
    busboy.on('error', reject);
    busboy.on('finish', () => {
      if (!fileInfo || chunks.length === 0) {
        reject(new Error('File upload tidak ditemukan.'));
        return;
      }
      resolve({
        buffer: Buffer.concat(chunks),
        filename: fileInfo.filename,
        mimeType: fileInfo.mimeType || 'application/octet-stream',
      });
    });
    req.pipe(busboy);
  });
}

app.get('/api/catalog', async (_req, res) => {
  try {
    const counts = await questionCountsBySubtest();
    res.json({
      subtests: EXAM_CATALOG.map((subtest) => ({
        ...subtest,
        question_count: counts[subtest.key] || 0,
      })),
    });
  } catch (error) {
    sendError(res, error);
  }
});

app.get('/api/subtests', async (_req, res) => {
  try {
    const counts = await questionCountsBySubtest();
    res.json({
      subtests: EXAM_CATALOG.map((subtest) => ({
        key: subtest.key,
        name: subtest.name,
        full_name: subtest.full_name,
        duration_minutes: subtest.duration_minutes,
        materi_count: subtest.materi.length,
        question_count: counts[subtest.key] || 0,
      })),
    });
  } catch (error) {
    sendError(res, error);
  }
});

app.get('/api/questions', async (req, res) => {
  try {
    const subtestKey = String(req.query.subtest_key || '').trim();
    if (subtestKey && !findSubtest(subtestKey)) {
      res.status(400).json({ error: 'Subtes tidak valid.' });
      return;
    }
    const questions = subtestKey ? await dbFilterEq('questions', 'subtest_key', subtestKey) : await dbSelect('questions');
    res.json({ questions });
  } catch (error) {
    sendError(res, error);
  }
});

app.post('/api/questions', async (req, res) => {
  const payload = req.body || {};
  const validationError = validateQuestion(payload);
  if (validationError) {
    res.status(400).json({ error: validationError });
    return;
  }

  try {
    const [question] = await dbInsert('questions', normalizeQuestionPayload(payload));
    res.status(201).json({ question });
  } catch (error) {
    sendError(res, error);
  }
});

app.post('/api/questions/bulk', async (req, res) => {
  const questions = asArrayPayload(req, 'questions');
  if (!questions || !questions.length) {
    res.status(400).json({ error: 'File JSON harus berisi array soal atau objek { "questions": [...] }.' });
    return;
  }

  const errors = questions
    .map((question, index) => ({ index, number: index + 1, error: validateQuestion(question || {}) }))
    .filter((item) => item.error);
  if (errors.length) {
    res.status(400).json({ error: 'Import dibatalkan karena ada data soal yang tidak valid.', errors });
    return;
  }

  try {
    const inserted = await dbInsert('questions', questions.map(normalizeQuestionPayload));
    res.status(201).json({ inserted_count: inserted.length, questions: inserted });
  } catch (error) {
    sendError(res, error);
  }
});

app.delete('/api/questions/:id', async (req, res) => {
  try {
    await dbDeleteById('questions', req.params.id);
    res.json({ ok: true });
  } catch (error) {
    sendError(res, error);
  }
});

app.post('/api/storage/upload', async (req, res) => {
  try {
    const file = await parseMultipartUpload(req);
    const objectKey = `images/${Date.now()}-${safeFileName(file.filename)}`;
    const blob = new Blob([file.buffer], { type: file.mimeType });
    const client = await insforge();
    const { data, error } = await client.storage.from(STORAGE_BUCKET).upload(objectKey, blob);
    if (error) throw error;
    res.status(201).json({ file: data });
  } catch (error) {
    sendError(res, error, 400);
  }
});

app.get('/api/flashcards', async (_req, res) => {
  try {
    res.json({ flashcards: await dbSelect('flashcards') });
  } catch (error) {
    sendError(res, error);
  }
});

app.post('/api/flashcards/bulk', async (req, res) => {
  const flashcards = asArrayPayload(req, 'flashcards');
  if (!flashcards || !flashcards.length) {
    res.status(400).json({ error: 'JSON harus berisi array flashcard atau objek { "flashcards": [...] }.' });
    return;
  }

  const errors = flashcards
    .map((card, index) => ({ index, number: index + 1, error: validateFlashcard(card || {}) }))
    .filter((item) => item.error);
  if (errors.length) {
    res.status(400).json({ error: 'Import flashcard dibatalkan karena ada data tidak valid.', errors });
    return;
  }

  try {
    const rows = flashcards.map((card) => ({
      deck: String(card.deck || '').trim(),
      front_content: String(card.front_content).trim(),
      back_content: String(card.back_content).trim(),
    }));
    const inserted = await dbInsert('flashcards', rows);
    res.status(201).json({ inserted_count: inserted.length });
  } catch (error) {
    sendError(res, error);
  }
});

app.get('/api/adu-kata', async (_req, res) => {
  try {
    const rows = await dbSelect('word_quizzes');
    res.json({ questions: rows.map(mapWordQuiz) });
  } catch (error) {
    sendError(res, error);
  }
});

app.post('/api/adu-kata/bulk', async (req, res) => {
  const questions = asArrayPayload(req, 'questions');
  if (!questions || !questions.length) {
    res.status(400).json({ error: 'JSON harus berisi array soal atau objek { "questions": [...] }.' });
    return;
  }

  const errors = questions
    .map((item, index) => ({ index, number: index + 1, error: validateWordQuiz(item || {}) }))
    .filter((item) => item.error);
  if (errors.length) {
    res.status(400).json({ error: 'Import Adu Kata dibatalkan karena ada data tidak valid.', errors });
    return;
  }

  try {
    const rows = questions.map((item) => ({
      category: String(item.category || '').trim(),
      question_type: String(item.question_type).trim().toLowerCase(),
      prompt: String(item.prompt).trim(),
      options_json: item.options,
      correct_answer: String(item.correct_answer).trim(),
      explanation: String(item.explanation || '').trim(),
      timer_seconds: Number(item.timer_seconds ?? 20),
    }));
    const inserted = await dbInsert('word_quizzes', rows);
    res.status(201).json({ inserted_count: inserted.length });
  } catch (error) {
    sendError(res, error);
  }
});

app.get('/api/cloze', async (_req, res) => {
  try {
    const rows = await dbSelect('cloze_tests');
    res.json({ tests: rows.map(mapCloze) });
  } catch (error) {
    sendError(res, error);
  }
});

app.post('/api/cloze/bulk', async (req, res) => {
  const tests = asArrayPayload(req, 'tests');
  if (!tests || !tests.length) {
    res.status(400).json({ error: 'JSON harus berisi array cloze test atau objek { "tests": [...] }.' });
    return;
  }

  const errors = tests
    .map((item, index) => ({ index, number: index + 1, error: validateClozeTest(item || {}) }))
    .filter((item) => item.error);
  if (errors.length) {
    res.status(400).json({ error: 'Import Fill-in-the-Blank dibatalkan karena ada data tidak valid.', errors });
    return;
  }

  try {
    const rows = tests.map((item) => ({
      title: String(item.title).trim(),
      passage_html: String(item.passage_html).trim(),
      blanks_json: item.blanks,
    }));
    const inserted = await dbInsert('cloze_tests', rows);
    res.status(201).json({ inserted_count: inserted.length });
  } catch (error) {
    sendError(res, error);
  }
});

app.post('/api/submit', async (req, res) => {
  try {
    const subtestKey = String((req.body && req.body.subtest_key) || '').trim();
    const answers = req.body && typeof req.body.answers === 'object' ? req.body.answers : {};
    const durationSeconds = Number(req.body && req.body.duration_seconds) || 0;
    const subtest = findSubtest(subtestKey);

    if (!subtest) {
      res.status(400).json({ error: 'Subtes tidak valid.' });
      return;
    }

    const questions = await dbFilterEq('questions', 'subtest_key', subtestKey);
    let correct = 0;
    let wrong = 0;
    let blank = 0;
    let score = 0;

    const details = questions.map((question, index) => {
      const selected = normalizeAnswer(answers[question.id]);
      let status = 'kosong';
      let earned = 0;

      if (!selected) {
        blank += 1;
      } else if (selected === question.correct_answer) {
        correct += 1;
        earned = 4;
        score += earned;
        status = 'benar';
      } else {
        wrong += 1;
        earned = -1;
        score += earned;
        status = 'salah';
      }

      return {
        number: index + 1,
        question_id: question.id,
        subtest_key: question.subtest_key,
        subtest_name: question.subtest_name,
        materi_key: question.materi_key,
        materi_name: question.materi_name,
        question_text: question.question_text,
        options: {
          A: question.option_a,
          B: question.option_b,
          C: question.option_c,
          D: question.option_d,
          E: question.option_e,
        },
        selected: selected || null,
        correct_answer: question.correct_answer,
        status,
        points: earned,
        explanation: question.explanation || '',
      };
    });

    const [attempt] = await dbInsert('attempts', {
      subtest_key: subtest.key,
      subtest_name: subtest.name,
      score,
      correct_count: correct,
      wrong_count: wrong,
      blank_count: blank,
      total_questions: questions.length,
      duration_seconds: durationSeconds,
    });

    if (details.length) {
      await dbInsert(
        'attempt_answers',
        details.map((detail) => ({
          attempt_id: attempt.id,
          question_id: detail.question_id,
          selected_answer: detail.selected,
          correct_answer: detail.correct_answer,
          status: detail.status,
          points: detail.points,
        }))
      );
    }

    res.json({
      attempt_id: attempt.id,
      subtest,
      total_questions: questions.length,
      correct,
      wrong,
      blank,
      score,
      details,
    });
  } catch (error) {
    sendError(res, error);
  }
});

app.get(['/input-soal', '/input.html'], (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'input.html'));
});

app.get(['/simulasi', '/simulasi.html'], (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'simulasi.html'));
});

app.get(['/flashcard', '/flashcard.html'], (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'flashcard.html'));
});

app.get(['/adu-kata', '/adu-kata.html'], (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'adu-kata.html'));
});

app.get(['/fill-blank', '/fill-blank.html'], (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'fill-blank.html'));
});

app.get(['/tes', '/tes.html'], (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'tes.html'));
});

app.get(['/hasil', '/result.html'], (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'result.html'));
});

app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Aplikasi ZDNCH BELAJAR berjalan di http://localhost:${PORT}`);
});
