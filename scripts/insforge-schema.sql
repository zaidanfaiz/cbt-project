-- Jalankan SQL ini di database PostgreSQL InsForge.
-- Idempotent: aman di-import ulang. Tidak menghapus data.

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

create table if not exists flashcards (
  id bigserial primary key,
  deck text default '',
  front_content text not null,
  back_content text not null,
  created_at timestamptz default now()
);

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

create table if not exists cloze_tests (
  id bigserial primary key,
  title text not null,
  passage_html text not null,
  blanks_json jsonb not null,
  created_at timestamptz default now()
);

alter table questions add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table attempts add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table attempt_answers add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table flashcards add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table word_quizzes add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table cloze_tests add column if not exists user_id uuid references auth.users(id) on delete cascade;

alter table questions add column if not exists attachment_url text default '';
alter table questions add column if not exists attachment_key text default '';
alter table questions add column if not exists attachment_name text default '';
alter table questions add column if not exists attachment_mime text default '';
alter table flashcards add column if not exists attachment_url text default '';
alter table flashcards add column if not exists attachment_key text default '';
alter table flashcards add column if not exists attachment_name text default '';
alter table flashcards add column if not exists attachment_mime text default '';
alter table word_quizzes add column if not exists attachment_url text default '';
alter table word_quizzes add column if not exists attachment_key text default '';
alter table word_quizzes add column if not exists attachment_name text default '';
alter table word_quizzes add column if not exists attachment_mime text default '';
alter table cloze_tests add column if not exists attachment_url text default '';
alter table cloze_tests add column if not exists attachment_key text default '';
alter table cloze_tests add column if not exists attachment_name text default '';
alter table cloze_tests add column if not exists attachment_mime text default '';

update questions set user_id = (select id from auth.users order by created_at asc limit 1) where user_id is null;
update attempts set user_id = (select id from auth.users order by created_at asc limit 1) where user_id is null;
update attempt_answers set user_id = (select id from auth.users order by created_at asc limit 1) where user_id is null;
update flashcards set user_id = (select id from auth.users order by created_at asc limit 1) where user_id is null;
update word_quizzes set user_id = (select id from auth.users order by created_at asc limit 1) where user_id is null;
update cloze_tests set user_id = (select id from auth.users order by created_at asc limit 1) where user_id is null;

alter table questions alter column user_id set default auth.uid();
alter table attempts alter column user_id set default auth.uid();
alter table attempt_answers alter column user_id set default auth.uid();
alter table flashcards alter column user_id set default auth.uid();
alter table word_quizzes alter column user_id set default auth.uid();
alter table cloze_tests alter column user_id set default auth.uid();

alter table questions alter column user_id set not null;
alter table attempts alter column user_id set not null;
alter table attempt_answers alter column user_id set not null;
alter table flashcards alter column user_id set not null;
alter table word_quizzes alter column user_id set not null;
alter table cloze_tests alter column user_id set not null;

create index if not exists idx_questions_user_subtest on questions(user_id, subtest_key);
create index if not exists idx_questions_materi_key on questions(materi_key);
create index if not exists idx_attempts_user on attempts(user_id);
create index if not exists idx_attempt_answers_user_attempt on attempt_answers(user_id, attempt_id);
create index if not exists idx_flashcards_user_deck on flashcards(user_id, deck);
create index if not exists idx_word_quizzes_user_type on word_quizzes(user_id, question_type);
create index if not exists idx_cloze_tests_user on cloze_tests(user_id);

alter table questions enable row level security;
alter table attempts enable row level security;
alter table attempt_answers enable row level security;
alter table flashcards enable row level security;
alter table word_quizzes enable row level security;
alter table cloze_tests enable row level security;

drop policy if exists questions_owner_all on questions;
drop policy if exists attempts_owner_all on attempts;
drop policy if exists attempt_answers_owner_all on attempt_answers;
drop policy if exists flashcards_owner_all on flashcards;
drop policy if exists word_quizzes_owner_all on word_quizzes;
drop policy if exists cloze_tests_owner_all on cloze_tests;

create policy questions_owner_all on questions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy attempts_owner_all on attempts
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy attempt_answers_owner_all on attempt_answers
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy flashcards_owner_all on flashcards
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy word_quizzes_owner_all on word_quizzes
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy cloze_tests_owner_all on cloze_tests
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

insert into flashcards (user_id, deck, front_content, back_content)
select id,
       'Bahasa Inggris Dasar',
       'What is the meaning of <strong>although</strong>?',
       '<strong>Although</strong> berarti <em>meskipun</em>. Contoh: Although it rained, we continued studying.'
from auth.users
where not exists (select 1 from flashcards where deck = 'Bahasa Inggris Dasar')
order by created_at asc
limit 1;

insert into flashcards (user_id, deck, front_content, back_content)
select id,
       'Grammar UTBK',
       'Complete the pattern: Subject + have/has + $V_3$ digunakan untuk tense apa?',
       'Pola tersebut digunakan untuk <strong>Present Perfect Tense</strong>.'
from auth.users
where not exists (select 1 from flashcards where deck = 'Grammar UTBK')
order by created_at asc
limit 1;

insert into cloze_tests (user_id, title, passage_html, blanks_json)
select id,
       'English Cloze - Daily Routine',
       'Every morning, Rani [blank_1] at 5 a.m. before she [blank_2] to school.',
       '[{"id":"blank_1","type":"dropdown","options":["wake up","wakes up","waking up"],"answer":"wakes up"},{"id":"blank_2","type":"text","answer":"goes"}]'::jsonb
from auth.users
where not exists (select 1 from cloze_tests where title = 'English Cloze - Daily Routine')
order by created_at asc
limit 1;

insert into cloze_tests (user_id, title, passage_html, blanks_json)
select id,
       'English Cloze - Reading Context',
       'The committee has [blank_1] the proposal because it [blank_2] clear evidence.',
       '[{"id":"blank_1","type":"dropdown","options":["approved","approve","approving"],"answer":"approved"},{"id":"blank_2","type":"dropdown","options":["contains","contain","containing"],"answer":"contains"}]'::jsonb
from auth.users
where not exists (select 1 from cloze_tests where title = 'English Cloze - Reading Context')
order by created_at asc
limit 1;
