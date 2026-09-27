import {
  Bell,
  CheckCircle2,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  Settings2,
  UserRound
} from "lucide-react";
import { NavLink } from "react-router-dom";
import { useAuth } from "../../../uploadedAdmin/features/auth/AuthContext.jsx";

const navItems = [
  { label: "Overview", shortLabel: "O", icon: LayoutDashboard, to: "/backoffice/overview", end: true },
  { label: "Screening queue", shortLabel: "SQ", icon: ClipboardList, to: "/backoffice/screening" },
  { label: "Completed", shortLabel: "CO", icon: CheckCircle2, to: "/backoffice/completed" },
  { label: "Notifications", shortLabel: "NO", icon: Bell, to: "/backoffice/notifications" },
  { label: "Settings", shortLabel: "SE", icon: Settings2, to: "/backoffice/settings" },
  { label: "Profile", shortLabel: "PR", icon: UserRound, to: "/backoffice/profile" }
];

export function BackOfficeSidebar({ isOpen }) {
  const { logout } = useAuth();

  return (
    <aside className={`sidebar ${isOpen ? "is-open" : "is-closed"}`} aria-label="Back Office sidebar">
      <nav className="nav-list" aria-label="Back Office navigation">
        <div className="nav-group">
          <p className="nav-group-label">Screening</p>
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className="nav-item"
                data-short={item.shortLabel}
                end={item.end}
                title={item.label}
              >
                <Icon size={19} strokeWidth={2.1} />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </div>
      </nav>

      <button className="sidebar-logout" type="button" onClick={logout} title="Sign out">
        <LogOut size={19} strokeWidth={2.1} />
        <span>Sign out</span>
      </button>
    </aside>
  );
}
