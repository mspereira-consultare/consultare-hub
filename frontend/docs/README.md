# Documentação do Hub Consultare

Este diretório centraliza a documentação funcional e técnica do projeto.

## Índice

1. [`docs/01-visao-funcional-e-indicadores.md`](docs/01-visao-funcional-e-indicadores.md)  
   Descreve páginas do painel, filtros, fontes e fórmulas dos indicadores.

2. [`docs/02-matriz-de-permissoes.md`](docs/02-matriz-de-permissoes.md)  
   Modelo de acesso por página (`view`, `edit`, `refresh`) e regras por perfil.

3. [`docs/03-arquitetura-tecnica.md`](docs/03-arquitetura-tecnica.md)  
   Arquitetura da aplicação (frontend, APIs, workers, orquestrador, cache, autenticação e banco).

4. [`docs/04-dicionario-de-dados.md`](docs/04-dicionario-de-dados.md)  
   Dicionário das tabelas, chaves e responsáveis pela atualização.

5. [`docs/05-runbook-operacional.md`](docs/05-runbook-operacional.md)  
   Procedimentos operacionais: deploy, variáveis de ambiente, validação pós-deploy e troubleshooting.

6. [`docs/06-plano-tecnico-qualidade-treinamentos.md`](docs/06-plano-tecnico-qualidade-treinamentos.md)  
   Plano técnico e execução do módulo de Qualidade e Treinamentos.

7. [`docs/07-plano-tecnico-repasses.md`](docs/07-plano-tecnico-repasses.md)  
   Plano técnico e evolução do módulo de Repasses.

8. [`docs/08-agenda-ocupacao.md`](docs/08-agenda-ocupacao.md)  
   Documentação funcional/técnica do módulo de Ocupação de Agenda.

9. [`docs/09-plano-tecnico-marketing-funil.md`](docs/09-plano-tecnico-marketing-funil.md)  
   Plano técnico detalhado do módulo `/marketing/funil`, incluindo Google Ads, GA4, Clinia Ads, agenda e faturamento.

10. [`docs/10-plano-tecnico-colaboradores.md`](docs/10-plano-tecnico-colaboradores.md)  
   Plano técnico e implementação do módulo `/colaboradores` para o Departamento Pessoal.

## Convenções

- Datas: padrão `YYYY-MM-DD` no banco e filtros internos.
- Timezone operacional: `America/Sao_Paulo`.
- Heartbeat de workers: tabela `system_status`.
- Fonte de verdade para métricas:
- Financeiro e Dashboard financeiro: `faturamento_resumo_*` com fallback em `faturamento_analitico`.
- O KPI `Novos pacientes` do `/financeiro` vem de `feegow_appointments.first_appointment_flag` + `patient_id`.
- Relatório Geral Financeiro (PDF/XLSX): `faturamento_analitico`.
- Filas: `espera_medica`, `recepcao_historico`, `clinia_group_snapshots`.
- Produtividade/agendamentos: `feegow_appointments`.
- Catálogo de procedimentos: `feegow_procedures_catalog`.
- Procedimentos por profissional: `professional_procedure_rates`.
- Propostas: `feegow_proposals` + `feegow_patient_contacts_cache` + `proposal_followup_control`.
- Resolvesaúde: `feegow_contracts`.

## Público-alvo

- Gestão/Operação: `01` e `05`.
- Produto/BI: `01` e `04`.
- Engenharia/Manutenção: `02`, `03`, `04` e `05`.

## Atualizações recentes

- Módulo `/profissionais` evoluído com APIs, upload de documentos, contratos e procedimentos.
- Módulos de Qualidade (`/qualidade/*`) concluídos com indicadores e refresh em lote.
- Módulo de Repasses evoluído com workers de consolidação, geração de relatório e controles operacionais.
- Novo plano de agenda em `docs/08-agenda-ocupacao.md`.
- Novo plano do módulo `/marketing/funil` em `docs/09-plano-tecnico-marketing-funil.md`.
- Módulo `/marketing/funil` atualizado com Clinia Ads, nova regra de lead por WhatsApp e documentação técnica consolidada.
- Módulo `/marketing/funil` reorganizado em abas (`Visão geral`, `Campanhas`, `Saúde Google Ads`) com diagnóstico de orçamento, status e estratégia de lances.
- Novo módulo `/colaboradores` documentado em `docs/10-plano-tecnico-colaboradores.md`.
- Módulo `/marketing/funil` recalibrado para usar `Novos contatos Clinia (Google)` como lead operacional principal e separar `Cliques em WhatsApp` como diagnóstico auxiliar.
- Cards do `/marketing/funil` e da aba `Saúde Google Ads` agora usam hovers detalhados com fórmula, origem do dado, escopo e limitações.
- Módulo de propostas separado entre `/propostas` (base de trabalho) e `/propostas/gerencial` (visão gerencial), com permissionamento distinto, follow-up persistente por proposta, submenu próprio em `Financeiro > Propostas`, filtros operacionais por conversão/responsável/profissional e exportação enriquecida.
- Novo módulo `/equipamentos` documentado em `docs/11-plano-tecnico-equipamentos.md`.
