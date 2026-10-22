"""GPlanSiS|Sheets — cota e contabilidade de uso da IA (Claude).

Mesmo modelo do GPlanSiS|Studio: cada chamada grava os tokens reais devolvidos pela
Anthropic e o custo em US$ na tabela ai_usage; a cota mensal é por pessoa
(users.ai_quota; NULL = padrão global ai_quota_usd nas configurações, alterável só
por administrador). Estourou a cota → 402. Há também um limite de ritmo por pessoa
(30 chamadas/minuto, 3 simultâneas → 429) e o corpo das rotas de IA é lido em
streaming com teto (413). Para o navegador vão só mensagens genéricas; o detalhe do
erro fica no registro (apenas o tipo da exceção, nunca o texto da API).

O app chama instalar(app, módulo_do_app) uma vez, no fim de app.py.
"""
from __future__ import annotations

import json
import threading
import time
from typing import Any

from fastapi import HTTPException, Request

# US$ por milhão de tokens (entrada, saída). Modelos fora da tabela: preço conservador.
PRICES = {
    "claude-fable-5-1": (10.0, 50.0),
    "claude-fable-5": (10.0, 50.0),
    "claude-opus-5-5": (4.0, 20.0),
    "claude-opus-5": (5.0, 25.0),
    "claude-opus-4-8": (5.0, 25.0),
    "claude-sonnet-5-5": (2.0, 10.0),
    "claude-sonnet-5": (2.0, 10.0),
    "claude-haiku-5-5": (0.10, 0.50),
}
DEFAULT_QUOTA_USD = 20.0
MAX_QUOTA_USD = 10000.0
PER_MINUTE = 30
CONCURRENT = 3
STALE_INFLIGHT = 900.0  # segundos: uma chamada "presa" (stream abandonado) deixa de contar como simultânea

SCHEMA = """
CREATE TABLE IF NOT EXISTS ai_usage(
  id INTEGER PRIMARY KEY, ts REAL NOT NULL, uid INTEGER, feature TEXT NOT NULL, model TEXT,
  input_tokens INTEGER DEFAULT 0, output_tokens INTEGER DEFAULT 0, cache_read INTEGER DEFAULT 0,
  cache_write INTEGER DEFAULT 0, cost_usd REAL DEFAULT 0, ok INTEGER NOT NULL, error TEXT, ms INTEGER);
CREATE INDEX IF NOT EXISTS ix_ai_usage_uid_ts ON ai_usage(uid, ts);
"""

A: Any = None  # módulo do app (tx, ro, current_user, need, get_settings, audit, client_ip, body, log)
_lock = threading.Lock()
_recent: dict[int, list[float]] = {}
_inflight: dict[int, list[float]] = {}


def price(model: str | None) -> tuple[float, float]:
    m = model or ""
    if m in PRICES:
        return PRICES[m]
    for k in sorted(PRICES, key=len, reverse=True):
        if m.startswith(k):
            return PRICES[k]
    return 5.0, 25.0


def cost_of(model: str | None, u: Any) -> float:
    if u is None:
        return 0.0
    pin, pout = price(model)
    cw = getattr(u, "cache_creation_input_tokens", 0) or 0
    cr = getattr(u, "cache_read_input_tokens", 0) or 0
    return ((getattr(u, "input_tokens", 0) or 0) * pin + cw * pin * 1.25 + cr * pin * 0.1
            + (getattr(u, "output_tokens", 0) or 0) * pout) / 1e6


# --------------------------------------------------------------------------- banco (migração idempotente)
def migrate(c) -> None:
    c.executescript(SCHEMA)
    cols = {r[1] for r in c.execute("PRAGMA table_info(users)").fetchall()}
    if "ai_quota" not in cols:
        c.execute("ALTER TABLE users ADD COLUMN ai_quota REAL")
    c.commit()


def month_start() -> float:
    t = time.localtime()
    return time.mktime((t.tm_year, t.tm_mon, 1, 0, 0, 0, 0, 0, -1))


def default_quota(st: dict) -> float:
    try:
        return float(st.get("ai_quota_usd", DEFAULT_QUOTA_USD))
    except (TypeError, ValueError):
        return DEFAULT_QUOTA_USD


def user_quota(u: dict, st: dict) -> float:
    q = u.get("ai_quota")
    return default_quota(st) if q is None else float(q)


def spent_month(uid: int) -> float:
    with A.ro() as c:
        r = c.execute("SELECT COALESCE(SUM(cost_usd),0) FROM ai_usage WHERE uid=? AND ts>=?", (uid, month_start())).fetchone()
    return float(r[0])


