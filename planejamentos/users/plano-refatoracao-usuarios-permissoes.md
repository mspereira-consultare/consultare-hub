# Plano de Refatoração — Gerenciamento de Usuários, Permissões e Acessos

## 1. Objetivo deste documento

Este documento reúne o plano inicial de refatoração do gerenciamento de usuários, permissões, grupos, cargos e níveis de acesso do painel atual.

A ideia é apresentar este plano ao Codex para que ele analise o contexto real do repositório, refine a proposta e proponha uma execução segura, incremental e compatível com a estrutura existente.

Este plano não deve ser entendido como uma ordem para sair alterando arquivos imediatamente.

O primeiro passo obrigatório é diagnóstico.

---

## 2. Contexto atual

Atualmente, o gerenciamento de permissões, níveis de acesso, grupos de usuários e cargos está confuso e fragmentado entre diferentes áreas do sistema.

As principais telas e áreas envolvidas são:

- `/users`
- `/dashboard-executivo`
- `/colaboradores`
- Intranet
- Outras páginas do painel que usam regras de acesso/permissão
- Dashboard `/dashboard`, mantendo as regras atuais por enquanto

Hoje, o painel e a Intranet aparentemente usam regras vindas de mais de uma origem, especialmente das configurações existentes em `/users` e `/dashboard-executivo`.

Isso dificulta:

- manutenção;
- entendimento da regra de acesso;
- criação de novas funcionalidades restritas;
- evolução da gestão de usuários;
- controle de segurança;
- integração entre painel e Intranet;
- uso do sistema atual como referência para o futuro SaaS.

---

## 3. Objetivo principal da refatoração

Refatorar e reorganizar o fluxo de permissões para que exista uma fonte da verdade clara, centralizada e segura para:

- usuários;
- cargos;
- grupos/perfis;
- níveis de acesso;
- permissões;
- restrições por página;
- restrições por ação;
- relação com colaboradores;
- regras usadas pelo painel;
- regras usadas pela Intranet;
- regras específicas do dashboard executivo.

A intenção é que as definições atualmente existentes em `/dashboard-executivo` sejam unificadas com a gestão de usuários de `/users`, fazendo com que a gestão de usuários/perfis passe a ser o ponto central para definir quem pode acessar o quê.

Depois dessa refatoração, se uma funcionalidade for restrita à liderança, por exemplo, o sistema deve usar os grupos/perfis/permissões definidos nessa fonte centralizada para decidir se o usuário pode ou não acessar aquele conteúdo.

---

## 4. Relação com o futuro SaaS multi-tenant

Existe uma decisão estratégica de futuramente construir uma nova versão SaaS/multi-tenant do sistema.

Esse futuro SaaS será desenvolvido em:

- novo repositório;
- novo banco de dados;
- novo ambiente;
- nova arquitetura.

Portanto, o painel atual single-tenant não será convertido diretamente em multi-tenant.

O painel atual servirá como:

- espelho funcional;
- referência de regra de negócio;
- referência de UX;
- referência de módulos;
- referência de permissões;
- fonte de consulta para o novo SaaS.

Diante disso, esta refatoração não deve implementar multi-tenancy no sistema atual.

Não criar no painel atual, salvo se já existir no projeto e for necessário para resolver o problema atual:

- `tenantId`;
- `organizationId`;
- `unitId`;
- isolamento por cliente;
- segregação multi-tenant de dados;
- controle comercial de módulos contratados;
- billing;
- planos;
- assinaturas;
- entitlements comerciais.

O objetivo é organizar o single-tenant atual para que ele fique mais claro, seguro, documentado e útil como referência para o SaaS futuro.

A abordagem correta é:

```txt
Single-tenant bem organizado e documentado,
não multi-tenant implementado no legado.
```

---

## 5. Relação com futura venda por módulos

Existe também uma decisão de negócio relevante para o futuro SaaS: o sistema será comercializado por módulos.

Um cliente poderá contratar apenas parte do sistema, por exemplo:

- Gestão de Colaboradores
- Intranet

Sem necessariamente contratar:

- Dashboard Executivo
- Faturamento
- Propostas
- Marketing
- Gestão de Metas
- Outros módulos do painel

