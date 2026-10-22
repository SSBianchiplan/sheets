"""GPlanSiS|Sheets 2.0 — API e servidor da aplicação.

Um processo, um SQLite em /data. Sessão por cookie HttpOnly, papéis com
permissões granulares, pastas de trabalho no servidor com controle de versão
otimista, compartilhamento, lixeira, histórico de versões, trilha de auditoria
encadeada (SHA-256), avatar e proxy de IA (Claude).
"""
from __future__ import annotations

import base64
import binascii
import csv
import hashlib
import hmac
import io
import json
import logging
import os
import re
import secrets
import sqlite3
import sys
import threading
import time
from contextlib import contextmanager
from pathlib import Path
from typing import Any

import httpx
import ia_cota
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse, Response, StreamingResponse

VERSION = "2.2.3"
DATA_DIR = Path(os.environ.get("SHEETS_DATA", "/data"))
STATIC_DIR = Path(os.environ.get("SHEETS_STATIC", Path(__file__).resolve().parent.parent / "public"))
DB_PATH = DATA_DIR / "sheets.db"
MASTER_EMAIL = os.environ.get("SHEETS_MASTER_EMAIL", "admin@example.com").strip().lower()
SECURE_COOKIE = os.environ.get("SHEETS_SECURE_COOKIE", "1") != "0"
COOKIE = "sheets_sid"
CSRF_HEADER = "sheets"
MAX_BOOK = 30 * 1024 * 1024
MAX_AVATAR = 300 * 1024
AI_MODEL = os.environ.get("SHEETS_AI_MODEL", "claude-opus-5-5")

log = logging.getLogger("sheets")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

# --------------------------------------------------------------------------- permissões
PERMS: dict[str, str] = {
    "books.view": "Ver pastas compartilhadas com ele",
    "books.create": "Criar pastas novas",
    "books.edit": "Editar células, planilhas e formatação",
    "books.delete": "Excluir as próprias pastas",
    "books.share": "Compartilhar pastas",
    "books.all": "Acessar todas as pastas da organização",
    "bi.edit": "Editar consultas, modelo, medidas e relatórios de BI",
    "import": "Importar arquivos (.xlsx, .xls, .ods, .csv, .json)",
    "export": "Exportar e baixar arquivos",
    "ai.use": "Usar o assistente de IA",
    "docs.send": "Enviar pastas ao GPlanSiS|Docs",
    "audit.view": "Ver a auditoria do sistema",
    "users.manage": "Gerenciar usuários e permissões",
    "system.settings": "Alterar configurações do sistema",
}
ALL = list(PERMS)
ROLES: dict[str, dict[str, Any]] = {
    "master": {"n": "Admin master", "d": "Controle total. Único e inalterável.", "p": ALL},
    "admin": {"n": "Administrador", "d": "Gerencia usuários, sistema e todas as pastas.", "p": ALL},
    "gestor": {"n": "Gestor", "d": "Acessa todas as pastas, edita BI e audita.",
               "p": ["books.view", "books.create", "books.edit", "books.delete", "books.share", "books.all",
                     "bi.edit", "import", "export", "ai.use", "docs.send", "audit.view"]},
    "analista": {"n": "Analista de BI", "d": "Cria planilhas e relatórios de BI próprios.",
                 "p": ["books.view", "books.create", "books.edit", "books.delete", "books.share", "bi.edit",
                       "import", "export", "ai.use", "docs.send"]},
    "editor": {"n": "Editor", "d": "Cria e edita planilhas; vê o BI sem alterá-lo.",
               "p": ["books.view", "books.create", "books.edit", "books.delete", "books.share", "import",
                     "export", "ai.use", "docs.send"]},
    "leitor": {"n": "Leitor", "d": "Somente visualiza o que foi compartilhado.", "p": ["books.view"]},
}
AI_MODELS = {"claude-opus-5-5": "Claude Opus 5.5 (recomendado)", "claude-sonnet-5-5": "Claude Sonnet 5.5 (mais rápido)",
             "claude-haiku-5-5": "Claude Haiku 5.5 (mais econômico)", "claude-fable-5-1": "Claude Fable 5.1 (mais capaz, mais caro)"}
AI_EFFORTS = ("low", "medium", "high")
DEFAULT_SETTINGS = {"org_name": "GPlanSiS|Group", "session_hours": 12, "pw_min": 10, "ai_enabled": True,
                    "default_role": "editor", "banner": "", "versions_keep": 60,
                    "ai_model": AI_MODEL if AI_MODEL in AI_MODELS else "claude-opus-5-5", "ai_effort": "medium"}
SECRET_KEYS = ("ai_key_enc", "ai_key_meta")
COLORS = ["#EB6A20", "#2F7DE1", "#2F8F55", "#8E24AA", "#C8402E", "#00838F", "#5D4037", "#3949AB"]

# --------------------------------------------------------------------------- banco
_wlock = threading.RLock()


def connect() -> sqlite3.Connection:
    c = sqlite3.connect(DB_PATH, timeout=15, check_same_thread=False)
    c.row_factory = sqlite3.Row
    c.execute("PRAGMA foreign_keys=ON")
    c.execute("PRAGMA busy_timeout=15000")
    return c


@contextmanager
def tx():
    with _wlock:
        c = connect()
        try:
            c.execute("BEGIN IMMEDIATE")
            yield c
            c.commit()
        except BaseException:
            c.rollback()
            raise
        finally:
            c.close()


@contextmanager
def ro():
    c = connect()
    try:
        yield c
    finally:
        c.close()


SCHEMA = """
CREATE TABLE IF NOT EXISTS users(
  id INTEGER PRIMARY KEY, email TEXT NOT NULL UNIQUE COLLATE NOCASE, name TEXT NOT NULL,
  pw TEXT NOT NULL, role TEXT NOT NULL, perms TEXT, title TEXT DEFAULT '', dept TEXT DEFAULT '',
  avatar BLOB, avatar_mime TEXT, avatar_v INTEGER DEFAULT 0, color TEXT, prefs TEXT DEFAULT '{}',
  active INTEGER NOT NULL DEFAULT 1, must_change INTEGER NOT NULL DEFAULT 0, fails INTEGER NOT NULL DEFAULT 0,
  locked_until REAL DEFAULT 0, created REAL NOT NULL, last_login REAL, pw_changed REAL);
CREATE TABLE IF NOT EXISTS sessions(
  id TEXT PRIMARY KEY, uid INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created REAL NOT NULL, last_seen REAL NOT NULL, ip TEXT, ua TEXT);
CREATE TABLE IF NOT EXISTS books(
  id TEXT PRIMARY KEY, name TEXT NOT NULL, owner INTEGER NOT NULL REFERENCES users(id),
  vis TEXT NOT NULL DEFAULT 'private', data TEXT NOT NULL, ver INTEGER NOT NULL DEFAULT 1,
  size INTEGER NOT NULL DEFAULT 0, sheets INTEGER NOT NULL DEFAULT 0, has_bi INTEGER NOT NULL DEFAULT 0,
  created REAL NOT NULL, updated REAL NOT NULL, updated_by INTEGER, deleted REAL, last_snap REAL DEFAULT 0);
CREATE TABLE IF NOT EXISTS book_acl(
  book TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE, uid INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  level TEXT NOT NULL, PRIMARY KEY(book, uid));
CREATE TABLE IF NOT EXISTS book_versions(
  id INTEGER PRIMARY KEY, book TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE, ver INTEGER NOT NULL,
  data TEXT NOT NULL, by INTEGER, at REAL NOT NULL, note TEXT DEFAULT '', kind TEXT DEFAULT 'auto', size INTEGER DEFAULT 0);
CREATE INDEX IF NOT EXISTS ix_bv ON book_versions(book, at);
CREATE TABLE IF NOT EXISTS audit(
  seq INTEGER PRIMARY KEY, at TEXT NOT NULL, uid INTEGER, email TEXT, ev TEXT NOT NULL,
  data TEXT NOT NULL, ip TEXT, prev TEXT NOT NULL, hash TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS ix_audit_ev ON audit(ev);
CREATE TABLE IF NOT EXISTS settings(k TEXT PRIMARY KEY, v TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS docs_vinculo(
  book TEXT PRIMARY KEY REFERENCES books(id) ON DELETE CASCADE, doc_id TEXT NOT NULL UNIQUE, projeto_id TEXT,
  codigo TEXT, titulo TEXT, projeto_codigo TEXT, revisao_id TEXT, revisao_label TEXT, revisao_status TEXT, finalidade TEXT,
  estado TEXT, ultimo_evento INTEGER NOT NULL DEFAULT 0, versao_enviada INTEGER, enviado_em REAL, enviado_por TEXT,
  atualizado_em REAL);
CREATE TABLE IF NOT EXISTS sso_nonce(nonce TEXT PRIMARY KEY, expira REAL NOT NULL);
"""


def now() -> float:
    return time.time()


def jdump(o: Any) -> str:
    return json.dumps(o, ensure_ascii=False, separators=(",", ":"), sort_keys=True)


def compact(o: Any) -> str:
    return json.dumps(o, ensure_ascii=False, separators=(",", ":"))


# --------------------------------------------------------------------------- senhas
def hash_pw(pw: str) -> str:
    salt = secrets.token_bytes(16)
    h = hashlib.scrypt(pw.encode(), salt=salt, n=2 ** 15, r=8, p=1, maxmem=64 * 1024 * 1024, dklen=32)
    return "scrypt$32768$8$1$" + base64.b64encode(salt).decode() + "$" + base64.b64encode(h).decode()


def check_pw(pw: str, stored: str) -> bool:
    try:
        _, n, r, p, salt, h = stored.split("$")
        calc = hashlib.scrypt(pw.encode(), salt=base64.b64decode(salt), n=int(n), r=int(r), p=int(p),
                              maxmem=64 * 1024 * 1024, dklen=32)
        return hmac.compare_digest(calc, base64.b64decode(h))
    except Exception:
        return False


DUMMY_HASH = hash_pw(secrets.token_hex(8))


def temp_password() -> str:
    alphabet = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    core = "".join(secrets.choice(alphabet) for _ in range(12))
    return core[:4] + "-" + core[4:8] + "-" + core[8:]


def pw_problem(pw: str, minlen: int) -> str | None:
    if len(pw) < minlen:
        return f"A senha precisa ter ao menos {minlen} caracteres."
    if len(pw) > 200:
        return "Senha longa demais."
    kinds = sum(bool(re.search(p, pw)) for p in (r"[a-z]", r"[A-Z]", r"\d", r"[^\w]"))
    if kinds < 3:
        return "Use ao menos três tipos: minúsculas, maiúsculas, números e símbolos."
    return None


# --------------------------------------------------------------------------- segredos (chave da IA)
# Cifra de fluxo HMAC-SHA256 (modo contador) + HMAC de autenticação (encrypt-then-MAC), só com a biblioteca padrão.
# A chave mestra vem de SHEETS_SECRET (.env, fora do banco); sem ela, de /data/.secret.
_SECRET: bytes = b""


def load_secret():
    global _SECRET
    env = os.environ.get("SHEETS_SECRET", "").strip()
    if env:
        _SECRET = hashlib.sha256(env.encode()).digest()
        return
    f = DATA_DIR / ".secret"
    if not f.exists():
        f.write_text(secrets.token_hex(32))
        os.chmod(f, 0o600)
    _SECRET = hashlib.sha256(f.read_text().strip().encode()).digest()


def _keys() -> tuple[bytes, bytes]:
    return (hmac.new(_SECRET, b"enc", hashlib.sha256).digest(), hmac.new(_SECRET, b"mac", hashlib.sha256).digest())


