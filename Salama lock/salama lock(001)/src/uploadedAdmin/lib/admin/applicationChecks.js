export function getApplicationApprovalBlockers(application) {
  if (!application) {
    return ["Application record is missing."];
  }

  const blockers = [];
  const documents = Array.isArray(application.documents) ? application.documents : [];
  const verification = application.verification || {};

  if (!application.bikeId) {
    blockers.push("Assign a bike before approval.");
  }

  if (application.duplicateNationalId) {
    blockers.push("Resolve the duplicate national ID flag before approval.");
  }

  if (!application.nextOfKinOtpVerified) {
    blockers.push("Next-of-kin OTP must be verified.");
  }

  if (documents.length === 0) {
    blockers.push("KYC documents must be captured.");
  }

  if (documents.some((document) => ["unclear", "missing", "rejected"].includes(document.status))) {
    blockers.push("KYC documents must not have unclear, missing, or rejected status.");
  }

  if (verification.idNumberMatch === "mismatch") {
    blockers.push("Scanned ID number does not match the customer record.");
  }

  if (verification.faceMatch === "mismatch") {
    blockers.push("Customer photo/manual face check is marked as mismatch.");
  }

  if (verification.phoneDuplicate === "duplicate") {
    blockers.push("Customer phone number is duplicated.");
  }

  if (verification.simOwnership === "provider_mismatch") {
    blockers.push("SIM ownership is marked as provider mismatch.");
  }

  return blockers;
}