Essa lógica comercial será aplicada apenas no SaaS futuro.

No painel atual, não implementar:

- planos comerciais;
- assinatura por módulo;
- módulos contratados por cliente;
- regras comerciais de entitlement;
- billing;
- bloqueio de módulo por contrato.

Porém, a refatoração atual deve organizar as permissões do single-tenant por módulos funcionais, pois isso servirá como referência para o SaaS modular.

A autorização atual deve responder principalmente:

```txt
Este usuário pode acessar esta página ou executar esta ação?
```

Mas a documentação final também deve permitir responder:

```txt
Esta página/funcionalidade pertence a qual módulo funcional?
```

No SaaS futuro, o acesso provavelmente dependerá de duas camadas:

```txt
1. O cliente contratou o módulo?
2. O usuário possui permissão dentro desse módulo?
```

Exemplo conceitual futuro:

```ts
canAccessModule(tenant, 'colaboradores') &&
hasPermission(user, 'colaboradores.view')
```

ou:

```ts
canAccess({
  tenant,
  user,
  module: 'colaboradores',
  permission: 'colaboradores.view',
});
```

No painel atual, não implementar essa camada comercial. Apenas organizar, nomear e documentar os módulos funcionais e suas permissões correspondentes.

---

## 6. Princípios obrigatórios

Antes de alterar qualquer código, fazer uma análise cuidadosa da implementação atual.

Não fazer alterações arriscadas, destrutivas ou que possam quebrar o sistema em produção.

Não excluir vínculos, regras, permissões, cargos, grupos ou lógicas existentes sem antes entender completamente seu uso.

A refatoração deve ser:

- incremental;
- conservadora;
- compatível com o comportamento atual;
- segura;
- documentada;
- fácil de revisar.

O objetivo não é reinventar toda a autenticação/autorização do sistema de uma vez.

O objetivo é organizar, centralizar e simplificar o modelo atual sem quebrar o que já funciona.

---

## 7. Referências conceituais

Usar como inspiração padrões conhecidos de RBAC/IAM adotados por sistemas como Auth0, Okta, AWS IAM e Google Cloud IAM.

Princípios úteis:

- usuários recebem um ou mais papéis/grupos/perfis;
- papéis/grupos representam responsabilidades organizacionais;
- permissões são associadas aos papéis/grupos, não espalhadas manualmente por usuário sempre que possível;
- o sistema deve facilitar o princípio do menor privilégio;
- deve ser possível auditar e entender por que um usuário tem acesso a determinada área;
- a avaliação de acesso deve ser previsível, centralizada e reutilizável;
- a interface administrativa deve deixar claro quais permissões cada grupo/perfil concede.

Esses sistemas devem ser usados apenas como referência conceitual.

Não copiar a complexidade deles literalmente.

---

## 8. Conceitos que devem ser separados

A refatoração atual deve separar claramente os seguintes conceitos:

- usuário;
- colaborador;
- cargo;
- grupo/perfil;
- permissão;
- módulo funcional;
- página/rota;
- ação;
- acesso ao painel;
- acesso à Intranet;
- regras específicas do dashboard executivo.

No futuro SaaS, esses conceitos poderão evoluir para considerar também:

- tenant/cliente;
- organização/unidade;
- módulo contratado;
- escopo de dados;
- permissões por módulo;
- permissões por tenant;
- permissões por unidade.

Mas esses conceitos multi-tenant não devem ser implementados agora no painel single-tenant.

---

## 9. Modelo conceitual desejado para o painel atual

Para o painel atual single-tenant, a lógica recomendada é:

```txt
Usuário
  ↓
Colaborador, se aplicável
  ↓
Cargo
  ↓
Grupo/Perfil
  ↓
Permissões
  ↓
Módulos/Páginas/Ações acessíveis
```

Exemplos conceituais de helpers possíveis:

```ts
hasPermission(user, 'dashboard.executivo.view')
```

```ts
canAccess(user, 'dashboard-executivo')
```

```tsx
<PermissionGate permission="colaboradores.edit">
  <Button>Editar</Button>
</PermissionGate>
```

