# Plano Técnico — Integração Indeed + Triagem Inicial com IA

## Objetivo

Evoluir a página `/recrutamento` do painel para:

1. integrar o processo com a Indeed usando os fluxos oficiais suportados pela plataforma;
2. automatizar uma triagem inicial de candidatos com IA com base no currículo e na descrição da vaga;
3. incluir uma segunda etapa formal com a gerência antes da admissão;
4. conectar essa aprovação da gerência ao painel executivo como pendência operacional;
5. manter o painel como fonte operacional do processo seletivo, sem criar fontes paralelas de verdade;
6. preservar auditoria, rastreabilidade e controle humano sobre a decisão final.

## Decisões já fechadas

- O painel passará a ser a origem oficial das vagas daqui para frente.
- Será feito um backfill inicial assistido das vagas já existentes na Indeed.
- O modelo de dados será um espelho enriquecido: a operação acontece no painel, com IDs externos, status de sincronização e payloads brutos para auditoria.
- A triagem com IA rodará automaticamente em novos candidatos e novos currículos, com opção de reprocessamento manual.
- A IA apenas recomenda; ela não movimenta etapa sozinha no funil.
- O funil ganhará uma etapa formal `GERENCIA`, entre `ENTREVISTA` e `APROVADO`.
- Quando a gerente aprovar o candidato nessa segunda fase, o sistema iniciará automaticamente a pré-admissão e abrirá o processo oficial de admissão em `/colaboradores`.
- Se a gerente não aprovar, o candidato voltará para `ENTREVISTA`, com histórico e observação.
- O V1 dará suporte de triagem automática para currículos em `PDF` e `DOCX`.
- Arquivos `.doc` poderão continuar armazenados, mas ficarão fora da análise automática no V1.

## Base existente a reaproveitar

- Módulo e UI atual de recrutamento já implementados em `apps/painel/src/app/(admin)/recrutamento/page.tsx`
- Repositório server-side em `apps/painel/src/lib/recrutamento/repository.ts`
- Tabelas atuais:
  - `recruitment_jobs`
  - `recruitment_candidates`
  - `recruitment_candidate_files`
  - `recruitment_candidate_history`
- Upload de anexos já integrado com storage S3 do painel
- Parser simples de `.docx` já existente em `apps/painel/src/lib/contract_templates/pdf.ts`
- Infraestrutura de workers Python e filas assíncronas já adotada em outros módulos do projeto

## Premissas da integração oficial com Indeed

### Observação importante de produto e viabilidade

A documentação oficial da Indeed mostra dois cenários principais:

- fluxo ATS/parceiro, com `Job Sync API` e `Indeed Apply`;
- fluxo empregador direto, com feed XML + `Indeed Apply`.

Na prática, a Indeed trata o ATS/painel como origem da vaga e destino operacional da candidatura, e não como um simples consumidor reverso da lista de vagas abertas na Indeed.

Por isso, o plano assume:

- backfill inicial das vagas já existentes;
- depois disso, criação e manutenção de vagas no painel;
- publicação/sincronização do painel para a Indeed;
- recebimento de candidaturas da Indeed no painel.

### Modos de integração suportados no desenho

#### Modo 1 — ATS/parceiro aprovado

Usar:

- `Job Sync API`
- `Indeed Apply`
- opcionalmente `Retrieve Candidates API` / `Candidate Sync APIs`
- opcionalmente `Disposition Sync API`

Esse modo depende de:

- onboarding e aprovação da Indeed;
- credenciais OAuth;
- configuração da integração no Partner Console;
- capabilities exigidas pela Indeed para o tipo de fluxo habilitado.

#### Modo 2 — Empregador direto

Usar:

- feed XML para vagas
- `Indeed Apply` com `postUrl`

Esse modo é menos rico que o fluxo ATS/parceiro, mas continua oficial e viável.

## Estratégia funcional

### Vagas

- Fazer importação assistida das vagas atuais da Indeed para criação do mapeamento inicial.
- Após esse backfill, as vagas passam a ser criadas e mantidas no painel.
- Cada vaga terá:
  - dados funcionais do processo seletivo;
  - descrição completa;
  - requisitos;
  - benefícios;
  - identificadores externos;
  - status de sincronização com a Indeed.

### Candidatos