def record(uid, feature, model, usage, ok, err, ms) -> float:
    cost = cost_of(model, usage)
    g = lambda k: (getattr(usage, k, 0) or 0) if usage is not None else 0  # noqa: E731
    try:
        with A.tx() as c:
            c.execute("INSERT INTO ai_usage(ts,uid,feature,model,input_tokens,output_tokens,cache_read,cache_write,cost_usd,ok,error,ms) "
                      "VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
                      (time.time(), uid, feature, model, g("input_tokens"), g("output_tokens"), g("cache_read_input_tokens"),
                       g("cache_creation_input_tokens"), cost, 1 if ok else 0, (err or None) and str(err)[:60], ms))
    except Exception:  # noqa: BLE001  (registrar uso nunca derruba a resposta)
        A.log.error("ia: falha ao gravar uso")
    return cost


# --------------------------------------------------------------------------- corpo com teto
async def read_body(req: Request, limit: int) -> dict:
    """Lê o JSON sem deixar um corpo gigante encher a memória do processo."""
    cl = req.headers.get("content-length") or ""
    if cl.isdigit() and int(cl) > limit:
        raise HTTPException(413, "Pedido grande demais para a IA.")
    buf = bytearray()
    async for chunk in req.stream():
        buf += chunk
        if len(buf) > limit:
            raise HTTPException(413, "Pedido grande demais para a IA.")
    try:
        d = json.loads(buf or b"{}")
    except ValueError:
        raise HTTPException(400, "JSON inválido")
    if not isinstance(d, dict):
        raise HTTPException(400, "JSON inválido")
    return d


# --------------------------------------------------------------------------- erros sem detalhe
def error_code(e: BaseException) -> str:
    try:
        import anthropic
    except Exception:  # noqa: BLE001
        return "interno:" + type(e).__name__
    for cls, code in ((anthropic.AuthenticationError, "auth"), (anthropic.PermissionDeniedError, "permissao"),
                      (anthropic.NotFoundError, "modelo"), (anthropic.RateLimitError, "limite"),
                      (anthropic.BadRequestError, "pedido"), (anthropic.APIStatusError, "status"),
                      (anthropic.APIConnectionError, "conexao")):
        if isinstance(e, cls):
            return code if code != "status" else f"status_{getattr(e, 'status_code', '')}"
    return "interno:" + type(e).__name__


PUBLIC = {
    "auth": (502, "A chave da Anthropic foi recusada. Um administrador precisa revisá-la nas configurações."),
    "permissao": (502, "A chave da Anthropic não tem acesso a este modelo."),
    "modelo": (502, "O modelo de IA configurado está indisponível."),
    "limite": (429, "Limite de uso da Anthropic atingido no momento. Tente em instantes."),
    "pedido": (400, "A IA não aceitou o pedido. Reduza o conteúdo ou reformule."),
    "conexao": (502, "Sem conexão com a Anthropic."),
}


def public_error(code: str) -> HTTPException:
    if code in PUBLIC:
        s, m = PUBLIC[code]
        return HTTPException(s, m)
    if code.startswith("status_"):
        return HTTPException(502, "O serviço da Anthropic está instável. Tente de novo em instantes.")
    return HTTPException(502, "Falha inesperada ao chamar a IA. Tente de novo.")


# --------------------------------------------------------------------------- cota e ritmo
class Call:
    """Uma chamada à IA: abre com a checagem de cota/ritmo e fecha gravando o uso real."""

    def __init__(self, u: dict, feature: str, model: str):
        self.uid, self.feature, self.model = u["id"], feature, model
        self.usage: Any = None
        self.err: str | None = None
        self.t0 = time.time()
        self.closed = False

    def use(self, msg: Any) -> None:
        if msg is None:
            return
        self.usage = getattr(msg, "usage", None) or self.usage
        self.model = getattr(msg, "model", None) or self.model

    def use_stream(self, stream: Any) -> None:
        """Stream interrompido: aproveita o uso parcial já recebido, se houver."""
        try:
            self.use(stream.current_message_snapshot)
        except Exception:  # noqa: BLE001
            pass

    def fail(self, e: BaseException) -> HTTPException:
        self.err = error_code(e)
        return public_error(self.err)

    def close(self) -> float:
        if self.closed:
            return 0.0
        self.closed = True
        with _lock:
            L = _inflight.get(self.uid, [])
            if self.t0 in L:
                L.remove(self.t0)
        return record(self.uid, self.feature, self.model, self.usage, self.err is None, self.err,
                      int((time.time() - self.t0) * 1000))


