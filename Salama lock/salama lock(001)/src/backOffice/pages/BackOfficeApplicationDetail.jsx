import { useEffect, useMemo, useState } from "react";
import { ScanFace, ShieldCheck } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { ConfirmDialog } from "../../uploadedAdmin/components/ui/ConfirmDialog.jsx";
import { OtpActionButton } from "../../uploadedAdmin/components/ui/OtpActionButton.jsx";
import { PageHeader } from "../../uploadedAdmin/components/ui/PageHeader.jsx";
import { StatusBadge } from "../../uploadedAdmin/components/ui/StatusBadge.jsx";
import { useAuth } from "../../uploadedAdmin/features/auth/AuthContext.jsx";
import { useAdminData } from "../../uploadedAdmin/features/admin/AdminDataContext.jsx";
import { getApplicationApprovalBlockers } from "../../uploadedAdmin/lib/admin/applicationChecks.js";
import { findAgent, findBike, findCustomer } from "../../uploadedAdmin/lib/admin/lookups.js";
import { formatKes } from "../../uploadedAdmin/lib/formatting/currency.js";

export default function BackOfficeApplicationDetail() {
  const { applicationId } = useParams();
  const {
    agents,
    applications,
    bikes,
    customers,
    updateApplicationBikeAssignment,
    updateApplicationStatus,
    updateApplicationVerification
  } = useAdminData();
  const { user } = useAuth();
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const [selectedBikeId, setSelectedBikeId] = useState("");
  const [pendingDecision, setPendingDecision] = useState(null);
  const [submittingDecision, setSubmittingDecision] = useState(false);

  const application = applications.find((item) => item.id === applicationId);
  const customer = useMemo(
    () => findCustomer(customers, application?.customerId),
    [application, customers]
  );
  const agent = findAgent(agents, application?.agentId);
  const bike = findBike(bikes, application?.bikeId);
  const assignableBikes = bikes.filter(
    (item) =>
      item.id === application?.bikeId ||
      item.status === "available" ||
      (item.status === "assigned" && (!item.assignedAgentId || item.assignedAgentId === agent?.id))
  );
  const [verification, setVerification] = useState(() => buildVerificationState(application, customer));

  useEffect(() => {
    setSelectedBikeId(application?.bikeId || "");
    setVerification(buildVerificationState(application, customer));
  }, [application, customer]);

  if (!application || !customer) {
    return (
      <section className="page-stack">
        <PageHeader title="Screening case not found" description="The requested screening case does not exist." />
        <Link to="/backoffice/screening">Back to screening queue</Link>
      </section>
    );
  }

  async function submitStatus(status) {
    if (status === "approved") {
      const blockers = getApplicationApprovalBlockers(application);
      if (blockers.length > 0) {
        setMessage(`This case cannot be approved yet: ${blockers[0]}`);
        return;
      }
    }

    setSubmittingDecision(true);
    try {
      await updateApplicationStatus(application.id, status, note);
      setNote("");
      setMessage(`Screening decision saved as ${status.replaceAll("_", " ")}.`);
    } catch (error) {
      setMessage(error.message || "Could not save screening decision.");
    } finally {
      setSubmittingDecision(false);
    }
  }

  async function confirmDecision() {
    if (!pendingDecision) return;
    await submitStatus(pendingDecision);
    setPendingDecision(null);
  }

  function buildLocalVerification(currentVerification) {
    const normalizedScannedId = currentVerification.scannedNationalId.replace(/\s/g, "");
    const normalizedCustomerId = customer.nationalId.replace(/\s/g, "");
    const scannedName = currentVerification.scannedName.trim().toLowerCase();
    const customerName = customer.name.trim().toLowerCase();
    const duplicatePhone = customers.some((item) => item.id !== customer.id && item.phone === customer.phone);

    return {
      ...currentVerification,
      idNumberMatch: normalizedScannedId === normalizedCustomerId ? "matched" : "mismatch",
      nameMatch:
        scannedName && (customerName.includes(scannedName) || scannedName.includes(customerName))
          ? "matched"
          : "manual_review",
      phoneDuplicate: duplicatePhone ? "duplicate" : "clear"
    };
  }

  async function runLocalVerification() {
    const checkedAt = new Date().toISOString();
    const checkedBy = user?.name || user?.email || "Back office";
    const nextVerification = {
      ...buildLocalVerification(verification),
      checkedAt,
      checkedBy
    };
    setVerification(nextVerification);
    try {
      await updateApplicationVerification(application.id, nextVerification);
      setMessage("Screening checks completed and saved.");
    } catch (error) {
      setMessage(error.message || "Could not save screening checks.");
    }
  }

  async function saveVerification() {
    const checkedAt = new Date().toISOString();
    const checkedBy = user?.name || user?.email || "Back office";
    const nextVerification = {
      ...verification,
      checkedAt,
      checkedBy
    };
    setVerification(nextVerification);
    try {
      await updateApplicationVerification(application.id, nextVerification);
      setMessage("Screening checklist saved.");
    } catch (error) {
      setMessage(error.message || "Could not save screening checklist.");
    }
  }

  async function saveBikeAssignment() {
    const selectedBike = findBike(bikes, selectedBikeId);
    try {
      await updateApplicationBikeAssignment(application.id, selectedBikeId);
      setMessage(
        selectedBike
          ? `${selectedBike.serialNumber} reserved for this customer.`
          : "Bike reservation removed from this application."
      );
    } catch (error) {
      setMessage(error.message || "Could not save bike assignment.");
    }
  }

  return (
    <section className="page-stack">
      <PageHeader
        eyebrow="Screening case"
        title={application.id}
        description={`${customer.name} submitted by ${agent?.name || "agent record"}`}
        actions={
          <div className="page-actions">
            <Link className="button secondary" to="/backoffice/screening">Back to queue</Link>
            <StatusBadge status={application.status} />
          </div>
        }
      />

      {application.duplicateNationalId ? (
        <div className="alert danger">
          Duplicate national ID detected. Review the customer record carefully before approval.
        </div>
      ) : null}

      {message ? <div className="alert soft">{message}</div> : null}

      <div className="detail-grid">
        <article className="panel">
          <h3>Customer details</h3>
          <dl className="detail-list">
            <div><dt>Full name</dt><dd>{customer.name}</dd></div>
            <div><dt>National ID</dt><dd>{customer.nationalId}</dd></div>
            <div><dt>Phone</dt><dd>{customer.phone}</dd></div>
            <div><dt>Date of birth</dt><dd>{customer.dateOfBirth || "Not captured"}</dd></div>
            <div><dt>Gender</dt><dd>{customer.gender || "Not captured"}</dd></div>
            <div><dt>Location</dt><dd>{customer.location || "Not captured"}</dd></div>
            <div><dt>Occupation</dt><dd>{customer.occupation || "Not captured"}</dd></div>
          </dl>
        </article>

        <article className="panel">
          <h3>Application summary</h3>
          <dl className="detail-list">
            <div><dt>Product</dt><dd>{bike?.model || "Product pending"}</dd></div>
            <div><dt>Product reference</dt><dd>{bike?.serialNumber || "Not captured"}</dd></div>
            <div><dt>Deposit</dt><dd>{formatKes(application.depositAmount)}</dd></div>
            <div><dt>Payment plan</dt><dd>{application.installmentPlan}</dd></div>
            <div><dt>Submitted</dt><dd>{application.submittedAt || "Recent submission"}</dd></div>
            <div><dt>Customer OTP</dt><dd><StatusBadge status={application.customerOtpVerified ? "verified" : "not_verified"} /></dd></div>
          </dl>
          <div className="bike-assignment-form">
            <label>
              Reserve bike
              <select value={selectedBikeId} onChange={(event) => setSelectedBikeId(event.target.value)}>
                <option value="">No bike assigned</option>
                {assignableBikes.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.serialNumber} - {item.model} ({item.status})
                  </option>
                ))}
              </select>
            </label>
            <button className="button secondary" type="button" onClick={saveBikeAssignment}>
              Save bike reservation
            </button>
          </div>
        </article>
      </div>

      <div className="detail-grid">
        <article className="panel">
          <h3>KYC documents</h3>
          <div className="document-grid">
            {(application.documents || []).map((document) => (
              <DocumentTile document={document} key={document.type} />
            ))}
            {(application.documents || []).length === 0 ? (
              <div className="document-tile">
                <span>No KYC documents captured</span>
                <StatusBadge status="missing" />
              </div>
            ) : null}
          </div>
        </article>

        <article className="panel">
          <h3>Next of kin</h3>
          <dl className="detail-list">
            <div><dt>Name</dt><dd>{application.nextOfKin?.name || "Not captured"}</dd></div>
            <div><dt>Phone</dt><dd>{application.nextOfKin?.phone || "Not captured"}</dd></div>
            <div><dt>Relationship</dt><dd>{application.nextOfKin?.relationship || "Not captured"}</dd></div>
            <div><dt>OTP status</dt><dd><StatusBadge status={application.nextOfKinOtpVerified ? "verified" : "not_verified"} /></dd></div>
          </dl>
        </article>
      </div>

      <article className="panel verification-panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Screening checklist</p>
            <h3>ID, photo, OTP and phone checks</h3>
          </div>
          <ShieldCheck size={23} />
        </div>

        {verification.checkedAt ? (
          <div className="alert soft">
            Last saved by {verification.checkedBy || "unknown"} on {verification.checkedAt}.
          </div>
        ) : null}

        <div className="verification-layout">
          <div className="verification-form">
            <label>
              Scanned ID name
              <input value={verification.scannedName} onChange={(event) => setVerification({ ...verification, scannedName: event.target.value })} />
            </label>
            <label>
              Scanned ID number
              <input value={verification.scannedNationalId} onChange={(event) => setVerification({ ...verification, scannedNationalId: event.target.value })} />
            </label>
            <label>
              Face/photo match
              <select value={verification.faceMatch} onChange={(event) => setVerification({ ...verification, faceMatch: event.target.value })}>
                <option value="manual_review">Manual review</option>
                <option value="likely_match">Likely match</option>
                <option value="mismatch">Mismatch</option>
              </select>
            </label>
            <label>
              SIM/phone ownership
              <select value={verification.simOwnership} onChange={(event) => setVerification({ ...verification, simOwnership: event.target.value })}>
                <option value="otp_only">Verified by OTP only</option>
                <option value="needs_provider_check">Needs provider check</option>
                <option value="provider_matched">Provider matched</option>
                <option value="provider_mismatch">Provider mismatch</option>
              </select>
            </label>
          </div>

          <div className="verification-results">
            <CheckResult label="ID number" status={verification.idNumberMatch} />
            <CheckResult label="Customer name" status={verification.nameMatch} />
            <CheckResult label="Face/photo" status={verification.faceMatch} />
            <CheckResult label="Customer OTP" status={verification.phoneOtp} />
            <CheckResult label="Next-of-kin OTP" status={verification.nextOfKinOtp} />
            <CheckResult label="Phone duplicate" status={verification.phoneDuplicate} />
            <CheckResult label="Duplicate ID" status={application.duplicateNationalId ? "duplicate" : "clear"} />
            <CheckResult label="SIM ownership" status={verification.simOwnership} />
          </div>
        </div>

        <label className="field-block">
          Screening notes
          <textarea
            rows="3"
            value={verification.officerNotes}
            onChange={(event) => setVerification({ ...verification, officerNotes: event.target.value })}
            placeholder="Record any mismatch, unclear ID image, phone concern, or manual review note."
          />
        </label>

        <div className="decision-actions">
          <button className="button primary" type="button" onClick={runLocalVerification}>
            <ScanFace size={18} />
            Run checks
          </button>
          <button className="button secondary" type="button" onClick={saveVerification}>
            Save checklist
          </button>
        </div>
      </article>

      <article className="panel">
        <h3>Screening decision</h3>
        <label className="field-block">
          Decision note
          <textarea
            rows="4"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Record approval notes, rejection reason, or information required from the agent."
          />
        </label>
        <div className="decision-actions">
          <OtpActionButton className="button success" label={`approve ${application.id}`} disabled={submittingDecision} onVerified={() => setPendingDecision("approved")}>
            {submittingDecision ? "Working..." : "Approve"}
          </OtpActionButton>
          <OtpActionButton className="button warning" disabled={submittingDecision} label={`request information for ${application.id}`} onVerified={() => setPendingDecision("info_required")}>
            Request information
          </OtpActionButton>
          <OtpActionButton className="button danger" disabled={submittingDecision} label={`reject ${application.id}`} onVerified={() => setPendingDecision("rejected")}>
            Reject
          </OtpActionButton>
        </div>
      </article>

      {pendingDecision ? (
        <ConfirmDialog
          title="Confirm screening decision"
          message={`Save this case as ${pendingDecision.replaceAll("_", " ")}?`}
          confirmLabel="Save decision"
          tone={pendingDecision === "rejected" ? "danger" : pendingDecision === "info_required" ? "warning" : "success"}
          onCancel={() => setPendingDecision(null)}
          onConfirm={confirmDecision}
        />
      ) : null}
    </section>
  );
}

