import { Camera, KeyRound, LockKeyhole, Smartphone, UserRound } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "../../uploadedAdmin/features/auth/AuthContext.jsx";
import { useState } from "react";

function initialsFor(name) {
  return String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "--";
}

export default function BackOfficeProfile() {
  const { updateProfile, user } = useAuth();
  const portalRoleLabel = "back office";
  const [form, setForm] = useState({
    name: user?.name || "",
    email: user?.email || "",
    phone: user?.phone || "",
    photoUrl: user?.photoUrl || ""
  });
  const [message, setMessage] = useState("");

  function handlePhotoChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setForm((current) => ({ ...current, photoUrl: String(reader.result || "") }));
      setMessage("Profile picture updated.");
    };
    reader.readAsDataURL(file);
  }

  async function saveProfile() {
    const result = await updateProfile(form);
    setMessage(result.message || (result.ok ? "Profile saved successfully." : "Profile could not be saved."));
  }

  return (
    <section className="finance-style-page">
      <div className="finance-style-shell">
        <div className="finance-style-header">
          <div className="finance-style-activity-line">
            <span className="finance-style-dot" />
            <p className="finance-style-eyebrow">Me activity</p>
          </div>
          <h2>Profile</h2>
          {message ? <p className="finance-style-notice">{message}</p> : null}
        </div>

        <article className="finance-style-profile-panel">
          <div className="finance-style-avatar">
            {form.photoUrl ? <img src={form.photoUrl} alt="Profile preview" /> : <span>{initialsFor(form.name)}</span>}
          </div>
          <div className="finance-style-profile-info">
            <strong>{form.name || user?.email || "Back Office user"}</strong>
            <span>{portalRoleLabel}</span>
          </div>
          <label className="button secondary">
            <Camera size={17} />
            {form.photoUrl ? "Update profile picture" : "Add profile picture"}
            <input type="file" accept="image/png,image/jpeg,image/jpg" hidden onChange={handlePhotoChange} />
          </label>
        </article>

        <FinanceGroup title="Profile">
          <FinanceEditableRow icon={UserRound} label="Name" value={form.name} onChange={(value) => setForm({ ...form, name: value })} />
          <FinanceEditableRow icon={UserRound} label="Email" value={form.email} onChange={(value) => setForm({ ...form, email: value })} type="email" />
          <FinanceEditableRow icon={Smartphone} label="Phone" value={form.phone} onChange={(value) => setForm({ ...form, phone: value })} />
          <FinanceStaticRow icon={LockKeyhole} label="Role" value={portalRoleLabel} />
          <div className="finance-style-save-row">
            <button className="finance-style-save-button" type="button" onClick={saveProfile}>Save</button>
          </div>
        </FinanceGroup>

        <FinanceGroup title="Account">
          <FinanceLinkRow icon={KeyRound} label="Password and OTP" value="Change password" to="/backoffice/reset-password" />
          <FinanceStaticRow icon={LockKeyhole} label="App access" value="Back Office only" />
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

function FinanceEditableRow({ icon: Icon, label, value, onChange, type = "text" }) {
  return (
    <div className="finance-style-row">
      <span className="finance-style-icon blue"><Icon size={18} /></span>
      <label>{label}</label>
      <input type={type} value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}

function FinanceStaticRow({ icon: Icon, label, value }) {
  return (
    <div className="finance-style-row">
      <span className="finance-style-icon green"><Icon size={18} /></span>
      <label>{label}</label>
      <strong>{value}</strong>
    </div>
  );
}

function FinanceLinkRow({ icon: Icon, label, value, to }) {
  return (
    <Link className="finance-style-row finance-style-link-row" to={to}>
      <span className="finance-style-icon blue"><Icon size={18} /></span>
      <label>{label}</label>
      <strong>{value}</strong>
    </Link>
  );
}
