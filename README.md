# TerraTechBharat website

Catalogue and quote-request website for TerraTechBharat (geosynthetics for buyers in India and the UAE), served at **terratechbharat.com**. Everything on the public site comes from a Supabase database and is managed by the owner in a private admin panel at `/admin`. There are no prices, carts or online orders.

**Who reads what**

- Owner (not a developer): jump to [Launch runbook](#launch-runbook), [After launch: owner checklist](#after-launch-owner-checklist) and [Revoke the old Gmail app password](#revoke-the-old-gmail-app-password). Those are numbered, click by click.
- Developer: start with [Local development](#local-development), [Tests](#tests) and [How it is built](#how-it-is-built).

Contents: [How it is built](#how-it-is-built) · [Local development](#local-development) · [Tests](#tests) · [Launch runbook](#launch-runbook) · [After launch: owner checklist](#after-launch-owner-checklist) · [If something goes wrong](#if-something-goes-wrong) · [Revoke the old Gmail app password](#revoke-the-old-gmail-app-password)

---

## How it is built

Next.js 15 (App Router) + React 19 + TypeScript + Tailwind CSS 4, hosted on Vercel, with Supabase (Postgres, Auth, Storage), Resend (email) and Cloudflare Turnstile (captcha). The full design is in [`docs/superpowers/specs/2026-10-19-terratechbharat-website-design.md`](docs/superpowers/specs/2026-10-19-terratechbharat-website-design.md); the build plan is in `docs/superpowers/plans/`.

- **Public pages** are server-rendered from Supabase with the anonymous key (row-level security shows only `published` rows) and cached for an hour. Every save in `/admin` revalidates the whole site, so changes appear within seconds.
- **`/admin`** uses the signed-in user's own Supabase session, so Postgres row-level security is the real permission check, not just the UI. Only the user listed in the `admins` table can enter or write. `src/middleware.ts` runs only for `/admin` to keep that session fresh.
- **`POST /api/quote`** validates the form, checks the Turnstile captcha and a rate limit (5 requests per IP hash per rolling hour), saves the request (and any attachment) with the service-role key, and only then sends the emails. If email fails the request is still saved and the admin inbox shows "Email not sent". Recipients come only from the `quote_recipients` table (set in Admin > Settings), never from the request.
- Seeded products are **unpublished**, so unchecked spec values never go live by accident.

Where things live:

| Path | What is there |
|---|---|
| `src/app/(site)/` | Public pages (home, products, applications, certifications, projects, about, contact, quote) |
| `src/app/admin/` | Admin panel: `login/`, and `(protected)/` with one folder per section (page, `[id]/page`, `actions.ts`) |
| `src/app/api/quote/route.ts` | The quote endpoint |
| `src/lib/env.ts` | Environment variable access and production checks |
| `src/lib/supabase/` | `public` (anon, public reads), `server` (cookie session), `service` (service role, server only), `browser` clients |
| `src/lib/content/` | Public reads (`queries.ts`) and the spec-table transform (`spec-grid.ts`) |
| `src/lib/quote/` | Quote pipeline: schema, IP hash, Turnstile, mailer, email text, store, handler |
| `src/lib/admin/` | Admin validation schemas, `requireAdmin()`, action results, upload rules |
| `src/components/site/`, `src/components/admin/` | UI components |
| `supabase/migrations/` | Schema, row-level security and storage buckets, spec-table function, attachment and media limits |
| `supabase/seed.sql` | Starter catalogue (4 categories, 7 unpublished products, 6 applications, placeholder settings) |
| `scripts/create-admin.ts` | Creates the admin account (see below) |
| `scripts/e2e-prepare.ts` | Prepares the local database and build for the end-to-end tests |
| `tests/unit`, `tests/db`, `tests/e2e`, `tests/support` | Vitest unit tests, Vitest tests against the local database, Playwright tests, shared helpers |
| `public/placeholders/`, `public/brand/` | Placeholder images (used until real photos are uploaded) and logo files |

---

## Local development

You need: **Node.js 22 or newer** (22.6+ is required because `create-admin` and `e2e-prepare` run TypeScript directly), npm, git, and **Docker running** (the local Supabase stack runs in Docker).

1. Install and start the local database:

   ```bash
   npm install
   npm run db:start        # local Supabase in Docker; the first run downloads the images
   ```

   `db:start` sets `SUPABASE_INTERNAL_IMAGE_REGISTRY=docker.io` for you. `npm run db:reset` wipes the local database and re-applies every migration and the seed: run it whenever you want a clean slate, or if the site shows no categories.

2. Create `.env.local` from the template and fill in the local keys:

   ```bash
   cp .env.example .env.local
   npx supabase status -o env      # prints API_URL, ANON_KEY, SERVICE_ROLE_KEY, ...
   ```

   In `.env.local` set:

   | Variable | Value |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | `API_URL` (normally `http://127.0.0.1:54321`) |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `ANON_KEY` |
   | `SUPABASE_SERVICE_ROLE_KEY` | `SERVICE_ROLE_KEY` |
   | `IP_HASH_SALT` | any text, for example `local` |
   | `ALLOW_DEV_FALLBACKS` | `true` (local only) |

   Leave the Turnstile, Resend, `MAIL_FROM` and `NEXT_PUBLIC_SITE_URL` lines empty. With `ALLOW_DEV_FALLBACKS=true` the captcha passes and emails are printed to the terminal instead of sent. Without that flag a missing Turnstile or Resend key makes `/api/quote` fail with a 500.

3. Run the site:

   ```bash
   npm run dev             # http://localhost:3000
   ```

   The seeded products are unpublished, so the catalogue looks empty until you publish some in the admin panel. Categories and applications are published.

4. Create a local admin and sign in at <http://localhost:3000/admin/login>:

   ```bash
   npm run -s create-admin -- you@example.com
   ```

   It asks for a password twice (hidden; at least 10 characters). With no Supabase variables set in your shell it changes the **local** database. Keep the `-s`; without it npm prints the whole command line. Running it again for the same email resets that password. The site is meant to have one admin: the script refuses to add a different admin when one exists unless you add `--force`. The script reads variables from your shell only, not from `.env.local`.

Other scripts: `npm run build` / `npm start` (production build), `npm run lint`, `npm run typecheck`.

Things to know:

- `npm run test:e2e` leaves a file called `.env.production.local` behind (local keys, `NEXT_PUBLIC_SITE_URL=http://localhost:3100`, `ALLOW_DEV_FALLBACKS=true`). **Delete it before running a real production build** (`npm run build`) on your machine. It is git-ignored.
- Never put `ADMIN_PASSWORD` or `ALLOW_DEV_FALLBACKS` in Vercel's environment variables. `.env.example` lists every variable the site reads, with a comment for each.

---

## Tests

| Command | What it runs | Needs |
|---|---|---|
| `npm run lint` | ESLint | nothing |
| `npm run typecheck` | `tsc --noEmit` | nothing |
| `npm run test:unit` | Vitest unit tests (`tests/unit`) | nothing |
| `npm run test:db` | Vitest against the local Supabase: row-level security, queries, storage limits, the quote route, `create-admin` (`tests/db`) | Docker, `npm run db:start` |
| `npm run test:e2e` | Playwright against a production build (`tests/e2e`) | Docker, `npm run db:start`, Chromium |
| `npm run verify` | All of the above, in that order, stopping at the first failure | same as above |

Notes:

- **Chromium for Playwright.** On a fresh machine run `npx playwright install chromium` once (`@playwright/test` is pinned to 1.56.1 in `package.json`).
- **`npm run test:e2e` prepares everything itself.** Its `pretest:e2e` step runs `npm run db:reset`, then `scripts/e2e-prepare.ts` (publishes the seed products, creates `admin@e2e.test` and `user@e2e.test`, writes `.env.production.local`, clears `.next`), then `next build`. Playwright then starts `next start` on port 3100. Always use `npm run test:e2e`, not `npx playwright test` on its own: running Playwright twice against the same build can serve stale cached pages.
- **`npm run verify`** is lint, typecheck, unit tests, `npm run db:reset`, `npm run test:db`, then `npm run test:e2e`. It takes about 4 to 5 minutes and resets the local database more than once. It passes when run twice in a row.
- **The db and e2e tests write to the local database** (they reset it). They read the local keys from `npx supabase status`; if `NEXT_PUBLIC_SUPABASE_URL` and the other Supabase variables are already set in your shell, those win. Never have the live project's keys exported in the terminal when you run them.
- If Docker is not running, start it first, then `npm run db:start`. `npx supabase status` shows whether the stack is up.
- The real Turnstile widget and real Resend delivery cannot be tested here (the tests use a stub and the dev fallbacks). They are checked by hand during launch (steps 6, 7 and 10 below).

---

## Launch runbook

Do these in order. Steps marked **[browser]** are clicks on a website; steps marked **[terminal]** are typed commands (a developer can do these for you, or follow along: you need Node.js 22, git, and the `psql` tool from PostgreSQL). Allow an afternoon; the DNS changes at the end can take anywhere from minutes to a day to settle.

> Website menus and button names change from time to time. If something here is named slightly differently on your screen, look for the closest match; the order of steps stays the same.
>
> The terminal commands are written for macOS and Linux (on Windows use WSL or Git Bash).

**Before you start, you need accounts for:** GitHub (the code lives in `akshay-22502/vinayaka-marketing`), [Supabase](https://supabase.com), [Vercel](https://vercel.com), [Resend](https://resend.com), [Cloudflare](https://dash.cloudflare.com) (only for the Turnstile captcha, which is free), and login access to wherever the DNS records for terratechbharat.com are managed (your domain registrar, or Cloudflare if the domain is set up there). Use a password manager: you will handle several secret keys.

Two plan notes: free Supabase projects are paused after a period of no activity (see [If something goes wrong](#if-something-goes-wrong)), and Vercel's free "Hobby" plan is meant for personal, non-commercial use. For a business website check Vercel's current terms and consider a paid plan before going live.

Make sure the website code has been merged into the repository's main branch (`main`) on GitHub before step 8: Vercel publishes the repository's production branch as the live site. (If it is on another branch, choose that branch under **Settings > Git > Production Branch** after importing.)

### 1. Create the Supabase project [browser]

1. Go to <https://supabase.com/dashboard> and sign in.
2. Click **New project**. Choose your organization.
3. Name: `terratechbharat`. **Database password**: click **Generate a password**, copy it into your password manager now (you need it in steps 3 and 4). Region: one close to your buyers, for example **Mumbai (ap-south-1)**. Plan: Free is fine to start.
4. Click **Create new project** and wait until the project finishes setting up.
5. Write down the **project reference**: in the address bar the project page looks like `https://supabase.com/dashboard/project/<reference>`; it is also under **Project Settings > General > Reference ID**.

### 2. Lock down sign-ups and sessions [browser]

Only the admin you create in step 9 should ever be able to sign in.

1. In the project, open **Authentication > Sign In / Providers**. Under **Email**, turn **off** "Allow new users to sign up" (it may sit in a "User Signups" box at the top of the page). Click **Save**.
2. Open **Authentication > Sessions** and set a **time-box** and/or an **inactivity timeout** (for example 7 days / 1 day). Without one, a signed-in browser stays signed in for about 400 days. On some Supabase plans these options are locked; if they are, skip this and use **Sign out** (bottom of the admin menu) on any shared computer.
3. Optional: **Authentication > URL Configuration**, set **Site URL** to `https://www.terratechbharat.com`. The site does not send sign-in links, so this only keeps Supabase's own defaults tidy.

### 3. Create the database tables [terminal]

This applies everything in `supabase/migrations/` (tables, security rules, storage buckets for images, datasheets and quote attachments, the spec-table function, upload limits).

```bash
git clone https://github.com/akshay-22502/vinayaka-marketing.git
cd vinayaka-marketing
npm install
npx supabase login                                # opens a browser to sign in to Supabase
npx supabase link --project-ref <reference>       # the reference from step 1; may ask for the database password
npx supabase db push --dry-run                    # optional: lists the migrations it will apply
npx supabase db push                              # answer Y; applies all migrations
```

You should see the five migrations (`20261019000001_schema` up to `20261019000005_public_media_limits`) applied without errors.

### 4. Load the starter content, once [terminal]

The seed uses a temporary helper that lives for one database session, so it must run over a **direct connection**, not through the transaction pooler.

1. In the Supabase dashboard click **Connect** (top of the project page) and choose the **Direct connection** string (a `postgresql://postgres:[YOUR-PASSWORD]@db.<reference>.supabase.co:5432/postgres` address). Replace `[YOUR-PASSWORD]` with the database password from step 1. If your password contains special characters, you may need to URL-encode them.
   - If the connection fails with a message about the network being unreachable (some home and office networks have no IPv6), use the **Session pooler** string from the same screen instead. It must be the session mode (port 5432), **not** the transaction mode (port 6543).
2. Run the seed:

   ```bash
   DIRECT_URL='postgresql://postgres:<password>@db.<reference>.supabase.co:5432/postgres'
   psql "$DIRECT_URL" -v ON_ERROR_STOP=1 -f supabase/seed.sql
   ```

3. **Run it only once, and always with `-v ON_ERROR_STOP=1`.** On a database that already has the starter content the seed stops at its first insert (duplicate category) and changes nothing. Without `ON_ERROR_STOP`, psql would carry on past that error and add the "confirm against the datasheet" reminder line to every product a second time. Never run it after you have started editing content in the admin.
4. Check in the dashboard under **Table Editor** that `categories` has 4 rows and `products` has 7.

### 5. Copy the Supabase keys [browser]

Open **Project Settings > API** (on newer dashboards the keys are on a separate **API Keys** page). Copy these into your password manager; you will paste them into Vercel in step 8:

- **Project URL** (for example `https://<reference>.supabase.co`) is `NEXT_PUBLIC_SUPABASE_URL`.
- The **anon** key (public) is `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- The **service_role** key (secret, click to reveal) is `SUPABASE_SERVICE_ROLE_KEY`. It bypasses all security rules: never put it in code, chat or email.

The site was built and tested with the long `eyJ...` style keys (the "legacy" anon and service_role keys). Supabase's newer `sb_publishable_...` / `sb_secret_...` keys are meant to be drop-in replacements but were not tested here.

### 6. Create the Turnstile captcha [browser]

1. Sign in at <https://dash.cloudflare.com> and open **Turnstile** in the left menu.
2. Click **Add widget** (or **Add site**). Name: `TerraTechBharat quote form`. Widget mode: **Managed**.
3. Under **Hostnames** add `terratechbharat.com` and `www.terratechbharat.com`. Click **Create**.
4. Copy the **Site Key** (public) to `NEXT_PUBLIC_TURNSTILE_SITE_KEY` and the **Secret Key** to `TURNSTILE_SECRET_KEY`.
5. You will add the temporary `*.vercel.app` address of your first deployment to the hostnames in step 10, so the form can be tried before the domain is switched.

### 7. Set up Resend (quote emails) [browser + DNS]

1. Sign in at <https://resend.com>. Open **Domains** and click **Add Domain**. Enter `terratechbharat.com` and choose the region closest to you.
2. Resend now shows a table of DNS records (type, name, value). At the place where terratechbharat.com's DNS is managed (registrar or Cloudflare), add each record **exactly** as shown. Leave any existing records for your company mailboxes alone. If Resend offers an optional DMARC record, adding it is a good idea.
3. Back in Resend click **Verify DNS Records**. Wait until the domain shows **Verified** (minutes to a few hours).
4. Open **API Keys**, click **Create API Key**, give it **Sending access** for this domain, and copy the key (shown once) to `RESEND_API_KEY`.

Emails are sent from `TerraTechBharat <quotes@terratechbharat.com>`. That address needs no mailbox; it only has to be on the verified domain. Until the domain is verified, quote emails fail (the quote is still saved).

### 8. Import the project into Vercel and set the environment variables [browser]

1. Go to <https://vercel.com/new> and sign in (use **Continue with GitHub**).
2. Under **Import Git Repository** find `akshay-22502/vinayaka-marketing` and click **Import**. If it is not listed, click **Adjust GitHub App Permissions** and give Vercel access to that repository.
3. On the **Configure Project** screen leave **Framework Preset** as **Next.js** and **Root Directory** as `./`. Leave the build settings alone.
4. Open **Environment Variables** and add the variables in the table below. For each: type the name, paste the value, keep the **Production** and **Preview** boxes ticked (except where the table says otherwise), and click **Add**. Mark the secrets as **Sensitive** if Vercel offers the option.
5. Click **Deploy**. When it finishes, Vercel shows the project's address (`https://<project>.vercel.app`).

| Variable | Where to get it | Environments | Visibility |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Step 5: Project URL | Production + Preview | Public (sent to browsers) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Step 5: anon key | Production + Preview | Public (protected by security rules) |
| `SUPABASE_SERVICE_ROLE_KEY` | Step 5: service_role key | Production + Preview | **Secret**, server only |
| `NEXT_PUBLIC_SITE_URL` | You choose the main address: `https://www.terratechbharat.com` (no trailing slash). It must be the address you make primary in step 12 | **Production only** (required: the production build fails without it). Leave it unset for Preview; previews then use their own address and are hidden from search engines | Public |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Step 6: Site Key | Production + Preview | Public |
| `TURNSTILE_SECRET_KEY` | Step 6: Secret Key | Production + Preview | **Secret**, server only |
| `RESEND_API_KEY` | Step 7: API key | Production + Preview | **Secret**, server only |
| `IP_HASH_SALT` | Invent a long random text. In a terminal: `openssl rand -hex 32`. Store it in your password manager | Production + Preview | **Secret**, server only |
| `MAIL_FROM` | Optional. Leave unset to send from `TerraTechBharat <quotes@terratechbharat.com>` | Production + Preview | Server only |

**Never add** `ALLOW_DEV_FALLBACKS` (it switches the captcha off and stops real emails) or `ADMIN_PASSWORD` (only used for one terminal command in step 9) to Vercel. `VERCEL_ENV` and `VERCEL_URL` are filled in by Vercel itself.

Values starting with `NEXT_PUBLIC_` are baked into the site when it is built. If you change any variable later, go to **Deployments**, open the menu (three dots) on the latest deployment and click **Redeploy**, otherwise the old value stays in use.

Preview deployments (branch builds) talk to the same live database and send real emails.

### 9. Create the admin account [terminal]

From the same `vinayaka-marketing` folder, with the **live** project's values for this one command:

```bash
NEXT_PUBLIC_SUPABASE_URL='https://<reference>.supabase.co' \
SUPABASE_SERVICE_ROLE_KEY='<the service_role key from step 5>' \
npm run -s create-admin -- owner@example.com
```

- Replace `owner@example.com` with the owner's email address (this is the login).
- It asks for a password twice (hidden, at least 10 characters). To skip the question, put `ADMIN_PASSWORD='...'` in front of the command for that one run.
- Always type `npm run -s create-admin -- <email>` exactly like this: the `-s` keeps your password out of the terminal output, and the `--` is required.
- It prints "Using the Supabase project at ..." before doing anything. If it says "local Supabase stack" instead, the two variables were not set, so stop and check.
- It makes one admin. A second, different address is refused unless you add `--force`. Running the command again for the same email resets that password (that is also how to recover a forgotten password).
- Do not set `ADMIN_PASSWORD` on Vercel, and close the terminal afterwards: the key you typed stays in your shell history.

### 10. First sign-in and a test quote [browser]

1. Open `https://<project>.vercel.app` (from step 8). The home page should load, with the four categories. The product lists are empty until step 11.
2. In Cloudflare, open the Turnstile widget from step 6 and add `<project>.vercel.app` to its hostnames so the captcha works on this temporary address. Remove it again after step 12.
3. Go to `https://<project>.vercel.app/admin/login` and sign in with the admin email and password from step 9. The Dashboard opens.
4. Open **Settings**:
   - Fill in **India quote recipient** and **UAE quote recipient** with the real email addresses that should receive quotes for each country. **Do this first.** If a country has no recipient, quotes for it are saved but nobody is emailed (the inbox shows "Email not sent").
   - Replace every bracketed placeholder (`[India address]`, `[India phone]`, `[India WhatsApp]`, `[India email]` and the same four for the UAE) with the real details. Until you do, the brackets show on the website as plain text.
   - Read the **Tagline**, **Home page title**, **Home page text** and **About page text** and correct anything that is not right.
   - Click **Save**.
5. Send a test quote from `https://<project>.vercel.app/quote` for India, then another for the UAE (use your own email as the buyer). Within a minute each should reach the matching recipient, and you should get a confirmation email. Both requests should appear under **Quotes** in the admin without an "Email not sent" tag. Also try once with a small PDF attached. You can send 5 requests per hour from one address.
6. Check the captcha and the emails behaved: this is the one part that could not be tested with real keys during development. If a quote fails, see [If something goes wrong](#if-something-goes-wrong).
7. In the Quotes list set the two test requests to **Closed**.

### 11. Check and publish the content [browser]

Every seeded product starts **unpublished** because the specification values are typical industry figures, not your manufacturer's.

For each product (**Products** in the admin menu):

1. Open the product. Compare the **specification table** (below the product form) with the manufacturer's datasheet. Edit cells, add or remove models and properties. The table has its own button, **Save specification table**.
2. In the **Overview** text, delete the last line: "_Typical values. Confirm against the manufacturer's datasheet before publishing._" The editor refuses to publish while that line is there, unless you tick "Publish anyway, with the datasheet reminder still in the overview".
3. Upload product photos (PNG, JPG or WebP) and the datasheet PDF, each up to 10 MB. Until you upload photos, a neutral placeholder picture is shown.
4. Tick **Published** and click **Save**.

Also look through **Categories** and **Applications** (they are already published; correct the text) and add **Certifications** and **Projects** when you have them: those two sections of the website stay hidden until at least one published entry exists.

A product only shows on the website if its category is published too.

### 12. Switch terratechbharat.com to the new site [browser + DNS]

Do this when step 10 and step 11 are done.

1. In Vercel open the project, then **Settings > Domains**. Click **Add** and enter `www.terratechbharat.com`; add `terratechbharat.com` as well. Make `www.terratechbharat.com` the main address and let `terratechbharat.com` redirect to it (this must match `NEXT_PUBLIC_SITE_URL` from step 8; if you prefer the address without `www`, change that variable and redeploy).
2. Vercel lists the DNS records to create. At the time of writing these are an **A** record for `terratechbharat.com` pointing to `76.76.21.21` and a **CNAME** record for `www` pointing to `cname.vercel-dns.com`. Use exactly what the Domains screen shows if it differs.
3. At the DNS host of terratechbharat.com:
   - **Remove the old redirect to `vinayaka-marketing.in`** (usually called "URL redirect", "forwarding" or "redirect"), and any old A or CNAME records for `@` and `www`.
   - Add the records from Vercel. If the domain is on Cloudflare, set these records to **DNS only** (grey cloud), not proxied.
   - Keep the Resend records from step 7 and any mailbox (MX) records.
4. Back in Vercel the domains turn to **Valid Configuration** when DNS has settled, and the secure certificate (https) is issued automatically. This can take minutes to hours. The old redirect keeps working until the DNS change reaches you.
5. In Cloudflare Turnstile remove the temporary `<project>.vercel.app` hostname from step 10.
6. Open <https://www.terratechbharat.com> and <https://terratechbharat.com> (it should jump to `www`). Then do the owner checklist below.

---

## After launch: owner checklist

Right after the domain switch:

- [ ] Send a real test quote on the live site for **India** and again for the **UAE**. Check the right recipient gets each email, you get the confirmation, and both show under **Quotes** without "Email not sent". Set them to **Closed** afterwards.
- [ ] Admin > **Settings**: both **quote recipient** emails are filled in, and no `[bracketed placeholders]` are left (check the Contact page and the footer on the live site).
- [ ] Tagline, home page and about text read the way you want.
- [ ] Every product you want visible is checked against its datasheet, has the reminder line removed, and is **Published**.
- [ ] Open the live pages once: Home, a category, a product (check the specification table), Applications, Contact, Quote.
- [ ] Optional: add `https://www.terratechbharat.com/sitemap.xml` in Google Search Console so Google finds the pages.
- [ ] Revoke the old Gmail app password (next section).

From then on:

- Check **Quotes** regularly (the Dashboard counts new ones). Change a request's status (New, Contacted, Quoted, Closed) and keep notes on its page. Attachments open from the request.
- A red **Email not sent** tag means the request was saved but the team email did not go out: contact the buyer from the details on the request, then check the recipient setting and the Resend dashboard.
- **There is no delete button for quotes.** Mark finished requests **Closed**. To remove spam, delete the rows (and their files in the `quote-attachments` storage bucket) in the Supabase dashboard under **Table Editor** and **Storage**.
- Certifications and Projects appear on the site as soon as you add and publish the first entry.
- Keep the Supabase, Vercel, Resend and Cloudflare logins and the keys from this runbook in your password manager.

---

## If something goes wrong

- **The site shows an error page after a quiet period.** A free Supabase project is paused when it has had no activity for a while. Open the Supabase dashboard and click **Restore project**; the site comes back in a few minutes. A paid plan avoids this.
- **A quote shows "Email not sent".** Check in this order: (1) Admin > Settings has an email for that country; (2) Resend > Domains shows `terratechbharat.com` as **Verified**; (3) `RESEND_API_KEY` is correct in Vercel (then **Redeploy**); (4) Vercel > project > **Logs** for the error. The request itself is always saved.
- **The quote form says the captcha failed or never loads.** The Turnstile hostnames must include the address you are visiting, and both Turnstile keys must be set in Vercel (then **Redeploy**).
- **A Vercel build fails with "Missing required environment variable NEXT_PUBLIC_SITE_URL".** Add it for Production (step 8), then redeploy.
- **You changed an environment variable and nothing changed.** Redeploy (step 8, last paragraph).
- **You cannot sign in to the admin although the password is right.** Supabase limits sign-in attempts, and that limit is shared by all visitors Vercel serves; wait a few minutes, or raise the limit in the Supabase dashboard under **Authentication > Rate Limits**. If you forgot the password, run step 9 again for the same email to set a new one.
- **A visitor sees "Too many requests" on the quote form.** The limit is 5 quote requests per hour from one address.

---

## Revoke the old Gmail app password

The previous site's private backend repository (`Vinayaka-marketing-backend`) contains a Gmail **app password** written into its code. The new site does not use that backend or password, so cancel it:

1. Sign in to the Google account that password belongs to and open <https://myaccount.google.com/security>.
2. Under "How you sign in to Google" open **2-Step Verification** (sign in again if asked), then scroll to **App passwords** (or go straight to <https://myaccount.google.com/apppasswords>).
3. Find the entry used for the old backend (if you are not sure which, look at the name and the "last used" date) and click the bin / **Delete** icon. If you do not recognise an entry, delete it too: you can always create a new one.
4. Revoking is enough; the old value still sits in that repository's history, but it no longer works. Anything that still sent mail through it (the old site's contact form) stops working, which is expected once terratechbharat.com points at the new site.
5. Optional: archive the old backend repository on GitHub (**Settings > General > Danger Zone > Archive this repository**) so nobody deploys it again.
