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
| `metas_dashboard` | `/metas/dashboard` |
| `metas` | `/metas` |
| `produtividade` | `/produtividade` |
| `checklist_crc` | `/checklist-crc` |
| `checklist_recepcao` | `/checklist-recepcao` |
| `users` | `/users` |
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
| metas_dashboard | ✅ | ❌ | ❌ |
| metas | ✅ | ✅ | ❌ |
| produtividade | ✅ | ✅ | ✅ |
| checklist_crc | ✅ | ✅ | ✅ |
| checklist_recepcao | ✅ | ✅ | ✅ |
| users | ❌ | ❌ | ❌ |
| settings | ❌ | ❌ | ❌ |


### OPERADOR

| PageKey | View | Edit | Refresh |
|---|---:|---:|---:|
| dashboard | ✅ | ❌ | ❌ |
| monitor | ✅ | ❌ | ✅ |
| financeiro | ❌ | ❌ | ❌ |
| agendamentos | ✅ | ❌ | ❌ |
| contratos | ❌ | ❌ | ❌ |
| propostas | ❌ | ❌ | ❌ |
| metas_dashboard | ✅ | ❌ | ❌ |
| metas | ❌ | ❌ | ❌ |
| produtividade | ✅ | ❌ | ✅ |
| checklist_crc | ✅ | ✅ | ✅ |
| checklist_recepcao | ✅ | ✅ | ✅ |
| users | ❌ | ❌ | ❌ |
| settings | ❌ | ❌ | ❌ |

| PageKey | View | Edit | Refresh |
|---|---:|---:|---:|
| dashboard | ✅ | ❌ | ❌ |
| monitor | ✅ | ❌ | ✅ |
| financeiro | ❌ | ❌ | ❌ |
| contratos | ❌ | ❌ | ❌ |
| propostas | ❌ | ❌ | ❌ |
| metas_dashboard | ✅ | ❌ | ❌ |
| metas | ❌ | ❌ | ❌ |
| produtividade | ✅ | ❌ | ✅ |
| checklist_crc | ✅ | ✅ | ✅ |
| checklist_recepcao | ✅ | ✅ | ✅ |
| users | ❌ | ❌ | ❌ |
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
| `/api/admin/refresh` | mapeado por serviço | `refresh` da página correspondente |

## Mapeamento serviço -> permissão de refresh

Em `frontend/src/app/api/admin/refresh/route.ts`:

| Serviço normalizado | PageKey exigido |
|---|---|
| `financeiro` | `produtividade` |
| `faturamento` | `financeiro` |
| `comercial` | `propostas` |
| `contratos` | `contratos` |
| `monitor_medico` | `monitor` |
| `monitor_recepcao` | `monitor` |
| `clinia` | `monitor` |
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

Implementacao:
- `frontend/src/lib/permissions.ts`
- `frontend/src/lib/profissionais/auth.ts`
- `frontend/src/app/api/admin/profissionais/route.ts`
- `frontend/src/app/api/admin/profissionais/[id]/route.ts`