- Candidaturas vindas da Indeed entram no painel por endpoint dedicado.
- O sistema persistirá o payload bruto recebido antes de qualquer processamento adicional.
- O candidato será criado ou atualizado localmente com origem `INDEED`.
- Currículo e anexos serão armazenados no mesmo fluxo atual de arquivos do candidato, preservando a modelagem já existente.

### Triagem com IA

- A triagem será disparada automaticamente quando:
  - chegar candidato novo importado da Indeed com currículo;
  - um currículo for anexado manualmente no painel;
  - o RH solicitar reprocessamento manual.
- A IA irá comparar:
  - descrição e requisitos da vaga;
  - texto extraído do currículo;
  - metadados adicionais do candidato quando disponíveis.
- O resultado será exibido no painel como apoio à decisão humana.

### Segunda etapa com a gerência

- Quando o recrutador concluir que o candidato está apto a avançar, ele poderá mover a pessoa para a etapa `GERENCIA`.
- Essa etapa funcionará como um gate formal antes da admissão.
- O candidato em `GERENCIA` aparecerá como pendência para a gerente no painel executivo.
- A gerente poderá:
  - aprovar e iniciar a pré-admissão;
  - devolver o candidato para `ENTREVISTA`;
  - manter a pendência para decisão posterior.
- Essa aprovação gerencial ficará registrada com usuário, data/hora e observações.

## Evolução do modelo de dados

### Extensões em `recruitment_jobs`

Adicionar campos para:

- `description_html`
- `description_text`
- `requirements_text`
- `benefits_text`
- `source_system`
- `source_external_id`
- `sync_status`
- `last_synced_at`
- `external_payload_json`

### Extensões em `recruitment_candidates`

Adicionar campos para:

- `source_system`
- `source_external_id`
- `application_external_id`
- `ai_status`
- `ai_score`
- `ai_last_analyzed_at`
- `manager_review_status`
- `manager_review_requested_at`
- `manager_review_requested_by`
- `manager_review_decided_at`
- `manager_review_decided_by`
- `manager_review_notes`

### Novas tabelas

#### `recruitment_indeed_integrations`

Guardar:

- modo de integração;
- credenciais/configuração;
- ambiente;
- healthcheck;
- timestamps e status operacional.

#### `recruitment_indeed_job_mappings`

Guardar:

- relação entre vaga local e identificadores remotos;
- hash do último payload enviado;
- status de publicação;
- erro da última tentativa;
- timestamps de sincronização.

#### `recruitment_indeed_applications`

Guardar:

- payload bruto recebido;
- assinatura/verificação;
- identificadores da candidatura;
- status de ingestão;
- erro de processamento;
- chaves de deduplicação.

#### `recruitment_resume_extractions`

Guardar:

- arquivo origem;
- formato do currículo;
- texto extraído;
- método de extração;
- status de qualidade;
- fallback utilizado;
- timestamps.

#### `recruitment_ai_analysis_jobs`

Fila assíncrona para:

- análise pendente;
- tentativa atual;
- prioridade;
- status;
- erro;
- timestamps.

#### `recruitment_ai_analyses`

Persistir resultado estruturado da IA:

- score;
- parecer curto;
- relatório detalhado;
- pontos fortes;
- pontos fracos;
- aderência por requisito;
- gaps;
- evidências;
- próximo passo recomendado;
- versão do prompt;
- modelo utilizado;
- schema version.

## Contratos internos e APIs novas

### APIs de integração Indeed

- `GET /api/admin/recrutamento/integrations/indeed`
- `POST /api/admin/recrutamento/integrations/indeed`
- `POST /api/admin/recrutamento/indeed/backfill`
- `POST /api/admin/recrutamento/indeed/applications`

### APIs de triagem IA

- `POST /api/admin/recrutamento/candidates/[candidateId]/analysis`
- `GET /api/admin/recrutamento/candidates/[candidateId]/analysis`

### APIs da etapa gerencial

- `POST /api/admin/recrutamento/candidates/[candidateId]/manager-review`

Uso esperado:

- `approve`: aprova a segunda etapa e inicia a pré-admissão;
- `reject`: devolve o candidato para `ENTREVISTA`;
- `notes`: observações da gerente para auditoria e contexto do RH.

### Regras do endpoint inbound da Indeed

- validar assinatura recebida da Indeed;
- responder rápido, sem processamento pesado inline;
- persistir payload bruto imediatamente;
- enfileirar ingestão e análise;
- registrar falhas com status reexecutável.

