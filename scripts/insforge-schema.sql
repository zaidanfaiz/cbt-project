-- Jalankan SQL ini di database PostgreSQL InsForge.
-- File ini hanya membuat struktur tabel. Tidak ada dummy data atau seeder.

create table if not exists questions (
  id bigserial primary key,
  subtest_key text not null,
  subtest_name text not null,
  materi_key text not null,
  materi_name text not null,
  question_text text not null,
  option_a text not null,
  option_b text not null,
  option_c text not null,
  option_d text not null,
  option_e text not null,
  correct_answer text not null check (correct_answer in ('A', 'B', 'C', 'D', 'E')),
  points integer not null default 4 check (points >= 0),
  explanation text default '',
  created_at timestamptz default now()
);

create index if not exists idx_questions_subtest_key on questions(subtest_key);
create index if not exists idx_questions_materi_key on questions(materi_key);

create table if not exists attempts (
  id bigserial primary key,
  subtest_key text not null,
  subtest_name text not null,
  score integer not null,
  correct_count integer not null,
  wrong_count integer not null,
  blank_count integer not null,
  total_questions integer not null,
  duration_seconds integer not null default 0,
  submitted_at timestamptz default now()
);

create table if not exists attempt_answers (
  id bigserial primary key,
  attempt_id bigint not null references attempts(id) on delete cascade,
  question_id bigint not null references questions(id) on delete cascade,
  selected_answer text check (selected_answer in ('A', 'B', 'C', 'D', 'E') or selected_answer is null),
  correct_answer text not null check (correct_answer in ('A', 'B', 'C', 'D', 'E')),
  status text not null check (status in ('benar', 'salah', 'kosong')),
  points integer not null
);

create index if not exists idx_attempt_answers_attempt_id on attempt_answers(attempt_id);

create table if not exists flashcards (
  id bigserial primary key,
  deck text default '',
  front_content text not null,
  back_content text not null,
  created_at timestamptz default now()
);

create index if not exists idx_flashcards_deck on flashcards(deck);

create table if not exists word_quizzes (
  id bigserial primary key,
  category text default '',
  question_type text not null check (question_type in ('sinonim', 'antonim', 'analogi')),
  prompt text not null,
  options_json jsonb not null,
  correct_answer text not null,
  explanation text default '',
  timer_seconds integer not null default 20 check (timer_seconds > 0),
  created_at timestamptz default now()
);

create index if not exists idx_word_quizzes_type on word_quizzes(question_type);

create table if not exists cloze_tests (
  id bigserial primary key,
  title text not null,
  passage_html text not null,
  blanks_json jsonb not null,
  created_at timestamptz default now()
);
