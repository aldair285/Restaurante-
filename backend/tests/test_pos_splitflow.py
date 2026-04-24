"""Backend tests for iteration 3: admin-only login, KDS per-item done, Cashier partial-payment."""
import os
import pytest
import requests
import uuid

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"


# ---------- Fixtures ----------
@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{API}/auth/login", json={"email": "admin", "password": "admin"})
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def admin_h(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


def _create_role_user(admin_h, role):
    email = f"test_{role}_{uuid.uuid4().hex[:8]}@pos.test"
    pwd = "pass1234"
    r = requests.post(f"{API}/users", headers=admin_h, json={
        "email": email, "password": pwd, "name": f"Test {role}", "role": role
    })
    assert r.status_code == 200, f"create user {role} failed: {r.text}"
    login = requests.post(f"{API}/auth/login", json={"email": email, "password": pwd})
    assert login.status_code == 200
    return {"Authorization": f"Bearer {login.json()['token']}"}, r.json()["id"], email, pwd


@pytest.fixture(scope="module")
def waiter_h(admin_h):
    h, _, _, _ = _create_role_user(admin_h, "waiter")
    return h


@pytest.fixture(scope="module")
def cashier_h(admin_h):
    h, _, _, _ = _create_role_user(admin_h, "cashier")
    return h


@pytest.fixture(scope="module")
def kitchen_h(admin_h):
    h, _, _, _ = _create_role_user(admin_h, "kitchen")
    return h


@pytest.fixture
def fresh_order(admin_h, waiter_h):
    """Create an order with 3 items for isolated per-test use."""
    prods = requests.get(f"{API}/products", headers=admin_h).json()
    assert len(prods) >= 3
    body = {"table_number": 5, "items": [
        {"product_id": prods[0]["id"], "qty": 1, "modifier_ids": [], "notes": ""},
        {"product_id": prods[1]["id"], "qty": 2, "modifier_ids": [], "notes": ""},
        {"product_id": prods[2]["id"], "qty": 1, "modifier_ids": [], "notes": ""},
    ]}
    r = requests.post(f"{API}/orders", headers=waiter_h, json=body)
    assert r.status_code == 200, r.text
    yield r.json()
    # Cleanup: try to delete if still pending
    requests.delete(f"{API}/orders/{r.json()['id']}", headers=waiter_h)


# ---------- AUTH tests ----------
class TestAuth:
    def test_admin_login_returns_token_and_role(self):
        r = requests.post(f"{API}/auth/login", json={"email": "admin", "password": "admin"})
        assert r.status_code == 200
        d = r.json()
        assert "token" in d and isinstance(d["token"], str) and len(d["token"]) > 10
        assert d["user"]["role"] == "admin"
        assert d["user"]["email"] == "admin"

    @pytest.mark.parametrize("email", [
        "admin@pos.com", "mesero@pos.com", "caja@pos.com", "cocina@pos.com"
    ])
    def test_legacy_demo_users_removed(self, email):
        r = requests.post(f"{API}/auth/login", json={"email": email, "password": "admin123"})
        # Old demo seed passwords varied, but regardless user shouldn't exist
        assert r.status_code == 401, f"legacy user {email} should be removed, got {r.status_code}"

    def test_wrong_password(self):
        r = requests.post(f"{API}/auth/login", json={"email": "admin", "password": "wrong"})
        assert r.status_code == 401


# ---------- USERS CRUD ----------
class TestUsers:
    def test_admin_creates_role_users_and_they_can_login(self, admin_h):
        for role in ("waiter", "cashier", "kitchen"):
            h, uid, email, pwd = _create_role_user(admin_h, role)
            me = requests.get(f"{API}/auth/me", headers=h)
            assert me.status_code == 200
            assert me.json()["role"] == role
            # cleanup
            requests.delete(f"{API}/users/{uid}", headers=admin_h)

    def test_non_admin_cannot_create_user(self, waiter_h):
        r = requests.post(f"{API}/users", headers=waiter_h, json={
            "email": "x@x.com", "password": "x", "name": "x", "role": "waiter"
        })
        assert r.status_code == 403


# ---------- KDS per-item done ----------
class TestKDSItemDone:
    def test_kitchen_marks_item_done_advances_preparing(self, fresh_order, kitchen_h):
        oid = fresh_order["id"]
        r = requests.patch(f"{API}/orders/{oid}/items/0",
                           headers=kitchen_h, json={"field": "done", "value": True})
        assert r.status_code == 200, r.text
        o = r.json()
        assert o["items"][0]["done"] is True
        assert o["status"] == "preparing"

    def test_all_items_done_advances_ready(self, fresh_order, kitchen_h):
        oid = fresh_order["id"]
        for i in range(len(fresh_order["items"])):
            r = requests.patch(f"{API}/orders/{oid}/items/{i}",
                               headers=kitchen_h, json={"field": "done", "value": True})
            assert r.status_code == 200
        final = requests.get(f"{API}/orders/{oid}", headers=kitchen_h).json()
        assert final["status"] == "ready"
        assert all(it["done"] for it in final["items"])

    def test_waiter_cannot_toggle_done(self, fresh_order, waiter_h):
        r = requests.patch(f"{API}/orders/{fresh_order['id']}/items/0",
                           headers=waiter_h, json={"field": "done", "value": True})
        assert r.status_code == 403

    def test_cashier_cannot_toggle_done(self, fresh_order, cashier_h):
        r = requests.patch(f"{API}/orders/{fresh_order['id']}/items/0",
                           headers=cashier_h, json={"field": "done", "value": True})
        assert r.status_code == 403

    def test_invalid_index(self, fresh_order, kitchen_h):
        r = requests.patch(f"{API}/orders/{fresh_order['id']}/items/99",
                           headers=kitchen_h, json={"field": "done", "value": True})
        assert r.status_code == 400


# ---------- Partial payment ----------
class TestPartialPayment:
    def test_partial_pay_one_item_keeps_order_open(self, fresh_order, cashier_h):
        oid = fresh_order["id"]
        item0 = fresh_order["items"][0]
        r = requests.post(f"{API}/orders/{oid}/partial-payment", headers=cashier_h, json={
            "item_indexes": [0],
            "payment": {"method": "efectivo", "amount": item0["line_total"], "tip": 0},
        })
        assert r.status_code == 200, r.text
        o = r.json()
        assert o["items"][0]["paid"] is True
        assert o["items"][1]["paid"] is False
        assert o["paid"] is False  # not all paid

    def test_pay_all_items_autocloses_order(self, fresh_order, cashier_h):
        oid = fresh_order["id"]
        all_idx = list(range(len(fresh_order["items"])))
        total = sum(it["line_total"] for it in fresh_order["items"])
        r = requests.post(f"{API}/orders/{oid}/partial-payment", headers=cashier_h, json={
            "item_indexes": all_idx,
            "payment": {"method": "efectivo", "amount": total, "tip": 0},
        })
        assert r.status_code == 200
        o = r.json()
        assert o["paid"] is True
        assert o["closed_at"] is not None
        # Verify persistence via GET
        g = requests.get(f"{API}/orders/{oid}", headers=cashier_h).json()
        assert g["paid"] is True

    def test_cannot_pay_already_paid(self, fresh_order, cashier_h):
        oid = fresh_order["id"]
        it0 = fresh_order["items"][0]
        requests.post(f"{API}/orders/{oid}/partial-payment", headers=cashier_h, json={
            "item_indexes": [0],
            "payment": {"method": "efectivo", "amount": it0["line_total"], "tip": 0},
        })
        r = requests.post(f"{API}/orders/{oid}/partial-payment", headers=cashier_h, json={
            "item_indexes": [0],
            "payment": {"method": "efectivo", "amount": it0["line_total"], "tip": 0},
        })
        assert r.status_code == 400

    def test_waiter_cannot_partial_pay(self, fresh_order, waiter_h):
        r = requests.post(f"{API}/orders/{fresh_order['id']}/partial-payment", headers=waiter_h, json={
            "item_indexes": [0],
            "payment": {"method": "efectivo", "amount": 10, "tip": 0},
        })
        assert r.status_code == 403

    def test_kitchen_cannot_partial_pay(self, fresh_order, kitchen_h):
        r = requests.post(f"{API}/orders/{fresh_order['id']}/partial-payment", headers=kitchen_h, json={
            "item_indexes": [0],
            "payment": {"method": "efectivo", "amount": 10, "tip": 0},
        })
        assert r.status_code == 403

    def test_amount_less_than_selected_total_rejected(self, fresh_order, cashier_h):
        oid = fresh_order["id"]
        it0 = fresh_order["items"][0]
        r = requests.post(f"{API}/orders/{oid}/partial-payment", headers=cashier_h, json={
            "item_indexes": [0],
            "payment": {"method": "efectivo", "amount": it0["line_total"] - 5, "tip": 0},
        })
        assert r.status_code == 400

    def test_empty_indexes_rejected(self, fresh_order, cashier_h):
        r = requests.post(f"{API}/orders/{fresh_order['id']}/partial-payment", headers=cashier_h, json={
            "item_indexes": [],
            "payment": {"method": "efectivo", "amount": 0, "tip": 0},
        })
        assert r.status_code == 400


# ---------- Full close still works ----------
class TestFullClose:
    def test_close_order_full_payment(self, fresh_order, cashier_h):
        oid = fresh_order["id"]
        total = sum(it["line_total"] for it in fresh_order["items"])
        r = requests.post(f"{API}/orders/{oid}/close", headers=cashier_h, json={
            "discount": 0, "extra_charge": 0,
            "payments": [{"method": "efectivo", "amount": total, "tip": 0}],
        })
        assert r.status_code == 200
        assert r.json()["paid"] is True
