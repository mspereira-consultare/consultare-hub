# Matriz de Permissões

Este documento descreve o controle de acesso atual do sistema:

- nível por página;
- ações `view`, `edit`, `refresh`;
- defaults por perfil (`ADMIN`, `GESTOR`, `OPERADOR`);
- persistência e resolução em runtime.

## Modelo

### Ações suportadas

- `view`: usuário pode visualizar a página e consumir dados relacionados.
- `edit`: usuário pode salvar alterações (formularios, CRUD, campos manuais).
- `refresh`: usuário pode solicitar atualização manual de workers.


### Páginas controladas (`PageKey`)

| PageKey | Rota |
|---|---|
| `dashboard` | `/dashboard` |
| `monitor` | `/monitor` |
| `financeiro` | `/financeiro` |
| `agendamentos` | `/agendamentos` |
| `contratos` | `/contratos` |
| `propostas` | `/propostas` |
| `propostas_gerencial` | `/propostas/gerencial` |
| `metas_dashboard` | `/metas/dashboard` |
| `metas` | `/metas` |
| `produtividade` | `/produtividade` |
| `checklist_crc` | `/checklist-crc` |
| `checklist_recepcao` | `/checklist-recepcao` |
| `colaboradores` | `/colaboradores` |
| `folha_pagamento` | `/folha-pagamento` |
| `recrutamento` | `/recrutamento` |
| `users` | `/users` |
| `contract_templates` | `/modelos-contrato` |
| `settings` | `/settings` |

Fonte: `frontend/src/lib/permissions.ts`.

## Defaults por Perfil


### ADMIN

- Todas as páginas com `view=true`, `edit=true`, `refresh=true` (incluindo `agendamentos`).


### GESTOR

| PageKey | View | Edit | Refresh |
|---|---:|---:|---:|
| dashboard | ✅ | ❌ | ❌ |
| monitor | ✅ | ✅ | ✅ |
| financeiro | ✅ | ✅ | ✅ |
| agendamentos | ✅ | ✅ | ✅ |
| contratos | ✅ | ✅ | ✅ |
| propostas | ✅ | ✅ | ✅ |
| propostas_gerencial | ✅ | ❌ | ✅ |
| metas_dashboard | ✅ | ❌ | ❌ |
| metas | ✅ | ✅ | ❌ |
| produtividade | ✅ | ✅ | ✅ |
| checklist_crc | ✅ | ✅ | ✅ |
| checklist_recepcao | ✅ | ✅ | ✅ |
| users | ❌ | ❌ | ❌ |
| contract_templates | nao | nao | nao |
| settings | ❌ | ❌ | ❌ |


### OPERADOR

| PageKey | View | Edit | Refresh |
|---|---:|---:|---:|
| dashboard | ✅ | ❌ | ❌ |
| monitor | ✅ | ❌ | ✅ |
| financeiro | ❌ | ❌ | ❌ |
| agendamentos | ✅ | ❌ | ❌ |
| contratos | ❌ | ❌ | ❌ |
| propostas | ✅ | ✅ | ❌ |
| propostas_gerencial | ❌ | ❌ | ❌ |
| metas_dashboard | ✅ | ❌ | ❌ |
| metas | ❌ | ❌ | ❌ |
| produtividade | ✅ | ❌ | ✅ |
| checklist_crc | ✅ | ✅ | ✅ |
| checklist_recepcao | ✅ | ✅ | ✅ |
| users | ❌ | ❌ | ❌ |
| contract_templates | nao | nao | nao |
| settings | ❌ | ❌ | ❌ |

| PageKey | View | Edit | Refresh |
|---|---:|---:|---:|
| dashboard | ✅ | ❌ | ❌ |
| monitor | ✅ | ❌ | ✅ |
| financeiro | ❌ | ❌ | ❌ |
| contratos | ❌ | ❌ | ❌ |
| propostas | ✅ | ✅ | ❌ |
| propostas_gerencial | ❌ | ❌ | ❌ |
| metas_dashboard | ✅ | ❌ | ❌ |
| metas | ❌ | ❌ | ❌ |
| produtividade | ✅ | ❌ | ✅ |
| checklist_crc | ✅ | ✅ | ✅ |
| checklist_recepcao | ✅ | ✅ | ✅ |
| users | ❌ | ❌ | ❌ |
| contract_templates | nao | nao | nao |
| settings | ❌ | ❌ | ❌ |

## Persistência no Banco

Tabela: `user_page_permissions`

| Coluna | Tipo lógico | Descrição |
|---|---|---|
| `user_id` | chave | usuário |
| `page_key` | chave | página |
| `can_view` | flag | ação `view` |
| `can_edit` | flag | ação `edit` |
| `can_refresh` | flag | ação `refresh` |
| `updated_at` | timestamp | auditoria básica |

Operações implementadas em `frontend/src/lib/permissions_server.ts`:

- `ensurePermissionTable`
- `seedPermissionDefaults`
- `loadUserPermissionMatrix`
- `saveUserPermissionMatrix`

## Fluxo de Resolução de Permissão

