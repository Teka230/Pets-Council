export type DiagnosticStatus='pass'|'warning'|'failure';
export type DiagnosticCheck=Readonly<{id:string;label:string;status:DiagnosticStatus;detail:string;nextAction?:string}>;

export function renderDiagnosticReport(checks:readonly DiagnosticCheck[],capturedAt=new Date().toISOString()):string{
  const failures=checks.filter((check)=>check.status==='failure').length,warnings=checks.filter((check)=>check.status==='warning').length;
  const summary=failures?`${failures} blocking issue${failures===1?'':'s'}`:warnings?`${warnings} warning${warnings===1?'':'s'}`:'Ready for an explicit Codex session';
  return [
    '# Pets Council diagnostics','',`Captured: ${capturedAt}`,'',`**${summary}.**`,'',
    ...checks.flatMap((check)=>[`## ${icon(check.status)} ${check.label}`,'',check.detail,...(check.nextAction?['',`Next: ${check.nextAction}`]:[]),'']),
    '## Safety boundary','',
    'This report does not connect Codex, start a thread, send a prompt, approve a command, or modify project files.'
  ].join('\n');
}

function icon(status:DiagnosticStatus):string{return status==='pass'?'✅':status==='warning'?'⚠️':'❌';}
