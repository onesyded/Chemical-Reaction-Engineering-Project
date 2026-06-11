// Temporary smoke test for the solver layer wired into server.ts.
import { sizeCSTR, sizePFR, conversionInCSTR, conversionInPFR } from '../src/solvers';

const base = { F_A0: 1, C_A0: 2000, k: 0.5 };
let pass = 0, fail = 0;

function check(name: string, got: number, want: number, tol = 1e-3) {
  const ok = Math.abs(got - want) <= tol * Math.max(1, Math.abs(want));
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}: got ${got.toPrecision(6)}, want ≈ ${want}`);
  ok ? pass++ : fail++;
}

// PFR sizing, first order: V = (F/(kC)) ln(1/(1-X)) = 0.001*ln(10)
check('sizePFR X=0.9', sizePFR({ ...base, X_target: 0.9 }).V, 0.0023026);
// CSTR sizing, first order: V = F X /(k C (1-X)) = 0.9/100
check('sizeCSTR X=0.9', sizeCSTR({ ...base, X_target: 0.9 }).V, 0.009);
// Round-trips
check('conv in CSTR @0.009', conversionInCSTR({ ...base, V: 0.009 }).X, 0.9);
check('conv in PFR @0.0023026', conversionInPFR({ ...base, V: 0.0023026 }).X, 0.9);
// Second order PFR should still integrate to a positive finite volume
const o2 = sizePFR({ ...base, X_target: 0.8, order: 2 });
console.log(`${o2.ok && o2.V > 0 ? 'PASS' : 'FAIL'}  2nd-order PFR ok=${o2.ok} V=${o2.V?.toPrecision(6)}`);
o2.ok && o2.V > 0 ? pass++ : fail++;
// Invalid input must be rejected, not silently computed
const bad = sizeCSTR({ ...base, X_target: 1.5 });
console.log(`${bad.ok === false && bad.error ? 'PASS' : 'FAIL'}  rejects X=1.5 -> ok=${bad.ok} error="${bad.error}"`);
bad.ok === false && bad.error ? pass++ : fail++;

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