def _stream(k: bytes, nonce: bytes, n: int) -> bytes:
    out = b""
    i = 0
    while len(out) < n:
        out += hmac.new(k, nonce + i.to_bytes(8, "big"), hashlib.sha256).digest()
        i += 1
    return out[:n]


def seal(plain: str) -> str:
    ke, km = _keys()
    nonce = secrets.token_bytes(16)
    data = plain.encode()
    ct = bytes(a ^ b for a, b in zip(data, _stream(ke, nonce, len(data))))
    tag = hmac.new(km, nonce + ct, hashlib.sha256).digest()[:16]
    return "v1:" + base64.b64encode(nonce + ct + tag).decode()


def unseal(box: str) -> str | None:
    try:
        raw = base64.b64decode(box.split(":", 1)[1])
        nonce, ct, tag = raw[:16], raw[16:-16], raw[-16:]
        ke, km = _keys()
        if not hmac.compare_digest(tag, hmac.new(km, nonce + ct, hashlib.sha256).digest()[:16]):
            return None
        return bytes(a ^ b for a, b in zip(ct, _stream(ke, nonce, len(ct)))).decode()
    except Exception:
        return None


def ai_key(st: dict) -> str | None:
    if st.get("ai_key_enc"):
        k = unseal(st["ai_key_enc"])
        if k:
            return k
        log.error("Chave da IA guardada não pôde ser decifrada (SHEETS_SECRET mudou?)")
    return os.environ.get("ANTHROPIC_API_KEY") or None


def ai_key_info(st: dict) -> dict:
    meta = st.get("ai_key_meta") or {}
    if st.get("ai_key_enc"):
        ok = unseal(st["ai_key_enc"]) is not None
        return {"set": ok, "source": "painel", "hint": meta.get("hint"), "at": meta.get("at"), "by": meta.get("by"),
                "broken": not ok}
    env = os.environ.get("ANTHROPIC_API_KEY")
    return {"set": bool(env), "source": "servidor" if env else None, "hint": env[-4:] if env else None}


# --------------------------------------------------------------------------- configurações
def get_settings(c: sqlite3.Connection) -> dict:
    s = dict(DEFAULT_SETTINGS)
    for r in c.execute("SELECT k, v FROM settings"):
        try:
            s[r["k"]] = json.loads(r["v"])
        except Exception:
            pass
    return s


# --------------------------------------------------------------------------- auditoria
def audit(c: sqlite3.Connection, ev: str, data: dict | None = None, user: dict | None = None, ip: str | None = None):
    last = c.execute("SELECT seq, hash FROM audit ORDER BY seq DESC LIMIT 1").fetchone()
    seq = (last["seq"] + 1) if last else 1
    prev = last["hash"] if last else "0" * 64
    at = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    uid = user["id"] if user else None
    email = user["email"] if user else None
    body = jdump({"seq": seq, "at": at, "uid": uid, "email": email, "ev": ev, "data": data or {}, "ip": ip})
    h = hashlib.sha256((prev + body).encode()).hexdigest()
    c.execute("INSERT INTO audit(seq, at, uid, email, ev, data, ip, prev, hash) VALUES(?,?,?,?,?,?,?,?,?)",
              (seq, at, uid, email, ev, jdump(data or {}), ip, prev, h))


def verify_chain(c: sqlite3.Connection) -> dict:
    prev = "0" * 64
    n = 0
    for r in c.execute("SELECT * FROM audit ORDER BY seq"):
        if r["prev"] != prev:
            return {"ok": False, "at": r["seq"], "why": "elo quebrado (prev não confere)"}
        body = jdump({"seq": r["seq"], "at": r["at"], "uid": r["uid"], "email": r["email"], "ev": r["ev"],
                      "data": json.loads(r["data"]), "ip": r["ip"]})
        if hashlib.sha256((prev + body).encode()).hexdigest() != r["hash"]:
            return {"ok": False, "at": r["seq"], "why": "conteúdo alterado (hash não confere)"}
        prev = r["hash"]
        n += 1
    return {"ok": True, "n": n, "head": prev}


# --------------------------------------------------------------------------- inicialização
def init_db():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    load_secret()
    c = connect()
    c.execute("PRAGMA journal_mode=WAL")
    c.executescript(SCHEMA)
    c.commit()
    c.close()
    with tx() as c:
        m = c.execute("SELECT id FROM users WHERE role='master'").fetchone()
        if not m:
            pw = os.environ.get("SHEETS_MASTER_PASSWORD", "").strip()
            generated = not pw
            if generated:
                pw = temp_password()
            existing = c.execute("SELECT id FROM users WHERE email=?", (MASTER_EMAIL,)).fetchone()
            if existing:
                # recuperação de acesso: a conta é promovida com a senha nova e troca obrigatória
                c.execute("UPDATE users SET role='master', perms=NULL, active=1, pw=?, must_change=1, fails=0, locked_until=0 WHERE id=?",
                          (hash_pw(pw), existing["id"]))
                c.execute("DELETE FROM sessions WHERE uid=?", (existing["id"],))
            else:
                c.execute("INSERT INTO users(email, name, pw, role, color, must_change, created) VALUES(?,?,?,?,?,?,?)",
                          (MASTER_EMAIL, "Administrador", hash_pw(pw), "master", COLORS[0], 1, now()))
            audit(c, "sistema.master_criado", {"email": MASTER_EMAIL})
            if generated:
                log.warning("Senha inicial do master %s: %s (troca obrigatória no primeiro acesso)", MASTER_EMAIL, pw)
        if not c.execute("SELECT 1 FROM audit WHERE ev='sistema.iniciado' LIMIT 1").fetchone():
            audit(c, "sistema.iniciado", {"versao": VERSION})


# --------------------------------------------------------------------------- usuários
def eff_perms(u: dict) -> list[str]:
    if u["role"] in ("master", "admin"):
        return list(ALL)
    if u.get("perms"):
        try:
            return [p for p in json.loads(u["perms"]) if p in PERMS]
        except Exception:
            pass
    return list(ROLES.get(u["role"], ROLES["leitor"])["p"])


def avatar_url(u: dict) -> str | None:
    return f"/api/avatar/{u['id']}?v={u['avatar_v']}" if u.get("avatar_mime") else None


def pub_user(u: dict, full: bool = False) -> dict:
    o = {"id": u["id"], "name": u["name"], "email": u["email"], "avatar": avatar_url(u),
         "color": u["color"] or COLORS[u["id"] % len(COLORS)], "role": u["role"], "title": u["title"] or ""}
    if full:
        o.update({"dept": u["dept"] or "", "active": bool(u["active"]), "must_change": bool(u["must_change"]),
                  "created": u["created"], "last_login": u["last_login"], "perms": eff_perms(u),
                  "custom": bool(u["perms"]) and u["role"] not in ("master", "admin"),
                  "locked": (u["locked_until"] or 0) > now()})
    return o


def client_ip(req: Request) -> str:
    xf = req.headers.get("x-forwarded-for")
    if xf:
        return xf.split(",")[0].strip()[:64]
    return (req.client.host if req.client else "")[:64]


def need(u: dict, perm: str):
    if perm not in u["_perms"]:
        raise HTTPException(403, f"Sem permissão: {PERMS.get(perm, perm)}")


def current_user(req: Request, allow_must_change: bool = False) -> dict:
    tok = req.cookies.get(COOKIE)
    if not tok:
        raise HTTPException(401, "Sessão ausente")
    sid = hashlib.sha256(tok.encode()).hexdigest()
    with ro() as c:
        s = c.execute("SELECT * FROM sessions WHERE id=?", (sid,)).fetchone()
        if not s:
            raise HTTPException(401, "Sessão expirada")
        st = get_settings(c)
        if now() - s["last_seen"] > float(st["session_hours"]) * 3600:
            raise HTTPException(401, "Sessão expirada")
        u = c.execute("SELECT * FROM users WHERE id=?", (s["uid"],)).fetchone()
    if not u or not u["active"]:
        raise HTTPException(401, "Usuário inativo")
    u = dict(u)
    if u["must_change"] and not allow_must_change:
        raise HTTPException(428, "Troque a senha para continuar")
    if now() - s["last_seen"] > 60:
        with tx() as c:
            c.execute("UPDATE sessions SET last_seen=? WHERE id=?", (now(), sid))
    u["_perms"] = eff_perms(u)
    u["_sid"] = sid
    return u


# --------------------------------------------------------------------------- acesso às pastas
LEVELS = {"none": 0, "view": 1, "edit": 2, "owner": 3}
VIS = ("private", "org-view", "org-edit")


def book_level(c: sqlite3.Connection, u: dict, d: sqlite3.Row) -> str:
    if d["owner"] == u["id"]:
        return "owner"
    if "books.all" in u["_perms"]:
        return "edit"
    lv = "none"
    a = c.execute("SELECT level FROM book_acl WHERE book=? AND uid=?", (d["id"], u["id"])).fetchone()
    if a:
        lv = a["level"]
    if d["vis"] == "org-edit" and LEVELS[lv] < 2:
        lv = "edit"
    elif d["vis"] == "org-view" and LEVELS[lv] < 1:
        lv = "view"
    if lv != "none" and "books.view" not in u["_perms"]:
        return "none"
    return lv


def load_book(c: sqlite3.Connection, u: dict, book_id: str, minimum: str = "view", deleted_ok: bool = False):
    d = c.execute("SELECT * FROM books WHERE id=?", (book_id,)).fetchone()
    if not d or (d["deleted"] and not deleted_ok):
        raise HTTPException(404, "Pasta não encontrada")
    lv = book_level(c, u, d)
    if LEVELS[lv] < LEVELS[minimum]:
        raise HTTPException(404 if lv == "none" else 403, "Sem acesso a esta pasta")
    return d, lv


def sheets_fp(data: dict) -> str:
    return hashlib.sha256(jdump({"s": data.get("sheets"), "n": data.get("names"), "nm": data.get("name")}).encode()).hexdigest()


def bi_fp(data: dict) -> str:
    bi = dict(data.get("bi") or {})
    for k in ("page", "view"):
        bi.pop(k, None)
    return hashlib.sha256(jdump(bi).encode()).hexdigest()


def validate_book(data: Any) -> dict:
    if not isinstance(data, dict) or not isinstance(data.get("sheets"), list) or not data["sheets"]:
        raise HTTPException(400, "Pasta inválida: precisa de ao menos uma planilha")
    data["name"] = str(data.get("name") or "Pasta").strip()[:160] or "Pasta"
    return data


def snapshot(c: sqlite3.Connection, book_id: str, ver: int, data_txt: str, uid: int | None, note: str = "", kind: str = "auto"):
    c.execute("INSERT INTO book_versions(book, ver, data, by, at, note, kind, size) VALUES(?,?,?,?,?,?,?,?)",
              (book_id, ver, data_txt, uid, now(), note, kind, len(data_txt)))
    c.execute("UPDATE books SET last_snap=? WHERE id=?", (now(), book_id))
    keep = int(get_settings(c).get("versions_keep") or 60)
    c.execute("""DELETE FROM book_versions WHERE book=? AND kind='auto' AND id NOT IN
                 (SELECT id FROM book_versions WHERE book=? AND kind='auto' ORDER BY at DESC LIMIT ?)""",
              (book_id, book_id, keep))


# --------------------------------------------------------------------------- presença (memória)
PRESENCE: dict[str, dict[int, float]] = {}
_plock = threading.Lock()


def touch_presence(book_id: str, uid: int) -> list[int]:
    t = now()
    with _plock:
        m = PRESENCE.setdefault(book_id, {})
        m[uid] = t
        for k in [k for k, v in m.items() if t - v > 45]:
            m.pop(k, None)
        return list(m)


