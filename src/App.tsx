import { Navigate, Route, Routes } from "react-router-dom";
import { useStore } from "./data/StoreContext";
import { Shell } from "./ui/Shell";
import { LoginPage } from "./pages/LoginPage";
import { DashboardPage } from "./pages/DashboardPage";
import { OperationsPage } from "./pages/OperationsPage";
import { NewOperationPage } from "./pages/NewOperationPage";
import { OperationDetailPage } from "./pages/OperationDetailPage";
import { BeneficiariesPage } from "./pages/BeneficiariesPage";
import { CardsPage } from "./pages/CardsPage";
import { OpeningPage } from "./pages/OpeningPage";
import { ProvincesPage } from "./pages/ProvincesPage";
import { TravelPage } from "./pages/TravelPage";
import { OperatorsPage } from "./pages/OperatorsPage";

export function App() {
  const { session } = useStore();

  if (!session) {
    return (
      <Routes>
        <Route path="*" element={<LoginPage />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route element={<Shell />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/operaciones" element={<OperationsPage />} />
        <Route path="/operaciones/nueva" element={<NewOperationPage />} />
        <Route path="/operaciones/:id" element={<OperationDetailPage />} />
        <Route path="/beneficiarios" element={<BeneficiariesPage />} />
        <Route path="/tarjetas" element={<CardsPage />} />
        <Route path="/provincias" element={<ProvincesPage />} />
        <Route path="/apertura" element={<OpeningPage />} />
        <Route path="/viajes" element={<TravelPage />} />
        <Route path="/operadores" element={<OperatorsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
