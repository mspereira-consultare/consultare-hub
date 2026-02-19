# Runbook Operacional

Documento prático para operação, deploy e suporte do Hub Consultare.

## 1) Pré-requisitos de Ambiente

## Frontend (Railway)

Variáveis mínimas:

- `DB_PROVIDER=mysql`
- `MYSQL_URL`
- `MYSQL_PUBLIC_URL` (recomendado para fallback)
- `NEXTAUTH_SECRET`
- `NEXTAUTH_URL` (com esquema, ex.: `https://painel-gerencial.consultare.com.br`)
- `GOOGLE_SERVICE_ACCOUNT_EMAIL`
- `GOOGLE_PRIVATE_KEY`
- `CRC_WHATSAPP_SHEET_ID`
- `CHECKLIST_RECEPCAO_SHEET_ID`

Observações:

- `NEXTAUTH_URL` deve conter URL válida completa. Sem isso, o build/auth pode falhar.
- `GOOGLE_PRIVATE_KEY` deve manter cabeçalho e rodapé (`BEGIN/END PRIVATE KEY`) e quebras `\n` quando armazenada como env string.

## Workers (Railway)

Variáveis mínimas:

- `DB_PROVIDER=mysql`
- `MYSQL_URL` (ou `MYSQL_PUBLIC_URL`)
- credenciais Feegow/Clinia em `integrations_config` ou `.env` quando aplicável

## 2) Sequência de Deploy Recomendada

1. Validar migrações/tabelas no MySQL.
2. Subir workers e confirmar heartbeat em `system_status`.
3. Subir frontend.
4. Validar APIs críticas.
5. Validar telas com usuário admin.

## 3) Validações Pós-Deploy

## 3.1 Saúde de workers

Query:

```sql
SELECT service_name, status, last_run, details
FROM system_status
ORDER BY last_run DESC;
```

Esperado:

- serviços principais com `ONLINE`/`COMPLETED`.
- sem `ERROR` recorrente.

## 3.2 APIs de fila e monitor

- `/api/queue/medic`
- `/api/queue/reception`
- `/api/queue/whatsapp`

Esperado:

- retorno `status=success`.
- dados coerentes com operação atual.

## 3.3 APIs administrativas

- `/api/admin/financial/history`
- `/api/admin/propostas`
- `/api/admin/contratos`
- `/api/admin/produtividade`
- `/api/admin/goals/dashboard`
- `/api/admin/checklist/crc`
- `/api/admin/checklist/recepcao?unit=campinas_shopping`

## 3.4 Login e permissões

- login com `ADMIN`: acesso total.
- login com perfil restrito: menu e ações coerentes com matriz.
- testar `view/edit/refresh` em uma página de checklist.

## 4) Rotina de Operação

## Refresh manual (frontend)

Dispara `POST /api/admin/refresh` e depende da permissão `refresh`.

Serviços comuns:

- `faturamento`
- `financeiro`
- `comercial`
- `contratos`
- `clinia`

## Agendamentos automáticos (orquestrador)

- `auth`: 05:00 e 12:00.
- `contratos`: 12:00.
- lote pesado: 14:00, 17:00, 19:00.
- `financeiro` horário comercial: de hora em hora no minuto `:30`.
- monitores online: 06:30 até 20:00.

## 5) Backfill de Faturamento

Script:

`workers/worker_faturamento_scraping_2025.py`

Exemplo:

```bash
python workers/worker_faturamento_scraping_2025.py --start-date 2022-01-01 --end-date 2025-12-31
```

Flags úteis:

- `--ignore-checkpoint` para reprocessar meses concluídos.
- `--sleep-seconds` para ajustar intervalo entre meses.

Checkpoint:

- tabela `faturamento_backfill_checkpoint`.

## 6) Troubleshooting

## Erro: `Invalid URL` no build Next.js

Causa comum:

- `NEXTAUTH_URL` inválida, com prefixo duplicado (`https:// https://...`) ou sem esquema.

Ação:

- corrigir para URL única e completa, ex.: `https://painel-gerencial.consultare.com.br`.

