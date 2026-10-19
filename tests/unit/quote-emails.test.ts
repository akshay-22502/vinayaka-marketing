import { describe, expect, it } from "vitest";
import { escapeHtml, renderBuyerEmail, renderTeamEmail } from "@/lib/quote/emails";
import type { QuoteInput } from "@/lib/quote/schema";

const quote: QuoteInput = {
  name: "Asha Verma",
  company: "Verma Infra",
  email: "asha@verma-infra.example",
  phone: "+91 98765 43210",
  country: "IN",
  products: ["pp-biaxial-geogrid", "hdpe-geomembrane"],
  quantity: "5,000 m2",
  projectLocation: "Pune, Maharashtra",
  message: "Need a quote for a road base.\nSecond line.",
  turnstileToken: "tok",
};
const names = ["PP Biaxial Geogrid", "HDPE Geomembrane"];
const id = "11111111-2222-3333-4444-555555555555";

describe("escapeHtml", () => {
  it("escapes & < > \" and '", () => {
    expect(escapeHtml(`<a href="x" onclick='y'>&</a>`)).toBe(
      "&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;&lt;/a&gt;",
    );
  });

  it("escapes an ampersand once, before the entities it adds", () => {
    expect(escapeHtml("&lt;")).toBe("&amp;lt;");
  });

  it("leaves plain text alone", () => {
    expect(escapeHtml("Plain text, 5,000 m2")).toBe("Plain text, 5,000 m2");
  });
});

describe("renderTeamEmail", () => {
  it("names the country in the subject and puts the buyer's name last", () => {
    expect(renderTeamEmail(quote, names, id).subject).toBe("New quote request (India): Asha Verma");
    expect(renderTeamEmail({ ...quote, country: "AE" }, names, id).subject).toBe(
      "New quote request (UAE): Asha Verma",
    );
  });

  it("strips CR and LF from the subject so a name cannot add headers", () => {
    const { subject } = renderTeamEmail(
      { ...quote, name: "Asha\r\nBcc: attacker@evil.example\nX-Injected: 1" },
      names,
      id,
    );
    expect(subject).not.toMatch(/[\r\n]/);
    expect(subject.startsWith("New quote request (India): Asha")).toBe(true);
  });

  it("includes every buyer field, the product names and the quote id in both html and text", () => {
    const { html, text } = renderTeamEmail(quote, names, id);
    for (const body of [html, text]) {
      expect(body).toContain("India");
      expect(body).toContain("Asha Verma");
      expect(body).toContain("Verma Infra");
      expect(body).toContain("asha@verma-infra.example");
      expect(body).toContain("+91 98765 43210");
      expect(body).toContain("PP Biaxial Geogrid");
      expect(body).toContain("HDPE Geomembrane");
      expect(body).toContain("5,000 m2");
      expect(body).toContain("Pune, Maharashtra");
      expect(body).toContain("Need a quote for a road base.");
      expect(body).toContain(id);
    }
  });

  it("keeps line breaks in the message", () => {
    const { html, text } = renderTeamEmail(quote, names, id);
    expect(html).toContain("Need a quote for a road base.<br>Second line.");
    expect(text).toContain("Need a quote for a road base.\nSecond line.");
  });

  it("escapes HTML in the name and message (no live <script> or <img>)", () => {
    const { html } = renderTeamEmail(
      {
        ...quote,
        name: "<script>alert(1)</script>",
        company: `"><img src=x onerror=alert(2)>`,
        message: "<img src=x onerror=alert(3)> & more",
      },
      names,
      id,
    );
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).not.toContain("<script");
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img src=x onerror=alert(3)&gt; &amp; more");
  });

  it("escapes every other buyer-supplied field too", () => {
    const evil = `<b onmouseover="x">`;
    const { html } = renderTeamEmail(
      { ...quote, phone: evil, quantity: evil, projectLocation: evil },
      [evil],
      id,
    );
    expect(html).not.toContain("<b ");
  });

  it("says when there is an attachment, without linking to it", () => {
    const without = renderTeamEmail(quote, names, id);
    const withFile = renderTeamEmail(quote, names, id, { hasAttachment: true });
    expect(withFile.html).toMatch(/attachment/i);
    expect(withFile.html).toMatch(/admin/i);
    expect(withFile.text).toMatch(/attachment/i);
    expect(withFile.html).not.toMatch(/https?:\/\//);
    expect(without.html).not.toMatch(/attachment/i);
    expect(without.text).not.toMatch(/attachment/i);
  });

  it("shows a dash for fields the buyer left blank", () => {
    const { text } = renderTeamEmail(
      { ...quote, company: undefined, quantity: undefined, projectLocation: undefined },
      [],
      id,
    );
    expect(text).toMatch(/Company: –/);
    expect(text).toMatch(/Products: –/);
  });
});

describe("renderBuyerEmail", () => {
  it("confirms receipt, names the India team and lists the products", () => {
    const { subject, html, text } = renderBuyerEmail(quote, names);
    expect(subject).toMatch(/received/i);
    expect(subject).not.toMatch(/[\r\n]/);
    for (const body of [html, text]) {
      expect(body).toContain("Asha Verma");
      expect(body).toContain("India team");
      expect(body).toContain("PP Biaxial Geogrid");
      expect(body).toContain("HDPE Geomembrane");
    }
  });

  it("names the UAE team for a UAE request", () => {
    const { html, text } = renderBuyerEmail({ ...quote, country: "AE" }, names);
    expect(html).toContain("UAE team");
    expect(text).toContain("UAE team");
  });

  it("escapes buyer text", () => {
    const { html } = renderBuyerEmail(
      { ...quote, name: "<script>alert(1)</script>", message: "<img src=x onerror=alert(1)>" },
      names,
    );
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script");
    expect(html).not.toContain("<img");
  });

  it("copes with no products", () => {
    const { html, text } = renderBuyerEmail(quote, []);
    expect(html).toContain("Asha Verma");
    expect(text).toContain("Asha Verma");
  });
});