1. Usuário autentica em `next-auth`.
2. Backend carrega matriz persistida via `getUserPermissions`.
3. Sessão JWT recebe `permissions`.
4. Frontend usa `hasPermission()` para:
   - renderizar menu (`Sidebar`);
   - habilitar/desabilitar botões e formulários;
   - decidir acesso a refresh manual.
5. APIs sensíveis validam permissão server-side antes de executar.

## APIs protegidas por permissão

| API | PageKey | Ação validada |
|---|---|---|
| `/api/admin/users/permissions` | `users` | `view`/`edit` |
| `/api/admin/checklist/crc` | `checklist_crc` | `view`/`edit` |
| `/api/admin/checklist/recepcao` | `checklist_recepcao` | `view`/`edit` |
| `/api/admin/financial/general-report` | `financeiro` | `view` |
| `/api/admin/profissionais/:id/documentos` | `profissionais` | `view`/`edit` |
| `/api/admin/profissionais/documentos/:documentId/download` | `profissionais` | `view` |
| `/api/admin/profissionais/documentos/:documentId` | `profissionais` | `edit` |
| `/api/admin/profissionais/:id/procedimentos` | `profissionais` | `view`/`edit` |
| `/api/admin/profissionais/procedures/options` | `profissionais` | `view` |
| `/api/admin/profissionais/:id/contratos` | `profissionais` | `view`/`edit` |
| `/api/admin/profissionais/:id/contratos/:contractId/reprocess` | `profissionais` | `edit` |
| `/api/admin/profissionais/:id/contratos/:contractId/download` | `profissionais` | `view` |
| `/api/admin/colaboradores*` | `colaboradores` | `view`/`edit` |
| `/api/admin/folha-pagamento*` | `folha_pagamento` | `view`/`edit` |
| `/api/admin/recrutamento*` | `recrutamento` | `view`/`edit` |
| `/api/admin/contract-templates/:id/download` | `contract_templates` | `view` |
| `/api/admin/refresh` | mapeado por serviço | `refresh` da página correspondente |

## Mapeamento serviço -> permissão de refresh

Em `frontend/src/app/api/admin/refresh/route.ts`:

| Serviço normalizado | PageKey exigido |
|---|---|
| `financeiro` | `produtividade` |
| `faturamento` | `financeiro` |
| `comercial` | `propostas_gerencial` |
| `contratos` | `contratos` |
| `monitor_medico` | `monitor` |
| `monitor_recepcao` | `monitor` |
| `clinia` | `monitor` |
| `procedures_catalog` | `profissionais` |
| `auth` | `settings` |

## Observações de manutenção

- Há regra legada em `frontend/middleware.ts` baseada em `role` e path (`/usuarios`, `/metas`).
- A regra principal de menu e de APIs já é a matriz por página.
- Recomendação técnica: manter uma única fonte de autorização (matriz), reduzindo lógica legada de role no middleware.

---

## Atualizacao: pagina `profissionais`

A pagina `profissionais` foi adicionada com `pageKey = profissionais`.

### Rota

- `/profissionais`
- APIs relacionadas: `/api/admin/profissionais*`

### Defaults atuais

| Perfil | view | edit | refresh |
|---|---:|---:|---:|
| ADMIN | sim | sim | sim |
| GESTOR | sim | sim | sim |
| OPERADOR | sim | nao | nao |

### Regra de autorizacao

- Listagem e detalhe (`GET`): exige `view`.
- Criacao/edicao (`POST`/`PUT`): exige `edit`.
- Procedimentos (`GET/PUT /api/admin/profissionais/:id/procedimentos`): `view` para leitura e `edit` para gravação.

Implementacao:
- `frontend/src/lib/permissions.ts`
- `frontend/src/lib/profissionais/auth.ts`
- `frontend/src/app/api/admin/profissionais/route.ts`
- `frontend/src/app/api/admin/profissionais/[id]/route.ts`

---

## Atualizacao: modulo `recrutamento`

O módulo `recrutamento` foi adicionado com `pageKey = recrutamento`.

### Rota

- `/recrutamento`
- APIs relacionadas: `/api/admin/recrutamento*`

### Defaults atuais

| Perfil | view | edit | refresh |
|---|---:|---:|---:|
| ADMIN | sim | sim | sim |
| GESTOR | sim | sim | sim |
| OPERADOR | nao | nao | nao |

### Regra de autorizacao

- Leitura do painel, anexos e histórico: exige `view`.
- Criação/edição de vagas, candidatos, anexos e conversão para pré-admissão: exige `edit`.

Implementacao:
- `frontend/src/lib/permissions.ts`
- `frontend/src/lib/recrutamento/auth.ts`
- `frontend/src/app/api/admin/recrutamento/*`

---

## Atualizacao: modulo `repasses`

### Rota

- `/repasses`
- APIs relacionadas:
  - `/api/admin/repasses/jobs`
  - `/api/admin/repasses/pdf-jobs`

### Defaults atuais

| Perfil | view | edit | refresh |
|---|---:|---:|---:|
| ADMIN | sim | sim | sim |
| GESTOR | nao | nao | nao |
| OPERADOR | nao | nao | nao |

