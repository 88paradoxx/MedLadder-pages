-- Topic notes: one revision page per topic (module), shown on the quiz
-- setup screen and the public topic page. Admins write them; everyone reads
-- published notes.
create table if not exists public.topic_notes (
  module_id   integer primary key references public.modules(id) on delete cascade,
  html        text not null default '',
  published   boolean not null default false,
  updated_at  timestamptz not null default now(),
  updated_by  uuid default auth.uid()
);
alter table public.topic_notes enable row level security;

drop policy if exists topic_notes_read on public.topic_notes;
create policy topic_notes_read on public.topic_notes
  for select to anon, authenticated using (published or (select public.is_admin()));

drop policy if exists topic_notes_admin_write on public.topic_notes;
create policy topic_notes_admin_write on public.topic_notes
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

grant select on public.topic_notes to anon, authenticated;
grant insert, update, delete on public.topic_notes to authenticated;

create or replace function public.topic_notes_touch() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at := now(); new.updated_by := auth.uid(); return new; end $$;
drop trigger if exists topic_notes_touch on public.topic_notes;
create trigger topic_notes_touch before insert or update on public.topic_notes
  for each row execute function public.topic_notes_touch();

-- Images for notes: public bucket, admin-only uploads (5 MB, images only).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('topic-notes', 'topic-notes', true, 5242880, array['image/png','image/jpeg','image/webp','image/gif'])
on conflict (id) do nothing;

drop policy if exists topic_notes_img_admin_insert on storage.objects;
create policy topic_notes_img_admin_insert on storage.objects
  for insert to authenticated with check (bucket_id = 'topic-notes' and (select public.is_admin()));
drop policy if exists topic_notes_img_admin_update on storage.objects;
create policy topic_notes_img_admin_update on storage.objects
  for update to authenticated using (bucket_id = 'topic-notes' and (select public.is_admin()));
drop policy if exists topic_notes_img_admin_delete on storage.objects;
create policy topic_notes_img_admin_delete on storage.objects
  for delete to authenticated using (bucket_id = 'topic-notes' and (select public.is_admin()));

-- An optional PDF per topic overview (stored in R2, served at /notes-files/).
alter table public.topic_notes add column if not exists pdf_url text, add column if not exists pdf_name text;
alter table public.topic_notes drop constraint if exists topic_notes_pdf_url_check;
alter table public.topic_notes add constraint topic_notes_pdf_url_check check (pdf_url is null or pdf_url ~ '^https://medladder\.top/notes-files/notes/[0-9]+/[a-z0-9-]+\.pdf$');

-- "Download as PDF": the PDF is generated when an admin saves and stored in R2,
-- so students download a normal https link (works inside the Android app).
alter table public.topic_notes add column if not exists export_pdf_url text;
alter table public.topic_notes drop constraint if exists topic_notes_export_pdf_url_check;
alter table public.topic_notes add constraint topic_notes_export_pdf_url_check check (export_pdf_url is null or export_pdf_url ~ '^https://medladder\.top/notes-files/notes/[0-9]+/[a-z0-9-]+\.pdf$');
