import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import "./Layout.css";

const NAV_ITEMS = [
  { to: "/", label: "Dashboard", icon: "◆", end: true },
  { to: "/import", label: "Import People", icon: "⇪", end: false },
  { to: "/history", label: "Import History", icon: "☰", end: false },
];

export function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate("/login", { replace: true });
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-dot" />
          People Import
        </div>
        <nav>
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `nav-link focus-ring ${isActive ? "nav-link-active" : ""}`}
            >
              <span aria-hidden="true">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>
        {user && (
          <div className="sidebar-user">
            <div className="sidebar-user-name">{user.username}</div>
            <button className="nav-link focus-ring sidebar-logout" onClick={handleLogout}>
              <span aria-hidden="true">⏻</span>
              Log out
            </button>
          </div>
        )}
      </aside>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
