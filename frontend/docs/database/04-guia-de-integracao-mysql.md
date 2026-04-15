# Guia de Integracao com o MySQL

Este documento complementa o dicionario de dados e define como outros devs devem consumir, escrever e integrar com o banco do painel com seguranca.

## Objetivo

- orientar leitura analitica e operacional do schema vivo;
- padronizar escrita via APIs internas, workers e webhooks;
- reduzir risco de duplicidade, corrupcao logica e acoplamento indevido;
- deixar claro o que pode e o que nao pode ser tratado como contrato estavel.

## Documentos de apoio

- [README.md](./README.md)
- [01-visao-geral-do-schema-mysql.md](./01-visao-geral-do-schema-mysql.md)
- [02-relacionamentos-logicos-mysql.md](./02-relacionamentos-logicos-mysql.md)
- [03-dicionario-de-dados-mysql.md](./03-dicionario-de-dados-mysql.md)
- [05-matriz-de-escrita-e-consumo.md](./05-matriz-de-escrita-e-consumo.md)
- [06-contratos-operacionais-por-dominio.md](./06-contratos-operacionais-por-dominio.md)

## Premissas estruturais

- O banco atual nao declara `FOREIGN KEY` fisica em `information_schema`.
- A integridade referencial e majoritariamente garantida pela aplicacao.
- Grande parte do schema e criada/garantida em runtime por workers e repositories.
- O adaptador de banco do frontend e dos workers traduz SQL legado SQLite/Turso para MySQL.
- Nem toda tabela deve ser tratada como API publica de escrita.

## Regras de ouro

1. Ler direto do banco e aceitavel para analytics, diagnostico e APIs server-side controladas.
2. Escrever direto no banco so e aceitavel quando a tabela for explicitamente classificada como `escrita manual do painel` ou `tabela tecnica do proprio modulo`.
3. Nunca gravar direto em tabelas `raw_*`, `fact_*`, `feegow_*`, `faturamento_*`, `custo_*`, `clinia_*` ou `marketing_*` sem passar pelo worker/repositorio dono.
4. Nao inferir integridade por FK fisica. Sempre validar existencia da entidade pai na aplicacao.
5. Sempre projetar integracoes com idempotencia.
6. Sempre registrar `created_at`, `updated_at`, `requested_at`, `processed_at` ou equivalente quando o dominio suportar.
7. Para novos endpoints de escrita, preferir API interna do Next.js ou worker dedicado em vez de acesso SQL distribuido em varios pontos.

## Como ler com seguranca

### 1. Comece pela tabela dona do dominio

Exemplos:

- agendamentos: `feegow_appointments`
- pacientes: `feegow_patients`
- faturamento: `faturamento_analitico`, `faturamento_resumo_diario`, `faturamento_resumo_mensal`
- marketing: `fact_marketing_funnel_daily`
- repasses: `feegow_repasse_consolidado`, `feegow_repasse_a_conferir`
- colaboradores: `employees`
- profissionais: `professionals`
- QMS: `qms_documents`, `qms_document_versions`
- vigilancia sanitaria: `health_surveillance_licenses`, `health_surveillance_documents`

### 2. Confira o vinculo logico antes do join

Como nao ha FK fisica, todo join deve ser feito com consciencia de chave:

- `user_page_permissions.user_id -> users.id`
- `user_teams.team_id -> teams_master.id`
- `user_teams.user_name -> users.name`
- `feegow_appointments.patient_id -> feegow_patients.patient_id`
- `proposal_followup_control.proposal_id -> feegow_proposals.proposal_id`
- `employee_* .employee_id -> employees.id`
- `professional_* .professional_id -> professionals.id`

### 3. Prefira tabelas de resumo para leitura gerencial

Use:

- `faturamento_resumo_diario` e `faturamento_resumo_mensal`
- `custo_resumo_diario` e `custo_resumo_mensal`
- `fact_marketing_funnel_daily` e seus recortes
- `fact_clinia_*`

Evite usar base analitica detalhada quando a necessidade for apenas agregacao.

### 4. Respeite o fuso operacional

- Timezone operacional padrao: `America/Sao_Paulo`
- Datas de negocio e filtros internos tendem a seguir `YYYY-MM-DD`
- Campos `created_at`/`updated_at` podem refletir persistencia local, nao necessariamente data de negocio

## Como escrever com seguranca

### Escrita permitida

Escrita manual e aceitavel, desde que via camada server-side controlada, em dominios como:

- `users`
- `user_page_permissions`
- `teams_master`
- `user_teams`
- `goals_config`
- `proposal_followup_control`
- `employees` e tabelas filhas
- `professionals` e tabelas filhas do cadastro
- `payroll_*`
- `contract_templates` e `contract_template_audit_log`
- `qms_*`
- `health_surveillance_*`
- `clinic_equipment*`
- tabelas manuais de checklist

### Escrita restrita ao owner tecnico

Nao escrever fora do owner em:

