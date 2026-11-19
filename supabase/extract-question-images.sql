-- Run once in the Supabase SQL editor before running the extraction tool.
-- Image files remain in the existing public `question-images` bucket. This
-- creates structured links so question_text and explanation no longer store
-- image tags or URLs.

create table if not exists public.question_images (
  id uuid primary key,
  question_id bigint not null references public.questions(id) on delete cascade,
  content_field text not null check (content_field in ('question_text', 'explanation')),
  ordinal integer not null check (ordinal >= 0),
  storage_bucket text not null default 'question-images',
  storage_path text not null,
  alt_text text,
  created_at timestamptz not null default now(),
  unique (question_id, content_field, ordinal)
);

create index if not exists question_images_question_id_idx
  on public.question_images(question_id, content_field, ordinal);

-- Retains original text until the migration has been verified. It provides a
-- recoverable record without retaining another copy of every image file.
create table if not exists public.question_image_extraction_backups (
  question_id bigint primary key references public.questions(id) on delete cascade,
  question_text text,
  explanation text,
  extracted_at timestamptz not null default now()
);

alter table public.question_images enable row level security;
alter table public.question_image_extraction_backups enable row level security;

drop policy if exists "question_images_follow_question_access" on public.question_images;
create policy "question_images_follow_question_access"
  on public.question_images for select to authenticated
  using (
    exists (select 1 from public.questions q where q.id = question_images.question_id)
  );

revoke all on public.question_images from anon;
revoke insert, update, delete, truncate on public.question_images from authenticated;
revoke all on public.question_image_extraction_backups from anon, authenticated;
grant select on public.question_images to authenticated;
