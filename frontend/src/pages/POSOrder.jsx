import React, { useEffect, useMemo, useState } from "react";
import { api, API } from "@/lib/api";
import AppShell from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Minus, Plus, Send, Trash2, ShoppingBag, CircleCheck, PlusCircle } from "lucide-react";
import { useOrdersWS } from "@/lib/ws";

export default function POSOrder() {
  const [cats, setCats] = useState([]);
  const [products, setProducts] = useState([]);
  const [mods, setMods] = useState([]);
  const [activeCat, setActiveCat] = useState(null);
  const [tables, setTables] = useState([]);
  const [table, setTable] = useState(null);
  const [cart, setCart] = useState([]); // {uid, product, qty, modifier_ids, notes, _existing, _added}
  const [orderId, setOrderId] = useState(null);
  const [modDlg, setModDlg] = useState(null);
  const [note, setNote] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState(null); // {idx, name}

  const loadAll = async () => {
    const [c, p, m, t] = await Promise.all([api.get("/categories"), api.get("/products"), api.get("/modifiers"), api.get("/tables")]);
    setCats(c.data); setProducts(p.data); setMods(m.data); setTables(t.data);
    if (!activeCat && c.data[0]) setActiveCat(c.data[0].id);
    return { products: p.data, tables: t.data };
  };
  useEffect(()=>{ loadAll(); }, []);

  useOrdersWS((e)=>{ if (["order.new","order.closed","order.cancel","order.update"].includes(e.event)) api.get("/tables").then(r=>setTables(r.data)); });

  const modMap = useMemo(() => Object.fromEntries(mods.map(m=>[m.id,m])), [mods]);
  const filtered = products.filter(p => p.available && (!activeCat || p.category_id === activeCat));

  const addToCart = (p) => {
    if (p.modifier_ids && p.modifier_ids.length) {
      setModDlg({ product: p, qty: 1, modifier_ids: [], notes: "" });
    } else {
      setCart(prev => [...prev, { uid: crypto.randomUUID(), product: p, qty: 1, modifier_ids: [], notes: "", _added: !!orderId }]);
    }
  };

  const confirmModDlg = () => {
    setCart(prev => [...prev, {
      uid: crypto.randomUUID(),
      product: modDlg.product,
      qty: modDlg.qty,
      modifier_ids: modDlg.modifier_ids,
      notes: modDlg.notes,
      _added: !!orderId,
    }]);
    setModDlg(null);
  };

  const updateQty = (idx, d) => setCart(prev => prev.map((c,i)=> i===idx ? {...c, qty: Math.max(1, c.qty+d)} : c));

  const removeItem = (idx) => {
    const item = cart[idx];
    if (item._existing) {
      setDeleteConfirm({ idx, name: item.product.name });
    } else {
      setCart(prev => prev.filter((_,i)=>i!==idx));
    }
  };

  const confirmDelete = () => {
    if (deleteConfirm !== null) {
      setCart(prev => prev.filter((_,i)=>i!==deleteConfirm.idx));
      setDeleteConfirm(null);
    }
  };

  const lineTotal = (c) => (c.product.price + c.modifier_ids.reduce((s,mid)=>s + (modMap[mid]?.price_delta||0),0)) * c.qty;
  const total = cart.reduce((s,c)=>s+lineTotal(c),0);

  const selectTable = async (n, overrideData = {}) => {
    setTable(n); setCart([]); setOrderId(null); setNote("");
    // Usar datos frescos si se pasan (evita bug de timing con estado de React)
    const prodList = overrideData.products || products;
    const tableList = overrideData.tables || tables;
    const existing = tableList.find(t=>t.number===n && t.order_id);
    if (existing) {
      try {
        const o = (await api.get(`/orders/${existing.order_id}`)).data;
        if (o.paid) return;
        setOrderId(o.id);
        setNote(o.note || "");
        setCart(o.items.map(it => ({
          uid: crypto.randomUUID(),
          product: prodList.find(p=>p.id===it.product_id) || { id: it.product_id, name: it.name, price: it.unit_price, modifier_ids: [] },
          qty: it.qty,
          modifier_ids: it.modifiers.map(m=>m.id),
          notes: it.notes || "",
          _existing: true,
          _added: false,
        })));
      } catch (err) { console.error("No se pudo cargar pedido existente:", err); }
    }
  };

  const send = async () => {
    if (!cart.length) return toast.error("Agrega productos al pedido");
    const items = cart.map(c => ({
      product_id: c.product.id,
      qty: c.qty,
      modifier_ids: c.modifier_ids,
      notes: c.notes,
      added: !!c._added,
    }));
    const body = { table_number: table, note, items };
    try {
      if (orderId) {
        await api.patch(`/orders/${orderId}`, body);
        toast.success("Pedido actualizado ✓");
      } else {
        const { data } = await api.post("/orders", body);
        setOrderId(data.id);
        toast.success(`Pedido ${data.code} enviado a cocina`);
      }
      setCart([]); setTable(null); setOrderId(null); setNote("");
      loadAll();
    } catch (e) { toast.error(e?.response?.data?.detail || "Error al enviar"); }
  };

  const printTicket = () => {
    if (!orderId) return;
    window.open(`${API}/orders/${orderId}/ticket`, "_blank");
  };

  const existingItems = cart.filter(c => c._existing);
  const addedItems = cart.filter(c => c._added);
  const newItems = cart.filter(c => !c._existing && !c._added);

  const renderCartItem = (c) => {
    const globalIdx = cart.indexOf(c);
    return (
      <div key={c.uid} className={`flex gap-3 py-3 border-b border-[#E5E0D8] ${c._added ? "bg-[#F0FFF4] -mx-3 px-3 rounded-lg" : ""}`}>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm truncate">{c.product.name}</span>
            {c._added && (
              <span className="flex-shrink-0 text-[9px] uppercase tracking-wider bg-[#27AE60] text-white px-1.5 py-0.5 rounded-full font-bold flex items-center gap-1">
                <PlusCircle className="h-2.5 w-2.5"/> Añadido
              </span>
            )}
          </div>
          {c.modifier_ids.map(mid => <div key={mid} className="text-xs text-[#8A8A8A]">+ {modMap[mid]?.name}</div>)}
          {c.notes && <div className="text-xs italic text-[#8A8A8A]">"{c.notes}"</div>}
        </div>
        <div className="flex flex-col items-end gap-1">
          <div className="font-bold text-sm text-[#D45D3C]">S/ {lineTotal(c).toFixed(2)}</div>
          <div className="flex items-center gap-1">
            <button onClick={()=>updateQty(globalIdx,-1)} className="h-7 w-7 rounded-lg border border-[#E5E0D8] flex items-center justify-center"><Minus className="h-3 w-3"/></button>
            <span className="w-6 text-center font-bold">{c.qty}</span>
            <button onClick={()=>updateQty(globalIdx,+1)} className="h-7 w-7 rounded-lg border border-[#E5E0D8] flex items-center justify-center"><Plus className="h-3 w-3"/></button>
            <button onClick={()=>removeItem(globalIdx)} className="h-7 w-7 rounded-lg border border-red-200 text-red-500 ml-1 flex items-center justify-center">
              <Trash2 className="h-3 w-3"/>
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <AppShell title="Toma de Pedido">
      <div className="h-full grid grid-cols-12 gap-4 p-4 overflow-hidden">
        {/* Categories */}
        <aside className="col-span-2 overflow-y-auto space-y-2">
          <div className="text-xs uppercase tracking-[0.2em] text-[#8A8A8A] font-bold mb-2 px-1">Categorías</div>
          {cats.map(c => (
            <button key={c.id} onClick={()=>setActiveCat(c.id)} data-testid={`cat-${c.id}`}
              className={`w-full text-left h-14 rounded-xl px-4 font-semibold transition-all ${activeCat===c.id ? "bg-[#D45D3C] text-white shadow-md" : "bg-white border border-[#E5E0D8] hover:border-[#D45D3C]"}`}>
              {c.name}
            </button>
          ))}
          <div className="text-xs uppercase tracking-[0.2em] text-[#8A8A8A] font-bold mt-6 mb-2 px-1">Mesas</div>
          <div className="grid grid-cols-3 gap-2">
            <button onClick={()=>selectTable(null)} data-testid="table-takeaway" className={`h-14 rounded-xl text-xs font-bold flex flex-col items-center justify-center ${table===null?"bg-[#2C2C2C] text-white":"bg-white border border-[#E5E0D8]"}`}>
              <ShoppingBag className="h-4 w-4 mb-0.5"/>LLEVAR
            </button>
            {tables.map(t => (
              <button key={t.number} onClick={()=>selectTable(t.number)} data-testid={`table-${t.number}`}
                className={`h-14 rounded-xl font-bold relative ${table===t.number?"bg-[#D45D3C] text-white":"bg-white border border-[#E5E0D8] hover:border-[#D45D3C]"}`}>
                {t.number}
                {t.status==="occupied" && table!==t.number && <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-[#E67E22]"/>}
              </button>
            ))}
          </div>
        </aside>

        {/* Products */}
        <section className="col-span-7 overflow-y-auto">
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4 content-start" data-testid="products-grid">
            {filtered.map(p => (
              <button key={p.id} onClick={()=>addToCart(p)} data-testid={`product-${p.id}`}
                className="product-tile bg-white rounded-2xl p-4 border-2 border-[#E5E0D8] text-left fade-up">
                <div className="h-28 w-full rounded-xl bg-[#F3E8E0] overflow-hidden mb-3">
                  {p.image ? <img src={p.image} alt={p.name} className="h-full w-full object-cover"/> : null}
                </div>
                <div className="font-semibold leading-tight line-clamp-2 min-h-[2.5rem]">{p.name}</div>
                <div className="mt-2 flex items-center justify-between">
                  <span className="font-bold text-[#D45D3C]">S/ {p.price.toFixed(2)}</span>
                  {p.is_combo && <span className="text-[10px] uppercase tracking-wider bg-[#E67E22] text-white px-2 py-0.5 rounded-full font-bold">Combo</span>}
                </div>
              </button>
            ))}
            {filtered.length===0 && <div className="col-span-4 text-center text-[#8A8A8A] py-12">Sin productos en esta categoría</div>}
          </div>
        </section>

        {/* Ticket */}
        <aside className="col-span-3 card-surface flex flex-col overflow-hidden">
          <div className="p-4 border-b border-[#E5E0D8] flex items-center justify-between">
            <div>
              <div className="text-xs uppercase tracking-[0.2em] text-[#8A8A8A] font-bold">Pedido</div>
              <div className="heading font-bold text-lg">{table ? `Mesa ${table}` : "Para llevar"}</div>
            </div>
            {orderId && <span className="text-[10px] uppercase tracking-wider bg-[#FFF3CD] text-[#856404] px-2 py-1 rounded-full font-bold">Editando</span>}
          </div>
          <div className="flex-1 overflow-y-auto p-3" data-testid="order-cart">
            {cart.length === 0 && <div className="text-center text-[#8A8A8A] py-10 text-sm">Selecciona productos</div>}

            {existingItems.map(c => renderCartItem(c))}

            {orderId && addedItems.length > 0 && (
              <div className="flex items-center gap-2 py-2 my-1">
                <div className="flex-1 border-t border-dashed border-[#27AE60]"/>
                <span className="text-[10px] text-[#27AE60] font-bold uppercase tracking-wider flex items-center gap-1">
                  <PlusCircle className="h-3 w-3"/> Nuevos
                </span>
                <div className="flex-1 border-t border-dashed border-[#27AE60]"/>
              </div>
            )}

            {addedItems.map(c => renderCartItem(c))}
            {newItems.map(c => renderCartItem(c))}
          </div>
          <div className="p-3 border-t border-[#E5E0D8] space-y-2">
            <Input placeholder="Nota del pedido (opcional)" value={note} onChange={e=>setNote(e.target.value)} data-testid="order-note"/>
            <div className="flex justify-between items-baseline">
              <span className="text-[#5E5E5E]">Total</span>
              <span className="heading font-bold text-2xl text-[#D45D3C]" data-testid="order-total">S/ {total.toFixed(2)}</span>
            </div>
            <Button onClick={send} data-testid="send-order-btn" disabled={!cart.length} className="w-full h-14 text-base bg-[#D45D3C] hover:bg-[#C04F30] rounded-xl">
              <Send className="h-4 w-4 mr-2"/>{orderId ? "Actualizar pedido" : "Enviar a cocina"}
            </Button>
            {orderId && <Button onClick={printTicket} variant="outline" className="w-full h-11 rounded-xl">Imprimir ticket</Button>}
          </div>
        </aside>
      </div>

      {/* Dialog modificadores */}
      <Dialog open={!!modDlg} onOpenChange={(v)=>!v && setModDlg(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{modDlg?.product.name}</DialogTitle></DialogHeader>
          {modDlg && (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <span className="text-sm">Cantidad</span>
                <div className="flex items-center gap-2">
                  <button onClick={()=>setModDlg(m=>({...m, qty: Math.max(1,m.qty-1)}))} className="h-9 w-9 rounded-lg border border-[#E5E0D8]"><Minus className="h-4 w-4 mx-auto"/></button>
                  <span className="w-8 text-center font-bold text-lg">{modDlg.qty}</span>
                  <button onClick={()=>setModDlg(m=>({...m, qty: m.qty+1}))} className="h-9 w-9 rounded-lg border border-[#E5E0D8]"><Plus className="h-4 w-4 mx-auto"/></button>
                </div>
              </div>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {modDlg.product.modifier_ids.map(mid => {
                  const m = modMap[mid]; if (!m) return null;
                  const on = modDlg.modifier_ids.includes(mid);
                  return (
                    <label key={mid} className={`flex items-center justify-between p-3 rounded-xl border-2 cursor-pointer transition-all ${on?"border-[#D45D3C] bg-[#F3E8E0]":"border-[#E5E0D8]"}`}>
                      <div className="flex items-center gap-3">
                        <Checkbox checked={on} onCheckedChange={(v)=>setModDlg(d=>({...d, modifier_ids: v?[...d.modifier_ids,mid]:d.modifier_ids.filter(x=>x!==mid)}))} data-testid={`mod-${mid}`}/>
                        <span className="font-medium">{m.name}</span>
                      </div>
                      {m.price_delta ? <span className="text-[#D45D3C] font-bold text-sm">+ S/ {m.price_delta.toFixed(2)}</span> : null}
                    </label>
                  );
                })}
              </div>
              <Input placeholder="Notas (ej: bien cocido)" value={modDlg.notes} onChange={e=>setModDlg(d=>({...d, notes:e.target.value}))} data-testid="mod-notes"/>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={()=>setModDlg(null)}>Cancelar</Button>
            <Button onClick={confirmModDlg} data-testid="confirm-mod-btn" className="bg-[#D45D3C] hover:bg-[#C04F30]"><CircleCheck className="h-4 w-4 mr-2"/>Agregar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmación eliminar item existente */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={(v)=>!v && setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar del pedido?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{deleteConfirm?.name}</strong> ya fue enviado a cocina. ¿Seguro que deseas eliminarlo del pedido?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-red-600 hover:bg-red-700">Sí, eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}