def open_call(u: dict, st: dict, feature: str) -> Call:
    spent, quota = spent_month(u["id"]), user_quota(u, st)
    if spent >= quota:
        raise HTTPException(402, f"Cota de IA do mês atingida (US$ {spent:.2f} de US$ {quota:.2f}). "
                                 "Fale com um administrador.")
    t = time.time()
    with _lock:
        R = [x for x in _recent.get(u["id"], []) if t - x < 60]
        F = [x for x in _inflight.get(u["id"], []) if t - x < STALE_INFLIGHT]
        if len(R) >= PER_MINUTE or len(F) >= CONCURRENT:
            _recent[u["id"]], _inflight[u["id"]] = R, F
            raise HTTPException(429, "Muitas chamadas de IA seguidas. Aguarde alguns segundos.")
        call = Call(u, feature, st.get("ai_model") or "")
        while call.t0 in F:  # chave única na lista de simultâneas
            call.t0 += 1e-6
        R.append(t)
        F.append(call.t0)
        _recent[u["id"]], _inflight[u["id"]] = R, F
    return call


# --------------------------------------------------------------------------- rotas (cota e uso)
def _is_admin(u: dict) -> bool:
    return u["role"] in ("master", "admin")


def instalar(app, mod) -> None:
    global A
    A = mod
    _orig_init = mod.init_db

    def init_db():
        _orig_init()
        c = mod.connect()
        try:
            migrate(c)
        finally:
            c.close()

    mod.init_db = init_db

    @app.get("/api/ai/quota")
    def ai_quota_get(req: Request):
        u = A.current_user(req)
        with A.ro() as c:
            st = A.get_settings(c)
        return {"spent_usd": round(spent_month(u["id"]), 4), "quota_usd": user_quota(u, st),
                "default_quota_usd": default_quota(st), "month_start": month_start()}

    @app.put("/api/ai/quota")
    async def ai_quota_put(req: Request):
        """Admin: {"default_quota_usd": 20} e/ou {"uid": 7, "quota_usd": 5 | null (volta ao padrão)}."""
        u = A.current_user(req)
        if not _is_admin(u):
            raise HTTPException(403, "Só administradores alteram a cota de IA.")
        b = await read_body(req, 4096)

        def val(v):
            try:
                q = float(v)
            except (TypeError, ValueError):
                raise HTTPException(400, "Cota inválida.")
            if not 0 <= q <= MAX_QUOTA_USD:
                raise HTTPException(400, "Cota fora da faixa (0 a 10.000).")
            return q

        changes: dict[str, Any] = {}
        with A.tx() as c:
            if "default_quota_usd" in b:
                q = val(b["default_quota_usd"])
                c.execute("INSERT OR REPLACE INTO settings(k, v) VALUES(?,?)", ("ai_quota_usd", json.dumps(q)))
                changes["padrao"] = q
            if "uid" in b:
                try:
                    uid = int(b["uid"])
                except (TypeError, ValueError):
                    raise HTTPException(400, "Usuário inválido.")
                if not c.execute("SELECT 1 FROM users WHERE id=?", (uid,)).fetchone():
                    raise HTTPException(404, "Usuário não encontrado.")
                q = None if b.get("quota_usd") is None else val(b["quota_usd"])
                c.execute("UPDATE users SET ai_quota=? WHERE id=?", (q, uid))
                changes["usuario"] = {"uid": uid, "cota": q}
            if not changes:
                raise HTTPException(400, "Nada para alterar.")
            A.audit(c, "sistema.cota_ia", changes, user=u, ip=A.client_ip(req))
        return {"ok": True, **changes}

    @app.get("/api/ai/usage")
    def ai_usage(req: Request):
        u = A.current_user(req)
        ms = month_start()
        with A.ro() as c:
            st = A.get_settings(c)
            if _is_admin(u):
                rows = c.execute(
                    "SELECT u.id, u.name, u.email, u.ai_quota, COUNT(a.id) n, COALESCE(SUM(a.cost_usd),0) cost, "
                    "COALESCE(SUM(a.input_tokens),0) tin, COALESCE(SUM(a.output_tokens),0) tout "
                    "FROM users u LEFT JOIN ai_usage a ON a.uid=u.id AND a.ts>=? GROUP BY u.id ORDER BY cost DESC", (ms,)).fetchall()
            else:
                rows = c.execute("SELECT ? id, COUNT(id) n, COALESCE(SUM(cost_usd),0) cost, COALESCE(SUM(input_tokens),0) tin, "
                                 "COALESCE(SUM(output_tokens),0) tout FROM ai_usage WHERE uid=? AND ts>=?",
                                 (u["id"], u["id"], ms)).fetchall()
        return {"month_start": ms, "default_quota_usd": default_quota(st), "by_user": [dict(r) for r in rows]}

    # as rotas novas entram antes do "/{name:path}" (arquivos estáticos), que captura qualquer GET
    novas = [r for r in app.router.routes if getattr(r, "path", "") in ("/api/ai/quota", "/api/ai/usage")]
    resto = [r for r in app.router.routes if r not in novas]
    app.router.routes[:] = novas + resto
