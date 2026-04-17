# Guia de Desenvolvimento - Nova Intranet Consultare

## 1. Objetivo deste documento

Este documento e o guia principal para desenvolvimento da nova **Intranet Consultare**.

Ele tem quatro objetivos:

1. consolidar as decisoes de produto e arquitetura ja fechadas;
2. descrever como a intranet deve ser implementada usando a stack e os padroes do painel gerencial atual;
3. servir como referencia para backend, frontend, banco, integracoes, permissoes, chatbot e chat interno;
4. reduzir ambiguidades para que a equipe consiga implementar o modulo com o minimo possivel de decisoes abertas.

Este guia deve ser tratado como a referencia base para o desenvolvimento do V1 e como o ponto de partida para os proximos refinamentos.

---

## 2. Contexto atual

Hoje a Consultare possui uma intranet em **Google Sites** com uma arvore extensa de conteudo institucional e operacional, incluindo:

- informacoes institucionais;
- historia, missao, visao e valores;
- organograma;
- unidades, horarios e contatos;
- avisos do dia;
- FAQ;
- POPs, manuais e rotinas por area;
- servicos, consultas, exames e procedimentos;
- portfolio de medicos;
- valores e especificacoes de servicos;
- paginas operacionais de apoio ao time;
- um item chamado "IA Consultare".

A nova intranet deve substituir essa experiencia usando:

- a mesma stack principal do painel gerencial;
- o mesmo padrao visual geral da Consultare;
- uma sidebar de navegacao coerente com o painel;
- o mesmo banco quando fizer sentido;
- a mesma base de usuarios;
- o mesmo ecossistema de autenticacao e storage;
- interface administrativa dentro do painel, sem depender de edicao em codigo para atualizacoes rotineiras.

---

## 3. Premissas confirmadas

As decisoes abaixo ja foram validadas e devem ser consideradas travadas para o planejamento inicial:

- a intranet sera um **app separado no mesmo repositorio**;
- o go-live sera **faseado**;
- a intranet nova sera administrada pelo painel gerencial atual;
- o CMS sera baseado em **blocos padronizados**, nao em editor totalmente livre;
- a intranet usara os **mesmos usuarios** e a mesma base de login do painel;
- a experiencia entre painel e intranet deve ser de **login unico / SSO**;
- o chatbot sera construido com **OpenAI**;
- o chatbot respondera com base em **documentos + dados publicados da intranet**;
- o chat interno v1 tera **canais + mensagens diretas**;
- o chat interno v1 sera **quase em tempo real**, com polling curto;
- a arquitetura de informacao atual do Google Sites sera **preservada e limpa**, nao redesenhada do zero no primeiro momento;
- a migracao do conteudo do Google Sites sera **manual**, com curadoria;
- a governanca editorial sera de **Admins + Gestores por secao**;
- o portfolio de profissionais devera reaproveitar o mesmo `professional_id` do painel sempre que existir;
- os dados do painel servirao como carga inicial e fonte compartilhada quando forem pertinentes;
- paginas sensiveis, como valores e portfolio interno, devem ser protegidas por **permissao de pagina**.

---

## 4. Verdades do repositorio atual que devem ser reaproveitadas

Antes de desenhar qualquer estrutura nova, e importante registrar o que ja existe e deve ser aproveitado:

### 4.1 Stack atual do painel

O painel atual ja usa:

- `Next.js 16`
- `React 19`
- `TypeScript`
- `NextAuth`
- `mysql2`
- `@libsql/client` para legado
- `@aws-sdk/client-s3`
- `Tailwind CSS`
- `Prisma` apenas como legado parcial, nao como camada dominante do sistema

### 4.2 Arquitetura atual

O repositorio hoje esta organizado principalmente assim:

```text
frontend/     -> app principal do painel
workers/      -> workers Python e orquestrador
planejamentos/ -> documentacao interna e planejamentos
sql/          -> apoio SQL
```

### 4.3 Componentes e dominios que ja existem e devem ser reutilizados

- autenticacao em `frontend/src/app/api/auth/[...nextauth]/route.ts`
- permissao por matriz em `frontend/src/lib/permissions.ts`
- persistencia de permissoes em `frontend/src/lib/permissions_server.ts`
- abstracao de banco em `frontend/src/lib/db.ts`
- storage S3 em `frontend/src/lib/storage/*`
- sidebar principal em `frontend/src/components/layout/Sidebar.tsx`
- modulo de `POPs e Manuais` em `frontend/src/lib/qms/*`
- modulo de `Profissionais` em `frontend/src/lib/profissionais/*`
- catalogo de procedimentos Feegow em `feegow_procedures_catalog`
- tabela de usuarios `users`
- tabela de permissoes `user_page_permissions`
- tabela de heartbeat e jobs leves `system_status`

### 4.4 Implicacoes praticas

Isso significa que a intranet **nao deve nascer como um projeto desconectado**.

Ela deve reaproveitar:

- a identidade visual base;
- os componentes base de layout quando fizer sentido;
- a base de usuarios e o fluxo de sessao;
- o padrao de permissionamento;
- o provider S3;
- o modulo QMS para documentos oficiais;
- o modulo de profissionais e catalogos para carga inicial e integracao.

---

## 5. Objetivos de produto da nova intranet

O V1 da intranet deve atingir os seguintes objetivos:

- substituir a dependencia do Google Sites;
- centralizar conteudo institucional e operacional em plataforma propria;
- permitir administracao via interface do painel;
- permitir criacao de novas paginas por gestores autorizados;
- exibir conteudo com navegacao lateral organizada e pesquisavel;
- disponibilizar POPs e documentos oficiais de forma padronizada;
- disponibilizar FAQ e noticias recentes;
- disponibilizar portfolio de medicos, procedimentos e valores;
- oferecer um chatbot interno treinado nos documentos e conteudos publicados;
- oferecer um chat interno para comunicacao entre colaboradores;
- controlar acesso por pagina e por grupos de audiencia;
- tornar a intranet um ativo evolutivo da Consultare, nao uma colecao estatica de paginas.

---

## 6. Nao objetivos do V1

Para manter o V1 viavel, os itens abaixo nao sao obrigatorios no primeiro release:

- editor WYSIWYG totalmente livre estilo Google Docs;
- realtime completo por websocket para o chat interno;
- anexos pesados no chat interno;
- reacoes, mencoes e threads profundas no chat;
- analytics avancados de uso da intranet;
- importacao automatica do Google Sites;
- mecanismo de workflow editorial com aprovacao em varias etapas;
- vector database dedicada;
- app mobile nativo.

Esses itens podem entrar em ondas posteriores.

---

## 7. Principios de arquitetura

O desenvolvimento deve obedecer aos principios abaixo:

### 7.1 Separacao de produto, reaproveitamento de plataforma

A intranet sera um **produto separado**, mas em cima da mesma plataforma tecnica.

Na pratica:

