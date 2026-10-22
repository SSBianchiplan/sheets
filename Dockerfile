# GPlanSiS|Sheets 2.0 — app + API num contêiner (uvicorn, 1 worker: presença em memória e escrita serializada no SQLite)
FROM python:3.12-slim
LABEL org.opencontainers.image.title="GPlanSiS|Sheets" \
      org.opencontainers.image.description="Planilha avançada com BI integrado, login, permissões e auditoria" \
      org.opencontainers.image.version="2.2.2" \
      org.opencontainers.image.vendor="GPlanSiS|Group"
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 SHEETS_DATA=/data SHEETS_STATIC=/srv/public
RUN useradd -u 10001 -M -s /usr/sbin/nologin sheets && mkdir -p /data && chown sheets /data
WORKDIR /srv
COPY server/requirements.txt server/requirements.txt
RUN pip install --no-cache-dir -r server/requirements.txt
COPY server/app.py server/app.py
COPY public/ public/
USER sheets
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --retries=3 --start-period=10s \
  CMD python -c "import urllib.request;urllib.request.urlopen('http://127.0.0.1:8080/api/health')"
CMD ["uvicorn", "app:app", "--app-dir", "server", "--host", "0.0.0.0", "--port", "8080", "--proxy-headers", "--forwarded-allow-ips", "*", "--workers", "1"]
