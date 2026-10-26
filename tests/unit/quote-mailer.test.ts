import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const send = vi.fn();
const resendConstructor = vi.fn();

vi.mock("resend", () => ({
  Resend: class {
    emails = { send };
    constructor(apiKey: string) {
      resendConstructor(apiKey);
    }
  },
}));

import { createMailer } from "@/lib/quote/mailer";

const message = {
  to: "team@terratechbharat.example",
  subject: "Subject",
  html: "<p>Hi</p>",
  text: "Hi",
  replyTo: "buyer@example.test",
};

beforeEach(() => {
  send.mockReset();
  resendConstructor.mockReset();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("createMailer with a Resend key", () => {
  beforeEach(() => {
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    vi.stubEnv("ALLOW_DEV_FALLBACKS", "");
  });

  it("sends through Resend from MAIL_FROM, with reply-to", async () => {
    vi.stubEnv("MAIL_FROM", "TerraTechBharat <quotes@example.test>");
    send.mockResolvedValue({ data: { id: "e1" }, error: null });

    await createMailer().send(message);

    expect(resendConstructor).toHaveBeenCalledWith("re_test_key");
    expect(send).toHaveBeenCalledWith({
      from: "TerraTechBharat <quotes@example.test>",
      to: "team@terratechbharat.example",
      subject: "Subject",
      html: "<p>Hi</p>",
      text: "Hi",
      replyTo: "buyer@example.test",
    });
  });

  it("falls back to the default sender when MAIL_FROM is unset", async () => {
    vi.stubEnv("MAIL_FROM", "");
    send.mockResolvedValue({ data: { id: "e1" }, error: null });
    await createMailer().send(message);
    expect(send.mock.calls[0]![0].from).toBe("TerraTechBharat <quotes@terratechbharat.com>");
  });

  it("rejects when Resend reports an error (the SDK returns errors instead of throwing)", async () => {
    send.mockResolvedValue({ data: null, error: { message: "domain not verified", name: "validation_error" } });
    await expect(createMailer().send(message)).rejects.toThrow(/domain not verified/);
  });

  it("rejects when the request itself fails", async () => {
    send.mockRejectedValue(new Error("network down"));
    await expect(createMailer().send(message)).rejects.toThrow(/network down/);
  });

  describe("when Resend does not answer", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it("rejects after about 8 seconds, so a hung send counts as failed", async () => {
      send.mockReturnValue(new Promise(() => {}));
      const outcome = createMailer()
        .send(message)
        .then(
          () => "sent",
          (error: Error) => error.message,
        );

      await vi.advanceTimersByTimeAsync(7_900);
      expect(vi.getTimerCount()).toBe(1);
      await vi.advanceTimersByTimeAsync(200);
      expect(await outcome).toMatch(/8 seconds/);
    });

    it("does not leave a timer running after a quick answer", async () => {
      send.mockResolvedValue({ data: { id: "e1" }, error: null });
      await createMailer().send(message);
      expect(vi.getTimerCount()).toBe(0);
    });

    it("does not leave a timer running after an error answer", async () => {
      send.mockResolvedValue({ data: null, error: { message: "nope", name: "validation_error" } });
      await expect(createMailer().send(message)).rejects.toThrow(/nope/);
      expect(vi.getTimerCount()).toBe(0);
    });
  });
});

describe("createMailer without a Resend key", () => {
  beforeEach(() => {
    vi.stubEnv("RESEND_API_KEY", "");
  });

  it.each(["", "1"])("builds, but every send rejects, when ALLOW_DEV_FALLBACKS is %j", async (flag) => {
    vi.stubEnv("ALLOW_DEV_FALLBACKS", flag);
    const mailer = createMailer();
    await expect(mailer.send(message)).rejects.toThrow(/RESEND_API_KEY/);
    expect(resendConstructor).not.toHaveBeenCalled();
  });

  it("logs instead of sending when ALLOW_DEV_FALLBACKS is 'true', and counts as sent", async () => {
    vi.stubEnv("ALLOW_DEV_FALLBACKS", "true");
    const log = vi.spyOn(console, "info").mockImplementation(() => {});

    await expect(createMailer().send(message)).resolves.toBeUndefined();

    expect(resendConstructor).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
    const logged = JSON.stringify(log.mock.calls);
    expect(logged).toContain("team@terratechbharat.example");
    expect(logged).toContain("Subject");
  });

  it.each(["production", "preview"])("still fails every send on a Vercel %s deployment, even with the flag", async (vercelEnv) => {
    vi.stubEnv("ALLOW_DEV_FALLBACKS", "true");
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("VERCEL_ENV", vercelEnv);
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    await expect(createMailer().send(message)).rejects.toThrow(/RESEND_API_KEY/);
    expect(log).not.toHaveBeenCalled();
  });
});
