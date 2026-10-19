# TerraTechBharat Website Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the TerraTechBharat catalogue + quote-request website with a private admin panel, fully driven by Supabase.

**Architecture:** One Next.js App Router app. Public pages read published content with an anonymous Supabase client and are cached. `/admin` uses the signed-in user's session, so Postgres RLS is the real permission check. Every admin save calls `revalidatePath('/', 'layout')`. Quote requests go through `/api/quote`, which validates, checks the captcha and rate limit, saves first, then emails.

**Tech Stack:** Node 22, Next.js 15.5.x, React 19, TypeScript (strict), Tailwind CSS 4, `@supabase/supabase-js` + `@supabase/ssr`, zod, `react-markdown` (no raw HTML), Resend, Cloudflare Turnstile, Vitest, Playwright, Supabase CLI (local stack in Docker for DB tests).

**Spec:** `docs/superpowers/specs/2026-10-19-terratechbharat-website-design.md`

## Global Constraints

- English only. Brand name "TerraTechBharat" everywhere; no "Vinayaka Marketing" text.
- No prices, carts or ordering anywhere (including JSON-LD: `Product` without `offers`).
- Brand colours: navy `#253F70`, orange `#D97A3A`; white/slate base. Orange text only where it meets WCAG AA (large text/accents).
- Countries are exactly `IN` (India) and `AE` (UAE).
- Quote statuses are exactly `new`, `contacted`, `quoted`, `closed`.
- Quote attachment: optional, ≤ 4 MB, MIME/extension PDF, JPG, PNG or DWG.
- Rate limit: 5 quote requests per IP hash per rolling hour; the 6th gets 429.
- Quote recipients come only from the `quote_recipients` table, never from request data.
- Insert the quote row before sending any email; email failure never fails the request.
- Seeded products are `published = false`.
- Secrets only in env vars, never committed: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `MAIL_FROM` (`TerraTechBharat <quotes@terratechbharat.com>`), `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`, `IP_HASH_SALT`, `NEXT_PUBLIC_SITE_URL`.
- Dev fallbacks (needed because the sandbox can't reach Cloudflare or Resend) are enabled only by the explicit env `ALLOW_DEV_FALLBACKS=true` (never set on Vercel; E2E runs `next start`, so NODE_ENV can't be used): then an unset `TURNSTILE_SECRET_KEY` makes captcha verification return true, and an unset `RESEND_API_KEY` makes the mailer log instead of sending. Without the flag, a missing key throws at request time with a 500 and a logged error.
- Markdown fields render through `react-markdown` without `rehype-raw`. Buyer-supplied text is HTML-escaped in emails and rendered as text in admin.

## Review Focus

1. **Buyer text containing HTML/script** (`<script>`, `<img onerror>`) in the quote message or name must arrive escaped in the team email and show as plain text in admin. Test in Task 8.
2. **Spec table with empty cells** (a model with no value for some property) must render `–`, not blank or a crash. Test in Task 4.
3. **Published product inside an unpublished category** must 404 and stay out of listings and the sitemap. The same goes for a product URL with the wrong category slug. Test in Task 4.
4. **Duplicate slug** when saving any entity in admin must show "This URL slug is already used" on the slug field, not a 500. Test in Task 11.
5. **`/quote?product=` with an unknown or unpublished slug** must open the form with nothing pre-selected, not an error. Test in Task 9.

---

## File Structure

