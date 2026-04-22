from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import os
import uuid
import json
import logging
import bcrypt
import jwt as pyjwt
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Dict, Any, Literal

from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, WebSocket, WebSocketDisconnect, Query
from fastapi.responses import HTMLResponse
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field

# -------- Setup --------
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI()
api = APIRouter(prefix="/api")

JWT_SECRET = os.environ['JWT_SECRET']
JWT_ALG = "HS256"

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# -------- Auth Helpers --------
def hash_password(p: str) -> str:
    return bcrypt.hashpw(p.encode(), bcrypt.gensalt()).decode()

def verify_password(p: str, h: str) -> bool:
    return bcrypt.checkpw(p.encode(), h.encode())

def create_token(user_id: str, role: str) -> str:
    payload = {
        "sub": user_id,
        "role": role,
        "exp": datetime.now(timezone.utc) + timedelta(days=7),
        "type": "access",
    }
    return pyjwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)

async def get_current_user(request: Request) -> dict:
    auth = request.headers.get("Authorization", "")
    token = auth[7:] if auth.startswith("Bearer ") else None
    if not token:
        raise HTTPException(401, "Not authenticated")
    try:
        payload = pyjwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
    except pyjwt.ExpiredSignatureError:
        raise HTTPException(401, "Token expired")
    except pyjwt.InvalidTokenError:
        raise HTTPException(401, "Invalid token")
    user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0, "password_hash": 0})
    if not user:
        raise HTTPException(401, "User not found")
    return user

def require_roles(*roles):
    async def _dep(user=Depends(get_current_user)):
        if user["role"] not in roles and user["role"] != "admin":
            raise HTTPException(403, "Forbidden")
        return user
    return _dep

# -------- Models --------
class LoginIn(BaseModel):
    email: str
    password: str

class UserCreate(BaseModel):
    email: str
    password: str
    name: str
    role: Literal["admin", "waiter", "cashier", "kitchen"]

class UserOut(BaseModel):
    id: str
    email: str
    name: str
    role: str

