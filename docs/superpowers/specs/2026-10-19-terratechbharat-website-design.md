# TerraTechBharat Website — Design Spec

Date: 2026-10-19
Status: Draft, awaiting owner review

## 1. Goal

A catalogue and lead-generation website for **TerraTechBharat**, a supplier of geosynthetic products to buyers in **India and the UAE**, served at **terratechbharat.com**.

The site has three jobs:

1. **Win inquiries.** Every page leads to "Request a quote".
2. **Show the full catalogue.** Products, model-by-model spec tables, applications, datasheets.
3. **Build credibility.** Give contractors and tender reviewers certifications and past projects once they exist.

Success means a buyer can find the right product, read its specs, download a datasheet and send a quote request in under two minutes. It also means the owner can change any content from an admin panel without touching code or the database.

### Out of scope (v1)

- Prices of any kind, carts, ordering, online payment
- Languages other than English
- Multiple admin users or roles
- Blog / news
- Separate country sites or a country switcher

## 2. Decisions (from scoping, 2026-10-19)

| Topic | Decision |
|---|---|
| Brand | TerraTechBharat only (no Vinayaka Marketing branding) |
| Domain | terratechbharat.com (owned; currently redirects to vinayaka-marketing.in) |
| Regions | One site, one catalogue; quote form asks India or UAE and routes accordingly |
| Prices | None shown anywhere |
| Content source | Everything comes from the database, managed in an admin panel |
| Admin users | One admin account |
| Certifications / projects | None yet; sections auto-hide until entries exist |
| Language | English only |
| Look | Clean industrial/engineering; white and slate with logo colours navy `#253F70` and orange `#D97A3A` |
| Stack | Next.js (App Router, TypeScript) on Vercel + Supabase (Postgres, Auth, Storage) |
| Repo | `akshay-22502/vinayaka-marketing` (replaces the dangling submodule links) |
| Product lines | Geogrid (biaxial, uniaxial), Geomembrane (HDPE, LLDPE), Geotextile (woven, non-woven), Geocell |
| Content reference | lianyigeosyn.com for structure and typical spec fields only. Copy is original; none of its text, photos or case studies are reused |

## 3. Architecture

```
Browser ──► Next.js on Vercel
              ├─ Public pages (server components, cached; revalidated on admin save)
              ├─ /admin (client + server actions, requires Supabase session)
              └─ /api/quote (server route: validate → Turnstile → rate limit → insert → email)
                     │
                     ├─► Supabase Postgres (content + quote_requests, protected by RLS)
                     ├─► Supabase Storage (images, datasheets, certificates, quote attachments)
                     └─► Resend (quote notification + buyer confirmation)
```

- **Rendering:** public pages are server-rendered from Supabase and cached. Admin mutations call `revalidatePath`/`revalidateTag` so changes appear within seconds.
- **Auth:** Supabase email + password. Only the user listed in an `admins` table can use `/admin` or write content (enforced by RLS, not only by the UI).
- **Styling:** Tailwind CSS with brand tokens. Components are hand-built and accessible; no heavy UI kit.
- **Secrets:** Supabase service key, Resend API key and Turnstile secret are stored only in Vercel environment variables and never committed. A `.env.example` lists the names.

## 4. Public site

| Route | Content |
|---|---|
| `/` | Hero (tagline, CTA), four product-line tiles, top applications, "Why TerraTechBharat", India + UAE presence, quote CTA. Certification/project strips only if entries exist |
| `/products` | All categories |
| `/products/[category]` | Category intro + product cards |
| `/products/[category]/[product]` | Overview, features, photo gallery, spec table, roll sizes, applications, datasheet download, "Request a quote" (product pre-filled) |
| `/applications` and `/applications/[slug]` | Application description, image, products used |
| `/certifications` | Hidden (404 + removed from nav/sitemap) when empty |
| `/projects` and `/projects/[slug]` | Hidden when empty |
| `/about` | Company text from site settings |
| `/contact` | Both offices (address, phone, WhatsApp, email), quote form |
| `/quote` | Full quote form; accepts `?product=` pre-fill |

Present on every page: header navigation, a sticky "Request a quote" button, footer with both offices.

SEO: per-page title and description, Open Graph tags, `sitemap.xml` and `robots.txt` generated from published content, `Product` structured data (without price), clean slugs.

Accessibility: semantic HTML, keyboard-navigable menus and forms, colour contrast meeting WCAG AA (orange is used for accents and large text only where contrast requires it).

## 5. Data model (Supabase Postgres)

All content tables have `id uuid`, `created_at`, `updated_at`, plus `published boolean` and `sort_order int` where shown.

- **categories:** slug, name, intro, image_path, sort_order, published
- **products:** slug, category_id, name, summary, overview (markdown), features (text[]), images (text[] of storage paths), datasheet_path, sort_order, published
- **spec_properties:** product_id, name, unit, test_method, sort_order (rows of the spec table)
- **spec_models:** product_id, code (e.g. BX1515), sort_order (columns)
- **spec_values:** property_id, model_id, value (text, e.g. "15 / 15" for MD/XMD), unique(property_id, model_id)
- **roll sizes:** stored as a spec property so they appear in the same table
- **applications:** slug, name, summary, body (markdown), image_path, sort_order, published
- **product_applications:** product_id, application_id
- **certifications:** name, issuer, valid_until (nullable), file_path, image_path, sort_order, published
- **projects:** slug, title, location, country (`IN` | `AE`), summary, body, images, sort_order, published
- **project_products:** project_id, product_id
- **site_settings:** a single row holding tagline, home hero text, about text, office details for India and UAE (address, phone, whatsapp, public email)
- **quote_recipients:** country (`IN` | `AE`, primary key), email. A separate table so anonymous users can never read it
- **quote_requests:** name, company, email, phone, country (`IN` | `AE`), products (text[]), quantity, project_location, message, attachment_path, status (`new` | `contacted` | `quoted` | `closed`), admin_notes, email_sent boolean, ip_hash
- **admins:** user_id (references auth.users)

