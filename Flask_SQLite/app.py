"""Mercado & Finanças — edição Flask + SQLite.

O banco SQLite é criado automaticamente em instance/mercado_financas.sqlite3.
O aplicativo é destinado a uso local e não expõe a interface na rede por padrão.
"""
from __future__ import annotations

import json
import os
import re
import sqlite3
import unicodedata
import uuid
from datetime import datetime, timezone
from difflib import SequenceMatcher
from pathlib import Path
from typing import Any

from flask import Flask, current_app, jsonify, request, send_from_directory, g

BASE_DIR = Path(__file__).resolve().parent
SCHEMA = """
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    name_key TEXT NOT NULL UNIQUE,
    product_code TEXT NOT NULL UNIQUE,
    barcode TEXT NOT NULL UNIQUE,
    category TEXT NOT NULL DEFAULT 'outros',
    icon TEXT NOT NULL DEFAULT '',
    purchase_qty REAL NOT NULL CHECK (purchase_qty > 0),
    purchase_unit TEXT NOT NULL,
    total_price REAL NOT NULL CHECK (total_price >= 0),
    base_unit TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_products_code ON products(product_code);

CREATE TABLE IF NOT EXISTS transactions (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL CHECK (type IN ('income','expense')),
    description TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'outros',
    amount REAL NOT NULL CHECK (amount > 0),
    date TEXT NOT NULL,
    notes TEXT NOT NULL DEFAULT '',
    source TEXT NOT NULL DEFAULT 'manual',
    source_id TEXT,
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);

CREATE TABLE IF NOT EXISTS services (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    labor_cost REAL NOT NULL DEFAULT 0,
    gas_cost REAL NOT NULL DEFAULT 0,
    energy_cost REAL NOT NULL DEFAULT 0,
    other_cost REAL NOT NULL DEFAULT 0,
    ingredients_cost REAL NOT NULL DEFAULT 0,
    total_cost REAL NOT NULL DEFAULT 0,
    selling_price REAL NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS service_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    service_id TEXT NOT NULL REFERENCES services(id) ON DELETE CASCADE,
    product_id TEXT,
    product_name TEXT NOT NULL,
    quantity REAL NOT NULL,
    unit TEXT NOT NULL,
    unit_cost_base REAL NOT NULL DEFAULT 0,
    base_unit TEXT NOT NULL DEFAULT 'un',
    cost REAL NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_service_items_service ON service_items(service_id);

CREATE TABLE IF NOT EXISTS service_runs (
    id TEXT PRIMARY KEY,
    service_id TEXT,
    name TEXT NOT NULL,
    date TEXT NOT NULL,
    items_json TEXT NOT NULL DEFAULT '[]',
    total_cost REAL NOT NULL,
    selling_price REAL NOT NULL DEFAULT 0,
    transaction_id TEXT
);

CREATE TABLE IF NOT EXISTS obligations (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    monthly_amount REAL NOT NULL CHECK (monthly_amount > 0),
    total_amount REAL NOT NULL DEFAULT 0,
    installments_count INTEGER NOT NULL DEFAULT 0,
    recurring INTEGER NOT NULL DEFAULT 0 CHECK (recurring IN (0,1)),
    start_year INTEGER NOT NULL,
    start_month INTEGER NOT NULL CHECK (start_month BETWEEN 1 AND 12),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS obligation_installments (
    id TEXT PRIMARY KEY,
    obligation_id TEXT NOT NULL REFERENCES obligations(id) ON DELETE CASCADE,
    year_month TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('paid','pending')),
    launched INTEGER NOT NULL DEFAULT 0 CHECK (launched IN (0,1)),
    paid_date TEXT,
    transaction_id TEXT,
    UNIQUE(obligation_id, year_month)
);

CREATE TABLE IF NOT EXISTS purchases (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    status TEXT NOT NULL,
    items_json TEXT NOT NULL DEFAULT '[]',
    total REAL NOT NULL,
    created_at TEXT NOT NULL,
    added_to_finance INTEGER NOT NULL DEFAULT 0,
    transaction_id TEXT
);
CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
"""


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex}"


