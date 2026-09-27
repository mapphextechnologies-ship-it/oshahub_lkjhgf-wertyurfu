"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import styles from "../login/login.module.css";

export default function RegisterPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ company: "", name: "", email: "", phone: "", password: "" });

  function updateField(name: string, value: string) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    window.localStorage.setItem("salama-org-registration", JSON.stringify({ ...form, createdAt: new Date().toISOString() }));
    window.setTimeout(() => router.push("/dashboard"), 450);
  }

  return (
    <main className={styles.root}>
      <section className={styles.panel}>
        <div className={styles.brand}>Salama Lock</div>
        <h1>Create Organization</h1>
        <p>Register the organization owner account. Platform approval can be connected later from the super admin side.</p>
        <form className={styles.form} onSubmit={handleSubmit}>
          <label>Company Name</label>
          <input required value={form.company} onChange={(event) => updateField("company", event.target.value)} />
          <label>Owner Name</label>
          <input required value={form.name} onChange={(event) => updateField("name", event.target.value)} />
          <label>Email</label>
          <input required type="email" value={form.email} onChange={(event) => updateField("email", event.target.value)} />
          <label>Phone</label>
          <input required value={form.phone} onChange={(event) => updateField("phone", event.target.value)} />
          <label>Password</label>
          <input required type="password" value={form.password} onChange={(event) => updateField("password", event.target.value)} />
          <button type="submit" disabled={loading}>{loading ? "Creating..." : "Create Account"}</button>
        </form>
        <Link className={styles.textLink} href="/login">Already registered? Sign in</Link>
      </section>
    </main>
  );
}