# --------------------------------------------------------------------------- limitador de login
_attempts: dict[str, list[float]] = {}
_alock = threading.Lock()


def throttle(ip: str) -> bool:
    t = now()
    with _alock:
        L = [x for x in _attempts.get(ip, []) if t - x < 600]
        L.append(t)
        _attempts[ip] = L
        return len(L) <= 40


# --------------------------------------------------------------------------- app
app = FastAPI(title="GPlanSiS|Sheets", version=VERSION, docs_url=None, redoc_url=None, openapi_url=None)

CSP = ("default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
       "font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob:; connect-src 'self' data: blob:; "
       "worker-src 'self' blob:; manifest-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; "
       "frame-ancestors 'self' https://os.gplansis.com")


@app.middleware("http")
async def guard(request: Request, call_next):
    path = request.url.path
    if path.startswith("/api/") and request.method not in ("GET", "HEAD", "OPTIONS"):
        # o webhook do Docs vem de servidor para servidor, assinado com HMAC (conferido na rota)
        if request.headers.get("x-requested-with") != CSRF_HEADER and path != "/api/integracao/docs/evento":
            return JSONResponse({"detail": "Requisição recusada (CSRF)"}, status_code=403)
        origin = request.headers.get("origin")
        host = request.headers.get("host", "")
        if origin and origin.split("://", 1)[-1] != host:
            return JSONResponse({"detail": "Origem não permitida"}, status_code=403)
    resp = await call_next(request)
    resp.headers.setdefault("Content-Security-Policy", CSP)
    resp.headers.setdefault("X-Content-Type-Options", "nosniff")
    resp.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    resp.headers.setdefault("Cross-Origin-Opener-Policy", "same-origin")
    if path.startswith("/api/") and not path.startswith("/api/avatar/"):
        resp.headers.setdefault("Cache-Control", "no-store")
    return resp


@app.exception_handler(HTTPException)
async def http_err(_req: Request, exc: HTTPException):
    return JSONResponse({"detail": exc.detail}, status_code=exc.status_code)


@app.on_event("startup")
def _startup():
    init_db()


async def body(req: Request, limit: int = MAX_BOOK + 65536) -> dict:
    raw = await req.body()
    if len(raw) > limit:
        raise HTTPException(413, "Conteúdo grande demais")
    try:
        o = json.loads(raw or b"{}")
    except Exception:
        raise HTTPException(400, "JSON inválido")
    if not isinstance(o, dict):
        raise HTTPException(400, "JSON inválido")
    return o


def ai_ready(st: dict) -> bool:
    return bool(st.get("ai_enabled")) and bool(ai_key(st))


def me_payload(c: sqlite3.Connection, u: dict) -> dict:
    st = get_settings(c)
    o = pub_user(u, full=True)
    try:
        o["prefs"] = json.loads(u["prefs"] or "{}")
    except Exception:
        o["prefs"] = {}
    o["perms"] = u.get("_perms") or eff_perms(u)
    return {"user": o, "org": {"name": st["org_name"], "banner": st.get("banner") or "", "pw_min": int(st["pw_min"])},
            "ai": ai_ready(st), "version": VERSION, "perms": PERMS, "docs": bool(DOCS_SEG), "docsUrl": DOCS_URL,
            "roles": {k: {"n": v["n"], "d": v["d"], "p": v["p"]} for k, v in ROLES.items()}}


# ---------------- saúde
@app.api_route("/api/health", methods=["GET", "HEAD"])
@app.api_route("/api/saude", methods=["GET", "HEAD"])
@app.api_route("/health.json", methods=["GET", "HEAD"])
def health():
    with ro() as c:
        c.execute("SELECT 1").fetchone()
    return {"status": "ok", "app": "GPlanSiS|Sheets", "version": VERSION}


# ---------------- autenticação
@app.post("/api/auth/login")
async def login(req: Request):
    b = await body(req, 8192)
    ip = client_ip(req)
    email = str(b.get("email") or "").strip().lower()[:200]
    pw = str(b.get("password") or "")
    if not throttle(ip):
        raise HTTPException(429, "Muitas tentativas. Aguarde alguns minutos.")
    # a falha é gravada (contador, bloqueio, auditoria) antes de responder
    with tx() as c:
        u = c.execute("SELECT * FROM users WHERE email=?", (email,)).fetchone()
        fail = None
        if not u:
            check_pw(pw, DUMMY_HASH)  # mesmo custo de uma conta existente
            audit(c, "auth.falha", {"email": email, "motivo": "desconhecido"}, ip=ip)
            fail = (401, "E-mail ou senha incorretos.")
        else:
            u = dict(u)
            if (u["locked_until"] or 0) > now():
                mins = int(((u["locked_until"] or 0) - now()) / 60) + 1
                fail = (423, f"Conta bloqueada por tentativas erradas. Tente em {mins} min.")
            elif not check_pw(pw, u["pw"]):
                fails = (u["fails"] or 0) + 1
                lock = now() + 900 if fails >= 8 else 0
                c.execute("UPDATE users SET fails=?, locked_until=? WHERE id=?", (0 if lock else fails, lock, u["id"]))
                audit(c, "auth.falha", {"email": email, "motivo": "senha", "bloqueio": bool(lock)}, user=u, ip=ip)
                fail = (401, "E-mail ou senha incorretos.")
            elif not u["active"]:
                audit(c, "auth.falha", {"email": email, "motivo": "inativo"}, user=u, ip=ip)
                fail = (403, "Usuário desativado. Fale com o administrador.")
    if fail:
        raise HTTPException(*fail)
    with tx() as c:
        return open_session(c, u, req, "auth.login", {})


def open_session(c: sqlite3.Connection, u: dict, req: Request, ev: str, data: dict, extra: dict | None = None) -> JSONResponse:
    ip = client_ip(req)
    tok = secrets.token_urlsafe(32)
    sid = hashlib.sha256(tok.encode()).hexdigest()
    c.execute("INSERT INTO sessions(id, uid, created, last_seen, ip, ua) VALUES(?,?,?,?,?,?)",
              (sid, u["id"], now(), now(), ip, (req.headers.get("user-agent") or "")[:200]))
    c.execute("UPDATE users SET fails=0, locked_until=0, last_login=? WHERE id=?", (now(), u["id"]))
    c.execute("DELETE FROM sessions WHERE last_seen < ?", (now() - 30 * 86400,))
    audit(c, ev, data, user=u, ip=ip)
    st = get_settings(c)
    u["_perms"] = eff_perms(u)
    resp = JSONResponse({**me_payload(c, u), **(extra or {})})
    resp.set_cookie(COOKIE, tok, httponly=True, secure=SECURE_COOKIE, samesite="strict", path="/",
                    max_age=int(float(st["session_hours"]) * 3600) + 86400 * 7)
    return resp


@app.post("/api/auth/logout")
def logout(req: Request):
    tok = req.cookies.get(COOKIE)
    if tok:
        sid = hashlib.sha256(tok.encode()).hexdigest()
        with tx() as c:
            s = c.execute("SELECT uid FROM sessions WHERE id=?", (sid,)).fetchone()
            c.execute("DELETE FROM sessions WHERE id=?", (sid,))
            if s:
                u = c.execute("SELECT id, email FROM users WHERE id=?", (s["uid"],)).fetchone()
                audit(c, "auth.logout", {}, user=dict(u) if u else None, ip=client_ip(req))
    resp = JSONResponse({"ok": True})
    resp.delete_cookie(COOKIE, path="/")
    return resp


# ---------------- perfil
@app.get("/api/me")
def me(req: Request):
    u = current_user(req, allow_must_change=True)
    with ro() as c:
        return me_payload(c, u)


def decode_avatar(av: str) -> tuple[bytes, str]:
    m = re.fullmatch(r"data:(image/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)", av)
    if not m or len(av) > MAX_AVATAR * 4 // 3 + 64:
        raise HTTPException(400, "Imagem de avatar inválida ou grande demais")
    raw = base64.b64decode(m.group(2))
    sig = {"image/png": raw[:8] == b"\x89PNG\r\n\x1a\n", "image/jpeg": raw[:3] == b"\xff\xd8\xff",
           "image/webp": raw[:4] == b"RIFF" and raw[8:12] == b"WEBP"}
    if not sig[m.group(1)]:
        raise HTTPException(400, "O conteúdo da imagem não confere com o tipo")
    return raw, m.group(1)


@app.patch("/api/me")
async def me_update(req: Request):
    u = current_user(req)
    b = await body(req, MAX_AVATAR * 2 + 16384)
    sets, vals = [], []
    if "name" in b:
        n = str(b["name"] or "").strip()[:80]
        if len(n) < 2:
            raise HTTPException(400, "Informe seu nome")
        sets.append("name=?"); vals.append(n)
    for k in ("title", "dept"):
        if k in b:
            sets.append(f"{k}=?"); vals.append(str(b[k] or "").strip()[:80])
    if "color" in b:
        col = str(b["color"] or "")
        if not re.fullmatch(r"#[0-9a-fA-F]{6}", col):
            raise HTTPException(400, "Cor inválida")
        sets.append("color=?"); vals.append(col)
    if "avatar" in b:
        if b["avatar"]:
            raw, mime = decode_avatar(str(b["avatar"]))
            sets.append("avatar=?, avatar_mime=?, avatar_v=avatar_v+1"); vals += [raw, mime]
        else:
            sets.append("avatar=NULL, avatar_mime=NULL, avatar_v=avatar_v+1")
    if "prefs" in b:
        if not isinstance(b["prefs"], dict):
            raise HTTPException(400, "Preferências inválidas")
        p = jdump(b["prefs"])
        if len(p) > 8000:
            raise HTTPException(400, "Preferências grandes demais")
        sets.append("prefs=?"); vals.append(p)
    if not sets:
        raise HTTPException(400, "Nada para alterar")
    with tx() as c:
        c.execute(f"UPDATE users SET {', '.join(sets)} WHERE id=?", (*vals, u["id"]))
        changed = [k for k in b if k != "prefs"]
        if changed:
            audit(c, "perfil.atualizado", {"campos": changed}, user=u, ip=client_ip(req))
        nu = dict(c.execute("SELECT * FROM users WHERE id=?", (u["id"],)).fetchone())
        nu["_perms"] = eff_perms(nu)
        return me_payload(c, nu)


@app.get("/api/avatar/{uid}")
def avatar(uid: int, req: Request):
    current_user(req, allow_must_change=True)
    with ro() as c:
        r = c.execute("SELECT avatar, avatar_mime FROM users WHERE id=?", (uid,)).fetchone()
    if not r or not r["avatar_mime"]:
        raise HTTPException(404, "Sem avatar")
    return Response(bytes(r["avatar"]), media_type=r["avatar_mime"],
                    headers={"Cache-Control": "private, max-age=31536000, immutable"})


@app.post("/api/me/password")
async def me_password(req: Request):
    u = current_user(req, allow_must_change=True)
    b = await body(req, 4096)
    cur, new = str(b.get("current") or ""), str(b.get("new") or "")
    if not check_pw(cur, u["pw"]):
        raise HTTPException(400, "A senha atual não confere.")
    with tx() as c:
        st = get_settings(c)
        prob = pw_problem(new, int(st["pw_min"]))
        if prob:
            raise HTTPException(400, prob)
        if check_pw(new, u["pw"]):
            raise HTTPException(400, "A nova senha precisa ser diferente da atual.")
        c.execute("UPDATE users SET pw=?, must_change=0, pw_changed=? WHERE id=?", (hash_pw(new), now(), u["id"]))
        c.execute("DELETE FROM sessions WHERE uid=? AND id<>?", (u["id"], u["_sid"]))
        audit(c, "perfil.senha_trocada", {}, user=u, ip=client_ip(req))
    return {"ok": True}


