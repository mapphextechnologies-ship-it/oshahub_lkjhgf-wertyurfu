import Link from "next/link";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { organizationSubscriptions, subscriptionPlans } from "@/lib/mockData";
import styles from "./subscriptions.module.css";

const statusClass: Record<string, string> = {
  Active: styles.statusActive,
  Pending: styles.statusPending,
  Suspended: styles.statusSuspended,
};

const planClass: Record<string, string> = {
  Starter: styles.planStarter,
  Growth: styles.planGrowth,
  Business: styles.planBusiness,
  Enterprise: styles.planEnterprise,
};

export default function SubscriptionsPage() {

  return (
    <DashboardLayout title="Subscriptions">
      <div className={styles.pageTitle}>Subscription Plans</div>
      <div className={styles.pageSub}>Manage plans and view all active organization subscriptions.</div>

      <div className={styles.plans}>
        {subscriptionPlans.map((plan) => (
          <div className={`${styles.planCard} ${planClass[plan.name]}`} key={plan.name}>
            <div className={styles.planName}>{plan.name}</div>
            <div>
              <span className={styles.planPrice}>{plan.price}</span>
              <span className={styles.planCycle}>{plan.cycle}</span>
            </div>
            <div className={styles.planOrgs}>{plan.orgs} organization{plan.orgs !== 1 ? "s" : ""} - {plan.devices === -1 ? "Unlimited" : plan.devices.toLocaleString()} devices</div>
            <ul className={styles.planFeatures}>
              {plan.features.map((feature) => (
                <li className={styles.planFeature} key={feature}>
                  <svg className={styles.planCheck} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                  {feature}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className={styles.tableCard}>
        <div className={styles.tableHeader}>
          <div className={styles.tableTitle}>Active Subscriptions</div>
        </div>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Organization</th>
              <th>Plan</th>
              <th>Device Usage</th>
              <th>Status</th>
              <th>Next Renewal</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            {organizationSubscriptions.map((subscription) => (
              <tr key={subscription.org} className={styles.clickableRow}>
                <td className={styles.orgName}>
                  <Link href="/organizations">{subscription.org}</Link>
                </td>
                <td>{subscription.plan}</td>
                <td>{subscription.devices}</td>
                <td>
                  <span className={`${styles.statusBadge} ${statusClass[subscription.status]}`}>
                    <span className={styles.statusDot} />
                    {subscription.status}
                  </span>
                </td>
                <td className={styles.muted}>{subscription.renewal}</td>
                <td className={styles.amount}>{subscription.amount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </DashboardLayout>
  );
}
