import { useState } from "react";

export function ConfirmDialog({ title, message, confirmLabel = "Confirm", tone = "primary", onCancel, onConfirm }) {
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  async function handleConfirm() {
    setErrorMessage("");
    setSubmitting(true);
    try {
      await onConfirm();
    } catch (error) {
      setErrorMessage(error.message || "Could not complete this action.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal-panel" role="dialog" aria-modal="true" aria-labelledby="confirm-dialog-title">
        <h3 id="confirm-dialog-title">{title}</h3>
        <p>{message}</p>
        {errorMessage ? <p className="form-error">{errorMessage}</p> : null}
        <div className="page-actions">
          <button className="button secondary" type="button" disabled={submitting} onClick={onCancel}>
            Cancel
          </button>
          <button className={`button ${tone}`} type="button" disabled={submitting} onClick={handleConfirm}>
            {submitting ? "Working..." : confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}