@app.get("/api/me/sessions")
def me_sessions(req: Request):
    u = current_user(req)
    with ro() as c:
        rows = c.execute("SELECT id, created, last_seen, ip, ua FROM sessions WHERE uid=? ORDER BY last_seen DESC", (u["id"],)).fetchall()
    return [{"id": r["id"][:16], "created": r["created"], "last_seen": r["last_seen"], "ip": r["ip"], "ua": r["ua"],
             "current": r["id"] == u["_sid"]} for r in rows]


@app.delete("/api/me/sessions/{sid}")
def me_session_del(sid: str, req: Request):
    u = current_user(req)
    if not re.fullmatch(r"[0-9a-f]{16}", sid):
        raise HTTPException(400, "Sessão inválida")
    with tx() as c:
        c.execute("DELETE FROM sessions WHERE uid=? AND substr(id,1,16)=? AND id<>?", (u["id"], sid, u["_sid"]))
        audit(c, "perfil.sessao_encerrada", {}, user=u, ip=client_ip(req))
    return {"ok": True}


# ---------------- usuários
@app.get("/api/directory")
def directory(req: Request):
    current_user(req)
    with ro() as c:
        rows = c.execute("SELECT * FROM users WHERE active=1 ORDER BY name").fetchall()
    return [pub_user(dict(r)) for r in rows]


@app.get("/api/users")
def users_list(req: Request):
    u = current_user(req)
    need(u, "users.manage")
    with ro() as c:
        rows = c.execute("SELECT * FROM users ORDER BY role='master' DESC, active DESC, name").fetchall()
        counts = {r["owner"]: r["n"] for r in c.execute("SELECT owner, COUNT(*) n FROM books WHERE deleted IS NULL GROUP BY owner")}
        sess = {r["uid"]: r["n"] for r in c.execute("SELECT uid, COUNT(*) n FROM sessions WHERE last_seen>? GROUP BY uid", (now() - 900,))}
    out = []
    for r in rows:
        o = pub_user(dict(r), full=True)
        o["books"] = counts.get(r["id"], 0)
        o["online"] = sess.get(r["id"], 0) > 0
        out.append(o)
    return out


def can_touch(actor: dict, target: dict | None, new_role: str | None = None):
    if target and target["role"] == "master" and actor["role"] != "master":
        raise HTTPException(403, "Somente o admin master altera a própria conta.")
    if actor["role"] != "master":
        if (target and target["role"] == "admin") or new_role == "admin":
            raise HTTPException(403, "Somente o admin master gerencia administradores.")
    if new_role == "master":
        raise HTTPException(403, "Existe um único admin master.")
    if new_role and new_role not in ROLES:
        raise HTTPException(400, "Papel inválido")


def clean_perms(p: Any) -> str | None:
    if p is None:
        return None
    if not isinstance(p, list):
        raise HTTPException(400, "Permissões inválidas")
    return jdump(sorted({x for x in p if x in PERMS}))


@app.post("/api/users")
async def users_create(req: Request):
    u = current_user(req)
    need(u, "users.manage")
    b = await body(req, 16384)
    email = str(b.get("email") or "").strip().lower()
    name = str(b.get("name") or "").strip()[:80]
    if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email) or len(email) > 200:
        raise HTTPException(400, "E-mail inválido")
    if len(name) < 2:
        raise HTTPException(400, "Informe o nome")
    with tx() as c:
        st = get_settings(c)
        role = str(b.get("role") or st["default_role"])
        can_touch(u, None, role)
        perms = clean_perms(b.get("perms")) if b.get("custom") else None
        if c.execute("SELECT 1 FROM users WHERE email=?", (email,)).fetchone():
            raise HTTPException(409, "Já existe um usuário com este e-mail")
        pw = str(b.get("password") or "") or temp_password()
        if b.get("password"):
            prob = pw_problem(pw, int(st["pw_min"]))
            if prob:
                raise HTTPException(400, prob)
        cur = c.execute("INSERT INTO users(email, name, pw, role, perms, title, dept, color, must_change, created) VALUES(?,?,?,?,?,?,?,?,?,?)",
                        (email, name, hash_pw(pw), role, perms, str(b.get("title") or "")[:80], str(b.get("dept") or "")[:80],
                         secrets.choice(COLORS), 1, now()))
        nid = cur.lastrowid
        audit(c, "usuario.criado", {"id": nid, "email": email, "papel": role, "personalizado": bool(perms)}, user=u, ip=client_ip(req))
        nu = dict(c.execute("SELECT * FROM users WHERE id=?", (nid,)).fetchone())
    return {"user": pub_user(nu, full=True), "temp_password": pw}


@app.patch("/api/users/{uid}")
async def users_update(uid: int, req: Request):
    u = current_user(req)
    need(u, "users.manage")
    b = await body(req, 16384)
    with tx() as c:
        t = c.execute("SELECT * FROM users WHERE id=?", (uid,)).fetchone()
        if not t:
            raise HTTPException(404, "Usuário não encontrado")
        t = dict(t)
        new_role = b.get("role") if "role" in b else None
        can_touch(u, t, new_role if new_role != t["role"] else None)
        if t["role"] == "master" and (("role" in b and b["role"] != "master") or b.get("active") is False):
            raise HTTPException(403, "O admin master não pode ser rebaixado nem desativado.")
        if uid == u["id"] and b.get("active") is False:
            raise HTTPException(400, "Você não pode desativar a própria conta.")
        sets, vals, changed = [], [], {}
        if "name" in b:
            n = str(b["name"] or "").strip()[:80]
            if len(n) < 2:
                raise HTTPException(400, "Nome inválido")
            sets.append("name=?"); vals.append(n); changed["nome"] = n
        for k in ("title", "dept"):
            if k in b:
                sets.append(f"{k}=?"); vals.append(str(b[k] or "")[:80]); changed[k] = b[k]
        if "role" in b and t["role"] != "master":
            sets.append("role=?"); vals.append(b["role"]); changed["papel"] = b["role"]
        if "custom" in b and t["role"] != "master":
            p = clean_perms(b.get("perms")) if b["custom"] else None
            sets.append("perms=?"); vals.append(p); changed["permissoes"] = json.loads(p) if p else "padrão do papel"
        if "active" in b:
            sets.append("active=?"); vals.append(1 if b["active"] else 0); changed["ativo"] = bool(b["active"])
            if not b["active"]:
                c.execute("DELETE FROM sessions WHERE uid=?", (uid,))
        if b.get("unlock"):
            sets.append("locked_until=0, fails=0"); changed["desbloqueado"] = True
        if not sets:
            raise HTTPException(400, "Nada para alterar")
        c.execute(f"UPDATE users SET {', '.join(sets)} WHERE id=?", (*vals, uid))
        audit(c, "usuario.alterado", {"id": uid, "email": t["email"], **changed}, user=u, ip=client_ip(req))
        nu = dict(c.execute("SELECT * FROM users WHERE id=?", (uid,)).fetchone())
    return pub_user(nu, full=True)


@app.post("/api/users/{uid}/reset")
def users_reset(uid: int, req: Request):
    u = current_user(req)
    need(u, "users.manage")
    with tx() as c:
        t = c.execute("SELECT * FROM users WHERE id=?", (uid,)).fetchone()
        if not t:
            raise HTTPException(404, "Usuário não encontrado")
        can_touch(u, dict(t))
        if uid == u["id"]:
            raise HTTPException(400, "Use Configurações › Segurança para trocar a sua senha.")
        pw = temp_password()
        c.execute("UPDATE users SET pw=?, must_change=1, fails=0, locked_until=0 WHERE id=?", (hash_pw(pw), uid))
        c.execute("DELETE FROM sessions WHERE uid=?", (uid,))
        audit(c, "usuario.senha_redefinida", {"id": uid, "email": t["email"]}, user=u, ip=client_ip(req))
    return {"temp_password": pw}


@app.delete("/api/users/{uid}")
def users_delete(uid: int, req: Request):
    u = current_user(req)
    need(u, "users.manage")
    with tx() as c:
        t = c.execute("SELECT * FROM users WHERE id=?", (uid,)).fetchone()
        if not t:
            raise HTTPException(404, "Usuário não encontrado")
        can_touch(u, dict(t))
        if t["role"] == "master" or uid == u["id"]:
            raise HTTPException(400, "Esta conta não pode ser excluída.")
        n = c.execute("UPDATE books SET owner=? WHERE owner=?", (u["id"], uid)).rowcount
        c.execute("UPDATE book_versions SET by=NULL WHERE by=?", (uid,))
        c.execute("UPDATE books SET updated_by=NULL WHERE updated_by=?", (uid,))
        c.execute("DELETE FROM users WHERE id=?", (uid,))
        audit(c, "usuario.excluido", {"id": uid, "email": t["email"], "pastas_transferidas": n}, user=u, ip=client_ip(req))
    return {"ok": True, "transferred": n}


# ---------------- pastas de trabalho
def book_row(u: dict, d: sqlite3.Row, lv: str, names: dict) -> dict:
    return {"id": d["id"], "name": d["name"], "owner": names.get(d["owner"]), "vis": d["vis"], "ver": d["ver"],
            "size": d["size"], "sheets": d["sheets"], "has_bi": bool(d["has_bi"]), "created": d["created"],
            "updated": d["updated"], "updated_by": names.get(d["updated_by"]), "level": lv, "deleted": d["deleted"],
            "mine": d["owner"] == u["id"]}


def user_map(c: sqlite3.Connection) -> dict:
    return {r["id"]: pub_user(dict(r)) for r in c.execute("SELECT * FROM users")}


LIST_COLS = "id, name, owner, vis, ver, size, sheets, has_bi, created, updated, updated_by, deleted"


@app.get("/api/books")
def books_list(req: Request, trash: int = 0):
    u = current_user(req)
    with ro() as c:
        names = user_map(c)
        q = f"SELECT {LIST_COLS} FROM books WHERE " + ("deleted IS NOT NULL" if trash else "deleted IS NULL")
        out = []
        for d in c.execute(q + " ORDER BY updated DESC"):
            lv = book_level(c, u, d)
            if lv == "none":
                continue
            if trash and not (d["owner"] == u["id"] or u["role"] in ("master", "admin")):
                continue
            out.append(book_row(u, d, lv, names))
    return out


@app.post("/api/books")
async def books_create(req: Request):
    u = current_user(req)
    need(u, "books.create")
    b = await body(req)
    data = validate_book(b.get("data"))
    if b.get("name"):
        data["name"] = str(b["name"]).strip()[:160] or data["name"]
    bid = "wb" + secrets.token_hex(8)
    data["id"] = bid
    txt = compact(data)
    if len(txt) > MAX_BOOK:
        raise HTTPException(413, "Pasta grande demais (limite de 30 MB)")
    with tx() as c:
        c.execute("INSERT INTO books(id, name, owner, vis, data, ver, size, sheets, has_bi, created, updated, updated_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
                  (bid, data["name"], u["id"], "private", txt, 1, len(txt), len(data["sheets"]), int(bool(data.get("bi"))), now(), now(), u["id"]))
        snapshot(c, bid, 1, txt, u["id"], str(b.get("origin") or "Criação")[:120], "named")
        audit(c, "pasta.criada", {"pasta": bid, "nome": data["name"], "origem": str(b.get("origin") or "nova")[:120]}, user=u, ip=client_ip(req))
        d = c.execute("SELECT * FROM books WHERE id=?", (bid,)).fetchone()
        return book_row(u, d, "owner", user_map(c))