def normalize_name(value: Any) -> str:
    text = unicodedata.normalize("NFD", str(value or ""))
    text = "".join(ch for ch in text if unicodedata.category(ch) != "Mn")
    return re.sub(r"\s+", " ", re.sub(r"[^a-zA-Z0-9]+", " ", text.lower())).strip()


def base_unit_for(unit: str) -> str:
    if unit in ("g", "kg"):
        return "g"
    if unit in ("ml", "L"):
        return "ml"
    return "un"


def ean13_for(sequence: int) -> str:
    body = f"200{sequence:09d}"[-12:]
    weighted_sum = sum(int(digit) * (1 if index % 2 == 0 else 3) for index, digit in enumerate(body))
    return body + str((10 - weighted_sum % 10) % 10)


def valid_ean13(value: str) -> bool:
    if not re.fullmatch(r"\d{13}", value):
        return False
    weighted_sum = sum(int(digit) * (1 if index % 2 == 0 else 3) for index, digit in enumerate(value))
    return weighted_sum % 10 == 0


def safe_float(value: Any, field: str, minimum: float | None = None) -> float:
    try:
        result = float(value)
    except (TypeError, ValueError):
        raise ValueError(f"Campo inválido: {field}.")
    if result != result or result in (float("inf"), float("-inf")):
        raise ValueError(f"Campo inválido: {field}.")
    if minimum is not None and result < minimum:
        raise ValueError(f"O campo {field} não pode ser menor que {minimum}.")
    return round(result, 2) if field not in ("purchaseQty", "quantity") else result


def get_db() -> sqlite3.Connection:
    if "db" not in g:
        path = current_app.config["DATABASE"]
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        connection = sqlite3.connect(path, timeout=15)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        connection.execute("PRAGMA journal_mode = WAL")
        g.db = connection
    return g.db


def close_db(_error: BaseException | None = None) -> None:
    connection = g.pop("db", None)
    if connection is not None:
        connection.close()


def init_db() -> None:
    db = get_db()
    db.executescript(SCHEMA)
    db.commit()


def as_json(value: str | None, fallback: Any) -> Any:
    try:
        return json.loads(value) if value else fallback
    except (TypeError, json.JSONDecodeError):
        return fallback


