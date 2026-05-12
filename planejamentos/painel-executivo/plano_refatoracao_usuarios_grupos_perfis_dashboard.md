# Refatoração Definitiva de Usuários + Grupos e Perfis do Dashboard Executivo

## Resumo
Substituir a lógica atual de resolução do dashboard executivo, hoje baseada em texto livre de `departamento + cargo + unidade + override`, por um modelo estável em 4 camadas: `colaborador -> cargo mestre -> grupo executivo -> perfil executivo`, com exceção individual só para casos especiais.

A origem oficial continua no cadastro de colaboradores, mas o permissionamento deixa de depender de variações textuais de cargo/departamento. O cargo mestre passa a ser o ponto principal de atribuição automática. Departamento, unidade e equipe continuam existindo para granularidade de escopo. O usuário segue sendo vinculado ao colaborador, e o dashboard só resolve visão executiva a partir desse vínculo ou de uma exceção individual explícita.

## Mudanças de implementação

### 1. Novo modelo de dados e resolução
- Manter `employees` como origem oficial de `departamento`, `cargo`, `unidade` e vínculo com `users.employee_id`.
- Evoluir o cadastro mestre já existente:
  - `employee_departments`: continua como catálogo oficial de departamentos.
  - `employee_job_titles`: passa a carregar também `executive_group_id`.
- Adicionar `department_catalog_id` e `job_title_catalog_id` em `employees`.
- Backfill por nome normalizado para preencher esses IDs sem perder compatibilidade com os campos textuais atuais.
- Criar `dashboard_executive_groups` com:
  - `id`, `key`, `label`, `description`
  - `default_profile_key`
  - `scope_mode`
  - `departments_json`, `teams_json`, `units_json`
  - `is_active`, `sort_order`, `created_at`, `updated_at`
- `scope_mode` será fechado em:
  - `unrestricted`
  - `employee_department`
  - `employee_units`
  - `employee_department_and_units`
  - `custom`
- Perfis executivos continuam definindo widgets visíveis, mas deixam de ser resolvidos por regra textual de cargo/departamento.
- A resolução final passa a seguir esta ordem:
  1. `dashboard.view` continua sendo o gate de entrada.
  2. Se houver exceção individual ativa, ela prevalece.
  3. Senão, usa o `job_title_catalog_id` do colaborador para encontrar o `executive_group_id`.
  4. O grupo aponta para o perfil executivo padrão.
  5. O escopo de dados vem do `scope_mode` do grupo.
  6. Se não houver vínculo, cargo mestre ou grupo, o dashboard entra em estado seguro `Sem configuração`.

### 2. Fim das regras textuais e nova lógica de exceção individual
- Descontinuar a lógica principal de `dashboard_executive_profile_rules` baseada em `department`, `job_title` e `units`.
- A aba atual de `Regras` deixa de ser a base do sistema e será substituída por:
  - `Grupos`
  - `Cargos`
  - `Exceções individuais`
- Substituir o conceito atual de override por uma exceção individual mais clara:
  - `profile_key_override`
  - `added_widget_keys_json`
  - `hidden_widget_keys_json`
  - `scope_mode_override`
  - `departments_override_json`
  - `teams_override_json`
  - `units_override_json`
  - `is_active`
- A exceção individual poderá:
  - trocar o perfil executivo
  - adicionar widgets extras
  - esconder widgets do perfil
  - substituir o escopo padrão de departamento/equipe/unidade
- O resultado final do usuário será:
  - widgets do perfil
  - `+` widgets extras
  - `-` widgets ocultados
  - escopo herdado do grupo ou substituído pela exceção

### 3. Nova governança no painel
- Criar uma página dedicada de governança do dashboard executivo no grupo `Sistema`, em vez de manter a operação principal escondida como aba secundária de configurações.
- Essa página passa a ser a origem administrativa de:
  - `Perfis`
  - `Grupos`
  - `Cargos`
  - `Exceções individuais`
  - `Preview`
- `Perfis`:
  - criar/editar nome, descrição, widgets visíveis e ordenação
- `Grupos`:
  - criar/editar grupo padronizado
  - escolher perfil padrão
  - definir `scope_mode`
  - quando `scope_mode = custom`, escolher departamentos/equipes/unidades
- `Cargos`:
  - listar todos os cargos mestres
  - mostrar quantidade de colaboradores e usuários vinculados por cargo
  - permitir atribuição em massa de grupo para vários cargos
  - destacar cargos “sem grupo”
- `Exceções individuais`:
  - selecionar usuário
  - trocar perfil
  - adicionar/remover widgets
  - substituir escopo
- `Preview`:
  - mostrar usuário, colaborador vinculado, cargo, departamento, grupo, perfil, origem da resolução e pendências
- A tela de `/users` continua gerenciando acesso por página e vínculo com colaborador, mas não será mais o lugar para montar a visão executiva do dashboard.

