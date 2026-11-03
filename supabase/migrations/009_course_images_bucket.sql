-- Storage bucket for course and tool cover images (POST /api/upload/course-image, /api/upload/tool-image).
-- The routes upload with the service-role key, so no storage policy is needed for writing; the bucket is
-- public so the stored image URL (…/storage/v1/object/public/course-images/…) can be shown to anyone signed in.
-- Only real image types and at most 5 MB, the same limits the routes enforce.
-- Idempotent: safe to run more than once.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('course-images', 'course-images', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