```
.env.example  .gitignore  package.json  tsconfig.json  next.config.ts  postcss.config.mjs
vitest.config.ts  playwright.config.ts  src/middleware.ts
supabase/config.toml
supabase/migrations/20261019000001_schema.sql      tables, enums, triggers
supabase/migrations/20261019000002_security.sql    is_admin(), RLS policies, storage buckets/policies
supabase/migrations/20261019000003_spec_rpc.sql    save_spec_table()
supabase/seed.sql
public/placeholders/{geogrid,geomembrane,geotextile,geocell,application}.svg
src/lib/env.ts                       typed env access + production checks
src/lib/slug.ts                      slugify()
src/lib/supabase/{public,server,service,browser}.ts
src/lib/content/types.ts             public content types
src/lib/content/queries.ts           all public reads
src/lib/content/spec-grid.ts         toSpecGrid(), toRpcPayload()
src/lib/storage.ts                   publicMediaUrl(path)
src/lib/quote/{schema,ip,turnstile,mailer,emails,store,handle}.ts
src/lib/admin/{require-admin,schemas,action-result}.ts
src/app/(site)/...                   public routes + layout (header/footer)
src/app/api/quote/route.ts
src/app/admin/login/page.tsx
src/app/admin/(protected)/layout.tsx + one folder per entity (page, [id]/page, actions.ts)
src/components/site/*                Header, Footer, QuoteFab, ProductCard, SpecTable, Markdown, QuoteForm
src/components/admin/*               EntityTable, Field, MediaUpload, PublishedToggle, SpecGridEditor
tests/unit/*  tests/db/*  tests/e2e/*
README.md                            dev setup + launch runbook
```

---

### Task 1: Project scaffold, brand theme, test harness

**Files:**
- Create: everything at the repo root listed above (configs), `src/app/layout.tsx`, `src/app/globals.css`, `src/lib/slug.ts`, `src/lib/env.ts`, `tests/unit/slug.test.ts`
- Delete: `.DS_Store`

**Interfaces:**
- Produces: `slugify(input: string): string`. Lowercase, ASCII, hyphen-separated, trimmed, no leading or trailing hyphens. `env` object from `src/lib/env.ts` with `requireServerEnv(name)`. npm scripts `dev`, `build`, `lint`, `typecheck`, `test:unit`, `test:db`, `test:e2e`, `db:start`, `db:reset`.

- [ ] **Step 1:** `npx create-next-app@15.5 . --ts --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm` (keep the existing `docs/`). Add deps: `@supabase/supabase-js @supabase/ssr zod react-markdown resend`. Add dev deps: `vitest @vitest/coverage-v8 @playwright/test supabase`. `.gitignore` covers `.env*` except `.env.example`, `.DS_Store`, `supabase/.temp`.
- [ ] **Step 2:** Write the failing test `tests/unit/slug.test.ts`: `slugify("PP Biaxial Geogrid BX-1515") === "pp-biaxial-geogrid-bx-1515"`, `slugify("  HDPE / LLDPE  ") === "hdpe-lldpe"`, `slugify("Géotextile") === "geotextile"`.
- [ ] **Step 3:** Run `npm run test:unit`. Expect FAIL (module not found).
- [ ] **Step 4:** Implement `slugify` (NFKD normalize, strip diacritics, non-alphanumerics → `-`, collapse).
- [ ] **Step 5:** Brand theme in `globals.css` via Tailwind 4 `@theme`: `--color-navy: #253F70`, `--color-orange: #D97A3A`, a slate scale, Inter via `next/font`. Root layout sets `lang="en"` and the default metadata title template `%s | TerraTechBharat`.
- [ ] **Step 6:** Run `npm run test:unit && npm run typecheck && npm run build`. Expect all pass.
- [ ] **Step 7:** Commit `chore: scaffold Next.js app with brand theme and test harness`.

### Task 2: Database schema, security and spec-table RPC

**Files:**
- Create: `supabase/config.toml` (via `npx supabase init`), the three migrations, `tests/db/helpers.ts`, `tests/db/rls.test.ts`, `scripts/lib/users.ts`

**Interfaces:**
- Produces tables exactly as in spec §5 (snake_case columns), plus `quote_recipients(country text primary key check (country in ('IN','AE')), email text not null)`.
  - `site_settings` is one row, enforced with `id int primary key default 1 check (id = 1)`.
  - Columns: `tagline, hero_title, hero_text, about_md, india_address, india_phone, india_whatsapp, india_email, uae_address, uae_phone, uae_whatsapp, uae_email`.
  - `slug` columns are `unique not null`.
  - `quote_requests.status` uses a check constraint on the four statuses, default `'new'`.
  - `updated_at` is set by a trigger.