@app.get("/api/books/{book_id}")
def books_get(book_id: str, req: Request):
    u = current_user(req)
    with ro() as c:
        d, lv = load_book(c, u, book_id)
        row = book_row(u, d, lv, user_map(c))
        row["data"] = json.loads(d["data"])
    touch_presence(book_id, u["id"])
    return row


@app.get("/api/books/{book_id}/head")
def books_head(book_id: str, req: Request):
    u = current_user(req)
    with ro() as c:
        d, lv = load_book(c, u, book_id)
        names = user_map(c)
    viewers = [names[i] for i in touch_presence(book_id, u["id"]) if i in names and i != u["id"]]
    return {"ver": d["ver"], "updated": d["updated"], "updated_by": names.get(d["updated_by"]), "level": lv,
            "name": d["name"], "viewers": viewers}


@app.put("/api/books/{book_id}")
async def books_save(book_id: str, req: Request):
    u = current_user(req)
    b = await body(req)
    data = validate_book(b.get("data"))
    data["id"] = book_id
    base = int(b.get("base") or 0)
    txt = compact(data)
    if len(txt) > MAX_BOOK:
        raise HTTPException(413, "Pasta grande demais (limite de 30 MB)")
    with tx() as c:
        d, lv = load_book(c, u, book_id)
        names = user_map(c)
        if d["ver"] != base and not b.get("force"):
            return JSONResponse({"detail": "conflito", "ver": d["ver"], "updated": d["updated"],
                                 "updated_by": names.get(d["updated_by"])}, status_code=409)
        if b.get("force") and lv != "owner" and "books.all" not in u["_perms"]:
            raise HTTPException(403, "Somente o dono pode sobrescrever a versão de outra pessoa.")
        old = json.loads(d["data"])
        can_edit = LEVELS[lv] >= 2
        sheets_changed = sheets_fp(old) != sheets_fp(data)
        bi_changed = bi_fp(old) != bi_fp(data)
        if not (sheets_changed or bi_changed):
            return {"ver": d["ver"], "updated": d["updated"], "unchanged": True}
        if sheets_changed and not (can_edit and "books.edit" in u["_perms"]):
            raise HTTPException(403, "Você pode visualizar, mas não editar esta pasta.")
        if bi_changed and not (can_edit and "bi.edit" in u["_perms"]):
            raise HTTPException(403, "Sem permissão para alterar o BI desta pasta.")
        ver = d["ver"] + 1
        c.execute("UPDATE books SET data=?, ver=?, size=?, sheets=?, has_bi=?, name=?, updated=?, updated_by=? WHERE id=?",
                  (txt, ver, len(txt), len(data["sheets"]), int(bool(data.get("bi"))), data["name"], now(), u["id"], book_id))
        if now() - (d["last_snap"] or 0) > 600:
            snapshot(c, book_id, ver, txt, u["id"])
        if d["name"] != data["name"]:
            audit(c, "pasta.renomeada", {"pasta": book_id, "de": d["name"], "para": data["name"]}, user=u, ip=client_ip(req))
        if b.get("force"):
            audit(c, "pasta.sobrescrita", {"pasta": book_id, "base": base, "servidor": d["ver"]}, user=u, ip=client_ip(req))
    return {"ver": ver, "updated": now()}


@app.delete("/api/books/{book_id}")
def books_delete(book_id: str, req: Request, hard: int = 0):
    u = current_user(req)
    with tx() as c:
        d, lv = load_book(c, u, book_id, "view", deleted_ok=bool(hard))
        if not ((lv == "owner" and "books.delete" in u["_perms"]) or u["role"] in ("master", "admin")):
            raise HTTPException(403, "Somente o dono (ou um administrador) exclui a pasta.")
        if hard:
            if not d["deleted"]:
                raise HTTPException(400, "Mova para a lixeira antes de excluir definitivamente.")
            c.execute("DELETE FROM books WHERE id=?", (book_id,))
            audit(c, "pasta.excluida_definitivo", {"pasta": book_id, "nome": d["name"]}, user=u, ip=client_ip(req))
        else:
            c.execute("UPDATE books SET deleted=? WHERE id=?", (now(), book_id))
            audit(c, "pasta.lixeira", {"pasta": book_id, "nome": d["name"]}, user=u, ip=client_ip(req))
    return {"ok": True}


@app.post("/api/books/{book_id}/restore")
def books_restore(book_id: str, req: Request):
    u = current_user(req)
    with tx() as c:
        d, lv = load_book(c, u, book_id, "view", deleted_ok=True)
        if not (lv == "owner" or u["role"] in ("master", "admin")):
            raise HTTPException(403, "Sem permissão")
        c.execute("UPDATE books SET deleted=NULL, updated=? WHERE id=?", (now(), book_id))
        audit(c, "pasta.restaurada", {"pasta": book_id, "nome": d["name"]}, user=u, ip=client_ip(req))
    return {"ok": True}


@app.post("/api/books/{book_id}/duplicate")
async def books_duplicate(book_id: str, req: Request):
    u = current_user(req)
    need(u, "books.create")
    b = await body(req, 4096)
    with tx() as c:
        d, _ = load_book(c, u, book_id)
        data = json.loads(d["data"])
        data["name"] = (str(b.get("name") or "").strip() or d["name"] + " (cópia)")[:160]
        bid = "wb" + secrets.token_hex(8)
        data["id"] = bid
        txt = compact(data)
        c.execute("INSERT INTO books(id, name, owner, vis, data, ver, size, sheets, has_bi, created, updated, updated_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
                  (bid, data["name"], u["id"], "private", txt, 1, len(txt), d["sheets"], d["has_bi"], now(), now(), u["id"]))
        snapshot(c, bid, 1, txt, u["id"], "Cópia de " + d["name"], "named")
        audit(c, "pasta.duplicada", {"pasta": bid, "origem": book_id}, user=u, ip=client_ip(req))
        nd = c.execute("SELECT * FROM books WHERE id=?", (bid,)).fetchone()
        return book_row(u, nd, "owner", user_map(c))


@app.get("/api/books/{book_id}/acl")
def acl_get(book_id: str, req: Request):
    u = current_user(req)
    with ro() as c:
        d, lv = load_book(c, u, book_id)
        names = user_map(c)
        rows = c.execute("SELECT uid, level FROM book_acl WHERE book=?", (book_id,)).fetchall()
    return {"vis": d["vis"], "owner": names.get(d["owner"]), "level": lv,
            "acl": [{"user": names[r["uid"]], "level": r["level"]} for r in rows if r["uid"] in names]}


@app.put("/api/books/{book_id}/acl")
async def acl_put(book_id: str, req: Request):
    u = current_user(req)
    need(u, "books.share")
    b = await body(req, 65536)
    entries = b.get("acl")
    if not isinstance(entries, list):
        raise HTTPException(400, "Lista inválida")
    with tx() as c:
        d, lv = load_book(c, u, book_id, "edit")
        if not (lv == "owner" or "books.all" in u["_perms"]):
            raise HTTPException(403, "Somente o dono compartilha esta pasta.")
        c.execute("DELETE FROM book_acl WHERE book=?", (book_id,))
        out = []
        for e in entries[:500]:
            uid = int(e.get("uid") or 0)
            level = e.get("level")
            if level not in ("view", "edit") or uid == d["owner"]:
                continue
            if c.execute("SELECT 1 FROM users WHERE id=?", (uid,)).fetchone():
                c.execute("INSERT OR REPLACE INTO book_acl(book, uid, level) VALUES(?,?,?)", (book_id, uid, level))
                out.append({"uid": uid, "level": level})
        if b.get("vis") in VIS:
            c.execute("UPDATE books SET vis=? WHERE id=?", (b["vis"], book_id))
        audit(c, "pasta.compartilhada", {"pasta": book_id, "acl": out, "vis": b.get("vis")}, user=u, ip=client_ip(req))
    return {"ok": True}


@app.get("/api/books/{book_id}/versions")
def versions_list(book_id: str, req: Request):
    u = current_user(req)
    with ro() as c:
        load_book(c, u, book_id)
        names = user_map(c)
        rows = c.execute("SELECT id, ver, by, at, note, kind, size FROM book_versions WHERE book=? ORDER BY at DESC", (book_id,)).fetchall()
    return [{"id": r["id"], "ver": r["ver"], "by": names.get(r["by"]), "at": r["at"], "note": r["note"], "kind": r["kind"],
             "size": r["size"]} for r in rows]


@app.get("/api/books/{book_id}/versions/{vid}")
def versions_get(book_id: str, vid: int, req: Request):
    u = current_user(req)
    with ro() as c:
        load_book(c, u, book_id)
        r = c.execute("SELECT data FROM book_versions WHERE book=? AND id=?", (book_id, vid)).fetchone()
    if not r:
        raise HTTPException(404, "Versão não encontrada")
    return {"data": json.loads(r["data"])}


@app.post("/api/books/{book_id}/versions")
async def versions_create(book_id: str, req: Request):
    u = current_user(req)
    b = await body(req, 4096)
    with tx() as c:
        d, _ = load_book(c, u, book_id, "edit")
        note = str(b.get("note") or "").strip()[:200] or "Versão nomeada"
        snapshot(c, book_id, d["ver"], d["data"], u["id"], note, "named")
        audit(c, "pasta.versao_salva", {"pasta": book_id, "nota": note, "ver": d["ver"]}, user=u, ip=client_ip(req))
    return {"ok": True}


@app.post("/api/books/{book_id}/versions/{vid}/restore")
def versions_restore(book_id: str, vid: int, req: Request):
    u = current_user(req)
    with tx() as c:
        d, _ = load_book(c, u, book_id, "edit")
        need(u, "books.edit")
        r = c.execute("SELECT * FROM book_versions WHERE book=? AND id=?", (book_id, vid)).fetchone()
        if not r:
            raise HTTPException(404, "Versão não encontrada")
        snapshot(c, book_id, d["ver"], d["data"], u["id"],
                 "Antes de restaurar a versão de " + time.strftime("%d/%m %H:%M", time.localtime(r["at"])), "named")
        data = json.loads(r["data"])
        ver = d["ver"] + 1
        c.execute("UPDATE books SET data=?, ver=?, size=?, sheets=?, has_bi=?, name=?, updated=?, updated_by=? WHERE id=?",
                  (r["data"], ver, len(r["data"]), len(data.get("sheets") or []), int(bool(data.get("bi"))),
                   data.get("name") or d["name"], now(), u["id"], book_id))
        audit(c, "pasta.versao_restaurada", {"pasta": book_id, "versao": vid}, user=u, ip=client_ip(req))
    return {"ver": ver}


@app.post("/api/events")
async def client_event(req: Request):
    """Eventos relevantes que só o navegador conhece (exportações, importações)."""
    u = current_user(req)
    b = await body(req, 4096)
    ev = str(b.get("ev") or "")
    if ev not in ("exportou", "importou"):
        raise HTTPException(400, "Evento inválido")
    need(u, "export" if ev == "exportou" else "import")
    with tx() as c:
        audit(c, "pasta." + ev, {"pasta": str(b.get("book") or "")[:40], "formato": str(b.get("fmt") or "")[:20],
                                 "arquivo": str(b.get("file") or "")[:160]}, user=u, ip=client_ip(req))
    return {"ok": True}


