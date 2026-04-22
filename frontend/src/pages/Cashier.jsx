import React, { useEffect, useMemo, useState } from "react";
import { api, API } from "@/lib/api";
import AppShell from "@/components/AppShell";
import { useOrdersWS } from "@/lib/ws";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Banknote, Printer, Plus, Trash2, Split, CreditCard } from "lucide-react";

export default function Cashier() {
  const [orders, setOrders] = useState([]);
  const [sel, setSel] = useState(null);
  const [discount, setDiscount] = useState(0);
  const [extra, setExtra] = useState(0);
  const [payments, setPayments] = useState([{ method:"efectivo", amount:0, tip:0 }]);
  const [payDlgOpen, setPayDlgOpen] = useState(false);

  const load = async () => {
    const { data } = await api.get("/orders?paid=false");
    setOrders(data);
  };
  useEffect(()=>{ load(); }, []);

  useOrdersWS((e)=>{
    if (["order.new","order.status","order.update"].includes(e.event)) {
      setOrders(prev => {
        const ex = prev.find(o=>o.id===e.payload.id);
        if (ex) return prev.map(o=>o.id===e.payload.id?e.payload:o);
        return [e.payload, ...prev];
      });
      if (e.event === "order.status" && e.payload.status === "ready") toast.success(`${e.payload.code} listo en cocina`);
    }
    if (e.event === "order.closed") { setOrders(p => p.filter(o => o.id !== e.payload.id)); if (sel?.id === e.payload.id) setSel(null); }
    if (e.event === "order.cancel") setOrders(p => p.filter(o => o.id !== e.payload.id));
  });

  const open = (o) => {
    setSel(o);
    setDiscount(0); setExtra(0);
    setPayments([{ method:"efectivo", amount: o.subtotal, tip:0 }]);
  };

  const total = sel ? Math.max(0, (sel.subtotal - Number(discount||0) + Number(extra||0))) : 0;
  const paidSum = payments.reduce((s,p)=>s+Number(p.amount||0),0);
  const remaining = Math.max(0, total - paidSum);

  useEffect(() => {
    if (!sel) return;
    if (payments.length === 1) setPayments([{...payments[0], amount: total}]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [discount, extra]);

  const addPay = () => setPayments(p => [...p, { method:"efectivo", amount: remaining, tip:0 }]);
  const delPay = (i) => setPayments(p => p.filter((_,x)=>x!==i));
  const upd = (i, k, v) => setPayments(p => p.map((x,xi)=> xi===i?{...x,[k]:v}:x));

  const confirmPay = async () => {
    try {
      if (Math.abs(paidSum - total) > 0.01 && paidSum < total) return toast.error("El monto pagado es menor al total");
      await api.post(`/orders/${sel.id}/close`, {
        discount: Number(discount||0),
        extra_charge: Number(extra||0),
        payments: payments.map(p => ({ method: p.method, amount: Number(p.amount||0), tip: Number(p.tip||0) })),
      });
      toast.success("Pago registrado. Pedido cerrado.");
      setPayDlgOpen(false);
      window.open(`${API}/orders/${sel.id}/ticket`, "_blank");
      setSel(null); load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Error al cobrar"); }
  };

  const statusBadge = (s) => ({
    pending: { bg:"bg-[#FFF3CD]", text:"text-[#856404]", label:"Pendiente" },
    preparing: { bg:"bg-[#FFE5D0]", text:"text-[#C85A17]", label:"Preparación" },
    ready: { bg:"bg-[#D4EDDA]", text:"text-[#155724]", label:"Listo" },
  }[s] || { bg:"bg-[#F3E8E0]", text:"text-[#2C2C2C]", label: s });

  return (
    <AppShell title="Caja">
      <div className="h-full grid grid-cols-12 gap-4 p-4 overflow-hidden">
        <section className="col-span-5 card-surface flex flex-col overflow-hidden">
          <div className="p-4 border-b border-[#E5E0D8] flex justify-between items-center">
            <div>
              <div className="heading font-bold text-lg">Pedidos abiertos</div>
              <div className="text-xs text-[#8A8A8A]">{orders.length} sin cobrar</div>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2" data-testid="cashier-orders">
            {orders.map(o => {
              const b = statusBadge(o.status);
              return (
                <button key={o.id} onClick={()=>open(o)} data-testid={`cashier-order-${o.id}`}
                  className={`w-full text-left p-4 rounded-xl border-2 transition-all ${sel?.id===o.id?"border-[#D45D3C] bg-[#F3E8E0]":"border-[#E5E0D8] bg-white hover:border-[#D45D3C]"}`}>
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="heading font-bold text-lg">{o.table_number?`Mesa ${o.table_number}`:"Para llevar"}</div>
                      <div className="text-xs text-[#8A8A8A] uppercase tracking-wider">{o.code} · {o.items.length} item{o.items.length!==1?"s":""}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-[#D45D3C]">S/ {o.subtotal.toFixed(2)}</div>
                      <span className={`inline-block mt-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${b.bg} ${b.text}`}>{b.label}</span>
                    </div>
                  </div>
                </button>
              );
            })}
            {orders.length === 0 && <div className="text-center text-[#8A8A8A] py-12 text-sm">Sin pedidos por cobrar</div>}
          </div>
        </section>

        <section className="col-span-7 card-surface flex flex-col overflow-hidden">
          {sel ? (
            <>
              <div className="p-4 border-b border-[#E5E0D8] flex justify-between items-center">
                <div>
                  <div className="text-xs uppercase tracking-[0.2em] text-[#8A8A8A] font-bold">{sel.code}</div>
                  <div className="heading font-bold text-2xl">{sel.table_number?`Mesa ${sel.table_number}`:"Para llevar"}</div>
                </div>
                <Button variant="outline" onClick={()=>window.open(`${API}/orders/${sel.id}/ticket`,"_blank")} data-testid="print-pre-ticket" className="rounded-xl h-11"><Printer className="h-4 w-4 mr-2"/>Pre-cuenta</Button>
              </div>
              <div className="flex-1 overflow-y-auto p-4">
                <div className="space-y-2 mb-4">
                  {sel.items.map((it, i) => (
                    <div key={i} className="flex justify-between py-2 border-b border-[#E5E0D8]">
                      <div>
                        <div className="font-semibold">{it.qty}x {it.name}</div>
                        {it.modifiers.map((m,j)=>(<div key={j} className="text-xs text-[#8A8A8A] ml-3">+ {m.name}{m.price_delta?` (S/ ${m.price_delta.toFixed(2)})`:""}</div>))}
                        {it.notes && <div className="text-xs italic text-[#8A8A8A] ml-3">"{it.notes}"</div>}
                      </div>
                      <div className="font-semibold text-[#2C2C2C]">S/ {it.line_total.toFixed(2)}</div>
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Descuento (S/)</Label>
                    <Input type="number" step="0.1" value={discount} onChange={e=>setDiscount(e.target.value)} data-testid="discount-input" className="h-11 rounded-xl"/>
                  </div>
                  <div>
                    <Label>Cargo extra (S/)</Label>
                    <Input type="number" step="0.1" value={extra} onChange={e=>setExtra(e.target.value)} data-testid="extra-input" className="h-11 rounded-xl"/>
                  </div>
                </div>
              </div>
              <div className="p-4 border-t border-[#E5E0D8] bg-[#F9F8F6]">
                <div className="flex justify-between text-sm"><span className="text-[#5E5E5E]">Subtotal</span><span>S/ {sel.subtotal.toFixed(2)}</span></div>
                <div className="flex justify-between text-sm"><span className="text-[#5E5E5E]">Descuento</span><span>- S/ {Number(discount||0).toFixed(2)}</span></div>
                <div className="flex justify-between text-sm mb-2"><span className="text-[#5E5E5E]">Cargo extra</span><span>+ S/ {Number(extra||0).toFixed(2)}</span></div>
                <div className="flex justify-between items-baseline border-t border-[#E5E0D8] pt-2">
                  <span className="heading font-bold">Total</span>
                  <span className="heading font-bold text-3xl text-[#D45D3C]" data-testid="cashier-total">S/ {total.toFixed(2)}</span>
                </div>
                <Button onClick={()=>setPayDlgOpen(true)} data-testid="charge-btn" className="w-full mt-3 h-14 bg-[#D45D3C] hover:bg-[#C04F30] text-base rounded-xl">
                  <Banknote className="h-5 w-5 mr-2"/>Cobrar
                </Button>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-[#8A8A8A] flex-col gap-2">
              <CreditCard className="h-12 w-12 opacity-40"/>
              <div>Selecciona un pedido para cobrar</div>
            </div>
          )}
        </section>
      </div>

      <Dialog open={payDlgOpen} onOpenChange={setPayDlgOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Registrar pago · Total S/ {total.toFixed(2)}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            {payments.map((p, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 items-end">
                <div className="col-span-5">
                  <Label>Método</Label>
                  <Select value={p.method} onValueChange={v=>upd(i,"method",v)}>
                    <SelectTrigger data-testid={`pay-method-${i}`}><SelectValue/></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="efectivo">Efectivo</SelectItem>
                      <SelectItem value="transferencia">Transferencia</SelectItem>
                      <SelectItem value="otro">Otro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-4"><Label>Monto</Label><Input type="number" step="0.1" value={p.amount} onChange={e=>upd(i,"amount",e.target.value)} data-testid={`pay-amount-${i}`}/></div>
                <div className="col-span-2"><Label>Propina</Label><Input type="number" step="0.1" value={p.tip} onChange={e=>upd(i,"tip",e.target.value)}/></div>
                <div className="col-span-1">{payments.length>1 && <button onClick={()=>delPay(i)} className="h-10 w-10 rounded-lg border text-red-600"><Trash2 className="h-4 w-4 mx-auto"/></button>}</div>
              </div>
            ))}
            <button onClick={addPay} data-testid="split-btn" className="h-11 w-full rounded-xl border-2 border-dashed border-[#E5E0D8] hover:border-[#D45D3C] font-semibold text-[#5E5E5E] flex items-center justify-center gap-2">
              <Split className="h-4 w-4"/> Dividir cuenta
            </button>
            <div className="flex justify-between text-sm px-1">
              <span>Pagado: <b>S/ {paidSum.toFixed(2)}</b></span>
              <span className={remaining>0.01?"text-[#D45D3C]":"text-emerald-700"}>Restante: S/ {remaining.toFixed(2)}</span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={()=>setPayDlgOpen(false)}>Cancelar</Button>
            <Button onClick={confirmPay} data-testid="confirm-pay-btn" className="bg-[#D45D3C] hover:bg-[#C04F30]">Confirmar y cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
