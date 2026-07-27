import type { CouncilReview, CouncilReviewState, CouncilRoleId } from '../domain';
import type { CodexRuntimeStatus } from '../runtime/types';

export type PetVisualState = 'idle'|'thinking'|'suggestion'|'silent'|'approval'|'error';
export type PetMotionPreference = 'system'|'full'|'reduced';
export type PetDefinition = Readonly<{ id:string;name:string;glyph:string;description:string }>;
export type PetRoleAssignment = Readonly<{ role:CouncilRoleId;petId:string }>;
export type PetPackManifest = Readonly<{ schemaVersion:1;id:string;name:string;version:string;pets:readonly PetDefinition[];assignments:readonly PetRoleAssignment[] }>;
export type PetSnapshot = Readonly<{ role:CouncilRoleId;petId:string;name:string;glyph:string;state:PetVisualState;suggestionCount:number }>;

export const BUILTIN_PET_PACK: PetPackManifest = {
  schemaVersion:1,id:'pets-council.builtin',name:'Built-in Council Companions',version:'1.0.0',
  pets:[
    {id:'orbital',name:'Orbital',glyph:'🪐',description:'A curious builder who turns goals into concrete slices.'},
    {id:'mono',name:'Mono',glyph:'🛡️',description:'A vigilant guardian who watches risk and permissions.'},
    {id:'sprout',name:'Sprout',glyph:'🌱',description:'A patient strategist who keeps scope and sequence healthy.'},
    {id:'hibou',name:'Hibou',glyph:'🦉',description:'The Greffier who preserves provenance and durable decisions.'}
  ],
  assignments:[
    {role:'architect',petId:'orbital'},
    {role:'guardian',petId:'mono'},
    {role:'strategist',petId:'sprout'},
    {role:'notetaker',petId:'hibou'}
  ]
};

export function buildPetSnapshots(review:CouncilReview,council:CouncilReviewState,runtime:CodexRuntimeStatus,manifest:PetPackManifest=BUILTIN_PET_PACK):readonly PetSnapshot[]{
  const definitions=new Map(manifest.pets.map((pet)=>[pet.id,pet]));
  const reviews=new Map(review.roles.map((role)=>[role.role,role]));
  return manifest.assignments.map((assignment)=>{
    const pet=definitions.get(assignment.petId);if(!pet)throw new Error(`Pet Pack ${manifest.id} references missing pet ${assignment.petId}.`);
    const suggestionCount=reviews.get(assignment.role)?.suggestions.length??0;
    return {role:assignment.role,petId:pet.id,name:pet.name,glyph:pet.glyph,suggestionCount,state:resolveState(assignment.role,suggestionCount,council,runtime)};
  });
}

export function validatePetPack(manifest:PetPackManifest):readonly string[]{
  const errors:string[]=[],petIds=new Set<string>(),roles=new Set<CouncilRoleId>();
  if(manifest.schemaVersion!==1)errors.push('schemaVersion must be 1.');
  if(!manifest.id.trim())errors.push('id is required.');
  if(!manifest.name.trim())errors.push('name is required.');
  for(const pet of manifest.pets){if(petIds.has(pet.id))errors.push(`Duplicate pet id: ${pet.id}.`);petIds.add(pet.id);}
  for(const assignment of manifest.assignments){if(!petIds.has(assignment.petId))errors.push(`Assignment references unknown pet: ${assignment.petId}.`);if(roles.has(assignment.role))errors.push(`Role assigned more than once: ${assignment.role}.`);roles.add(assignment.role);}
  return errors;
}

function resolveState(role:CouncilRoleId,suggestionCount:number,council:CouncilReviewState,runtime:CodexRuntimeStatus):PetVisualState{
  if(runtime.approval&&role==='guardian')return'approval';
  if(council.phase==='reviewing')return'thinking';
  if(council.phase==='error')return'error';
  if(suggestionCount>0)return'suggestion';
  if(council.phase==='idle')return'idle';
  return'silent';
}
