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
- `MEDICO_ABSENCE_CONFIRM_MINUTES` (opcional, padrão `10`)
- `WORK_TZ` (opcional, padrão `America/Sao_Paulo`)
- `WORK_START` (opcional, padrão `06:30`)
- `WORK_END` (opcional, padrão `20:00`)
- `WATCHDOG_ENABLED` (opcional, padrão `1`)
- `WATCHDOG_SERVICES` (opcional, padrão `monitor_medico`)
- `WATCHDOG_STALE_SEC` (opcional, padrão `600`)
- `WATCHDOG_INTERVAL_SEC` (opcional, padrão `60`)
- `FATURAMENTO_LOOKBACK_DAYS` (opcional, padrão `7`)
- `MYSQL_READ_TIMEOUT_SEC` (opcional, padrão `20`)
- `MYSQL_WRITE_TIMEOUT_SEC` (opcional, padrão `20`)
- `MEDICO_PARSE_TIMEOUT_SEC` (opcional, padrão `25`)

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
- `procedures_catalog`

## Agendamentos automáticos (orquestrador)

- `auth`: 05:00 e 12:00.
- `procedures_catalog`: 05:20 e 12:20.
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

Checklist extra para fila médica:

- verificar se o `monitor_medico` está em `ONLINE` no `system_status`;
- confirmar se a coleta HTML da fila médica não está vindo vazia/intermitente no ambiente de execução;
- validar valor de `MEDICO_ABSENCE_CONFIRM_MINUTES` (recomendado `10`);
- validar se houve finalização em massa indevida e, se necessário, executar refresh da fila após ajuste.
- se `monitor_medico` ficar preso em `RUNNING` por muito tempo (sem atualizar `last_run`), o `Watchdog` reinicia automaticamente o serviço de `workers` (ver logs com `[WATCHDOG]`).

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

## Catalogo de procedimentos (Feegow)

