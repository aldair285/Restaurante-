import React from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { Toaster } from "sonner";
import Login from "@/pages/Login";
import AdminDashboard from "@/pages/AdminDashboard";
import POSOrder from "@/pages/POSOrder";
import KDS from "@/pages/KDS";
import Cashier from "@/pages/Cashier";
import RoleGuard from "@/components/RoleGuard";

function HomeRedirect() {
  const { user, loading } = useAuth();
  if (loading || user === null) return <div className="p-10 text-center text-[#8A8A8A]">Cargando...</div>;
  if (!user) return <Navigate to="/login" replace />;
  const map = { admin: "/admin", waiter: "/pos", cashier: "/cashier", kitchen: "/kds" };
  return <Navigate to={map[user.role] || "/pos"} replace />;
}

function App() {
  return (
    <div className="App">
      <AuthProvider>
        <BrowserRouter>
          <Toaster position="top-right" richColors />
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/admin/*" element={<RoleGuard roles={["admin"]}><AdminDashboard /></RoleGuard>} />
            <Route path="/pos" element={<RoleGuard roles={["waiter","cashier","admin"]}><POSOrder /></RoleGuard>} />
            <Route path="/kds" element={<RoleGuard roles={["kitchen","admin"]}><KDS /></RoleGuard>} />
            <Route path="/cashier" element={<RoleGuard roles={["cashier","admin"]}><Cashier /></RoleGuard>} />
            <Route path="/" element={<HomeRedirect />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </div>
  );
}

export default App;
