"use client";

import Image from "next/image";
import { ArrowRight } from "lucide-react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./login.module.css";

function GoogleIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.4-.18-2.07H12v3.92h5.38a4.6 4.6 0 0 1-2 3.02v2.54h3.24c1.9-1.75 2.98-4.33 2.98-7.41Z"/><path fill="#34A853" d="M12 22c2.7 0 4.97-.9 6.62-2.36l-3.24-2.54c-.9.6-2.05.96-3.38.96-2.61 0-4.82-1.76-5.61-4.13H3.04v2.62A10 10 0 0 0 12 22Z"/><path fill="#FBBC05" d="M6.39 13.93A6 6 0 0 1 6.08 12c0-.67.12-1.32.31-1.93V7.45H3.04A10 10 0 0 0 2 12c0 1.63.39 3.17 1.04 4.55l3.35-2.62Z"/><path fill="#EA4335" d="M12 5.94c1.47 0 2.78.5 3.82 1.49l2.87-2.87A9.62 9.62 0 0 0 12 2a10 10 0 0 0-8.96 5.45l3.35 2.62C7.18 7.7 9.39 5.94 12 5.94Z"/></svg>;
}

function MicrosoftIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#F25022" d="M2 2h9.5v9.5H2z"/><path fill="#7FBA00" d="M12.5 2H22v9.5h-9.5z"/><path fill="#00A4EF" d="M2 12.5h9.5V22H2z"/><path fill="#FFB900" d="M12.5 12.5H22V22h-9.5z"/></svg>;
}

export default function LoginPage() {
  const router = useRouter();
  const [identity, setIdentity] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    router.prefetch("/dashboard");
  }, [router]);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    router.push("/dashboard");
  }

  return (
    <main className={styles.root}>
      {loading && (
        <div className={styles.fastLoader} role="status" aria-live="polite">
          <div className={styles.loaderSidebar}>
            <div className={styles.loaderLogo} />
            {Array.from({ length: 6 }, (_, index) => <div className={styles.loaderNav} key={index} />)}
          </div>
          <div className={styles.loaderMain}>
            <span>Opening your workspace…</span>
            <div className={styles.loaderTitle} />
            <div className={styles.loaderCards}>
              {Array.from({ length: 4 }, (_, index) => <div key={index} />)}
            </div>
            <div className={styles.loaderPanel} />
          </div>
        </div>
      )}
      <section className={styles.brandPanel}>
        <Image className={styles.logo} src="/salama-lock-logo-dark.png" alt="Salama Lock" width={260} height={82} priority />
        <div className={styles.brandCopy}>
          <span>SECURE ORGANIZATION ACCESS</span>
          <h1>Control every<br />device.<br /><em>Protect every sale.</em></h1>
          <p>This administrator identity is used only for your Salama Lock organization and secure device workspace.</p>
        </div>
      </section>

      <section className={styles.formPanel}>
        <div className={styles.card}>
          <span className={styles.kicker}>ORGANIZATION ADMIN SIGN IN</span>
          <h2>Sign in to your organization portal.</h2>
          <p>Use your username or email and password to continue.</p>

          <div className={styles.socials}>
            <button type="button"><GoogleIcon />Continue with Google</button>
            <button type="button"><MicrosoftIcon />Continue with Microsoft</button>
          </div>
          <div className={styles.divider}><span>or continue with credentials</span></div>

          <form className={styles.form} onSubmit={handleSubmit}>
            <label>Username or email
              <input required value={identity} onChange={(event) => setIdentity(event.target.value)} placeholder="name@business.com" autoComplete="username" />
            </label>
            <label>Password
              <input required type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 8 characters" autoComplete="current-password" />
            </label>
            <button className={styles.submit} type="submit" disabled={loading}>
              {loading ? "Opening securely…" : "Continue securely"} <ArrowRight size={18} />
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}
