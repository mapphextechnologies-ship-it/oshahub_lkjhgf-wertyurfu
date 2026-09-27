"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import DashboardLayout from "@/components/layout/DashboardLayout";
import styles from "./createOrg.module.css";

export default function CreateOrganizationPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    name: "", industry: "", country: "", contactPerson: "",
    email: "", phone: "", plan: "Starter", maxDevices: "", billingCycle: "Monthly", notes: "",
  });
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      setSuccess(true);
      setTimeout(() => router.push("/organizations"), 1500);
    }, 900);
  }

  return (
    <DashboardLayout title="Add Organization" showBack>
      <div className={styles.pageTitle}>Register New Organization</div>
      <div className={styles.pageSub}>Fill in the details below to onboard a new organization onto the platform.</div>

      {success && (
        <div className={styles.success}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6L9 17l-5-5" />
          </svg>
          Organization registered successfully. Redirecting...
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className={styles.card}>
          <div className={styles.sectionTitle}>Organization Details</div>
          <div className={styles.grid}>
            <div className={styles.field}>
              <label className={styles.label}>Company Name *</label>
              <input className={styles.input} name="name" value={form.name} onChange={handleChange} placeholder="e.g. Bumu PayGo" required />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Industry *</label>
              <select className={styles.select} name="industry" value={form.industry} onChange={handleChange} required>
                <option value="">Select industry</option>
                {["Finance", "Education", "Health", "Logistics", "Telecom", "Government", "NGO", "Retail", "Other"].map((i) => (
                  <option key={i} value={i}>{i}</option>
                ))}
              </select>
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Country *</label>
              <select className={styles.select} name="country" value={form.country} onChange={handleChange} required>
                <option value="">Select country</option>
                {["Kenya", "Uganda", "Tanzania", "Rwanda", "Ethiopia", "Nigeria", "Ghana", "South Africa", "Other"].map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Contact Person *</label>
              <input className={styles.input} name="contactPerson" value={form.contactPerson} onChange={handleChange} placeholder="Full name" required />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Email Address *</label>
              <input className={styles.input} type="email" name="email" value={form.email} onChange={handleChange} placeholder="contact@company.com" required />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Phone Number *</label>
              <input className={styles.input} name="phone" value={form.phone} onChange={handleChange} placeholder="+254 700 000 000" required />
            </div>
          </div>
        </div>

        <div className={styles.card}>
          <div className={styles.sectionTitle}>Subscription & Plan</div>
          <div className={styles.grid}>
            <div className={styles.field}>
              <label className={styles.label}>Subscription Plan *</label>
              <select className={styles.select} name="plan" value={form.plan} onChange={handleChange} required>
                <option value="Starter">Starter - up to 100 devices</option>
                <option value="Growth">Growth - up to 1,000 devices</option>
                <option value="Business">Business - up to 10,000 devices</option>
                <option value="Enterprise">Enterprise - Unlimited devices</option>
              </select>
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Billing Cycle</label>
              <select className={styles.select} name="billingCycle" value={form.billingCycle} onChange={handleChange}>
                <option value="Monthly">Monthly</option>
                <option value="Quarterly">Quarterly</option>
                <option value="Annually">Annually</option>
              </select>
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Max Devices (override)</label>
              <input className={styles.input} type="number" name="maxDevices" value={form.maxDevices} onChange={handleChange} placeholder="Leave blank to use plan default" />
            </div>
            <div className={`${styles.field} ${styles.fieldFull}`}>
              <label className={styles.label}>Notes</label>
              <textarea className={styles.textarea} name="notes" value={form.notes} onChange={handleChange} placeholder="Any additional notes about this organization..." />
            </div>
          </div>
        </div>

        <div className={styles.actions}>
          <button type="submit" className={styles.submitBtn} disabled={loading}>
            {loading ? "Registering..." : "Register Organization"}
          </button>
          <button type="button" className={styles.cancelBtn} onClick={() => router.push("/organizations")}>
            Cancel
          </button>
        </div>
      </form>
    </DashboardLayout>
  );
}
