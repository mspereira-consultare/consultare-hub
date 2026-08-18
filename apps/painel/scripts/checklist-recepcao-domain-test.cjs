/* eslint-disable @typescript-eslint/no-require-imports */
require('ts-node/register/transpile-only');
const assert = require('node:assert/strict');

const {
  calculateDailyTarget,
  calculateShouldHaveUntilDate,
  countBusinessDays,
  monthEnd,
  previousBusinessDate,
  resolveFreezeSource,
  resolveReadOnly,
  resolveReferenceDate,
} = require('../src/lib/checklist_recepcao_domain.ts');

const cases = [
  {
    name: 'countBusinessDays ignora domingos e mantem sabados',
    run() {
      assert.equal(countBusinessDays('2026-08-01', '2026-08-04'), 3);
      assert.equal(countBusinessDays('2026-08-14', '2026-08-18'), 4);
    },
  },
  {
    name: 'previousBusinessDate pula domingo e cai no sabado quando necessario',
    run() {
      assert.equal(previousBusinessDate('2026-08-17'), '2026-08-15');
      assert.equal(previousBusinessDate('2026-08-18'), '2026-08-17');
    },
  },
  {
    name: 'calculateDailyTarget divide o restante pelos dias uteis restantes incluindo a data de referencia',
    run() {
      const target = calculateDailyTarget(1000, 400, '2026-08-17');
      assert.equal(monthEnd('2026-08-17'), '2026-08-31');
      assert.equal(Number(target.toFixed(4)), Number((600 / 13).toFixed(4)));
    },
  },
  {
    name: 'calculateShouldHaveUntilDate muda entre Hoje e uma data historica',
    run() {
      const currentShouldHave = calculateShouldHaveUntilDate(3100, '2026-08-18');
      const historicalShouldHave = calculateShouldHaveUntilDate(3100, '2026-08-15');

      assert.equal(Number(currentShouldHave.toFixed(4)), Number(((3100 * 15) / 26).toFixed(4)));
      assert.equal(Number(historicalShouldHave.toFixed(4)), Number(((3100 * 13) / 26).toFixed(4)));
      assert.ok(currentShouldHave > historicalShouldHave);
    },
  },
  {
    name: 'resolveReferenceDate e resolveReadOnly aplicam o fallback de D-1 somente leitura',
    run() {
      assert.equal(resolveReferenceDate('2026-08-18', 'current', null), '2026-08-18');
      assert.equal(resolveReferenceDate('2026-08-18', 'd1', null), '2026-08-17');
      assert.equal(resolveReadOnly('current'), false);
      assert.equal(resolveReadOnly('d1'), true);
    },
  },
  {
    name: 'resolveFreezeSource prioriza versao salva sobre legados e leitura ao vivo',
    run() {
      assert.equal(
        resolveFreezeSource({ hasSelectedVersion: true, readOnly: true, hasLegacyManual: true }),
        'version',
      );
      assert.equal(
        resolveFreezeSource({ hasSelectedVersion: false, readOnly: false, hasLegacyManual: true }),
        'legacy-fallback',
      );
      assert.equal(
        resolveFreezeSource({ hasSelectedVersion: false, readOnly: true, hasLegacyManual: true }),
        'live-fallback',
      );
    },
  },
];

let failures = 0;
for (const testCase of cases) {
  try {
    testCase.run();
    console.log(`ok - ${testCase.name}`);
  } catch (error) {
    failures += 1;
    console.error(`not ok - ${testCase.name}`);
    console.error(error);
  }
}

if (failures > 0) {
  console.error(`Falharam ${failures} teste(s) da checklist da recepcao.`);
  process.exit(1);
}

console.log(`Todos os ${cases.length} testes da checklist da recepcao passaram.`);
