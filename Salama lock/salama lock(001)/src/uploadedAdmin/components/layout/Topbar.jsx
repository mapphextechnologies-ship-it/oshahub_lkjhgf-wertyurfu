import { ArrowLeft, ArrowRight, LayoutDashboard, ShieldCheck, UserRound } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../features/auth/AuthContext.jsx";
import { SalamaLockLogo } from "../../../assets/index.js";

export function Topbar({ onToggleSidebar }) {
  const navigate = useNavigate();
  const { user } = useAuth();

  return (
    <header className="topbar">
      <div className="topbar-title">
        <button
          className="icon-button"
          type="button"
          onClick={onToggleSidebar}
          aria-label="Toggle sidebar navigation"
          title="Toggle sidebar"
        >
          <span />
          <span />
          <span />
        </button>
        <span className="topbar-logo"><img src={SalamaLockLogo} alt="SalamaLock" /></span>
        <div>
          <p className="eyebrow">Admin portal</p>
          <h1>SalamaLock administration</h1>
        </div>
      </div>
      <div className="topbar-actions">
        <div className="history-controls" aria-label="Page navigation controls">
          <button
            className="icon-button compact"
            type="button"
            onClick={() => navigate(-1)}
            aria-label="Go back"
            title="Back"
          >
            <ArrowLeft size={18} strokeWidth={2.6} />
          </button>
          <button
            className="icon-button compact"
            type="button"
            onClick={() => navigate(1)}
            aria-label="Go forward"
            title="Forward"
          >
            <ArrowRight size={18} strokeWidth={2.6} />
          </button>
          <button
            className="icon-button compact"
            type="button"
            onClick={() => navigate("/admin/overview")}
            aria-label="Go to overview"
            title="Overview"
          >
            <LayoutDashboard size={18} strokeWidth={2.6} />
          </button>
        </div>
        <Link className="user-chip" to="/admin/profile">
          <span className="user-chip-photo">
            {user?.photoUrl ? <img src={user.photoUrl} alt="" /> : <UserRound size={18} />}
          </span>
          <span className="user-chip-text">
            <span>{user?.name}</span>
            <small>{user?.role?.replaceAll("_", " ")}</small>
          </span>
        </Link>
      </div>
    </header>
  );
}
