import { Bell, BellDot, ChevronDown, ChevronRight, Mail, MailOpen, ShieldAlert } from "lucide-react";
import { useMemo, useState } from "react";
import { useAdminData } from "../../uploadedAdmin/features/admin/AdminDataContext.jsx";

function priorityFor(notification) {
  const text = `${notification.title} ${notification.message}`.toLowerCase();
  if (text.includes("duplicate") || text.includes("rejected") || text.includes("overdue")) return "urgent";
  if (text.includes("pending") || text.includes("info required") || text.includes("waiting")) return "follow up";
  return "normal";
}

function groupLabel(value) {
  const date = new Date(String(value || "").replace(" ", "T"));
  if (Number.isNaN(date.getTime())) return "Activity";
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return "Today";
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString("en-KE", { month: "short", day: "numeric", year: "numeric" });
}

export default function BackOfficeNotifications() {
  const { notifications = [], updateNotificationStatus } = useAdminData();
  const [openId, setOpenId] = useState("");
  const [message, setMessage] = useState("");

  const unread = notifications.filter((item) => item.status === "unread").length;
  const visibleNotifications = useMemo(() => {
    return [...notifications].sort((a, b) => {
      const left = new Date(String(a.createdAt || "").replace(" ", "T")).getTime() || 0;
      const right = new Date(String(b.createdAt || "").replace(" ", "T")).getTime() || 0;
      return right - left;
    });
  }, [notifications]);

  const groups = useMemo(() => {
    return visibleNotifications.reduce((acc, notification) => {
      const label = groupLabel(notification.createdAt);
      if (!acc[label]) acc[label] = [];
      acc[label].push(notification);
      return acc;
    }, {});
  }, [visibleNotifications]);

  async function markAllRead() {
    const unreadIds = notifications.filter((item) => item.status === "unread").map((item) => item.id);
    if (!unreadIds.length) {
      setMessage("No unread alerts.");
      return;
    }
    try {
      await updateNotificationStatus(unreadIds, "read");
      setMessage("All messages marked as read.");
    } catch (error) {
      setMessage(error.message || "Could not update messages.");
    }
  }

  async function toggleRead(notification) {
    const nextStatus = notification.status === "unread" ? "read" : "unread";
    try {
      await updateNotificationStatus([notification.id], nextStatus);
      setMessage(`Message marked ${nextStatus}.`);
    } catch (error) {
      setMessage(error.message || "Could not update message.");
    }
  }

  return (
    <section className="finance-style-page">
      <div className="finance-style-shell">
        <div className="finance-style-header">
          <div className="finance-style-activity-line">
            <span className="finance-style-dot" />
            <p className="finance-style-eyebrow">Alert activity</p>
          </div>
          <div className="finance-style-title-row">
            <h2>Alerts</h2>
            <button className="button secondary" type="button" onClick={markAllRead}>
              <MailOpen size={17} />
              Mark all read
            </button>
          </div>
          {message ? <p className="finance-style-notice">{message}</p> : null}
        </div>

        <section className="finance-style-group">
          <div className="finance-style-group-title">
            <span>Notification history</span>
            {unread > 0 ? <b>{unread} new</b> : null}
          </div>
          <div className="finance-style-list">
            {Object.entries(groups).map(([label, items]) => (
              <div className="finance-style-activity-group" key={label}>
                <p>{label}</p>
                {items.map((notification) => {
                  const isOpen = openId === notification.id;
                  const RowIcon = isOpen ? ChevronDown : ChevronRight;
                  const isUnread = notification.status === "unread";
                  const priority = priorityFor(notification);
                  return (
                    <article className="finance-style-notification" key={notification.id}>
                      <button
                        className={`finance-style-notification-row ${isUnread ? "is-unread" : ""}`}
                        type="button"
                        onClick={() => setOpenId(isOpen ? "" : notification.id)}
                      >
                        <span className={`finance-style-icon ${priority === "urgent" ? "danger" : "blue"}`}>
                          {priority === "urgent" ? <ShieldAlert size={18} /> : <Bell size={18} />}
                        </span>
                        <span className="finance-style-notification-body">
                          <span className="finance-style-meta-line">
                            <em>{priority}</em>
                            {isUnread ? <i /> : null}
                          </span>
                          <strong>{notification.title}</strong>
                          <small>{notification.message}</small>
                          <time>{notification.createdAt}</time>
                        </span>
                        <RowIcon size={18} />
                      </button>

                      {isOpen ? (
                        <div className="finance-style-notification-detail">
                          <div>
                            <span>Channel</span>
                            <strong>{notification.channel || "in_app"}</strong>
                          </div>
                          <div>
                            <span>Status</span>
                            <strong>{notification.status}</strong>
                          </div>
                          <p>{notification.message}</p>
                          <button className="finance-style-icon-button" type="button" onClick={() => toggleRead(notification)}>
                            {isUnread ? <MailOpen size={16} /> : <Mail size={16} />}
                          </button>
                        </div>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            ))}
            {!visibleNotifications.length ? (
              <div className="finance-style-empty">
                <BellDot size={30} />
                <strong>No alerts</strong>
                <span>Back Office alerts will appear here.</span>
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </section>
  );
}