- Produces `public.is_admin() returns boolean` (security definer, `exists (select 1 from admins where user_id = auth.uid())`).
- Produces `public.save_spec_table(p_product_id uuid, p_grid jsonb) returns void` (security invoker, raises if not `is_admin()`). It deletes the product's spec rows and reinserts them from `{"models": ["BX1515",...], "rows": [{"name","unit","test_method","values":[...]}]}`, keeping array order as `sort_order`. It runs in one transaction because it is a single function call.
- Produces storage buckets `public-media` (public) and `quote-attachments` (private), with write policies limited to `is_admin()`.
- Produces `scripts/lib/users.ts`: `ensureUser(service: SupabaseClient, email: string, password: string, opts: {admin: boolean}): Promise<string>` (creates or reuses the auth user with email confirmed, upserts/removes the `admins` row, returns user id). It is the only user-creation code: `tests/db/helpers.ts`, `scripts/e2e-prepare.ts` (Task 5) and `scripts/create-admin.ts` (Task 10) all call it.
- Produces `tests/db/helpers.ts`: `anonClient()`, `serviceClient()`, `signedInClient(email, password)`, `createUser(email, password, {admin: boolean})`. All read local Supabase URLs/keys from `npx supabase status -o env`, loaded in `vitest.config.ts` for the `db` project.

- [ ] **Step 1:** Write the failing tests in `tests/db/rls.test.ts`:
  - anon `select` on `products` returns only `published = true` rows
  - anon `select` on `quote_requests` returns 0 rows and anon `insert` errors
  - anon `select` on `quote_recipients` returns 0 rows
  - a signed-in non-admin `insert` into `categories` errors
  - an admin `insert` into `categories` succeeds
  - `save_spec_table` called by a non-admin raises
  - `save_spec_table` called by an admin replaces rows: after saving 2 models × 3 rows, reading back gives 2 `spec_models`, 3 `spec_properties`, 6 `spec_values` in order
- [ ] **Step 2:** `npm run db:start` (Docker; the first run pulls images, so allow ~10 min), then `npm run test:db`. Expect FAIL.
- [ ] **Step 3:** Write the three migrations.
- [ ] **Step 4:** `npm run db:reset && npm run test:db`. Expect PASS.
- [ ] **Step 5:** Commit `feat(db): schema, RLS, storage buckets and spec table RPC`.

### Task 3: Seed content

**Files:**
- Create: `supabase/seed.sql`, `public/placeholders/*.svg`, `tests/db/seed.test.ts`

**Interfaces:**
- Produces published categories with slugs `geogrid`, `geomembrane`, `geotextile`, `geocell`.
- Produces unpublished products, each with a spec table:
  - `pp-biaxial-geogrid`: models BX1515–BX4040. Properties: tensile strength MD/XMD (ASTM D6637), strength at 2% and 5% strain, junction efficiency (GRI-GG2), aperture size, carbon black (ASTM D4218), roll size.
  - `polyester-uniaxial-geogrid`: models 50–200 kN/m. Properties: ultimate tensile (ISO 10319), elongation at break, creep reduction factor, roll size.
  - `hdpe-geomembrane` and `lldpe-geomembrane`: models 0.5, 0.75, 1.0, 1.5, 2.0 mm. Properties per GRI-GM13 / GM17: thickness (ASTM D5199), density (D1505), tensile yield and break strength (D6693), elongation, tear (D1004), puncture (D4833), carbon black, roll size.
  - `woven-geotextile` and `nonwoven-geotextile`: models by GSM. Properties: mass per unit area (ISO 9864), tensile (ISO 10319), CBR puncture (ISO 12236), apparent opening size (ISO 12956), permeability (ISO 11058), roll size.
  - `hdpe-geocell`: models by cell depth 50–200 mm. Properties: cell depth, weld spacing, sheet thickness, weld peel strength, roll/section size.
