import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

export default function RoleGuard({ roles, children }) {
  const { user, loading } = useAuth();
  if (loading || user === null) return <div className="p-10 text-center text-[#8A8A8A]">Cargando...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role) && user.role !== "admin") {
    return <Navigate to="/login" replace />;
  }
  return children;
}
