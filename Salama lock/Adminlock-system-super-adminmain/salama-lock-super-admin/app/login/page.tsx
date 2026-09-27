"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./login.module.css";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    setTimeout(() => {
      if (email === "admin@salamalock.com" && password === "admin123") {
        router.push("/dashboard");
      } else {
        setError("Invalid email or password.");
        setLoading(false);
      }
    }, 800);
  }

  return (
    <div className={styles.root}>
      <div className={styles.left}>
        <div className={styles.logo}>
          <div className={styles.logoIcon}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <rect x="5" y="11" width="14" height="10" rx="2" stroke="#4a7fb5" strokeWidth="2" />
              <path d="M8 11V7a4 4 0 0 1 8 0v4" stroke="#4a7fb5" strokeWidth="2" strokeLinecap="round" />
              <circle cx="12" cy="16" r="1.5" fill="#4a7fb5" />
            </svg>
          </div>
          <div>
            <div className={styles.logoName}>Salama Lock</div>
            <div className={styles.logoSub}>Enterprise</div>
          </div>
        </div>

        <div className={styles.leftMid}>
          <div className={styles.leftTitle}>Unified Device<br />Security Platform</div>
          <div className={styles.leftDesc}>
            Manage organizations, subscriptions, devices, and security policies from one central control center.
          </div>
        </div>

        <div className={styles.stats}>
          <div className={styles.stat}>
            <div className={styles.statDot} />
            <span className={styles.statText}>Multi-tenant organization management</span>
          </div>
          <div className={styles.stat}>
            <div className={styles.statDot} />
            <span className={styles.statText}>Cross-platform device control</span>
          </div>
          <div className={styles.stat}>
            <div className={styles.statDot} />
            <span className={styles.statText}>Real-time audit and compliance logs</span>
          </div>
        </div>
      </div>

      <div className={styles.right}>
        <div className={styles.card}>
          <div className={styles.cardTitle}>Super Admin Login</div>
          <div className={styles.cardSub}>Sign in to the Salama Lock control center</div>

          <form onSubmit={handleSubmit}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="email">Email Address</label>
              <input
                id="email"
                type="email"
                className={styles.input}
                placeholder="admin@salamalock.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                className={styles.input}
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </div>
            {error && <div className={styles.error}>{error}</div>}
            <button type="submit" className={styles.button} disabled={loading}>
              {loading ? "Signing in..." : "Sign In"}
            </button>
          </form>

          <div className={styles.footer}>
            Salama Lock Enterprise (c) {new Date().getFullYear()} - Super Admin Portal
          </div>
        </div>
      </div>
    </div>
  );
}