### Row-level security

- Anonymous users can `select` published rows of content tables and `site_settings`. They cannot read `quote_recipients`.
- Anonymous users cannot touch `quote_requests` directly. Inserts happen only through `/api/quote` using the service role after validation.
- Admins (`auth.uid()` present in `admins`) have full access to everything.

### Storage buckets

- `public-media` (public read; admin write): product images, category/application images, datasheets, certificates
- `quote-attachments` (private; written by the server, read by admins via signed URLs)

## 6. Admin panel (`/admin`)

- **Login:** email + password through Supabase Auth. A non-admin who signs in is signed out with a message.
- **Dashboard:** counts of new quote requests and published products.
- **CRUD screens** for categories, products, applications, certifications and projects. Each has a published toggle, drag/number sort order and image/PDF upload with preview.
- **Spec table editor** on the product screen: a grid with properties as rows and models as columns. Rows and columns can be added, removed and reordered, and cells are edited inline. It saves in one transaction.
- **Quote requests:** table filtered by status and country, detail view with attachment download, status change and notes.
- **Settings:** office details, quote recipient email per country, homepage and about text.
- Every save revalidates the public site (`revalidatePath('/', 'layout')`; the site is small enough that revalidating everything is simplest).

## 7. Quote request flow

1. A buyer fills the form: name*, company, email*, phone*, country* (India/UAE), products (multi-select, pre-filled), quantity, project location, message*, optional attachment (PDF/JPG/PNG/DWG ≤ 4 MB, the most a Vercel function accepts in one request; larger drawings can be emailed after first contact).
2. The client renders Cloudflare Turnstile. The form posts to `/api/quote`.
3. The server validates input with zod, verifies the Turnstile token, and applies a rate limit of 5 requests per IP hash per hour, checked against `quote_requests`.
4. The server uploads any attachment to `quote-attachments` and inserts the row with `status = new`. **The insert happens before any email.**
5. The server sends the notification to the recipient email for that country (from `quote_recipients`; never from the request) and a confirmation to the buyer through Resend, from `quotes@terratechbharat.com`. It then sets `email_sent`.
6. If email fails, the request stays saved with `email_sent = false` and shows a badge in admin. The buyer still sees success.

## 8. Seed content

A seed script inserts starter content the owner corrects in admin:

- 4 categories and about 8 products: PP biaxial geogrid, polyester uniaxial geogrid, HDPE geomembrane, LLDPE geomembrane, woven geotextile, non-woven geotextile, HDPE geocell
- Spec tables with typical industry properties and test methods (ASTM/ISO) and values, each product marked "typical values, confirm before publishing"
- About 6 applications: roads and pavements, slopes and retaining walls, landfills and containment, ponds and canals, erosion control, railways
- Site settings with placeholder office details for India and UAE
- Images: neutral placeholders until real photos are uploaded

Seeded products are **unpublished by default**. The owner reviews and publishes each one, so unverified specs never go live by accident.

## 9. Error handling

- Public pages: a missing slug or unpublished item returns 404. A database error shows a friendly error page and is logged.
- Admin: inline validation errors. Failed uploads are reported per file. Optimistic UI is not used for spec table saves, which stay transactional.
- Quote API: 400 for validation errors with field messages, 429 for the rate limit, 403 for a failed captcha, 500 only if the insert itself fails.

## 10. Testing

- **Unit (Vitest):** zod schemas, rate-limit logic, spec-table transform, recipient resolution (always from settings).
- **Integration:** `/api/quote` with mocked Turnstile and Resend. Covers insert-before-email and that an email failure still saves.
- **RLS tests** against a local Supabase: anon cannot read unpublished rows, recipient emails or quote_requests; a non-admin user cannot write.
- **E2E (Playwright):** browse home → category → product → quote with pre-fill; admin login → edit product → change visible on public page; empty certifications hidden.
- **Manual:** click-through on a Vercel preview deployment before the domain switch.

## 11. Launch steps

1. The owner creates free Supabase, Vercel and Resend accounts and shares access. Step-by-step instructions are provided.
2. Run migrations and the seed against Supabase, then create the admin user.
3. Connect the repo to Vercel and set the environment variables.
4. Verify the terratechbharat.com domain in Resend (DNS records).
5. The owner reviews seeded content, publishes, and adds real office details.
6. Point terratechbharat.com DNS at Vercel and remove the old redirect.

## 12. Housekeeping

- Remove the leftover `.DS_Store` from the repo and add a `.gitignore` (the old submodule links were already removed in the last commit).
- The old `Vinayaka-marketing-backend` repo contains a hard-coded Gmail app password. The owner should revoke it. The new site does not use that backend.
