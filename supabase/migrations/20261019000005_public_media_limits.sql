-- public-media: accept only what the admin screens upload, up to the size they allow.
--
-- The admin upload control (src/components/admin/MediaUpload.tsx) offers PNG, JPEG, WebP and PDF
-- files of at most 10 MB and checks that in the browser, but a browser check is no barrier: any
-- signed-in admin session could post an HTML or SVG file straight to Storage, and public-media
-- files are served from the same storage domain as the site's public URLs. Listing the types on
-- the bucket makes Storage itself refuse anything else, whoever writes (a hand-made request
-- with an admin's token, a stray script with the service key).
--
-- Keep this in step with src/lib/admin/upload.ts: IMAGE_ACCEPT + PDF_ACCEPT are the types below
-- and MAX_UPLOAD_BYTES is the size (10 * 1024 * 1024). tests/db/storage-limits.test.ts fails if
-- the two drift apart.
--
-- A separate migration: 20261019000002_security.sql created the bucket and is not edited.
update storage.buckets
set allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp', 'application/pdf'],
    file_size_limit = 10485760
where id = 'public-media';