- deploy separado;
- app separado;
- layout e navegacao proprios;
- dominio ou subdominio proprio;
- banco e storage compartilhados onde fizer sentido;
- codigo compartilhado para autenticacao, DB, permissoes e componentes base.

### 7.2 Conteudo gerenciado por dados, nao por codigo

Qualquer conteudo rotineiramente alteravel deve estar em banco e ser editavel por interface:

- paginas;
- menus;
- FAQ;
- noticias;
- avisos;
- portfolio;
- paginas novas;
- ordem de navegacao;
- visibilidade por audiencia.

Codigo so deve mudar quando houver:

- novo tipo de bloco;
- nova regra de negocio;
- novo modulo;
- nova integracao;
- novo recurso estrutural.

### 7.3 Controle de acesso server-side sempre

Esconder botao no frontend nao basta.

Toda regra de acesso deve ser validada:

- no carregamento de pagina;
- nas APIs administrativas;
- nas APIs da intranet;
- no chatbot;
- no chat interno;
- nos downloads de arquivos.

### 7.4 Reaproveitar o que ja e oficial

Se um dado ja possui fonte oficial no ecossistema atual, a intranet deve consumir essa fonte, nao criar duplicacao desnecessaria.

Exemplos:

- POPs e manuais devem vir do QMS;
- usuario e senha devem vir de `users`;
- permissoes basicas devem se apoiar em `user_page_permissions`;
- profissionais devem reaproveitar `professional_id`;
- storage de arquivos deve reaproveitar o provider S3.

---

## 8. Arquitetura alvo do monorepo

### 8.1 Estrutura proposta

O monorepo deve evoluir para algo proximo disto:

```text
frontend/                     -> painel gerencial atual
intranet/                     -> nova intranet
packages/core/                -> auth, db, permissions, storage, shared repositories
packages/ui/                  -> componentes compartilhados de layout/base visual
workers/                      -> workers Python, incluindo indexacao de conhecimento
planejamentos/intranet/       -> documentacao da intranet
```

### 8.2 Ajuste necessario no root `package.json`

Hoje o workspace raiz contem apenas:

- `frontend`

Para suportar a intranet de forma limpa, o root deve passar a suportar:

- `frontend`
- `intranet`
- `packages/*`

### 8.3 Regra de compartilhamento de codigo

O alvo e:

- tirar do `frontend` tudo que for realmente compartilhavel;
- mover para `packages/core` o que for infraestrutura e dominio compartilhado;
- mover para `packages/ui` o que for componente visual generico;
- manter no `frontend` somente o que e exclusivo do painel;
- manter no `intranet` somente o que e exclusivo da intranet.

### 8.4 O que deve ir para `packages/core`

Recomendado extrair:

- `db`
- `auth`
- `permissions`
- `permissions_server`
- `storage`
- tipos compartilhados de usuario e sessao
- repositorios compartilhados de leitura
- regras de audience/access control da intranet

### 8.5 O que deve ir para `packages/ui`

Recomendado extrair:

- tokens visuais da marca;
- primitives de sidebar;
- header shells;
- componentes base de cards, empty states e tabelas simples;
- componentes de badge/status reutilizaveis;
- componentes comuns de formulario quando forem realmente compartilhados.

### 8.6 O que nao deve ser extraido cedo demais

Nao vale fazer refatoracao gigante antes de ter necessidade real.

No inicio:

- extraia primeiro `auth`, `db`, `permissions`, `storage`;
- depois extraia componentes visuais base;
- so depois mova dominios mais especificos quando a intranet de fato passar a consumi-los.

---

## 9. Topologia de deploy

### 9.1 Aplicacoes

Serao dois apps web:

- **Painel gerencial**: app administrativo e operacional;
- **Intranet**: app de consumo interno dos colaboradores.

### 9.2 Dominios

Recomendacao:

- painel em um dominio ou subdominio administrativo;
- intranet em um subdominio proprio.

Exemplo conceitual:

- `painel.consultare...`
- `intranet.consultare...`

### 9.3 SSO

O login deve ser compartilhado entre os dois apps.

Para isso:

- ambos devem usar a mesma base `users`;
- ambos devem usar o mesmo `NEXTAUTH_SECRET`;
- ambos devem compartilhar configuracao de cookie de sessao em dominio comum;
- ambos devem usar a mesma logica base de sessao.

### 9.4 Requisito tecnico de SSO

O ideal e que o usuario autenticado no painel possa abrir a intranet sem novo login e vice-versa.

Se o ambiente de deploy nao permitir isso de imediato, o fallback aceito e:

- manter mesma base de usuarios;
- manter mesmas credenciais;
- mas com sessao separada temporariamente.

Mesmo assim, o alvo oficial continua sendo SSO.

---

## 10. Autenticacao e autorizacao

### 10.1 Identidade

A intranet deve usar a mesma tabela `users` do painel.

Campos relevantes ja existentes:

- `id`
- `name`
- `email`
- `password`
- `role`
- `department`
- `status`
- `last_access`

### 10.2 Perfis base

Os perfis atuais continuam valendo:

- `ADMIN`
- `GESTOR`
- `OPERADOR`

### 10.3 Dois niveis de acesso

A intranet deve trabalhar com dois niveis complementares de controle:

1. **Permissao de modulo fixo**
2. **Permissao de audiencia/pagina dinamica**

### 10.4 Permissao de modulo fixo

Esse nivel vale para as areas administrativas da intranet dentro do painel.

Devem ser criados novos `PageKey` no painel para o backoffice da intranet.

Recomendacao minima:

- `intranet_dashboard`
- `intranet_pages`
- `intranet_navigation`
- `intranet_news`
- `intranet_faq`
- `intranet_catalog`
- `intranet_audiences`
- `intranet_chat_admin`
- `intranet_chatbot_admin`

Para cada `PageKey`, manter o mesmo padrao atual:

- `view`
- `edit`
- `refresh`

### 10.5 Permissao de pagina dinamica

Paginas da intranet nao devem virar novos `PageKey` estaticos no codigo.

Para isso, o acesso a paginas dinamicas deve ser controlado por **grupos de audiencia**.

Logica:

- se a pagina publicada nao tiver audiencia vinculada, ela e visivel para qualquer usuario autenticado;
- se tiver uma ou mais audiencias vinculadas, o usuario precisa pertencer a pelo menos uma delas;
- o chatbot so pode usar fontes de conhecimento visiveis para as audiencias do usuario;
- o menu lateral so exibe paginas acessiveis ao usuario.

### 10.6 Grupos de audiencia

Deve existir um modelo de grupos de audiencia para representar recortes como:

- todos os colaboradores;
- recepcao;
- CRC;
- enfermagem;
- gestores;
- unidade especifica;
- combinacoes especiais.

### 10.7 Como montar a audiencia

O V1 deve suportar dois meios de composicao:

- atribuicao manual de usuarios a grupos;
- regras por atributos do usuario.

As regras por atributos podem usar:

- `role`
- `department`
- equipes de `user_teams`

### 10.8 Escopo editorial

