import { NavLink, useNavigate } from "react-router-dom";

const NAV = {
  student: [
    { to: "/student/dashboard", label: "Dashboard" },
    { to: "/student/sheets", label: "Answer Sheets" },
    { to: "/student/requests", label: "My Requests" },
    { to: "/student/notifications", label: "Notifications" },
    { to: "/student/profile", label: "Profile" },
  ],
  faculty: [
    { to: "/faculty/dashboard", label: "Dashboard" },
    { to: "/faculty/sheets", label: "Assigned Sheets" },
    { to: "/faculty/upload", label: "Upload / Process" },
    { to: "/faculty/complaints", label: "Student Complaints" },
    { to: "/faculty/history", label: "Review History" },
  ],
  admin: [
    { to: "/admin/dashboard", label: "Dashboard" },
    { to: "/admin/students", label: "Students" },
    { to: "/admin/faculty", label: "Faculty" },
    { to: "/admin/examinations", label: "Examinations" },
    { to: "/admin/answer-sheets", label: "Answer Sheets" },
  ],
};

const ROLE_LABEL = {
  student: "Student Portal",
  faculty: "Evaluator Portal",
  admin: "Examination Cell",
};

function initials(name = "") {
  return name
    .split(" ")
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function Sidebar({ role }) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">S</div>
        <div>
          SCBE
          <small>{ROLE_LABEL[role]}</small>
        </div>
      </div>
      <nav>
        {NAV[role].map((item) => (
          <NavLink key={item.to} to={item.to} className={({ isActive }) => (isActive ? "active" : "")}>
            <span className="nav-icon" />
            {item.label}
          </NavLink>
        ))}
      </nav>
      <div className="sidebar-foot">Role-based access enforced</div>
    </aside>
  );
}

export function Topbar({ user, onLogout }) {
  const navigate = useNavigate();

  function handleLogout() {
    onLogout();
    navigate("/");
  }

  return (
    <header className="topbar">
      <div className="topbar-meta">
        <div className="user-name">{user?.name}</div>
        <div className="user-role">{user?.id}</div>
      </div>
      <div className="avatar">{initials(user?.name)}</div>
      <button className="btn btn-outline" onClick={handleLogout}>
        Sign out
      </button>
    </header>
  );
}

export function AppShell({ role, user, onLogout, children }) {
  return (
    <div className="app-shell">
      <Sidebar role={role} />
      <div className="main-col">
        <Topbar user={user} onLogout={onLogout} />
        <main>{children}</main>
      </div>
    </div>
  );
}
