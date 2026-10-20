-- quote-attachments: accept only the file types the quote API stores.
--
-- The API already checks the extension and the browser-reported type, and uploads
-- with a content type chosen from the extension (never the one the client sent):
--   .pdf          -> application/pdf
--   .jpg / .jpeg  -> image/jpeg
--   .png          -> image/png
--   .dwg          -> image/vnd.dwg
-- Listing the same types on the bucket makes storage itself refuse anything else,
-- whoever writes (a bug in the API, a stray script with the service key).
--
-- A separate migration: 20261019000002_security.sql created the bucket and is not edited.
update storage.buckets
set allowed_mime_types = array['application/pdf', 'image/jpeg', 'image/png', 'image/vnd.dwg']
where id = 'quote-attachments';
