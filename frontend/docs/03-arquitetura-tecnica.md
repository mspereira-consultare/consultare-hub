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
- Carga transacional:
  - agendamentos Feegow: `workers/worker_feegow.py` (base do dashboard de agendamentos)
  - propostas: `workers/worker_proposals.py`
  - contratos: `workers/worker_contracts.py`
  - faturamento diário: `workers/worker_faturamento_scraping.py`
  - backfill faturamento: `workers/worker_faturamento_scraping_2025.py`
  - renovação de token/cookie: `workers/worker_auth.py`

### Banco e abstração

- Classe principal: `workers/database_manager.py`.
- Adaptador frontend: `frontend/src/lib/db.ts`.
- Ambos suportam MySQL e legados Turso/SQLite com tradução de SQL.

## 3) Fluxos de Dados


### Fluxo operacional online

1. Worker coleta dado externo (Feegow/Clinia/scraper web).
2. Worker grava tabelas de domínio (`feegow_*`, `faturamento_*`, `espera_*`, etc.). Exemplo: `worker_feegow.py` grava `feegow_appointments`.
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

### Horários configurados

- Janela operacional de monitores: **06:30 até 20:00**.
- `auth`: 05:00 e 12:00.
- `contratos`: 12:00.
- Lote pesado (`faturamento`, `financeiro`, `comercial`, `contratos`): 14:00, 17:00, 19:00.
- `financeiro` (Feegow agendamentos): de hora em hora no minuto `:30`, dentro da janela operacional.

## 9) Integrações Externas

### Feegow

- API de agendamentos (`worker_feegow.py`).
- API de propostas (`worker_proposals.py`).
- API de contratos (`worker_contracts.py`).
- Fluxos de monitor via páginas internas (recepção/médico).
- Renovação de credenciais/cookies por Playwright (`worker_auth.py`).

### Clinia

- APIs de grupos, estatísticas e contagem de chats (`worker_clinia.py`).
- Snapshot em tabelas `clinia_*`.

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
- Repositorio e schema: `frontend/src/lib/profissionais/repository.ts`
- Autorizacao server-side: `frontend/src/lib/profissionais/auth.ts`
- Constantes e regras: `frontend/src/lib/profissionais/constants.ts`, `frontend/src/lib/profissionais/status.ts`

### Banco

O modulo cria/garante as tabelas em runtime:
- `professionals`
- `professional_registrations`
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

### Observacao de storage

A estrutura ja esta preparada para storage externo, mas a fase atual usa controle documental hibrido manual.
A ativacao de upload em S3 sera adicionada em etapa posterior sem trocar o contrato de API base do modulo.

### Storage plug-and-play (S3)

Nova camada server-only de storage:
- `frontend/src/lib/storage/provider.ts`
- `frontend/src/lib/storage/index.ts`
- `frontend/src/lib/storage/providers/s3.ts`

Uso atual:
- upload via API (`POST /api/admin/profissionais/:id/documentos`)
- download via API autenticada (`GET /api/admin/profissionais/documentos/:documentId/download`)

Variáveis necessárias para ativar S3:
- `STORAGE_PROVIDER=s3`
- `AWS_REGION`
- `AWS_S3_BUCKET`
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_S3_PREFIX` (opcional)
