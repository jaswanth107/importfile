import { Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./auth/AuthContext";
import { Layout } from "./components/Layout";
import { Dashboard } from "./pages/Dashboard";
import { ImportWizard } from "./pages/ImportWizard";
import { History } from "./pages/History";
import { ImportDetail } from "./pages/ImportDetail";
import { Login } from "./pages/Login";

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="page-loading">Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          element={
            <RequireAuth>
              <Layout />
            </RequireAuth>
          }
        >
          <Route path="/" element={<Dashboard />} />
          <Route path="/import" element={<ImportWizard />} />
          <Route path="/history" element={<History />} />
          <Route path="/history/:id" element={<ImportDetail />} />
        </Route>
      </Routes>
    </AuthProvider>
  );
}
