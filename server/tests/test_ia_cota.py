"""Cota de IA do Sheets (auditoria 2026-10, M5). Nenhum teste chama a Anthropic de verdade.

Rodar: SHEETS_DATA=$(mktemp -d) python -m pytest server/tests -q   (a partir da raiz do repositório)
"""
import os
import sys
import tempfile
import time
from pathlib import Path
from types import SimpleNamespace

import pytest

os.environ.setdefault("SHEETS_DATA", tempfile.mkdtemp(prefix="sheets-test-"))
os.environ["SHEETS_MASTER_EMAIL"] = "admin@example.com"
os.environ["SHEETS_MASTER_PASSWORD"] = "Teste-Senha-123"
os.environ["SHEETS_SECURE_COOKIE"] = "0"
os.environ["SHEETS_SECRET"] = "segredo-de-teste"
os.environ.pop("ANTHROPIC_API_KEY", None)
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import app as A  # noqa: E402
import ia_cota  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

H = {"X-Requested-With": "sheets"}
KEY = "sk-ant-" + "x" * 40


@pytest.fixture(scope="module")
def client():
    with TestClient(A.app) as c:
        with A.tx() as db:
            db.execute("UPDATE users SET must_change=0")
            db.execute("INSERT INTO users(email,name,pw,role,created) VALUES(?,?,?,?,?)",
                       ("ed@example.com", "Editor", A.hash_pw("Teste-Senha-123"), "editor", time.time()))
        yield c


def login(c, email):
    c.cookies.clear()
    r = c.post("/api/auth/login", json={"email": email, "password": "Teste-Senha-123"}, headers=H)
    assert r.status_code == 200, r.text
    return r


def uid(email):
    with A.ro() as db:
        return db.execute("SELECT id FROM users WHERE email=?", (email,)).fetchone()["id"]


def set_key(on: bool):
    with A.tx() as db:
        if on:
            db.execute("INSERT OR REPLACE INTO settings(k,v) VALUES('ai_key_enc', ?)", (A.json.dumps(A.seal(KEY)),))
        else:
            db.execute("DELETE FROM settings WHERE k='ai_key_enc'")


def reset_usage():
    with A.tx() as db:
        db.execute("DELETE FROM ai_usage")
        db.execute("UPDATE users SET ai_quota=NULL")
        db.execute("DELETE FROM settings WHERE k='ai_quota_usd'")
    ia_cota._recent.clear()
    ia_cota._inflight.clear()


class FakeStream:
    def __init__(self, text="{\"ok\": 1}", exc=None, model="claude-opus-5-5"):
        self.exc = exc
        usage = SimpleNamespace(input_tokens=1000, output_tokens=500, cache_read_input_tokens=0, cache_creation_input_tokens=0)
        self.msg = SimpleNamespace(model=model, usage=usage, stop_reason="end_turn",
                                   content=[SimpleNamespace(type="text", text=text)])
        self.current_message_snapshot = self.msg

    def __enter__(self):
        if self.exc:
            raise self.exc
        return self

    def __exit__(self, *a):
        return False

    @property
    def text_stream(self):
        yield self.msg.content[0].text

    def get_final_message(self):
        return self.msg


def test_migracao_idempotente(client):
    c = A.connect()
    ia_cota.migrate(c)
    ia_cota.migrate(c)
    cols = {r[1] for r in c.execute("PRAGMA table_info(users)")}
    assert "ai_quota" in cols
    c.close()


def test_sem_chave_503_gracioso(client):
    reset_usage()
    set_key(False)
    login(client, "ed@example.com")
    r = client.post("/api/ai/json", json={"prompt": "oi"}, headers=H)
    assert r.status_code == 503
    assert "configurada" in r.json()["detail"]
    r = client.post("/api/ai/sample", json={"prompt": "oi"}, headers=H)
    assert r.status_code == 503


def test_cota_estourada_402_sem_chamar_anthropic(client, monkeypatch):
    reset_usage()
    set_key(True)
    called = []
    monkeypatch.setattr(A, "ai_stream", lambda *a, **k: called.append(1) or FakeStream())
    with A.tx() as db:
        db.execute("INSERT INTO ai_usage(ts,uid,feature,model,cost_usd,ok) VALUES(?,?,?,?,?,1)",
                   (time.time(), uid("ed@example.com"), "json", "claude-opus-5-5", 25.0))
    login(client, "ed@example.com")
    for rota in ("/api/ai/json", "/api/ai/sample"):
        r = client.post(rota, json={"prompt": "oi"}, headers=H)
        assert r.status_code == 402, r.text
        assert "Cota de IA" in r.json()["detail"]
    assert not called
    # o admin aumenta a cota da pessoa e ela volta a usar
    login(client, "admin@example.com")
    r = client.put("/api/ai/quota", json={"uid": uid("ed@example.com"), "quota_usd": 100}, headers=H)
    assert r.status_code == 200, r.text
    login(client, "ed@example.com")
    r = client.post("/api/ai/json", json={"prompt": "oi"}, headers=H)
    assert r.status_code == 200 and called


