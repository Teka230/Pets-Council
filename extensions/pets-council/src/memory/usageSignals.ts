import type { CouncilSuggestion } from '../domain';

export type SuggestionUsageAction='accepted'|'dismissed'|'snoozed';
export type SuggestionUsageSignal=Readonly<{
  version:1;
  recordedAt:string;
  action:SuggestionUsageAction;
  turnId:string;
  suggestionId:string;
  role:CouncilSuggestion['role'];
  title:string;
  provider:'codex'|'deterministic'|'unknown';
}>;

export function parseUsageSignalLine(line:string):SuggestionUsageSignal|undefined{
  try{
    const value=JSON.parse(line) as Record<string,unknown>;
    if(value.version!==1||typeof value.recordedAt!=='string'||!['accepted','dismissed','snoozed'].includes(String(value.action))||typeof value.turnId!=='string'||typeof value.suggestionId!=='string'||!['architect','guardian','strategist','notetaker'].includes(String(value.role))||typeof value.title!=='string'||!['codex','deterministic','unknown'].includes(String(value.provider)))return undefined;
    return value as unknown as SuggestionUsageSignal;
  }catch{return undefined;}
}