O importante é evitar regras espalhadas e hardcoded, como:

```ts
user.role === 'admin'
```

espalhadas por várias páginas, componentes e APIs.

A verificação de acesso deve ser centralizada.

---

## 10. Modelo conceitual do SaaS futuro, apenas como referência

Para o SaaS multi-tenant futuro, o desenho poderá evoluir para:

```txt
Plataforma
  ↓
Tenant / Cliente
  ↓
Módulos contratados
  ↓
Organizações / Unidades
  ↓
Usuários
  ↓
Perfis / Grupos
  ↓
Permissões
  ↓
Escopo de dados
  ↓
Acesso final
```

A fórmula conceitual futura seria:

```txt
Acesso permitido =
  usuário autenticado
  + tenant ativo
  + módulo contratado pelo tenant
  + permissão do usuário
  + escopo de dados compatível
```

Essa estrutura deve ser considerada apenas para documentação e decisões arquiteturais futuras.

Não implementar esse modelo completo no painel atual.

---

## 11. Módulos funcionais sugeridos para catalogação

Durante a refatoração do painel atual, agrupar permissões e páginas em módulos funcionais.

Exemplos de módulos possíveis:

- Usuários e Permissões
- Dashboard Executivo
- Colaboradores
- Intranet
- Faturamento
- Propostas
- Marketing
- Gestão de Metas
- Agendamentos
- Monitores
- Checklists
- Configurações
- Relatórios
- Integrações

Esta lista deve ser ajustada de acordo com o que realmente existir no projeto.

A ideia é organizar a autorização atual em uma estrutura como:

```txt
Módulo → Página/Rota → Ação → Permissão
```

Exemplo:

```txt
Módulo: Colaboradores
  - colaboradores.view
  - colaboradores.create
  - colaboradores.edit
  - colaboradores.delete
  - colaboradores.manage

Módulo: Intranet
  - intranet.view
  - intranet.posts.create
  - intranet.posts.edit
  - intranet.posts.delete
  - intranet.admin

Módulo: Dashboard Executivo
  - dashboard.executivo.view
  - dashboard.executivo.export
  - dashboard.executivo.manage

Módulo: Usuários e Permissões
  - users.view
  - users.create
  - users.edit
  - users.permissions.manage
```

---

## 12. Diagnóstico inicial obrigatório

Antes de qualquer implementação, mapear onde hoje são definidos e consumidos:

- usuários;
- cargos;
- grupos;
- perfis;
- níveis de acesso;
- permissões;
- regras específicas do `/dashboard-executivo`;
- regras específicas do `/users`;
- regras usadas em `/colaboradores`;
- regras usadas pela Intranet;
- regras usadas pelo `/dashboard`;
- middlewares;
- hooks;
- helpers;
- componentes;
- APIs que verificam acesso.

Identificar:

- quais tabelas/modelos estão envolvidos;
- quais campos controlam permissões;
- quais páginas dependem dessas regras;
- quais regras estão duplicadas;
- quais regras são conflitantes ou difíceis de entender;
- onde existem verificações hardcoded no frontend;
- onde existem verificações hardcoded no backend;
- onde existe risco de quebra ao alterar comportamento;
- quais regras podem ser encapsuladas sem alterar comportamento;
- quais regras precisam ser preservadas temporariamente por compatibilidade.

Ao final dessa etapa, apresentar um resumo técnico antes de fazer qualquer alteração estrutural.

---

## 13. Classificação por módulo funcional

Durante o diagnóstico, além de mapear usuários, cargos, grupos e permissões, classificar cada rota/página/funcionalidade dentro de um módulo funcional.

Para cada item protegido, identificar:

- módulo funcional ao qual pertence;
- rota ou página relacionada;
- ação realizada, quando aplicável;
- permissão necessária;
- grupos/perfis que acessam hoje;
- se pertence ao painel, à Intranet ou a ambos;
- se é uma funcionalidade administrativa, operacional ou analítica;
- se no futuro SaaS faria sentido ser vendida como módulo separado.

Essa classificação não deve alterar o comportamento atual automaticamente.

