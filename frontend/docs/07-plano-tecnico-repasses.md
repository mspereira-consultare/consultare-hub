# Plano Técnico - Módulo de Repasses

## 1. Objetivo
Implementar um novo módulo no painel para apoiar o fechamento de repasses mensais dos profissionais, com:

- Coleta dos dados no Feegow via worker scraper.
- Persistência estruturada no MySQL com idempotência.
- Acompanhamento operacional por status de processamento.
- Geração de relatórios PDF sob demanda (individual e em lote).

## 2. Escopo funcional aprovado
- Unidades: sempre todas as unidades do relatório (2, 3 e 12).
- Profissionais: todos os ativos (`professionals.is_active = 1`), sem restrições adicionais.
- Profissional sem produção no período: não salvar linhas de repasse; registrar status no log/banco para o frontend sinalizar.
- Persistência: `UPSERT` por hash de linha.
- Execução: somente manual (sem agendamento automático neste momento).
- Permissões: `view`, `edit`, `refresh`.

## 3. Arquitetura proposta
### 3.1 Componentes
- **Worker Scraper de Repasses**: coleta e salva dados consolidados no banco.
- **Worker de PDF de Repasses**: gera PDFs sob demanda a partir do banco.
- **API Admin (Next.js)**: cria/lista jobs manuais e expõe status.
- **Frontend `/repasses`**: dispara jobs, exibe progresso, totais e ações de relatório.

### 3.2 Estratégia de execução
- O frontend cria jobs manuais no banco.
- Workers consomem jobs pendentes de forma assíncrona.
- Heartbeat registra saúde dos serviços.

## 4. Modelo de dados (proposto)
### 4.1 `feegow_repasse_consolidado`
- `id` (PK)
- `period_ref` (`YYYY-MM`)
- `professional_id` (id interno do painel)
- `professional_name`
- `data_exec`
- `paciente`
- `descricao`
- `funcao`
- `convenio`
- `repasse_value` (`DECIMAL`)
- `source_row_hash` (UNIQUE)
- `is_active` (`TINYINT(1)`)
- `last_job_id`
- `created_at`
- `updated_at`

### 4.2 `repasse_sync_jobs`
- `id` (PK)
- `period_ref`
- `status` (`PENDING`, `RUNNING`, `COMPLETED`, `FAILED`, `PARTIAL`)
- `requested_by`
- `started_at`
- `finished_at`
- `error`
- `created_at`
- `updated_at`

### 4.3 `repasse_sync_job_items`
- `id` (PK)
- `job_id`
- `professional_id`
- `professional_name`
- `status` (`SUCCESS`, `NO_DATA`, `ERROR`)
- `rows_count`
- `total_value`
- `error_message`
- `duration_ms`
- `created_at`
- `updated_at`

### 4.4 `repasse_pdf_jobs`
- `id` (PK)
- `period_ref`
- `scope` (`single`, `multi`, `all_with_data`)
- `status` (`PENDING`, `RUNNING`, `COMPLETED`, `FAILED`, `PARTIAL`)
- `requested_by`
- `started_at`
- `finished_at`
- `error`
- `created_at`
- `updated_at`

### 4.5 `repasse_pdf_artifacts`
- `id` (PK)
- `pdf_job_id`
- `period_ref`
- `professional_id`
- `professional_name`
- `storage_provider`
- `storage_bucket`
- `storage_key`
- `file_name`
- `size_bytes`
- `created_at`
- `updated_at`

## 5. Regra de idempotência e reprocessamento
Para cada profissional + período:

1. Marcar linhas antigas como inativas (`is_active = 0`).
2. Executar `UPSERT` por `source_row_hash` para as linhas novas.
3. Definir `is_active = 1` nas linhas recebidas no processamento atual.

Com isso:
- Evita duplicação.
- Permite reprocessar o mesmo período.
- Mantém rastreabilidade do que está vigente.

