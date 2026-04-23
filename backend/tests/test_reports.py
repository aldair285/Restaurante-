import os
from datetime import datetime, timezone, timedelta
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://real-time-resto.preview.emergentagent.com').rstrip('/')
API = f"{BASE_URL}/api"

CREDS = {
    "admin": ("admin@pos.com", "admin123"),
    "waiter": ("mesero@pos.com", "mesero123"),
    "cashier": ("caja@pos.com", "caja123"),
    "kitchen": ("cocina@pos.com", "cocina123"),
}

def _login(role):
    email, pw = CREDS[role]
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": pw}, timeout=20)
    assert r.status_code == 200, r.text
    return r.json()["token"]

def _H(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def admin_tok():
    return _login("admin")

@pytest.fixture(scope="module")
def date_range():
    now = datetime.now(timezone.utc)
    frm = (now - timedelta(days=30)).isoformat()
    to = (now + timedelta(days=1)).isoformat()
    return frm, to


# ---------- KPIs ----------
class TestKPIs:
    def test_kpis_admin(self, admin_tok):
        r = requests.get(f"{API}/reports/kpis", headers=_H(admin_tok), timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        for key in ["today", "yesterday", "week", "prev_week", "month", "prev_month", "year", "prev_year"]:
            assert key in data, f"missing {key}"
            for sub in ("sales", "orders", "avg_ticket"):
                assert sub in data[key], f"{key} missing {sub}"
            assert isinstance(data[key]["orders"], int)
        # We seeded ~270 orders in last 30 days -> month should be > 0
        assert data["month"]["orders"] > 0
        assert data["month"]["sales"] > 0

    @pytest.mark.parametrize("role", ["waiter", "cashier", "kitchen"])
    def test_kpis_non_admin_403(self, role):
        tok = _login(role)
        r = requests.get(f"{API}/reports/kpis", headers=_H(tok), timeout=20)
        assert r.status_code == 403


# ---------- Timeseries ----------
class TestTimeseries:
    def test_timeseries_day(self, admin_tok, date_range):
        frm, to = date_range
        r = requests.get(f"{API}/reports/timeseries", headers=_H(admin_tok),
                         params={"from": frm, "to": to, "bucket": "day"}, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data, list)
        assert len(data) > 0
        # sorted asc by date
        dates = [d["date"] for d in data]
        assert dates == sorted(dates)
        for row in data:
            assert {"date", "sales", "orders"} <= row.keys()
            # day bucket key format YYYY-MM-DD
            assert len(row["date"]) == 10

    def test_timeseries_hour(self, admin_tok):
        now = datetime.now(timezone.utc)
        frm = (now - timedelta(days=2)).isoformat()
        to = (now + timedelta(hours=1)).isoformat()
        r = requests.get(f"{API}/reports/timeseries", headers=_H(admin_tok),
                         params={"from": frm, "to": to, "bucket": "hour"}, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data, list)
        # If there are entries, they should be hour-bucketed (YYYY-MM-DD HH:00)
        for row in data:
            assert ":00" in row["date"], row

    def test_timeseries_missing_params_422(self, admin_tok):
        r = requests.get(f"{API}/reports/timeseries", headers=_H(admin_tok), timeout=20)
        assert r.status_code == 422


# ---------- Products ----------
class TestProducts:
    def test_products_top_bottom(self, admin_tok, date_range):
        frm, to = date_range
        r = requests.get(f"{API}/reports/products", headers=_H(admin_tok),
                         params={"from": frm, "to": to, "limit": 5}, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert {"top", "bottom", "total_products"} <= data.keys()
        assert isinstance(data["top"], list)
        assert isinstance(data["bottom"], list)
        assert len(data["top"]) <= 5
        assert len(data["bottom"]) <= 5
        # top sorted desc by revenue
        if len(data["top"]) > 1:
            revs = [t["revenue"] for t in data["top"]]
            assert revs == sorted(revs, reverse=True)
        for t in data["top"]:
            assert {"product_id", "name", "qty", "revenue"} <= t.keys()


# ---------- Hourly ----------
class TestHourly:
    def test_hourly_24(self, admin_tok, date_range):
        frm, to = date_range
        r = requests.get(f"{API}/reports/hourly", headers=_H(admin_tok),
                         params={"from": frm, "to": to}, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data, list)
        assert len(data) == 24
        hours = [d["hour"] for d in data]
        assert hours == list(range(24))
        for row in data:
            assert {"hour", "sales", "orders"} <= row.keys()


# ---------- Weekday ----------
class TestWeekday:
    def test_weekday_7(self, admin_tok, date_range):
        frm, to = date_range
        r = requests.get(f"{API}/reports/weekday", headers=_H(admin_tok),
                         params={"from": frm, "to": to}, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert len(data) == 7
        labels = [d["label"] for d in data]
        assert labels == ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"]
        for row in data:
            assert {"weekday", "label", "sales", "orders"} <= row.keys()


# ---------- Payment methods ----------
class TestPaymentMethods:
    def test_payment_methods(self, admin_tok, date_range):
        frm, to = date_range
        r = requests.get(f"{API}/reports/payment-methods", headers=_H(admin_tok),
                         params={"from": frm, "to": to}, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data, list)
        assert len(data) > 0
        for row in data:
            assert {"method", "amount", "count"} <= row.keys()
            assert row["method"] in ("efectivo", "transferencia", "otro")
            assert row["count"] > 0


# ---------- Orders list ----------
class TestOrdersList:
    def test_orders_sorted_desc(self, admin_tok, date_range):
        frm, to = date_range
        r = requests.get(f"{API}/reports/orders", headers=_H(admin_tok),
                         params={"from": frm, "to": to, "limit": 50}, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data, list)
        assert len(data) > 0
        closed_ats = [o["closed_at"] for o in data]
        assert closed_ats == sorted(closed_ats, reverse=True)
        for o in data:
            assert o["paid"] is True
            assert "total" in o and "items" in o

    @pytest.mark.parametrize("role", ["waiter", "cashier", "kitchen"])
    def test_orders_non_admin_403(self, role, date_range):
        frm, to = date_range
        tok = _login(role)
        r = requests.get(f"{API}/reports/orders", headers=_H(tok),
                         params={"from": frm, "to": to}, timeout=20)
        assert r.status_code == 403


# ---------- Seed idempotency ----------
class TestSeedIdempotent:
    def test_seed_count_stable_across_restart_marker(self, admin_tok, date_range):
        # Just verify no duplicate explosion: count of seed orders should be reasonable (<=600)
        frm, to = date_range
        r = requests.get(f"{API}/reports/orders", headers=_H(admin_tok),
                         params={"from": frm, "to": to, "limit": 1000}, timeout=30)
        assert r.status_code == 200
        seed_count = sum(1 for o in r.json() if o.get("created_by") == "seed")
        assert seed_count > 0
        assert seed_count < 600, f"seed orders may have duplicated: {seed_count}"
