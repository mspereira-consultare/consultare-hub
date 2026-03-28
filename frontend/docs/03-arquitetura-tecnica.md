# Arquitetura Técnica

## 1) Visão Geral

O sistema é composto por dois blocos principais:

- **Frontend/API** em Next.js (pasta `frontend/`), responsável por UI, autenticação e APIs de leitura/escrita para o painel.
- **Camada de workers** em Python (pasta `workers/`), responsável por ingestão/scraping/sincronização e atualização de heartbeat.

Persistência principal atual: **MySQL (Railway)**, com suporte legado para Turso/SQLite via camada de abstração.

## 2) Componentes


- Rotas de página em `frontend/src/app/(admin)/*` (ex: `/agendamentos`).
- Rotas API em `frontend/src/app/api/*` (ex: `/api/admin/agendamentos`).
- Autenticação com `next-auth` em `frontend/src/app/api/auth/[...nextauth]/route.ts`.
- Controle de acesso por matriz em `frontend/src/lib/permissions.ts`.
- Persistência da matriz por usuário em `frontend/src/lib/permissions_server.ts`.


### Workers (Python)

- Orquestrador: `workers/main.py`.
- Monitores:
  - recepção: `workers/monitor_recepcao.py`
  - médico: `workers/monitor_medico.py`
  - clinia: `workers/worker_clinia.py`
- Workers analíticos:
  - marketing Google/GA4: `workers/worker_marketing_funnel_google.py`
  - Clinia Ads: `workers/worker_clinia_ads.py`
- Carga transacional:
  - agendamentos Feegow: `workers/worker_feegow_appointments.py` (base do dashboard de agendamentos)
  - catalogo de procedimentos Feegow: `workers/worker_feegow_procedures.py`
  - propostas: `workers/worker_proposals.py`
  - contratos: `workers/worker_contracts.py`
  - faturamento (scraping com janela móvel): `workers/worker_faturamento_scraping.py` (padrão: últimos 7 dias)
  - backfill faturamento: `workers/worker_faturamento_scraping_2025.py`
  - renovação de token/cookie: `workers/worker_auth.py`

Notas operacionais do monitor médico:

- Fechamento por ausência usa confirmação temporal (`MEDICO_ABSENCE_CONFIRM_MINUTES`, padrão: `10`).
- Se uma unidade vier com coleta vazia no ciclo, o monitor **não** finaliza pacientes por ausência naquele ciclo.
- Após finalizar por ausência, o cache de upsert da fila médica é invalidado para permitir reabertura correta caso o paciente reapareça.

### Banco e abstração

- Classe principal: `workers/database_manager.py`.
- Adaptador frontend: `frontend/src/lib/db.ts`.
- Ambos suportam MySQL e legados Turso/SQLite com tradução de SQL.

## 3) Fluxos de Dados


### Fluxo operacional online

1. Worker coleta dado externo (Feegow/Clinia/scraper web).
2. Worker grava tabelas de domínio (`feegow_*`, `faturamento_*`, `espera_*`, etc.). Exemplo: `worker_feegow_appointments.py` grava `feegow_appointments`.
3. Worker atualiza `system_status` (heartbeat).
4. Frontend consulta APIs (`/api/admin/*`, `/api/queue/*`). Exemplo: `/api/admin/agendamentos`.
5. APIs agregam e retornam payload para componentes da página.

### Fluxo de refresh manual

1. Usuário clica em “Atualizar”.
2. Frontend chama `POST /api/admin/refresh`.
3. API grava `system_status.status='PENDING'` para o serviço.
4. Listener do orquestrador detecta `PENDING/QUEUED`.
5. Orquestrador executa worker e atualiza heartbeat.
6. Frontend faz polling e exibe status final.

## 4) Caching

Implementação: `frontend/src/lib/api_cache.ts`.

- Cache em memória por chave de URL.
- TTL por endpoint:
  - filas: 15s (tempo real)
  - APIs admin (financeiro, propostas, contratos, metas, etc.): 30min
- Deduplicação de requisições em voo (`in-flight`).
- Invalidação manual por prefixo via `invalidateCache('admin:')` após mutações.

## 5) Autenticação e Sessão

- Provider: `CredentialsProvider` (`next-auth`).
- Base de usuários: tabela `users`.
- Senha: hash bcrypt.
- Sessão: JWT (`maxAge=30 dias`).
- Campos propagados para sessão: `id`, `role`, `department`, `permissions`.

## 6) Autorização

- Modelo: matriz por página e ação (`view`, `edit`, `refresh`).
- Resolução:
  - frontend para renderização/habilitação de UI;
  - backend para proteção de APIs críticas.
- Tabela de permissões: `user_page_permissions`.