def read_state() -> dict[str, Any]:
    db = get_db()
    products = [dict(row) for row in db.execute("SELECT * FROM products ORDER BY id")]
    for product in products:
        product["purchaseQty"] = product.pop("purchase_qty")
        product["purchaseUnit"] = product.pop("purchase_unit")
        product["totalPrice"] = product.pop("total_price")
        product["baseUnit"] = product.pop("base_unit")
        product["productCode"] = product.pop("product_code")
        product["createdAt"] = product.pop("created_at")
        product["updatedAt"] = product.pop("updated_at")
        product.pop("name_key", None)

    transactions = []
    for row in db.execute("SELECT * FROM transactions ORDER BY date DESC, rowid DESC"):
        item = dict(row)
        for old, new in (("source_id", "sourceId"), ("created_at", "createdAt")):
            item[new] = item.pop(old)
        transactions.append(item)

    services = []
    for row in db.execute("SELECT * FROM services ORDER BY created_at DESC"):
        item = dict(row)
        item["items"] = []
        for field, name in (("labor_cost", "laborCost"), ("gas_cost", "gasCost"), ("energy_cost", "energyCost"),
                            ("other_cost", "otherCost"), ("ingredients_cost", "ingredients"),
                            ("total_cost", "totalCost"), ("selling_price", "sellingPrice"),
                            ("created_at", "createdAt"), ("updated_at", "updatedAt")):
            item[name] = item.pop(field)
        for line in db.execute("SELECT * FROM service_items WHERE service_id=? ORDER BY id", (item["id"],)):
            ingredient = dict(line)
            ingredient.pop("id", None)
            ingredient.pop("service_id", None)
            for old, new in (("product_id", "productId"), ("product_name", "productName"),
                             ("unit_cost_base", "unitCostBase"), ("base_unit", "baseUnit")):
                ingredient[new] = ingredient.pop(old)
            item["items"].append(ingredient)
        services.append(item)

    service_runs = []
    for row in db.execute("SELECT * FROM service_runs ORDER BY date DESC"):
        item = dict(row)
        item["items"] = as_json(item.pop("items_json"), [])
        for old, new in (("service_id", "serviceId"), ("total_cost", "totalCost"),
                         ("selling_price", "sellingPrice"), ("transaction_id", "transactionId")):
            item[new] = item.pop(old)
        service_runs.append(item)

    obligations = []
    for row in db.execute("SELECT * FROM obligations ORDER BY start_year, start_month, name"):
        item = dict(row)
        for old, new in (("monthly_amount", "monthlyAmount"), ("total_amount", "totalAmount"),
                         ("installments_count", "installmentsCount"), ("start_year", "startYear"),
                         ("start_month", "startMonth"), ("created_at", "createdAt"), ("updated_at", "updatedAt")):
            item[new] = item.pop(old)
        item["recurring"] = bool(item["recurring"])
        obligations.append(item)

    installments = []
    for row in db.execute("SELECT * FROM obligation_installments ORDER BY year_month"):
        item = dict(row)
        for old, new in (("obligation_id", "obligationId"), ("year_month", "yearMonth"),
                         ("paid_date", "paidDate"), ("transaction_id", "transactionId")):
            item[new] = item.pop(old)
        item["launched"] = bool(item["launched"])
        installments.append(item)

    purchases = []
    for row in db.execute("SELECT * FROM purchases ORDER BY created_at DESC"):
        item = dict(row)
        item["items"] = as_json(item.pop("items_json"), [])
        for old, new in (("created_at", "createdAt"), ("added_to_finance", "addedToFinance"),
                         ("transaction_id", "transactionId")):
            item[new] = item.pop(old)
        item["addedToFinance"] = bool(item["addedToFinance"])
        purchases.append(item)

    settings = {row["key"]: as_json(row["value"], row["value"]) for row in db.execute("SELECT * FROM app_settings")}
    active_cart = settings.pop("activeCart", [])
    return {"version": 2, "settings": settings, "products": products,
            "transactions": transactions, "services": services, "serviceRuns": service_runs,
            "obligations": obligations, "installments": installments,
            "purchases": purchases, "activeCart": active_cart}