Ela deve servir para organizar a autorização atual e gerar documentação útil para o futuro SaaS modular.

---

## 14. Proposta de modelo unificado

Depois do diagnóstico, propor uma estrutura mais clara para centralizar as permissões.

A proposta deve considerar, preferencialmente:

- usuário;
- colaborador, quando aplicável;
- cargo;
- grupo/perfil de acesso;
- permissões;
- módulos funcionais;
- páginas/rotas protegidas;
- ações protegidas;
- relação com painel principal;
- relação com Intranet;
- regras do dashboard executivo;
- regras atuais de visualização de dados.

Não implementar escopos multi-tenant no sistema atual.

Caso existam escopos naturais já presentes no projeto, como unidade, setor, cargo, área ou tipo de colaborador, apenas documentar e preservar essas regras.

Se alguma dessas regras for relevante para o futuro SaaS, registrar em documentação própria.

---

## 15. Fonte da verdade

Definir claramente qual será a fonte da verdade para permissões.

A interface principal de gestão pode ficar concentrada em `/users` ou em uma área administrativa equivalente, mas a fonte da verdade real não deve ser a página em si.

A fonte da verdade deve ser composta por:

- modelo/tabelas de usuários, grupos/perfis, permissões e vínculos;
- camada centralizada de autorização;
- helpers reutilizáveis no frontend e backend;
- validações obrigatórias no backend;
- documentação clara do padrão.

As páginas `/users`, `/dashboard-executivo`, `/colaboradores`, Intranet e demais módulos devem consumir essa camada centralizada, e não manter regras próprias duplicadas.

A página `/users` deve funcionar como interface administrativa para visualizar e gerenciar essa estrutura, mas a regra de autorização deve estar isolada em uma camada própria e reutilizável.

---

## 16. Compatibilidade com regras existentes

Não remover regras antigas imediatamente.

Se existirem regras em `/dashboard-executivo` que hoje controlam acessos importantes, elas devem ser:

- mapeadas;
- preservadas;
- migradas;
- reaproveitadas;
- ou encapsuladas na nova lógica.

Durante a transição, se necessário, manter uma camada de compatibilidade para que o comportamento atual continue funcionando.

Prioridade:

1. Não quebrar acessos existentes.
2. Tornar a lógica mais centralizada.
3. Reduzir duplicidade.
4. Melhorar a UX de administração.
5. Documentar o modelo.
6. Só depois remover código legado, se for seguro.

---

## 17. Revisão da Intranet

Analisar especificamente como a Intranet consome:

- permissões;
- níveis de acesso;
- colaboradores;
- cargos;
- usuários;
- grupos/perfis.

Verificar:

- se a Intranet usa a mesma sessão/autenticação do painel;
- se consulta permissões diretamente;
- se depende de cargos ou grupos;
- se possui regras próprias;
- se alguma mudança no painel pode impactar acessos da Intranet;
- se é necessário criar uma camada compartilhada de autorização entre painel e Intranet;
- quais permissões são exclusivas da Intranet;
- quais permissões são compartilhadas com o painel administrativo.

A refatoração deve manter a Intranet funcionando.

Se houver risco, propor uma solução de compatibilidade antes de alterar.

---

## 18. UX/UI da gestão de permissões

Melhorar a experiência de quem administra usuários.

A página de gestão deve deixar mais claro:

- quem é o usuário;
- qual colaborador está vinculado, se houver;
- qual cargo possui;
- qual grupo/perfil de acesso possui;
- quais permissões esse perfil concede;
- quais áreas do sistema ficam liberadas;
- quais áreas ficam bloqueadas;
- se o acesso vale para painel, Intranet ou ambos;
- a quais módulos funcionais esse usuário tem acesso;
- quais ações ele pode executar em cada módulo.

Também seria interessante incluir uma visualização mais didática da hierarquia de acessos, como:

- diagrama de hierarquia;
- mapa visual de permissões;
- cards por grupo/perfil;
- tabela comparativa de permissões por perfil;
- fluxo visual: Usuário → Cargo/Grupo → Permissões → Áreas acessíveis;
- matriz: Módulo → Página → Ação → Permissão → Perfil.

