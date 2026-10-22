# Changelog

Mudanças relevantes do GPlanSiS|Sheets. Detalhes de operação em [LEIA-ME.md](LEIA-ME.md).

## [2.2.2]

### Segurança
- SheetJS Community Edition atualizado de 0.18.5 para 0.20.3 (`public/vendor/xlsx-0.20.3.full.min.js`), obtido do CDN oficial `cdn.sheetjs.com`. Corrige CVE-2023-30533 (prototype pollution ao ler arquivos) e CVE-2024-22363 (ReDoS). SHA-256 do arquivo: `cc015130aa8521e7f088f88898eba949ccdcbfb38df0bd129b44b7273c3a6f41`.

## [2.2.1]

### Adicionado
- PWA: manifesto, ícones (192, 512, maskable, apple-touch), service worker e metas para iOS/Android.
- Layout para celular (390×844, 360×740 e 844×390 revisados): sem rolagem horizontal da página, faixa de ferramentas recolhível, abas e zoom com 44 px, safe-area nas laterais.

### Alterado
- CSP com `manifest-src 'self'`; `sw.js` e manifesto servidos com `no-cache` e o content-type certo.

## [2.2.0]

### Adicionado
- Integração com o GPlanSiS|Docs: *Arquivo › Enviar ao GPlanSiS|Docs* (PDF, Excel e nativo), revisões e comentários do Docs de volta por eventos assinados, entrada única nos dois sentidos, permissão "Enviar pastas ao GPlanSiS|Docs" e status em Configurações › Integrações.

## [2.1.0]

### Adicionado
- Chave da Anthropic, modelo e nível de esforço configuráveis pela interface (admin master), com validação e armazenamento cifrado.
- BI avançado: aba **Avançado** e seção **Análise avançada** em cada gráfico.

### Corrigido
- Ícones gigantes no modo Modelo do BI (a regra de CSS das linhas de relacionamento pegava todos os SVG).
- Ícone de data trocado de emoji para SVG.
- Botões duplicados "Colunas" na aba Inserir do BI.
- Rótulos "Data · undefined" nos níveis Mês/ano e Trimestre/ano (que também faziam o "Perguntar aos dados" descartar esses níveis).

## [2.0.0]

### Adicionado
- Login, papéis, permissões, auditoria encadeada e pastas guardadas no servidor (antes: site estático com dados só no navegador).
- Implantação em contêiner atrás do Caddy.

### Corrigido
- O relatório BI não era gravado (`serializeWB` sempre gravava `bi: null`), nem no navegador nem na exportação `.json`.

## [1.0.0]

- Planilha avançada com módulo BI, totalmente no navegador.
