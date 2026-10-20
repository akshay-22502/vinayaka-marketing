import type { Metadata } from "next";
import { EntityForm } from "@/components/admin/EntityForm";
import { Field } from "@/components/admin/Field";
import { MarkdownField } from "@/components/admin/MarkdownField";
import { PageHeader } from "@/components/admin/PageHeader";
import { QUOTE_COUNTRIES } from "@/lib/admin/quote-filters";
import { requireAdmin } from "@/lib/admin/require-admin";
import { countryName } from "@/lib/format";
import { saveSettings } from "./actions";

export const metadata: Metadata = { title: "Settings" };

type SettingsRow = {
  tagline: string;
  hero_title: string;
  hero_text: string;
  about_md: string;
  india_address: string;
  india_phone: string;
  india_whatsapp: string;
  india_email: string;
  uae_address: string;
  uae_phone: string;
  uae_whatsapp: string;
  uae_email: string;
  updated_at: string;
};

const COLUMNS =
  "tagline, hero_title, hero_text, about_md, india_address, india_phone, india_whatsapp, india_email, uae_address, uae_phone, uae_whatsapp, uae_email, updated_at";

const BLANK: SettingsRow = {
  tagline: "",
  hero_title: "",
  hero_text: "",
  about_md: "",
  india_address: "",
  india_phone: "",
  india_whatsapp: "",
  india_email: "",
  uae_address: "",
  uae_phone: "",
  uae_whatsapp: "",
  uae_email: "",
  updated_at: "new",
};

type Office = "india" | "uae";

/** The fields of one office: address, phone, WhatsApp, public email, and where its quote requests go. */
function OfficeFields({ office, values, recipient }: { office: Office; values: SettingsRow; recipient: string }) {
  const label = office === "india" ? "India" : "UAE";
  const get = (field: "address" | "phone" | "whatsapp" | "email") => values[`${office}_${field}`];

  return (
    <section aria-labelledby={`${office}-heading`} className="space-y-6 border-t border-slate-200 pt-8">
      <h2 id={`${office}-heading`} className="text-xl font-bold text-navy">
        {label} office
      </h2>
      <Field
        label={`${label} address`}
        name={`${office}_address`}
        type="textarea"
        rows={3}
        maxLength={500}
        defaultValue={get("address")}
        hint="Shown to visitors. Each line you type stays a line."
      />
      <Field
        label={`${label} phone`}
        name={`${office}_phone`}
        type="tel"
        inputMode="tel"
        maxLength={40}
        defaultValue={get("phone")}
        hint="Digits, spaces, + - and brackets. Visitors can tap it to call."
      />
      <Field
        label={`${label} WhatsApp`}
        name={`${office}_whatsapp`}
        type="tel"
        inputMode="tel"
        maxLength={40}
        defaultValue={get("whatsapp")}
        hint="With the country code, for example +91 98765 43210. Visitors can tap it to open a WhatsApp chat."
      />
      <Field
        label={`${label} public email`}
        name={`${office}_email`}
        type="email"
        inputMode="email"
        maxLength={254}
        defaultValue={get("email")}
        hint="Shown to visitors. Quote requests do not go to this address."
      />
      <Field
        label={`${label} quote recipient`}
        name={`${office}_recipient`}
        type="email"
        inputMode="email"
        maxLength={254}
        defaultValue={recipient}
        hint={`Quote requests from ${label} are emailed to this address. Visitors never see it. Leave it blank to stop these emails; the requests are still saved in Quote requests.`}
      />
    </section>
  );
}

export default async function SettingsPage() {
  const { supabase } = await requireAdmin();

  const [settings, recipients] = await Promise.all([
    supabase.from("site_settings").select(COLUMNS).eq("id", 1).maybeSingle(),
    supabase.from("quote_recipients").select("country, email"),
  ]);
  if (settings.error) throw new Error(`Could not load the settings: ${settings.error.message}`);
  if (recipients.error) throw new Error(`Could not load the quote recipients: ${recipients.error.message}`);

  const values = (settings.data as SettingsRow | null) ?? BLANK;
  const emailFor = (country: "IN" | "AE") =>
    (recipients.data ?? []).find((row) => row.country === country)?.email?.trim() ?? "";
  const indiaRecipient = emailFor("IN");
  const uaeRecipient = emailFor("AE");
  const missing = QUOTE_COUNTRIES.filter((country) => (country === "IN" ? indiaRecipient : uaeRecipient) === "").map(countryName);

  return (
    <>
      <PageHeader
        title="Settings"
        intro="The texts and office details shown on the website, and where quote requests are emailed."
      />

      {missing.length > 0 ? (
        <section
          aria-labelledby="no-recipient-heading"
          className="mt-6 max-w-2xl rounded-lg border border-amber-400 bg-amber-50 p-4 text-amber-950"
        >
          <h2 id="no-recipient-heading" className="text-base font-semibold">
            No quote recipient set for {missing.join(" and ")}
          </h2>
          <p className="mt-1 text-sm">
            Quote requests from {missing.join(" and ")} are still saved, but nobody is emailed about them, and they show
            &ldquo;Email not sent&rdquo; in Quote requests. Enter a recipient email below to fix this.
          </p>
        </section>
      ) : null}

      <div className="mt-8 max-w-2xl">
        <EntityForm action={saveSettings} listHref="/admin">
          {/* Keyed by the last save, so after a save the fields show what is stored. */}
          <div key={values.updated_at} className="space-y-8">
            <section aria-labelledby="home-heading" className="space-y-6">
              <h2 id="home-heading" className="text-xl font-bold text-navy">
                Home page
              </h2>
              <Field
                label="Tagline"
                name="tagline"
                maxLength={200}
                defaultValue={values.tagline}
                hint="A short line shown in the footer, above the home page heading and on the About page."
              />
              <Field
                label="Home page title"
                name="hero_title"
                maxLength={200}
                defaultValue={values.hero_title}
                hint="The large heading at the top of the home page."
              />
              <Field
                label="Home page text"
                name="hero_text"
                type="textarea"
                rows={4}
                maxLength={1000}
                defaultValue={values.hero_text}
                hint="A short introduction under the heading."
              />
            </section>

            <section aria-labelledby="about-heading" className="space-y-6 border-t border-slate-200 pt-8">
              <h2 id="about-heading" className="text-xl font-bold text-navy">
                About page
              </h2>
              <MarkdownField
                label="About page text"
                name="about_md"
                defaultValue={values.about_md}
                maxLength={20000}
                rows={14}
                previewLabel="Preview of the About page text"
                hint="Use ## for a heading and - for a bullet point. Raw HTML is shown as text."
              />
            </section>

            <p className="border-t border-slate-200 pt-8 text-sm text-slate-700">
              Office details: text in [square brackets] is a placeholder. The website shows it as plain text and does not make a
              link from it. Replace it with the real details.
            </p>
            <OfficeFields office="india" values={values} recipient={indiaRecipient} />
            <OfficeFields office="uae" values={values} recipient={uaeRecipient} />
          </div>
        </EntityForm>
      </div>
    </>
  );
}
