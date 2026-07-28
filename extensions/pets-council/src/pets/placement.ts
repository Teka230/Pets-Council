import type { CouncilRoleId } from '../domain';
import type { PetSnapshot } from './petPack';

export type PetPlacement=Readonly<{x:number;y:number}>;
export type PetPlacementMap=Readonly<Partial<Record<CouncilRoleId,PetPlacement>>>;

const LIMIT=2_000;

export function normalizePetPlacement(value:unknown):PetPlacement|undefined{
  if(typeof value!=='object'||value===null)return undefined;
  const candidate=value as{x?:unknown;y?:unknown};
  if(typeof candidate.x!=='number'||!Number.isFinite(candidate.x)||typeof candidate.y!=='number'||!Number.isFinite(candidate.y))return undefined;
  return{x:clamp(Math.round(candidate.x),-LIMIT,LIMIT),y:clamp(Math.round(candidate.y),-LIMIT,LIMIT)};
}

export function parsePetPlacementMap(value:unknown):PetPlacementMap{
  if(typeof value!=='object'||value===null)return{};
  const source=value as Record<string,unknown>,result:Partial<Record<CouncilRoleId,PetPlacement>>={};
  for(const role of ['architect','guardian','strategist','notetaker'] as const){const placement=normalizePetPlacement(source[role]);if(placement)result[role]=placement;}
  return result;
}

export function applyPetPlacements(pets:readonly PetSnapshot[],placements:PetPlacementMap):readonly PetSnapshot[]{
  return pets.map((pet)=>({...pet,placement:pet.state==='approval'||pet.state==='error'?undefined:placements[pet.role]}));
}

function clamp(value:number,min:number,max:number):number{return Math.max(min,Math.min(max,value));}