- Every product's `overview` ends with the line `_Typical values. Confirm against the manufacturer's datasheet before publishing._`
- Produces published applications `roads-and-pavements`, `slopes-and-retaining-walls`, `landfills-and-containment`, `ponds-and-canals`, `erosion-control`, `railways`, each linked to the products it uses.
- Produces a `site_settings` row with `[India address]`-style placeholders and tagline "Geosynthetic solutions for India and the UAE".
- Produces no certifications, no projects and no recipients. Copy is original; nothing is taken from lianyigeosyn.com.

- [ ] **Step 1:** Write the failing `tests/db/seed.test.ts` (service client):
  - 4 categories and 7 products exist
  - every product has `published = false`
  - every product has ≥ 1 spec model and ≥ 4 properties
  - 6 applications exist
  - 0 certifications and 0 projects exist
- [ ] **Step 2:** Run `npm run db:reset && npm run test:db -- seed`. Expect FAIL.
- [ ] **Step 3:** Write `seed.sql` and the placeholder SVGs (navy background, orange line-art of grid/sheet/cells).
- [ ] **Step 4:** Run it again. Expect PASS.
- [ ] **Step 5:** Commit `feat(db): seed starter catalogue (unpublished)`.

### Task 4: Public data layer

**Files:**
- Create: `src/lib/supabase/public.ts`, `src/lib/content/{types,queries,spec-grid}.ts`, `src/lib/storage.ts`, `tests/unit/spec-grid.test.ts`, `tests/db/queries.test.ts`

**Interfaces:**
- Consumes: the Task 2 schema.
- Produces in `types.ts`:
  - `Country = 'IN' | 'AE'`
  - `SpecGrid = { models: string[]; rows: { name: string; unit: string | null; testMethod: string | null; values: (string | null)[] }[] }`
  - `Category`, `ProductSummary { slug, name, summary, categorySlug, coverImage: string | null }`
  - `Product extends ProductSummary { overview, features: string[], images: string[], datasheetPath: string | null, specGrid: SpecGrid, applications: {slug,name}[] }`
  - `Application`, `Certification`, `Project`, `SiteSettings` (camelCase)
- Produces `toSpecGrid(models, properties, values): SpecGrid`. Missing cells become `null`.
- Produces in `queries.ts` (all async, anon client, published-only, category must also be published):
  - `getCategories()`, `getCategoryWithProducts(slug)`, `getProduct(categorySlug, productSlug)`
  - `getApplications()`, `getApplication(slug)` (with products)
  - `getCertifications()`, `getProjects()`, `getProject(slug)`
  - `getSiteSettings()`, `getNavVisibility(): {certifications: boolean; projects: boolean}`
  - `getProductOptions(): {slug,name}[]`, `getSitemapEntries(): {path: string; updatedAt: string}[]`
  - Not-found reads return `null`.
- Produces `publicMediaUrl(path: string | null): string | null`.

- [ ] **Step 1:** Write the failing unit tests:
  - `toSpecGrid` orders models and rows by `sort_order`
  - a missing value gives `null` at the right index (Review Focus 2)
- [ ] **Step 2:** Write the failing db tests (they publish fixtures via the service client in `beforeAll`):
  - `getProduct('geogrid','pp-biaxial-geogrid')` returns a spec grid
  - `getProduct('geomembrane','pp-biaxial-geogrid')` returns `null` (wrong category)
  - after unpublishing the `geogrid` category, `getProduct` returns `null` and `getSitemapEntries()` contains no `/products/geogrid` paths (Review Focus 3)
  - `getNavVisibility()` gives `{certifications:false, projects:false}` on seed data
- [ ] **Step 3:** Run them. Expect FAIL. Implement. Run them again. Expect PASS.
- [ ] **Step 4:** Commit `feat: public content queries and spec grid transform`.

### Task 5: Public layout, home and product pages

**Files:**
- Create: `src/app/(site)/layout.tsx`, `src/app/(site)/page.tsx`, `src/app/(site)/products/page.tsx`, `src/app/(site)/products/[category]/page.tsx`, `src/app/(site)/products/[category]/[product]/page.tsx`, `src/app/not-found.tsx`, `src/app/error.tsx`, `src/components/site/{Header,Footer,QuoteFab,ProductCard,SpecTable,Markdown}.tsx`, `tests/e2e/catalogue.spec.ts`, `scripts/e2e-prepare.ts`

**Interfaces:**
- Consumes: Task 4 queries.
- Produces `<SpecTable grid={SpecGrid} />`. It renders a horizontally scrollable table with a sticky first column; `null` cells show `–`; columns are Property, Unit, Test method, then one column per model.
- Produces `<QuoteFab />`, a sticky bottom-right link to `/quote`. Product pages pass `?product=<slug>`.
- E2E runs against a production build so caching and revalidation are real: `pretest:e2e` runs `db:reset`, then `scripts/e2e-prepare.ts` (publishes all seed products and creates an admin `admin@e2e.test` and a non-admin `user@e2e.test` through the service client), then `next build`. `playwright.config.ts` starts `next start` as its webServer, with `workers: 1`. Tests that change content do it through the admin UI (so revalidation is exercised) and assert only on items they created themselves.

- [ ] **Step 1:** Write the failing `catalogue.spec.ts`:
  - home shows 4 category tiles
  - clicking Geogrid then PP Biaxial Geogrid shows a table with column header `BX1515` and a "Request a quote" link to `/quote?product=pp-biaxial-geogrid`
  - `/products/geomembrane/pp-biaxial-geogrid` shows the 404 page
  - no element on these pages contains `₹`, `AED` or `price` (case-insensitive)
- [ ] **Step 2:** Run `npm run test:e2e -- catalogue`. Expect FAIL.
- [ ] **Step 3:** Implement the pages.
  - All `(site)` pages set `export const revalidate = 3600`.
  - Product page sections in order: breadcrumb, gallery (placeholder when there are no images), overview, features, spec table, applications chips, datasheet button (hidden when `datasheetPath` is null), quote CTA.
  - Header nav: Products, Applications, Certifications/Projects (only when `getNavVisibility()` says so), About, Contact, plus a "Request a quote" button.
  - Footer: both offices from settings.
- [ ] **Step 4:** Run the test again. Expect PASS. Check mobile at 375px with a Playwright screenshot: no horizontal page scroll (the spec table scrolls inside its own container).
- [ ] **Step 5:** Commit `feat: public layout, home and product pages`.

### Task 6: Applications, certifications, projects, about, contact

**Files:**
- Create: `src/app/(site)/applications/{page,[slug]/page}.tsx`, `certifications/page.tsx`, `projects/{page,[slug]/page}.tsx`, `about/page.tsx`, `contact/page.tsx`, `tests/e2e/sections.spec.ts`

**Interfaces:**
- Consumes: Task 4 queries and Task 5 components.
- `certifications` and `projects` pages call `notFound()` when their lists are empty.

- [ ] **Step 1:** Write the failing tests:
  - `/applications/roads-and-pavements` lists PP Biaxial Geogrid
  - `/certifications` and `/projects` return 404 and the header has no links to them on seed data
  - `/contact` shows both office blocks
- [ ] **Step 2:** Run. Expect FAIL. Implement. Run again. Expect PASS.
- [ ] **Step 3:** Commit `feat: applications, certifications, projects, about and contact pages`.

### Task 7: SEO

**Files:**
- Create: `src/app/sitemap.ts`, `src/app/robots.ts`, `src/components/site/ProductJsonLd.tsx`. Modify: each `(site)` page to export `generateMetadata`. Test: `tests/e2e/seo.spec.ts`

**Interfaces:**
- Consumes: `getSitemapEntries()`, `env.NEXT_PUBLIC_SITE_URL`.

- [ ] **Step 1:** Write the failing tests:
  - `/sitemap.xml` contains `/products/geogrid/pp-biaxial-geogrid` and not `/certifications`
  - `/robots.txt` disallows `/admin` and references the sitemap
  - the product page has `<title>PP Biaxial Geogrid | TerraTechBharat</title>`, an `og:title`, and JSON-LD with `"@type":"Product"` and no `offers` key
- [ ] **Step 2:** Run. Expect FAIL. Implement. Run again. Expect PASS.
- [ ] **Step 3:** Commit `feat: metadata, sitemap, robots and product structured data`.

### Task 8: Quote request backend

**Files:**
- Create: `src/lib/supabase/service.ts`, `src/lib/quote/{schema,ip,turnstile,mailer,emails,store,handle}.ts`, `src/app/api/quote/route.ts`, `tests/unit/quote-*.test.ts`, `tests/db/quote-store.test.ts`

**Interfaces:**
- `schema.ts`: `quoteSchema` (zod) → `QuoteInput { name, company?, email, phone, country: Country, products: string[], quantity?, projectLocation?, message, turnstileToken }`. Required fields have trimmed min length 2; message max 5000; products max 20 slugs. `validateAttachment(file: File | null): string | null` returns an error message or null, per the Global Constraints.
- `ip.ts`: `clientIp(headers: Headers): string` (first `x-forwarded-for` entry, else `'unknown'`) and `hashIp(ip, salt): string` (sha256 hex).
- `turnstile.ts`: `verifyTurnstile(token, ip, {secret, fetchImpl = fetch}): Promise<boolean>`. Posts to `https://challenges.cloudflare.com/turnstile/v0/siteverify` and returns false on network error.
- `mailer.ts`: `interface Mailer { send(m: {to: string; subject: string; html: string; text: string; replyTo?: string}): Promise<void> }`. `createMailer(): Mailer` uses Resend, or a console logger per the dev fallback.
- `emails.ts`: `renderTeamEmail(q: QuoteInput, productNames: string[], id: string)` and `renderBuyerEmail(q, productNames)`, each → `{subject, html, text}`. `escapeHtml(s)` is applied to every buyer field. Team subject: `New quote request (India|UAE): <name>`.
- `store.ts`: `interface QuoteStore { countSince(ipHash: string, since: Date): Promise<number>; insert(row): Promise<{id: string}>; uploadAttachment(file: File): Promise<string>; recipientFor(c: Country): Promise<string | null>; productNames(slugs: string[]): Promise<string[]>; markEmailSent(id: string): Promise<void> }`. `createSupabaseQuoteStore(client)` uses the service-role client. Attachments go to `quote-attachments/<yyyy-mm>/<uuid>-<slugified filename>`. `productNames` returns only published products, which drops unknown slugs.
- `handle.ts`: `handleQuote(form: FormData, ip: string, deps: {store: QuoteStore; mailer: Mailer; verifyCaptcha(token, ip): Promise<boolean>; salt: string; now(): Date}): Promise<{status: 200 | 400 | 403 | 429 | 500; body: {ok: boolean; errors?: Record<string,string>; message?: string}}>`. Order: validate (400) → captcha (403) → rate limit `countSince(hash, now-1h) >= 5` (429) → upload → insert (500 only if this fails) → emails (team email only when a recipient exists; buyer email always; `markEmailSent` only when the team email succeeded) → 200.
- `route.ts`: `POST` reads `formData()` and wires the real deps.