# ---------------- auditoria e painel
@app.get("/api/audit")
def audit_list(req: Request, limit: int = 200, before: int = 0, q: str = ""):
    u = current_user(req)
    need(u, "audit.view")
    limit = max(1, min(limit, 1000))
    sql, args = "SELECT * FROM audit WHERE 1=1", []
    if before:
        sql += " AND seq<?"; args.append(before)
    if q:
        sql += " AND (ev LIKE ? OR email LIKE ? OR data LIKE ?)"; args += [f"%{q}%"] * 3
    sql += " ORDER BY seq DESC LIMIT ?"; args.append(limit)
    with ro() as c:
        rows = c.execute(sql, args).fetchall()
        total = c.execute("SELECT COUNT(*) n FROM audit").fetchone()["n"]
    return {"total": total, "items": [{"seq": r["seq"], "at": r["at"], "email": r["email"], "ev": r["ev"],
                                       "data": json.loads(r["data"]), "ip": r["ip"], "hash": r["hash"]} for r in rows]}


@app.get("/api/audit/verify")
def audit_verify(req: Request):
    u = current_user(req)
    need(u, "audit.view")
    with ro() as c:
        return verify_chain(c)


@app.get("/api/audit.csv")
def audit_csv(req: Request):
    u = current_user(req)
    need(u, "audit.view")
    buf = io.StringIO()
    w = csv.writer(buf, delimiter=";")
    w.writerow(["seq", "quando_utc", "usuario", "evento", "dados", "ip", "prev", "hash"])
    with ro() as c:
        for r in c.execute("SELECT * FROM audit ORDER BY seq"):
            w.writerow([r["seq"], r["at"], r["email"] or "", r["ev"], r["data"], r["ip"] or "", r["prev"], r["hash"]])
    with tx() as c:
        audit(c, "auditoria.exportada", {}, user=u, ip=client_ip(req))
    return Response("﻿" + buf.getvalue(), media_type="text/csv; charset=utf-8",
                    headers={"Content-Disposition": 'attachment; filename="sheets_auditoria.csv"'})


@app.get("/api/stats")
def stats(req: Request):
    u = current_user(req)
    if not ({"users.manage", "system.settings", "audit.view"} & set(u["_perms"])):
        raise HTTPException(403, "Sem permissão")
    iso = lambda t: time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(t))
    with ro() as c:
        one = lambda q, *a: c.execute(q, a).fetchone()[0]
        out = {
            "users": one("SELECT COUNT(*) FROM users WHERE active=1"),
            "users_inactive": one("SELECT COUNT(*) FROM users WHERE active=0"),
            "online": one("SELECT COUNT(DISTINCT uid) FROM sessions WHERE last_seen>?", now() - 900),
            "books": one("SELECT COUNT(*) FROM books WHERE deleted IS NULL"),
            "books_bi": one("SELECT COUNT(*) FROM books WHERE deleted IS NULL AND has_bi=1"),
            "trash": one("SELECT COUNT(*) FROM books WHERE deleted IS NOT NULL"),
            "versions": one("SELECT COUNT(*) FROM book_versions"),
            "bytes": one("SELECT COALESCE(SUM(size),0) FROM books") + one("SELECT COALESCE(SUM(size),0) FROM book_versions"),
            "audit": one("SELECT COUNT(*) FROM audit"),
            "logins_24h": one("SELECT COUNT(*) FROM audit WHERE ev='auth.login' AND at>?", iso(now() - 86400)),
            "fails_24h": one("SELECT COUNT(*) FROM audit WHERE ev='auth.falha' AND at>?", iso(now() - 86400)),
            "roles": {r["role"]: r["n"] for r in c.execute("SELECT role, COUNT(*) n FROM users WHERE active=1 GROUP BY role")},
            "ai_key": bool(ai_key(get_settings(c))),
            "ai_model": get_settings(c).get("ai_model"),
            "version": VERSION,
            "db_bytes": DB_PATH.stat().st_size if DB_PATH.exists() else 0,
        }
        days = []
        for i in range(13, -1, -1):
            d0 = time.strftime("%Y-%m-%d", time.gmtime(now() - i * 86400))
            days.append({"d": d0, "n": one("SELECT COUNT(*) FROM audit WHERE substr(at,1,10)=?", d0),
                         "logins": one("SELECT COUNT(*) FROM audit WHERE ev='auth.login' AND substr(at,1,10)=?", d0)})
        out["activity"] = days
        out["top_events"] = [{"ev": r["ev"], "n": r["n"]} for r in
                             c.execute("SELECT ev, COUNT(*) n FROM audit GROUP BY ev ORDER BY n DESC LIMIT 8")]
        names = user_map(c)
        out["recent_books"] = [{"name": r["name"], "owner": (names.get(r["owner"]) or {}).get("name"), "updated": r["updated"],
                                "size": r["size"]} for r in
                               c.execute("SELECT name, owner, updated, size FROM books WHERE deleted IS NULL ORDER BY updated DESC LIMIT 6")]
    return out


@app.get("/api/settings")
def settings_get(req: Request):
    u = current_user(req)
    need(u, "system.settings")
    with ro() as c:
        return public_settings(get_settings(c))


def public_settings(st: dict) -> dict:
    out = {k: v for k, v in st.items() if k not in SECRET_KEYS}
    out["ai_key"] = ai_key_info(st)
    out["ai_models"] = AI_MODELS
    return out


@app.put("/api/settings")
async def settings_put(req: Request):
    u = current_user(req)
    need(u, "system.settings")
    b = await body(req, 16384)
    clean: dict[str, Any] = {}
    try:
        if "org_name" in b:
            clean["org_name"] = str(b["org_name"] or "").strip()[:80] or DEFAULT_SETTINGS["org_name"]
        if "banner" in b:
            clean["banner"] = str(b["banner"] or "").strip()[:240]
        if "session_hours" in b:
            clean["session_hours"] = max(1, min(int(b["session_hours"] or 12), 24 * 30))
        if "pw_min" in b:
            clean["pw_min"] = max(8, min(int(b["pw_min"] or 10), 64))
        if "versions_keep" in b:
            clean["versions_keep"] = max(5, min(int(b["versions_keep"] or 60), 500))
    except (TypeError, ValueError):
        raise HTTPException(400, "Valor numérico inválido")
    if "ai_enabled" in b:
        clean["ai_enabled"] = bool(b["ai_enabled"])
    if "default_role" in b:
        if b["default_role"] not in ROLES or b["default_role"] in ("master", "admin"):
            raise HTTPException(400, "Papel padrão inválido")
        clean["default_role"] = b["default_role"]
    if "ai_model" in b:
        if b["ai_model"] not in AI_MODELS:
            raise HTTPException(400, "Modelo de IA inválido")
        clean["ai_model"] = b["ai_model"]
    if "ai_effort" in b:
        if b["ai_effort"] not in AI_EFFORTS:
            raise HTTPException(400, "Nível de esforço inválido")
        clean["ai_effort"] = b["ai_effort"]
    with tx() as c:
        for k, v in clean.items():
            c.execute("INSERT OR REPLACE INTO settings(k, v) VALUES(?,?)", (k, json.dumps(v)))
        audit(c, "sistema.configuracoes", clean, user=u, ip=client_ip(req))
        return public_settings(get_settings(c))


def check_key(key: str, model: str) -> dict:
    """Valida a chave consultando o modelo na API (não gera tokens, não tem custo)."""
    import anthropic
    try:
        m = anthropic.Anthropic(api_key=key, timeout=20.0, max_retries=1).models.retrieve(model)
        return {"ok": True, "model": m.id, "name": getattr(m, "display_name", m.id)}
    except anthropic.AuthenticationError:
        return {"ok": False, "why": "Chave recusada pela Anthropic (inválida ou revogada)."}
    except anthropic.PermissionDeniedError:
        return {"ok": False, "why": "A chave não tem permissão para este modelo."}
    except anthropic.NotFoundError:
        return {"ok": False, "why": f"Modelo {model} indisponível para esta chave."}
    except anthropic.RateLimitError:
        return {"ok": True, "model": model, "name": model, "warn": "Limite de uso atingido agora; a chave é válida."}
    except anthropic.APIConnectionError:
        return {"ok": False, "why": "Sem conexão do servidor com a API da Anthropic."}
    except anthropic.APIStatusError as e:
        return {"ok": False, "why": f"Erro da API ({e.status_code})."}


@app.put("/api/settings/ai-key")
async def ai_key_put(req: Request):
    u = current_user(req)
    if u["role"] != "master":
        raise HTTPException(403, "Somente o admin master define a chave da IA.")
    b = await body(req, 4096)
    key = str(b.get("key") or "").strip()
    if not re.fullmatch(r"sk-ant-[A-Za-z0-9_\-]{20,300}", key):
        raise HTTPException(400, "Formato de chave inválido (esperado sk-ant-...).")
    with ro() as c:
        model = get_settings(c)["ai_model"]
    r = check_key(key, model)
    if not r["ok"] and not b.get("force"):
        raise HTTPException(400, r["why"])
    meta = {"hint": key[-4:], "at": now(), "by": u["email"]}
    with tx() as c:
        c.execute("INSERT OR REPLACE INTO settings(k, v) VALUES(?,?)", ("ai_key_enc", json.dumps(seal(key))))
        c.execute("INSERT OR REPLACE INTO settings(k, v) VALUES(?,?)", ("ai_key_meta", json.dumps(meta)))
        audit(c, "sistema.chave_ia", {"acao": "definida", "final": key[-4:], "validada": r["ok"]}, user=u, ip=client_ip(req))
        return {"settings": public_settings(get_settings(c)), "test": r}


@app.delete("/api/settings/ai-key")
def ai_key_delete(req: Request):
    u = current_user(req)
    if u["role"] != "master":
        raise HTTPException(403, "Somente o admin master remove a chave da IA.")
    with tx() as c:
        c.execute("DELETE FROM settings WHERE k IN ('ai_key_enc','ai_key_meta')")
        audit(c, "sistema.chave_ia", {"acao": "removida"}, user=u, ip=client_ip(req))
        return public_settings(get_settings(c))


@app.post("/api/ai/test")
def ai_test(req: Request):
    u = current_user(req)
    need(u, "system.settings")
    with ro() as c:
        st = get_settings(c)
    key = ai_key(st)
    if not key:
        return {"ok": False, "why": "Nenhuma chave configurada."}
    return check_key(key, st["ai_model"])


# ---------------- IA (Claude)
_ai_clients: dict[str, Any] = {}
AI_SYSTEM = ("Você é o assistente de planilhas e BI do GPlanSiS|Sheets, no padrão Excel em português do Brasil. "
             "Responda em português do Brasil.")


AI_MAX_TOKENS = 32000  # teto por resposta (antes 64k); o custo real entra na cota mensal (ia_cota)


def ai_client(key: str):
    h = hashlib.sha256(key.encode()).hexdigest()
    if h not in _ai_clients:
        import anthropic
        _ai_clients.clear()
        _ai_clients[h] = anthropic.Anthropic(api_key=key, timeout=180.0)
    return _ai_clients[h]


def ai_stream(st: dict, prompt: str, effort: str):
    model = st.get("ai_model") or "claude-opus-5-5"
    extra: dict[str, Any] = {}
    if not model.startswith("claude-haiku"):  # o Haiku não tem fallback no servidor
        extra = {"betas": ["server-side-fallback-2026-07-01"], "fallbacks": "default"}
    return ai_client(ai_key(st)).beta.messages.stream(
        model=model,
        max_tokens=AI_MAX_TOKENS,
        output_config={"effort": effort},
        system=AI_SYSTEM,
        messages=[{"role": "user", "content": prompt}],
        **extra,
    )


