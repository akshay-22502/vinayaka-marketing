import { describe, expect, it } from "vitest";
import { MAX_UPLOAD_BYTES, checkUpload, displayName, isImagePath, uploadPath } from "@/lib/admin/upload";

const UUID = "0b5f2c1e-8d7a-4c3b-9e21-5a6f7d8c9b10";

describe("uploadPath", () => {
  it("puts the file in the folder as <uuid>-<slugified name>.<ext>", () => {
    expect(uploadPath("categories", "Geo Grid Photo (1).JPG", UUID)).toBe(`categories/${UUID}-geo-grid-photo-1.jpg`);
  });

  it("keeps the extension and strips accents and punctuation from the name", () => {
    expect(uploadPath("certifications", "Zertifikat Qualität & Prüfung.pdf", UUID)).toBe(
      `certifications/${UUID}-zertifikat-qualitat-prufung.pdf`,
    );
  });

  it("falls back to 'file' when the name has no Latin letters", () => {
    expect(uploadPath("projects", "भू-वस्त्र.png", UUID)).toBe(`projects/${UUID}-file.png`);
  });

  it("handles names with no extension, several dots or an odd extension", () => {
    expect(uploadPath("projects", "scan", UUID)).toBe(`projects/${UUID}-scan`);
    expect(uploadPath("projects", "site.plan.v2.PNG", UUID)).toBe(`projects/${UUID}-site-plan-v2.png`);
    expect(uploadPath("projects", "weird.p$g", UUID)).toBe(`projects/${UUID}-weird.pg`);
  });

  it("never lets the file name change the folder", () => {
    const path = uploadPath("projects", "../../etc/passwd.png", UUID);
    expect(path).toBe(`projects/${UUID}-etc-passwd.png`);
    expect(path.split("/")).toHaveLength(2);
  });

  it("keeps long names short", () => {
    const path = uploadPath("projects", `${"a".repeat(300)}.png`, UUID);
    expect(path.length).toBeLessThan(120);
    expect(path.endsWith(".png")).toBe(true);
  });
});

describe("checkUpload", () => {
  const image = { name: "photo.jpg", size: 1000, type: "image/jpeg" };

  it("accepts a file whose type is listed", () => {
    expect(checkUpload(image, "image/png,image/jpeg", MAX_UPLOAD_BYTES)).toBeNull();
    expect(checkUpload({ name: "a.pdf", size: 10, type: "application/pdf" }, "application/pdf", MAX_UPLOAD_BYTES)).toBeNull();
  });

  it("accepts by extension when the browser gives no type", () => {
    expect(checkUpload({ name: "a.PDF", size: 10, type: "" }, "application/pdf,.pdf", MAX_UPLOAD_BYTES)).toBeNull();
  });

  it("accepts wildcard types", () => {
    expect(checkUpload(image, "image/*", MAX_UPLOAD_BYTES)).toBeNull();
  });

  it("refuses a file of another type, naming what is allowed", () => {
    const message = checkUpload({ name: "a.exe", size: 10, type: "application/x-msdownload" }, "image/png,image/jpeg", MAX_UPLOAD_BYTES);
    expect(message).toMatch(/a\.exe/);
    expect(message).toMatch(/png|jpeg|image/i);
  });

  it("refuses an empty file and one that is too large", () => {
    expect(checkUpload({ ...image, size: 0 }, "image/jpeg", MAX_UPLOAD_BYTES)).toMatch(/empty/i);
    expect(checkUpload({ ...image, size: MAX_UPLOAD_BYTES + 1 }, "image/jpeg", MAX_UPLOAD_BYTES)).toMatch(/10 MB/);
    expect(checkUpload({ ...image, size: MAX_UPLOAD_BYTES }, "image/jpeg", MAX_UPLOAD_BYTES)).toBeNull();
  });
});

describe("displayName and isImagePath", () => {
  it("shows the original-looking file name without the folder and uuid", () => {
    expect(displayName(`certifications/${UUID}-iso-9001.pdf`)).toBe("iso-9001.pdf");
    expect(displayName("legacy/Name.pdf")).toBe("Name.pdf");
    expect(displayName("plain.pdf")).toBe("plain.pdf");
  });

  it("recognises image paths by extension", () => {
    for (const path of ["a/b.png", "a/b.JPG", "a/b.jpeg", "a/b.webp", "a/b.gif", "a/b.svg", "a/b.avif"]) {
      expect(isImagePath(path), path).toBe(true);
    }
    for (const path of ["a/b.pdf", "a/b", "a/png"]) {
      expect(isImagePath(path), path).toBe(false);
    }
  });
});