A permissao para ver uma pagina nao e a mesma coisa que permissao para edita-la.

Para edicao, deve existir o conceito de **escopo editorial**.

Exemplo:

- gestor de Recepcao edita as paginas e FAQs da Recepcao;
- gestor do CRC edita as paginas e FAQs do CRC;
- admin edita tudo.

### 10.9 Regras de enforcement

As regras abaixo sao obrigatorias:

- API administrativa do painel valida sessao + `PageKey`;
- intranet valida sessao + audiencia de pagina;
- chatbot valida sessao + fontes acessiveis;
- endpoints de download validam acesso ao conteudo origem;
- chat valida participacao em canal ou conversa.

### 10.10 Hardening importante

Ao ampliar o ecossistema de autenticacao para intranet + painel, toda rota administrativa sensivel deve ter validacao server-side explicita e consistente.

Mesmo que hoje haja protecao adicional por proxy/middleware, o guideline oficial deve ser:

- **nao confiar apenas em middleware**
- **validar permissao tambem no handler**

---

## 11. Identidade visual e UX

### 11.1 Diretriz visual

A nova intranet deve parecer parte do ecossistema Consultare, mas nao uma copia literal do painel.

Ela deve:

- manter linguagem visual coerente;
- manter sidebar como estrutura principal;
- usar as mesmas cores-base da marca;
- simplificar a experiencia para consumo de conteudo.

### 11.2 Tokens visuais ja identificados no painel

No componente atual de sidebar, existem cores fortes que podem ser reaproveitadas:

- `#053F74`
- `#043563`
- `#17407E`
- `#3FBD80`

Esses tokens devem ser tratados como ponto de partida.

### 11.3 O que deve mudar em relacao ao painel

A intranet nao deve herdar o aspecto de dashboard operacional.

Ela deve priorizar:

- leitura;
- navegacao;
- busca;
- descoberta de conteudo;
- destaques;
- avisos;
- acesso rapido.

### 11.4 Estrutura visual recomendada

- sidebar lateral fixa e recolhivel;
- topo da area principal com breadcrumb + busca + acesso ao chat + usuario;
- home com blocos de destaque;
- paginas internas com largura de leitura confortavel;
- componentes administrativos separados do app de consumo.

---

## 12. Arquitetura de informacao da intranet

### 12.1 Estrategia geral

O V1 deve preservar a estrutura atual do Google Sites como base, mas limpando:

- nomenclaturas confusas;
- duplicidades;
- grupos mal organizados;
- paginas obsoletas;
- itens que na verdade devem virar blocos dinamicos.

### 12.2 Arvore recomendada para o V1

Arvore base sugerida:

- Home
- Instituicao
- Noticias e Avisos
- FAQ
- IA Consultare
- Servicos
- Processos
- POPs e Manuais
- Portfolio de Profissionais
- Procedimentos e Exames
- Comunicacao Interna
- Comunique-nos

### 12.3 Mapeamento conceitual do legado

#### Instituicao

Entram aqui:

- nossa historia;
- missao, visao e valores;
- organograma;
- unidades;
- horario de funcionamento geral;
- telefones e e-mails importantes;
- feriados;
- aniversariantes do mes.

#### Noticias e Avisos

Entram aqui:

- avisos do dia;
- comunicados gerais;
- noticias internas;
- destaque de homepage;
- banners temporarios.

#### IA Consultare

Esse item passa a ser a pagina do chatbot institucional.

#### Servicos

Entram aqui:

- Resolve Saude;
- consultas;
- procedimentos;
- exames;
- coleta domiciliar;
- informacoes associadas a portfolio e oferta.

#### Processos

Entram aqui:

- Recepcao;
- CRC;
- Enfermagem;
- Planos e convenios;
- comunicacao interna operacional;
- registro de ponto;
- solicitacao de prontuario;
- outras rotinas por area.

#### POPs e Manuais

Deve funcionar como vitrine interna do modulo QMS.

#### Portfolio de Profissionais

Deve mostrar medicos e profissionais publicados.

#### Procedimentos e Exames

Deve mostrar catalogo publicado com descricao, preparo, observacoes e valor.

### 12.4 Paginas de ranking

Itens como:

- Ranking Metas C. S.
- Ranking Metas O. V.
- Ranking Metas Camb.

nao devem travar o V1.

Regra recomendada:

- se houver fonte confiavel e madura no painel para renderizar esses dados, criar blocos especificos;
- se nao houver, modelar como paginas CMS com blocos manuais temporarios;
- se ainda nao fizer sentido operacional, empurrar para onda seguinte.

### 12.5 Home page da intranet

A home do V1 deve ter:

- saudacao ao usuario;
- busca global;
- links rapidos;
- avisos urgentes;
- ultimas noticias;
- FAQ em destaque;
- acessos rapidos para POPs mais usados;
- atalhos para portfolio, procedimentos e exames;
- CTA visivel para o chatbot;
- CTA visivel para o chat interno.

---

## 13. CMS da intranet dentro do painel

### 13.1 Regra central

O painel atual sera o backoffice da intranet.

Nao deve existir area de administracao relevante dentro da intranet de consumo, exceto talvez preferencias pessoais do usuario.

### 13.2 Modulos administrativos recomendados no painel

Criar grupo novo na area administrativa:

- `Intranet`

Submodulos recomendados:

- Dashboard
- Navegacao
- Paginas
- Noticias e Avisos
- FAQ
- Catalogo
- Audiencias
- Escopos Editoriais
- Chat Interno
- Chatbot e Conhecimento

### 13.3 Rotas sugeridas no painel

Sugestao de estrutura em `frontend/src/app/(admin)/intranet/`:

```text
frontend/src/app/(admin)/intranet/dashboard/page.tsx
frontend/src/app/(admin)/intranet/navegacao/page.tsx
frontend/src/app/(admin)/intranet/paginas/page.tsx
frontend/src/app/(admin)/intranet/noticias/page.tsx
frontend/src/app/(admin)/intranet/faq/page.tsx
frontend/src/app/(admin)/intranet/catalogo/page.tsx
frontend/src/app/(admin)/intranet/audiencias/page.tsx
frontend/src/app/(admin)/intranet/escopos/page.tsx
frontend/src/app/(admin)/intranet/chat/page.tsx
frontend/src/app/(admin)/intranet/chatbot/page.tsx
```

### 13.4 APIs administrativas sugeridas

Namespace recomendado:

```text
frontend/src/app/api/admin/intranet/*
```

Exemplos:

- `/api/admin/intranet/navigation`
- `/api/admin/intranet/pages`
- `/api/admin/intranet/pages/[id]`
- `/api/admin/intranet/news`
- `/api/admin/intranet/faq`
- `/api/admin/intranet/audiences`
- `/api/admin/intranet/editorial-scopes`
- `/api/admin/intranet/catalog/professionals`
- `/api/admin/intranet/catalog/procedures`
- `/api/admin/intranet/knowledge/reindex`
- `/api/admin/intranet/chat/conversations`
- `/api/admin/intranet/chat/channels`

