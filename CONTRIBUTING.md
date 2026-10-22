# Como contribuir com o GPlanSiS|Sheets

Obrigado por querer ajudar! Este guia explica como preparar o ambiente, o que esperamos de uma contribuição e como enviar.

## Antes de começar

- Leia o [Código de Conduta](CODE_OF_CONDUCT.md).
- Procure nas [issues](https://github.com/SSBianchiplan/sheets/issues) se o assunto já está em discussão.
- Para mudanças grandes (novo módulo, mudança de banco, troca de biblioteca), abra uma issue de **ideia** antes de escrever o código.
- Falhas de segurança **não** vão em issue pública: veja [SECURITY.md](SECURITY.md).

## Ambiente de desenvolvimento

Requisitos: Python 3.12 ou mais novo e um navegador atual. Docker é opcional.

```bash
git clone https://github.com/SSBianchiplan/sheets.git
cd sheets
python3 src/build.py
python3 -m venv .venv && . .venv/bin/activate
pip install -r server/requirements.txt
mkdir -p dados
SHEETS_DATA=./dados SHEETS_SECURE_COOKIE=0 \
SHEETS_MASTER_EMAIL=admin@example.com SHEETS_MASTER_PASSWORD='Troque-esta-senha-1' \
uvicorn app:app --app-dir server --host 127.0.0.1 --port 8080 --reload
```

O front-end fica em `src/` (módulos JavaScript, CSS e HTML). **Não edite `public/index.html` à mão**: ele é gerado. Depois de mudar qualquer arquivo em `src/`, rode `python3 src/build.py` e recarregue o navegador.

A pasta *Arquivo › Carregar demonstração industrial* traz dados fictícios úteis para testar fórmulas e o BI.

## Fluxo de trabalho

1. Faça um fork e crie um branch a partir de `main` (`feat/nome-curto`, `fix/nome-curto`, `docs/nome-curto`).
2. Faça mudanças pequenas e focadas. Um PR, um assunto.
3. Teste no navegador (tema claro e escuro, e numa largura de celular se mexer na interface).
4. Se mexer no servidor, confira o login, as permissões e o salvamento de uma pasta.
5. Escreva mensagens de commit claras, em português, no imperativo (`Corrige PROCX com correspondência aproximada`).
6. Abra o pull request preenchendo o modelo.

## Padrões do código

- **Sem dependências novas sem conversa prévia.** O front-end não usa framework nem CDN de propósito.
- JavaScript em `'use strict'`, sem etapa de transpilação. Mantenha o estilo dos arquivos existentes.
- Textos da interface em português do Brasil.
- Nada de segredos, e-mails pessoais ou dados reais em código, testes ou capturas de tela.
- Cada ação nova que altera dados no servidor deve checar permissão e registrar evento de auditoria, como as existentes em `server/app.py`.
- Bibliotecas de terceiros em `public/vendor/` levam o arquivo de licença junto.

## O que dá para fazer

Veja a seção **Contribua** do [README](README.md#contribua) para áreas e boas primeiras issues.

## Licença das contribuições

A licença do projeto ainda está **a definir pela GPlanSiS**. Ao enviar uma contribuição, você concorda que ela poderá ser distribuída sob a licença que vier a ser adotada para o projeto.

Dúvidas: abra uma issue de pergunta ou escreva para contato@gplansis.com.
