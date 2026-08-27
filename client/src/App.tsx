import { Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { Dashboard } from "./pages/Dashboard";
import { ImportWizard } from "./pages/ImportWizard";
import { History } from "./pages/History";
import { ImportDetail } from "./pages/ImportDetail";

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/import" element={<ImportWizard />} />
        <Route path="/history" element={<History />} />
        <Route path="/history/:id" element={<ImportDetail />} />
      </Route>
    </Routes>
  );
}