function buildVerificationState(application, customer) {
  return {
    scannedName: application?.verification?.scannedName || customer?.name || "",
    scannedNationalId: application?.verification?.scannedNationalId || customer?.nationalId || "",
    idNumberMatch: application?.verification?.idNumberMatch || "not_checked",
    nameMatch: application?.verification?.nameMatch || "not_checked",
    faceMatch: application?.verification?.faceMatch || "manual_review",
    phoneOtp: application?.verification?.phoneOtp || (application?.customerOtpVerified ? "verified" : "failed"),
    nextOfKinOtp:
      application?.verification?.nextOfKinOtp ||
      (application?.nextOfKinOtpVerified ? "verified" : "failed"),
    phoneDuplicate: application?.verification?.phoneDuplicate || "clear",
    simOwnership: application?.verification?.simOwnership || "otp_only",
    officerNotes: application?.verification?.officerNotes || "",
    checkedAt: application?.verification?.checkedAt || "",
    checkedBy: application?.verification?.checkedBy || ""
  };
}

function CheckResult({ label, status }) {
  return (
    <div className="check-result">
      <span>{label}</span>
      <StatusBadge status={status} />
    </div>
  );
}

function DocumentTile({ document }) {
  const [imageFailed, setImageFailed] = useState(false);
  const hasImage = Boolean(document.url) && !imageFailed;

  return (
    <div className="document-tile">
      <span>{document.type}</span>
      {hasImage ? (
        <a href={document.url} target="_blank" rel="noreferrer" aria-label={`Open ${document.type}`}>
          <img src={document.url} alt={document.type} onError={() => setImageFailed(true)} />
        </a>
      ) : (
        <div className="document-empty-preview">Image unavailable</div>
      )}
      <StatusBadge status={hasImage ? document.status : "missing"} />
    </div>
  );
}
