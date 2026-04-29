# Matriz de Escrita e Consumo

Esta matriz define quem e o owner tecnico de cada familia de tabela e como ela deve ser consumida por outros devs.

## Legenda

- `Owner`: camada ou modulo que deve centralizar a escrita
- `Leitura externa`: se outras APIs/servicos podem ler diretamente
- `Escrita externa`: se outro modulo pode gravar direto no banco
- `Uso principal`: operacional, cadastro, staging, fato, resumo, auditoria ou job

## Matriz por familia

| Familia / Tabelas | Owner tecnico | Leitura externa | Escrita externa | Uso principal | Observacao |
| --- | --- | --- | --- | --- | --- |
| `system_status`, `system_status_backup` | Workers / orquestrador | Sim | Nao | Heartbeat | Apenas leitura por dashboards e monitoramento |
| `integrations_config` | Settings + workers de auth | Restrita | Nao | Configuracao tecnica | Contem credenciais; nao expor sem filtro |
| `users`, `user_page_permissions`, `teams_master`, `user_teams` | APIs admin / auth | Sim | Somente via API do modulo | Cadastro e seguranca | Nao escrever por SQL avulso em outros modulos |
| `goals_config` | API admin de metas | Sim | Somente via API do modulo | Configuracao funcional | Pode ser lida por dashboards e relatorios |
| `recepcao_checklist_*`, `crc_checklist_daily` | APIs do checklist | Sim | Somente via API do modulo | Operacional/manual | Escrita manual controlada |
| `espera_medica`, `recepcao_historico`, `monitor_medico_*` | Workers/monitores | Sim | Nao | Operacional online | Consumir como leitura near-real-time |
| `agenda_occupancy_*` | Worker + repository do modulo | Sim | Nao | Snapshot operacional e jobs | Ler; nao repovoar por fora |
| `clinia_group_snapshots`, `clinia_chat_stats`, `clinia_appointment_stats` | Worker Clinia | Sim | Nao | Operacional | Fonte derivada de integracao |
| `feegow_appointments`, `feegow_patients`, `feegow_procedures_catalog`, `feegow_proposals`, `feegow_contracts` | Workers Feegow | Sim | Nao | Base transacional espelhada | Tratar como dominio de ingestao |
| `feegow_patient_contacts_cache`, `proposal_followup_control` | Modulo de propostas | Sim | Parcial | Apoio operacional | `proposal_followup_control` aceita escrita manual do modulo |
| `faturamento_*`, `custo_*` | Workers de faturamento/custo | Sim | Nao | Analitico e resumo | Ler `resumo_*` sempre que possivel |
| `marketing_google_accounts`, `marketing_campaign_mapping` | Worker/repositorio de marketing | Sim | Parcial | Configuracao + mapeamento | `marketing_campaign_mapping` e tabela de parametrizacao do dominio |
| `marketing_funnel_jobs`, `marketing_funnel_job_items` | Worker marketing | Sim | Nao | Job tecnico | Uso de observabilidade e troubleshooting |
| `raw_*` | Workers de integracao | Restrita | Nao | Staging/raw | Nao expor diretamente em API publica |
| `fact_marketing_*`, `fact_clinia_ads_*` | Workers analiticos | Sim | Nao | Fato analitico | Base preferencial para APIs gerenciais |
| `feegow_repasse_*`, `repasse_sync_*` | Workers/repositories de repasse | Sim | Nao | Base de repasse e jobs | Dominio sensivel; evitar escrita direta |
| `repasse_professional_notes`, `repasse_consolidacao_notes`, `repasse_fechamento_manual`, `repasse_consolidacao_line_marks`, `repasse_consolidacao_mark_legends` | Modulo de repasses | Sim | Somente via API do modulo | Operacional/manual | Escrita permitida so nas tabelas manuais do fluxo |
| `repasse_pdf_jobs`, `repasse_pdf_artifacts` | Modulo de repasses | Sim | Nao | Geracao de artefatos | APIs do dominio devem acionar o fluxo, nao gravar direto |
| `employees` e `employee_*` | Modulo de colaboradores / RH | Sim | Somente via API do modulo | Cadastro e operacao RH | Contem PII e anexos |
| `professionals` e `professional_*` | Modulo de profissionais | Sim | Somente via API do modulo | Cadastro e compliance de profissionais | Parte do dominio tem apoio de sync |
| `payroll_*` | Modulo de folha | Sim | Somente via API do modulo/worker dedicado | Fechamento mensal | Requer transacao e rastreabilidade |
| `contract_templates`, `contract_template_audit_log` | Modulo de contratos | Sim | Somente via API do modulo | Cadastro + auditoria | Modelos e historico |
| `qms_*` | Modulo de qualidade | Sim | Somente via API do modulo | Cadastro, versao, auditoria, treinamento | Requer governanca documental |
| `health_surveillance_*` | Modulo de vigilancia sanitaria | Sim | Somente via API do modulo | Cadastro regulatorio e anexos | Pode exigir retencao e trilha |
| `clinic_equipment*` | Modulo de equipamentos | Sim | Somente via API do modulo | Cadastro, eventos e anexos | Estado operacional e manutencao |

## Matriz de decisao rapida

| Cenário | Pode ler direto do MySQL? | Pode escrever direto no MySQL? | Caminho recomendado |
| --- | --- | --- | --- |
| Dashboard interno | Sim | Nao | API server-side lendo `fact`/`resumo` |
| Relatorio gerencial | Sim | Nao | Query controlada em tabela agregada |
| Cadastro admin | Sim | Sim, mas apenas via API do modulo | `route.ts` + repository |
| Importacao externa operacional | Sim | Nao, salvo modulo owner | API interna ou worker dedicado |
| Webhook de fornecedor | Sim | Nao direto em fato/transacional espelhado | staging + service/worker owner |
| Reprocessamento tecnico | Sim | Restrito | script/worker owner com rastreio |

## Tabelas que exigem maior cuidado

### Sensiveis por dados pessoais

- `users`
- `employees`
- `professionals`
- `feegow_patients`
- `feegow_appointments`
- `feegow_proposals`

### Sensiveis por operacao/financeiro

- `faturamento_*`
- `custo_*`
- `feegow_repasse_*`
- `repasse_*`
- `payroll_*`

### Sensiveis por rastreabilidade documental

- `employee_documents*`
- `professional_documents*`
- `contract_templates`
- `qms_*`
- `health_surveillance_*`
- `clinic_equipment_files`

## Regras de ownership

1. Cada tabela deve ter um owner tecnico claro.
2. Novo codigo nao deve duplicar regra de escrita de tabela owned por outro modulo.
3. Se uma integracao precisar escrever em dominio de outro owner, o correto e expor servico/API interna ou fila de processamento.
4. Tabelas `job`, `raw`, `fact`, `checkpoint` e `heartbeat` nao devem ser usadas como atalho para mutacao de negocio.

## Regras de compatibilidade

- Nao renomear colunas usadas por workers sem revisar o owner.
- Nao alterar semantica de `status` sem atualizar modulo e docs do dominio.
- Nao assumir que `id` sintetico e a chave de negocio real.
- Para joins interdominio, usar a matriz em conjunto com [02-relacionamentos-logicos-mysql.md](./02-relacionamentos-logicos-mysql.md).
