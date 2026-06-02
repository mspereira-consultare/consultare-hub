# Next Steps

## Objetivo deste documento

Este documento define a sequencia segura para sair do congelamento arquitetural e iniciar a fundacao do novo SaaS sem quebrar as ADRs aprovadas.

---

## Fase 1 - Ratificar o pacote final

- **Objetivo:** transformar o pacote documental completo em baseline formal da foundation.
- **Dependencias:** ADR-000 ate ADR-015, `CONTRACT-PACK.md`, `OPERATIONAL-BASELINE.md` e `FOUNDATION-GATES.md` coerentes entre si.
- **Artefatos esperados:** aceite formal do pacote final como fonte oficial.
- **Criterio de saida:** nenhuma decisao fundacional critica permanece implicita.

## Fase 2 - Aprovar FOUNDATION-GATES

- **Objetivo:** confirmar formalmente que o pacote atingiu o estado necessario para abrir engineering.
- **Dependencias:** fase 1 concluida.
- **Artefatos esperados:** `FOUNDATION-GATES.md` em estado `PASS`.
- **Criterio de saida:** a pergunta "podemos abrir o novo repositorio agora?" pode ser respondida de forma objetiva com `Sim`.

## Fase 3 - Criar o novo repositorio

- **Objetivo:** iniciar a infraestrutura de trabalho do novo SaaS somente apos o foundation freeze estar formalmente aprovado.
- **Dependencias:** gates aprovados.
- **Artefatos esperados:** repositorio novo, provisionamento minimo de ambientes e bootstrap coerente com ADR-000.
- **Criterio de saida:** o novo ecossistema nasce sem compartilhar repo, project, banco, pipeline ou credencial com o legado.

## Fase 4 - Iniciar Goal Mode para foundation

- **Objetivo:** abrir a fase de implementacao da foundation em cima de arquitetura congelada e gates fechados.
- **Dependencias:** fases 1 a 3 concluidas.
- **Artefatos esperados:** primeiro ciclo de Goal Mode orientado apenas a bootstrap de foundation, sem features de negocio.
- **Criterio de saida:** o time pode iniciar desenvolvimento com guardrails claros e sem reabrir as ADRs basicas.
