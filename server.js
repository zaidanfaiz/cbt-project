require('dotenv').config();

const express = require('express');
const path = require('path');
const Busboy = require('busboy');

const app = express();
const PORT = process.env.PORT || 3000;
const INSFORGE_BASE_URL = process.env.INSFORGE_BASE_URL || 'https://insforge.butuncloud.online';
const INSFORGE_ANON_KEY = process.env.INSFORGE_ANON_KEY;
const STORAGE_BUCKET = process.env.INSFORGE_STORAGE_BUCKET || 'uploads';
const AUTH_REQUIRED_PATHS = [
  '/api/catalog',
  '/api/subtests',
  '/api/questions',
  '/api/storage',
  '/api/flashcards',
  '/api/adu-kata',
  '/api/cloze',
  '/api/submit',
];

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
app.use('/vendor/insforge-sdk', express.static(path.join(__dirname, 'node_modules', '@insforge', 'sdk', 'dist')));

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

async function createInsforgeClient(accessToken = null) {
  if (!INSFORGE_ANON_KEY) {
    throw new Error('INSFORGE_ANON_KEY belum diisi di environment variable.');
  }
  const { createClient } = await import('@insforge/sdk');
  return createClient({
    baseUrl: INSFORGE_BASE_URL,
    anonKey: INSFORGE_ANON_KEY,
    edgeFunctionToken: accessToken || undefined,
  });
}

function bearerToken(req) {
  const header = String(req.headers.authorization || '');
  return header.startsWith('Bearer ') ? header.slice(7).trim() : '';
}

function cookieValue(req, name) {
  const cookies = String(req.headers.cookie || '').split(';');
  const pair = cookies.map((cookie) => cookie.trim()).find((cookie) => cookie.startsWith(`${name}=`));
  return pair ? decodeURIComponent(pair.slice(name.length + 1)) : '';
}

function safeNextPath(value) {
  const next = String(value || '/');
  return next.startsWith('/') && !next.startsWith('//') ? next : '/';
}

async function requireAuth(req, res, next) {
  const token = bearerToken(req);
  if (!token) {
    res.status(401).json({ error: 'Anda harus masuk terlebih dahulu.' });
    return;
  }

  try {
    const client = await createInsforgeClient(token);
    const { data, error } = await client.auth.getCurrentUser();
    if (error) throw error;
    const user = data && data.user;
    if (!user || !user.id) {
      res.status(401).json({ error: 'Sesi tidak valid. Silakan masuk ulang.' });
      return;
    }
    req.insforge = client;
    req.user = user;
    req.accessToken = token;
    next();
  } catch (error) {
    sendError(res, error, 401);
  }
}

app.use((req, res, next) => {
  const needsAuth = AUTH_REQUIRED_PATHS.some((pathPrefix) => req.path === pathPrefix || req.path.startsWith(`${pathPrefix}/`));
  if (!needsAuth) {
    next();
    return;
  }
  requireAuth(req, res, next);
});

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

async function dbSelect(table, columns = '*', clientOverride = null) {
  const client = clientOverride || (await insforge());
  const { data, error } = await client.database.from(table).select(columns).order('id', { ascending: true });
  if (error) throw error;
  return normalizeRows(data);
}

async function dbInsert(table, values, clientOverride = null) {
  const client = clientOverride || (await insforge());
  const { data, error } = await client.database.from(table).insert(values).select();
  if (error) throw error;
  return normalizeRows(data);
}

async function dbDeleteById(table, id, clientOverride = null) {
  const client = clientOverride || (await insforge());
  const { error } = await client.database.from(table).delete().eq('id', id);
  if (error) throw error;
}

