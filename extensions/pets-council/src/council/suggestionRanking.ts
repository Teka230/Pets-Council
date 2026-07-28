import type { CouncilReview, CouncilRoleId, CouncilSuggestion } from '../domain';
import type { SuggestionUsageSignal } from '../memory/usageSignals';

export type SuggestionRankingExplanation=Readonly<{
  suggestionId:string;
  role:CouncilRoleId;
  score:number;
  exactSamples:number;
  roleSamples:number;
}>;

export type RankedCouncilReview=Readonly<{review:CouncilReview;explanations:readonly SuggestionRankingExplanation[]}>;

export function rankCouncilReview(review:CouncilReview,signals:readonly SuggestionUsageSignal[]):RankedCouncilReview{
  const explanations:SuggestionRankingExplanation[]=[];
  const roles=review.roles.map((roleReview)=>{
    const scored=roleReview.suggestions.map((suggestion,index)=>{
      const exact=signals.filter((signal)=>signal.role===suggestion.role&&normalize(signal.title)===normalize(suggestion.title));
      const roleSignals=signals.filter((signal)=>signal.role===suggestion.role);
      const exactScore=exact.reduce((total,signal)=>total+weight(signal.action),0);
      const roleScore=roleSignals.reduce((total,signal)=>total+weight(signal.action),0);
      const score=round(exactScore+(roleSignals.length>=4?roleScore/roleSignals.length:0));
      explanations.push({suggestionId:suggestion.id,role:suggestion.role,score,exactSamples:exact.length,roleSamples:roleSignals.length});
      return{suggestion,index,score};
    });
    scored.sort((left,right)=>right.score-left.score||left.index-right.index);
    return{...roleReview,suggestions:scored.map((entry)=>entry.suggestion)};
  });
  return{review:{...review,roles},explanations};
}

export function summarizeRoleSignals(signals:readonly SuggestionUsageSignal[]):Readonly<Record<CouncilRoleId,{accepted:number;dismissed:number;snoozed:number}>>{
  const summary={architect:empty(),guardian:empty(),strategist:empty(),notetaker:empty()};
  for(const signal of signals)summary[signal.role][signal.action]++;
  return summary;
}

function empty(){return{accepted:0,dismissed:0,snoozed:0};}
function weight(action:SuggestionUsageSignal['action']):number{return action==='accepted'?3:action==='dismissed'?-2:-0.5;}
function normalize(value:string):string{return value.toLocaleLowerCase().replace(/[^a-z0-9]+/g,' ').trim();}
function round(value:number):number{return Math.round(value*100)/100;}
