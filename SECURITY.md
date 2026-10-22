# Política de segurança

## Versões com suporte

| Versão | Suporte |
|---|---|
| 2.2.x (a que está em https://sheets.gplansis.com) | Sim |
| Anteriores | Não |

## Como relatar uma vulnerabilidade

**Não abra issue pública para falhas de segurança.**

Escreva para **contato@gplansis.com** com o assunto `[SEGURANÇA] GPlanSiS|Sheets` e inclua:

- descrição da falha e do impacto;
- passos para reproduzir (ou prova de conceito);
- versão e ambiente onde foi observada;
- se quiser, como prefere ser creditado.

Se preferir, use também o recurso *Report a vulnerability* (aviso privado) do GitHub neste repositório.

Responderemos confirmando o recebimento assim que possível, combinaremos o prazo de correção e avisaremos quando a correção estiver publicada. Pedimos que a divulgação pública espere a correção.

## Escopo

- O código deste repositório (servidor `server/`, front-end `src/`, scripts de implantação).
- A instância em https://sheets.gplansis.com: teste apenas com a sua própria conta, sem acessar dados de terceiros, sem negação de serviço e sem engenharia social.

## Boas práticas para quem instala

- Use HTTPS e mantenha `SHEETS_SECURE_COOKIE=1`.
- Guarde o `.env` com permissão `600` e o `SHEETS_SECRET` junto com os backups do banco.
- Troque a senha inicial do admin master no primeiro acesso (o sistema exige).
