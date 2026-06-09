# Plano ajustado - Envios de fechamento no Repasses

Data: 08/06/2026

## Decisao principal

O disparo de fechamento deve morar no painel, mas como pagina dedicada:

- rota operacional: `/repasses/envios-fechamento`;
- permissoes do modulo `repasses`;
- banco do painel para lote, destinatarios, mensagens, eventos e suppressions;
- MailerSend como provedor transacional;
- webhook publico para eventos de entrega, bounce, deferred e spam complaint.

A fonte dos dados do disparo continua sendo o Google Sheets legado e os arquivos do Google Drive. O worker deve ler a planilha diretamente. Nao deve haver upload/colagem manual de planilha no painel e nao deve haver dependencia dos dados consolidados do modulo de repasses para montar destinatarios, valores ou anexos.

## Fonte operacional

Planilha atual:

- aba/range padrao: `Fechamento!A1:J`;
- colunas esperadas:
  - `NOME_PROFISSIONAL`
  - `EMAIL`
  - `VALOR`
  - `ANO_REFERENCIA`
  - `MES_REFERENCIA`
  - `ARQUIVO`
  - `OBSERVACOES`
  - `DATA_LIMITE_NF`
  - `STATUS_ENVIO`
  - `DATA_ENVIO`

`ARQUIVO` deve apontar para o PDF no Google Drive. O worker extrai o file id do link e baixa o PDF pela API do Drive.

## Legado

O projeto `/Users/matheussp/Projetos Dev/Consultare/emails_fechamento` fica como referencia historica de:

- layout da planilha;
- nomes das colunas;
- extracao do id do Drive;
- template base;
- regra operacional de nao tratar aceite inicial como entrega final.

Nao alterar o legado.

## Modelo de dados

Criar tabelas novas no dominio `repasses`, sem foreign keys fisicas obrigatorias:

- `repasse_email_batches`
- `repasse_email_recipients`
- `repasse_email_jobs`
- `repasse_email_messages`
- `repasse_email_events`
- `repasse_email_suppressions`

Em `repasse_email_recipients`, os campos primarios de anexo devem ser:

- `storage_provider = google_drive`
- `storage_key` com o file id do Drive
- `drive_file_id`
- `drive_file_url`
- `file_name`

`pdf_artifact_id`, `storage_bucket` e S3 podem existir como campos legados/nulos, mas nao alimentam a primeira versao do disparo.

## APIs

Rotas admin:

- `GET /api/admin/repasses/email-batches`
- `POST /api/admin/repasses/email-batches/prepare`
- `GET /api/admin/repasses/email-batches/[batchId]/recipients`
- `POST /api/admin/repasses/email-jobs`
- `GET /api/admin/repasses/email-jobs`
- `GET /api/admin/repasses/email-events`
- `POST /api/admin/repasses/email-recipients/[recipientId]/retry`
- `POST /api/admin/repasses/email-recipients/[recipientId]/manual-confirm`

`POST /email-batches/prepare` nao recebe planilha. Ele cria um lote e enfileira job `sheet_import`.

Webhook publico:

- `POST /api/webhooks/mailersend/repasses`
- validar raw body com HMAC SHA-256 e header `Signature`;
- persistir/processar evento de forma idempotente.

## Worker

`workers/worker_repasse_email.py` deve:

- consumir `repasse_email_jobs`;
- processar `scope = sheet_import` lendo Google Sheets diretamente;
- filtrar a competencia informada pelo lote quando a planilha tiver `ANO_REFERENCIA`/`MES_REFERENCIA`;
- ignorar linhas com `STATUS_ENVIO = ENVIADO`;
- validar e-mail, valor e arquivo do Drive;
- gravar destinatarios como `READY`, `WARNING` ou `SKIPPED`;
- baixar PDF do Google Drive no envio;
- enviar via MailerSend;
- registrar `ACCEPTED_PROVIDER` separado de `DELIVERED`;
- suportar dry-run por `REPASSE_EMAIL_DRY_RUN=1`;
- registrar heartbeat `repasse_email`.

## UI

Criar pagina dedicada:

- `/repasses/envios-fechamento`

Controles:

- competencia;
- data limite da NF;
- importar do Google Sheets;
- listar lotes;
- listar destinatarios;
- enfileirar prontos;
- retry;
- confirmacao manual.

Mensagem operacional obrigatoria:

```text
Aceito pelo provedor nao significa entregue. O status final depende dos eventos de entrega, bounce ou falha recebidos por webhook.
```

## Variaveis de ambiente

Painel:

```text
REPASSE_EMAIL_WEBHOOK_ENABLED=1
MAILERSEND_WEBHOOK_SECRET=
```

Worker:

```text
REPASSE_EMAIL_GOOGLE_SHEET_ID=
REPASSE_EMAIL_GOOGLE_SHEET_RANGE=Fechamento!A1:J
GOOGLE_OAUTH_CLIENT_ID=
GOOGLE_OAUTH_CLIENT_SECRET=
GOOGLE_OAUTH_REFRESH_TOKEN=
MAILERSEND_API_TOKEN=
MAILERSEND_FROM_EMAIL=
MAILERSEND_FROM_NAME=Financeiro Consultare
MAILERSEND_REPLY_TO_EMAIL=
REPASSE_EMAIL_DRY_RUN=1
REPASSE_EMAIL_RATE_LIMIT_PER_MIN=10
REPASSE_EMAIL_MAX_PER_RUN=90
```

## Fases

- F0: Atualizar plano e congelar decisao: pagina dedicada, Sheets/Drive como fonte, sem upload no painel.
- F1: Criar schema, repository e APIs admin.
- F2: Criar pagina `/repasses/envios-fechamento`.
- F3: Criar worker com `sheet_import`, leitura do Google Sheets e download do Drive em dry-run.
- F4: Implementar webhook MailerSend idempotente.
- F5: Ativar envio real com rate limit, suppressions e status `ACCEPTED_PROVIDER`.
- F6: Piloto com lote pequeno e rotina mensal pelo painel.

## Test plan

- `npm run lint --workspace apps/painel`
- `npm run build --workspace apps/painel`
- `python -m py_compile workers/worker_repasse_email.py workers/main.py workers/database_manager.py`

Casos manuais:

- importar mesmo periodo duas vezes;
- linha `STATUS_ENVIO = ENVIADO`;
- profissional sem arquivo Drive;
- e-mail invalido;
- valor zerado;
- suppression;
- envio dry-run;
- webhook duplicado;
- delivered;
- soft bounce;
- hard bounce;
- spam complaint;
- retry permitido;
- retry bloqueado.