async def ai_prompt(req: Request) -> tuple[dict, str, str, dict, ia_cota.Call]:
    u = current_user(req)
    need(u, "ai.use")
    with ro() as c:
        st = get_settings(c)
    if not ai_ready(st):
        raise HTTPException(503, "A IA não está configurada neste servidor. Um administrador precisa informar a chave da "
                                 "Anthropic em Configurações.")
    b = await ia_cota.read_body(req, 400_000)
    prompt = str(b.get("prompt") or "").strip()
    if not prompt:
        raise HTTPException(400, "Prompt vazio")
    call = ia_cota.open_call(u, st, "json" if b.get("kind") == "json" else "texto")  # 402 cota / 429 ritmo
    effort = "low" if b.get("tier") == "quick" else (st.get("ai_effort") or "medium")
    with tx() as c:
        audit(c, "ia.chamada", {"tipo": str(b.get("kind") or "texto")[:20], "chars": len(prompt), "modelo": st.get("ai_model")},
              user=u, ip=client_ip(req))
    return u, prompt, effort, st, call


@app.post("/api/ai/sample")
async def ai_sample(req: Request):
    _u, prompt, effort, st, call = await ai_prompt(req)

    def gen():
        stream = None
        try:
            with ai_stream(st, prompt, effort) as stream:
                for text in stream.text_stream:
                    yield text
                final = stream.get_final_message()
                call.use(final)
                if final.stop_reason == "refusal":
                    yield "\n[A IA recusou esta solicitação.]"
        except Exception as e:  # o cliente mostra só um código curto, nunca o texto do erro
            if stream is not None:
                call.use_stream(stream)
            call.fail(e)
            log.error("falha na IA (%s)", call.err)
            yield "\n\u0000ERRO:" + call.err.split(":")[0]
        finally:
            call.close()

    return StreamingResponse(gen(), media_type="text/plain; charset=utf-8", headers={"X-Accel-Buffering": "no"})


def extract_json(text: str) -> Any:
    t = text.strip()
    m = re.search(r"```(?:json)?\s*(.*?)```", t, re.S)
    if m:
        t = m.group(1).strip()
    for opener, closer in (("{", "}"), ("[", "]")):
        i, j = t.find(opener), t.rfind(closer)
        if i != -1 and j > i:
            try:
                return json.loads(t[i:j + 1])
            except Exception:
                continue
    raise ValueError("resposta sem JSON")


@app.post("/api/ai/json")
async def ai_json(req: Request):
    _u, prompt, effort, st, call = await ai_prompt(req)
    stream = None
    try:
        with ai_stream(st, prompt + "\n\nResponda somente com o JSON pedido, sem texto antes ou depois.", effort) as stream:
            final = stream.get_final_message()
        call.use(final)
    except Exception as e:
        if stream is not None:
            call.use_stream(stream)
        err = call.fail(e)
        log.error("falha na IA (%s)", call.err)
        raise err
    finally:
        call.close()
    if final.stop_reason == "refusal":
        raise HTTPException(422, "A IA recusou esta solicitação.")
    text = "".join(bl.text for bl in final.content if bl.type == "text")
    try:
        return {"json": extract_json(text)}
    except ValueError:
        raise HTTPException(502, "A IA não devolveu um JSON válido. Tente reformular.")


# ---------------- integração com o GPlanSiS|Docs
# Mesmo desenho do Writer e do Drawings: um segredo compartilhado (SHEETS_DOCS_SEGREDO aqui,
# INTEGRACAO_SHEETS_SEGREDO no Docs) do qual saem três subchaves:
#   api     → este servidor chama o Docs "em nome de" um usuário (cabeçalhos x-integracao / x-em-nome-de),
#             então as regras de papel por projeto e a auditoria do Docs valem para ele;
#   sso     → links de entrada única nos dois sentidos (assinados, 2 min, uso único);
#   webhook → o Docs assina os eventos de revisão e comentário que manda para cá.
DOCS_SEG = os.environ.get("SHEETS_DOCS_SEGREDO", "").strip()
DOCS_URL = os.environ.get("SHEETS_DOCS_URL", "https://docs.gplansis.com").rstrip("/")
DOCS_API = os.environ.get("SHEETS_DOCS_API", DOCS_URL + "/api").rstrip("/")
SHEETS_URL = os.environ.get("SHEETS_URL", "https://sheets.gplansis.com").rstrip("/")
MARCA_DOCS = ".sheets."          # o Docs troca só os arquivos com esta marca ao reenviar a revisão
TIPOS_PLANILHA = ("MC", "LM", "LI", "FD", "RT", "DB", "ET", "MD", "CT")


def docs_chave(fin: str) -> bytes:
    if not DOCS_SEG:
        raise HTTPException(503, "Integração com o GPlanSiS|Docs não configurada no servidor")
    return hmac.new(DOCS_SEG.encode(), fin.encode(), hashlib.sha256).digest()


async def docs_req(metodo: str, caminho: str, email: str, bruto: bool = False, **kw):
    """Chamada ao Docs como o usuário `email`."""
    hdr = {"x-integracao": docs_chave("api").hex(), "x-em-nome-de": email}
    try:
        async with httpx.AsyncClient(base_url=DOCS_API, timeout=kw.pop("timeout", 90)) as cli:
            r = await cli.request(metodo, caminho, headers=hdr, **kw)
    except httpx.HTTPError as e:
        raise HTTPException(502, f"GPlanSiS|Docs indisponível ({type(e).__name__})")
    if r.status_code >= 400:
        try:
            d = r.json().get("detail")
            msg = d if isinstance(d, str) else "; ".join(x.get("msg", "") for x in d) if isinstance(d, list) else r.text[:200]
        except ValueError:
            msg = r.text[:200]
        raise HTTPException(r.status_code if r.status_code in (401, 403, 404, 409, 413, 422) else 502, f"Docs: {msg}")
    if bruto:
        return r.content
    return r.json() if r.content else None


def _b64u(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode()


def _unb64u(s: str) -> bytes:
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def vinculo_publico(v: sqlite3.Row | dict | None) -> dict | None:
    if not v:
        return None
    e = json.loads(v["estado"] or "{}")
    coms = e.get("comments") or []
    return {"docId": v["doc_id"], "codigo": v["codigo"], "titulo": v["titulo"],
            "projeto": {"id": v["projeto_id"], "codigo": v["projeto_codigo"], "nome": e.get("project_name")},
            "revisao": {"id": v["revisao_id"], "label": v["revisao_label"], "status": v["revisao_status"], "finalidade": v["finalidade"],
                        "retornoCliente": (e.get("revision") or {}).get("client_return_code")},
            "revisoes": e.get("revisions") or [], "comentarios": coms,
            "comentariosAbertos": sum(1 for c in coms if c.get("status") == "ABERTO"),
            "versaoEnviada": v["versao_enviada"], "enviadoEm": v["enviado_em"], "enviadoPor": v["enviado_por"],
            "atualizadoEm": v["atualizado_em"], "url": f"{DOCS_URL}/documentos/{v['doc_id']}"}


def grava_estado(c: sqlite3.Connection, book: str, estado: dict, evento: int = 0):
    rev = estado.get("revision") or {}
    c.execute("""UPDATE docs_vinculo SET estado=?, codigo=?, titulo=?, projeto_codigo=?, revisao_id=?, revisao_label=?,
                 revisao_status=?, finalidade=?, ultimo_evento=MAX(ultimo_evento, ?), atualizado_em=? WHERE book=?""",
              (json.dumps(estado, ensure_ascii=False), estado.get("code"), estado.get("title"), estado.get("project_code"),
               rev.get("id"), rev.get("label"), rev.get("status"), rev.get("purpose"), evento, now(), book))
    return c.execute("SELECT * FROM docs_vinculo WHERE book=?", (book,)).fetchone()


@app.get("/api/gpdocs/status")
async def docs_status(req: Request):
    u = current_user(req)
    if not ({"system.settings", "docs.send"} & set(u["_perms"])):
        raise HTTPException(403, "Sem permissão")
    alcance = None
    if DOCS_SEG:
        t0 = now()
        try:
            async with httpx.AsyncClient(timeout=8) as cli:
                r = await cli.get(DOCS_API + "/health")
            alcance = {"ok": r.status_code < 400, "ms": int((now() - t0) * 1000), "detalhe": f"HTTP {r.status_code}"}
        except httpx.HTTPError as e:
            alcance = {"ok": False, "ms": int((now() - t0) * 1000), "detalhe": type(e).__name__}
    with ro() as c:
        n = c.execute("SELECT COUNT(*) n, COALESCE(SUM(revisao_status='EM_VERIFICACAO'),0) v FROM docs_vinculo").fetchone()
        ab = sum(sum(1 for x in (json.loads(r["estado"] or "{}").get("comments") or []) if x.get("status") == "ABERTO")
                 for r in c.execute("SELECT estado FROM docs_vinculo"))
    return {"ativa": bool(DOCS_SEG), "url": DOCS_URL, "api": DOCS_API, "alcance": alcance, "vinculadas": n["n"],
            "emVerificacao": n["v"], "comentariosAbertos": ab, "webhook": SHEETS_URL + "/api/integracao/docs/evento"}


@app.get("/api/gpdocs/opcoes")
async def docs_opcoes(req: Request):
    """Projetos do Docs em que o usuário pode criar documentos, mais o catálogo (disciplinas, tipos, fluxos)."""
    u = current_user(req)
    need(u, "docs.send")
    projetos = await docs_req("GET", "/projects", u["email"])
    cat = await docs_req("GET", "/catalog", u["email"])
    return {"projetos": [p for p in projetos if p.get("my_role") in ("ADMIN", "CONTROLADOR", "AUTOR")],
            "disciplinas": cat["disciplines"], "tipos": [t for t in cat["doc_types"] if t["code"] in TIPOS_PLANILHA],
            "fluxos": cat["workflow_templates"], "disciplinasProjeto": cat["project_disciplines"]}


@app.get("/api/gpdocs/projetos/{pid}/membros")
async def docs_membros(pid: str, req: Request):
    u = current_user(req)
    need(u, "docs.send")
    if not re.fullmatch(r"[0-9a-fA-F-]{8,64}", pid):
        raise HTTPException(400, "Projeto inválido")
    return await docs_req("GET", f"/projects/{pid}/members", u["email"])


@app.get("/api/gpdocs/vinculo/{book_id}")
async def docs_vinculo(book_id: str, req: Request, atualizar: int = 0):
    u = current_user(req)
    with ro() as c:
        load_book(c, u, book_id)
        v = c.execute("SELECT * FROM docs_vinculo WHERE book=?", (book_id,)).fetchone()
    if v and atualizar and DOCS_SEG:
        estado = await docs_req("GET", f"/integracao/documentos/{v['doc_id']}/estado", u["email"])
        with tx() as c:
            v = grava_estado(c, book_id, estado)
    return {"vinculo": vinculo_publico(v), "ativa": bool(DOCS_SEG)}


def _meta_docs(book_id: str, d: sqlite3.Row, u: dict, extra: dict | None = None) -> dict:
    return {"origem": "sheets", "sheets_book_id": book_id, "sheets_versao": str(d["ver"]), "sheets_url": f"{SHEETS_URL}/#s{book_id}",
            "planilhas": str(d["sheets"]), "com_bi": "sim" if d["has_bi"] else "não", "enviado_por": u["name"],
            "enviado_em": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), **(extra or {})}


def book_para_envio(c: sqlite3.Connection, book_id: str, u: dict) -> sqlite3.Row:
    need(u, "docs.send")
    d, _lv = load_book(c, u, book_id, "edit")
    need(u, "books.edit")
    return d