- [ ] **Step 1:** Write failing unit tests with fake deps:
  - missing email → 400 with `errors.email`
  - captcha false → 403 and `insert` never called
  - `countSince` returns 5 → 429
  - mailer throws → 200, insert called, `markEmailSent` not called
  - `recipientFor` returns null → 200, team email not sent, buyer email sent
  - the team email recipient equals `recipientFor(country)` even when the form carries a `to` field
  - insert is called before the first `mailer.send` (record call order)
  - a 5 MB file → 400 `errors.attachment`; a `.exe` → 400
  - name `<script>alert(1)</script>` → team html contains `&lt;script&gt;` and no `<script>` (Review Focus 1)
  - `hashIp` is stable for the same salt and differs across salts
- [ ] **Step 2:** Write the failing db test: `createSupabaseQuoteStore` inserts a row with `status = 'new'`, and `countSince` counts it.
- [ ] **Step 3:** Run both. Expect FAIL. Implement. Run again. Expect PASS.
- [ ] **Step 4:** Commit `feat: quote request API with captcha, rate limit and email routing`.

### Task 9: Quote form UI

**Files:**
- Create: `src/components/site/QuoteForm.tsx` (client), `src/app/(site)/quote/page.tsx`. Modify: `contact/page.tsx` to embed the form. Test: `tests/e2e/quote.spec.ts`