Essa visualização deve ajudar o administrador a entender rapidamente como o sistema decide quem pode acessar cada área.

---

## 19. Segurança e auditoria

Incluir cuidados para evitar escalonamento indevido de permissão.

Avaliar se faz sentido incluir ou preparar estrutura para:

- logs de alteração de permissões;
- histórico de alterações em usuários/grupos;
- registro de quem alterou permissões;
- confirmação antes de conceder permissões críticas;
- proteção para não remover o último administrador;
- separação entre permissões administrativas e permissões comuns;
- validação no backend, não apenas no frontend.

Não depender apenas da interface para proteger rotas ou APIs.

As permissões críticas precisam ser verificadas no backend.

---

## 20. Design System e componentização visual

Como este painel será referência para o SaaS futuro, a refatoração também deve respeitar uma abordagem consistente de UI/componentes.

Não criar cabeçalhos, filtros, tabelas, cards, gráficos, botões ou estados visuais diretamente dentro das páginas quando já existir um componente reutilizável para isso.

Antes de criar um novo componente visual, verificar se já existe algo equivalente em:

- `components/ui`;
- `components/layout`;
- `components/data-display`;
- `components/filters`;
- `components/forms`;
- `components/dashboard`;
- `packages/ui`, se o projeto usar monorepo.

As páginas devem priorizar composição de componentes existentes.

Componentes visuais comuns devem ser extraídos e reutilizados, especialmente:

- cabeçalhos de página;
- barras de filtro;
- cards de indicadores;
- tabelas;
- paginação;
- gráficos;
- estados de loading;
- estados de erro;
- estados vazios;
- diálogos de confirmação;
- badges/status;
- permissões visuais;
- containers/seções.

Estrutura conceitual recomendada para páginas:

```tsx
<PageLayout>
  <PageHeader
    title="Título da página"
    description="Descrição breve da página"
    actions={...}
  />

  <FilterBar>
    ...
  </FilterBar>

  <PageSection>
    ...
  </PageSection>
</PageLayout>
```

Componentes recomendados quando aplicável:

- `PageLayout`
- `PageHeader`
- `PageSection`
- `FilterBar`
- `MetricCard`
- `KpiGrid`
- `DataTable`
- `ChartCard`
- `EmptyState`
- `LoadingState`
- `ErrorState`
- `ForbiddenState`
- `PermissionGate`

Regra de ouro:

```txt
Página não deve inventar layout.
Página deve compor componentes.
```

---

## 21. Implementação incremental

Seguir uma estratégia segura:

1. Mapear a implementação atual.
2. Criar diagnóstico técnico antes de alterar arquivos.
3. Identificar regras duplicadas, conflitantes ou hardcoded.
4. Classificar páginas e permissões por módulo funcional.
5. Criar helpers ou camada centralizada de autorização.
6. Adaptar uma ou poucas telas primeiro.
7. Manter fallback para regras antigas.
8. Testar comportamento com usuários de perfis diferentes.
9. Só depois expandir para o restante do painel e Intranet.
10. Documentar o novo padrão.

Evitar alterar muitas áreas de uma só vez sem validação.

---

## 22. Estratégia sugerida por fases

### Fase 1 — Diagnóstico

Objetivo: entender o estado atual.

Entregas esperadas:

- mapa das tabelas/modelos envolvidos;
- mapa das páginas afetadas;
- mapa das permissões atuais;
- mapa das regras do `/dashboard-executivo`;
- mapa das regras do `/users`;
- mapa das regras da Intranet;
- identificação de hardcodes;
- identificação de riscos;
- classificação inicial por módulos funcionais.

Nenhum comportamento deve ser alterado nessa fase.

---

### Fase 2 — Proposta técnica

Objetivo: propor a nova organização antes de implementar.

Entregas esperadas:

- modelo unificado de usuários/perfis/permissões;
- proposta de camada centralizada de autorização;
- estratégia de compatibilidade com regras antigas;
- proposta de UX para gestão de permissões;
- proposta de documentação;
- plano de implementação incremental;
- lista de arquivos prováveis a alterar;
- riscos e mitigação.

---

