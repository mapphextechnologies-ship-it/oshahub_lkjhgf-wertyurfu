import { Bell, BellDot, CheckCheck, MessageSquareText, Search, Send, Smartphone } from "lucide-react";
import { useMemo, useState } from "react";
import { DataTable } from "../../components/ui/DataTable.jsx";
import { PageHeader } from "../../components/ui/PageHeader.jsx";
import { StatCard } from "../../components/ui/StatCard.jsx";
import { StatusBadge } from "../../components/ui/StatusBadge.jsx";
import { useAdminData } from "../../features/admin/AdminDataContext.jsx";

const channelLabels = {
  in_app: "In app",
  sms: "SMS",
  email: "Email",
  whatsapp: "WhatsApp"
};

function getNotificationPriority(notification) {
  const text = `${notification.title} ${notification.message}`.toLowerCase();

  if (text.includes("duplicate") || text.includes("rejected") || text.includes("overdue")) {
    return "urgent";
  }

  if (text.includes("pending") || text.includes("info required") || text.includes("waiting")) {
    return "follow_up";
  }

  return "normal";
}

function parseNotificationDate(value) {
  const date = new Date(String(value || "").replace(" ", "T"));
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

export default function Notifications() {
  const { notifications = [], updateNotificationStatus } = useAdminData();
  const [statusFilter, setStatusFilter] = useState("all");
  const [channelFilter, setChannelFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");
  const unread = notifications.filter((notification) => notification.status === "unread").length;
  const sms = notifications.filter((notification) => notification.channel === "sms").length;
  const inApp = notifications.filter((notification) => notification.channel === "in_app").length;
  const urgent = notifications.filter((notification) => getNotificationPriority(notification) === "urgent").length;
  const visibleNotifications = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return notifications
      .filter((notification) => statusFilter === "all" || notification.status === statusFilter)
      .filter((notification) => channelFilter === "all" || notification.channel === channelFilter)
      .filter((notification) => {
        if (!normalizedQuery) {
          return true;
        }

        return [notification.title, notification.message, notification.channel, notification.status, notification.createdAt]
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery);
      })
      .sort((a, b) => parseNotificationDate(b.createdAt) - parseNotificationDate(a.createdAt));
  }, [channelFilter, notifications, query, statusFilter]);

  const attentionNotifications = visibleNotifications
    .filter((notification) => notification.status === "unread" || getNotificationPriority(notification) !== "normal")
    .slice(0, 4);

  const channelOptions = useMemo(
    () => Array.from(new Set(notifications.map((notification) => notification.channel))).sort(),
    [notifications]
  );

  async function markVisibleAsRead() {
    const unreadIds = visibleNotifications
      .filter((notification) => notification.status === "unread")
      .map((notification) => notification.id);

    if (unreadIds.length === 0) {
      setMessage("No unread notifications in this view.");
      return;
    }

    try {
      await updateNotificationStatus(unreadIds, "read");
      setMessage(`${unreadIds.length} notifications marked as read.`);
    } catch (error) {
      setMessage(error.message || "Could not update notifications.");
    }
  }

  async function markVisibleAsUnread() {
    const readIds = visibleNotifications
      .filter((notification) => notification.status === "read")
      .map((notification) => notification.id);

    if (readIds.length === 0) {
      setMessage("No read notifications in this view.");
      return;
    }

    try {
      await updateNotificationStatus(readIds, "unread");
      setMessage(`${readIds.length} notifications marked as unread.`);
    } catch (error) {
      setMessage(error.message || "Could not update notifications.");
    }
  }

  async function toggleNotificationStatus(notification) {
    const nextStatus = notification.status === "unread" ? "read" : "unread";
    try {
      await updateNotificationStatus([notification.id], nextStatus);
      setMessage(`${notification.title} marked as ${nextStatus}.`);
    } catch (error) {
      setMessage(error.message || "Could not update notification.");
    }
  }

  function resetFilters() {
    setStatusFilter("all");
    setChannelFilter("all");
    setQuery("");
    setMessage("");
  }

  return (
    <section className="page-stack">
      <PageHeader
        eyebrow="Notifications"
        title="SMS and in-app activity"
        description="Track OTP, approval, rejection, reminder, overdue, and commission notification activity."
        actions={
          <div className="page-actions">
            <button className="button primary" type="button" onClick={markVisibleAsRead}>
              <CheckCheck size={18} />
              Mark visible read
            </button>
            <button className="button secondary" type="button" onClick={markVisibleAsUnread}>
              <BellDot size={18} />
              Mark visible unread
            </button>
          </div>
        }
      />

      {message ? <div className="alert soft">{message}</div> : null}

      <div className="stat-grid compact">
        <StatCard icon={Bell} label="Total notifications" value={notifications.length} detail="All channels" />
        <StatCard icon={BellDot} label="Unread alerts" value={unread} detail="Needs attention" />
        <StatCard icon={Send} label="Priority flags" value={urgent} detail="Risk or rejection alerts" tone="warning" />
        <StatCard icon={Smartphone} label="SMS records" value={sms} detail="Africa's Talking channel" />
        <StatCard icon={MessageSquareText} label="In-app records" value={inApp} detail="Portal notification feed" />
      </div>

      <div className="panel table-toolbar notifications-toolbar">
        <label>
          Search notifications
          <div className="input-with-icon">
            <Search size={17} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search title, message, channel..."
            />
          </div>
        </label>
        <label>
          Status
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="all">All notifications</option>
            <option value="unread">Unread</option>
            <option value="read">Read</option>
          </select>
        </label>
        <label>
          Channel
          <select value={channelFilter} onChange={(event) => setChannelFilter(event.target.value)}>
            <option value="all">All channels</option>
            {channelOptions.map((channel) => (
              <option key={channel} value={channel}>
                {channelLabels[channel] || channel}
              </option>
            ))}
          </select>
        </label>
        <div className="toolbar-count">
          <span>Visible</span>
          <strong>{visibleNotifications.length}</strong>
        </div>
        <button className="button secondary" type="button" onClick={resetFilters}>
          Reset
        </button>
      </div>

      {attentionNotifications.length > 0 ? (
        <section className="notification-focus-grid">
          {attentionNotifications.map((notification) => (
            <article className="notification-focus-card" key={notification.id}>
              <div className="notification-focus-top">
                <StatusBadge status={getNotificationPriority(notification)} />
                <StatusBadge status={notification.status} />
              </div>
              <strong>{notification.title}</strong>
              <p>{notification.message}</p>
              <div className="notification-focus-footer">
                <span>{channelLabels[notification.channel] || notification.channel}</span>
                <span>{notification.createdAt}</span>
              </div>
            </article>
          ))}
        </section>
      ) : null}

      <DataTable
        columns={[
          {
            key: "title",
            label: "Title",
            render: (row) => (
              <div className="notification-title-cell">
                <span className={`notification-dot ${row.status === "unread" ? "is-unread" : ""}`} />
                <strong>{row.title}</strong>
              </div>
            )
          },
          { key: "message", label: "Message" },
          {
            key: "channel",
            label: "Channel",
            render: (row) => <span className="channel-chip">{channelLabels[row.channel] || row.channel}</span>
          },
          {
            key: "priority",
            label: "Priority",
            render: (row) => <StatusBadge status={getNotificationPriority(row)} />
          },
          { key: "status", label: "Status", render: (row) => <StatusBadge status={row.status} /> },
          { key: "createdAt", label: "Created" },
          {
            key: "actions",
            label: "Actions",
            render: (row) => (
              <div className="table-actions">
                <button type="button" onClick={() => toggleNotificationStatus(row)}>
                  {row.status === "unread" ? "Mark read" : "Mark unread"}
                </button>
              </div>
            )
          }
        ]}
        rows={visibleNotifications}
        emptyMessage="No notifications match this view."
      />
    </section>
  );
}
