# GPlanSiS|Sheets 2.2.1

Planilha avançada no padrão Excel com módulo BI integrado, agora como sistema multiusuário: login, papéis e permissões, pastas guardadas no servidor com histórico de versões, compartilhamento, auditoria encadeada, modo Configurações com avatar e assistente de IA pelo servidor.

Produção: **https://sheets.gplansis.com** (servidor de produção, `/opt/sheets`, contêiner `gplansis-sheets` em `127.0.0.1:8958`, TLS pelo Caddy do host).

## O que tem

| Área | Recursos |
|---|---|
| Acesso | Login por e-mail e senha (scrypt), sessão em cookie HttpOnly/SameSite=Strict, proteção CSRF, bloqueio após 8 tentativas, limite por IP, troca de senha obrigatória no primeiro acesso, sessões ativas com encerramento remoto. |
| Admin master | definido em `SHEETS_MASTER_EMAIL`, criado na primeira subida. Único, não pode ser rebaixado, desativado nem excluído. Só ele gerencia administradores. |
| Papéis | Admin master, Administrador, Gestor, Analista de BI, Editor, Leitor. Permissões personalizáveis por usuário (13 permissões granulares). |
| Pastas | Guardadas no servidor com salvamento automático, controle de versão otimista (conflito detectado e resolvido sem perder nada), histórico de versões (automáticas e nomeadas, com restauração), lixeira, duplicação, compartilhamento por pessoa (ver/editar) ou com toda a organização, presença de quem está na mesma pasta e atualização automática quando outra pessoa salva. |
| Somente leitura | Quem não pode editar vê a pasta com selo "Somente leitura"; a interface bloqueia a edição e o servidor recusa a gravação. Editar BI é permissão separada de editar planilhas. |
| Configurações | Perfil e avatar (envio com recorte e zoom), preferências (tema, módulo inicial, zoom), segurança (senha e sessões), minhas permissões; e para administradores: painel do sistema, usuários, papéis e permissões, auditoria (com verificação de integridade e exportação CSV) e configurações do sistema. |
| IA | Assistente de fórmulas, "Perguntar aos dados" e insights do BI via servidor (Claude). O admin master cadastra a chave da Anthropic em Configurações › Inteligência artificial: ela é validada na hora, guardada cifrada (segredo `SHEETS_SECRET` do `.env`, fora do banco) e nunca volta ao navegador. Modelo e nível de esforço configuráveis; botão de teste de conexão. Sem chave, o "Perguntar aos dados" funciona por palavras-chave. |
| BI avançado | Aba **Avançado**: paletas de cores (inclusive acessível para daltonismo), indicadores (salvam e reaplicam filtros e segmentações), limpar filtros, insights do visual e resumo da página (estatística local + narrativa com IA). Em cada gráfico de categorias, seção **Análise avançada**: mostrar como % do total, acumulado, Pareto, diferença e variação %; linhas de média, mediana, mínimo, máximo e meta; tendência linear com R² e previsão de até 24 períodos; marcação de anomalias (±2σ); cor condicional por limite; escala logarítmica e limites do eixo; posição da legenda e barra de zoom. |
| GPlanSiS|Docs | Como no Writer e no Drawings: **Arquivo › Enviar ao GPlanSiS|Docs** cria o documento na lista mestra (projeto, disciplina, tipo MC/LM/LI/FD/RT…) ou abre a próxima revisão, e envia PDF (planilhas como na impressão, código e revisão no cabeçalho, "Página X de Y", resumo do BI), Excel (.xlsx) e o nativo (.json com BI); opcionalmente inicia o fluxo de verificação. Revisões e comentários do Docs voltam por eventos assinados e aparecem no selo do topo. Entrada única nos dois sentidos (links `#s<id>`). Permissão "Enviar pastas ao GPlanSiS|Docs"; no Docs vale o papel do usuário no projeto (mesmo e-mail). Segredo `SHEETS_DOCS_SEGREDO` = `INTEGRACAO_SHEETS_SEGREDO` do Docs. Status em Configurações › Integrações. |
| App (PWA) | Instalável no celular e no computador ("Instalar app" / "Adicionar à tela inicial"): `manifest.webmanifest`, ícones 192/512/maskable e `apple-touch-icon.png` gerados do `favicon.svg`, service worker `sw.js` (gerado por `src/build.py` a partir de `src/sw.js`, com a versão do `server/app.py` + resumo do shell). O SW nunca toca em `/api/*` nem em requisições que não sejam GET; HTML rede-primeiro com reserva offline; demais arquivos cache-primeiro, cache trocado a cada publicação. No celular (≤ 760 px ou paisagem baixa): faixa de ferramentas recolhível (seta ou tocar na aba ativa), barra superior rolável, alvos de toque ≥ 40 px, campos com 16 px, tocar seleciona sem abrir o teclado (toque duplo ou barra de fórmulas para editar). |
| Offline | `GPlanSiS-Sheets-offline.html` continua funcionando aberto como arquivo, sem login, guardando no navegador. |

