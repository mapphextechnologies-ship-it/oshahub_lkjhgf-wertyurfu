import { useEffect, useRef, useState } from "react";
import {
  Bell,
  Globe2,
  Gauge,
  LockKeyhole,
  MessageSquareText,
  ShieldCheck,
  WalletCards
} from "lucide-react";
import { PageHeader } from "../../components/ui/PageHeader.jsx";
import { adminApiRequest } from "../../../services/adminApiClient.js";
import { defaultSiteContent, normalizeSiteContent } from "../../../services/siteContentService.js";

const sections = [
  { id: "admin", label: "Admin system", icon: Gauge },
  { id: "access", label: "Access control", icon: ShieldCheck },
  { id: "security", label: "Security", icon: LockKeyhole },
  { id: "reminders", label: "Reminders", icon: Bell },
  { id: "finance", label: "Finance", icon: WalletCards },
  { id: "messages", label: "Messages", icon: MessageSquareText },
  { id: "website", label: "Website", icon: Globe2 }
];

const rolePolicies = [
  ["Super admin", "Full admin access, settings, audit, overrides, users, bike inventory"],
  ["Back office", "Screening queue, KYC review, approve, reject, request info"],
  ["Finance", "Payments, reconciliation, reports, commissions"],
  ["Agent", "Customer onboarding, portfolio, commission visibility"]
];

const smsTemplates = [
  ["Application approved", "Congratulations! {Name}'s application has been approved."],
  ["Application rejected", "Application for {Name} was rejected. Reason: {Reason}."],
  ["Info required", "More information is needed for {Name}: {Details}."],
  ["Payment reminder", "Reminder: KES {Amount} is due on {Date}."],
  ["Overdue alert", "Your account is {Days} days overdue. Pay KES {Amount}."],
  ["Commission paid", "Commission of KES {Amount} has been paid. Ref: {Ref}."]
];

const defaultSettings = {
  admin: {
    defaultLandingPage: "/admin/overview",
    dashboardRefreshInterval: "manual",
    auditRetentionPeriod: "immutable",
    showFinanceSummary: true,
    showNotificationCount: true,
    requireAuditNote: true
  },
  access: {
    policies: Object.fromEntries(rolePolicies)
  },
  security: {
    otpExpiryMinutes: "10",
    maximumOtpAttempts: "3",
    sessionTimeoutMinutes: "30",
    otpAtLogin: true,
    otpForCriticalActions: true,
    otpForNextOfKin: true
  },
  reminders: {
    reminderDaysBeforeDueDate: "3",
    overdueAlertFrequencyDays: "1",
    notifyCustomerBeforeDueDate: true,
    notifyAgentWhenOverdue: true,
    notifyCustomerAfterPayment: true
  },
  finance: {
    registrationCommission: "1500",
    activeCustomerCommission: "500",
    commissionApproval: "finance_review",
    paybillNumber: "",
    paybillAccountReference: "National ID"
  },
  messages: {
    templates: Object.fromEntries(smsTemplates)
  },
  website: {
    ...defaultSiteContent
  }
};

function mergeSectionDefaults(sectionId, values = {}) {
  if (sectionId === "website") {
    return normalizeSiteContent({
      ...defaultSettings.website,
      ...values
    });
  }

  if (sectionId === "access") {
    return {
      policies: {
        ...defaultSettings.access.policies,
        ...(values.policies || values)
      }
    };
  }

  if (sectionId === "messages") {
    return {
      templates: {
        ...defaultSettings.messages.templates,
        ...(values.templates || values)
      }
    };
  }

  return { ...defaultSettings[sectionId], ...values };
}

function toLineText(values = []) {
  return Array.isArray(values) ? values.map((item) => String(item ?? "").trim()).filter(Boolean).join("\n") : "";
}

function toPairText(values = []) {
  if (!Array.isArray(values)) return "";
  return values
    .map((item) => {
      if (!item || typeof item !== "object") return "";
      const title = String(item.title || item.label || item.name || "").trim();
      const text = String(item.text || item.description || item.value || item.detail || "").trim();
      return title && text ? `${title} | ${text}` : "";
    })
    .filter(Boolean)
    .join("\n");
}