def test_uso_real_gravado_com_custo(client, monkeypatch):
    reset_usage()
    set_key(True)
    monkeypatch.setattr(A, "ai_stream", lambda *a, **k: FakeStream())
    login(client, "ed@example.com")
    r = client.post("/api/ai/json", json={"prompt": "oi", "kind": "json"}, headers=H)
    assert r.status_code == 200 and r.json() == {"json": {"ok": 1}}
    r = client.post("/api/ai/sample", json={"prompt": "oi"}, headers=H)
    assert r.status_code == 200 and "ok" in r.text
    with A.ro() as db:
        rows = db.execute("SELECT * FROM ai_usage ORDER BY id").fetchall()
    assert [x["feature"] for x in rows] == ["json", "texto"]
    for x in rows:
        assert x["input_tokens"] == 1000 and x["output_tokens"] == 500 and x["ok"] == 1
        assert x["cost_usd"] == pytest.approx((1000 * 4 + 500 * 20) / 1e6)
    q = client.get("/api/ai/quota").json()
    assert q["spent_usd"] == pytest.approx(2 * 0.014) and q["quota_usd"] == 20.0
    assert not ia_cota._inflight[uid("ed@example.com")]


def test_erro_da_anthropic_nao_vaza_detalhe(client, monkeypatch):
    import anthropic
    import httpx
    reset_usage()
    set_key(True)
    req = httpx.Request("POST", "https://api.anthropic.com/v1/messages")
    resp = httpx.Response(400, request=req)
    exc = anthropic.BadRequestError("SEGREDO-INTERNO detalhe da API", response=resp, body=None)
    monkeypatch.setattr(A, "ai_stream", lambda *a, **k: FakeStream(exc=exc))
    login(client, "ed@example.com")
    r = client.post("/api/ai/json", json={"prompt": "oi"}, headers=H)
    assert r.status_code == 400 and "SEGREDO" not in r.text and "BadRequest" not in r.text
    r = client.post("/api/ai/sample", json={"prompt": "oi"}, headers=H)
    assert "SEGREDO" not in r.text and r.text.endswith("ERRO:pedido")
    monkeypatch.setattr(A, "ai_stream", lambda *a, **k: FakeStream(exc=RuntimeError("SEGREDO /caminho/interno")))
    r = client.post("/api/ai/json", json={"prompt": "oi"}, headers=H)
    assert r.status_code == 502 and "SEGREDO" not in r.text and "RuntimeError" not in r.text
    with A.ro() as db:
        errs = [x["error"] for x in db.execute("SELECT error, ok FROM ai_usage ORDER BY id")]
    assert errs == ["pedido", "pedido", "interno:RuntimeError"]


def test_corpo_grande_413(client):
    reset_usage()
    set_key(True)
    login(client, "ed@example.com")
    r = client.post("/api/ai/json", content=b'{"prompt":"' + b"a" * 500_000 + b'"}',
                    headers={**H, "Content-Type": "application/json"})
    assert r.status_code == 413


def test_ritmo_429(client, monkeypatch):
    reset_usage()
    set_key(True)
    monkeypatch.setattr(A, "ai_stream", lambda *a, **k: FakeStream())
    login(client, "ed@example.com")
    ia_cota._inflight[uid("ed@example.com")] = [time.time(), time.time() + 1e-3, time.time() + 2e-3]
    r = client.post("/api/ai/json", json={"prompt": "oi"}, headers=H)
    assert r.status_code == 429
    ia_cota._inflight.clear()
    ia_cota._recent[uid("ed@example.com")] = [time.time()] * 30
    assert client.post("/api/ai/json", json={"prompt": "oi"}, headers=H).status_code == 429


def test_so_admin_altera_cota(client):
    reset_usage()
    login(client, "ed@example.com")
    assert client.put("/api/ai/quota", json={"default_quota_usd": 999}, headers=H).status_code == 403
    login(client, "admin@example.com")
    assert client.put("/api/ai/quota", json={"default_quota_usd": -1}, headers=H).status_code == 400
    r = client.put("/api/ai/quota", json={"default_quota_usd": 7.5}, headers=H)
    assert r.status_code == 200
    login(client, "ed@example.com")
    assert client.get("/api/ai/quota").json()["quota_usd"] == 7.5
    assert client.get("/api/ai/usage").status_code == 200