## Adaptadores e serviços

### Camada Indeed

Criar um adaptador `IndeedProvider` com duas implementações:

- `IndeedJobSyncProvider`
- `IndeedXmlApplyProvider`

Responsabilidades:

- publicar vaga;
- atualizar vaga;
- encerrar vaga;
- validar configuração;
- padronizar leitura e escrita de IDs/status externos.

### Camada de extração de currículo

Criar um serviço de extração com estratégia em camadas:

1. `PDF` com `pypdf` no worker Python;
2. `DOCX` com parsing XML do arquivo zipado;
3. fallback para OpenAI `Responses API` com `input_file` quando a extração local vier vazia, muito curta ou inconsistente.

### Camada de análise com IA

Criar um serviço de triagem com:

- prompt versionado;
- saída estruturada por schema fixo;
- temperatura baixa;
- validação do JSON retornado;
- persistência do resultado completo e resumido.

### Ponte para admissão

Reaproveitar o fluxo já existente do módulo `/colaboradores`, sem criar um segundo motor de admissão dentro de `/recrutamento`.

Quando a gerente aprovar:

1. o sistema valida os dados mínimos necessários para conversão;
2. cria o colaborador com status `PRE_ADMISSAO`;
3. abre automaticamente um `employee_lifecycle_case` do tipo `ADMISSION`;
4. deixa as tarefas formais da admissão no módulo oficial de colaboradores.

Se houver bloqueio na conversão:

- o candidato permanece no recrutamento com a aprovação gerencial registrada;
- o RH recebe erro claro para corrigir CPF, duplicidade ou dado faltante;
- a conversão pode ser reexecutada sem perder o histórico.

## Worker assíncrono de triagem

Criar novo worker dedicado, por exemplo `workers/worker_recruitment_ai.py`.

Responsabilidades:

- buscar jobs pendentes;
- baixar arquivo do currículo no S3;
- extrair texto;
- montar contexto da vaga + currículo;
- chamar a OpenAI;
- salvar o resultado estruturado;
- atualizar status do candidato;
- registrar erro e permitir retry.

### Status sugeridos para a fila

- `PENDING`
- `RUNNING`
- `COMPLETED`
- `FAILED`
- `UNSUPPORTED`

## Prompt e saída da IA

### Entradas mínimas

- título da vaga;
- descrição da vaga;
- requisitos;
- benefícios quando houver;
- nome do candidato;
- texto do currículo extraído;
- observações operacionais opcionais.

### Saída estruturada obrigatória

- `score`
- `short_verdict`
- `detailed_report`
- `matched_requirements`
- `missing_requirements`
- `strengths`
- `weaknesses`
- `risks_or_gaps`
- `evidence`
- `recommended_human_next_step`

### Regra de negócio do score

- score numérico de `0` a `100`
- score não altera etapa automaticamente
- score serve como apoio visual, filtro e priorização de análise humana

## Mudanças na interface `/recrutamento`

### Vagas

- ampliar formulário/edição com descrição completa, requisitos e benefícios;
- exibir status de sincronização com Indeed;
- exibir identificador externo e data da última sincronização;
- permitir ação manual de republicar/sincronizar quando houver erro.

### Funil de candidatos

- mostrar badge de origem do candidato;
- mostrar status da IA no card;
- mostrar score de aderência no card quando disponível.
- incluir a coluna/etapa `GERENCIA` no funil.

### Modal do candidato

- nova seção ou aba `Triagem IA`;
- mostrar:
  - score;
  - parecer breve;
  - pontos fortes;
  - pontos fracos;
  - requisitos com maior aderência;
  - requisitos com menor aderência;
  - relatório detalhado;
  - última análise;
  - status e erro, se houver;
  - botão `Reprocessar análise`.
- incluir uma seção `Etapa com a Gerência`, com:
  - status da pendência;
  - data de envio;
  - observações;
  - ação de encaminhar para gerência;
  - ação de aprovar/reprovar para usuários com a permissão adequada.

### Painel executivo

- adicionar um card executivo com total de candidatos aguardando decisão da gerência;
- adicionar uma lista resumida de pendências com:
  - nome do candidato;
  - vaga;
  - recrutador responsável;
  - data de entrada na etapa;
  - tempo em espera;
  - link para ação.