**Interfaces:**
- Consumes: `getProductOptions()`, `POST /api/quote`.
- `<QuoteForm options={{slug,name}[]} preselected={string[]} siteKey={string | undefined} />`. It renders the Turnstile widget only when `siteKey` is set, shows field errors returned by the API, and on success replaces itself with a thank-you message that names the country team.
- `/quote` reads `searchParams.product`. It preselects only when the slug is in `options`.

- [ ] **Step 1:** Write the failing tests:
  - from a product page, "Request a quote" opens `/quote` with that product checked
  - submitting with country UAE shows the thank-you message, and a `quote_requests` row exists with `country = 'AE'` (service client)
  - submitting with an empty email shows the inline error
  - `/quote?product=does-not-exist` renders with nothing checked (Review Focus 5)
- [ ] **Step 2:** Run. Expect FAIL. Implement. Run again. Expect PASS.
- [ ] **Step 3:** Commit `feat: quote request form`.

### Task 10: Admin authentication

**Files:**
- Create: `src/middleware.ts` (session refresh for `/admin/:path*`), `src/lib/supabase/{server,browser}.ts`, `src/lib/admin/require-admin.ts`, `src/app/admin/login/page.tsx`, `src/app/admin/(protected)/layout.tsx`, `src/app/admin/(protected)/page.tsx` (dashboard), `scripts/create-admin.ts`, `tests/e2e/admin-auth.spec.ts`