### 4. Ajustes no fluxo de colaboradores e usuários
- No cadastro de colaborador:
  - `Departamento` e `Cargo` continuam vindo de listas oficiais
  - novo cargo criado pelo modal entra no catálogo mestre normalmente
  - se o cargo novo ainda não tiver grupo executivo, ele fica com status `pendente de governança`
- No cadastro de usuário:
  - o vínculo com colaborador continua explícito e obrigatório para qualquer usuário que precise de dashboard executivo
  - ao conceder `dashboard.view`, a UI deve mostrar o status executivo do vínculo:
    - `ok`
    - `sem colaborador`
    - `cargo sem grupo`
    - `sem perfil resolvido`
- Usuários `INTRANET` continuam fora dessa governança e não entram no preview nem na resolução do dashboard.
- A tela `/users` deve exibir colunas ou badges resumindo:
  - colaborador vinculado
  - cargo do colaborador
  - grupo executivo
  - perfil resolvido
  - pendência de configuração, se houver

### 5. Migração e compatibilidade
- Fazer migração em etapas:
  1. backfill de `department_catalog_id` e `job_title_catalog_id` em `employees`
  2. backfill de `executive_group_id` nos cargos mestres a partir da tabela de homologação aprovada
  3. criação dos grupos executivos iniciais
  4. ligação grupo -> perfil padrão
  5. conversão dos overrides atuais para o novo formato de exceção individual
  6. congelamento de `dashboard_executive_profile_rules`
- `dashboard_executive_profile_rules` deixa de participar da resolução depois do corte.
- `dashboard_executive_scopes` deixa de ser fonte principal de visão e passa a existir apenas como compatibilidade temporária durante a migração, se necessário.
- O catálogo de departamentos e cargos continua sendo mantido em `Colaboradores`, não no dashboard.
- A atribuição de grupo aos cargos será feita em massa pela nova página de governança, não colaborador por colaborador.

## Interfaces, tipos e APIs
- Novos tipos centrais:
  - `ExecutiveGroupDefinition`
  - `ExecutiveScopeMode`
  - `ExecutiveJobTitleMapping`
  - `ExecutiveUserException`
- `ExecutiveConfigurationSnapshot` passa a expor:
  - `profiles`
  - `groups`
  - `jobTitles`
  - `profileWidgets`
  - `userExceptions`
  - `options`
- `ExecutiveScopeResolutionSource` passa a ser:
  - `group_mapping`
  - `user_exception`
  - `unconfigured`
- `ExecutiveProfilePreviewRow` deve incluir:
  - `departmentCatalogId`
  - `jobTitleCatalogId`
  - `jobTitleName`
  - `executiveGroupId`
  - `executiveGroupLabel`
  - `profileKey`
  - `resolutionSource`
  - `configurationIssue`
- Evoluir `GET/PATCH /api/admin/dashboard/executive/config` para o novo snapshot unificado.
- Remover da UX o uso de `/api/admin/users/executive-scope` como fonte de visão executiva; se mantido, será apenas compatibilidade transitória.
- Evoluir `GET /api/admin/colaboradores/options` para retornar IDs de catálogo, não só nomes.
- Evoluir `GET /api/admin/users` para retornar também o status executivo resumido.

## Testes e cenários
- Usuário com `dashboard.view`, colaborador vinculado, cargo com grupo e grupo com perfil: recebe dashboard automaticamente sem regra manual.
- Usuário com cargo novo e ainda sem grupo: aparece como `Sem configuração` no preview e no dashboard.
- Usuário com exceção individual ativa: perfil e widgets finais respeitam a exceção acima do grupo.
- Grupo com `scope_mode = employee_units`: ao alterar as unidades do colaborador, o dashboard reflete o novo recorte sem criar regra nova.
- Grupo com `scope_mode = custom`: usa exatamente os departamentos/equipes/unidades configurados no grupo.
- Usuário `INTRANET`: não entra na resolução nem na governança do dashboard.
- Conceder `dashboard.view` a usuário sem colaborador vinculado deve gerar alerta claro na UI.
- Cargos semelhantes deixam de exigir múltiplas regras textuais; a atribuição em massa por grupo resolve todos de uma vez.
- Perfis alterados no painel recalculam preview e dashboard sem deploy.
- Migração de overrides antigos preserva exceções existentes relevantes.
- Após o corte, mudanças em `dashboard_executive_profile_rules` não alteram mais a visão do dashboard.

## Assunções e defaults
- A origem oficial de cargo e departamento continua em `Colaboradores`.
- O cargo mestre será a base primária de resolução de grupo; departamento não definirá perfil diretamente.
- A granularidade por departamento/unidade/equipe continuará existindo via escopo do grupo e via exceção individual.
- A exceção individual será mantida, mas como mecanismo de exceção, não como regra principal.
- A gerente terá autonomia para gerenciar perfis, grupos, mapeamento de cargos e exceções pelo painel, com validação e preview de impacto.
- A página de governança do dashboard executivo passa a ser dedicada, separada da edição genérica de permissões de `/users`.
- Não haverá menção a “plano”, “fase” ou termos internos no frontend final.