### 13.5 Fluxos administrativos que precisam existir

#### Criacao de pagina

- usuario autorizado abre modulo de paginas;
- escolhe titulo, slug, pai, tipo e audiencias;
- escolhe blocos;
- salva em rascunho;
- publica quando estiver pronta.

#### Edicao de pagina

- reabre pagina;
- modifica blocos e metadados;
- salva nova revisao;
- publica novamente sem alterar URL.

#### Criacao de item de menu

- selecionar se o menu aponta para pagina interna ou link externo;
- definir titulo de menu;
- definir ordem;
- definir pai;
- definir icone opcional;
- definir visibilidade.

#### Edicao de noticia ou aviso

- criar titulo, resumo, corpo, destaque, imagem, periodo de publicacao e audiencias;
- publicar;
- aparecer automaticamente na home e nas listas.

#### Edicao de FAQ

- cadastrar categoria;
- cadastrar pergunta;
- cadastrar resposta;
- definir ordem;
- definir pagina de exibicao e audiencias.

---

## 14. Modelo de conteudo

### 14.1 Estrategia

O CMS da intranet deve usar blocos padronizados.

O armazenamento recomendado para o V1 e:

- metadados de pagina em tabela propria;
- conteudo de pagina em revisoes JSON versionadas.

Isso simplifica:

- edicao por blocos;
- versionamento;
- publicacao;
- renderizacao no frontend;
- futura evolucao do construtor.

### 14.2 Tipos de bloco obrigatorios no V1

#### `rich_text`

Uso:

- conteudo institucional;
- explicacoes de processo;
- paginas informativas.

Campos:

- `title`
- `body_html` ou `body_json`
- `toc_enabled`

#### `callout`

Uso:

- alertas;
- avisos;
- destaques.

Campos:

- `variant`
- `title`
- `body`
- `icon`

#### `quick_links`

Uso:

- atalhos na home;
- atalhos em paginas de area.

Campos:

- `title`
- `items[]` com `label`, `url`, `icon`, `description`

#### `faq_list`

Uso:

- renderizar FAQ por categoria.

Campos:

- `title`
- `faq_category_ids[]`
- `show_search`

#### `news_feed`

Uso:

- listar noticias/avisos recentes.

Campos:

- `title`
- `post_type`
- `limit`
- `featured_only`

#### `file_list`

Uso:

- manuais;
- anexos;
- modelos;
- documentos operacionais.

Campos:

- `title`
- `asset_ids[]`
- `display_mode`

#### `table`

Uso:

- contatos;
- horarios;
- regras simples;
- listas estruturadas.

Campos:

- `title`
- `columns[]`
- `rows[]`

#### `contact_cards`

Uso:

- telefones e e-mails importantes;
- unidades;
- suporte interno.

Campos:

- `title`
- `contacts[]` com `name`, `role`, `phone`, `email`, `notes`

#### `professional_catalog`

Uso:

- exibir portfolio de profissionais.

Campos:

- `title`
- `filters_enabled`
- `specialties[]`
- `featured_only`

#### `procedure_catalog`

Uso:

- exibir procedimentos, exames e valores.

Campos:

- `title`
- `filters_enabled`
- `categories[]`
- `show_prices`

#### `qms_documents`

Uso:

- exibir POPs e manuais oficiais.

Campos:

- `title`
- `sector`
- `status_filter`
- `search_enabled`

#### `chatbot_entry`

Uso:

- entrada visual para a IA Consultare.

Campos:

- `title`
- `description`
- `starter_prompts[]`

### 14.3 Estados de publicacao de pagina

Toda pagina deve suportar no minimo:

- `draft`
- `published`
- `archived`

Campos complementares recomendados:

- `published_at`
- `published_by`
- `archived_at`
- `scheduled_start_at`
- `scheduled_end_at`

### 14.4 Slugs e URLs

As paginas devem ter:

- `slug`
- `full_path`

Regra:

- o slug da pagina e unico entre os irmaos;
- `full_path` deve ser materializado para facilitar busca e roteamento;
- mudar o pai de uma pagina deve recalcular `full_path` dos descendentes.

### 14.5 Revisoes

O V1 deve guardar revisoes de pagina.

Nao precisa ter workflow complexo, mas precisa permitir:

- saber quem publicou;
- comparar revisao atual com anterior;
- reverter para revisao anterior se necessario.

---

## 15. Modelo de dados detalhado

As tabelas abaixo formam a espinha dorsal recomendada da intranet.

### 15.1 Conteudo e navegacao

#### `intranet_pages`

Finalidade:

- entidade principal de pagina.

Campos recomendados:

- `id`
- `title`
- `slug`
- `full_path`
- `page_type` (`content`, `landing`, `catalog`, `faq`, `news_index`, `system`)
- `status`
- `parent_page_id`
- `current_revision_id`
- `meta_title`
- `meta_description`
- `icon_name`
- `sort_order`
- `created_by`
- `created_at`
- `updated_by`
- `updated_at`
- `published_at`
- `published_by`
- `archived_at`

#### `intranet_page_revisions`

Finalidade:

- versionar o conteudo da pagina.

Campos recomendados:

- `id`
- `page_id`
- `revision_number`
- `content_json`
- `change_summary`
- `is_published`
- `created_by`
- `created_at`

#### `intranet_navigation_nodes`

Finalidade:

- controlar menu lateral, hierarquia e itens externos.

Campos recomendados:

- `id`
- `parent_node_id`
- `node_type` (`page`, `external_link`, `label`)
- `page_id`
- `label`
- `url`
- `icon_name`
- `sort_order`
- `is_visible`
- `audience_mode` (`inherit`, `custom`)
- `created_by`
- `created_at`
- `updated_by`
- `updated_at`

#### `intranet_assets`

Finalidade:

- registro de arquivos e imagens do CMS.

Campos recomendados:

- `id`
- `entity_type`
- `entity_id`
- `storage_provider`
- `storage_bucket`
- `storage_key`
- `original_name`
- `mime_type`
- `size_bytes`
- `uploaded_by`
- `created_at`

### 15.2 Audiencias e governanca

#### `intranet_audience_groups`

Finalidade:

- grupos de visibilidade da intranet.

Campos recomendados:

- `id`
- `name`
- `description`
- `is_active`
- `created_by`
- `created_at`
- `updated_by`
- `updated_at`

#### `intranet_audience_group_rules`

Finalidade:

- regras automaticas de composicao de audiencia.

Campos recomendados:

- `id`
- `audience_group_id`
- `rule_type` (`role`, `department`, `team`)
- `rule_value`
- `is_active`
- `created_at`

#### `intranet_user_audience_assignments`

Finalidade:

- atribuicao manual de usuarios a audiencias.

Campos recomendados:

- `id`
- `user_id`
- `audience_group_id`
- `assigned_by`
- `created_at`

#### `intranet_page_audiences`

