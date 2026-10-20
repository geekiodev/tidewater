import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The login server action: rate limiting happens BEFORE any password check,
 * errors are generic, and the post-login redirect is restricted to our site.
 */

const signInWithPassword = vi.fn();
const signUp = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { signInWithPassword, signUp } }),
}));

const allowed = { value: true };
const hitRateLimit = vi.fn(async () => allowed.value);
vi.mock("@/lib/rate-limit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/rate-limit")>();
  return { ...actual, hitRateLimit, clientIp: async () => "203.0.113.7" };
});

class RedirectSignal extends Error {
  constructor(public url: string) {
    super("NEXT_REDIRECT");
  }
}
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new RedirectSignal(url);
  },
}));

const { loginAction, signupAction } = await import("@/app/auth/actions");

function form(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

beforeEach(() => {
  allowed.value = true;
  signInWithPassword.mockReset();
  signUp.mockReset();
  hitRateLimit.mockClear();
  vi.stubEnv("APP_URL", "http://localhost:3000");
});

describe("loginAction", () => {
  it("refuses without checking the password once the rate limit is hit", async () => {
    allowed.value = false;
    const res = await loginAction({}, form({ email: "a@example.test", password: "whatever" }));
    expect(res.error).toMatch(/Too many attempts/);
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  it("checks both the per-IP and per-email limits", async () => {
    signInWithPassword.mockResolvedValue({ error: { message: "Invalid login credentials" } });
    await loginAction({}, form({ email: "A@Example.test", password: "whatever" }));
    const names = hitRateLimit.mock.calls.map((c) => (c as unknown as [{ name: string }, string])[0].name).sort();
    expect(names).toEqual(["login:email", "login:ip"]);
    const ids = hitRateLimit.mock.calls.map((c) => (c as unknown as [unknown, string])[1]);
    expect(ids).toContain("a@example.test");
    expect(ids).toContain("203.0.113.7");
  });

  it("returns one generic error for a wrong password", async () => {
    signInWithPassword.mockResolvedValue({ error: { message: "Invalid login credentials" } });
    const res = await loginAction({}, form({ email: "a@example.test", password: "wrong" }));
    expect(res.error).toMatch(/Email or password is incorrect/);
  });

  it("rejects malformed input before touching auth", async () => {
    const res = await loginAction({}, form({ email: "not-an-email", password: "" }));
    expect(res.fieldErrors?.email).toBeTruthy();
    expect(signInWithPassword).not.toHaveBeenCalled();
    expect(hitRateLimit).not.toHaveBeenCalled();
  });

  it("redirects to a safe next path after login, and ignores off-site ones", async () => {
    signInWithPassword.mockResolvedValue({ error: null });
    await expect(
      loginAction({}, form({ email: "a@example.test", password: "pw", next: "/clients/abc" })),
    ).rejects.toMatchObject({ url: "/clients/abc" });
    await expect(
      loginAction({}, form({ email: "a@example.test", password: "pw", next: "https://evil.example/" })),
    ).rejects.toMatchObject({ url: "/clients" });
  });
});

describe("signupAction", () => {
  it("is rate limited per IP", async () => {
    allowed.value = false;
    const res = await signupAction(
      {},
      form({ mode: "workspace", email: "a@example.test", password: "LongEnoughPass1", workspaceName: "Agency" }),
    );
    expect(res.error).toMatch(/Too many attempts/);
    expect(signUp).not.toHaveBeenCalled();
  });

  it("sends the workspace name as sign-up metadata, and nothing else from the form", async () => {
    signUp.mockResolvedValue({ error: null });
    const res = await signupAction(
      {},
      form({
        mode: "workspace",
        email: "a@example.test",
        password: "LongEnoughPass1",
        workspaceName: "Agency",
        role: "owner",
        workspace_id: "attacker-chosen",
      }),
    );
    expect(res.ok).toBe(true);
    const args = signUp.mock.calls[0][0];
    expect(args.options.data).toEqual({ workspace_name: "Agency" });
  });

  it("rejects short passwords", async () => {
    const res = await signupAction(
      {},
      form({ mode: "workspace", email: "a@example.test", password: "short", workspaceName: "Agency" }),
    );
    expect(res.fieldErrors?.password).toBeTruthy();
    expect(signUp).not.toHaveBeenCalled();
  });
});
