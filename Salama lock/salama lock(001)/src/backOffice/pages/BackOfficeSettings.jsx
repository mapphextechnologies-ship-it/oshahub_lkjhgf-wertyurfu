import { Bell, CheckCircle2, Clock3, KeyRound, LockKeyhole, MessageSquareText, RefreshCw, ShieldCheck, Smartphone } from "lucide-react";
import { useEffect, useState } from "react";

const storageKey = "SALAMA LOCK-backoffice-settings";
const defaultSettings = {
  queueRefresh: "Manual",
  layout: "App view",
  approvalAlerts: true,
  duplicateAlerts: true,
  infoAlerts: true,
  otpActions: true,
  sessionTimeout: "30 minutes",
  nextOfKinConfirm: true
};

function loadSettings() {
  try {
    const value = window.localStorage.getItem(storageKey);
    return value ? { ...defaultSettings, ...JSON.parse(value) } : defaultSettings;
  } catch {
    return defaultSettings;
  }
}

export default function BackOfficeSettings() {
  const [settings, setSettings] = useState(defaultSettings);
  const [message, setMessage] = useState("");

  useEffect(() => {
    setSettings(loadSettings());
  }, []);

  function update(key, value) {
    setSettings((current) => ({ ...current, [key]: value }));
  }

  function saveSettings() {
    window.localStorage.setItem(storageKey, JSON.stringify(settings));
    setMessage("Settings saved successfully.");
  }

  return (
    <section className="finance-style-page">
      <div className="finance-style-shell">
        <div className="finance-style-header">
          <div className="finance-style-activity-line">
            <span className="finance-style-dot" />
            <p className="finance-style-eyebrow">Me activity</p>
          </div>
          <h2>Settings</h2>
          {message ? <p className="finance-style-notice">{message}</p> : null}
        </div>

        <FinanceGroup title="Appearance">
          <div className="finance-style-row finance-style-row-wrap">
            <span className="finance-style-icon violet"><Smartphone size={18} /></span>
            <label>App layout</label>
            <div className="finance-style-segmented">
              {["App view", "Compact"].map((option) => (
                <button
                  className={settings.layout === option ? "is-active" : ""}
                  key={option}
                  type="button"
                  onClick={() => update("layout", option)}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>
          <SelectRow icon={RefreshCw} label="Queue refresh" value={settings.queueRefresh} options={["Manual", "15 seconds", "60 seconds"]} onChange={(value) => update("queueRefresh", value)} />
        </FinanceGroup>

        <FinanceGroup title="Notifications">
          <ToggleRow icon={Bell} label="Approval decision alerts" checked={settings.approvalAlerts} onChange={(value) => update("approvalAlerts", value)} />
          <ToggleRow icon={ShieldCheck} label="Duplicate ID alerts" checked={settings.duplicateAlerts} onChange={(value) => update("duplicateAlerts", value)} tone="red" />
          <ToggleRow icon={MessageSquareText} label="Info required alerts" checked={settings.infoAlerts} onChange={(value) => update("infoAlerts", value)} tone="amber" />
        </FinanceGroup>

        <FinanceGroup title="Security">
          <StaticRow icon={ShieldCheck} label="App access" value="Back Office only" tone="green" />
          <ToggleRow icon={KeyRound} label="OTP for decisions" checked={settings.otpActions} onChange={(value) => update("otpActions", value)} tone="amber" />
          <ToggleRow icon={CheckCircle2} label="Next-of-kin confirmation" checked={settings.nextOfKinConfirm} onChange={(value) => update("nextOfKinConfirm", value)} tone="green" />
          <SelectRow icon={Clock3} label="Session timeout" value={settings.sessionTimeout} options={["15 minutes", "30 minutes", "1 hour"]} onChange={(value) => update("sessionTimeout", value)} tone="red" />
        </FinanceGroup>

        <FinanceGroup title="Account">
          <StaticRow icon={LockKeyhole} label="Device session" value="Temporary only" />
          <div className="finance-style-save-row">
            <button className="finance-style-save-button" type="button" onClick={saveSettings}>Save</button>
          </div>
        </FinanceGroup>
      </div>
    </section>
  );
}

function FinanceGroup({ title, children }) {
  return (
    <section className="finance-style-group">
      <h3>{title}</h3>
      <div className="finance-style-list">{children}</div>
    </section>
  );
}

function toneClass(tone = "blue") {
  return `finance-style-icon ${tone}`;
}

function ToggleRow({ icon: Icon, label, checked, onChange, tone = "blue" }) {
  return (
    <button className={`finance-style-row finance-style-switch-row ${checked ? "is-on" : ""}`} type="button" onClick={() => onChange(!checked)}>
      <span className={toneClass(checked ? "blue" : tone)}><Icon size={18} /></span>
      <label>{label}</label>
      <span className="finance-style-switch-wrap">
        <em>{checked ? "On" : "Off"}</em>
        <i><b /></i>
      </span>
    </button>
  );
}

function SelectRow({ icon: Icon, label, value, options, onChange, tone = "blue" }) {
  return (
    <div className="finance-style-row">
      <span className={toneClass(tone)}><Icon size={18} /></span>
      <label>{label}</label>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </div>
  );
}

function StaticRow({ icon: Icon, label, value, tone = "blue" }) {
  return (
    <div className="finance-style-row">
      <span className={toneClass(tone)}><Icon size={18} /></span>
      <label>{label}</label>
      <strong>{value}</strong>
    </div>
  );
}
