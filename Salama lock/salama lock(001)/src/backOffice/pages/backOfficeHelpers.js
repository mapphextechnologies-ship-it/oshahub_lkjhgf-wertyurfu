import { findAgent, findBike, findCustomer } from "../../uploadedAdmin/lib/admin/lookups.js";

export const activeScreeningStatuses = ["next_of_kin_pending", "pending_screening", "info_required"];
export const completedScreeningStatuses = ["approved", "rejected"];

export function getScreeningRows({ agents, applications, bikes, customers, statuses }) {
  return applications
    .filter((application) => statuses.includes(application.status))
    .map((application) => ({
      ...application,
      nextOfKinOtpVerified: Boolean(application.nextOfKinOtpVerified || application.verification?.nextOfKinOtpVerified),
      agent: findAgent(agents, application.agentId),
      bike: findBike(bikes, application.bikeId),
      customer: findCustomer(customers, application.customerId)
    }));
}

export function matchesScreeningQuery(row, query) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return true;

  return [
    row.id,
    row.status,
    row.customer?.name,
    row.customer?.nationalId,
    row.customer?.phone,
    row.agent?.name,
    row.bike?.serialNumber
  ]
    .join(" ")
    .toLowerCase()
    .includes(normalizedQuery);
}
