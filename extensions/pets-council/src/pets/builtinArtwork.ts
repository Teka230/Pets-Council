import type { PetVisualState } from './petPack';

export type CanonicalPetArtwork = Readonly<{
  id: 'orbital'|'mono'|'sprout'|'hibou';
  version: 1;
  license: 'MIT';
  attribution: string;
  dataUri: string;
}>;

const STATES: readonly PetVisualState[] = ['idle','thinking','suggestion','silent','approval','error'];

export function canonicalPetArtwork(id:CanonicalPetArtwork['id']):CanonicalPetArtwork {
  return {
    id,
    version:1,
    license:'MIT',
    attribution:'Original Pets Council canonical vector artwork.',
    dataUri:toDataUri(renderAtlas(id))
  };
}

function renderAtlas(id:CanonicalPetArtwork['id']):string {
  const cells=STATES.map((state,index)=>`<g transform="translate(${index*96} 0)">${renderCell(id,state)}</g>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="576" height="96" viewBox="0 0 576 96"><style>.line{stroke:#182033;stroke-width:3;stroke-linecap:round;stroke-linejoin:round}.eye{fill:#182033}.shine{fill:#fff}.soft{opacity:.48}</style>${cells}</svg>`;
}

function renderCell(id:CanonicalPetArtwork['id'],state:PetVisualState):string {
  const faded=state==='silent'?' class="soft"':'';
  const pose=state==='thinking'?'translate(0 -2) rotate(-2 48 52)':state==='suggestion'?'translate(0 -5)':state==='approval'?'rotate(3 48 52)':state==='error'?'rotate(-3 48 52)':'translate(0 0)';
  return `<g${faded} transform="${pose}">${shadow()}${character(id,state)}${stateBadge(state)}</g>`;
}

function character(id:CanonicalPetArtwork['id'],state:PetVisualState):string {
  switch(id){
    case'orbital':return orbital(state);
    case'mono':return mono(state);
    case'sprout':return sprout(state);
    case'hibou':return hibou(state);
  }
}

function orbital(state:PetVisualState):string {
  const eye=eyePair(state,34,47,62,47);
  return `<ellipse cx="48" cy="54" rx="27" ry="25" fill="#8398ff" class="line"/><ellipse cx="48" cy="54" rx="38" ry="10" fill="none" stroke="#ffc857" stroke-width="5" transform="rotate(-14 48 54)"/><circle cx="67" cy="28" r="7" fill="#ffc857" class="line"/><path d="M30 73q18 13 36 0" fill="#6577d6" class="line"/>${eye}${mouth(state,48,60)}</g>`;
}

function mono(state:PetVisualState):string {
  const eye=eyePair(state,36,46,60,46);
  return `<path d="M48 18 75 28v23c0 19-12 29-27 36-15-7-27-17-27-36V28z" fill="#74d4b2" class="line"/><path d="M48 25 66 32v18c0 12-7 20-18 27-11-7-18-15-18-27V32z" fill="#d9fff2" stroke="#182033" stroke-width="2"/>${eye}${mouth(state,48,59)}${state==='approval'?'<path d="M48 31v19" class="line"/><circle cx="48" cy="62" r="3" fill="#182033"/>':''}`;
}

function sprout(state:PetVisualState):string {
  const eye=eyePair(state,36,52,60,52);
  return `<ellipse cx="48" cy="59" rx="26" ry="23" fill="#a8d96f" class="line"/><path d="M47 35c-3-13 4-22 16-24 1 11-4 20-16 24Z" fill="#61b95a" class="line"/><path d="M48 35c3-11-2-19-12-23-3 10 1 19 12 23Z" fill="#80cf69" class="line"/><path d="M48 35v12" class="line"/>${eye}${mouth(state,48,65)}<path d="M29 75q19 12 38 0" fill="#80bf58" class="line"/>`;
}

function hibou(state:PetVisualState):string {
  const left=owlEye(state,35,48),right=owlEye(state,61,48);
  return `<path d="M24 34 30 17l14 12h8l14-12 6 17v31c0 15-11 23-24 23S24 80 24 65Z" fill="#d9ad65" class="line"/><path d="M48 57 41 64h14Z" fill="#f5cf67" class="line"/><path d="M30 71q18 14 36 0" fill="#bd8746" class="line"/>${left}${right}${state==='thinking'?'<path d="M25 30q23-10 46 0" fill="none" class="line"/>':''}`;
}

function eyePair(state:PetVisualState,lx:number,ly:number,rx:number,ry:number):string {
  if(state==='error')return `<path d="m${lx-4} ${ly-4} 8 8m0-8-8 8m${rx-4} ${ry-4} 8 8m0-8-8 8" class="line"/>`;
  if(state==='thinking')return `<path d="M${lx-6} ${ly}q6-6 12 0M${rx-6} ${ry}q6-6 12 0" fill="none" class="line"/>`;
  return `<circle cx="${lx}" cy="${ly}" r="6" class="eye"/><circle cx="${lx-2}" cy="${ly-2}" r="2" class="shine"/><circle cx="${rx}" cy="${ry}" r="6" class="eye"/><circle cx="${rx-2}" cy="${ry-2}" r="2" class="shine"/>`;
}

function owlEye(state:PetVisualState,x:number,y:number):string {
  if(state==='error')return `<circle cx="${x}" cy="${y}" r="11" fill="#fff1d2" class="line"/><path d="m${x-4} ${y-4} 8 8m0-8-8 8" class="line"/>`;
  return `<circle cx="${x}" cy="${y}" r="12" fill="#fff1d2" class="line"/><circle cx="${x}" cy="${y}" r="5" class="eye"/>${state==='thinking'?`<path d="M${x-8} ${y-8}q8-5 16 0" fill="none" class="line"/>`:''}`;
}

function mouth(state:PetVisualState,x:number,y:number):string {
  if(state==='error')return `<path d="M${x-7} ${y+5}q7-7 14 0" fill="none" class="line"/>`;
  if(state==='approval')return `<circle cx="${x}" cy="${y+2}" r="4" fill="#182033"/>`;
  return `<path d="M${x-7} ${y}q7 7 14 0" fill="none" class="line"/>`;
}

function stateBadge(state:PetVisualState):string {
  if(state==='suggestion')return '<g><circle cx="77" cy="18" r="11" fill="#4f7cff" class="line"/><path d="M77 12v12M71 18h12" stroke="#fff" stroke-width="3" stroke-linecap="round"/></g>';
  if(state==='approval')return '<g><circle cx="77" cy="18" r="11" fill="#f2a33a" class="line"/><path d="M77 11v9" stroke="#fff" stroke-width="3"/><circle cx="77" cy="25" r="2" fill="#fff"/></g>';
  if(state==='error')return '<g><circle cx="77" cy="18" r="11" fill="#dd5a61" class="line"/><path d="m72 13 10 10m0-10-10 10" stroke="#fff" stroke-width="3"/></g>';
  return '';
}

function shadow():string{return '<ellipse cx="48" cy="87" rx="25" ry="5" fill="#182033" opacity=".16"/>';}
function toDataUri(svg:string):string{return`data:image/svg+xml,${encodeURIComponent(svg)}`;}
