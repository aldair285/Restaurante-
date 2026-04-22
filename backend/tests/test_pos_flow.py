import os
import json
import asyncio
import pytest
import requests
import websockets

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://real-time-resto.preview.emergentagent.com').rstrip('/')
API = f"{BASE_URL}/api"

CREDS = {
    "admin": ("admin@pos.com", "admin123"),
    "waiter": ("mesero@pos.com", "mesero123"),
    "cashier": ("caja@pos.com", "caja123"),
    "kitchen": ("cocina@pos.com", "cocina123"),
}

def login(role):
    email, pw = CREDS[role]
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": pw}, timeout=20)
    assert r.status_code == 200, f"login {role} failed: {r.status_code} {r.text}"
    data = r.json()
    assert "token" in data and "user" in data
    assert data["user"]["role"] == role if role != "admin" else "admin"
    return data["token"], data["user"]

def H(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}

# ---------------- AUTH ----------------
class TestAuth:
    def test_login_all_roles(self):
        for role in CREDS:
            tok, user = login(role)
            assert tok and user["email"] == CREDS[role][0]

    def test_login_invalid(self):
        r = requests.post(f"{API}/auth/login", json={"email": "x@x.com", "password": "wrong"}, timeout=20)
        assert r.status_code == 401

    def test_me(self):
        tok, _ = login("admin")
        r = requests.get(f"{API}/auth/me", headers=H(tok), timeout=20)
        assert r.status_code == 200
        assert r.json()["role"] == "admin"

    def test_me_no_token(self):
        r = requests.get(f"{API}/auth/me", timeout=20)
        assert r.status_code == 401

# ---------------- ADMIN CRUD ----------------
class TestAdminCRUD:
    def test_list_categories_modifiers_products(self):
        tok, _ = login("waiter")
        for ep in ["categories", "modifiers", "products"]:
            r = requests.get(f"{API}/{ep}", headers=H(tok), timeout=20)
            assert r.status_code == 200
            assert isinstance(r.json(), list)
            assert len(r.json()) > 0, f"{ep} empty"

    def test_non_admin_cannot_create_product(self):
        tok, _ = login("waiter")
        r = requests.post(f"{API}/products", headers=H(tok), json={
            "name": "TEST_X", "price": 1.0, "category_id": "x"
        }, timeout=20)
        assert r.status_code == 403

    def test_admin_create_update_delete_product(self):
        tok, _ = login("admin")
        cats = requests.get(f"{API}/categories", headers=H(tok)).json()
        cid = cats[0]["id"]
        r = requests.post(f"{API}/products", headers=H(tok), json={
            "name": "TEST_Prod", "price": 9.5, "category_id": cid
        }, timeout=20)
        assert r.status_code == 200, r.text
        pid = r.json()["id"]
        assert r.json()["name"] == "TEST_Prod"

        r2 = requests.patch(f"{API}/products/{pid}", headers=H(tok), json={
            "name": "TEST_Prod2", "price": 11.0, "category_id": cid
        }, timeout=20)
        assert r2.status_code == 200
        assert r2.json()["price"] == 11.0

        r3 = requests.delete(f"{API}/products/{pid}", headers=H(tok), timeout=20)
        assert r3.status_code == 200

    def test_list_users_admin_only(self):
        tok_a, _ = login("admin")
        r = requests.get(f"{API}/users", headers=H(tok_a), timeout=20)
        assert r.status_code == 200
        assert len(r.json()) >= 4
        tok_w, _ = login("waiter")
        r2 = requests.get(f"{API}/users", headers=H(tok_w), timeout=20)
        assert r2.status_code == 403

# ---------------- TABLES ----------------
class TestTables:
    def test_tables_list(self):
        tok, _ = login("waiter")
        r = requests.get(f"{API}/tables", headers=H(tok), timeout=20)
        assert r.status_code == 200
        tables = r.json()
        assert len(tables) == 12
        assert all("number" in t and "status" in t for t in tables)