## 6. Fluxo técnico do scraper
1. Login Feegow (mesmo padrão de outros scrapers).
2. Acessar página de repasses conferidos.
3. Configurar filtros fixos (convênios e unidades).
4. Definir período (`mês anterior` como default).
5. Iterar profissionais ativos do banco.
6. Selecionar profissional por **valor real do campo** (não apenas texto renderizado).
7. Buscar dados e parsear `#datatableRepasses`.
8. Tratar retorno vazio como `NO_DATA`.
9. Persistir dados e atualizar status por profissional.

## 7. Fluxo técnico do PDF
1. API recebe solicitação individual ou em lote.
2. Cria job em `repasse_pdf_jobs`.
3. Worker busca dados consolidados do período/profissional.
4. Gera PDF com identidade visual da Consultare.
5. Salva no S3.
6. Registra artefato em `repasse_pdf_artifacts`.

## 8. Layout do PDF (requisitos)
- Data de geração
- Título: **Feegow - Repasses Consolidados**
- Nome do profissional
- Tabela: `Data Exec.`, `Paciente`, `Descrição`, `Função`, `Convênio`, `Repasse`
- Ordenação: `Data Exec.` decrescente
- Total de repasses
- Link fonte: `https://franchising.feegow.com/v8.1/?P=RepassesConferidos&Pers=`

## 9. Permissões e segurança
- Nova chave de página: `repasses`.
- Ações: `view`, `edit`, `refresh`.
- APIs protegidas com a mesma abordagem de autenticação/autorização dos módulos administrativos existentes.

## 10. Observabilidade
- Heartbeat dedicado para:
- `repasse_sync`
- `repasse_pdf`

Logs por profissional com:
- status
- quantidade de linhas
- total financeiro
- duração
- etapa do erro (`login`, `filtro`, `buscar`, `parse`, `persist`)

## 11. Sprints
### Sprint 1 (base)
- Estrutura de dados e repositório.
- APIs de criação/listagem de jobs manuais.
- Permissões e rota/menu do módulo.

### Sprint 2 (scraping)
- Worker scraper completo.
- Persistência com `UPSERT` por hash.
- Registro de status por profissional.

Status atual:
- iniciado
- worker `workers/worker_repasse_consolidado.py` implementado para consumir jobs `PENDING`
- tratamento de tabela vazia implementado (`NO_DATA`)
- integracao no orquestrador implementada (`thread RepasseSync`)
- modulo oculto da sidebar e protegido por feature flag (`REPASSES_MODULE_ENABLED` / `NEXT_PUBLIC_REPASSES_MODULE_ENABLED`)

### Sprint 3 (frontend)
- Página `/repasses` com filtros, acompanhamento de jobs e ações manuais.

### Sprint 4 (PDF)
- Worker de geração de PDF.
- Geração individual e em lote.
- Persistência em S3 + download no frontend.

## 12. Critérios de aceite
- Reprocessamento do mesmo período não duplica linhas.
- Profissionais sem produção aparecem como `NO_DATA`.
- Job manual pode ser acompanhado do início ao fim no frontend.
- PDF individual e em lote gerado a partir do banco com layout definido.

## 13. Atualização Sprint 3 (2026-03-06)
- Endpoint novo: `GET /api/admin/repasses/professionals`
- Filtros: `periodRef`, `search`, `status`, `page`, `pageSize`
- Resultado: lista paginada por profissional com status (`SUCCESS`, `NO_DATA`, `ERROR`, `NOT_PROCESSED`), quantidade de linhas, total de repasse, ultimo processamento e erro.
- Estatisticas agregadas no retorno para leitura rapida: total de profissionais, distribuicao por status, linhas totais e total financeiro.
- Frontend `/repasses` refatorado para tela condensada e legivel para alto volume:
  - tabela principal de profissionais com alta densidade (scroll interno + paginacao)
  - filtros operacionais no topo (periodo, busca, status, page size)
  - cards de resumo operacional
  - historico de jobs de scraping e PDF em componentes separados
- A rota continua fora da sidebar enquanto o modulo nao for liberado oficialmente.