class Category(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    sort: int = 0

class CategoryIn(BaseModel):
    name: str
    sort: int = 0

class Modifier(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    price_delta: float = 0.0

class ModifierIn(BaseModel):
    name: str
    price_delta: float = 0.0

class Product(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    price: float
    category_id: str
    image: Optional[str] = None
    available: bool = True
    modifier_ids: List[str] = []
    is_combo: bool = False
    combo_items: List[str] = []  # product ids included in combo

class ProductIn(BaseModel):
    name: str
    price: float
    category_id: str
    image: Optional[str] = None
    available: bool = True
    modifier_ids: List[str] = []
    is_combo: bool = False
    combo_items: List[str] = []

class OrderItem(BaseModel):
    product_id: str
    name: str
    qty: int
    unit_price: float
    modifiers: List[Dict[str, Any]] = []  # [{id,name,price_delta}]
    notes: str = ""
    line_total: float

class OrderItemIn(BaseModel):
    product_id: str
    qty: int
    modifier_ids: List[str] = []
    notes: str = ""

class OrderCreate(BaseModel):
    table_number: Optional[int] = None
    items: List[OrderItemIn]
    note: str = ""

class OrderUpdate(BaseModel):
    items: Optional[List[OrderItemIn]] = None
    note: Optional[str] = None

class PaymentIn(BaseModel):
    method: Literal["efectivo", "transferencia", "otro"]
    amount: float
    tip: float = 0.0

class CloseIn(BaseModel):
    discount: float = 0.0
    extra_charge: float = 0.0
    payments: List[PaymentIn]

# -------- WebSocket Manager --------
class WSManager:
    def __init__(self):
        self.active: List[WebSocket] = []

    async def connect(self, ws: WebSocket):
        await ws.accept()
        self.active.append(ws)

    def disconnect(self, ws: WebSocket):
        if ws in self.active:
            self.active.remove(ws)

    async def broadcast(self, event: str, payload: dict):
        dead = []
        msg = json.dumps({"event": event, "payload": payload})
        for ws in self.active:
            try:
                await ws.send_text(msg)
            except Exception:
                dead.append(ws)
        for d in dead:
            self.disconnect(d)

manager = WSManager()

# -------- Utility --------
def clean(doc: dict) -> dict:
    if doc is None:
        return doc
    doc.pop("_id", None)
    return doc

async def compute_order_totals(items: List[OrderItemIn]) -> (List[dict], float):
    product_ids = list({i.product_id for i in items})
    prods = await db.products.find({"id": {"$in": product_ids}}, {"_id": 0}).to_list(1000)
    prod_map = {p["id"]: p for p in prods}

    all_mod_ids = list({m for i in items for m in i.modifier_ids})
    mods = await db.modifiers.find({"id": {"$in": all_mod_ids}}, {"_id": 0}).to_list(1000) if all_mod_ids else []
    mod_map = {m["id"]: m for m in mods}

    out_items = []
    total = 0.0
    for it in items:
        p = prod_map.get(it.product_id)
        if not p:
            raise HTTPException(400, f"Producto no encontrado: {it.product_id}")
        chosen_mods = [mod_map[mid] for mid in it.modifier_ids if mid in mod_map]
        mod_sum = sum(m["price_delta"] for m in chosen_mods)
        unit = p["price"] + mod_sum
        line = unit * it.qty
        out_items.append({
            "product_id": p["id"],
            "name": p["name"],
            "qty": it.qty,
            "unit_price": p["price"],
            "modifiers": [{"id": m["id"], "name": m["name"], "price_delta": m["price_delta"]} for m in chosen_mods],
            "notes": it.notes,
            "line_total": round(line, 2),
        })
        total += line
    return out_items, round(total, 2)

# ================= AUTH =================
@api.post("/auth/login")
async def login(body: LoginIn):
    user = await db.users.find_one({"email": body.email.lower().strip()})
    if not user or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(401, "Credenciales inválidas")
    token = create_token(user["id"], user["role"])
    return {
        "token": token,
        "user": {"id": user["id"], "email": user["email"], "name": user["name"], "role": user["role"]},
    }

@api.get("/auth/me", response_model=UserOut)
async def me(user=Depends(get_current_user)):
    return UserOut(**user)

# ================= USERS (admin) =================
@api.get("/users")
async def list_users(user=Depends(require_roles("admin"))):
    users = await db.users.find({}, {"_id": 0, "password_hash": 0}).to_list(1000)
    return users

@api.post("/users")
async def create_user(body: UserCreate, user=Depends(require_roles("admin"))):
    email = body.email.lower().strip()
    if await db.users.find_one({"email": email}):
        raise HTTPException(400, "Email ya registrado")
    u = {
        "id": str(uuid.uuid4()),
        "email": email,
        "name": body.name,
        "role": body.role,
        "password_hash": hash_password(body.password),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.users.insert_one(u)
    u.pop("password_hash")
    u.pop("_id", None)
    return u

@api.delete("/users/{user_id}")
async def delete_user(user_id: str, user=Depends(require_roles("admin"))):
    if user_id == user["id"]:
        raise HTTPException(400, "No puedes eliminarte a ti mismo")
    r = await db.users.delete_one({"id": user_id})
    if not r.deleted_count:
        raise HTTPException(404, "Usuario no encontrado")
    return {"ok": True}

# ================= CATEGORIES =================
@api.get("/categories")
async def list_categories(user=Depends(get_current_user)):
    return await db.categories.find({}, {"_id": 0}).sort("sort", 1).to_list(1000)

@api.post("/categories")
async def create_category(body: CategoryIn, user=Depends(require_roles("admin"))):
    c = Category(**body.model_dump()).model_dump()
    await db.categories.insert_one(c)
    return clean(c)

@api.delete("/categories/{cid}")
async def delete_category(cid: str, user=Depends(require_roles("admin"))):
    await db.categories.delete_one({"id": cid})
    return {"ok": True}

# ================= MODIFIERS =================
@api.get("/modifiers")
async def list_modifiers(user=Depends(get_current_user)):
    return await db.modifiers.find({}, {"_id": 0}).to_list(1000)

@api.post("/modifiers")
async def create_modifier(body: ModifierIn, user=Depends(require_roles("admin"))):
    m = Modifier(**body.model_dump()).model_dump()
    await db.modifiers.insert_one(m)
    return clean(m)

@api.delete("/modifiers/{mid}")
async def delete_modifier(mid: str, user=Depends(require_roles("admin"))):
    await db.modifiers.delete_one({"id": mid})
    return {"ok": True}

# ================= PRODUCTS =================
@api.get("/products")
async def list_products(user=Depends(get_current_user)):
    return await db.products.find({}, {"_id": 0}).to_list(1000)

@api.post("/products")
async def create_product(body: ProductIn, user=Depends(require_roles("admin"))):
    p = Product(**body.model_dump()).model_dump()
    await db.products.insert_one(p)
    return clean(p)

@api.patch("/products/{pid}")
async def update_product(pid: str, body: ProductIn, user=Depends(require_roles("admin"))):
    await db.products.update_one({"id": pid}, {"$set": body.model_dump()})
    p = await db.products.find_one({"id": pid}, {"_id": 0})
    return p

@api.delete("/products/{pid}")
async def delete_product(pid: str, user=Depends(require_roles("admin"))):
    await db.products.delete_one({"id": pid})
    return {"ok": True}

# ================= TABLES =================
@api.get("/tables")
async def list_tables(user=Depends(get_current_user)):
    # Tables are 1..12 (configurable) plus virtual "Para Llevar"
    tables = []
    for i in range(1, 13):
        order = await db.orders.find_one(
            {"table_number": i, "status": {"$in": ["pending", "preparing", "ready"]}},
            {"_id": 0}
        )
        tables.append({"number": i, "status": "occupied" if order else "free", "order_id": order["id"] if order else None})
    return tables

# ================= ORDERS =================
@api.post("/orders")
async def create_order(body: OrderCreate, user=Depends(require_roles("waiter", "cashier"))):
    items, total = await compute_order_totals(body.items)
    order = {
        "id": str(uuid.uuid4()),
        "code": f"#{datetime.now().strftime('%H%M%S')}",
        "table_number": body.table_number,
        "items": items,
        "note": body.note,
        "subtotal": total,
        "discount": 0.0,
        "extra_charge": 0.0,
        "total": total,
        "status": "pending",
        "created_by": user["id"],
        "created_by_name": user["name"],
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "payments": [],
        "paid": False,
        "closed_at": None,
    }
    await db.orders.insert_one(order)
    clean(order)
    await manager.broadcast("order.new", order)
    return order

@api.get("/orders")
async def list_orders(
    status: Optional[str] = Query(None),
    paid: Optional[bool] = Query(None),
    user=Depends(get_current_user),
):
    q: Dict[str, Any] = {}
    if status:
        if "," in status:
            q["status"] = {"$in": status.split(",")}
        else:
            q["status"] = status
    if paid is not None:
        q["paid"] = paid
    orders = await db.orders.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)
    return orders

@api.get("/orders/{oid}")
async def get_order(oid: str, user=Depends(get_current_user)):
    o = await db.orders.find_one({"id": oid}, {"_id": 0})
    if not o:
        raise HTTPException(404, "Pedido no encontrado")
    return o

@api.patch("/orders/{oid}")
async def update_order(oid: str, body: OrderUpdate, user=Depends(require_roles("waiter", "cashier"))):
    o = await db.orders.find_one({"id": oid})
    if not o:
        raise HTTPException(404, "Pedido no encontrado")
    if o["paid"]:
        raise HTTPException(400, "Pedido ya pagado")
    upd = {"updated_at": datetime.now(timezone.utc).isoformat()}
    if body.items is not None:
        items, total = await compute_order_totals(body.items)
        upd["items"] = items
        upd["subtotal"] = total
        upd["total"] = round(total - o.get("discount", 0.0) + o.get("extra_charge", 0.0), 2)
    if body.note is not None:
        upd["note"] = body.note
    await db.orders.update_one({"id": oid}, {"$set": upd})
    o2 = await db.orders.find_one({"id": oid}, {"_id": 0})
    await manager.broadcast("order.update", o2)
    return o2

@api.patch("/orders/{oid}/status")
async def set_status(oid: str, status: str = Query(...), user=Depends(require_roles("kitchen", "cashier", "waiter"))):
    if status not in ("pending", "preparing", "ready"):
        raise HTTPException(400, "Estado inválido")
    o = await db.orders.find_one({"id": oid})
    if not o:
        raise HTTPException(404, "Pedido no encontrado")
    await db.orders.update_one({"id": oid}, {"$set": {"status": status, "updated_at": datetime.now(timezone.utc).isoformat()}})
    o2 = await db.orders.find_one({"id": oid}, {"_id": 0})
    await manager.broadcast("order.status", o2)
    return o2

@api.post("/orders/{oid}/close")
async def close_order(oid: str, body: CloseIn, user=Depends(require_roles("cashier"))):
    o = await db.orders.find_one({"id": oid}, {"_id": 0})
    if not o:
        raise HTTPException(404, "Pedido no encontrado")
    if o.get("paid"):
        raise HTTPException(400, "Pedido ya pagado")
    total = round(o["subtotal"] - body.discount + body.extra_charge, 2)
    paid_sum = round(sum(p.amount for p in body.payments), 2)
    if paid_sum + 0.01 < total:
        raise HTTPException(400, f"Monto pagado ({paid_sum}) menor al total ({total})")
    upd = {
        "discount": body.discount,
        "extra_charge": body.extra_charge,
        "total": total,
        "payments": [p.model_dump() for p in body.payments],
        "paid": True,
        "closed_at": datetime.now(timezone.utc).isoformat(),
        "closed_by": user["name"],
    }
    await db.orders.update_one({"id": oid}, {"$set": upd})
    o2 = await db.orders.find_one({"id": oid}, {"_id": 0})
    await manager.broadcast("order.closed", o2)
    return o2

@api.delete("/orders/{oid}")
async def cancel_order(oid: str, user=Depends(require_roles("waiter", "cashier"))):
    o = await db.orders.find_one({"id": oid})
    if not o:
        raise HTTPException(404, "Pedido no encontrado")
    if o.get("paid"):
        raise HTTPException(400, "No se puede cancelar un pedido pagado")
    await db.orders.delete_one({"id": oid})
    await manager.broadcast("order.cancel", {"id": oid})
    return {"ok": True}

# ================= TICKET =================
@api.get("/orders/{oid}/ticket", response_class=HTMLResponse)
async def ticket(oid: str):
    o = await db.orders.find_one({"id": oid}, {"_id": 0})
    if not o:
        raise HTTPException(404, "Pedido no encontrado")
    rows = ""
    for it in o["items"]:
        mods = "".join(f"<div class='mod'>+ {m['name']}{(' (S/ '+str(m['price_delta'])+')') if m['price_delta'] else ''}</div>" for m in it["modifiers"])
        rows += f"""
        <tr>
          <td>{it['qty']}x {it['name']}{mods}{('<div class=mod>'+it['notes']+'</div>') if it.get('notes') else ''}</td>
          <td class='right'>S/ {it['line_total']:.2f}</td>
        </tr>"""
    pay_rows = "".join(f"<div>Pago ({p['method']}): S/ {p['amount']:.2f}</div>" for p in o.get("payments", []))
    html = f"""
<!doctype html>
<html><head><meta charset='utf-8'><title>Ticket {o['code']}</title>
<style>
body{{font-family:'Courier New',monospace;max-width:320px;margin:20px auto;color:#000;}}
h1{{text-align:center;font-size:18px;margin:0 0 6px;}}
.center{{text-align:center}} .right{{text-align:right}}
hr{{border:0;border-top:1px dashed #000;margin:8px 0}}
table{{width:100%;border-collapse:collapse;font-size:12px}}
td{{padding:4px 0;vertical-align:top}}
.mod{{font-size:11px;color:#444;margin-left:10px}}
.totals div{{display:flex;justify-content:space-between;font-size:13px}}
.totals .t{{font-weight:700;font-size:15px;margin-top:6px}}
@media print{{body{{margin:0}}.noprint{{display:none}}}}
</style></head><body>
<h1>SANGUCHERÍA POS</h1>
<div class='center'>Ticket {o['code']}</div>
<div class='center'>{datetime.fromisoformat(o['created_at']).strftime('%d/%m/%Y %H:%M')}</div>
<div class='center'>Mesa: {o['table_number'] or 'Para llevar'}</div>
<div class='center'>Atendió: {o.get('created_by_name','')}</div>
<hr/>
<table>{rows}</table>
<hr/>
<div class='totals'>
  <div><span>Subtotal</span><span>S/ {o['subtotal']:.2f}</span></div>
  <div><span>Descuento</span><span>- S/ {o.get('discount',0):.2f}</span></div>
  <div><span>Cargo extra</span><span>+ S/ {o.get('extra_charge',0):.2f}</span></div>
  <div class='t'><span>TOTAL</span><span>S/ {o['total']:.2f}</span></div>
</div>
<hr/>
{pay_rows}
<div class='center' style='margin-top:10px;'>¡Gracias por su visita!</div>
<div class='center noprint' style='margin-top:14px'>
  <button onclick='window.print()' style='padding:10px 16px;background:#D45D3C;color:#fff;border:0;border-radius:8px;cursor:pointer;font-size:14px'>Imprimir</button>
</div>
</body></html>"""
    return HTMLResponse(html)

# ================= WS =================
@app.websocket("/api/ws")
async def ws_endpoint(ws: WebSocket):
    await manager.connect(ws)
    try:
        while True:
            await ws.receive_text()  # keepalive / ignore
    except WebSocketDisconnect:
        manager.disconnect(ws)
    except Exception:
        manager.disconnect(ws)

# ================= STARTUP / SEED =================
async def seed_data():
    # Users
    seed_users = [
        {"email": os.environ["ADMIN_EMAIL"], "password": os.environ["ADMIN_PASSWORD"], "name": "Admin", "role": "admin"},
        {"email": "mesero@pos.com", "password": "mesero123", "name": "Mesero Demo", "role": "waiter"},
        {"email": "caja@pos.com", "password": "caja123", "name": "Cajero Demo", "role": "cashier"},
        {"email": "cocina@pos.com", "password": "cocina123", "name": "Cocina Demo", "role": "kitchen"},
    ]
    for u in seed_users:
        ex = await db.users.find_one({"email": u["email"]})
        if not ex:
            await db.users.insert_one({
                "id": str(uuid.uuid4()),
                "email": u["email"].lower(),
                "name": u["name"],
                "role": u["role"],
                "password_hash": hash_password(u["password"]),
                "created_at": datetime.now(timezone.utc).isoformat(),
            })

    # Categories
    if await db.categories.count_documents({}) == 0:
        cats = [
            {"id": str(uuid.uuid4()), "name": "Sánguches", "sort": 1},
            {"id": str(uuid.uuid4()), "name": "Acompañamientos", "sort": 2},
            {"id": str(uuid.uuid4()), "name": "Bebidas", "sort": 3},
            {"id": str(uuid.uuid4()), "name": "Combos", "sort": 4},
        ]
        await db.categories.insert_many(cats)
    cats = await db.categories.find({}, {"_id": 0}).to_list(100)
    cat_by_name = {c["name"]: c["id"] for c in cats}

    # Modifiers
    if await db.modifiers.count_documents({}) == 0:
        mods = [
            {"id": str(uuid.uuid4()), "name": "Sin cebolla", "price_delta": 0.0},
            {"id": str(uuid.uuid4()), "name": "Sin tomate", "price_delta": 0.0},
            {"id": str(uuid.uuid4()), "name": "Extra queso", "price_delta": 3.0},
            {"id": str(uuid.uuid4()), "name": "Extra tocino", "price_delta": 4.0},
            {"id": str(uuid.uuid4()), "name": "Palta", "price_delta": 2.5},
            {"id": str(uuid.uuid4()), "name": "Picante", "price_delta": 0.0},
        ]
        await db.modifiers.insert_many(mods)
    mods = await db.modifiers.find({}, {"_id": 0}).to_list(100)
    all_mod_ids = [m["id"] for m in mods]

    # Products
    IMG_BEEF = "https://static.prod-images.emergentagent.com/jobs/e2a7792c-50bd-435b-b799-85085d415e26/images/ff2f8d162feb9d4781c630f72cd3483b24b645a081e4f0f640b93e2b5a452e60.png"
    IMG_CHICKEN = "https://static.prod-images.emergentagent.com/jobs/e2a7792c-50bd-435b-b799-85085d415e26/images/d0da6e2bcbb28482c0834c06295bbd45c4e252473674abc6e4607bb99698f26f.png"
    IMG_SIDES = "https://static.prod-images.emergentagent.com/jobs/e2a7792c-50bd-435b-b799-85085d415e26/images/99971115974fa25948bfea9f498f457bb3c77827c0aaa8b4b2c1ca806b9c9f96.png"
    IMG_DRINKS = "https://static.prod-images.emergentagent.com/jobs/e2a7792c-50bd-435b-b799-85085d415e26/images/68eba858e5bb7163176da2f4a33bbea805fa0a6d98a1b5625aec57f83243058b.png"

    if await db.products.count_documents({}) == 0:
        prods = [
            {"id": str(uuid.uuid4()), "name": "Chicharrón Clásico", "price": 18.0, "category_id": cat_by_name["Sánguches"], "image": IMG_BEEF, "available": True, "modifier_ids": all_mod_ids, "is_combo": False, "combo_items": []},
            {"id": str(uuid.uuid4()), "name": "Lomo Saltado", "price": 22.0, "category_id": cat_by_name["Sánguches"], "image": IMG_BEEF, "available": True, "modifier_ids": all_mod_ids, "is_combo": False, "combo_items": []},
            {"id": str(uuid.uuid4()), "name": "Pollo a la Brasa", "price": 17.0, "category_id": cat_by_name["Sánguches"], "image": IMG_CHICKEN, "available": True, "modifier_ids": all_mod_ids, "is_combo": False, "combo_items": []},
            {"id": str(uuid.uuid4()), "name": "Club Sandwich", "price": 20.0, "category_id": cat_by_name["Sánguches"], "image": IMG_CHICKEN, "available": True, "modifier_ids": all_mod_ids, "is_combo": False, "combo_items": []},
            {"id": str(uuid.uuid4()), "name": "Papas Fritas", "price": 8.0, "category_id": cat_by_name["Acompañamientos"], "image": IMG_SIDES, "available": True, "modifier_ids": [], "is_combo": False, "combo_items": []},
            {"id": str(uuid.uuid4()), "name": "Yuquitas Fritas", "price": 9.0, "category_id": cat_by_name["Acompañamientos"], "image": IMG_SIDES, "available": True, "modifier_ids": [], "is_combo": False, "combo_items": []},
            {"id": str(uuid.uuid4()), "name": "Chicha Morada", "price": 6.0, "category_id": cat_by_name["Bebidas"], "image": IMG_DRINKS, "available": True, "modifier_ids": [], "is_combo": False, "combo_items": []},
            {"id": str(uuid.uuid4()), "name": "Inca Kola", "price": 5.0, "category_id": cat_by_name["Bebidas"], "image": IMG_DRINKS, "available": True, "modifier_ids": [], "is_combo": False, "combo_items": []},
            {"id": str(uuid.uuid4()), "name": "Combo Chicharrón", "price": 25.0, "category_id": cat_by_name["Combos"], "image": IMG_BEEF, "available": True, "modifier_ids": all_mod_ids, "is_combo": True, "combo_items": []},
            {"id": str(uuid.uuid4()), "name": "Combo Pollo", "price": 24.0, "category_id": cat_by_name["Combos"], "image": IMG_CHICKEN, "available": True, "modifier_ids": all_mod_ids, "is_combo": True, "combo_items": []},
        ]
        await db.products.insert_many(prods)

    await db.users.create_index("email", unique=True)
    await db.products.create_index("id", unique=True)
    await db.orders.create_index("id", unique=True)

@app.on_event("startup")
async def on_start():
    await seed_data()
    logger.info("POS backend started. Seed complete.")

app.include_router(api)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown():
    client.close()