## 7) Banco de Dados e Compatibilidade SQL

### Frontend (`db.ts`)

A camada converte SQL legado para MySQL quando necessário:

- `datetime('now')` -> `NOW()`
- `date('now')` -> `CURDATE()`
- `INSERT OR REPLACE` -> `REPLACE INTO`
- `ON CONFLICT ... DO UPDATE` -> `ON DUPLICATE KEY UPDATE`
- `PRAGMA table_info(...)` -> `information_schema.columns`

### Workers (`database_manager.py`)

- Resolve `MYSQL_URL` com fallback automático para `MYSQL_PUBLIC_URL` fora do runtime Railway interno.
- Usa `MySQLConnectionAdapter` para tradução de SQL com placeholders.
- Faz throttle de writes em heartbeat e upserts frequentes para reduzir carga.

## 8) Orquestrador e Agenda

Arquivo: `workers/main.py`.

### Threads principais

- `Listener`: escuta `system_status` para jobs sob demanda.
- `Scheduler`: executa agenda fixa.
- `MonRec`: monitor recepção contínuo em horário operacional.
- `MonMed`: monitor médico contínuo em horário operacional.
- `Clinia`: ciclo contínuo em horário operacional.
- `Watchdog`: monitora heartbeat de serviços críticos e reinicia o processo em caso de travamento.

### Horários configurados

- Janela operacional de monitores: **06:30 até 20:00**.
- Fuso e janela são configuráveis por env vars no `workers/main.py`:
  - `WORK_TZ` (padrão: `America/Sao_Paulo`)
  - `WORK_START` (padrão: `06:30`)
  - `WORK_END` (padrão: `20:00`)
- `auth`: 05:00 e 12:00.
- `procedures_catalog`: 05:20 e 12:20.
- `contratos`: 12:00.
- Lote pesado (`faturamento`, `financeiro`, `comercial`, `contratos`): 14:00, 17:00, 19:00.
- `appointments` (Feegow agendamentos): de hora em hora no minuto `:30`, dentro da janela operacional.
- `marketing_funnel`: `05:40` e `18:10`.
- `clinia_ads`: `05:35`, `12:35` e `18:35`.

## 9) Integrações Externas

### Feegow

- API de agendamentos (`worker_feegow_appointments.py`).
- O domÃ­nio de agendamentos agora persiste `patient_id`, `procedure_id`, `procedure_name` e `first_appointment_flag` em `feegow_appointments`.
- O KPI `Novos pacientes` do `/financeiro` usa `COUNT(DISTINCT patient_id)` com `first_appointment_flag = 1`, filtrando pela `date` da consulta.
- API de procedimentos (`worker_feegow_procedures.py`).
- API de propostas (`worker_proposals.py`).
- O domínio de propostas persiste `patient_id`, `proposal_last_update` e uma cache local de contatos Feegow em `feegow_patient_contacts_cache`.
- O controle operacional da equipe fica em `proposal_followup_control`, separado de `feegow_proposals`, para não ser sobrescrito por refresh do worker.
- A página operacional `/propostas` usa `/api/admin/propostas/options`, `/api/admin/propostas/details`, `/api/admin/propostas/export`, `/api/admin/propostas/followup/options` e `/api/admin/propostas/followup/[proposalId]`.
- A página gerencial `/propostas/gerencial` usa `/api/admin/propostas` para resumo e refresh manual do domínio `comercial`.
- As APIs operacionais reutilizam a base local e fazem fallback on-demand em `patient/search?paciente_id=...` para cache miss.
- API de contratos (`worker_contracts.py`).
- Fluxos de monitor via pÃ¡ginas internas (recepÃ§Ã£o/mÃ©dico).
- RenovaÃ§Ã£o de credenciais/cookies por Playwright (`worker_auth.py`).
### Clinia

- APIs de grupos, estatísticas e contagem de chats (`worker_clinia.py`).
- Snapshot em tabelas `clinia_*`.
- API analítica de anúncios:
  - endpoint `statistics/ads`
  - worker dedicado `worker_clinia_ads.py`
  - fatos diários em `fact_clinia_ads_daily`

### Marketing / Funil

- Google Ads + GA4 alimentam `fact_marketing_funnel_daily`.
- snapshots diagnósticos do Google Ads ficam em `raw_google_ads_campaign_daily`.
- Clinia Ads alimenta `fact_clinia_ads_daily`.
- O frontend cruza:
  - mídia e navegação
  - leads por clique em WhatsApp
  - contatos recebidos no Clinia
  - conversão para agendamento no Clinia
  - agendamentos válidos no Feegow
  - faturamento bruto analítico

Organização atual da UI do módulo `/marketing/funil`:

- filtros e status fixos no topo;
- abas:
  - `Visão geral`
  - `Campanhas`
  - `Saúde Google Ads`

Nova rota interna de diagnóstico:

- `GET /api/admin/marketing/funil/google-ads/health`

Regra vigente de lead:
- clique que leva o usuário para o WhatsApp da clínica.

### Google Sheets

Checklists usam duas estratégias:

1. **Service Account privada** (preferencial):
   - `GOOGLE_SERVICE_ACCOUNT_EMAIL`
   - `GOOGLE_PRIVATE_KEY`
2. **Fallback CSV público** (quando aplicável).

## 10) Observabilidade

- Heartbeat central em `system_status`:
  - `status`: `PENDING`, `RUNNING`, `ONLINE`, `COMPLETED`, `WARNING`, `ERROR`.
  - `last_run`, `details`.
- Logs Python com prefixo por thread e horário (`workers/main.py`).
- UI mostra “Última sincronização” por domínio (financeiro, propostas, contratos, etc.).

## 11) Resiliência e fallbacks

- Financeiro:
  - prioriza `faturamento_resumo_*`;
  - fallback para `faturamento_analitico` quando necessário.
- Checklist:
  - fallback de leitura de planilha (API privada -> CSV).
- DB:
  - fallback de host interno para URL pública no ambiente local.

## 12) Pontos de Atenção Técnicos

- `frontend/middleware.ts` ainda possui regras legadas por `role` e pathname além da matriz.
- Alguns workers ainda carregam compatibilidade Turso/SQLite; manter testes quando ajustar SQL.
- `worker_contracts.py` recria tabela `feegow_contracts` no fluxo atual. Mudanças nesse worker exigem validação de impacto histórico.

---

## 13) Modulo de Profissionais

### Componentes novos

- Pagina: `frontend/src/app/(admin)/profissionais/page.tsx`
- API list/create: `frontend/src/app/api/admin/profissionais/route.ts`
- API detail/update: `frontend/src/app/api/admin/profissionais/[id]/route.ts`
- API contratos: `frontend/src/app/api/admin/profissionais/[id]/contratos/route.ts`
- API procedimentos por profissional: `frontend/src/app/api/admin/profissionais/[id]/procedimentos/route.ts`
- API opcoes de procedimentos: `frontend/src/app/api/admin/profissionais/procedures/options/route.ts`
- API reprocesso: `frontend/src/app/api/admin/profissionais/[id]/contratos/[contractId]/reprocess/route.ts`
- Repositorio e schema: `frontend/src/lib/profissionais/repository.ts`
- Servico de contratos: `frontend/src/lib/profissionais/contracts.ts`
- Autorizacao server-side: `frontend/src/lib/profissionais/auth.ts`
- Constantes e regras: `frontend/src/lib/profissionais/constants.ts`, `frontend/src/lib/profissionais/status.ts`
- Render de placeholders DOCX: `frontend/src/lib/contract_templates/render.ts`

### Banco

O modulo cria/garante as tabelas em runtime:
- `professionals`
- `professional_registrations`
- `feegow_procedures_catalog`
- `professional_procedure_rates`
- `professional_documents`
- `professional_document_checklist`
- `professional_contracts`
- `professional_audit_log`

### Fluxo funcional atual

1. Usuario abre `/profissionais`.
2. Frontend consulta `GET /api/admin/profissionais`.
3. API valida permissao (`view`) e monta pendencias/status.
4. Em criacao/edicao, frontend envia payload para `POST` ou `PUT`.
5. API valida regras de negocio (PF/PJ, contrato, registro principal, checklist) e persiste.
6. API grava auditoria em `professional_audit_log`.
7. Na aba `Procedimentos`, usuario vincula procedimentos e valores por profissional.
8. Na aba `Contratos`, usuario pode gerar/reprocessar e consultar historico.

### Observacao de storage

A estrutura usa controle documental hibrido:
- checklist manual (transicao operacional);
- upload/download real via S3.
O contrato de API permanece estavel para os dois modos.

### Storage plug-and-play (S3)

Nova camada server-only de storage:
- `frontend/src/lib/storage/provider.ts`
- `frontend/src/lib/storage/index.ts`
- `frontend/src/lib/storage/providers/s3.ts`

Uso atual:
- upload via API (`POST /api/admin/profissionais/:id/documentos`)
- download via API autenticada (`GET /api/admin/profissionais/documentos/:documentId/download`)
- visualizacao inline (`GET /api/admin/profissionais/documentos/:documentId/download?inline=1`)