### Regras de autorizacao server-side

- `GET /api/admin/repasses/jobs`: exige `view`.
- `POST /api/admin/repasses/jobs`: exige `refresh`.
- `GET /api/admin/repasses/pdf-jobs`: exige `view`.
- `POST /api/admin/repasses/pdf-jobs`: exige `edit`.

Observacao:
- mesmo com permissao, o modulo pode ser bloqueado por feature flag (`REPASSES_MODULE_ENABLED` e `NEXT_PUBLIC_REPASSES_MODULE_ENABLED`).

Implementacao:
- `frontend/src/lib/permissions.ts`
- `frontend/src/lib/repasses/auth.ts`
- `frontend/src/app/api/admin/repasses/jobs/route.ts`
- `frontend/src/app/api/admin/repasses/pdf-jobs/route.ts`

## Atualizacao adicional - Agenda Ocupacao

- Novo `PageKey`: `agenda_ocupacao` (rota `/agenda-ocupacao`).
- A pagina valida `view` no carregamento e `refresh` para disparar atualizacao manual.
- APIs protegidas:
  - `GET /api/admin/agenda-ocupacao`
  - `POST /api/admin/agenda-ocupacao/refresh`
  - `GET /api/admin/agenda-ocupacao/jobs/latest`
  - `GET /api/admin/agenda-ocupacao/export`

## Atualizacao: modulo `colaboradores`

### Rota

- `/colaboradores`
- APIs relacionadas: `/api/admin/colaboradores*`

### Defaults atuais

| Perfil | view | edit | refresh |
|---|---:|---:|---:|
| ADMIN | sim | sim | sim |
| GESTOR | sim | sim | sim |
| OPERADOR | sim | sim | sim |

### Regra de autorizacao

- Listagem, detalhe e downloads (`GET`): exige `view`.
- Criacao/edicao (`POST`/`PUT`): exige `edit`.
- Remocoes de documentos/uniforme/recesso (`DELETE`): exige `edit`.
- `refresh` permanece no modelo de permissao, mas nao aciona worker especifico no V1.

Implementacao:
- `frontend/src/lib/permissions.ts`
- `frontend/src/lib/colaboradores/auth.ts`
- `frontend/src/app/api/admin/colaboradores/route.ts`
- `frontend/src/app/api/admin/colaboradores/[id]/route.ts`


## Atualiza??o ? Equipamentos

Novo `PageKey` inclu?do no sistema:

| PageKey | Rota |
|---|---|
| `equipamentos` | `/equipamentos` |

### Defaults

| Perfil | View | Edit | Refresh |
|---|---:|---:|---:|
| `ADMIN` | ? | ? | ? |
| `GESTOR` | ? | ? | ? |
| `OPERADOR` | ? | ? | ? |

### APIs protegidas

| API | PageKey | A??o validada |
|---|---|---|
| `/api/admin/equipamentos` | `equipamentos` | `view` / `edit` |
| `/api/admin/equipamentos/[id]` | `equipamentos` | `view` / `edit` |
| `/api/admin/equipamentos/options` | `equipamentos` | `view` |
| `/api/admin/equipamentos/export` | `equipamentos` | `view` |
| `/api/admin/equipamentos/[id]/eventos` | `equipamentos` | `view` / `edit` |
| `/api/admin/equipamentos/[id]/eventos/[eventId]` | `equipamentos` | `edit` |
| `/api/admin/equipamentos/[id]/arquivos` | `equipamentos` | `view` / `edit` |
| `/api/admin/equipamentos/arquivos/[fileId]/download` | `equipamentos` | `view` |

---

## Atualizacao: modulo `marketing_controle`

### Rota

- `/marketing/controle`
- APIs relacionadas:
  - `/api/admin/marketing/controle/summary`
  - `/api/admin/marketing/controle/grid`
  - `/api/admin/marketing/controle/source-status`
  - `/api/admin/marketing/controle/refresh`
  - `/api/admin/marketing/controle/export`

### Defaults atuais

| Perfil | view | edit | refresh |
|---|---:|---:|---:|
| ADMIN | sim | sim | sim |
| GESTOR | sim | nao | sim |
| OPERADOR | nao | nao | nao |

### Regra de autorizacao

- `GET`: exige `view`
- `POST /refresh`: exige `refresh`
- nao ha fluxo de `edit` no MVP, pois o modulo e read-only

---

## Atualização: Vigilância Sanitária

Novo `PageKey`: `vigilancia_sanitaria`.

| PageKey | Rota | Observação |
|---|---|---|
| `qualidade_documentos` | `/qualidade/documentos` | Exibido na UI como `POPs e Manuais` |
| `vigilancia_sanitaria` | `/qualidade/vigilancia-sanitaria` | Licenças e documentos regulatórios da Vigilância Sanitária |

Defaults:

| Perfil | View | Edit | Refresh |
|---|---:|---:|---:|
| ADMIN | sim | sim | sim |
| GESTOR | sim | sim | sim |
| OPERADOR | sim | não | não |