**Interfaces:**
- `requireAdmin(): Promise<{userId: string; supabase: SupabaseClient}>`. It redirects to `/admin/login` with no session. For a non-admin session it signs out and redirects to `/admin/login?error=not-admin`.
- The dashboard shows counts of `new` quote requests and published products.
- `scripts/create-admin.ts <email> <password>` creates the auth user and the `admins` row (service role). It is used at launch and in e2e setup.
- The `(protected)` layout has a sidebar: Dashboard, Quotes, Products, Categories, Applications, Certifications, Projects, Settings, and Sign out.

- [ ] **Step 1:** Write the failing tests:
  - `/admin` redirects to the login page
  - a wrong password shows an error
  - an admin login lands on the dashboard showing "New quote requests"
  - a non-admin user login shows "This account does not have admin access"
- [ ] **Step 2:** Run. Expect FAIL. Implement. Run again. Expect PASS.
- [ ] **Step 3:** Commit `feat(admin): login, session handling and dashboard`.

### Task 11: Admin CRUD for categories, applications, certifications, projects

**Files:**
- Create: `src/lib/admin/{schemas,action-result}.ts`, `src/components/admin/{EntityTable,Field,MediaUpload,PublishedToggle}.tsx`, and for each of `categories`, `applications`, `certifications`, `projects`: `src/app/admin/(protected)/<entity>/{page.tsx,[id]/page.tsx,actions.ts}` (`[id]` = `new` for create). Test: `tests/unit/admin-schemas.test.ts`, `tests/e2e/admin-crud.spec.ts`

**Interfaces:**
- `action-result.ts`: `type ActionResult = {ok: true} | {ok: false; errors: Record<string,string>}`, and `fromPgError(e): ActionResult`, which maps code `23505` on a `slug` constraint to `{slug: 'This URL slug is already used'}`.
- `schemas.ts`: one zod schema per entity. When the slug is blank it defaults to `slugify(name or title)`.
- Each `actions.ts` exports `save<Entity>(prev: ActionResult | null, form: FormData): Promise<ActionResult>` and `delete<Entity>(id: string): Promise<void>`. Each calls `requireAdmin()`, then the schema, then the user's Supabase client, then `revalidatePath('/', 'layout')`, then redirects to the list on create.
- `<MediaUpload bucket="public-media" folder={string} value={string | null} accept={string} name={string} />` uploads from the browser with the user session to `<folder>/<uuid>-<slugified filename>`. It writes the path into a hidden input and shows a preview (image) or file name (PDF).
- `<EntityTable rows columns editHref />` provides the shared list view with a published badge and sort order.

- [ ] **Step 1:** Write the failing unit tests:
  - blank slug → derived from the name
  - `fromPgError({code:'23505', message:'...categories_slug_key...'})` → slug error (Review Focus 4)
- [ ] **Step 2:** Write the failing e2e tests (as admin):
  - create a certification with an image → it appears on `/certifications`
  - creating a second category with slug `geogrid` shows the duplicate-slug message
  - unpublishing an application removes it from `/applications`
- [ ] **Step 3:** Run. Expect FAIL. Implement. Run again. Expect PASS.
- [ ] **Step 4:** Commit `feat(admin): manage categories, applications, certifications and projects`.