def save_state(data: dict[str, Any]) -> None:
    if not isinstance(data, dict):
        raise ValueError("O corpo enviado precisa ser um objeto JSON.")
    db = get_db()
    products = data.get("products") or []
    transactions = data.get("transactions") or []
    services = data.get("services") or []
    service_runs = data.get("serviceRuns") or []
    obligations = data.get("obligations") or []
    installments = data.get("installments") or []
    purchases = data.get("purchases") or []
    if not all(isinstance(collection, list) for collection in (products, transactions, services, service_runs, obligations, installments, purchases)):
        raise ValueError("Uma das coleções enviadas possui formato inválido.")
    if len(products) > 20000 or len(transactions) > 100000 or len(services) > 20000 or len(obligations) > 20000:
        raise ValueError("O backup excede o limite de registros aceito.")

    try:
        db.execute("BEGIN IMMEDIATE")
        for table in ("service_items", "service_runs", "obligation_installments", "transactions", "purchases",
                      "services", "obligations", "products", "app_settings"):
            db.execute(f"DELETE FROM {table}")

        seen_names: set[str] = set()
        seen_codes: set[str] = set()
        seen_barcodes: set[str] = set()
        for index, product in enumerate(products, start=1):
            name = str(product.get("name") or "").strip()
            name_key = normalize_name(name)
            if not name or not name_key:
                raise ValueError("Todo produto precisa ter um nome.")
            if name_key in seen_names:
                raise ValueError(f"Produto duplicado: já existe um item com o nome '{name}'.")
            seen_names.add(name_key)
            product_code = str(product.get("productCode") or f"PRD-{index:06d}").strip().upper()
            barcode = str(product.get("barcode") or ean13_for(index)).strip()
            if not re.fullmatch(r"PRD-\d{6,}", product_code):
                raise ValueError(f"Código interno fora do padrão: {product_code}.")
            if not valid_ean13(barcode):
                raise ValueError(f"Código de barras EAN-13 inválido para o produto '{name}'.")
            if product_code in seen_codes or barcode in seen_barcodes:
                raise ValueError(f"Código ou código de barras duplicado no produto '{name}'.")
            seen_codes.add(product_code); seen_barcodes.add(barcode)
            unit = str(product.get("purchaseUnit") or product.get("unit") or "un")
            quantity = safe_float(product.get("purchaseQty", 1), "purchaseQty", 0.000001)
            price = safe_float(product.get("totalPrice", product.get("price", 0)), "totalPrice", 0)
            created = str(product.get("createdAt") or utc_now())
            updated = str(product.get("updatedAt") or utc_now())
            db.execute("""INSERT INTO products
                (id,name,name_key,product_code,barcode,category,icon,purchase_qty,purchase_unit,total_price,base_unit,created_at,updated_at)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (str(product.get("id") or new_id("prod")), name, name_key, product_code, barcode,
                 str(product.get("category") or "outros"), str(product.get("icon") or ""), quantity, unit,
                 price, str(product.get("baseUnit") or base_unit_for(unit)), created, updated))

        for tx in transactions:
            kind = str(tx.get("type") or "expense")
            description = str(tx.get("description") or "").strip()
            amount = safe_float(tx.get("amount"), "amount", 0.000001)
            if kind not in ("income", "expense") or not description:
                raise ValueError("Movimentação inválida: informe tipo, descrição e valor.")
            db.execute("""INSERT INTO transactions
                (id,type,description,category,amount,date,notes,source,source_id,created_at)
                VALUES (?,?,?,?,?,?,?,?,?,?)""",
                (str(tx.get("id") or new_id("tx")), kind, description, str(tx.get("category") or "outros"), amount,
                 str(tx.get("date") or utc_now()), str(tx.get("notes") or ""), str(tx.get("source") or "manual"),
                 tx.get("sourceId"), str(tx.get("createdAt") or utc_now())))

        for service in services:
            name = str(service.get("name") or "").strip()
            if not name:
                raise ValueError("Toda ficha de serviço precisa ter um nome.")
            service_id = str(service.get("id") or new_id("service"))
            labor = safe_float(service.get("laborCost", 0), "laborCost", 0)
            gas = safe_float(service.get("gasCost", 0), "gasCost", 0)
            energy = safe_float(service.get("energyCost", 0), "energyCost", 0)
            other = safe_float(service.get("otherCost", 0), "otherCost", 0)
            selling = safe_float(service.get("sellingPrice", 0), "sellingPrice", 0)
            item_rows = []
            ingredients_total = 0.0
            unit_factors = {"g": ("mass", 1), "kg": ("mass", 1000), "ml": ("volume", 1), "L": ("volume", 1000), "un": ("count", 1)}
            for item in service.get("items") or []:
                product_id = item.get("productId")
                product_name = str(item.get("productName") or "Ingrediente")
                quantity = safe_float(item.get("quantity", 0), "quantity", 0.000001)
                unit = str(item.get("unit") or "un")
                base_unit = str(item.get("baseUnit") or "un")
                if unit not in unit_factors:
                    raise ValueError(f"Unidade de consumo inválida: {unit}.")
                group, factor = unit_factors[unit]
                if product_id:
                    product_row = db.execute("SELECT * FROM products WHERE id=?", (str(product_id),)).fetchone()
                else:
                    product_row = None
                if product_row:
                    purchase_unit = product_row["purchase_unit"]
                    if purchase_unit not in unit_factors or unit_factors[purchase_unit][0] != group:
                        raise ValueError(f"Unidade incompatível para o produto {product_name}.")
                    purchase_factor = unit_factors[purchase_unit][1]
                    unit_cost_base = product_row["total_price"] / (product_row["purchase_qty"] * purchase_factor)
                    base_unit = "g" if group == "mass" else "ml" if group == "volume" else "un"
                    product_name = product_row["name"]
                else:
                    unit_cost_base = safe_float(item.get("unitCostBase", 0), "unitCostBase", 0)
                    expected_group = "mass" if base_unit == "g" else "volume" if base_unit == "ml" else "count"
                    if group != expected_group:
                        raise ValueError(f"Unidade incompatível para o ingrediente {product_name}.")
                line_cost = round(unit_cost_base * quantity * factor + 1e-9, 2)
                ingredients_total += line_cost
                item_rows.append((product_id, product_name, quantity, unit, unit_cost_base, base_unit, line_cost))
            ingredients_total = round(ingredients_total, 2)
            calculated_total = round(ingredients_total + labor + gas + energy + other, 2)
            db.execute("""INSERT INTO services
                (id,name,description,labor_cost,gas_cost,energy_cost,other_cost,ingredients_cost,total_cost,selling_price,created_at,updated_at)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
                (service_id, name, str(service.get("description") or ""), labor, gas, energy, other,
                 ingredients_total, calculated_total, selling, str(service.get("createdAt") or utc_now()),
                 str(service.get("updatedAt") or utc_now())))
            for product_id, product_name, quantity, unit, unit_cost_base, base_unit, line_cost in item_rows:
                db.execute("""INSERT INTO service_items
                    (service_id,product_id,product_name,quantity,unit,unit_cost_base,base_unit,cost)
                    VALUES (?,?,?,?,?,?,?,?)""",
                    (service_id, product_id, product_name, quantity, unit, unit_cost_base, base_unit, line_cost))

        for run in service_runs:
            db.execute("""INSERT INTO service_runs
                (id,service_id,name,date,items_json,total_cost,selling_price,transaction_id)
                VALUES (?,?,?,?,?,?,?,?)""",
                (str(run.get("id") or new_id("run")), run.get("serviceId"), str(run.get("name") or "Serviço"),
                 str(run.get("date") or utc_now()), json.dumps(run.get("items") or [], ensure_ascii=False),
                 safe_float(run.get("totalCost", 0), "totalCost", 0), safe_float(run.get("sellingPrice", 0), "sellingPrice", 0),
                 run.get("transactionId")))

        for obligation in obligations:
            name = str(obligation.get("name") or "").strip()
            monthly = safe_float(obligation.get("monthlyAmount"), "monthlyAmount", 0.000001)
            year = int(obligation.get("startYear") or datetime.now().year)
            month = int(obligation.get("startMonth") or 1)
            recurring = bool(obligation.get("recurring"))
            count = 0 if recurring else int(obligation.get("installmentsCount") or 0)
            if not name or not 2000 <= year <= 2200 or not 1 <= month <= 12 or (not recurring and count < 1):
                raise ValueError("Compromisso inválido: revise nome, data e número de parcelas.")
            db.execute("""INSERT INTO obligations
                (id,name,type,description,monthly_amount,total_amount,installments_count,recurring,start_year,start_month,created_at,updated_at)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
                (str(obligation.get("id") or new_id("obl")), name, str(obligation.get("type") or "outro"),
                 str(obligation.get("description") or ""), monthly,
                 safe_float(obligation.get("totalAmount", 0), "totalAmount", 0), count, int(recurring), year, month,
                 str(obligation.get("createdAt") or utc_now()), str(obligation.get("updatedAt") or utc_now())))

        obligation_ids = {str(item.get("id")) for item in obligations}
        for installment in installments:
            obligation_id = str(installment.get("obligationId") or "")
            year_month = str(installment.get("yearMonth") or "")
            if obligation_id not in obligation_ids or not re.fullmatch(r"\d{4}-(0[1-9]|1[0-2])", year_month):
                raise ValueError("Parcela vinculada a um compromisso inválido.")
            status = str(installment.get("status") or "pending")
            launched = bool(installment.get("launched"))
            if status not in ("paid", "pending"):
                raise ValueError("Status de parcela inválido.")
            if launched and status != "paid":
                raise ValueError("Uma parcela lançada no financeiro precisa estar marcada como paga.")
            db.execute("""INSERT INTO obligation_installments
                (id,obligation_id,year_month,status,launched,paid_date,transaction_id)
                VALUES (?,?,?,?,?,?,?)""",
                (str(installment.get("id") or new_id("inst")), obligation_id, year_month, status,
                 int(launched), installment.get("paidDate"), installment.get("transactionId")))

        for purchase in purchases:
            db.execute("""INSERT INTO purchases
                (id,name,status,items_json,total,created_at,added_to_finance,transaction_id)
                VALUES (?,?,?,?,?,?,?,?)""",
                (str(purchase.get("id") or new_id("buy")), str(purchase.get("name") or "Compra"),
                 str(purchase.get("status") or "saved"), json.dumps(purchase.get("items") or [], ensure_ascii=False),
                 safe_float(purchase.get("total", 0), "total", 0), str(purchase.get("createdAt") or utc_now()),
                 int(bool(purchase.get("addedToFinance"))), purchase.get("transactionId")))

        settings = data.get("settings") or {}
        if not isinstance(settings, dict):
            raise ValueError("Configurações inválidas.")
        settings = dict(settings)
        settings["activeCart"] = data.get("activeCart") or []
        for key, value in settings.items():
            db.execute("INSERT INTO app_settings(key,value) VALUES (?,?)", (str(key), json.dumps(value, ensure_ascii=False)))
        db.commit()
    except (sqlite3.IntegrityError, ValueError, TypeError) as exc:
        db.rollback()
        if isinstance(exc, sqlite3.IntegrityError):
            message = str(exc)
            if "products.name_key" in message:
                raise ValueError("Já existe um produto cadastrado com nome igual ou equivalente.") from exc
            if "products.product_code" in message or "products.barcode" in message:
                raise ValueError("Código interno ou código de barras já associado a outro produto.") from exc
            raise ValueError("Não foi possível gravar: há dados duplicados ou referências inconsistentes.") from exc
        raise
    except Exception:
        db.rollback()
        raise


def create_app(test_config: dict[str, Any] | None = None) -> Flask:
    app = Flask(__name__, static_folder="static", static_url_path="/static")
    app.config.update(
        SECRET_KEY=os.environ.get("FLASK_SECRET_KEY", "local-app-no-auth"),
        DATABASE=str(BASE_DIR / "instance" / "mercado_financas.sqlite3"),
        MAX_CONTENT_LENGTH=20 * 1024 * 1024,
    )
    if test_config:
        app.config.update(test_config)
    app.teardown_appcontext(close_db)
    with app.app_context():
        init_db()

    @app.get("/")
    def index():
        return send_from_directory(BASE_DIR / "templates", "index.html")

    @app.get("/api/health")
    def health():
        db = get_db()
        return jsonify({"ok": True, "database": Path(current_app.config["DATABASE"]).name,
                        "sqlite": sqlite3.sqlite_version,
                        "products": db.execute("SELECT COUNT(*) FROM products").fetchone()[0]})

    @app.get("/api/state")
    def get_state():
        return jsonify(read_state())

    @app.put("/api/state")
    def put_state():
        try:
            payload = request.get_json(silent=False)
            save_state(payload)
            return jsonify({"ok": True, "state": read_state()})
        except ValueError as exc:
            return jsonify({"error": str(exc)}), 400
        except sqlite3.Error as exc:
            current_app.logger.exception("Falha SQLite")
            return jsonify({"error": f"Erro no SQLite: {exc}"}), 500

    @app.get("/api/products/check")
    def check_product():
        name = str(request.args.get("name") or "").strip()
        code = str(request.args.get("code") or "").strip()
        key = normalize_name(name)
        db = get_db()
        duplicate = db.execute("SELECT name,product_code,barcode FROM products WHERE name_key=? OR product_code=? OR barcode=? LIMIT 1",
                               (key, code, code)).fetchone()
        similar = []
        if key:
            for row in db.execute("SELECT name,product_code,barcode FROM products"):
                other = normalize_name(row["name"])
                ratio = SequenceMatcher(None, key, other).ratio()
                if other != key and min(len(key), len(other)) >= 4 and (key in other or other in key or ratio >= 0.82):
                    similar.append(dict(row))
                if len(similar) >= 4:
                    break
        return jsonify({"duplicate": dict(duplicate) if duplicate else None, "similar": similar})

    @app.errorhandler(413)
    def too_large(_error):
        return jsonify({"error": "O arquivo enviado excede o limite de 20 MB."}), 413

    return app


app = create_app()

if __name__ == "__main__":
    print("Mercado & Finanças — Flask + SQLite")
    print(f"Banco: {app.config['DATABASE']}")
    print("Acesse: http://127.0.0.1:5000")
    app.run(host="127.0.0.1", port=5000, debug=False, threaded=True)