Finalidade:

- vincular paginas a grupos de audiencia.

Campos recomendados:

- `id`
- `page_id`
- `audience_group_id`
- `created_at`

#### `intranet_editorial_scopes`

Finalidade:

- definir areas editaveis por gestores.

Campos recomendados:

- `id`
- `name`
- `description`
- `scope_type` (`section`, `catalog`, `faq`, `news`, `global`)
- `scope_ref`
- `is_active`
- `created_at`
- `updated_at`

#### `intranet_editorial_scope_assignments`

Finalidade:

- vincular usuarios a escopos editoriais.

Campos recomendados:

- `id`
- `user_id`
- `editorial_scope_id`
- `assigned_by`
- `created_at`

### 15.3 Noticias, avisos e FAQ

#### `intranet_news_posts`

Finalidade:

- noticias e avisos.

Campos recomendados:

- `id`
- `post_type` (`news`, `notice`, `banner`)
- `title`
- `slug`
- `summary`
- `body_json`
- `cover_asset_id`
- `is_featured`
- `status`
- `publish_start_at`
- `publish_end_at`
- `created_by`
- `created_at`
- `updated_by`
- `updated_at`
- `published_at`

#### `intranet_news_post_audiences`

Campos:

- `id`
- `post_id`
- `audience_group_id`
- `created_at`

#### `intranet_faq_categories`

Campos:

- `id`
- `name`
- `slug`
- `description`
- `sort_order`
- `is_active`
- `created_at`
- `updated_at`

#### `intranet_faq_items`

Campos:

- `id`
- `category_id`
- `question`
- `answer_json`
- `sort_order`
- `is_active`
- `created_by`
- `created_at`
- `updated_by`
- `updated_at`

#### `intranet_faq_item_audiences`

Campos:

- `id`
- `faq_item_id`
- `audience_group_id`
- `created_at`

### 15.4 Catalogo de profissionais e procedimentos

#### `intranet_professional_profiles`

Finalidade:

- extensao editorial de `professionals` para a intranet.

Chave principal:

- usar o mesmo `professional_id` do modulo de profissionais.

Campos recomendados:

- `professional_id`
- `slug`
- `display_name`
- `short_bio`
- `long_bio`
- `photo_asset_id`
- `card_highlight`
- `service_units_override_json`
- `specialties_override_json`
- `contact_notes`
- `display_order`
- `is_featured`
- `is_published`
- `published_at`
- `updated_by`
- `updated_at`

#### `intranet_procedure_profiles`

Finalidade:

- extensao editorial do catalogo de procedimentos.

Chave principal:

- usar `procedimento_id` do catalogo base quando existir.

Campos recomendados:

- `procedimento_id`
- `slug`
- `display_name`
- `category`
- `subcategory`
- `summary`
- `description`
- `preparation_instructions`
- `contraindications`
- `estimated_duration_text`
- `recovery_notes`
- `show_price`
- `published_price`
- `is_featured`
- `is_published`
- `display_order`
- `updated_by`
- `updated_at`

#### `intranet_professional_procedures`

Finalidade:

- relacao explicita entre profissionais publicados e procedimentos publicados na intranet.

Importante:

- **nao usar diretamente `professional_procedure_rates.valor_profissional` como preco publicado**
- o valor publicado deve vir do catalogo base (`feegow_procedures_catalog.valor`) ou de override em `intranet_procedure_profiles.published_price`

Campos recomendados:

- `id`
- `professional_id`
- `procedimento_id`
- `notes`
- `display_order`
- `is_published`
- `created_at`
- `updated_at`

### Regra de integracao do catalogo

O fluxo recomendado e:

- usar dados do painel para carga inicial;
- manter o `professional_id` do painel como ID canonico;
- permitir que a intranet tenha campos editoriais proprios sem contaminar o modulo operacional;
- manter tabela propria para relacao de portfolio publicado;
- permitir override de preco publicado e descricao sem alterar o catalogo operacional.

### 15.5 Busca e conhecimento

#### `intranet_search_documents`

Finalidade:

- indice denormalizado para busca global.

Campos recomendados:

- `id`
- `entity_type`
- `entity_id`
- `title`
- `summary`
- `search_text`
- `url`
- `visibility_mode`
- `visibility_ref_json`
- `updated_at`

Recomendacao:

- criar `FULLTEXT INDEX` em `title`, `summary`, `search_text` no MySQL.

#### `intranet_knowledge_sources`

Finalidade:

- registrar cada fonte de conhecimento indexavel.

Campos recomendados:

- `id`
- `source_type` (`page`, `news`, `faq`, `qms_document`, `professional`, `procedure`, `asset_file`)
- `source_entity_id`
- `source_revision_ref`
- `title`
- `canonical_url`
- `status` (`pending`, `indexed`, `stale`, `failed`, `archived`)
- `visibility_ref_json`
- `last_indexed_at`
- `last_error`
- `updated_at`

#### `intranet_knowledge_chunks`

Finalidade:

- armazenar chunks de texto com embedding.

Campos recomendados:

- `id`
- `knowledge_source_id`
- `chunk_index`
- `chunk_text`
- `chunk_hash`
- `embedding_model`
- `embedding_json`
- `token_count`
- `visibility_ref_json`
- `created_at`

#### `intranet_knowledge_jobs`

Finalidade:

- fila de indexacao/reindexacao.

Campos recomendados:

- `id`
- `knowledge_source_id`
- `job_type` (`index`, `reindex`, `delete`)
- `status` (`pending`, `running`, `completed`, `failed`)
- `requested_by`
- `started_at`
- `finished_at`
- `error_message`
- `created_at`

### 15.6 Chat interno

#### `intranet_chat_conversations`

Finalidade:

- conversa unica para canais e DMs.

Campos recomendados:

- `id`
- `conversation_type` (`channel`, `dm`)
- `name`
- `slug`
- `description`
- `is_active`
- `is_announcement_only`
- `created_by`
- `created_at`
- `updated_at`

#### `intranet_chat_conversation_audiences`

Finalidade:

- restringir canais por audiencia quando necessario.

Campos:

- `id`
- `conversation_id`
- `audience_group_id`
- `created_at`

#### `intranet_chat_conversation_members`

Finalidade:

- membros de canal ou DM.

Campos:

- `id`
- `conversation_id`
- `user_id`
- `member_role` (`owner`, `moderator`, `member`)
- `last_read_message_id`
- `last_read_at`
- `is_muted`
- `created_at`

#### `intranet_chat_messages`

Finalidade:

- mensagens do chat.

Campos:

- `id`
- `conversation_id`
- `sender_user_id`
- `body`
- `message_type` (`text`, `system`)
- `is_edited`
- `edited_at`
- `is_deleted`
- `deleted_at`
- `created_at`

#### `intranet_chat_moderation_log`

Finalidade:

- trilha de moderacao.

Campos:

- `id`
- `conversation_id`
- `message_id`
- `action`
- `actor_user_id`
- `payload_json`
- `created_at`

