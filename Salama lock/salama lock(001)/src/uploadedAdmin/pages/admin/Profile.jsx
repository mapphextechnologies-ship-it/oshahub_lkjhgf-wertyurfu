import { useState } from "react";
import { LockKeyhole, UserRound } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "../../components/ui/PageHeader.jsx";
import { useAuth } from "../../features/auth/AuthContext.jsx";

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

function compressImageFile(file, { maxSize = 720, quality = 0.82 } = {}) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) {
      reject(new Error("Choose a valid image file."));
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const image = new Image();
      image.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        const context = canvas.getContext("2d");
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL("image/jpeg", quality);
        if (dataUrl.length > MAX_IMAGE_BYTES * 1.4) {
          reject(new Error("Image is too large. Use a smaller or clearer JPG/PNG."));
          return;
        }
        resolve(dataUrl);
      };
      image.onerror = () => reject(new Error("Could not read that image."));
      image.src = String(reader.result || "");
    };
    reader.onerror = () => reject(new Error("Could not read that image."));
    reader.readAsDataURL(file);
  });
}

export default function Profile() {
  const navigate = useNavigate();
  const { updatePassword, updateProfile, user } = useAuth();
  const [form, setForm] = useState({
    name: user?.name || "",
    email: user?.email || "",
    phone: user?.phone || "",
    photoUrl: user?.photoUrl || "",
    logoUrl: user?.logoUrl || ""
  });
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: ""
  });
  const [message, setMessage] = useState("");
  const [passwordMessage, setPasswordMessage] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);

  async function handleImageChange(event, field, options) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      if (file.size > 8 * 1024 * 1024) {
        throw new Error("Image is too large. Choose an image under 8 MB.");
      }
      const dataUrl = await compressImageFile(file, options);
      setForm((current) => ({ ...current, [field]: dataUrl }));
      setMessage(`${field === "logoUrl" ? "Logo" : "Profile photo"} ready. Save profile to apply it.`);
    } catch (error) {
      setMessage(error.message);
    } finally {
      event.target.value = "";
    }
  }

  async function handleSave() {
    const result = await updateProfile(form);
    setMessage(result.message || (result.ok ? "Profile saved. The header has been updated." : "Profile could not be saved."));
  }

  async function handlePasswordUpdate(event) {
    event.preventDefault();
    setPasswordSaving(true);
    setPasswordMessage("");

    const result = await updatePassword(passwordForm);
    setPasswordSaving(false);
    setPasswordMessage(result.message);

    if (result.ok) {
      setPasswordForm({
        currentPassword: "",
        newPassword: "",
        confirmPassword: ""
      });
    }
  }

  return (
    <section className="page-stack">
      <PageHeader
        eyebrow="Account"
        title="Admin profile"
        description="Manage the signed-in admin account details used across the back office."
      />

      {message ? <div className="alert soft">{message}</div> : null}

      <div className="detail-grid">
        <article className="panel">
          <div className="settings-card-header">
            <div>
              <p className="eyebrow">Profile</p>
              <h3>Account details</h3>
            </div>
            <UserRound size={22} />
          </div>

          <div className="profile-photo-row">
            <div className="profile-photo-preview">
              {form.photoUrl ? <img src={form.photoUrl} alt="Profile preview" /> : <UserRound size={36} />}
            </div>
            <label className="upload-control">
              Profile photo
              <input type="file" accept="image/png,image/jpeg,image/jpg,image/webp" onChange={(event) => handleImageChange(event, "photoUrl", { maxSize: 720, quality: 0.82 })} />
              <span>Upload JPG or PNG</span>
            </label>
          </div>

          <div className="profile-photo-row">
            <div className="profile-photo-preview logo-preview">
              {form.logoUrl ? <img src={form.logoUrl} alt="Logo preview" /> : <UserRound size={30} />}
            </div>
            <label className="upload-control">
              Company logo
              <input type="file" accept="image/png,image/jpeg,image/jpg,image/webp" onChange={(event) => handleImageChange(event, "logoUrl", { maxSize: 420, quality: 0.86 })} />
              <span>Upload logo image</span>
            </label>
          </div>

          <div className="settings-form">
            <label>
              Full name
              <input
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
              />
            </label>
            <label>
              Email
              <input
                type="email"
                value={form.email}
                onChange={(event) => setForm({ ...form, email: event.target.value })}
              />
            </label>
            <label>
              Phone
              <input
                value={form.phone}
                onChange={(event) => setForm({ ...form, phone: event.target.value })}
              />
            </label>
            <label>
              Role
              <input value={user?.role?.replaceAll("_", " ") || ""} readOnly />
            </label>
          </div>
        </article>

        <article className="panel">
          <div className="settings-card-header">
            <div>
              <p className="eyebrow">Security</p>
              <h3>Password and session</h3>
            </div>
            <LockKeyhole size={22} />
          </div>

          <form className="password-form" onSubmit={handlePasswordUpdate}>
            <label>
              Current password
              <input
                autoComplete="current-password"
                type="password"
                value={passwordForm.currentPassword}
                onChange={(event) =>
                  setPasswordForm({ ...passwordForm, currentPassword: event.target.value })
                }
              />
            </label>
            <label>
              New password
              <input
                autoComplete="new-password"
                minLength="8"
                required
                type="password"
                value={passwordForm.newPassword}
                onChange={(event) =>
                  setPasswordForm({ ...passwordForm, newPassword: event.target.value })
                }
              />
            </label>
            <label>
              Confirm password
              <input
                autoComplete="new-password"
                minLength="8"
                required
                type="password"
                value={passwordForm.confirmPassword}
                onChange={(event) =>
                  setPasswordForm({ ...passwordForm, confirmPassword: event.target.value })
                }
              />
            </label>
            {passwordMessage ? <div className="alert soft inline-alert">{passwordMessage}</div> : null}
            <div className="page-actions">
              <button className="button primary" type="submit" disabled={passwordSaving}>
                {passwordSaving ? "Updating..." : "Update password"}
              </button>
              <button className="button secondary" type="button" onClick={() => navigate("/reset-password")}>
                Reset by email
              </button>
            </div>
          </form>
        </article>
      </div>

      <div className="page-actions">
        <button className="button primary" type="button" onClick={handleSave}>Save profile</button>
      </div>
    </section>
  );
}
