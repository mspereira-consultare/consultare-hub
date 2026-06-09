# Plano ajustado - Envios de fechamento no Repasses

Data: 09/06/2026

## Decisao principal

O disparo de fechamento deve morar no painel como pagina dedicada:

- rota operacional: `/repasses/envios-fechamento`;
- permissoes do modulo `repasses`;
- banco do painel para lote, destinatarios, mensagens, eventos e suppressions;
- upload de planilha `.xlsx` como fonte do lote;
- upload de PDFs ou `.zip` para anexos, armazenados no S3 ja usado pelo painel;
- vinculo com `professionals` sempre que possivel;
- MailerSend como provedor transacional;
- webhook publico para eventos de entrega, bounce, deferred e spam complaint.

Google Sheets e Google Drive deixam de ser fonte operacional desta versao.

## Fonte operacional

Planilha `.xlsx` enviada pelo painel, aceitando o modelo atual:

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

Colunas opcionais recomendadas:

- `PROFESSIONAL_ID`
- `CODIGO_ANEXO`

`ARQUIVO` passa a ser nome/chave esperada do PDF, nao URL do Drive.

## Vinculo com professionals

Durante a importacao:

1. `PROFESSIONAL_ID`, se existir e casar com `professionals.id`;
2. match por `EMAIL` com `professionals.email`;
3. match exato por nome normalizado;
4. match aproximado por nome normalizado somente quando houver um candidato forte.

Sem match ou match ambiguo: a linha entra no lote com warning e precisa de conferencia manual antes do envio.

## Vinculo de anexos

Os PDFs sao salvos em:

```text
repasses/email-fechamento/{batchId}/attachments/...
```

Metadados gravados por destinatario:

- `storage_provider = s3`
- `storage_bucket`
- `storage_key`
- `file_name`
- `attachment_size_bytes`
- `attachment_content_type`

Regra de match PDF -> linha:

1. `CODIGO_ANEXO` igual ao nome-base do arquivo;
2. `ARQUIVO` igual ao nome-base do arquivo;
3. `NOME_PROFISSIONAL` normalizado igual ao nome-base do arquivo.

Sem candidato: `SEM_ANEXO`. Mais de um candidato: `ANEXO_AMBIGUO`. O usuario pode resolver com upload individual na linha.

## Modelo de dados

Tabelas no dominio `repasses`, sem foreign keys fisicas obrigatorias:

- `repasse_email_batches`
- `repasse_email_recipients`
- `repasse_email_jobs`
- `repasse_email_messages`
- `repasse_email_events`
- `repasse_email_suppressions`

Metadados adicionais em `repasse_email_recipients`:

- `professional_match_status`
- `professional_match_score`
- `attachment_match_status`
- `attachment_source`
- `attachment_code`
- `original_sheet_row_json`
- `observations`
- `attachment_size_bytes`
- `attachment_content_type`

Campos `drive_file_id` e `drive_file_url` podem existir por compatibilidade historica, mas nao devem ser usados operacionalmente.

## APIs

Rotas admin:

- `GET /api/admin/repasses/email-batches`
- `POST /api/admin/repasses/email-batches/prepare`
- `POST /api/admin/repasses/email-batches/[batchId]/attachments`
- `GET /api/admin/repasses/email-batches/[batchId]/recipients`
- `POST /api/admin/repasses/email-jobs`
- `GET /api/admin/repasses/email-jobs`
- `GET /api/admin/repasses/email-events`
- `POST /api/admin/repasses/email-recipients/[recipientId]/retry`
- `POST /api/admin/repasses/email-recipients/[recipientId]/manual-confirm`

`POST /email-batches/prepare` recebe `multipart/form-data` com arquivo `.xlsx`.

Webhook publico:

- `POST /api/webhooks/mailersend/repasses`
- validar raw body com HMAC SHA-256 e header `Signature`;
- persistir/processar evento de forma idempotente.

## Worker

`workers/worker_repasse_email.py` deve:

- consumir `repasse_email_jobs`;
- baixar PDF do S3 usando `storage_bucket` e `storage_key`;
- nao usar Google OAuth, Google Sheets nem Google Drive;
- enviar somente destinatarios `READY`;
- manter `ACCEPTED_PROVIDER` separado de `DELIVERED`;
- suportar dry-run por `REPASSE_EMAIL_DRY_RUN=1`;
- registrar heartbeat `repasse_email`.

Jobs antigos `sheet_import`, se existirem, devem falhar com mensagem de obsolescencia.

## UI

Pagina dedicada:

- `/repasses/envios-fechamento`

Controles:

- competencia;
- upload de planilha `.xlsx`;
- data limite da NF;
- upload em massa de PDFs ou `.zip`;
- upload individual de PDF por linha;
- listar lotes;
- listar destinatarios;
- visualizar match de profissional e anexo;
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
STORAGE_PROVIDER=s3
AWS_REGION=
AWS_S3_BUCKET=
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
REPASSE_EMAIL_WEBHOOK_ENABLED=1
MAILERSEND_WEBHOOK_SECRET=
```

Worker:

```text
AWS_REGION=
AWS_S3_BUCKET=
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
MAILERSEND_API_TOKEN=
MAILERSEND_FROM_EMAIL=
MAILERSEND_FROM_NAME=Financeiro Consultare
MAILERSEND_REPLY_TO_EMAIL=
REPASSE_EMAIL_DRY_RUN=1
REPASSE_EMAIL_RATE_LIMIT_PER_MIN=10
REPASSE_EMAIL_MAX_PER_RUN=90
```

## Fases

- F0: Atualizar plano e congelar decisao: upload `.xlsx` + anexos S3, sem Google Sheets/Drive operacional.
- F1: Ajustar schema, repository e `prepare` multipart.
- F2: Ajustar pagina `/repasses/envios-fechamento` para upload de planilha, PDFs, ZIP e upload individual.
- F3: Implementar match de profissionais e anexos com bloqueios de envio.
- F4: Ajustar worker para baixar PDFs do S3 e remover dependencia Google.
- F5: Manter webhook MailerSend idempotente e status `ACCEPTED_PROVIDER` separado de `DELIVERED`.
- F6: Piloto com lote pequeno e rotina mensal pelo painel.

## Test plan

- `npm run build --workspace apps/painel`
- `python -m py_compile workers/worker_repasse_email.py workers/main.py workers/database_manager.py`

Casos manuais:

- upload de planilha modelo atual sem colunas novas;
- upload de planilha com `CODIGO_ANEXO` e PDFs casando por codigo;
- upload de multiplos PDFs soltos;
- upload de `.zip` com PDFs;
- upload individual de PDF em linha sem anexo;
- match de profissional por `PROFESSIONAL_ID`;
- match de profissional por e-mail;
- match de profissional por nome normalizado;
- profissional nao encontrado;
- nome ambiguo;
- PDF nao encontrado;
- PDF ambiguo;
- linha com `STATUS_ENVIO = ENVIADO`;
- enfileirar somente destinatarios prontos;
- envio dry-run;
- webhook duplicado;
- delivered;
- soft bounce;
- hard bounce;
- spam complaint;
- retry permitido;
- retry bloqueado.