## Erro MySQL: host interno fora do Railway

Causa comum:

- uso de `mysql.railway.internal` em execução local.

Ação:

- usar `MYSQL_PUBLIC_URL` no local.
- manter fallback ativo no `database_manager.py`.

## Erro login travado em “Entrando...”

Checklist:

- `NEXTAUTH_URL` correto.
- `NEXTAUTH_SECRET` definido.
- API auth respondendo sem erro.
- conexão com banco e leitura de `users`.

## APIs retornando zero após worker com dados corretos

Checklist:

- confirmar que frontend e workers apontam para o mesmo banco.
- validar `DB_PROVIDER=mysql` em ambos.
- checar cache e heartbeat.

## Erros de SQL em MySQL (`CREATE INDEX IF NOT EXISTS`)

Causa:

- sintaxe não suportada em algumas versões MySQL.

Ação:

- validar criação de índice via `information_schema` antes de `CREATE INDEX`.

## 7) Consultas de Validação Úteis

## Consistência financeiro analítico vs resumos

```sql
SELECT COUNT(*) qtd, SUM(total_pago) total FROM faturamento_analitico;
SELECT SUM(qtd) qtd, SUM(total_pago) total FROM faturamento_resumo_diario;
SELECT SUM(qtd) qtd, SUM(total_pago) total FROM faturamento_resumo_mensal;
```

## Checkpoint de backfill

```sql
SELECT * 
FROM faturamento_backfill_checkpoint
ORDER BY year, month;
```

## Produção agendamentos no dia

```sql
SELECT COUNT(*) 
FROM feegow_appointments
WHERE scheduled_at BETWEEN CONCAT(CURDATE(),' 00:00:00') AND CONCAT(CURDATE(),' 23:59:59');
```

## 8) Política de Operação Segura

- Não executar limpeza destrutiva sem query de preview.
- Em ajustes de resumo, preferir rebuild por período.
- Sempre validar `system_status` e pelo menos 3 páginas críticas após mudanças:
  - `/monitor`
  - `/financeiro`
  - `/propostas`

---

## 8) Modulo Profissionais - ativação S3

### Variáveis obrigatórias (frontend)

- `STORAGE_PROVIDER=s3`
- `AWS_REGION`
- `AWS_S3_BUCKET`
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_S3_PREFIX` (opcional, ex.: `profissionais/`)

### Smoke test recomendado

1. Criar/editar um profissional em `/profissionais`.
2. Enviar arquivo por endpoint `POST /api/admin/profissionais/:id/documentos` (manual/API client).
3. Validar registro em `professional_documents`.
4. Baixar o mesmo arquivo em `GET /api/admin/profissionais/documentos/:documentId/download`.
5. Validar auditoria em `professional_audit_log` (`DOCUMENT_UPLOADED` e `DOCUMENT_DOWNLOADED`).

### Observação de rollout

A interface da página `/profissionais` mantém aviso de transição até validação final do fluxo S3 em produção.


## 9) Modelos de Contrato (Settings)

### Variaveis recomendadas

- `CONTRACT_TEMPLATES_S3_PREFIX` (opcional, ex.: `contratos/modelos/`)
- mesmas variaveis S3 do modulo de profissionais (`STORAGE_PROVIDER`, `AWS_*`)

### Fluxo de operacao

1. Abrir `/settings` -> aba `Modelos de Contrato`.
2. Upload de arquivo `.docx` com tipo de contrato.
3. Conferir placeholders detectados.
4. Mapear placeholders obrigatorios.
5. Ativar modelo.
6. Validar no cadastro de profissional se o modelo ativo aparece para o tipo selecionado.

### Checklist rapido de validacao

- API `GET /api/admin/contract-templates?mode=all` responde com modelos.
- API `GET /api/admin/profissionais/options` retorna `activeContractTemplates`.
- `POST /api/admin/profissionais` aceita `contractTemplateId` valido/ativo.
- Vinculo invalido (modelo inativo ou tipo divergente) retorna erro 400.
