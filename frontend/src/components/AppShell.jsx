import React from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { LogOut, ChefHat, Utensils, LayoutGrid, Banknote, Settings2 } from "lucide-react";

const LINKS = {
  admin:   [{ to:"/admin", label:"Administración", icon: Settings2 }, { to:"/pos", label:"Pedidos", icon: Utensils }, { to:"/kds", label:"Cocina", icon: ChefHat }, { to:"/cashier", label:"Caja", icon: Banknote }],
  waiter:  [{ to:"/pos", label:"Pedidos", icon: Utensils }],
  cashier: [{ to:"/cashier", label:"Caja", icon: Banknote }, { to:"/pos", label:"Pedidos", icon: Utensils }],
  kitchen: [{ to:"/kds", label:"Cocina", icon: ChefHat }],
};

export default function AppShell({ children, title, right }) {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const links = LINKS[user?.role] || [];

  return (
    <div className="min-h-screen flex flex-col bg-[#F9F8F6]">
      <header className="flex items-center justify-between px-5 md:px-8 py-3 border-b border-[#E5E0D8] bg-white">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-[#D45D3C] text-white flex items-center justify-center">
            <LayoutGrid className="h-5 w-5" />
          </div>
          <div className="heading font-bold text-lg">Sanguchería POS</div>
          {title ? <span className="hidden md:inline text-[#8A8A8A] ml-4 text-sm">/ {title}</span> : null}
        </div>

        <nav className="hidden md:flex items-center gap-1">
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              data-testid={`nav-${l.to.slice(1)}`}
              className={({isActive}) =>
                `flex items-center gap-2 px-3 h-10 rounded-lg text-sm font-semibold transition-colors ${isActive ? "bg-[#F3E8E0] text-[#D45D3C]" : "text-[#5E5E5E] hover:bg-[#F3E8E0]"}`
              }>
              <l.icon className="h-4 w-4" /> {l.label}
            </NavLink>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          {right}
          <div className="hidden md:block text-right">
            <div className="text-sm font-semibold leading-tight">{user?.name}</div>
            <div className="text-xs uppercase tracking-widest text-[#8A8A8A]">{user?.role}</div>
          </div>
          <button
            onClick={() => { logout(); nav("/login"); }}
            data-testid="logout-btn"
            className="h-10 w-10 rounded-lg border border-[#E5E0D8] hover:bg-[#F3E8E0] flex items-center justify-center transition-colors"
            title="Cerrar sesión">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </header>
      <main className="flex-1 overflow-hidden">{children}</main>
    </div>
  );
}