### Fase 3 — Camada centralizada de autorização

Objetivo: criar helpers e abstrações sem quebrar comportamento atual.

Possíveis entregas:

- helper de permissão;
- helper de acesso por módulo/página;
- componente visual de permissão;
- fallback para regra antiga;
- testes/checklist inicial.

Exemplos conceituais:

```ts
hasPermission(user, 'colaboradores.edit')
```

```ts
canAccessPage(user, '/colaboradores')
```

```tsx
<PermissionGate permission="users.permissions.manage">
  <Button>Gerenciar permissões</Button>
</PermissionGate>
```

---

### Fase 4 — Migração incremental das telas

Objetivo: migrar telas gradualmente para a nova camada.

Ordem sugerida:

1. `/users`
2. `/dashboard-executivo`
3. `/colaboradores`
4. Intranet
5. Demais páginas protegidas

Cada tela migrada deve manter comportamento atual, salvo decisão explícita e validada.

---

### Fase 5 — UX de gestão de usuários e permissões

Objetivo: tornar a administração mais clara.

Possíveis melhorias:

- exibir perfil/grupo do usuário;
- exibir permissões herdadas;
- exibir módulos acessíveis;
- exibir permissões por página/ação;
- mostrar se acesso vale para painel, Intranet ou ambos;
- criar tabela comparativa por perfil;
- criar cards por grupo/perfil;
- criar diagrama visual da hierarquia de acesso;
- alertar permissões críticas.

---

### Fase 6 — Documentação e blueprint para SaaS

Objetivo: gerar documentação útil para manutenção e para o SaaS futuro.

Criar ou atualizar documento como:

```txt
PERMISSIONS-AND-MODULES-BLUEPRINT.md
```

Esse documento deve consolidar:

- modelo atual refatorado;
- perfis/grupos existentes;
- permissões existentes;
- módulos funcionais;
- páginas por módulo;
- ações por módulo;
- relação com Intranet;
- relação com dashboard executivo;
- relação com colaboradores;
- helpers/camada de autorização;
- regras legadas preservadas;
- pontos que devem ser considerados no SaaS futuro;
- módulos candidatos a venda separada no SaaS.

---

## 23. Testes e validações

Antes de finalizar, validar cenários como:

- admin acessando tudo;
- liderança acessando áreas restritas;
- usuário comum sem acesso a áreas administrativas;
- colaborador com acesso apenas à Intranet;
- usuário vinculado a colaborador;
- usuário sem colaborador vinculado;
- usuário com grupo/perfil antigo;
- usuário com novo grupo/perfil;
- tentativa de acesso direto por URL;
- tentativa de chamada direta em API protegida;
- acesso ao `/dashboard-executivo`;
- acesso ao `/users`;
- acesso ao `/colaboradores`;
- acesso à Intranet;
- usuário com permissão de visualizar, mas não editar;
- usuário com permissão de editar, mas não excluir;
- usuário sem permissão em módulo específico;
- usuário com acesso ao painel, mas sem acesso à Intranet;
- usuário com acesso à Intranet, mas sem acesso ao painel administrativo.

Se o projeto já tiver testes automatizados, atualizar ou criar testes para a nova camada de autorização.

Se não houver testes, criar pelo menos um checklist manual de validação.

---

## 24. Documentação esperada

Ao final da refatoração, documentar:

- como funciona a nova lógica de permissões;
- onde está a fonte da verdade;
- como criar um novo grupo/perfil;
- como restringir uma nova página;
- como restringir uma nova ação;
- como a Intranet consome essas regras;
- quais regras antigas ainda existem por compatibilidade;
- o que pode ser removido futuramente com segurança;
- lista de módulos funcionais identificados no painel atual;
- páginas/rotas pertencentes a cada módulo;
- permissões relacionadas a cada módulo;
- ações possíveis por módulo, como visualizar, criar, editar, excluir, exportar ou administrar;
- perfis/grupos que acessam cada módulo hoje;
- diferença entre permissões do painel e permissões da Intranet;
- quais módulos parecem candidatos a serem vendidos separadamente no SaaS;
- observações sobre como essa lógica poderia evoluir no SaaS para combinar módulo contratado + permissão do usuário.