---

## 16. App da intranet

### 16.1 Estrutura de rotas sugerida

Sugestao inicial em `intranet/src/app/`:

```text
intranet/src/app/(auth)/login/page.tsx
intranet/src/app/(site)/layout.tsx
intranet/src/app/(site)/page.tsx
intranet/src/app/(site)/busca/page.tsx
intranet/src/app/(site)/chat/page.tsx
intranet/src/app/(site)/ia/page.tsx
intranet/src/app/(site)/[[...slug]]/page.tsx
intranet/src/app/api/chat/conversations/route.ts
intranet/src/app/api/chat/messages/route.ts
intranet/src/app/api/chatbot/route.ts
intranet/src/app/api/search/route.ts
```

### 16.2 Regra de roteamento

O app da intranet deve resolver paginas dinamicas a partir de `full_path`.

Fluxo esperado:

- request chega no catch-all `[[...slug]]`;
- resolver `full_path`;
- carregar pagina publicada;
- validar audiencia;
- renderizar blocos.

### 16.3 Regra importante de acoplamento

O app `intranet` **nao deve depender de HTTP para consumir o `frontend`**.

O consumo deve ser por:

- pacote compartilhado;
- repositorios compartilhados;
- acesso ao mesmo banco.

Isso reduz:

- latencia;
- acoplamento entre apps;
- duplicacao de contratos HTTP internos;
- risco de dependencia circular entre painel e intranet.

---

## 17. Integracao com QMS

### 17.1 Fonte oficial

POPs e manuais devem usar como fonte oficial o modulo ja existente de QMS.

Isso significa aproveitar:

- `qms_documents`
- `qms_document_versions`
- `qms_document_files`

### 17.2 O que a intranet deve fazer com isso

A intranet deve:

- listar documentos publicados/relevantes;
- permitir busca;
- permitir filtro por setor;
- abrir detalhe do documento;
- baixar ou visualizar o arquivo;
- respeitar audiencia/pagina.

### 17.3 O que nao deve fazer

A intranet nao deve se tornar a nova origem de cadastro do QMS.

A origem continua no painel.

### 17.4 Curadoria editorial

Quando necessario, o painel deve permitir marcar documentos QMS como:

- visiveis na intranet;
- ocultos da intranet;
- destacados;
- vinculados a paginas especificas.

Se isso nao existir ainda no QMS, criar tabela de extensao, por exemplo:

- `intranet_qms_document_settings`

Campos sugeridos:

- `document_id`
- `is_visible`
- `is_featured`
- `default_page_id`
- `display_order`
- `updated_by`
- `updated_at`

---

## 18. Integracao com profissionais e procedimentos

### 18.1 Origem dos profissionais

Origem base:

- modulo `Profissionais`
- tabela `professionals`

### 18.2 Origem dos procedimentos

Origem base:

- `feegow_procedures_catalog`

### 18.3 O que a intranet deve mostrar

Para profissionais:

- nome;
- foto;
- especialidades;
- unidades de atendimento;
- bio curta;
- bio detalhada;
- procedimentos associados;
- observacoes importantes;
- destaques internos.

Para procedimentos:

- nome;
- categoria;
- descricao;
- preparo;
- observacoes;
- duracao estimada;
- valor publicado;
- profissionais relacionados.

### 18.4 Regra de valores

Para evitar erro conceitual:

- o preco publicado da intranet nao deve sair de `professional_procedure_rates.valor_profissional`;
- `valor_profissional` e valor interno/contratual do profissional;
- o valor publicado deve usar:
  - `feegow_procedures_catalog.valor` como base;
  - `intranet_procedure_profiles.published_price` como override opcional.

### 18.5 Fluxo recomendado do catalogo

1. fazer carga inicial a partir do painel e catalogo Feegow;
2. criar perfis editoriais proprios da intranet;
3. permitir publicar/ocultar profissionais e procedimentos;
4. permitir complementar descricao e metadados sem alterar o modulo operacional;
5. manter `professional_id` como chave canonica de profissional.

---

## 19. Chatbot institucional

### 19.1 Objetivo do chatbot

O chatbot da intranet deve responder duvidas internas dos colaboradores com base em conteudo oficial publicado.

Escopo do V1:

- paginas da intranet;
- FAQ;
- noticias e avisos;
- POPs e manuais do QMS publicados;
- portfolio publicado de profissionais;
- catalogo publicado de procedimentos e exames.

### 19.2 O que o chatbot nao deve consultar no V1

- dados operacionais sensiveis do painel;
- dados financeiros do painel;
- dados de RH;
- dados que nao estejam explicitamente publicados para a audiencia do usuario.

### 19.3 Arquitetura recomendada do chatbot

Fluxo:

1. painel/intranet publica ou atualiza conteudo;
2. fonte gera item em `intranet_knowledge_sources`;
3. job de indexacao gera chunks;
4. embeddings sao salvos em `intranet_knowledge_chunks`;
5. usuario faz pergunta;
6. sistema recupera chunks permitidos para aquele usuario;
7. sistema envia pergunta + contexto recuperado para a OpenAI;
8. resposta volta com citacao de fontes.

### 19.4 Estrategia de embeddings

Para o V1, a estrategia recomendada e:

- armazenar embeddings em MySQL em `embedding_json`;
- fazer retrieval em aplicacao;
- limitar o corpus a conteudo publicado da intranet;
- reavaliar somente se o volume crescer a ponto de exigir vector DB dedicada.

Motivo:

- menor complexidade inicial;
- menor dependencia infra;
- corpus esperado da intranet e administravel no V1;
- permite respeitar visibilidade por usuario com mais controle.

### 19.5 Modelo OpenAI

Regra de implementacao:

- nao hardcode de modelo de chat em codigo;
- nao hardcode de modelo de embedding em codigo;
- ler ambos via variaveis de ambiente.

Sugestao:

- `OPENAI_API_KEY`
- `OPENAI_CHAT_MODEL`
- `OPENAI_EMBEDDING_MODEL`

### 19.6 Chunking

Padrao recomendado:

- chunks pequenos o bastante para recuperar contexto relevante;
- com sobreposicao controlada.

Configuracao inicial sugerida:

- `chunk_target_tokens`: entre 800 e 1200
- `chunk_overlap_tokens`: entre 120 e 180

### 19.7 Formatos suportados para indexacao

No V1, suportar:

- paginas CMS;
- FAQ;
- noticias;
- markdown;
- txt;
- pdf;
- docx

### 19.8 Worker de conhecimento

Recomendacao:

- criar worker dedicado em `workers/worker_intranet_knowledge.py`

Responsabilidades:

- consumir `intranet_knowledge_jobs`;
- baixar arquivos no S3 quando necessario;
- extrair texto;
- gerar chunks;
- chamar OpenAI para embeddings;
- gravar `intranet_knowledge_chunks`;
- atualizar status da fonte;
- atualizar `system_status` com heartbeat, por exemplo:
  - `intranet_knowledge_index`