```sql
SELECT COUNT(*) AS total_procedimentos, MAX(updated_at) AS ultima_atualizacao
FROM feegow_procedures_catalog;

SELECT professional_id, COUNT(*) AS total_vinculados
FROM professional_procedure_rates
GROUP BY professional_id
ORDER BY total_vinculados DESC
LIMIT 20;
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
2. Enviar arquivo por endpoint `POST /api/admin/profissionais/:id/documentos` (ou pela UI do modal).
3. Validar registro em `professional_documents`.
4. Visualizar o mesmo arquivo em `GET /api/admin/profissionais/documentos/:documentId/download?inline=1`.
5. Baixar em `GET /api/admin/profissionais/documentos/:documentId/download`.
6. Validar auditoria em `professional_audit_log` (`DOCUMENT_UPLOADED` e `DOCUMENT_DOWNLOADED`).
7. Na aba `Procedimentos`, vincular itens e validar persistência em `professional_procedure_rates`.

### Observação de rollout

A interface da página `/profissionais` opera em modo hibrido sem bloqueio:
- checklist manual de transicao;
- upload S3 ativo (incluindo `Visualizar`/`Baixar` por documento).


## 9) Modelos de Contrato (`/modelos-contrato`)

### Variaveis recomendadas

- `CONTRACT_TEMPLATES_S3_PREFIX` (opcional, ex.: `contratos/modelos/`)
- mesmas variaveis S3 do modulo de profissionais (`STORAGE_PROVIDER`, `AWS_*`)

### Fluxo de operacao

1. Abrir `/modelos-contrato`.
2. Upload de arquivo `.docx` com tipo de contrato.
3. Conferir placeholders detectados.
4. Mapear placeholders obrigatorios.
5. Ativar modelo.
6. Validar no cadastro de profissional se o modelo ativo aparece para o tipo selecionado.

### Checklist rapido de validacao

- API `GET /api/admin/contract-templates?mode=all` responde com modelos.
- API `GET /api/admin/contract-templates/:id/download?inline=1` abre o modelo para visualizacao.
- API `GET /api/admin/contract-templates/:id/download` baixa o `.docx`.
- API `DELETE /api/admin/contract-templates/:id` exclui modelo sem vinculo/uso historico.
- API `GET /api/admin/profissionais/options` retorna `activeContractTemplates`.
- `POST /api/admin/profissionais` aceita `contractTemplateId` valido/ativo.
- Vinculo invalido (modelo inativo ou tipo divergente) retorna erro 400.

## 10) Geracao de Contratos no Modal de Profissional

### Fluxo de validacao

1. Abrir `/profissionais` e editar um profissional com `contractTemplateId` preenchido.
2. Acessar aba `Contratos`.
3. Clicar `Gerar contrato`.
4. Validar novo registro em `professional_contracts` com status `GERADO`.
5. Validar no `meta_json` do contrato os dois formatos gerados (`files.pdf` e `files.docx`).
6. Validar botoes `Visualizar PDF`, `Baixar PDF` e `Baixar Word` no historico.
7. Em caso de erro, validar status `ERRO` e botao `Reprocessar`.

### Endpoints envolvidos

- `GET /api/admin/profissionais/:id/contratos`
- `POST /api/admin/profissionais/:id/contratos`
- `POST /api/admin/profissionais/:id/contratos/:contractId/reprocess`
- `GET /api/admin/profissionais/:id/contratos/:contractId/download?format=pdf|docx`
## Modulo Qualidade - Sprint 1 (Documentos)

Rotas entregues:
- Tela: `/qualidade/documentos`
- API:
  - `GET/POST /api/admin/qms/documentos`
  - `GET/PATCH/DELETE /api/admin/qms/documentos/:id`
  - `POST /api/admin/qms/documentos/:id/versoes`
  - `GET/POST /api/admin/qms/documentos/:id/arquivos`
  - `GET /api/admin/qms/documentos/:id/arquivos/:fileId/download`
  - `POST /api/admin/qms/documentos/refresh`

Checklist rapido de validacao:
1. Criar um POP novo sem codigo (codigo deve ser gerado automaticamente).
2. Editar o POP e salvar alteracoes.
3. Criar nova versao via botao `Nova versao`.
4. Fazer upload de arquivo e validar visualizacao/download.
5. Rodar refresh manual e verificar `service_name='qms_documentos'` em `system_status`.

Observacoes:
- os arquivos usam o mesmo provider S3 ja adotado no projeto;
- as paginas de `Treinamentos` e `Auditorias` foram criadas como base visual para os proximos sprints.

## Modulo Qualidade - Sprint 2 (Treinamentos)

Rotas entregues:
- Tela: `/qualidade/treinamentos`
- API:
  - `GET/POST /api/admin/qms/treinamentos/planos`
  - `GET/PATCH/DELETE /api/admin/qms/treinamentos/planos/:id`
  - `GET/POST /api/admin/qms/treinamentos/realizacoes`
  - `GET/PATCH/DELETE /api/admin/qms/treinamentos/realizacoes/:id`
  - `GET/POST /api/admin/qms/treinamentos/realizacoes/:id/arquivos`
  - `GET /api/admin/qms/treinamentos/realizacoes/:id/arquivos/:fileId/download`
  - `GET /api/admin/qms/treinamentos/opcoes`
  - `POST /api/admin/qms/treinamentos/refresh`

Checklist rapido de validacao:
1. Criar cronograma e vincular pelo menos 1 POP.
2. Editar cronograma e salvar.
3. Criar realizacao vinculada ao cronograma.
4. Fazer upload de anexo de realizacao e validar visualizacao/download.
5. Rodar refresh manual e confirmar `qms_treinamentos` em `system_status`.

## Modulo Qualidade - Sprint 3 (Auditorias)

Rotas entregues:
- Tela: `/qualidade/auditorias`
- API:
  - `GET/POST /api/admin/qms/auditorias`
  - `GET/PATCH/DELETE /api/admin/qms/auditorias/:id`
  - `GET/POST /api/admin/qms/auditorias/:id/acoes`
  - `PATCH /api/admin/qms/auditorias/:id/acoes/:actionId`
  - `POST /api/admin/qms/auditorias/refresh`

Checklist rapido de validacao:
1. Criar auditoria e selecionar POP + versao.
2. Editar auditoria (responsavel, conformidade e plano de acao) e salvar.
3. Abrir modal de acoes, adicionar pelo menos 1 acao corretiva.
4. Editar a acao para `concluida` e confirmar atualizacao na tabela.
5. Rodar refresh manual e validar `qms_auditorias` em `system_status`.

Consultas uteis:

```sql
SELECT code, status, reassessed, audit_date, correction_deadline
FROM qms_audits
ORDER BY updated_at DESC
LIMIT 20;

SELECT audit_id, status, deadline, owner
FROM qms_audit_actions
ORDER BY updated_at DESC
LIMIT 50;
```

## Modulo Qualidade - Sprint 4 (Indicadores e Refresh consolidado)

Rotas entregues:
- `GET /api/admin/qms/indicadores?page=qualidade_documentos|qualidade_treinamentos|qualidade_auditorias`
- `POST /api/admin/qms/indicadores/refresh`

Checklist rapido:
1. Abrir qualquer tela de Qualidade e validar a faixa "Indicadores do modulo Qualidade".
2. Conferir os 3 heartbeats (`qms_documentos`, `qms_treinamentos`, `qms_auditorias`).
3. Acionar `Recalcular modulo` e verificar retorno sem erro.
4. Validar atualizacao de `system_status` para os 3 servicos.

Query de validacao de heartbeat:

```sql
SELECT service_name, status, last_run, details
FROM system_status
WHERE service_name IN ('qms_documentos', 'qms_treinamentos', 'qms_auditorias')
ORDER BY service_name;
```
