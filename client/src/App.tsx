import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { ProtectedRoute } from "./components/ProtectedRoute";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Onboarding from "./pages/Onboarding";
import Dashboard from "./pages/Dashboard";
import Customers from "./pages/Customers";
import Items from "./pages/Items";
import DocumentForm from "./pages/DocumentForm";
import Documents from "./pages/Documents";
import DocumentView from "./pages/DocumentView";
import BusinessSettings from "./pages/BusinessSettings";
import BillingCallback from "./pages/BillingCallback";

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route element={<ProtectedRoute />}>
            <Route path="/onboarding" element={<Onboarding />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/customers" element={<Customers />} />
            <Route path="/items" element={<Items />} />
            <Route path="/documents" element={<Documents />} />
            <Route path="/documents/new" element={<DocumentForm />} />
            <Route path="/documents/:id/edit" element={<DocumentForm />} />
            <Route path="/documents/:id" element={<DocumentView />} />
            <Route path="/settings" element={<BusinessSettings />} />
            <Route path="/billing/callback" element={<BillingCallback />} />
          </Route>
          <Route path="/" element={<Navigate to="/onboarding" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