## Estrutura

| Caminho | Para que serve |
|---|---|
| `server/app.py` | API (FastAPI) e servidor dos arquivos estáticos. Um processo, um SQLite em `/data`. |
| `src/` | Código-fonte do front-end. `p_server.js` (sessão, salvamento, compartilhamento, versões) e `q_cfg.js` (modo Configurações) são novos. `t_pwa.js` (celular e registro do service worker) e `sw.js` (modelo do service worker). `build.py` gera os dois HTML e o `public/sw.js`. |
| `public/` | `index.html`, versão offline, `vendor/` (ECharts 5.5.1 e SheetJS 0.18.5, sem CDN). |
| `Dockerfile`, `docker-compose.yml`, `.env.example` | Contêiner sem root, sistema de arquivos somente leitura, sem capabilities, limite de memória e logs com rotação. |
| `deploy/sheets.caddy` | Bloco do Caddy para `sheets.gplansis.com`. |
| `deploy.sh` | No servidor: backup do banco, build, subida e espera do healthcheck; `rollback <versão>`; `backup`. |
| `publicar.sh` | Nesta máquina: gera, envia para o servidor (`HOST`), roda o deploy e instala o bloco do Caddy na primeira vez (com backup, validação e reversão automática se o Caddyfile ficar inválido). |

## Operação

```bash
HOST=meu-servidor ./publicar.sh                 # publicar a partir da máquina de desenvolvimento
ssh "$HOST" 'cd /opt/sheets && ./deploy.sh backup'      # backup avulso do banco (guarda os 14 mais recentes)
ssh "$HOST" 'cd /opt/sheets && ./deploy.sh rollback 2.0.0'
ssh "$HOST" 'docker logs --tail 50 gplansis-sheets'
```

**Ligar a IA:** entre como master › Configurações › Inteligência artificial › cole a chave (`sk-ant-...`) › Salvar e testar. Guarde o `SHEETS_SECRET` do `.env` junto com os backups: sem ele, a chave cifrada no banco não pode ser lida (basta cadastrá-la de novo).

**Esqueceu a senha do master:** faça um backup (`./deploy.sh backup`), rode `docker exec gplansis-sheets python -c "import sqlite3;c=sqlite3.connect('/data/sheets.db');c.execute('UPDATE users SET role=? WHERE role=?',('admin','master'));c.commit()"` e reinicie (`docker restart gplansis-sheets`). Na subida a conta volta a ser master com a senha de `SHEETS_MASTER_PASSWORD` (ou uma gerada, mostrada em `docker logs gplansis-sheets`) e troca obrigatória.

**Dados:** `dados/sheets.db` (SQLite em WAL) e `dados/backups/`. Cada `deploy.sh` faz backup antes de subir.

## Regenerar a partir do código

```bash
python3 src/build.py
```

## Mudanças na 2.2.1

- PWA: manifesto, ícones, service worker e metas para iOS/Android; CSP com `manifest-src 'self'`; `sw.js` e manifesto servidos com `no-cache` e o content-type certo.
- Layout para celular (390×844, 360×740 e 844×390 revisados): sem rolagem horizontal da página, faixa recolhível, abas e zoom com 44 px, safe-area nas laterais.

## Mudanças na 2.2.0

- Integração com o GPlanSiS|Docs (Sheets e Docs alterados; no Docs: área Sheets, migração 0007 `0008_integracao_sheets.sql`, backup em `/opt/gplansis-docs/backups/*antes-sheets-20261019-200527*`).

## Mudanças na 2.1.0

- Chave da Anthropic, modelo e esforço configuráveis pela interface (master), com validação e armazenamento cifrado.
- BI avançado (aba Avançado e seção Análise avançada em cada gráfico).
- Correções: ícones gigantes no modo Modelo do BI (a regra de CSS das linhas de relacionamento pegava todos os SVG); ícone de data trocado de emoji para SVG; botões duplicados "Colunas" na aba Inserir do BI; rótulos "Data · undefined" nos níveis Mês/ano e Trimestre/ano (que também faziam o "Perguntar aos dados" descartar esses níveis sugeridos pela IA).

## Mudanças em relação à 1.0.0

- Login, papéis, permissões, auditoria e pastas no servidor (antes: site estático com dados só no navegador).
- Correção: o relatório BI não era gravado (`serializeWB` sempre gravava `bi: null`), nem no navegador nem na exportação `.json`. Agora é gravado sempre que há consultas, medidas, colunas calculadas ou visuais.
- Implantação atrás do Caddy do servidor (o pacote anterior presumia Traefik e nginx).
