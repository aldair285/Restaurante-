import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Utensils } from "lucide-react";

const HOMES = { admin: "/admin", waiter: "/pos", cashier: "/cashier", kitchen: "/kds" };

export default function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error("Ingresa usuario y contraseña");
      return;
    }
    setBusy(true);
    try {
      const u = await login(email.trim(), password);
      toast.success(`Bienvenido, ${u.name}`);
      nav(HOMES[u.role] || "/pos");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Credenciales inválidas");
    } finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen grid md:grid-cols-2 bg-[#F9F8F6]">
      <div className="hidden md:flex flex-col justify-between p-12 bg-[#2C2C2C] text-white relative overflow-hidden">
        <div className="flex items-center gap-3 relative z-10">
          <div className="h-11 w-11 rounded-xl bg-[#D45D3C] flex items-center justify-center">
            <Utensils className="h-6 w-6" />
          </div>
          <div className="heading font-bold text-xl tracking-tight">Sanguchería POS</div>
        </div>
        <div className="relative z-10">
          <h1 className="heading text-5xl font-bold leading-tight">Pedidos más rápidos.<br/><span className="text-[#E67E22]">Cocina más clara.</span></h1>
          <p className="mt-5 text-white/70 max-w-md">Sistema POS en tiempo real para tu restaurante. Mesero, Cocina y Caja sincronizados al instante.</p>
        </div>
        <div className="relative z-10 text-sm text-white/50">© Sanguchería POS · v1.0</div>
        <div className="absolute -right-24 -bottom-24 h-[420px] w-[420px] rounded-full bg-[#D45D3C]/20 blur-3xl" />
        <div className="absolute -right-10 top-10 h-[220px] w-[220px] rounded-full bg-[#E67E22]/20 blur-3xl" />
      </div>

      <div className="flex items-center justify-center p-6 md:p-12">
        <div className="w-full max-w-md">
          <h2 className="heading text-3xl font-bold mb-1">Iniciar sesión</h2>
          <p className="text-[#5E5E5E] mb-8">Ingresa con tu cuenta para acceder al sistema</p>

          <form onSubmit={submit} className="space-y-4" data-testid="login-form" autoComplete="off">
            <div>
              <Label htmlFor="login-user">Usuario</Label>
              <Input
                id="login-user"
                data-testid="login-email"
                value={email}
                onChange={e=>setEmail(e.target.value)}
                placeholder="usuario"
                className="h-12 mt-1 rounded-xl border-2"
                autoComplete="username"
              />
            </div>
            <div>
              <Label htmlFor="login-pwd">Contraseña</Label>
              <Input
                id="login-pwd"
                data-testid="login-password"
                type="password"
                value={password}
                onChange={e=>setPassword(e.target.value)}
                placeholder="••••••••"
                className="h-12 mt-1 rounded-xl border-2"
                autoComplete="current-password"
              />
            </div>
            <Button
              data-testid="login-submit"
              disabled={busy}
              type="submit"
              className="h-12 w-full rounded-xl text-base bg-[#D45D3C] hover:bg-[#C04F30]"
            >
              {busy ? "Ingresando..." : "Ingresar"}
            </Button>
          </form>

          <p className="mt-8 text-xs text-[#8A8A8A] text-center">
            Solo el administrador puede crear nuevas cuentas desde el Back Office.
          </p>
        </div>
      </div>
    </div>
  );
}
