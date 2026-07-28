import type { CouncilReview, CouncilReviewState, CouncilRoleId } from '../domain';
import type { CodexRuntimeStatus } from '../runtime/types';
import { canonicalPetArtwork, type CanonicalPetArtwork } from './builtinArtwork';

export type PetVisualState = 'idle'|'thinking'|'suggestion'|'silent'|'approval'|'error';
export type PetMotionPreference = 'system'|'full'|'reduced';
export type PetAnchor = 'editor'|'terminal'|'sidebar'|'memory';
export type PetAtlasFormat = 'strip-v1'|'hatch-v2';
export type PetAtlasCell = Readonly<{ column:number; row:number }>;
export type PetAtlas = Readonly<{
  format:PetAtlasFormat;
  dataUri:string;
  cellWidth:number;
  cellHeight:number;
  columns:number;
  rows:number;
  states:Readonly<Record<PetVisualState,PetAtlasCell>>;
}>;
export type PetArtworkMetadata = Readonly<{
  tier:'canonical';
  version:number;
  license:string;
  attribution:string;
}>;
export type PetDefinition = Readonly<{ id:string;name:string;glyph:string;description:string;atlas?:PetAtlas;artwork?:PetArtworkMetadata }>;
export type PetRoleAssignment = Readonly<{ role:CouncilRoleId;petId:string;anchor?:PetAnchor }>;
export type PetPackManifest = Readonly<{ schemaVersion:1;id:string;name:string;version:string;pets:readonly PetDefinition[];assignments:readonly PetRoleAssignment[] }>;
export type PetSnapshot = Readonly<{ role:CouncilRoleId;petId:string;name:string;glyph:string;state:PetVisualState;suggestionCount:number;anchor:PetAnchor;atlas?:PetAtlas;artwork?:PetArtworkMetadata }>;

const STATE_CELLS:Readonly<Record<PetVisualState,PetAtlasCell>>={
  idle:{column:0,row:0},thinking:{column:1,row:0},suggestion:{column:2,row:0},silent:{column:3,row:0},approval:{column:4,row:0},error:{column:5,row:0}
};

export const BUILTIN_PET_PACK: PetPackManifest = {
  schemaVersion:1,id:'pets-council.builtin',name:'Built-in Council Companions',version:'3.0.0',
  pets:[
    builtinPet('orbital','Orbital','🪐','A curious builder who turns goals into concrete slices.'),
    builtinPet('mono','Mono','🛡️','A vigilant guardian who watches risk and permissions.'),
    builtinPet('sprout','Sprout','🌱','A patient strategist who keeps scope and sequence healthy.'),
    builtinPet('hibou','Hibou','🦉','The Greffier who preserves provenance and durable decisions.')
  ],
  assignments:[
    {role:'architect',petId:'orbital',anchor:'editor'},
    {role:'guardian',petId:'mono',anchor:'terminal'},
    {role:'strategist',petId:'sprout',anchor:'sidebar'},
    {role:'notetaker',petId:'hibou',anchor:'memory'}
  ]
};

export function buildPetSnapshots(review:CouncilReview,council:CouncilReviewState,runtime:CodexRuntimeStatus,manifest:PetPackManifest=BUILTIN_PET_PACK):readonly PetSnapshot[]{
  const definitions=new Map(manifest.pets.map((pet)=>[pet.id,pet]));
  const reviews=new Map(review.roles.map((role)=>[role.role,role]));
  return manifest.assignments.map((assignment)=>{
    const pet=definitions.get(assignment.petId);if(!pet)throw new Error(`Pet Pack ${manifest.id} references missing pet ${assignment.petId}.`);
    const suggestionCount=reviews.get(assignment.role)?.suggestions.length??0;
    const state=resolveState(assignment.role,suggestionCount,council,runtime);
    return {role:assignment.role,petId:pet.id,name:pet.name,glyph:pet.glyph,suggestionCount,state,anchor:resolveAnchor(assignment,state),atlas:pet.atlas,artwork:pet.artwork};
  });
}

export function validatePetPack(manifest:PetPackManifest):readonly string[]{
  const errors:string[]=[],petIds=new Set<string>(),roles=new Set<CouncilRoleId>();
  if(manifest.schemaVersion!==1)errors.push('schemaVersion must be 1.');
  if(!manifest.id.trim())errors.push('id is required.');
  if(!manifest.name.trim())errors.push('name is required.');
  for(const pet of manifest.pets){
    if(petIds.has(pet.id))errors.push(`Duplicate pet id: ${pet.id}.`);petIds.add(pet.id);
    if(pet.atlas)errors.push(...validateAtlas(pet.id,pet.atlas));
    if(pet.artwork)errors.push(...validateArtwork(pet.id,pet.artwork));
  }
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

function resolveAnchor(assignment:PetRoleAssignment,state:PetVisualState):PetAnchor{
  if(assignment.role==='guardian'&&state==='approval')return'terminal';
  return assignment.anchor??({architect:'editor',guardian:'terminal',strategist:'sidebar',notetaker:'memory'} as const)[assignment.role];
}

function builtinPet(id:CanonicalPetArtwork['id'],name:string,glyph:string,description:string):PetDefinition{
  const artwork=canonicalPetArtwork(id);
  return {
    id,name,glyph,description,
    atlas:{format:'strip-v1',dataUri:artwork.dataUri,cellWidth:96,cellHeight:96,columns:6,rows:1,states:STATE_CELLS},
    artwork:{tier:'canonical',version:artwork.version,license:artwork.license,attribution:artwork.attribution}
  };
}

function validateAtlas(petId:string,atlas:PetAtlas):readonly string[]{
  const errors:string[]=[];
  if(!['strip-v1','hatch-v2'].includes(atlas.format))errors.push(`Pet ${petId} has an unsupported atlas format.`);
  if(!atlas.dataUri.startsWith('data:image/'))errors.push(`Pet ${petId} atlas must use an image data URI.`);
  for(const [label,value] of Object.entries({cellWidth:atlas.cellWidth,cellHeight:atlas.cellHeight,columns:atlas.columns,rows:atlas.rows}))if(!Number.isInteger(value)||value<1)errors.push(`Pet ${petId} atlas ${label} must be a positive integer.`);
  if(atlas.format==='hatch-v2'&&(atlas.columns!==8||atlas.rows!==11||atlas.cellWidth!==192||atlas.cellHeight!==208))errors.push(`Pet ${petId} Hatch v2 atlas must be 8×11 cells of 192×208.`);
  for(const state of Object.keys(STATE_CELLS) as PetVisualState[]){const cell=atlas.states[state];if(!cell||cell.column<0||cell.column>=atlas.columns||cell.row<0||cell.row>=atlas.rows)errors.push(`Pet ${petId} has an invalid ${state} atlas cell.`);}
  return errors;
}

function validateArtwork(petId:string,artwork:PetArtworkMetadata):readonly string[]{
  const errors:string[]=[];
  if(artwork.tier!=='canonical')errors.push(`Pet ${petId} artwork tier must be canonical.`);
  if(!Number.isInteger(artwork.version)||artwork.version<1)errors.push(`Pet ${petId} artwork version must be a positive integer.`);
  if(!artwork.license.trim())errors.push(`Pet ${petId} artwork license is required.`);
  if(!artwork.attribution.trim())errors.push(`Pet ${petId} artwork attribution is required.`);
  return errors;
}
