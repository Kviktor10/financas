import json
import tempfile
import unittest
from pathlib import Path

from app import create_app, ean13_for


class FinancialAppTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        db_path = str(Path(self.temp.name) / "test.sqlite3")
        self.app = create_app({"TESTING": True, "DATABASE": db_path})
        self.client = self.app.test_client()

    def tearDown(self):
        self.temp.cleanup()

    def sample_state(self):
        return {
            "version": 2,
            "settings": {},
            "products": [{
                "id": "prod_1", "name": "Farinha de trigo", "productCode": "PRD-000001",
                "barcode": ean13_for(1), "category": "comida", "icon": "🌾",
                "purchaseQty": 1, "purchaseUnit": "kg", "totalPrice": 8.50,
                "baseUnit": "g", "createdAt": "2026-01-01T00:00:00Z", "updatedAt": "2026-01-01T00:00:00Z"
            }],
            "transactions": [{
                "id": "tx_1", "type": "expense", "description": "Compra de farinha", "amount": 8.5,
                "date": "2026-01-01T12:00:00Z", "source": "manual", "sourceId": None
            }],
            "services": [{
                "id": "service_1", "name": "Bolo simples", "description": "Teste",
                "laborCost": 10, "gasCost": 2, "energyCost": 1, "otherCost": 0,
                "ingredients": 2.55, "totalCost": 15.55, "sellingPrice": 30,
                "items": [{"productId": "prod_1", "productName": "Farinha de trigo", "quantity": 300,
                           "unit": "g", "unitCostBase": 0.0085, "baseUnit": "g", "cost": 2.55}]
            }],
            "serviceRuns": [],
            "obligations": [{
                "id": "obl_1", "name": "Internet", "type": "internet", "description": "Plano mensal",
                "monthlyAmount": 99.9, "totalAmount": 0, "installmentsCount": 0,
                "recurring": True, "startYear": 2026, "startMonth": 1
            }],
            "installments": [{"id": "inst_1", "obligationId": "obl_1", "yearMonth": "2026-01",
                              "status": "paid", "launched": False, "paidDate": "2026-01-10", "transactionId": None}],
            "purchases": [], "activeCart": []
        }

    def test_state_round_trip_uses_sqlite(self):
        response = self.client.put("/api/state", json=self.sample_state())
        self.assertEqual(response.status_code, 200, response.get_json())
        state = self.client.get("/api/state").get_json()
        self.assertEqual(state["products"][0]["name"], "Farinha de trigo")
        self.assertEqual(state["services"][0]["items"][0]["quantity"], 300)
        self.assertEqual(state["obligations"][0]["recurring"], True)
        self.assertEqual(state["installments"][0]["yearMonth"], "2026-01")
        self.assertEqual(state["transactions"][0]["amount"], 8.5)

    def test_duplicate_product_name_is_rejected(self):
        state = self.sample_state()
        state["products"].append({**state["products"][0], "id": "prod_2", "name": "FARINHA   DE TRIGO",
                                  "productCode": "PRD-000002", "barcode": ean13_for(2)})
        response = self.client.put("/api/state", json=state)
        self.assertEqual(response.status_code, 400)
        self.assertIn("duplicado", response.get_json()["error"].lower())

    def test_check_endpoint_reports_similar_products(self):
        self.client.put("/api/state", json=self.sample_state())
        response = self.client.get("/api/products/check?name=Farinha%20de%20trigo%20integral")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.get_json()["similar"])

    def test_database_health(self):
        response = self.client.get("/api/health")
        self.assertTrue(response.get_json()["ok"])
        self.assertIn("sqlite", response.get_json())


if __name__ == "__main__":
    unittest.main()
