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

## 14. Atualização Sprint 4 (2026-03-06)
- Processamento de PDF implementado no backend Node (`pdf-lib`) com persistencia no S3.
- Novo processador: `src/lib/repasses/pdf_processor.ts`
  - consome jobs `PENDING` em `repasse_pdf_jobs`
  - marca status do job (`RUNNING`, `COMPLETED`, `PARTIAL`, `FAILED`)
  - gera PDF por profissional com dados da tabela `feegow_repasse_consolidado`
  - registra heartbeat em `system_status` com `service_name='repasse_pdf'`
  - grava artefatos em `repasse_pdf_artifacts`
- Novas APIs:
  - `POST /api/admin/repasses/pdf-jobs/process` (processa fila pendente manualmente)
  - `GET /api/admin/repasses/artifacts` (lista PDFs gerados)
  - `GET /api/admin/repasses/artifacts/[artifactId]/download` (download/inline)
- Frontend `/repasses` atualizado:
  - botao `Processar fila PDF`
  - tabela de `PDFs gerados` com visualizar/baixar
  - refresh unificado inclui jobs, profissionais e artefatos

### Variaveis de ambiente usadas no Sprint 4
- `REPASSE_PDF_S3_PREFIX` (opcional, default: `repasses/pdfs/`)
- `AWS_REGION`, `AWS_S3_BUCKET`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`

## 15. Ajuste de disparo (system_status x fila de jobs)
- Repasses continua com fila propria (`repasse_sync_jobs`) para suportar periodo e rastreio por profissional.
- Para padronizar com o orquestrador:
  - quando o listener receber `service_name='repasses'` em `system_status` com `PENDING`, ele agora cria um job automaticamente se a fila estiver vazia (periodo default = mes anterior) e processa em seguida.
- Worker CLI atualizado para teste local sem painel/API:
  - `python workers/worker_repasse_consolidado.py --enqueue --period YYYY-MM`
  - `python workers/worker_repasse_consolidado.py --once --period YYYY-MM`
  - `python workers/worker_repasse_consolidado.py --enqueue --period YYYY-MM --once`

## 16. Atualizacao - Escopo de scraping por profissional (2026-03-06)
- O job de scraping (`repasse_sync_jobs`) agora suporta escopo:
  - `all` (todos os profissionais ativos)
  - `single` (um profissional)
  - `multi` (conjunto especifico)
- Campo novo no job: `professional_ids_json` (lista de IDs internos do painel).
- Fluxo frontend atualizado na pagina `/repasses`:
  - usuario escolhe escopo de scraping
  - para `single`/`multi`, seleciona profissionais ativos
  - API `POST /api/admin/repasses/jobs` recebe `scope` + `professionalIds`
- Worker atualizado para respeitar o escopo do job no processamento.
- Endpoint de apoio:
  - `GET /api/admin/repasses/professionals?mode=options` para carregar lista de profissionais ativos (selecao de escopo).


## 17. Atualizacao - Selecao por checkbox e observacoes (2026-03-06)
- A selecao de profissionais foi movida para a tabela principal:
  - checkbox por linha
  - checkbox no cabecalho para selecionar/desselecionar os profissionais visiveis na pagina
  - contador global de selecionados no periodo
- Selecao persistente entre paginacao e buscas no frontend.
- Novo atalho para selecao em massa por filtro atual:
  - `GET /api/admin/repasses/professionals?mode=ids&periodRef=...&search=...&status=...`
- Acoes principais agora operam sobre a selecao atual:
  - `Atualizar dados de repasse`
  - `Gerar relatorios`
- Observacoes por profissional e periodo:
  - tabela nova `repasse_professional_notes` (PK: `period_ref + professional_id`)
- API nova `PUT /api/admin/repasses/notes`
- coluna Observacao na tabela com edicao e salvamento por linha
- observacao inclu?da no PDF gerado do profissional

## 18. Atualizacao - Heartbeat com fila global serial (2026-03-11)
- Novo endpoint: `GET /api/admin/jobs/serial-queue-status?services=faturamento,repasses,repasse_consolidacao`
- Fonte: `system_status` com leitura dos estados `RUNNING`, `QUEUED`, `PENDING`.
- Regra de posicao:
  - `RUNNING` sempre aparece como posicao `1`.
  - `QUEUED` e `PENDING` aparecem em seguida, ordenados por `last_run` ascendente.
- Resposta:
  - `data.global` com tamanho da fila e ordem de servicos.
  - `data.services[]` com `position`, `queueSize`, `isRunning`, `isQueued`, `lastRun`, `details`.
- Componente reutilizavel: `src/components/JobQueueHeartbeat.tsx`
  - Mostra "Processando agora" ou "Na fila" quando houver servico ativo.
  - Quando nao houver fila ativa, mostra apenas "Ultima sincronizacao".
- Integracao inicial:
  - pagina `financeiro`: servico `faturamento`.
  - pagina `repasses`: servicos `repasses` e `repasse_consolidacao`.
- Substituicao de relatorios por periodo/profissional:
  - antes de gravar novo PDF, artefatos antigos do mesmo periodo/profissional sao removidos (storage + banco).


## 18. Atualizacao - UX operacional de fechamento (2026-03-06)
- Tabela de profissionais virou o painel central do modulo:
  - checkbox por linha
  - checkbox no cabecalho (pagina atual)
  - selecao em massa por filtro (`Selecionar todos do filtro`)
  - contador de profissionais selecionados
- Acoes de operacao agora usam a selecao da tabela:
  - Atualizar dados de repasse
  - Gerar relatorios
- Historicos de atualizacao e relatorios sairam da tela fixa e foram movidos para modais sob demanda.
- Coluna de relatorio foi integrada na tabela de profissionais (botao Visualizar + data de geracao).
- Pagina padrao de listagem alterada para 300 linhas por pagina.
- Coluna `Solicitado por` no historico agora exibe nome/e-mail do usuario logado (quando disponivel), em vez de ID tecnico.

## 19. Atualizacao - APIs de Consolidacao (A Conferir) (2026-03-10)
- Namespace novo de API: `/api/admin/repasses/consolidacao/*`.
- Fonte separada do modulo existente:
  - dados: `feegow_repasse_a_conferir`
  - jobs: `repasse_consolidacao_jobs` e `repasse_consolidacao_job_items`
  - observacoes: `repasse_consolidacao_notes`
- Endpoints adicionados:
  - `GET|POST /api/admin/repasses/consolidacao/jobs`
  - `GET /api/admin/repasses/consolidacao/professionals`
  - `GET /api/admin/repasses/consolidacao/professionals/[professionalId]/details`
  - `PUT /api/admin/repasses/consolidacao/notes`
- Regras:
  - `periodRef` default = mes anterior (`YYYY-MM`)
  - `requested_by_display` com join seguro na tabela `users`
  - status resumido por profissional:
    - `ERROR`, `NO_DATA`, `SKIPPED`, `SUCCESS`, `NOT_PROCESSED`
- Permissoes reutilizadas: `repasses` com `view`, `refresh`, `edit`.
- Compatibilidade: nenhuma rota antiga de `/api/admin/repasses/*` foi removida ou alterada.

## 20. Atualizacao - Comparativo Consolidado x A Consolidar (2026-03-10)
- A página `/repasses` passou a usar como fonte principal o namespace de consolidacao:
  - `GET /api/admin/repasses/consolidacao/professionals`
  - `GET /api/admin/repasses/consolidacao/professionals/[professionalId]/details`
  - `PUT /api/admin/repasses/consolidacao/notes`
- Novos campos agregados por profissional no resumo:
  - `consolidadoQty`, `consolidadoValue`
  - `naoConsolidadoQty`, `naoConsolidadoValue`
  - `naoRecebidoQty`, `naoRecebidoValue`
  - `repasseTotalConsolidadoTabela` (fonte: `feegow_repasse_consolidado`)
  - `repasseTotalConsolidadoAConferir` (fonte: `feegow_repasse_a_conferir`, status `CONSOLIDADO`)
  - `hasDivergencia`, `divergenciaValue` (tolerancia `0.01`)
- Regra de status operacional:
  - `NAO_CONSOLIDADO = OUTRO + SEM_DETALHE`
  - `NAO_RECEBIDO` permanece separado
- Filtros novos no endpoint de profissionais:
  - `hasPaymentMinimum`, `consolidacaoStatus`, `hasDivergence`
  - `attendanceDateStart`, `attendanceDateEnd`, `patientName`
- Atualizacao dupla em endpoint unico:
  - `POST /api/admin/repasses/refresh`
  - cria simultaneamente jobs em `repasse_sync_jobs` e `repasse_consolidacao_jobs`.
- Persistencia de conferencia manual por usuario:
  - `repasse_consolidacao_line_marks` (chave: `period_ref + professional_id + source_row_hash + user_id`)
  - `repasse_consolidacao_mark_legends` (chave: `user_id + color_key`)
  - APIs:
    - `GET|PUT /api/admin/repasses/consolidacao/marks`
    - `GET|PUT /api/admin/repasses/consolidacao/legend`
- Modal de detalhes do profissional:
  - mostra status de consolidacao por atendimento (`detailStatus*` e `isInConsolidado`)
  - marcações por cor com autosave (debounce) e salvamento manual
  - legenda de cores customizavel por usuario
  - observacao do relatorio e observacao interna.
