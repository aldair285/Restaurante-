import React, { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import AppShell from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Plus, Trash2, Pencil, Package, Tag, Sliders, Users as UsersIcon, BarChart3 } from "lucide-react";
import Reports from "@/pages/Reports";

export default function AdminDashboard() {
  const [tab, setTab] = useState("products");
  return (
    <AppShell title="Administración">
      <div className="h-full overflow-auto">
        <div className="max-w-7xl mx-auto p-6">
          <div className="mb-6">
            <h1 className="heading text-3xl font-bold">Back Office</h1>
            <p className="text-[#5E5E5E]">Gestiona la carta, modificadores, combos y usuarios. Los cambios se aplican en tiempo real.</p>
          </div>
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="bg-[#F3E8E0] p-1 h-12 rounded-xl">
              <TabsTrigger value="reports" className="h-10 px-4 rounded-lg data-[state=active]:bg-white" data-testid="tab-reports"><BarChart3 className="h-4 w-4 mr-2"/>Reportes</TabsTrigger>
              <TabsTrigger value="products" className="h-10 px-4 rounded-lg data-[state=active]:bg-white" data-testid="tab-products"><Package className="h-4 w-4 mr-2"/>Productos</TabsTrigger>
              <TabsTrigger value="categories" className="h-10 px-4 rounded-lg data-[state=active]:bg-white" data-testid="tab-categories"><Tag className="h-4 w-4 mr-2"/>Categorías</TabsTrigger>
              <TabsTrigger value="modifiers" className="h-10 px-4 rounded-lg data-[state=active]:bg-white" data-testid="tab-modifiers"><Sliders className="h-4 w-4 mr-2"/>Modificadores</TabsTrigger>
              <TabsTrigger value="users" className="h-10 px-4 rounded-lg data-[state=active]:bg-white" data-testid="tab-users"><UsersIcon className="h-4 w-4 mr-2"/>Usuarios</TabsTrigger>
            </TabsList>
            <TabsContent value="reports"><Reports/></TabsContent>
            <TabsContent value="products"><Products/></TabsContent>
            <TabsContent value="categories"><Categories/></TabsContent>
            <TabsContent value="modifiers"><Modifiers/></TabsContent>
            <TabsContent value="users"><Users/></TabsContent>
          </Tabs>
        </div>
      </div>
    </AppShell>
  );
}

