// Sign-in screen, shown without a session. The demo button comes first, the
// staff form below. The demo also signs in through the real login.

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
  /** Demo credentials to prefill and show; null when the demo is off. */
  demo: { loginId: string; password: string } | null;
  onSignedIn: (who: Signed) => void;
  /** Load the demo and sign in. Null when there is no demo. */
  onOpenDemo: (() => void) | null;
  demoState: "off" | "loading" | "on" | "failed";
  demoWhy: string | null;
  /** Demo step log, shown when the demo falls back to this screen. */
  trail: string[];
}) {
  const { t, lang, setLang, failure } = useText();
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
      setFailed(failure(reply, response.status));
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

      {/* Demo password shown openly (invented data, local only). The public
          instance has no open account, so no hint when the demo is off. */}
      {demo ? (
        <p class="sign-in-demo">{t("demoCredentials", demo)}</p>
      ) : (
        <p class="said">{t("shopSignInNote")}</p>
      )}

      {/* A trail here means the demo failed after starting. */}
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