async function dbFilterEq(table, column, value, clientOverride = null) {
  const client = clientOverride || (await insforge());
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
    attachment_url: String(payload.attachment_url || '').trim(),
    attachment_key: String(payload.attachment_key || '').trim(),
    attachment_name: String(payload.attachment_name || '').trim(),
    attachment_mime: String(payload.attachment_mime || '').trim(),
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

async function questionCountsBySubtest(clientOverride = null) {
  const questions = await dbSelect('questions', 'id, subtest_key', clientOverride);
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

function sampleFlashcardsForUser(userId) {
  return [
    {
      user_id: userId,
      deck: 'Bahasa Inggris Dasar',
      front_content: 'What is the meaning of <strong>although</strong>?',
      back_content: '<strong>Although</strong> berarti <em>meskipun</em>. Contoh: Although it rained, we continued studying.',
    },
    {
      user_id: userId,
      deck: 'Grammar UTBK',
      front_content: 'Complete the pattern: Subject + have/has + $V_3$ digunakan untuk tense apa?',
      back_content: 'Pola tersebut digunakan untuk <strong>Present Perfect Tense</strong>.',
    },
  ];
}

function sampleClozeTestsForUser(userId) {
  return [
    {
      user_id: userId,
      title: 'English Cloze - Daily Routine',
      passage_html: 'Every morning, Rani [blank_1] at 5 a.m. before she [blank_2] to school.',
      blanks_json: [
        { id: 'blank_1', type: 'dropdown', options: ['wake up', 'wakes up', 'waking up'], answer: 'wakes up' },
        { id: 'blank_2', type: 'text', answer: 'goes' },
      ],
    },
    {
      user_id: userId,
      title: 'English Cloze - Reading Context',
      passage_html: 'The committee has [blank_1] the proposal because it [blank_2] clear evidence.',
      blanks_json: [
        { id: 'blank_1', type: 'dropdown', options: ['approved', 'approve', 'approving'], answer: 'approved' },
        { id: 'blank_2', type: 'dropdown', options: ['contains', 'contain', 'containing'], answer: 'contains' },
      ],
    },
  ];
}

async function seedSamplesForUser(client, userId) {
  const flashcards = await dbSelect('flashcards', 'id', client);
  if (!flashcards.length) {
    await dbInsert('flashcards', sampleFlashcardsForUser(userId), client);
  }

  const clozeTests = await dbSelect('cloze_tests', 'id', client);
  if (!clozeTests.length) {
    await dbInsert('cloze_tests', sampleClozeTestsForUser(userId), client);
  }
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

app.get('/api/catalog', async (req, res) => {
  try {
    const counts = await questionCountsBySubtest(req.insforge);
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

app.get('/api/auth/config', async (_req, res) => {
  try {
    const client = await insforge();
    const { data, error } = await client.auth.getPublicAuthConfig();
    if (error) throw error;
    res.json({ config: data, base_url: INSFORGE_BASE_URL, anon_key: INSFORGE_ANON_KEY });
  } catch (error) {
    sendError(res, error);
  }
});

app.post('/api/auth/signup', async (req, res) => {
  try {
    const email = String((req.body && req.body.email) || '').trim();
    const password = String((req.body && req.body.password) || '');
    const name = String((req.body && req.body.name) || '').trim();
    if (!email || !password) {
      res.status(400).json({ error: 'Email dan kata sandi wajib diisi.' });
      return;
    }
    const client = await createInsforgeClient();
    const { data, error } = await client.auth.signUp({
      email,
      password,
      name,
      redirectTo: `${req.protocol}://${req.get('host')}/auth`,
    });
    if (error) throw error;
    if (data && data.accessToken && data.user && data.user.id) {
      const userClient = await createInsforgeClient(data.accessToken);
      await seedSamplesForUser(userClient, data.user.id).catch(() => null);
    }
    res.status(201).json({ user: data && data.user, accessToken: data && data.accessToken });
  } catch (error) {
    sendError(res, error, 400);
  }
});

app.post('/api/auth/signin', async (req, res) => {
  try {
    const email = String((req.body && req.body.email) || '').trim();
    const password = String((req.body && req.body.password) || '');
    if (!email || !password) {
      res.status(400).json({ error: 'Email dan kata sandi wajib diisi.' });
      return;
    }
    const client = await createInsforgeClient();
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw error;
    res.json({ user: data && data.user, accessToken: data && data.accessToken });
  } catch (error) {
    sendError(res, error, 400);
  }
});

app.post('/api/auth/google', async (req, res) => {
  try {
    const client = await createInsforgeClient();
    const redirectTo = String((req.body && req.body.redirectTo) || `${req.protocol}://${req.get('host')}/auth`);
    const { data, error } = await client.auth.signInWithOAuth('google', {
      redirectTo,
      skipBrowserRedirect: true,
      additionalParams: { prompt: 'select_account' },
    });
    if (error) throw error;
    res.json({ url: data && data.url });
  } catch (error) {
    sendError(res, error, 400);
  }
});

app.get('/api/auth/google/start', async (req, res) => {
  try {
    const client = await createInsforgeClient();
    const next = safeNextPath(req.query.next);
    const redirectTo = `${req.protocol}://${req.get('host')}/api/auth/google/callback?next=${encodeURIComponent(next)}`;
    const { data, error } = await client.auth.signInWithOAuth('google', {
      redirectTo,
      skipBrowserRedirect: true,
      additionalParams: { prompt: 'select_account' },
    });
    if (error) throw error;
    if (!data || !data.url || !data.codeVerifier) throw new Error('URL Google OAuth tidak tersedia.');
    const secure = req.protocol === 'https' ? '; Secure' : '';
    res.setHeader('Set-Cookie', `zdnch_google_pkce=${encodeURIComponent(data.codeVerifier)}; Path=/; Max-Age=600; SameSite=Lax; HttpOnly${secure}`);
    res.redirect(data.url);
  } catch (error) {
    sendError(res, error, 400);
  }
});

app.get('/api/auth/google/callback', async (req, res) => {
  try {
    const code = String(req.query.insforge_code || '');
    const verifier = cookieValue(req, 'zdnch_google_pkce');
    const next = safeNextPath(req.query.next);
    if (!code || !verifier) throw new Error('Callback Google tidak lengkap. Silakan coba masuk ulang.');
    const client = await createInsforgeClient();
    const { data, error } = await client.auth.exchangeOAuthCode(code, verifier);
    if (error) throw error;
    res.setHeader('Set-Cookie', 'zdnch_google_pkce=; Path=/; Max-Age=0; SameSite=Lax; HttpOnly');
    res.type('html').send(`<!doctype html>
<html lang="id">
  <head><meta charset="utf-8"><title>Memproses Login</title></head>
  <body>
    <script>
      localStorage.setItem('zdnch-insforge-access-token', ${JSON.stringify(data.accessToken)});
      localStorage.setItem('zdnch-insforge-user', ${JSON.stringify(JSON.stringify(data.user))});
      window.location.replace(${JSON.stringify(next)});
    </script>
  </body>
</html>`);
  } catch (error) {
    res.redirect(`/auth?error=${encodeURIComponent(error.message || 'Login Google gagal.')}`);
  }
});

app.get('/api/auth/me', requireAuth, async (req, res) => {
  res.json({ user: req.user });
});

app.post('/api/auth/signout', async (_req, res) => {
  res.json({ ok: true });
});

app.get('/api/subtests', async (req, res) => {
  try {
    const counts = await questionCountsBySubtest(req.insforge);
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
    const questions = subtestKey ? await dbFilterEq('questions', 'subtest_key', subtestKey, req.insforge) : await dbSelect('questions', '*', req.insforge);
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
    const [question] = await dbInsert('questions', { ...normalizeQuestionPayload(payload), user_id: req.user.id }, req.insforge);
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
    const inserted = await dbInsert(
      'questions',
      questions.map((question) => ({ ...normalizeQuestionPayload(question), user_id: req.user.id })),
      req.insforge
    );
    res.status(201).json({ inserted_count: inserted.length, questions: inserted });
  } catch (error) {
    sendError(res, error);
  }
});

app.delete('/api/questions/:id', async (req, res) => {
  try {
    await dbDeleteById('questions', req.params.id, req.insforge);
    res.json({ ok: true });
  } catch (error) {
    sendError(res, error);
  }
});

app.post('/api/storage/upload', async (req, res) => {
  try {
    const file = await parseMultipartUpload(req);
    const objectKey = `users/${req.user.id}/${Date.now()}-${safeFileName(file.filename)}`;
    const blob = new Blob([file.buffer], { type: file.mimeType });
    const { data, error } = await req.insforge.storage.from(STORAGE_BUCKET).upload(objectKey, blob);
    if (error) throw error;
    res.status(201).json({ file: data });
  } catch (error) {
    sendError(res, error, 400);
  }
});

app.get('/api/flashcards', async (req, res) => {
  try {
    res.json({ flashcards: await dbSelect('flashcards', '*', req.insforge) });
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
      attachment_url: String(card.attachment_url || '').trim(),
      attachment_key: String(card.attachment_key || '').trim(),
      attachment_name: String(card.attachment_name || '').trim(),
      attachment_mime: String(card.attachment_mime || '').trim(),
      user_id: req.user.id,
    }));
    const inserted = await dbInsert('flashcards', rows, req.insforge);
    res.status(201).json({ inserted_count: inserted.length });
  } catch (error) {
    sendError(res, error);
  }
});

app.get('/api/adu-kata', async (req, res) => {
  try {
    const rows = await dbSelect('word_quizzes', '*', req.insforge);
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
      attachment_url: String(item.attachment_url || '').trim(),
      attachment_key: String(item.attachment_key || '').trim(),
      attachment_name: String(item.attachment_name || '').trim(),
      attachment_mime: String(item.attachment_mime || '').trim(),
      user_id: req.user.id,
    }));
    const inserted = await dbInsert('word_quizzes', rows, req.insforge);
    res.status(201).json({ inserted_count: inserted.length });
  } catch (error) {
    sendError(res, error);
  }
});