// ---------- PRODUCTS ----------
function Products() {
  const [products, setProducts] = useState([]);
  const [cats, setCats] = useState([]);
  const [mods, setMods] = useState([]);
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState(null);

  const load = async () => {
    const [p, c, m] = await Promise.all([api.get("/products"), api.get("/categories"), api.get("/modifiers")]);
    setProducts(p.data); setCats(c.data); setMods(m.data);
  };
  useEffect(() => { load(); }, []);

  const openNew = () => { setEdit({ name:"", price:0, category_id: cats[0]?.id || "", image:"", available:true, modifier_ids:[], is_combo:false, combo_items:[] }); setOpen(true); };
  const openEdit = (p) => { setEdit({ ...p }); setOpen(true); };
  const save = async () => {
    try {
      if (!edit.name || !edit.category_id) return toast.error("Nombre y categoría obligatorios");
      const body = { ...edit, price: Number(edit.price) };
      if (edit.id) await api.patch(`/products/${edit.id}`, body);
      else await api.post("/products", body);
      toast.success("Producto guardado");
      setOpen(false); load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Error al guardar"); }
  };
  const del = async (id) => { if(!window.confirm("¿Eliminar producto?"))return; await api.delete(`/products/${id}`); toast.success("Eliminado"); load(); };

  const catName = (id) => cats.find(c=>c.id===id)?.name || "-";

  return (
    <div className="mt-6">
      <div className="flex justify-between items-center mb-4">
        <div className="text-sm text-[#5E5E5E]">{products.length} productos</div>
        <Button data-testid="add-product-btn" onClick={openNew} className="bg-[#D45D3C] hover:bg-[#C04F30] rounded-xl h-11"><Plus className="h-4 w-4 mr-2"/>Nuevo Producto</Button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {products.map(p => (
          <div key={p.id} className="card-surface p-4 flex gap-4 fade-up">
            <div className="h-20 w-20 rounded-xl bg-[#F3E8E0] overflow-hidden flex-shrink-0">
              {p.image ? <img src={p.image} alt={p.name} className="h-full w-full object-cover"/> : null}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex justify-between items-start">
                <div>
                  <div className="font-semibold truncate">{p.name}</div>
                  <div className="text-xs uppercase tracking-wider text-[#8A8A8A]">{catName(p.category_id)}{p.is_combo?" · Combo":""}</div>
                </div>
                <div className="font-bold text-[#D45D3C]">S/ {p.price.toFixed(2)}</div>
              </div>
              <div className="flex items-center gap-2 mt-3 text-xs">
                <span className={`px-2 py-1 rounded-full ${p.available?"bg-[#D4EDDA] text-[#155724]":"bg-[#F3E8E0] text-[#8A8A8A]"}`}>{p.available?"Disponible":"No disponible"}</span>
                <button onClick={()=>openEdit(p)} data-testid={`edit-product-${p.id}`} className="ml-auto h-8 w-8 rounded-lg border border-[#E5E0D8] hover:bg-[#F3E8E0] flex items-center justify-center"><Pencil className="h-3.5 w-3.5"/></button>
                <button onClick={()=>del(p.id)} data-testid={`delete-product-${p.id}`} className="h-8 w-8 rounded-lg border border-[#E5E0D8] hover:bg-red-50 text-red-600 flex items-center justify-center"><Trash2 className="h-3.5 w-3.5"/></button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{edit?.id ? "Editar Producto" : "Nuevo Producto"}</DialogTitle></DialogHeader>
          {edit && (
            <div className="space-y-3">
              <div><Label>Nombre</Label><Input data-testid="product-name" value={edit.name} onChange={e=>setEdit({...edit, name:e.target.value})}/></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Precio (S/)</Label><Input data-testid="product-price" type="number" step="0.1" value={edit.price} onChange={e=>setEdit({...edit, price:e.target.value})}/></div>
                <div>
                  <Label>Categoría</Label>
                  <Select value={edit.category_id} onValueChange={v=>setEdit({...edit, category_id:v})}>
                    <SelectTrigger data-testid="product-category"><SelectValue/></SelectTrigger>
                    <SelectContent>{cats.map(c=>(<SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>))}</SelectContent>
                  </Select>
                </div>
              </div>
              <div><Label>URL Imagen</Label><Input value={edit.image||""} onChange={e=>setEdit({...edit, image:e.target.value})} placeholder="https://..."/></div>
              <div className="flex items-center justify-between border rounded-xl p-3">
                <div><div className="font-semibold">Disponible</div><div className="text-xs text-[#8A8A8A]">Visible para meseros</div></div>
                <Switch checked={edit.available} onCheckedChange={v=>setEdit({...edit, available:v})}/>
              </div>
              <div className="flex items-center justify-between border rounded-xl p-3">
                <div><div className="font-semibold">Es combo</div><div className="text-xs text-[#8A8A8A]">Marca como combo</div></div>
                <Switch checked={edit.is_combo} onCheckedChange={v=>setEdit({...edit, is_combo:v})}/>
              </div>
              <div>
                <Label>Modificadores disponibles</Label>
                <div className="grid grid-cols-2 gap-2 mt-1 max-h-40 overflow-auto p-2 border rounded-xl">
                  {mods.map(m => (
                    <label key={m.id} className="flex items-center gap-2 text-sm cursor-pointer">
                      <Checkbox checked={edit.modifier_ids.includes(m.id)} onCheckedChange={(v)=>{
                        setEdit({...edit, modifier_ids: v ? [...edit.modifier_ids, m.id] : edit.modifier_ids.filter(x=>x!==m.id)});
                      }}/>
                      <span>{m.name} {m.price_delta?`(+S/${m.price_delta})`:""}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}
          <DialogFooter><Button variant="outline" onClick={()=>setOpen(false)}>Cancelar</Button><Button onClick={save} data-testid="save-product-btn" className="bg-[#D45D3C] hover:bg-[#C04F30]">Guardar</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------- CATEGORIES ----------
function Categories() {
  const [list, setList] = useState([]);
  const [name, setName] = useState("");
  const load = async () => setList((await api.get("/categories")).data);
  useEffect(()=>{load();},[]);
  const add = async () => { if(!name) return; await api.post("/categories",{name, sort:list.length+1}); setName(""); load(); };
  const del = async (id) => { await api.delete(`/categories/${id}`); load(); };
  return (
    <div className="mt-6 max-w-xl">
      <div className="flex gap-2 mb-4">
        <Input data-testid="category-name" placeholder="Nueva categoría" value={name} onChange={e=>setName(e.target.value)}/>
        <Button onClick={add} data-testid="add-category-btn" className="bg-[#D45D3C] hover:bg-[#C04F30]"><Plus className="h-4 w-4"/></Button>
      </div>
      <div className="space-y-2">
        {list.map(c => (
          <div key={c.id} className="card-surface p-3 flex justify-between items-center">
            <div className="font-medium">{c.name}</div>
            <button onClick={()=>del(c.id)} data-testid={`del-cat-${c.id}`} className="text-red-600 hover:bg-red-50 h-8 w-8 rounded-lg flex items-center justify-center"><Trash2 className="h-4 w-4"/></button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------- MODIFIERS ----------
function Modifiers() {
  const [list, setList] = useState([]);
  const [name, setName] = useState("");
  const [price, setPrice] = useState(0);
  const load = async () => setList((await api.get("/modifiers")).data);
  useEffect(()=>{load();},[]);
  const add = async () => { if(!name) return; await api.post("/modifiers",{name, price_delta:Number(price)||0}); setName(""); setPrice(0); load(); };
  const del = async (id) => { await api.delete(`/modifiers/${id}`); load(); };
  return (
    <div className="mt-6 max-w-xl">
      <div className="flex gap-2 mb-4">
        <Input placeholder="Nombre (ej: Extra queso)" value={name} onChange={e=>setName(e.target.value)} data-testid="mod-name"/>
        <Input type="number" step="0.1" placeholder="Costo +" value={price} onChange={e=>setPrice(e.target.value)} data-testid="mod-price" className="w-32"/>
        <Button onClick={add} data-testid="add-mod-btn" className="bg-[#D45D3C] hover:bg-[#C04F30]"><Plus className="h-4 w-4"/></Button>
      </div>
      <div className="space-y-2">
        {list.map(m => (
          <div key={m.id} className="card-surface p-3 flex justify-between items-center">
            <div className="font-medium">{m.name} <span className="text-[#8A8A8A] text-sm">{m.price_delta?`+ S/ ${m.price_delta.toFixed(2)}`:""}</span></div>
            <button onClick={()=>del(m.id)} className="text-red-600 hover:bg-red-50 h-8 w-8 rounded-lg flex items-center justify-center"><Trash2 className="h-4 w-4"/></button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------- USERS ----------
function Users() {
  const [list, setList] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name:"", email:"", password:"", role:"waiter" });
  const load = async () => setList((await api.get("/users")).data);
  useEffect(()=>{load();},[]);
  const save = async () => {
    try {
      await api.post("/users", form);
      toast.success("Usuario creado");
      setForm({ name:"", email:"", password:"", role:"waiter" }); setOpen(false); load();
    } catch(e){ toast.error(e?.response?.data?.detail || "Error"); }
  };
  const del = async (id) => { if(!window.confirm("¿Eliminar?")) return; await api.delete(`/users/${id}`); load(); };

  const roleBadge = { admin:"bg-[#F3E8E0] text-[#D45D3C]", waiter:"bg-blue-50 text-blue-700", cashier:"bg-emerald-50 text-emerald-700", kitchen:"bg-amber-50 text-amber-700" };

  return (
    <div className="mt-6">
      <div className="flex justify-end mb-4">
        <Button onClick={()=>setOpen(true)} data-testid="add-user-btn" className="bg-[#D45D3C] hover:bg-[#C04F30]"><Plus className="h-4 w-4 mr-2"/>Nuevo Usuario</Button>
      </div>
      <div className="space-y-2">
        {list.map(u => (
          <div key={u.id} className="card-surface p-4 flex justify-between items-center">
            <div>
              <div className="font-semibold">{u.name}</div>
              <div className="text-sm text-[#5E5E5E]">{u.email}</div>
            </div>
            <div className="flex items-center gap-3">
              <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${roleBadge[u.role]||""}`}>{u.role}</span>
              <button onClick={()=>del(u.id)} className="text-red-600 hover:bg-red-50 h-9 w-9 rounded-lg flex items-center justify-center"><Trash2 className="h-4 w-4"/></button>
            </div>
          </div>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Nuevo Usuario</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Nombre</Label><Input value={form.name} onChange={e=>setForm({...form,name:e.target.value})} data-testid="user-name"/></div>
            <div><Label>Email</Label><Input value={form.email} onChange={e=>setForm({...form,email:e.target.value})} data-testid="user-email"/></div>
            <div><Label>Contraseña</Label><Input type="password" value={form.password} onChange={e=>setForm({...form,password:e.target.value})} data-testid="user-password"/></div>
            <div>
              <Label>Rol</Label>
              <Select value={form.role} onValueChange={v=>setForm({...form, role:v})}>
                <SelectTrigger data-testid="user-role"><SelectValue/></SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="waiter">Mesero</SelectItem>
                  <SelectItem value="cashier">Caja</SelectItem>
                  <SelectItem value="kitchen">Cocina</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter><Button variant="outline" onClick={()=>setOpen(false)}>Cancelar</Button><Button onClick={save} data-testid="save-user-btn" className="bg-[#D45D3C] hover:bg-[#C04F30]">Crear</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
