# Turso "BLOCKED" Reads Error Handling

## Problema Original
Erro: `Error [LibsqlError]: BLOCKED: Operation was blocked: SQL read operations are forbidden (reads are blocked, do you need to upgrade your plan?)`

Este erro ocorre quando o Turso está com o plano limitado ou a conta foi suspensa temporariamente. As leituras são bloqueadas, mas precisamos informar ao usuário de forma clara e permitir retry.

## Solução Implementada

### 1. **Wrapper de Erro em `src/lib/db.ts`**

Adicionamos um try/catch em torno de `client.execute()` e `client.query()` para detectar mensagens BLOCKED:

```typescript
// Em getDbConnection(), dentro de query() e execute():
try {
  const res = await client!.execute({ sql, args: params });
  return (res.rows ?? []) as any[];
} catch (err: any) {
  const msg = String(err?.message || err);
  // Detecta variações da mensagem de bloqueio
  if (msg.includes('reads are blocked') || msg.includes('Operation was blocked') || msg.includes('BLOCKED')) {
    const e = new Error('Turso read operations are blocked: upgrade your plan or contact support');
    (e as any).status = 503; // HTTP 503 = Service Unavailable
    throw e;
  }
  throw err;
}
```

**Benefício:** Converte erro genérico `LibsqlError` em erro com `status=503` que pode ser manipulado nas rotas.

### 2. **Propagação de Status nas Rotas de API**

Todas as rotas (`/api/admin/*` e `/api/queue/*`) foram atualizadas para respeitar `error?.status`:

```typescript
// Antes:
return NextResponse.json({ error: error.message }, { status: 500 });

// Depois:
return NextResponse.json({ error: error.message }, { status: (error as any)?.status || 500 });
```

**Benefício:** Erros BLOCKED retornam `503` em vez de `500`, sinalizando ao cliente que é um erro **transitório** (pode tentar novamente depois).

### 3. **Tratamento em Server Actions**

Em `src/app/actions/settings.ts`:

```typescript
} catch (error) {
  console.error("Erro ao salvar no Turso:", error);
  const msg = String((error as any)?.message || error);
  if (msg.includes('reads are blocked') || msg.includes('BLOCKED')) {
    return { 
      success: false, 
      message: "Turso read operations bloqueadas: upgrade seu plano ou contacte o suporte." 
    };
  }
  return { success: false, message: "Erro ao salvar no banco de dados." };
}
```

**Benefício:** Mensagem clara ao usuário sobre o problema específico.

---

## Como Funciona No Frontend

### Caso 1: Reads Bloqueadas (503)
```javascript
// Quando API retorna 503
const response = await fetch('/api/admin/status');
if (response.status === 503) {
  // Implementar retry com backoff exponencial
  // Ex: aguardar 5s, tentar novamente, aguardar 10s, etc.
}
```

### Caso 2: Outros Erros (500)
```javascript
// Erros genéricos continuam com 500
// Tratamento padrão: log e mostrar mensagem genérica
```

---

## Arquivos Modificados

1. **`src/lib/db.ts`** - Wrapper principal para detectar BLOCKED
2. **`src/app/actions/settings.ts`** - Server action com mensagem customizada
3. **Todas as 21 rotas de API** em `src/app/api/**/*.ts`:
   - `admin/users`, `admin/settings`, `admin/refresh`, `admin/propostas`
   - `admin/options/units`, `admin/options/groups`
   - `admin/produtividade`, `admin/goals`, `admin/goals/history`, `admin/goals/dashboard`
   - `admin/financial/history`, `admin/contratos`, `admin/status`, `admin/teams`, `admin/user-teams`, `admin/token`
   - `queue/reception`, `queue/medic`

---

## Build Status

✅ **Build compilou com sucesso** em 21.4s
- Sem erros TypeScript
- Todas as rotas geradas
- Pronto para produção

---

## Próximos Passos Recomendados

1. **No Frontend:** Implementar retry com backoff exponencial para status 503
   ```typescript
   async function fetchWithRetry(url, maxRetries = 3) {
     let retries = 0;
     while (retries < maxRetries) {
       try {
         const res = await fetch(url);
         if (res.status === 503) {
           retries++;
           await new Promise(r => setTimeout(r, Math.pow(2, retries) * 1000));
           continue;
         }
         return res;
       } catch (e) {
         throw e;
       }
     }
   }
   ```

2. **No Turso:** Verificar limite de operações e considerar upgrade se necessário

3. **Monitoramento:** Adicionar logs para rastrear ocorrências de 503 em produção

---

## Teste Local

Para simular o erro BLOCKED, você pode temporariamente modificar `src/lib/db.ts`:

```typescript
// Antes de production, remover esta linha!
throw new Error('BLOCKED: Operation was blocked'); // Para testar

// Deve resultar em 503 na API
```