- `system_status`, `system_status_backup`
- `integrations_config`
- `feegow_*`
- `faturamento_*`
- `custo_*`
- `agenda_occupancy_*`
- `clinia_*`
- `marketing_*`
- `raw_*`
- `fact_*`
- `repasse_sync_*`
- `repasse_consolidacao_jobs`, `repasse_consolidacao_job_items`
- `repasse_pdf_jobs`, `repasse_pdf_artifacts`

## Padrao de idempotencia

Toda escrita externa nova deve definir explicitamente sua chave de idempotencia. Use uma destas estrategias:

- chave natural da origem: ex. `appointment_id`, `patient_id`, `proposal_id`
- chave composta do negocio: ex. `period_ref + professional_id`
- hash tecnico de payload/origem: ex. `event_hash`, `source_row_hash`
- job mais item: ex. `job_id + source_id`

### Recomendacao para webhooks

Persistir sempre:

- `external_event_id`
- `event_type`
- `source_system`
- `received_at`
- `processed_at`
- `processing_status`
- `payload_json`
- `error_message`

Se o webhook puder ser reenviado, a API deve rejeitar ou reaproveitar eventos repetidos pela chave de idempotencia.

## Padrao de API para escrita

### Recomendacao de arquitetura

1. rota `frontend/src/app/api/...`
2. validacao/auth
3. repository/service server-side
4. escrita no MySQL
5. retorno com contrato simples e previsivel

### Resposta padrao sugerida

```json
{
  "status": "success",
  "data": {
    "id": "..."
  }
}
```

### Resposta de erro sugerida

```json
{
  "error": "Mensagem objetiva de falha."
}
```

### Campos minimos para mutacoes novas

- `requested_by`
- `requested_at`
- `updated_at`
- `payload_json` quando houver origem externa ou transformacao relevante

## Padrao de webhook para entrada no banco

### Fluxo recomendado

1. autenticar origem
2. validar assinatura ou segredo
3. normalizar payload
4. aplicar idempotencia
5. gravar staging/entrada tecnica
6. transformar para tabela operacional/fato
7. registrar status final

### Seguranca recomendada

- usar header de assinatura, token secreto ou allowlist de origem
- nunca confiar apenas em IP
- registrar `source_system`
- persistir payload bruto quando houver risco de auditoria/reprocessamento

### Retry

- webhook deve ser processado de modo idempotente
- resposta `2xx` so apos persistencia minima segura
- `5xx` apenas para falha realmente reprocessavel

## Concorrencia e transacao

- use transacao quando a mutacao envolver pai + filhos ou multipla atualizacao consistente;
- em tabelas com chave natural composta, trate conflito como fluxo esperado;
- para jobs, prefira registro de `status` transicional (`PENDING`, `RUNNING`, `SUCCESS`, `ERROR`, etc.).

## Performance

### Regras praticas

- filtrar por colunas indexadas sempre que possivel;
- evitar `SELECT *` em tabelas analiticas grandes;
- paginar consultas operacionais;
- preferir agregados em tabelas `resumo` e `fact`;
- validar cardinalidade do join antes de expor API.

### Tabelas que merecem cautela em leitura pesada

- `faturamento_analitico`
- `custo_analitico`
- `feegow_appointments`
- `feegow_patients`
- `raw_*`
- `fact_marketing_funnel_daily`
- `feegow_repasse_a_conferir`

## LGPD e dados sensiveis

Estas familias podem conter dado pessoal, sensivel ou operacional restrito:

- `users`
- `employees`
- `professionals`
- `feegow_patients`
- `feegow_appointments`
- `feegow_proposals`
- `employee_documents*`
- `professional_documents*`
- `health_surveillance_*`
- `qms_*` quando envolver nomes, assinaturas, comprovacoes e anexos

Recomendacoes:

- nao expor documento bruto em API sem necessidade;
- minimizar campos em listagens;
- aplicar autorizacao por perfil;
- auditar downloads e mutacoes de anexos.

## Checklist para novo endpoint/API

- a tabela de escrita e oficialmente owned pelo modulo?
- existe chave de idempotencia definida?
- o join usa vinculo logico documentado?
- o endpoint distingue data de negocio e data tecnica?
- a resposta e previsivel (`status`/`data` ou `error`)?
- o endpoint respeita permissao/autorizacao?
- existe trilha de auditoria suficiente?

## Checklist para novo webhook

- origem autenticada?
- assinatura validada?
- payload bruto guardado quando necessario?
- chave de deduplicacao definida?
- reprocessamento seguro?
- status tecnico do processamento persistido?
- transformacao separada de staging/fato quando o dominio exigir?

## O que tornaria a documentacao ainda mais forte no futuro

- catalogo de enums/status por tabela;
- exemplos reais anonimizados de payload por dominio;
- consulta de volumetria por tabela;
- mapa de APIs existentes -> tabelas lidas/escritas;
- ADRs para padroes de webhook e eventos.
