import {
  Bell,
  Bike,
  ClipboardList,
  Download,
  History,
  LayoutDashboard,
  LogOut,
  Settings,
  Smartphone,
  UserCog,
  UserRound,
  Users,
  WalletCards
} from "lucide-react";
import { NavLink } from "react-router-dom";
import { adminNavigationGroups } from "../../config/adminNavigation.js";
import { useAuth } from "../../features/auth/AuthContext.jsx";

const navIcons = {
  Bell,
  Bike,
  ClipboardList,
  Download,
  History,
  LayoutDashboard,
  Settings,
  Smartphone,
  UserCog,
  UserRound,
  Users,
  WalletCards
};

export function Sidebar({ isOpen }) {
  const { canAccessAdmin, logout } = useAuth();

  return (
    <aside className={`sidebar ${isOpen ? "is-open" : "is-closed"}`} aria-label="Admin sidebar">
      <nav className="nav-list" aria-label="Admin navigation">
        {adminNavigationGroups.map((group) => (
          <div className="nav-group" key={group.label}>
            <p className="nav-group-label">{group.label}</p>
            {group.items.filter((item) => canAccessAdmin(item.permission)).map((item) => {
              const Icon = navIcons[item.icon];
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
        ))}
      </nav>

      <button className="sidebar-logout" type="button" onClick={logout} title="Sign out">
        <LogOut size={19} strokeWidth={2.1} />
        <span>Sign out</span>
      </button>
    </aside>
  );
}