---

## 25. Restrições importantes

Durante a refatoração atual:

- não excluir dados existentes;
- não remover regras antigas sem validação;
- não alterar autenticação de forma ampla sem necessidade;
- não quebrar a Intranet;
- não confiar apenas em bloqueios visuais no frontend;
- não criar solução complexa demais se o modelo atual puder ser evoluído de forma incremental;
- não fazer migração destrutiva;
- não deixar permissões críticas hardcoded espalhadas pelo projeto;
- não implementar multi-tenancy no painel atual;
- não implementar controle comercial de módulos contratados no painel atual;
- não implementar billing, planos ou assinaturas no painel atual;
- não adicionar conceitos como `tenantId`, `organizationId` ou `unitId` sem necessidade real no sistema atual;
- não misturar módulo contratado com permissão do usuário;
- não misturar permissão funcional com escopo de dados;
- não criar componentes visuais duplicados sem verificar o design system existente.

---

## 26. Entrega esperada do Codex

O Codex deve trabalhar em modo planejamento primeiro.

Antes de alterar arquivos, deve apresentar:

1. diagnóstico da estrutura atual;
2. arquivos e diretórios relevantes encontrados;
3. como permissões são aplicadas hoje;
4. riscos de quebra;
5. proposta refinada com base no código real;
6. plano incremental de execução;
7. pontos de compatibilidade;
8. proposta de documentação;
9. checklist de validação.

Somente depois disso, iniciar a implementação.

A implementação deve ser feita em etapas pequenas, revisáveis e testáveis.

---

## 27. Prompt sugerido para iniciar a tarefa no Codex

```txt
Você atuará como arquiteto sênior/full-stack neste projeto.

Leia este documento de plano de refatoração de usuários e permissões.

Trabalhe em modo planejamento primeiro. Não altere arquivos ainda.

Quero primeiro um diagnóstico da estrutura atual de usuários, cargos, grupos, permissões, regras do dashboard executivo, colaboradores e Intranet.

Além disso, classifique as permissões e páginas atuais por módulos funcionais, pois o painel atual servirá como blueprint para um futuro SaaS multi-tenant e modular.

Importante: o painel atual continuará single-tenant. O SaaS será desenvolvido em outro repositório, com outro banco e nova arquitetura. Portanto, não implemente multi-tenancy, billing, planos ou módulos contratados no painel atual.

O objetivo da refatoração atual é organizar o single-tenant, centralizar permissões, melhorar a UX de gestão de usuários, preservar regras existentes e gerar documentação útil para o SaaS futuro.

Antes de implementar, retorne:

1. diagnóstico;
2. riscos;
3. proposta de modelo refinada conforme o código real;
4. plano incremental;
5. arquivos que provavelmente serão alterados;
6. checklist de validação.
```

---

## 28. Resultado esperado da refatoração atual

A solução final do painel atual deve:

- centralizar a lógica de permissões;
- melhorar a clareza para administradores;
- preservar regras e vínculos existentes;
- evitar quebras no painel e na Intranet;
- reduzir duplicidade de regras;
- facilitar futuras funcionalidades restritas por grupo/perfil;
- organizar permissões por módulos funcionais;
- criar uma base mais segura e compreensível para controle de acessos;
- gerar documentação útil para o futuro SaaS multi-tenant e modular;
- manter o painel atual como single-tenant bem organizado.

---

## 29. Síntese da abordagem recomendada

A refatoração atual deve ser guiada por esta ideia:

```txt
Single-tenant bem organizado, documentado e modularizado como referência,
sem tentar transformar o legado no SaaS.
```

O SaaS futuro deve nascer com arquitetura própria, mas usando o painel atual refatorado como blueprint para:

- entender módulos;
- entender permissões;
- entender perfis;
- entender regras de negócio;
- entender relação com Intranet;
- entender relação com colaboradores;
- entender regras do dashboard executivo;
- definir pacotes comerciais por módulo;
- separar controle comercial de controle de permissão.

A ponte correta entre os dois projetos é a documentação clara do modelo atual e a organização das permissões por módulos funcionais.