### Task 12: Admin product editor with spec grid

**Files:**
- Create: `src/app/admin/(protected)/products/{page.tsx,[id]/page.tsx,actions.ts}`, `src/components/admin/SpecGridEditor.tsx`. Modify: `src/lib/content/spec-grid.ts` to add `toRpcPayload(grid: SpecGrid): {models: string[]; rows: {name; unit; test_method; values}[]}`. Test: `tests/unit/spec-grid.test.ts` (extend), `tests/e2e/admin-product.spec.ts`

**Interfaces:**
- Consumes: `save_spec_table` RPC, `MediaUpload`, `fromPgError`.
- `saveProduct(prev, form)` saves product fields and the application links. `saveSpecGrid(productId: string, grid: SpecGrid): Promise<ActionResult>` validates (model codes non-empty and unique, property names non-empty) and calls the RPC.
- `<SpecGridEditor initial={SpecGrid} onSave={(g) => Promise<ActionResult>} />` provides add/remove/move-left/right for models, add/remove/move-up/down for rows, and inline cell inputs. It shows unsaved-changes state and confirms before leaving the page with unsaved edits.
- The product form fields are: name, slug, category select, summary, overview (markdown textarea with preview), features (one per line), images (multiple `MediaUpload`), datasheet (PDF), application checkboxes, published, and sort order.

- [ ] **Step 1:** Write the failing unit tests:
  - `toRpcPayload` round-trips through `toSpecGrid`
  - validation rejects duplicate model codes `["BX1515","BX1515"]`
- [ ] **Step 2:** Write the failing e2e test: admin opens PP Biaxial Geogrid, adds model `BX5050` with a tensile value of `50`, saves, and the public product page shows a `BX5050` column with `50`.
- [ ] **Step 3:** Run. Expect FAIL. Implement. Run again. Expect PASS.
- [ ] **Step 4:** Commit `feat(admin): product editor with spreadsheet-style spec grid`.

### Task 13: Admin quotes inbox and site settings

**Files:**
- Create: `src/app/admin/(protected)/quotes/{page.tsx,[id]/page.tsx,actions.ts}`, `src/app/admin/(protected)/settings/{page.tsx,actions.ts}`. Test: `tests/e2e/admin-quotes.spec.ts`

**Interfaces:**
- Quotes list: filter by status and country, newest first, and an "email not sent" badge when `email_sent = false`.
- Quote detail: every field rendered as text (no `dangerouslySetInnerHTML`), the attachment via a 10-minute signed URL, a status select, and notes. `updateQuote(id, {status, adminNotes})`.
- Settings page: the `site_settings` fields plus the India and UAE recipient emails (upserted into `quote_recipients`). `saveSettings(prev, form)`.

- [ ] **Step 1:** Write the failing tests:
  - after setting the UAE recipient in Settings, a submitted UAE quote shows in the inbox without the "email not sent" badge (dev mailer counts as sent)
  - changing its status to Quoted persists after reload
  - a quote with message `<b>hi</b>` shows the literal text `<b>hi</b>`
  - editing the India phone in Settings updates the footer
- [ ] **Step 2:** Run. Expect FAIL. Implement. Run again. Expect PASS.
- [ ] **Step 3:** Commit `feat(admin): quote inbox and site settings`.

### Task 14: Launch runbook and full verification

**Files:**
- Create: `README.md`, `.env.example` (final). Modify: `package.json` (add a `verify` script that runs lint, typecheck, unit, db and e2e)

- [ ] **Step 1:** README sections:
  - Local development (Docker, `db:start`, `.env.local` from `npx supabase status`, `create-admin`)
  - Tests
  - Launch runbook (spec §11), with exact click-paths for creating the Supabase project and running `npx supabase db push` + seed, Vercel import + env vars, Resend domain DNS records, the Turnstile site, `create-admin`, publishing content, and the DNS switch for terratechbharat.com
  - Revoke the old Gmail app password
- [ ] **Step 2:** Run `npm run verify`. Expect every suite green; paste the summary into the PR.
- [ ] **Step 3:** Commit `docs: development guide and launch runbook`, then open the PR.
