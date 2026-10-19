// Builds the multipart form the quote page posts, for tests of the quote backend.

export type FormOverrides = Record<string, string | string[] | File | null>;

/** A complete, valid quote form. `null` removes a field; an array repeats it. */
export function quoteForm(overrides: FormOverrides = {}): FormData {
  const fields: FormOverrides = {
    name: "Asha Verma",
    company: "Verma Infra",
    email: "asha@verma-infra.example",
    phone: "+91 98765 43210",
    country: "IN",
    products: ["pp-biaxial-geogrid"],
    quantity: "5,000 m2",
    projectLocation: "Pune, Maharashtra",
    message: "Please quote for a road base reinforcement project.",
    "cf-turnstile-response": "turnstile-token",
    ...overrides,
  };
  const form = new FormData();
  for (const [name, value] of Object.entries(fields)) {
    if (value === null) continue;
    if (Array.isArray(value)) value.forEach((v) => form.append(name, v));
    else form.append(name, value);
  }
  return form;
}

/** A file of the given size, for the attachment field. */
export function fakeFile(name: string, bytes: number, type = "application/pdf"): File {
  return new File([new Uint8Array(bytes)], name, { type });
}