Variáveis necessárias para ativar S3:
- `STORAGE_PROVIDER=s3`
- `AWS_REGION`
- `AWS_S3_BUCKET`
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_S3_PREFIX` (opcional)

## 14) Automacao de Contratos (Modelos)

### Componentes novos

- UI em `frontend/src/app/(admin)/modelos-contrato/page.tsx` usando `frontend/src/app/(admin)/settings/contract-templates-tab.tsx`
- APIs:
  - `GET/POST /api/admin/contract-templates`
  - `DELETE /api/admin/contract-templates/:id`
  - `PUT /api/admin/contract-templates/:id/mapping`
  - `POST /api/admin/contract-templates/:id/activate`
  - `POST /api/admin/contract-templates/:id/archive`
  - `GET /api/admin/contract-templates/:id/download` (inline/attachment)
  - `GET/POST /api/admin/profissionais/:id/contratos`
  - `POST /api/admin/profissionais/:id/contratos/:contractId/reprocess`
  - `GET /api/admin/profissionais/:id/contratos/:contractId/download?format=pdf|docx`
- Dominio:
  - `frontend/src/lib/contract_templates/repository.ts`
  - `frontend/src/lib/contract_templates/placeholders.ts`
  - `frontend/src/lib/contract_templates/auth.ts`

### Fluxo tecnico

1. Upload do `.docx` (contract_templates/edit) com persistencia em storage (S3 provider).
2. Extracao automatica de placeholders no padrao `{{token}}`.
3. Persistencia do modelo em `contract_templates` com status inicial `draft`.
4. Mapeamento de placeholders para fontes de dados do profissional.
5. Ativacao do modelo somente apos mapeamento obrigatorio completo.
6. Cadastro de profissional passa a vincular `contract_template_id` (modelo ativo).
7. Geracao manual do contrato na aba `Contratos` do modal do profissional.
8. Contrato gerado e salvo no S3 em dois formatos (`DOCX` e `PDF`), registrado em `professional_contracts` (metadados em `meta_json`).
9. A tabela `professional_documents` passa a receber apenas uploads manuais (ex.: `CONTRATO_ASSINADO`), sem insercao automatica de contrato gerado.

### Tabelas envolvidas

- `contract_templates`
- `contract_template_audit_log`
- `professionals` (nova coluna `contract_template_id`)

### Integracao com cadastro de profissionais

- Endpoint `GET /api/admin/profissionais/options` agora retorna `activeContractTemplates`.
- O modal de profissional filtra modelos ativos por `contract_type`.
- Backend valida:
  - modelo existe;
  - modelo esta `active`;
  - `contract_type` do modelo bate com `contract_type` do profissional.

## Atualização de 25/03/2026 — Marketing / Funil

A camada de leitura do `/marketing/funil` foi recalibrada para distinguir:

- performance atribuída ao Google (`performanceFunnel`)
- diagnósticos auxiliares (`diagnostics`)
- contexto operacional da clínica (`operationalContext`)

Também foi adicionado um padrão local de ajuda contextual para cards do módulo:

- `frontend/src/app/(admin)/marketing/funil/components/MarketingFunilInfoTooltip.tsx`
- `frontend/src/app/(admin)/marketing/funil/components/MarketingFunilMetricCard.tsx`

Esse padrão evita tooltips nativos do navegador e funciona com hover/focus no desktop e clique no mobile.



## 14) M?dulo de Equipamentos

### Frontend

- P?gina: `frontend/src/app/(admin)/equipamentos/page.tsx`
- Componentes principais:
  - `EquipmentFiltersBar`
  - `EquipmentSummaryCards`
  - `EquipmentTable`
  - `EquipmentFormModal`
  - `EquipmentEventsSection`
  - `EquipmentFilesSection`

### Backend

Dom?nio dedicado em `frontend/src/lib/equipamentos/`:

- `constants.ts`
- `types.ts`
- `status.ts`
- `auth.ts`
- `repository.ts`

### APIs

- `GET/POST /api/admin/equipamentos`
- `GET/PUT /api/admin/equipamentos/[id]`
- `GET /api/admin/equipamentos/options`
- `GET /api/admin/equipamentos/export`
- `GET/POST /api/admin/equipamentos/[id]/eventos`
- `PUT/DELETE /api/admin/equipamentos/[id]/eventos/[eventId]`
- `GET/POST /api/admin/equipamentos/[id]/arquivos`
- `GET /api/admin/equipamentos/arquivos/[fileId]/download`

### Persist?ncia

O m?dulo garante tabelas em runtime:

- `clinic_equipment`
- `clinic_equipment_events`
- `clinic_equipment_files`

### Regras de c?lculo

O status de calibra??o n?o ? digitado livremente. Ele ? derivado em `frontend/src/lib/equipamentos/status.ts` a partir de:

- `calibration_required`
- `next_calibration_date`
- janela de alerta de 30 dias