app.get('/api/cloze', async (req, res) => {
  try {
    const rows = await dbSelect('cloze_tests', '*', req.insforge);
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
      attachment_url: String(item.attachment_url || '').trim(),
      attachment_key: String(item.attachment_key || '').trim(),
      attachment_name: String(item.attachment_name || '').trim(),
      attachment_mime: String(item.attachment_mime || '').trim(),
      user_id: req.user.id,
    }));
    const inserted = await dbInsert('cloze_tests', rows, req.insforge);
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

    const questions = await dbFilterEq('questions', 'subtest_key', subtestKey, req.insforge);
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
        attachment_url: question.attachment_url || '',
        attachment_key: question.attachment_key || '',
        attachment_name: question.attachment_name || '',
        attachment_mime: question.attachment_mime || '',
      };
    });

    const [attempt] = await dbInsert('attempts', {
      user_id: req.user.id,
      subtest_key: subtest.key,
      subtest_name: subtest.name,
      score,
      correct_count: correct,
      wrong_count: wrong,
      blank_count: blank,
      total_questions: questions.length,
      duration_seconds: durationSeconds,
    }, req.insforge);

    if (details.length) {
      await dbInsert(
        'attempt_answers',
        details.map((detail) => ({
          attempt_id: attempt.id,
          user_id: req.user.id,
          question_id: detail.question_id,
          selected_answer: detail.selected,
          correct_answer: detail.correct_answer,
          status: detail.status,
          points: detail.points,
        })),
        req.insforge
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

app.get(['/auth', '/auth.html'], (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'auth.html'));
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
