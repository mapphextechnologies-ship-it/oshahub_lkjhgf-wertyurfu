import { useState } from "react";
import { Outlet } from "react-router-dom";
import { useAdminData } from "../../../uploadedAdmin/features/admin/AdminDataContext.jsx";
import { BackOfficeSidebar } from "./BackOfficeSidebar.jsx";
import { BackOfficeTopbar } from "./BackOfficeTopbar.jsx";

export function BackOfficeLayout() {
  const { dataError, dataStatus } = useAdminData();
  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    <div className={`admin-shell ${sidebarOpen ? "sidebar-open" : "sidebar-closed"}`}>
      <BackOfficeTopbar onToggleSidebar={() => setSidebarOpen((open) => !open)} />
      <BackOfficeSidebar isOpen={sidebarOpen} />
      <div className="admin-main">
        <main className="content-area">
          {dataStatus === "loading" ? <div className="alert soft">Loading screening records...</div> : null}
          {dataStatus === "error" ? (
            <div className="alert danger">
              {dataError || "Screening records could not be loaded. Please try again."}
            </div>
          ) : null}
          <Outlet />
        </main>
      </div>
    </div>
  );
}