@app.post("/api/gpdocs/preparar/{book_id}")
async def docs_preparar(book_id: str, req: Request):
    """Passo 1: cria o documento no Docs (1º envio) ou garante uma revisão aberta (EM_ELABORACAO).
    Devolve código e revisão para o navegador imprimi-los no cabeçalho do PDF antes de enviar os arquivos."""
    u = current_user(req)
    b = await body(req, 8192)
    with ro() as c:
        d = book_para_envio(c, book_id, u)
        v = c.execute("SELECT * FROM docs_vinculo WHERE book=?", (book_id,)).fetchone()
    email = u["email"]
    if not v:
        titulo = str(b.get("titulo") or d["name"]).strip()[:200]
        tipo = str(b.get("tipo") or "MC")
        if not b.get("projetoId") or not b.get("disciplina"):
            raise HTTPException(422, "Escolha o projeto e a disciplina no Docs")
        if tipo not in TIPOS_PLANILHA:
            raise HTTPException(422, "Tipo de documento inválido")
        if len(titulo) < 3:
            raise HTTPException(422, "O título precisa de ao menos 3 caracteres")
        novo = await docs_req("POST", "/documents", email, json={
            "project_id": str(b["projetoId"]), "title": titulo, "discipline_code": str(b["disciplina"]), "doc_type_code": tipo,
            "tags": ["sheets"], "metadata": _meta_docs(book_id, d, u)})
        with tx() as c:   # grava o vínculo já: se algo falhar depois, o reenvio usa o mesmo documento
            c.execute("""INSERT INTO docs_vinculo(book, doc_id, projeto_id, codigo, titulo, revisao_id, revisao_label, revisao_status,
                         enviado_em, enviado_por, atualizado_em) VALUES(?,?,?,?,?,?,?, 'EM_ELABORACAO', ?,?,?)""",
                      (book_id, novo["id"], str(b["projetoId"]), novo["code"], titulo, novo["revision"]["id"], novo["revision"]["label"],
                       now(), email, now()))
            audit(c, "docs.documento_criado", {"pasta": book_id, "codigo": novo["code"]}, user=u, ip=client_ip(req))
        return {"docId": novo["id"], "codigo": novo["code"], "revisaoId": novo["revision"]["id"],
                "revisaoLabel": novo["revision"]["label"], "acao": "criado"}
    estado = await docs_req("GET", f"/integracao/documentos/{v['doc_id']}/estado", email)
    rev = estado.get("revision") or {}
    if rev.get("status") == "EM_ELABORACAO":
        acao = "mesma_revisao"
    else:
        desc = str(b.get("descricao") or "").strip()[:500] or None
        rev = await docs_req("POST", f"/documents/{v['doc_id']}/revisions", email, json={"description": desc})
        acao = "nova_revisao"
    return {"docId": v["doc_id"], "codigo": estado.get("code") or v["codigo"], "revisaoId": rev["id"], "revisaoLabel": rev["label"], "acao": acao}


@app.post("/api/gpdocs/enviar/{book_id}")
async def docs_enviar(book_id: str, req: Request):
    """Passo 2: substitui na revisão aberta os arquivos que o Sheets mandou antes (PDF, Excel, nativo)
    e, se pedido, inicia o fluxo de verificação do Docs."""
    u = current_user(req)
    b = await body(req, 130 * 1024 * 1024)
    try:
        xlsx = base64.b64decode(str(b.get("xlsx") or ""), validate=True)
    except binascii.Error:
        raise HTTPException(422, "Arquivo Excel inválido")
    if not xlsx.startswith(b"PK"):
        raise HTTPException(422, "Arquivo Excel inválido")
    html = str(b.get("html") or "")
    if not html or len(html) > 60 * 1024 * 1024:
        raise HTTPException(422, "HTML de impressão ausente ou grande demais")
    revisao_id = str(b.get("revisaoId") or "")
    fluxo = b.get("fluxo") if isinstance(b.get("fluxo"), dict) else None
    with ro() as c:
        d = book_para_envio(c, book_id, u)
        v = c.execute("SELECT * FROM docs_vinculo WHERE book=?", (book_id,)).fetchone()
    if not v:
        raise HTTPException(409, "Prepare o envio primeiro")
    email, doc_id = u["email"], v["doc_id"]
    estado = await docs_req("GET", f"/integracao/documentos/{doc_id}/estado", email)
    rev = estado.get("revision") or {}
    if rev.get("id") != revisao_id or rev.get("status") != "EM_ELABORACAO":
        raise HTTPException(409, "A revisão mudou no Docs enquanto você enviava — tente de novo")
    pdf = await docs_req("POST", "/integracao/pdf", email, bruto=True, timeout=200,
                         files={"arquivo": ("planilhas.html", html.encode(), "text/html")})
    await docs_req("DELETE", f"/integracao/revisoes/{revisao_id}/arquivos-sheets", email)
    await docs_req("PATCH", f"/documents/{doc_id}", email, json={"metadata": {**(estado.get("metadata") or {}), **_meta_docs(book_id, d, u)}})
    base = re.sub(r"[^\w\-]+", "_", f"{estado.get('code') or v['codigo']}_rev{rev['label']}")
    for nome, conteudo, papel, mime in ((f"{base}{MARCA_DOCS}pdf", pdf, "PDF", "application/pdf"),
                                        (f"{base}{MARCA_DOCS}xlsx", xlsx, "NATIVO",
                                         "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
                                        (f"{base}{MARCA_DOCS}json", d["data"].encode(), "ANEXO", "application/json")):
        await docs_req("POST", f"/revisions/{revisao_id}/files", email, files={"file": (nome, conteudo, mime)}, data={"role": papel}, timeout=180)
    if fluxo:
        await docs_req("POST", f"/revisions/{revisao_id}/workflow", email, json=fluxo)
    estado = await docs_req("GET", f"/integracao/documentos/{doc_id}/estado", email)
    with tx() as c:
        c.execute("UPDATE docs_vinculo SET versao_enviada=?, enviado_em=?, enviado_por=? WHERE book=?", (d["ver"], now(), email, book_id))
        v = grava_estado(c, book_id, estado)
        audit(c, "docs.enviado", {"pasta": book_id, "codigo": v["codigo"], "revisao": rev["label"], "verificacao": bool(fluxo)},
              user=u, ip=client_ip(req))
    return {"vinculo": vinculo_publico(v)}


@app.post("/api/gpdocs/sso")
async def docs_sso(req: Request):
    """Sheets → Docs: link de entrada já autenticado no Docs."""
    u = current_user(req)
    b = await body(req, 4096)
    corpo = _b64u(json.dumps({"email": u["email"], "exp": int(time.time()) + 120, "n": secrets.token_urlsafe(12),
                              "para": str(b.get("para") or "")[:300], "de": "sheets"}, separators=(",", ":")).encode())
    tok = corpo + "." + _b64u(hmac.new(docs_chave("sso"), corpo.encode(), hashlib.sha256).digest())
    return {"url": f"{DOCS_URL}/sso?token={tok}"}


@app.post("/api/auth/sso")
async def auth_sso(req: Request):
    """Docs → Sheets: troca o código assinado pelo Docs por uma sessão daqui (mesmo e-mail)."""
    b = await body(req, 4096)
    try:
        corpo, sig = str(b.get("token") or "").split(".", 1)
        ok = hmac.compare_digest(_unb64u(sig), hmac.new(docs_chave("sso"), corpo.encode(), hashlib.sha256).digest())
        dados = json.loads(_unb64u(corpo)) if ok else None
    except (ValueError, TypeError, binascii.Error):
        dados = None
    if not dados or dados.get("de") != "docs":
        raise HTTPException(401, "Link de entrada inválido")
    if dados.get("exp", 0) < time.time():
        raise HTTPException(401, "Link de entrada expirado — clique de novo no botão do Docs")
    with tx() as c:   # consome o código (uso único) numa transação própria, antes de qualquer recusa
        c.execute("DELETE FROM sso_nonce WHERE expira < ?", (now(),))
        usado = c.execute("SELECT 1 FROM sso_nonce WHERE nonce=?", (str(dados["n"]),)).fetchone()
        if not usado:
            c.execute("INSERT INTO sso_nonce(nonce, expira) VALUES(?,?)", (str(dados["n"]), now() + 300))
        u = c.execute("SELECT * FROM users WHERE email=?", (str(dados["email"]).lower(),)).fetchone()
        if not usado and (not u or not u["active"]):
            audit(c, "auth.falha", {"email": str(dados["email"]), "motivo": "sso sem conta ativa"}, ip=client_ip(req))
    if usado:
        raise HTTPException(401, "Este link de entrada já foi usado")
    if not u or not u["active"]:
        raise HTTPException(403, f"{dados['email']} não tem conta ativa no GPlanSiS|Sheets — peça acesso ao administrador")
    u = dict(u)
    para = str(dados.get("para") or "")
    with tx() as c:
        return open_session(c, u, req, "auth.login_sso", {"origem": "GPlanSiS|Docs"},
                            {"para": para if re.fullmatch(r"#s[A-Za-z0-9]{4,40}", para) else ""})


@app.post("/api/integracao/docs/evento")
async def docs_evento(req: Request):
    """Recebe do Docs (assinado com HMAC) o estado de um documento após mudança de revisão ou comentário."""
    corpo = await req.body()
    sig = req.headers.get("x-assinatura", "").removeprefix("sha256=")
    if not DOCS_SEG or not hmac.compare_digest(sig, hmac.new(docs_chave("webhook"), corpo, hashlib.sha256).hexdigest()):
        raise HTTPException(401, "Assinatura inválida")
    ev = json.loads(corpo)
    with tx() as c:
        v = c.execute("SELECT book, ultimo_evento FROM docs_vinculo WHERE doc_id=?", (str(ev.get("document_id")),)).fetchone()
        if v and int(ev["id"]) > v["ultimo_evento"]:   # fora de ordem ou repetido: ignora (o estado é completo)
            grava_estado(c, v["book"], ev["estado"], int(ev["id"]))
    return {"ok": True}


# ---------------- estáticos
ROOT_FILES = {"index.html", "favicon.svg", "robots.txt", "GPlanSiS-Sheets-offline.html",
              "manifest.webmanifest", "sw.js", "icon-192.png", "icon-512.png", "icon-maskable-512.png", "apple-touch-icon.png"}
# PWA: o service worker e o manifesto são revalidados sempre (a troca de versão chega na hora)
PWA_TYPES = {"manifest.webmanifest": "application/manifest+json", "sw.js": "text/javascript; charset=utf-8"}


def static_resp(p: Path, cache: str, extra: dict | None = None, media_type: str | None = None) -> FileResponse:
    r = FileResponse(p, media_type=media_type)
    r.headers["Cache-Control"] = cache
    for k, v in (extra or {}).items():
        r.headers[k] = v
    return r


@app.api_route("/vendor/{name}", methods=["GET", "HEAD"])
def vendor(name: str):
    if not re.fullmatch(r"[\w.-]+", name):
        raise HTTPException(404)
    p = STATIC_DIR / "vendor" / name
    if not p.is_file():
        raise HTTPException(404)
    return static_resp(p, "public, max-age=31536000, immutable")


@app.api_route("/{name:path}", methods=["GET", "HEAD"])
def static(name: str):
    if name.startswith("api/"):
        raise HTTPException(404, "Rota inexistente")
    if name in ROOT_FILES and (STATIC_DIR / name).is_file():
        if name == "GPlanSiS-Sheets-offline.html":
            return static_resp(STATIC_DIR / name, "no-cache",
                               {"Content-Disposition": 'attachment; filename="GPlanSiS-Sheets-offline.html"'})
        if name in PWA_TYPES:
            return static_resp(STATIC_DIR / name, "no-cache", media_type=PWA_TYPES[name])
        return static_resp(STATIC_DIR / name, "no-cache" if name == "index.html" else "public, max-age=86400")
    return static_resp(STATIC_DIR / "index.html", "no-cache")


# cota mensal, ritmo e contabilidade de uso da IA (server/ia_cota.py)
ia_cota.instalar(app, sys.modules[__name__])