- nessa primeira versão, essa pendência será uma leitura derivada do recrutamento, não uma central genérica de tarefas do sistema.

## Segurança, auditoria e governança

- Toda integração com Indeed deve registrar payload bruto e status de ingestão.
- Toda análise de IA deve guardar:
  - modelo;
  - versão do prompt;
  - data/hora;
  - resultado estruturado;
  - origem do currículo analisado.
- Toda decisão da gerente deve guardar:
  - usuário decisor;
  - data/hora;
  - resultado da decisão;
  - observações.
- A decisão final continua humana.
- O histórico do candidato não deve ser sobrescrito; reanálises devem ser versionadas.
- Falhas de integração ou IA não podem bloquear o cadastro nem a visualização do candidato.

## Fases sugeridas de implementação

### Fase 1 — Fundação de dados e UI

- ampliar schema de vagas e candidatos;
- criar tabelas de integração e análise;
- ampliar UI de vaga e candidato;
- incluir a etapa `GERENCIA` e o bloco de decisão gerencial;
- preparar status e placeholders visuais.

### Fase 2 — Publicação e backfill Indeed

- cadastrar integração;
- implementar provider oficial escolhido;
- executar backfill assistido;
- ativar publicação de vagas pelo painel.

### Fase 3 — Ingestão de candidaturas Indeed

- criar endpoint inbound;
- validar assinatura;
- persistir payload bruto;
- criar candidato local e anexos.

### Fase 4 — Extração e triagem com IA

- criar fila;
- criar worker de IA;
- extrair texto de `PDF` e `DOCX`;
- implementar análise estruturada com OpenAI;
- exibir resultado no painel.

### Fase 5 — Etapa gerencial e ponte para admissão

- criar a etapa `GERENCIA` no funil;
- criar a pendência no painel executivo;
- implementar a decisão formal da gerente;
- disparar automaticamente `PRE_ADMISSAO` + workflow de admissão em `/colaboradores`.

### Fase 6 — Retry, observabilidade e endurecimento

- retry manual;
- mensagens de erro operacionais;
- métricas internas básicas;
- testes de carga e duplicidade;
- preparação para eventual `Disposition Sync`.

## Critérios de aceite

- O painel consegue registrar a configuração da integração Indeed.
- O backfill inicial cria o vínculo entre vagas locais e vagas já existentes na Indeed.
- Novas vagas criadas no painel podem ser publicadas/sincronizadas na Indeed pelo fluxo oficial adotado.
- Candidaturas Indeed entram no painel sem duplicação indevida.
- Currículos recebidos pela Indeed são armazenados no fluxo padrão de anexos do candidato.
- A análise com IA é disparada automaticamente após ingestão válida.
- O painel exibe score, parecer e relatório detalhado do candidato.
- O recrutador consegue encaminhar candidato para a etapa `GERENCIA`.
- O painel executivo mostra os candidatos aguardando decisão da gerente.
- A gerente consegue aprovar ou devolver o candidato com rastreabilidade.
- A aprovação da gerente inicia automaticamente a pré-admissão e o processo oficial de admissão.
- A não aprovação devolve o candidato para `ENTREVISTA`.
- O RH consegue reprocessar a análise manualmente.
- Nenhuma análise de IA altera etapa automaticamente.
- Falhas da Indeed ou da OpenAI ficam visíveis e reprocessáveis.

## Riscos e pontos de atenção

- O acesso às APIs mais ricas da Indeed depende de aprovação, onboarding e capabilities habilitadas.
- Pode haver diferença entre fluxo de parceiro ATS e fluxo de empregador direto; o provider deve isolar essa variação.
- Currículos em PDF escaneado podem exigir fallback com `input_file` na OpenAI.
- O custo da análise com IA cresce com volume e tamanho dos currículos; será importante limitar contexto e versionar prompt.
- Alguns anexos antigos em `.doc` podem não ser analisáveis no V1.

## Referências oficiais consideradas no desenho

- Indeed Job Sync API
- Indeed Integrate with Job Sync API
- Indeed Apply for ATS
- Indeed Apply application data reference
- Indeed direct employer integration with Indeed Apply
- Indeed Retrieve Candidates API integration guide
- Indeed fetchAssets
- Indeed Disposition Sync API guide
- OpenAI Models
- OpenAI Responses API
- OpenAI Structured Outputs
- OpenAI file inputs / `input_file`
