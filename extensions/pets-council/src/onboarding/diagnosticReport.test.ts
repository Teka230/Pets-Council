import assert from 'node:assert/strict';
import test from 'node:test';
import { renderDiagnosticReport } from './diagnosticReport';

test('summarizes ready diagnostics without implying automatic actions',()=>{const report=renderDiagnosticReport([{id:'codex',label:'Codex CLI',status:'pass',detail:'Available.'}],'2026-07-28T12:00:00Z');assert.match(report,/Ready for an explicit Codex session/);assert.match(report,/does not connect Codex/);});
test('surfaces blocking failures and next actions',()=>{const report=renderDiagnosticReport([{id:'codex',label:'Codex CLI',status:'failure',detail:'Missing.',nextAction:'Install Codex.'}]);assert.match(report,/1 blocking issue/);assert.match(report,/Install Codex/);});
