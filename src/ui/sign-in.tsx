// The first screen, and the only one anybody sees without a session.
//
// It does two jobs, and which one is first matters. A visitor wants to look
// at the thing: the demo is the large button, it runs in their own browser,
// and one press is enough. Somebody who works in the shop wants to sign in:
// that form is underneath, and it is empty.
//
// It used to be the other way round — the form first, and the demo behind a
// button that only appeared once you were already signed in. Which meant the
// demo was unreachable for the one person it was built for.
//
// The demo still goes through this same screen rather than around it. A demo
// that skipped the login would be showing something the shop does not run,
// and whether there is a login at all is what a reader most wants to check.

import { useEffect, useState } from "preact/hooks";
import { useText } from "./lang-context.ts";
import { LANGS, LANG_LABEL } from "./i18n.ts";
import type { Lang } from "./i18n.ts";

export type Signed = { id: number; name: string; role: string; grade?: string };

export function SignIn({
  demo,
  onSignedIn,
  onOpenDemo,
  demoState,
  demoWhy,
  trail,
}: {
  /** Credentials to fill in and show, once the demo is running. */
  demo: { loginId: string; password: string } | null;
  onSignedIn: (who: Signed) => void;
  /** Load the demo and sign into it. Absent where there is no demo to open. */
  onOpenDemo: (() => void) | null;
  demoState: "off" | "loading" | "on" | "failed";
  demoWhy: string | null;
  /** What the demo did, if it did anything. Shown when it ended up back here. */
  trail: string[];
}) {
  const { t, lang, setLang } = useText();
  const [loginId, setLoginId] = useState(demo?.loginId ?? "");
  const [password, setPassword] = useState(demo?.password ?? "");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    if (demo) {
      setLoginId(demo.loginId);
      setPassword(demo.password);
    }
  }, [demo]);

  async function send(event: Event) {
    event.preventDefault();
    setBusy(true);
    setFailed(null);

    try {
      const response = await fetch("/api/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ loginId, password }),
      });
      const reply = (await response.json()) as { ok?: boolean; staff?: Signed; error?: string };

      if (reply.ok && reply.staff) {
        onSignedIn(reply.staff);
        return;
      }
      setFailed(reply.error ?? `HTTP ${response.status}`);
    } catch (problem: unknown) {
      setFailed(String(problem));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main class="sign-in">
      <div class="langs" role="group" aria-label="Language">
        {LANGS.map((code: Lang) => (
          <button
            type="button"
            key={code}
            class={code === lang ? "is-on" : undefined}
            aria-pressed={code === lang}
            onClick={() => setLang(code)}
          >
            {LANG_LABEL[code]}
          </button>
        ))}
      </div>

      <h1>chairside</h1>
      <p class="tagline">{t("tagline")}</p>

      {onOpenDemo && demoState !== "on" && (
        <section class="sign-in-invite">
          <p>{t("demoInvite")}</p>
          <button
            type="button"
            class="primary big"
            disabled={demoState === "loading"}
            onClick={onOpenDemo}
          >
            {demoState === "loading" ? t("demoLoading") : t("demoOpen")}
          </button>
          <p class="said">{t("demoInBrowser")}</p>
          {demoState === "failed" && (
            <p class="failed" role="alert">
              {t("demoFailed")}
              {demoWhy && ` ${demoWhy}`}
            </p>
          )}
        </section>
      )}

      <h2 class="sign-in-shop">{t("shopSignIn")}</h2>
      <form onSubmit={send}>
        <label class="field">
          <span>{t("loginId")}</span>
          <input
            type="text"
            autocomplete="username"
            value={loginId}
            onInput={(e) => setLoginId((e.target as HTMLInputElement).value)}
          />
        </label>

        <label class="field">
          <span>{t("password")}</span>
          <input
            type="password"
            autocomplete="current-password"
            value={password}
            onInput={(e) => setPassword((e.target as HTMLInputElement).value)}
          />
        </label>

        {failed && (
          <p class="failed" role="alert">
            {failed}
          </p>
        )}

        <button type="submit" class="primary" disabled={busy || loginId === "" || password === ""}>
          {busy ? t("sending") : t("signIn")}
        </button>
      </form>

      {/* The demo's password, in plain sight. There is nothing to protect —
          that database is invented and lives in this browser — and hiding it
          would only mean nobody could get in.

          With the demo off there is no hint, because there is nothing to hint
          at: the public instance has no account anybody can open. */}
      {demo ? (
        <p class="sign-in-demo">{t("demoCredentials", demo)}</p>
      ) : (
        <p class="said">{t("shopSignInNote")}</p>
      )}

      {/* If the demo ran and the visitor is reading this screen, something
          went wrong after it started. This says what, on the screen, rather
          than in a console nobody has open. */}
      {trail.length > 0 && (
        <details class="sign-in-trail" open>
          <summary>{t("demoTrail")}</summary>
          <ol>
            {trail.map((step, at) => (
              <li key={`${at}-${step}`}>{step}</li>
            ))}
          </ol>
        </details>
      )}
    </main>
  );
}
