import { useState } from "react";
import { Outlet } from "react-router-dom";
import { useAdminData } from "../../features/admin/AdminDataContext.jsx";
import { Sidebar } from "./Sidebar.jsx";
import { Topbar } from "./Topbar.jsx";

export function AdminLayout() {
  const { dataError, dataStatus } = useAdminData();
  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    <div className={`admin-shell ${sidebarOpen ? "sidebar-open" : "sidebar-closed"}`}>
      <Topbar onToggleSidebar={() => setSidebarOpen((open) => !open)} />
      <Sidebar isOpen={sidebarOpen} />
      <div className="admin-main">
        <main className="content-area">
          {dataStatus === "loading" ? (
            <div className="alert soft">Loading live admin records...</div>
          ) : null}
          {dataStatus === "error" ? (
            <div className="alert danger">
              {dataError || "Live admin data could not be loaded. Please try again."}
            </div>
          ) : null}
          <Outlet />
        </main>
      </div>
    </div>
  );
}