# ---------------- E2E ORDER FLOW + WS ----------------
class TestOrderFlow:
    def test_full_order_lifecycle(self):
        # waiter creates
        tok_w, uw = login("waiter")
        tok_k, _ = login("kitchen")
        tok_c, _ = login("cashier")

        prods = requests.get(f"{API}/products", headers=H(tok_w)).json()
        sang = next(p for p in prods if p["name"] == "Chicharrón Clásico")
        mods = requests.get(f"{API}/modifiers", headers=H(tok_w)).json()
        extra_queso = next(m for m in mods if m["name"] == "Extra queso")

        body = {
            "table_number": 5,
            "items": [
                {"product_id": sang["id"], "qty": 2, "modifier_ids": [extra_queso["id"]], "notes": "TEST_E2E"}
            ],
            "note": "TEST"
        }
        r = requests.post(f"{API}/orders", headers=H(tok_w), json=body, timeout=20)
        assert r.status_code == 200, r.text
        order = r.json()
        oid = order["id"]
        # totals = (18 + 3) * 2 = 42
        assert order["subtotal"] == 42.0
        assert order["status"] == "pending"
        assert order["paid"] is False

        # tables now occupied
        tables = requests.get(f"{API}/tables", headers=H(tok_w)).json()
        t5 = next(t for t in tables if t["number"] == 5)
        assert t5["status"] == "occupied"
        assert t5["order_id"] == oid

        # waiter cannot close
        r_close_w = requests.post(f"{API}/orders/{oid}/close", headers=H(tok_w),
                                  json={"discount":0,"extra_charge":0,"payments":[{"method":"efectivo","amount":42,"tip":0}]})
        assert r_close_w.status_code == 403

        # kitchen moves to preparing
        r2 = requests.patch(f"{API}/orders/{oid}/status?status=preparing", headers=H(tok_k), timeout=20)
        assert r2.status_code == 200
        assert r2.json()["status"] == "preparing"

        # ready
        r3 = requests.patch(f"{API}/orders/{oid}/status?status=ready", headers=H(tok_k), timeout=20)
        assert r3.status_code == 200
        assert r3.json()["status"] == "ready"

        # try close with insufficient amount
        r4 = requests.post(f"{API}/orders/{oid}/close", headers=H(tok_c),
                           json={"discount":0,"extra_charge":0,"payments":[{"method":"efectivo","amount":10,"tip":0}]})
        assert r4.status_code == 400

        # split close
        r5 = requests.post(f"{API}/orders/{oid}/close", headers=H(tok_c), json={
            "discount": 2.0, "extra_charge": 0.0,
            "payments": [
                {"method": "efectivo", "amount": 20, "tip": 0},
                {"method": "transferencia", "amount": 20, "tip": 2}
            ]
        }, timeout=20)
        assert r5.status_code == 200, r5.text
        closed = r5.json()
        assert closed["paid"] is True
        assert closed["total"] == 40.0

        # double close prevented
        r6 = requests.post(f"{API}/orders/{oid}/close", headers=H(tok_c), json={
            "discount":0,"extra_charge":0,"payments":[{"method":"efectivo","amount":40,"tip":0}]
        })
        assert r6.status_code == 400

        # ticket HTML
        r7 = requests.get(f"{API}/orders/{oid}/ticket", timeout=20)
        assert r7.status_code == 200
        assert "text/html" in r7.headers.get("content-type","")
        assert "TOTAL" in r7.text

    def test_ws_broadcast(self):
        async def run():
            ws_url = BASE_URL.replace("https://", "wss://").replace("http://", "ws://") + "/api/ws"
            tok_w, _ = login("waiter")
            prods = requests.get(f"{API}/products", headers=H(tok_w)).json()
            sang = prods[0]
            try:
                async with websockets.connect(ws_url, open_timeout=15) as ws:
                    # create order in background
                    async def create():
                        await asyncio.sleep(0.5)
                        requests.post(f"{API}/orders", headers=H(tok_w), json={
                            "table_number": 7,
                            "items":[{"product_id":sang["id"],"qty":1,"modifier_ids":[],"notes":""}]
                        }, timeout=15)
                    task = asyncio.create_task(create())
                    msg = await asyncio.wait_for(ws.recv(), timeout=10)
                    await task
                    data = json.loads(msg)
                    assert data["event"] == "order.new"
                    return True
            except Exception as e:
                pytest.fail(f"WS failed: {e}")
        asyncio.run(run())