### 19.9 Regras obrigatorias de seguranca

O chatbot deve:

- recusar resposta baseada em fonte inacessivel ao usuario;
- retornar fontes usadas;
- registrar pergunta e resposta para auditoria;
- permitir desligar fontes especificas da indexacao;
- evitar usar documento arquivado ou pagina nao publicada.

### 19.10 Tabelas adicionais recomendadas

#### `intranet_chatbot_sessions`

- `id`
- `user_id`
- `started_at`
- `updated_at`

#### `intranet_chatbot_messages`

- `id`
- `session_id`
- `role` (`user`, `assistant`, `system`)
- `content`
- `sources_json`
- `created_at`

---

## 20. Chat interno

### 20.1 Objetivo

O chat interno deve resolver comunicacao basica entre colaboradores dentro do ecossistema da intranet.

### 20.2 Escopo do V1

- canais;
- mensagens diretas;
- lista de conversas;
- unread count;
- polling quase em tempo real;
- moderacao basica;
- canais restritos por audiencia.

### 20.3 Tipos de conversa

O V1 deve suportar:

- `channel`
- `dm`

#### Canais

Exemplos:

- Recepcao
- CRC
- Enfermagem
- Gestores
- Unidade X
- Comunicados

#### DM

Conversa privada entre dois usuarios.

### 20.4 Regras de funcionamento

- um canal pode ser aberto a todos ou restrito a audiencia;
- um canal pode ser `announcement_only`;
- DMs sao criadas automaticamente quando necessario;
- DMs devem ser unicas por par de usuarios;
- usuario so ve canais e DMs dos quais participa.

### 20.5 Quase realtime

O V1 deve usar polling curto.

Configuracao inicial sugerida:

- polling de lista de conversas: 10 a 15 segundos
- polling da conversa aberta: 3 a 5 segundos
- consulta incremental por `after_message_id` ou `after_created_at`

### 20.6 APIs sugeridas

- `GET /api/chat/conversations`
- `POST /api/chat/conversations/dm`
- `GET /api/chat/conversations/[id]/messages`
- `POST /api/chat/conversations/[id]/messages`
- `POST /api/chat/conversations/[id]/read`
- `POST /api/chat/channels`
- `PATCH /api/chat/channels/[id]`

### 20.7 Moderacao

O V1 deve permitir:

- remover mensagem;
- desativar canal;
- limitar postagem a moderadores em canais de comunicados;
- registrar log de moderacao.

### 20.8 O que fica para depois

- anexos complexos;
- reactions;
- mentions;
- threads;
- websocket;
- busca profunda no historico.

---

## 21. Busca global

### 21.1 Objetivo

A intranet precisa de busca global para evitar navegacao excessiva em arvores profundas.

### 21.2 Fontes da busca

No V1, a busca deve cobrir:

- paginas publicadas;
- FAQ;
- noticias;
- avisos;
- POPs/manuais publicados;
- profissionais publicados;
- procedimentos publicados.

### 21.3 Estrategia tecnica

Usar `intranet_search_documents` como indice denormalizado.

Motivos:

- simplifica busca cross-entity;
- evita fazer uniao complexa entre varias tabelas a cada consulta;
- facilita filtro por tipo;
- facilita aplicar `FULLTEXT`.

### 21.4 Atualizacao do indice

Regra:

- atualizar indice de busca no momento da publicacao ou alteracao relevante;
- remover ou marcar invisivel quando conteudo sair de publicacao;
- incluir snapshot de visibilidade no indice.

### 21.5 Regras de acesso

Mesmo que o item exista no indice:

- ele so pode aparecer no resultado se o usuario tiver acesso.

---

## 22. Estrategia de migracao do Google Sites

### 22.1 Metodo escolhido

A migracao sera **manual**, com curadoria editorial.

### 22.2 Motivo

Isso evita:

- importar HTML ruim do Google Sites;
- carregar paginas obsoletas ou mal estruturadas;
- perder controle de audiencias;
- perpetuar inconsistencias de conteudo.

### 22.3 Processo recomendado

Criar uma matriz de migracao com colunas:

- pagina atual;
- URL atual;
- nova secao;
- nova URL;
- tipo de conteudo;
- owner;
- prioridade;
- status de migracao;
- observacoes.

### 22.4 Regra por tipo de conteudo

- conteudo institucional -> pagina CMS
- FAQ -> FAQ estruturado
- aviso/novidade -> noticia/aviso estruturado
- documento oficial -> QMS + pagina/bloco de vitrine
- catalogo -> modulo de portfolio/procedimentos
- pagina operacional simples -> pagina CMS

### 22.5 Congelamento editorial

Antes do go-live, definir uma janela de congelamento do Google Sites para evitar divergencia entre velho e novo.

---

## 23. Ordem sugerida de desenvolvimento

### Fase 0 - Fundacao tecnica

Objetivo:

- preparar repositorio, shared code e permissoes base.

Entregas:

- adicionar workspace `intranet`;
- criar `packages/core`;
- extrair `auth`, `db`, `storage`, `permissions`;
- definir cookie/sessao compartilhada;
- criar novos `PageKey` do backoffice da intranet;
- adicionar grupo `Intranet` na sidebar do painel.

### Fase 1 - Modelo de dados e APIs administrativas

Objetivo:

- colocar de pe a base do CMS e da governanca.

Entregas:

- tabelas de paginas, revisoes, navegacao, assets;
- tabelas de audiencias;
- tabelas de escopos editoriais;
- CRUD de paginas;
- CRUD de navegacao;
- CRUD de FAQ;
- CRUD de noticias;
- upload de assets.

### Fase 2 - App da intranet e renderizacao de paginas

Objetivo:

- ter a intranet navegavel e consumindo conteudo real.

Entregas:

- app `intranet` inicial;
- login;
- shell com sidebar;
- home page;
- catch-all de paginas;
- renderer de blocos;
- busca inicial.

### Fase 3 - Integracoes de conteudo

Objetivo:

- conectar fontes oficiais e catalogos.

Entregas:

- integracao QMS;
- integracao profissionais;
- integracao procedimentos;
- tabelas editoriais de extensao;
- blocos de catalogo;
- pagina IA Consultare.

### Fase 4 - Chatbot

Objetivo:

- disponibilizar IA institucional.

Entregas:

- tabelas de fontes/chunks/jobs;
- worker de conhecimento;
- endpoint de pergunta;
- citacao de fontes;
- auditoria de conversa.

### Fase 5 - Chat interno

Objetivo:

- habilitar comunicacao basica entre colaboradores.

Entregas:

- tabelas de conversa e mensagem;
- canais;
- DMs;
- unread count;
- polling;
- moderacao basica.

### Fase 6 - Migracao e QA

Objetivo:

- migrar conteudo prioritario e estabilizar.

Entregas:

- matriz de migracao;
- conteudo institucional prioritario;
- FAQ;
- avisos;
- POPs prioritarios;
- catalogo publicado;
- homologacao funcional;
- treinamento interno.