function toMetricText(values = []) {
  if (!Array.isArray(values)) return "";
  return values
    .map((item) => {
      if (!item || typeof item !== "object") return "";
      const value = String(item.value || item.amount || item.count || "").trim();
      const label = String(item.label || item.title || item.name || "").trim();
      const hint = String(item.hint || item.text || item.description || "").trim();
      const parts = [value, label, hint].filter(Boolean);
      return parts.length >= 2 ? parts.join(" | ") : "";
    })
    .filter(Boolean)
    .join("\n");
}

function parseLineText(text = "") {
  return String(text)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function parsePairText(text = "", fallbackImages = []) {
  return String(text)
    .split(/\r?\n/)
    .map((line, index) => {
      const [titlePart, ...rest] = line.split("|");
      const title = String(titlePart || "").trim();
      const description = String(rest.join("|") || "").trim();
      if (!title || !description) return null;
      const image = fallbackImages[index] || fallbackImages[fallbackImages.length - 1] || "";
      return image ? { title, text: description, image } : { title, text: description };
    })
    .filter(Boolean);
}

function parseMetricText(text = "") {
  return String(text)
    .split(/\r?\n/)
    .map((line) => {
      const [valuePart, labelPart, ...rest] = line.split("|");
      const value = String(valuePart || "").trim();
      const label = String(labelPart || "").trim();
      const hint = String(rest.join("|") || "").trim();
      if (!value || !label) return null;
      return hint ? { value, label, hint } : { value, label };
    })
    .filter(Boolean);
}

async function settingsRequest(section, { method = "GET", values } = {}) {
  const data = await adminApiRequest(`/api/admin/settings/${encodeURIComponent(section)}`, {
    method,
    ...(values ? { body: { values } } : {})
  });
  return data.setting;
}

export default function Settings() {
  const [activeSection, setActiveSection] = useState("admin");
  const [saveMessage, setSaveMessage] = useState("");
  const [settings, setSettings] = useState(defaultSettings);
  const [loadingSection, setLoadingSection] = useState(false);
  const saveTimers = useRef({});

  function applySettingsImmediately(nextSettings) {
    window.localStorage.setItem("SALAMA LOCK-admin-settings", JSON.stringify(nextSettings));
    window.dispatchEvent(new CustomEvent("SALAMA LOCK-admin-settings-changed", { detail: nextSettings }));
  }

  useEffect(() => {
    let active = true;

    async function loadSection() {
      setLoadingSection(true);

      try {
        const data = await settingsRequest(activeSection);
        if (!active) return;
        if (data?.values) {
          setSettings((current) => {
            const nextSettings = {
              ...current,
              [activeSection]: mergeSectionDefaults(activeSection, data.values)
            };
            applySettingsImmediately(nextSettings);
            return nextSettings;
          });
        }
        setSaveMessage("");
      } catch (error) {
        if (!active) return;
        setSaveMessage(error.message);
      } finally {
        if (active) setLoadingSection(false);
      }
    }

    loadSection();

    return () => {
      active = false;
    };
  }, [activeSection]);

  function updateSection(sectionId, nextValues) {
    setSettings((current) => {
      const mergedSection = sectionId === "website"
        ? normalizeSiteContent({
            ...current[sectionId],
            ...nextValues
          })
        : {
            ...current[sectionId],
            ...nextValues
          };
      const nextSettings = {
        ...current,
        [sectionId]: mergedSection
      };

      applySettingsImmediately(nextSettings);
      window.clearTimeout(saveTimers.current[sectionId]);
      saveTimers.current[sectionId] = window.setTimeout(async () => {
        try {
          const data = await settingsRequest(sectionId, { method: "PUT", values: mergedSection });
          if (data?.values) {
            setSettings((latest) => {
              const savedSettings = {
                ...latest,
                [sectionId]: mergeSectionDefaults(sectionId, data.values)
              };
              applySettingsImmediately(savedSettings);
              return savedSettings;
            });
          }
          setSaveMessage(`${sections.find((section) => section.id === sectionId)?.label} applied and saved.`);
        } catch (error) {
          setSaveMessage(`${sections.find((section) => section.id === sectionId)?.label} changed locally but could not be saved: ${error.message}`);
        }
      }, 650);

      return nextSettings;
    });
  }

  async function saveActiveSection() {
    const sectionLabel = sections.find((section) => section.id === activeSection)?.label;
    const values = settings[activeSection];

    try {
      const data = await settingsRequest(activeSection, { method: "PUT", values });
      if (data?.values) {
        setSettings((current) => {
          const nextSettings = {
            ...current,
            [activeSection]: mergeSectionDefaults(activeSection, data.values)
          };
          applySettingsImmediately(nextSettings);
          return nextSettings;
        });
      }
      setSaveMessage(`${sectionLabel} saved to system settings.`);
    } catch (error) {
      setSaveMessage(`${sectionLabel} could not be saved: ${error.message}`);
    }
  }

  return (
    <section className="page-stack settings-page">
      <PageHeader
        eyebrow="System settings"
        title="Admin configuration"
        description="Choose a setting category and update only that section."
        actions={
          <button className="button primary" type="button" disabled={loadingSection} onClick={saveActiveSection}>
            Save section
          </button>
        }
      />

      {saveMessage ? <div className="alert soft">{saveMessage}</div> : null}
      {loadingSection ? <div className="alert soft">Loading saved settings...</div> : null}

      <div className="settings-layout">
        <aside className="settings-index panel">
          {sections.map((section) => {
            const Icon = section.icon;
            return (
              <button
                className={`settings-tab ${activeSection === section.id ? "is-active" : ""}`}
                key={section.id}
                type="button"
                onClick={() => setActiveSection(section.id)}
              >
                <Icon size={18} />
                <span>{section.label}</span>
              </button>
            );
          })}
        </aside>

        <div className="settings-stack">
          {activeSection === "admin" ? (
            <AdminSystemSettings values={settings.admin} onChange={(values) => updateSection("admin", values)} />
          ) : null}
          {activeSection === "access" ? (
            <AccessSettings values={settings.access} onChange={(values) => updateSection("access", values)} />
          ) : null}
          {activeSection === "security" ? (
            <SecuritySettings values={settings.security} onChange={(values) => updateSection("security", values)} />
          ) : null}
          {activeSection === "reminders" ? (
            <ReminderSettings values={settings.reminders} onChange={(values) => updateSection("reminders", values)} />
          ) : null}
          {activeSection === "finance" ? (
            <FinanceSettings values={settings.finance} onChange={(values) => updateSection("finance", values)} />
          ) : null}
          {activeSection === "messages" ? (
            <MessageSettings values={settings.messages} onChange={(values) => updateSection("messages", values)} />
          ) : null}
          {activeSection === "website" ? (
            <WebsiteSettings values={settings.website} onChange={(values) => updateSection("website", values)} />
          ) : null}
        </div>
      </div>
    </section>
  );
}

function AdminSystemSettings({ values, onChange }) {
  return (
    <article className="settings-card">
      <div className="settings-card-header">
        <div>
          <p className="eyebrow">Admin system</p>
          <h3>Portal behaviour</h3>
        </div>
      </div>

      <div className="settings-form">
        <label>
          Default landing page
          <select
            value={values.defaultLandingPage}
            onChange={(event) => onChange({ defaultLandingPage: event.target.value })}
          >
            <option value="/admin/overview">Overview</option>
            <option value="/admin/applications">Screening queue</option>
            <option value="/admin/finance">Finance</option>
          </select>
        </label>
        <label>
          Dashboard refresh interval
          <select
            value={values.dashboardRefreshInterval}
            onChange={(event) => onChange({ dashboardRefreshInterval: event.target.value })}
          >
            <option value="manual">Manual refresh</option>
            <option value="60">Every 60 seconds</option>
            <option value="300">Every 5 minutes</option>
          </select>
        </label>
        <label>
          Audit retention period
          <select
            value={values.auditRetentionPeriod}
            onChange={(event) => onChange({ auditRetentionPeriod: event.target.value })}
          >
            <option value="immutable">Immutable records</option>
            <option value="365">365 days</option>
            <option value="730">730 days</option>
          </select>
        </label>
      </div>

      <div className="toggle-list">
        <label>
          <input
            type="checkbox"
            checked={values.showFinanceSummary}
            onChange={(event) => onChange({ showFinanceSummary: event.target.checked })}
          />
          Show finance summary on overview
        </label>
        <label>
          <input
            type="checkbox"
            checked={values.showNotificationCount}
            onChange={(event) => onChange({ showNotificationCount: event.target.checked })}
          />
          Show notification count in admin
        </label>
        <label>
          <input
            type="checkbox"
            checked={values.requireAuditNote}
            onChange={(event) => onChange({ requireAuditNote: event.target.checked })}
          />
          Require audit note for critical changes
        </label>
      </div>
    </article>
  );
}

function AccessSettings({ values, onChange }) {
  function updatePolicy(role, access) {
    onChange({
      policies: {
        ...values.policies,
        [role]: access
      }
    });
  }

  return (
    <article className="settings-card">
      <div className="settings-card-header">
        <div>
          <p className="eyebrow">Access control</p>
          <h3>Role permissions</h3>
        </div>
      </div>

      <div className="permission-list">
        {rolePolicies.map(([role, access]) => (
          <div className="permission-row editable-row" key={role}>
            <strong>{role}</strong>
            <input
              value={values.policies[role] || access}
              aria-label={`${role} permissions`}
              onChange={(event) => updatePolicy(role, event.target.value)}
            />
          </div>
        ))}
      </div>
    </article>
  );
}

function SecuritySettings({ values, onChange }) {
  return (
    <article className="settings-card">
      <div className="settings-card-header">
        <div>
          <p className="eyebrow">Security</p>
          <h3>OTP and sessions</h3>
        </div>
      </div>

      <div className="settings-form">
        <label>
          OTP expiry minutes
          <input
            type="number"
            value={values.otpExpiryMinutes}
            min="1"
            max="30"
            onChange={(event) => onChange({ otpExpiryMinutes: event.target.value })}
          />
        </label>
        <label>
          Maximum OTP attempts
          <input
            type="number"
            value={values.maximumOtpAttempts}
            min="1"
            max="5"
            onChange={(event) => onChange({ maximumOtpAttempts: event.target.value })}
          />
        </label>
        <label>
          Session timeout minutes
          <input
            type="number"
            value={values.sessionTimeoutMinutes}
            min="5"
            max="120"
            onChange={(event) => onChange({ sessionTimeoutMinutes: event.target.value })}
          />
        </label>
      </div>

      <div className="toggle-list">
        <label>
          <input
            type="checkbox"
            checked={values.otpAtLogin}
            onChange={(event) => onChange({ otpAtLogin: event.target.checked })}
          />
          OTP at login
        </label>
        <label>
          <input
            type="checkbox"
            checked={values.otpForCriticalActions}
            onChange={(event) => onChange({ otpForCriticalActions: event.target.checked })}
          />
          OTP for critical actions
        </label>
        <label>
          <input
            type="checkbox"
            checked={values.otpForNextOfKin}
            onChange={(event) => onChange({ otpForNextOfKin: event.target.checked })}
          />
          OTP for next-of-kin verification
        </label>
      </div>
    </article>
  );
}

function ReminderSettings({ values, onChange }) {
  return (
    <article className="settings-card">
      <div className="settings-card-header">
        <div>
          <p className="eyebrow">Reminders</p>
          <h3>Payment alerts</h3>
        </div>
      </div>

      <div className="settings-form">
        <label>
          Reminder days before due date
          <input
            type="number"
            value={values.reminderDaysBeforeDueDate}
            min="1"
            max="14"
            onChange={(event) => onChange({ reminderDaysBeforeDueDate: event.target.value })}
          />
        </label>
        <label>
          Overdue alert frequency days
          <input
            type="number"
            value={values.overdueAlertFrequencyDays}
            min="1"
            max="7"
            onChange={(event) => onChange({ overdueAlertFrequencyDays: event.target.value })}
          />
        </label>
      </div>

      <div className="toggle-list">
        <label>
          <input
            type="checkbox"
            checked={values.notifyCustomerBeforeDueDate}
            onChange={(event) => onChange({ notifyCustomerBeforeDueDate: event.target.checked })}
          />
          Notify customer before due date
        </label>
        <label>
          <input
            type="checkbox"
            checked={values.notifyAgentWhenOverdue}
            onChange={(event) => onChange({ notifyAgentWhenOverdue: event.target.checked })}
          />
          Notify agent when customer is overdue
        </label>
        <label>
          <input
            type="checkbox"
            checked={values.notifyCustomerAfterPayment}
            onChange={(event) => onChange({ notifyCustomerAfterPayment: event.target.checked })}
          />
          Notify customer after successful payment
        </label>
      </div>
    </article>
  );
}

function FinanceSettings({ values, onChange }) {
  return (
    <article className="settings-card">
      <div className="settings-card-header">
        <div>
          <p className="eyebrow">Finance</p>
          <h3>Commission defaults and paybill details</h3>
        </div>
      </div>

      <div className="settings-form">
        <label>
          Registration commission
          <input
            type="number"
            value={values.registrationCommission}
            min="0"
            onChange={(event) => onChange({ registrationCommission: event.target.value })}
          />
        </label>
        <label>
          Active customer commission
          <input
            type="number"
            value={values.activeCustomerCommission}
            min="0"
            onChange={(event) => onChange({ activeCustomerCommission: event.target.value })}
          />
        </label>
        <label>
          Commission approval
          <select
            value={values.commissionApproval}
            onChange={(event) => onChange({ commissionApproval: event.target.value })}
          >
            <option value="finance_review">Finance review required</option>
            <option value="auto">Auto approve after activation</option>
          </select>
        </label>
        <label>
          Paybill number
          <input
            type="text"
            value={values.paybillNumber}
            placeholder="Enter M-PESA paybill short code"
            onChange={(event) => onChange({ paybillNumber: event.target.value })}
          />
        </label>
        <label>
          Account reference label
          <input
            type="text"
            value={values.paybillAccountReference}
            placeholder="National ID"
            onChange={(event) => onChange({ paybillAccountReference: event.target.value })}
          />
        </label>
      </div>
    </article>
  );
}

function MessageSettings({ values, onChange }) {
  function updateTemplate(title, message) {
    onChange({
      templates: {
        ...values.templates,
        [title]: message
      }
    });
  }

  return (
    <article className="settings-card">
      <div className="settings-card-header">
        <div>
          <p className="eyebrow">Messages</p>
          <h3>SMS templates</h3>
        </div>
      </div>

      <div className="message-template-list">
        {smsTemplates.map(([title, message]) => (
          <label className="message-template" key={title}>
            {title}
            <textarea
              rows="3"
              value={values.templates[title] || message}
              onChange={(event) => updateTemplate(title, event.target.value)}
            />
          </label>
        ))}
      </div>
    </article>
  );
}

function WebsiteSettings({ values, onChange }) {
  return (
    <article className="settings-card">
      <div className="settings-card-header">
        <div>
          <p className="eyebrow">Website</p>
          <h3>Landing page content</h3>
        </div>
      </div>

      <div className="settings-form">
        <label>
          Brand name
          <input
            type="text"
            value={values.brand?.name || ""}
            onChange={(event) => onChange({ brand: { ...values.brand, name: event.target.value } })}
          />
        </label>
        <label>
          Brand meta
          <input
            type="text"
            value={values.brand?.meta || ""}
            onChange={(event) => onChange({ brand: { ...values.brand, meta: event.target.value } })}
          />
        </label>
        <label>
          Location label
          <input
            type="text"
            value={values.brand?.location || ""}
            onChange={(event) => onChange({ brand: { ...values.brand, location: event.target.value } })}
          />
        </label>
        <label>
          Hero kicker
          <input
            type="text"
            value={values.hero?.kicker || ""}
            onChange={(event) => onChange({ hero: { ...values.hero, kicker: event.target.value } })}
          />
        </label>
        <label>
          Hero title
          <input
            type="text"
            value={values.hero?.title || ""}
            onChange={(event) => onChange({ hero: { ...values.hero, title: event.target.value } })}
          />
        </label>
        <label>
          Hero subtitle
          <textarea
            rows="3"
            value={values.hero?.subtitle || ""}
            onChange={(event) => onChange({ hero: { ...values.hero, subtitle: event.target.value } })}
          />
        </label>
        <label>
          Hero visual title
          <input
            type="text"
            value={values.hero?.visualTitle || ""}
            onChange={(event) => onChange({ hero: { ...values.hero, visualTitle: event.target.value } })}
          />
        </label>
        <label>
          Hero visual text
          <textarea
            rows="3"
            value={values.hero?.visualText || ""}
            onChange={(event) => onChange({ hero: { ...values.hero, visualText: event.target.value } })}
          />
        </label>
        <label>
          Trust signals
          <textarea
            rows="3"
            value={toLineText(values.trustSignals)}
            onChange={(event) => onChange({ trustSignals: parseLineText(event.target.value) })}
            placeholder="One item per line"
          />
        </label>
        <label>
          Hero stats
          <textarea
            rows="4"
            value={toMetricText(values.heroStats)}
            onChange={(event) => onChange({ heroStats: parseMetricText(event.target.value) })}
            placeholder="Value | Label | Hint"
          />
        </label>
        <label>
          Paybill kicker
          <input
            type="text"
            value={values.paybill?.kicker || ""}
            onChange={(event) => onChange({ paybill: { ...values.paybill, kicker: event.target.value } })}
          />
        </label>
        <label>
          Paybill title
          <input
            type="text"
            value={values.paybill?.title || ""}
            onChange={(event) => onChange({ paybill: { ...values.paybill, title: event.target.value } })}
          />
        </label>
        <label>
          Paybill intro
          <textarea
            rows="3"
            value={values.paybill?.intro || ""}
            onChange={(event) => onChange({ paybill: { ...values.paybill, intro: event.target.value } })}
          />
        </label>
        <label>
          Paybill note
          <textarea
            rows="2"
            value={values.paybill?.note || ""}
            onChange={(event) => onChange({ paybill: { ...values.paybill, note: event.target.value } })}
          />
        </label>
        <label>
          Account reference label
          <input
            type="text"
            value={values.paybill?.accountReferenceLabel || ""}
            onChange={(event) => onChange({ paybill: { ...values.paybill, accountReferenceLabel: event.target.value } })}
          />
        </label>
        <label>
          About kicker
          <input
            type="text"
            value={values.about?.kicker || ""}
            onChange={(event) => onChange({ about: { ...values.about, kicker: event.target.value } })}
          />
        </label>
        <label>
          About title
          <input
            type="text"
            value={values.about?.title || ""}
            onChange={(event) => onChange({ about: { ...values.about, title: event.target.value } })}
          />
        </label>
        <label>
          About intro
          <textarea
            rows="3"
            value={values.about?.intro || ""}
            onChange={(event) => onChange({ about: { ...values.about, intro: event.target.value } })}
          />
        </label>
        <label>
          About main title
          <input
            type="text"
            value={values.about?.mainTitle || ""}
            onChange={(event) => onChange({ about: { ...values.about, mainTitle: event.target.value } })}
          />
        </label>
        <label>
          About main text
          <textarea
            rows="3"
            value={values.about?.mainText || ""}
            onChange={(event) => onChange({ about: { ...values.about, mainText: event.target.value } })}
          />
        </label>
        <label>
          About metrics
          <textarea
            rows="3"
            value={toMetricText(values.about?.metrics)}
            onChange={(event) => onChange({ about: { ...values.about, metrics: parseMetricText(event.target.value) } })}
            placeholder="Value | Label | Hint"
          />
        </label>
        <label>
          Product cards
          <textarea
            rows="5"
            value={toPairText(values.products?.cards)}
            onChange={(event) => onChange({ products: { ...values.products, cards: parsePairText(event.target.value, values.products?.cards?.map((card) => card.image || "")) } })}
            placeholder="Title | Text"
          />
        </label>
        <label>
          Product statement title
          <input
            type="text"
            value={values.products?.statementTitle || ""}
            onChange={(event) => onChange({ products: { ...values.products, statementTitle: event.target.value } })}
          />
        </label>
        <label>
          Product statement text
          <textarea
            rows="3"
            value={values.products?.statementText || ""}
            onChange={(event) => onChange({ products: { ...values.products, statementText: event.target.value } })}
          />
        </label>
        <label>
          Service highlights
          <textarea
            rows="4"
            value={toPairText(values.services?.highlights)}
            onChange={(event) => onChange({ services: { ...values.services, highlights: parsePairText(event.target.value, values.services?.highlights?.map((item) => item.image || "")) } })}
            placeholder="Title | Text"
          />
        </label>
        <label>
          Services kicker
          <input
            type="text"
            value={values.services?.visualKicker || ""}
            onChange={(event) => onChange({ services: { ...values.services, visualKicker: event.target.value } })}
          />
        </label>
        <label>
          Services visual title
          <input
            type="text"
            value={values.services?.visualTitle || ""}
            onChange={(event) => onChange({ services: { ...values.services, visualTitle: event.target.value } })}
          />
        </label>
        <label>
          Services visual text
          <textarea
            rows="3"
            value={values.services?.visualText || ""}
            onChange={(event) => onChange({ services: { ...values.services, visualText: event.target.value } })}
          />
        </label>
        <label>
          Workflow steps
          <textarea
            rows="4"
            value={toPairText(values.workflow?.steps)}
            onChange={(event) => onChange({ workflow: { ...values.workflow, steps: parsePairText(event.target.value) } })}
            placeholder="Title | Text"
          />
        </label>
        <label>
          Location details
          <textarea
            rows="4"
            value={toPairText(values.location?.details)}
            onChange={(event) => onChange({ location: { ...values.location, details: parsePairText(event.target.value) } })}
            placeholder="Label | Value"
          />
        </label>
        <label>
          Location statement title
          <input
            type="text"
            value={values.location?.statementTitle || ""}
            onChange={(event) => onChange({ location: { ...values.location, statementTitle: event.target.value } })}
          />
        </label>
        <label>
          Location statement text
          <textarea
            rows="3"
            value={values.location?.statementText || ""}
            onChange={(event) => onChange({ location: { ...values.location, statementText: event.target.value } })}
          />
        </label>
        <label>
          Contact title
          <input
            type="text"
            value={values.contact?.title || ""}
            onChange={(event) => onChange({ contact: { ...values.contact, title: event.target.value } })}
          />
        </label>
        <label>
          Contact page title
          <input
            type="text"
            value={values.contact?.pageTitle || ""}
            onChange={(event) => onChange({ contact: { ...values.contact, pageTitle: event.target.value } })}
          />
        </label>
        <label>
          Contact intro
          <textarea
            rows="2"
            value={values.contact?.intro || ""}
            onChange={(event) => onChange({ contact: { ...values.contact, intro: event.target.value } })}
          />
        </label>
        <label>
          Contact statement title
          <input
            type="text"
            value={values.contact?.statementTitle || ""}
            onChange={(event) => onChange({ contact: { ...values.contact, statementTitle: event.target.value } })}
          />
        </label>
        <label>
          Contact statement text
          <textarea
            rows="3"
            value={values.contact?.statementText || ""}
            onChange={(event) => onChange({ contact: { ...values.contact, statementText: event.target.value } })}
          />
        </label>
        <label>
          Contact phone
          <input
            type="text"
            value={values.contact?.phone || ""}
            onChange={(event) => onChange({ contact: { ...values.contact, phone: event.target.value } })}
          />
        </label>
        <label>
          Contact email
          <input
            type="text"
            value={values.contact?.email || ""}
            onChange={(event) => onChange({ contact: { ...values.contact, email: event.target.value } })}
          />
        </label>
        <label>
          Footer title
          <input
            type="text"
            value={values.footer?.title || ""}
            onChange={(event) => onChange({ footer: { ...values.footer, title: event.target.value } })}
          />
        </label>
        <label>
          Footer text
          <textarea
            rows="2"
            value={values.footer?.text || ""}
            onChange={(event) => onChange({ footer: { ...values.footer, text: event.target.value } })}
          />
        </label>
        <label>
          Footer location
          <input
            type="text"
            value={values.footer?.location || ""}
            onChange={(event) => onChange({ footer: { ...values.footer, location: event.target.value } })}
          />
        </label>
        <label>
          Footer phone
          <input
            type="text"
            value={values.footer?.phone || ""}
            onChange={(event) => onChange({ footer: { ...values.footer, phone: event.target.value } })}
          />
        </label>
        <label>
          Footer email
          <input
            type="text"
            value={values.footer?.email || ""}
            onChange={(event) => onChange({ footer: { ...values.footer, email: event.target.value } })}
          />
        </label>
      </div>
    </article>
  );
}
