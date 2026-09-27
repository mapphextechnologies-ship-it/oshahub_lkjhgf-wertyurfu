import { useEffect, useMemo, useState } from "react";
import { ScanFace, ShieldCheck } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog.jsx";
import { DataTable } from "../../components/ui/DataTable.jsx";
import { OtpActionButton } from "../../components/ui/OtpActionButton.jsx";
import { PageHeader } from "../../components/ui/PageHeader.jsx";
import { StatusBadge } from "../../components/ui/StatusBadge.jsx";
import { useAuth } from "../../features/auth/AuthContext.jsx";
import { useAdminData } from "../../features/admin/AdminDataContext.jsx";
import { getApplicationApprovalBlockers } from "../../lib/admin/applicationChecks.js";
import { findAgent, findBike, findCustomer } from "../../lib/admin/lookups.js";
import { formatKes } from "../../lib/formatting/currency.js";
import { adminApiRequest } from "../../../services/adminApiClient.js";

export default function ApplicationDetail() {
  const { applicationId } = useParams();
  const {
    agents,
    applications,
    auditLogs,
    bikes,
    deleteApplication,
    updateApplicationBikeAssignment,
    customers,
    verifyApplication,
    updateApplicationStatus,
    updateApplicationVerification
  } = useAdminData();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const [documentPreview, setDocumentPreview] = useState(null);
  const [pendingDecision, setPendingDecision] = useState(null);
  const [submittingDecision, setSubmittingDecision] = useState(false);
  const [applicationDetails, setApplicationDetails] = useState(null);

  const application = useMemo(() => {
    const baseApplication = applications.find((item) => item.id === applicationId);
    if (!baseApplication) return null;

    const documentList = applicationDetails?.documents || applicationDetails?.application?.documents || baseApplication.documents || [];
    return {
      ...baseApplication,
      ...(applicationDetails?.application || {}),
      documents: documentList
    };
  }, [applicationDetails, applicationId, applications]);
  const customer = useMemo(
    () => findCustomer(customers, application?.customerId),
    [application, customers]
  );
  const agent = findAgent(agents, application?.agentId);
  const bike = findBike(bikes, application?.bikeId);
  const activityLogs = auditLogs.filter(
    (log) => log.entityType === "customer_application" && log.entityId === application?.id
  );
  const assignableBikes = bikes.filter(
    (item) =>
      item.id === application?.bikeId ||
      item.status === "available" ||
      (item.status === "assigned" && (!item.assignedAgentId || item.assignedAgentId === agent?.id))
  );
  const [selectedBikeId, setSelectedBikeId] = useState(application?.bikeId || "");
  const [verification, setVerification] = useState(() => ({
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
    officerNotes: application?.verification?.officerNotes || ""
  }));
  const [verificationMessage, setVerificationMessage] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadApplicationDetails() {
      if (!applicationId) return;
      try {
        const data = await adminApiRequest(`/api/admin/applications/${encodeURIComponent(applicationId)}/details`);
        if (!cancelled) {
          setApplicationDetails(data);
        }
      } catch {
        if (!cancelled) {
          setApplicationDetails(null);
        }
      }
    }

    loadApplicationDetails();

    return () => {
      cancelled = true;
    };
  }, [applicationId]);

  useEffect(() => {
    setSelectedBikeId(application?.bikeId || "");
    setVerification({
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
      officerNotes: application?.verification?.officerNotes || ""
    });
  }, [application, customer]);

  if (!application || !customer) {
    return (
      <section className="page-stack">
        <PageHeader title="Application not found" description="The requested application does not exist." />
        <Link to="/admin/applications">Back to applications</Link>
      </section>
    );
  }

  async function submitStatus(status) {
    if (status === "approved") {
      const blockers = getApplicationApprovalBlockers(application);
      if (blockers.length > 0) {
        setMessage(`Cannot approve this application: ${blockers[0]}`);
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

  function requestDecision(status) {
    setPendingDecision(status);
  }

  async function confirmDecision() {
    if (!pendingDecision) {
      return;
    }

    await submitStatus(pendingDecision);
    setPendingDecision(null);
  }

  async function saveBikeAssignment() {
    const selectedBike = findBike(bikes, selectedBikeId);
    try {
      await updateApplicationBikeAssignment(application.id, selectedBikeId);
      setMessage(
        selectedBike
          ? `${selectedBike.serialNumber} saved for this application.`
          : "Bike assignment removed from this application."
      );
    } catch (error) {
      setMessage(error.message || "Could not save bike assignment.");
    }
  }

  function buildLocalVerification(currentVerification) {
    const normalizedScannedId = currentVerification.scannedNationalId.replace(/\s/g, "");
    const normalizedCustomerId = customer.nationalId.replace(/\s/g, "");
    const scannedName = currentVerification.scannedName.trim().toLowerCase();
    const customerName = customer.name.trim().toLowerCase();
    const duplicatePhone = customers.some(
      (item) => item.id !== customer.id && item.phone === customer.phone
    );

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
    const checkedBy = user?.name || user?.email || "Admin";
    const nextVerification = {
      ...buildLocalVerification(verification),
      checkedAt,
      checkedBy
    };
    setVerification(nextVerification);
    try {
      await updateApplicationVerification(application.id, nextVerification);
      setMessage("Local screening checks completed.");
      setVerificationMessage(`Local checks completed and saved on ${checkedAt}.`);
    } catch (error) {
      setMessage(error.message || "Could not save verification checks.");
    }
  }

  async function saveVerification() {
    const checkedAt = new Date().toISOString();
    const checkedBy = user?.name || user?.email || "Admin";
    const nextVerification = {
      ...verification,
      checkedAt,
      checkedBy
    };
    setVerification(nextVerification);
    try {
      await updateApplicationVerification(application.id, nextVerification);
      setMessage("Verification checklist saved.");
      setVerificationMessage(`Verification checklist saved on ${checkedAt}.`);
    } catch (error) {
      setMessage(error.message || "Could not save verification checklist.");
    }
  }

  async function verifyApplicationServerSide() {
    const checkedAt = new Date().toISOString();
    const checkedBy = user?.name || user?.email || "Admin";
    try {
      await verifyApplication(application.id, {
        ...buildLocalVerification(verification),
        checkedAt,
        checkedBy,
        status: "verified"
      });
      setMessage("Application verification saved on the server.");
    } catch (error) {
      setMessage(error.message || "Could not verify application.");
    }
  }

  async function removeApplication() {
    if (!window.confirm(`Delete application ${application.id}? This action cannot be undone.`)) {
      return;
    }

    try {
      await deleteApplication(application.id);
      navigate("/admin/applications");
    } catch (error) {
      setMessage(error.message || "Could not delete application.");
    }
  }

  return (
    <section className="page-stack">
      <PageHeader
        eyebrow="KYC review"
        title={application.id}
        description={`${customer.name} submitted by ${agent?.name || "Unknown agent"}`}
        actions={
          <div className="page-actions">
            <Link className="button secondary" to="/admin/applications">Back to applications</Link>
            <button className="button secondary" type="button" onClick={verifyApplicationServerSide}>
              Verify
            </button>
            <button className="button danger" type="button" onClick={removeApplication}>
              Delete
            </button>
            <StatusBadge status={application.status} />
          </div>
        }
      />

      {application.duplicateNationalId ? (
        <div className="alert danger">
          Duplicate national ID detected. Review existing customer records before approval.
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
            <div><dt>Date of birth</dt><dd>{customer.dateOfBirth}</dd></div>
            <div><dt>Gender</dt><dd>{customer.gender}</dd></div>
            <div><dt>Location</dt><dd>{customer.location}</dd></div>
            <div><dt>Occupation</dt><dd>{customer.occupation}</dd></div>
          </dl>
        </article>

        <article className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Inventory link</p>
              <h3>Bike and payment plan</h3>
            </div>
          </div>
          <dl className="detail-list">
            <div><dt>Bike model</dt><dd>{bike?.model || "Not assigned"}</dd></div>
            <div><dt>Serial number</dt><dd>{bike?.serialNumber || "Not assigned"}</dd></div>
            <div><dt>Deposit</dt><dd>{formatKes(application.depositAmount)}</dd></div>
            <div><dt>Installment plan</dt><dd>{application.installmentPlan}</dd></div>
            <div><dt>Submitted</dt><dd>{application.submittedAt}</dd></div>
          </dl>
          <div className="bike-assignment-form">
            <label>
              Assign bike
              <select
                value={selectedBikeId}
                onChange={(event) => setSelectedBikeId(event.target.value)}
              >
                <option value="">No bike assigned</option>
                {assignableBikes.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.serialNumber} - {item.model} ({item.status})
                  </option>
                ))}
              </select>
            </label>
            <button className="button secondary" type="button" onClick={saveBikeAssignment}>
              Save bike assignment
            </button>
          </div>
        </article>
      </div>

      <div className="detail-grid">
        <article className="panel">
          <h3>KYC documents</h3>
          <div className="document-grid">
            {(application.documents || []).map((document) => (
              <DocumentTile
                document={document}
                key={document.type}
                onPreview={() => setDocumentPreview(document)}
              />
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
            <div>
              <dt>OTP status</dt>
              <dd>
                <StatusBadge
                  status={application.nextOfKinOtpVerified ? "verified" : "not_verified"}
                />
              </dd>
            </div>
          </dl>
        </article>
      </div>

      <article className="panel verification-panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Verification checklist</p>
            <h3>ID, photo, OTP and phone checks</h3>
          </div>
          <ShieldCheck size={23} />
        </div>

        {application.verification?.checkedAt ? (
          <div className="alert soft">
            Last saved by {application.verification.checkedBy} on {application.verification.checkedAt}.
          </div>
        ) : null}

        {verificationMessage ? <div className="alert soft">{verificationMessage}</div> : null}

        <div className="verification-layout">
          <div className="verification-form">
            <label>
              Scanned ID name
              <input
                value={verification.scannedName}
                onChange={(event) =>
                  setVerification({ ...verification, scannedName: event.target.value })
                }
              />
            </label>
            <label>
              Scanned ID number
              <input
                value={verification.scannedNationalId}
                onChange={(event) =>
                  setVerification({ ...verification, scannedNationalId: event.target.value })
                }
              />
            </label>
            <label>
              Face/photo match
              <select
                value={verification.faceMatch}
                onChange={(event) =>
                  setVerification({ ...verification, faceMatch: event.target.value })
                }
              >
                <option value="manual_review">Manual review</option>
                <option value="likely_match">Likely match</option>
                <option value="mismatch">Mismatch</option>
              </select>
            </label>
            <label>
              SIM/phone ownership
              <select
                value={verification.simOwnership}
                onChange={(event) =>
                  setVerification({ ...verification, simOwnership: event.target.value })
                }
              >
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
          Verification notes
          <textarea
            rows="3"
            value={verification.officerNotes}
            onChange={(event) =>
              setVerification({ ...verification, officerNotes: event.target.value })
            }
            placeholder="Record any mismatch, unclear ID image, phone concern, or manual review note."
          />
        </label>

        <div className="decision-actions">
          <button className="button primary" type="button" onClick={runLocalVerification}>
            <ScanFace size={18} />
            Run local checks
          </button>
          <button className="button secondary" type="button" onClick={saveVerification}>
            Save verification
          </button>
        </div>
      </article>

      <article className="panel">
        <h3>Screening decision</h3>
        <label className="field-block">
          Decision note or rejection reason
          <textarea
            rows="4"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Record approval notes, rejection reason, or information required from the agent."
          />
        </label>
        <div className="decision-actions">
          <OtpActionButton className="button success" label={`approve ${application.id}`} disabled={submittingDecision} onVerified={() => requestDecision("approved")}>
            {submittingDecision ? "Working..." : "Approve"}
          </OtpActionButton>
          <OtpActionButton className="button warning" disabled={submittingDecision} label={`request information for ${application.id}`} onVerified={() => requestDecision("info_required")}>
            Request information
          </OtpActionButton>
          <OtpActionButton className="button danger" disabled={submittingDecision} label={`reject ${application.id}`} onVerified={() => requestDecision("rejected")}>
            Reject
          </OtpActionButton>
        </div>
      </article>

      <article className="panel">
        <h3>Activity history</h3>
        <DataTable
          columns={[
            { key: "createdAt", label: "Created" },
            { key: "actor", label: "Actor" },
            { key: "role", label: "Role" },
            { key: "action", label: "Action" }
          ]}
          rows={activityLogs}
          emptyMessage="No activity recorded for this application yet."
        />
      </article>

      {documentPreview ? (
        <div className="modal-backdrop" role="presentation">
          <section className="modal-panel kyc-preview-modal" role="dialog" aria-modal="true">
            <h3>{documentPreview.type}</h3>
            <div className="kyc-preview-frame">
              {documentPreview.url ? (
                <img src={documentPreview.url} alt={documentPreview.type} />
              ) : (
                <>
                  <span>{documentPreview.type}</span>
                  <small>{documentPreview.storagePath || "No document URL available"}</small>
                </>
              )}
            </div>
            <StatusBadge status={documentPreview.status} />
            <div className="page-actions">
              {documentPreview.url ? (
                <a className="button secondary" href={documentPreview.url} target="_blank" rel="noreferrer">
                  Open image
                </a>
              ) : null}
              <button className="button secondary" type="button" onClick={() => setDocumentPreview(null)}>
                Close
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {pendingDecision ? (
        <ConfirmDialog
          title="Confirm screening decision"
          message={`Save this application as ${pendingDecision.replaceAll("_", " ")}?`}
          confirmLabel="Save decision"
          tone={pendingDecision === "rejected" ? "danger" : pendingDecision === "info_required" ? "warning" : "success"}
          onCancel={() => setPendingDecision(null)}
          onConfirm={confirmDecision}
        />
      ) : null}
    </section>
  );
}

function CheckResult({ label, status }) {
  return (
    <div className="check-result">
      <span>{label}</span>
      <StatusBadge status={status} />
    </div>
  );
}

function DocumentTile({ document, onPreview }) {
  const [imageFailed, setImageFailed] = useState(false);
  const hasImage = Boolean(document.url) && !imageFailed;

  return (
    <div className="document-tile">
      <span>{document.type}</span>
      {hasImage ? (
        <img src={document.url} alt={document.type} onError={() => setImageFailed(true)} />
      ) : (
        <div className="document-empty-preview">Image unavailable</div>
      )}
      <StatusBadge status={hasImage ? document.status : "missing"} />
      <button className="button secondary" type="button" onClick={onPreview}>
        View
      </button>
    </div>
  );
}