---

## 24. Testes

### 24.1 Testes de backend

Validar:

- autorizacao de APIs administrativas;
- audience resolution;
- acesso a pagina por usuario;
- CRUD de paginas;
- versionamento;
- indexacao de busca;
- indexacao de conhecimento;
- retrieval filtrado por audiencia;
- chat e unread count.

### 24.2 Testes de frontend

Validar:

- renderizacao da sidebar;
- home page;
- renderer dos blocos;
- busca;
- fluxo de login;
- fluxo de chat;
- comportamento responsivo;
- estados vazios e mensagens de erro.

### 24.3 Testes de integracao

Validar:

- intranet lendo usuarios do painel;
- SSO entre apps;
- intranet lendo QMS;
- intranet lendo profissionais;
- intranet lendo catalogo de procedimentos;
- downloads de arquivos protegidos.

### 24.4 Testes de seguranca

Validar:

- usuario sem permissao nao ve pagina restrita;
- usuario sem permissao nao recebe resultado restrito na busca;
- chatbot nao cita fonte inacessivel;
- usuario nao entra em canal restrito;
- download de documento exige sessao valida e acesso.

### 24.5 Testes de aceitacao do V1

O V1 so deve ser considerado pronto quando:

- a intranet estiver navegavel com sidebar e busca;
- gestores autorizados conseguirem editar conteudo sem codigo;
- novas paginas puderem ser criadas por interface;
- o catalogo estiver publicado com dados reaproveitados do painel;
- POPs/manuais estiverem acessiveis a partir do QMS;
- o chatbot responder com fonte;
- o chat interno funcionar com canais e DM;
- o controle por pagina/audiencia estiver operacional.

---

## 25. Variaveis de ambiente e infraestrutura

### 25.1 Reaproveitadas do ecossistema atual

- `NEXTAUTH_SECRET`
- `NEXTAUTH_URL`
- `MYSQL_URL`
- `MYSQL_PUBLIC_URL`
- `DB_PROVIDER`
- `AWS_REGION`
- `AWS_S3_BUCKET`
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_S3_PREFIX`

### 25.2 Novas variaveis recomendadas para a intranet

- `INTRANET_BASE_URL`
- `INTRANET_SESSION_COOKIE_DOMAIN`
- `INTRANET_S3_PREFIX`
- `OPENAI_API_KEY`
- `OPENAI_CHAT_MODEL`
- `OPENAI_EMBEDDING_MODEL`
- `INTRANET_CHAT_POLL_MS`
- `INTRANET_CHAT_OPEN_POLL_MS`
- `INTRANET_KNOWLEDGE_CHUNK_TARGET_TOKENS`
- `INTRANET_KNOWLEDGE_CHUNK_OVERLAP_TOKENS`

### 25.3 Prefixos recomendados no S3

- `intranet/pages/`
- `intranet/news/`
- `intranet/faq/`
- `intranet/catalog/`
- `intranet/chat/`
- `intranet/knowledge/`

---

## 26. Riscos e mitigacoes

### 26.1 Risco: excesso de acoplamento entre painel e intranet

Mitigacao:

- compartilhar codigo via pacote;
- nao fazer chamadas HTTP internas desnecessarias;
- manter contrato de dados claro.

### 26.2 Risco: duplicacao de cadastro com o painel

Mitigacao:

- usar `professional_id` canonico;
- criar tabelas de extensao editorial, nao clones.

### 26.3 Risco: permissao inconsistente entre menu, busca e chatbot

Mitigacao:

- implementar um servico unico de resolucao de acesso;
- reutilizar a mesma funcao em todos os pontos.

### 26.4 Risco: migracao de conteudo virar retrabalho

Mitigacao:

- usar matriz de migracao;
- definir owners por secao;
- migrar primeiro paginas prioritarias.

### 26.5 Risco: chatbot responder conteudo errado ou sensivel

Mitigacao:

- limitar fontes do V1;
- citar fontes;
- aplicar audiencia no retrieval;
- permitir desindexar rapidamente qualquer fonte.

### 26.6 Risco: realtime do chat elevar demais a complexidade

Mitigacao:

- usar polling curto no V1;
- avaliar websocket so apos validar uso real.

---

## 27. Definicao de pronto por modulo

### 27.1 Pronto de CMS

- pagina pode ser criada, editada, revisada e publicada;
- menu pode ser ordenado e reestruturado;
- audiencias podem ser vinculadas;
- gestor sem escopo nao consegue editar.

### 27.2 Pronto de intranet web

- login funciona;
- sidebar funciona;
- paginas dinamicas funcionam;
- home funciona;
- busca funciona;
- pagina restrita respeita acesso.

### 27.3 Pronto de catalogo

- profissionais publicados aparecem;
- procedimentos publicados aparecem;
- relacao profissional x procedimento aparece;
- valor publicado vem da fonte correta;
- campos editoriais funcionam.

### 27.4 Pronto de QMS

- POPs/manuais aparecem na intranet;
- filtro e busca funcionam;
- download funciona;
- acesso restrito funciona.

### 27.5 Pronto de chatbot

- indexacao conclui com status;
- perguntas respondem com fonte;
- conteudo inacessivel nao entra na resposta;
- conversa fica auditavel.

### 27.6 Pronto de chat interno

- canais funcionam;
- DMs funcionam;
- unread count funciona;
- polling funciona;
- moderacao basica funciona.

---

## 28. Recomendacoes finais de implementacao

### 28.1 Nao tentar fazer tudo no primeiro PR

O desenvolvimento deve ser dividido em camadas e entregas pequenas.

### 28.2 Nao misturar editoria com dominio operacional

Se um dado e editorial da intranet, ele deve ir para tabela de extensao da intranet.

### 28.3 Nao depender de codigo para conteudo

Paginas, menu, FAQ, noticias e portfolio devem ser dados.

### 28.4 Nao abrir mao de versionamento

Conteudo institucional e operacional precisa de historico.

### 28.5 Nao abrir mao de permissoes server-side

Esse ponto e especialmente importante para:

- valores;
- portfolio interno;
- chatbot;
- arquivos;
- comunicacao interna.

---

## 29. Resumo executivo final

A nova intranet deve nascer como um **produto separado**, mas sustentado pela mesma plataforma tecnica do painel atual.

Ela deve:

- usar a mesma stack;
- usar os mesmos usuarios;
- usar SSO;
- usar o mesmo banco e o mesmo storage quando fizer sentido;
- reaproveitar modulos oficiais ja existentes;
- ser administrada inteiramente pelo painel;
- permitir criacao de paginas e menu por interface;
- proteger conteudo por audiencia;
- oferecer chatbot e chat interno;
- substituir o Google Sites sem virar uma copia fragil dele.

Se implementada dessa forma, a intranet passa a ser:

- escalavel;
- governavel;
- auditavel;
- segura;
- evolutiva;
- e alinhada ao ecossistema real da Consultare.
