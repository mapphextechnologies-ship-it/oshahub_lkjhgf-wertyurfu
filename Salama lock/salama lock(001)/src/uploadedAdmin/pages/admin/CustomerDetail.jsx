import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { DataTable } from "../../components/ui/DataTable.jsx";
import { PageHeader } from "../../components/ui/PageHeader.jsx";
import { StatusBadge } from "../../components/ui/StatusBadge.jsx";
import { useAdminData } from "../../features/admin/AdminDataContext.jsx";
import { findAgent, findCustomer } from "../../lib/admin/lookups.js";
import { formatKes } from "../../lib/formatting/currency.js";
import { adminApiRequest } from "../../../services/adminApiClient.js";

export default function CustomerDetail() {
  const { customerId } = useParams();
  const { agents, applications, bikes, customers, payments = [] } = useAdminData();
  const [customerDetails, setCustomerDetails] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadCustomerDetails() {
      if (!customerId) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setLoadError("");

      try {
        const data = await adminApiRequest(`/api/admin/customers/${encodeURIComponent(customerId)}/details`);
        if (!cancelled) {
          setCustomerDetails(data);
        }
      } catch (error) {
        if (!cancelled) {
          setLoadError(error.message || "Failed to load customer details.");
          setCustomerDetails(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadCustomerDetails();

    return () => {
      cancelled = true;
    };
  }, [customerId]);

  const customer = customerDetails?.customer || findCustomer(customers, customerId);
  const application = customerDetails?.application || applications.find((item) => item.customerId === customer?.id);
  const bike = customerDetails?.bike || bikes.find((item) => item.assignedCustomerId === customer?.id);
  const customerPayments = customerDetails?.payments || payments.filter((payment) => payment.customerId === customer?.id);
  const documents = customerDetails?.documents || application?.documents || [];
  const agentName = customer?.agentName || findAgent(agents, customer?.agentId)?.name || "Unassigned";

  if (loading && !customer) {
    return (
      <section className="page-stack">
        <PageHeader title="Loading customer details..." description="Reading the latest customer record from the backend." />
        <div className="panel">Fetching customer data.</div>
      </section>
    );
  }

  if (!customer) {
    return (
      <section className="page-stack">
        <PageHeader title="Customer not found" description={loadError || "The requested customer does not exist."} />
        <Link to="/admin/customers">Back to customers</Link>
      </section>
    );
  }

  return (
    <section className="page-stack">
      <PageHeader
        eyebrow={customer.nationalId}
        title={customer.name}
        description={`${customer.phone} - ${customer.location}`}
        actions={
          <div className="page-actions">
            <Link className="button secondary" to="/admin/customers">Back to customers</Link>
            <StatusBadge status={customer.applicationStatus} />
          </div>
        }
      />

      {loadError && !customerDetails ? (
        <div className="panel" role="status">
          Could not reach the backend customer details endpoint. Showing the latest data already loaded in the portal.
        </div>
      ) : null}

      <div className="detail-grid">
        <article className="panel">
          <h3>Customer profile</h3>
          <dl className="detail-list">
            <div><dt>Phone</dt><dd>{customer.phone}</dd></div>
            <div><dt>Location</dt><dd>{customer.location}</dd></div>
            <div><dt>Occupation</dt><dd>{customer.occupation}</dd></div>
            <div><dt>Date of birth</dt><dd>{customer.dateOfBirth}</dd></div>
            <div><dt>Gender</dt><dd>{customer.gender}</dd></div>
            <div><dt>Agent</dt><dd>{agentName}</dd></div>
          </dl>
        </article>

        <article className="panel">
          <h3>Bike account</h3>
          <dl className="detail-list">
            <div><dt>Bike model</dt><dd>{bike?.model || "No bike assigned"}</dd></div>
            <div><dt>Serial number</dt><dd>{bike?.serialNumber || "No serial assigned"}</dd></div>
            <div><dt>Chassis number</dt><dd>{bike?.chassisNumber || "No chassis assigned"}</dd></div>
            <div><dt>Repayment status</dt><dd>{customer.repaymentStatus}</dd></div>
            <div><dt>Current balance</dt><dd>{formatKes(customer.balance)}</dd></div>
          </dl>
        </article>
      </div>

      <div className="detail-grid">
        <article className="panel">
          <h3>Next of kin</h3>
          <dl className="detail-list">
            <div><dt>Name</dt><dd>{application?.nextOfKin?.name || "Not captured"}</dd></div>
            <div><dt>Phone</dt><dd>{application?.nextOfKin?.phone || "Not captured"}</dd></div>
            <div><dt>Relationship</dt><dd>{application?.nextOfKin?.relationship || "Not captured"}</dd></div>
            <div>
              <dt>Verification</dt>
              <dd><StatusBadge status={application?.nextOfKinOtpVerified ? "verified" : "not_verified"} /></dd>
            </div>
          </dl>
        </article>

        <article className="panel">
          <h3>KYC record</h3>
          <dl className="detail-list">
            <div><dt>Application ref</dt><dd>{application?.id || "No application"}</dd></div>
            <div><dt>Deposit</dt><dd>{formatKes(application?.depositAmount || 0)}</dd></div>
            <div><dt>Installment plan</dt><dd>{application?.installmentPlan || "No plan selected"}</dd></div>
            <div>
              <dt>Customer OTP</dt>
              <dd><StatusBadge status={application?.customerOtpVerified ? "verified" : "not_verified"} /></dd>
            </div>
          </dl>
        </article>
      </div>

      <article className="panel">
        <h3>KYC documents</h3>
        <div className="document-grid">
          {documents.map((document) => (
            <DocumentTile document={document} key={document.type} />
          ))}
          {documents.length === 0 ? (
            <div className="document-tile">
              <span>No KYC documents captured</span>
              <StatusBadge status="missing" />
            </div>
          ) : null}
        </div>
      </article>

      <article className="panel">
        <h3>Payment history</h3>
        <DataTable
          columns={[
            { key: "receipt", label: "Receipt" },
            { key: "amount", label: "Amount", render: (row) => formatKes(row.amount) },
            { key: "status", label: "Status", render: (row) => <StatusBadge status={row.status} /> },
            { key: "paidAt", label: "Date" }
          ]}
          rows={customerPayments}
          emptyMessage="No payment records for this customer yet."
        />
      </article>
    </section>
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
