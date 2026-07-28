/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Pets Council contributors. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { addDisposableListener, EventType } from '../../../../base/browser/dom.js';
import { Disposable, DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IWorkbenchLayoutService } from '../../../services/layout/browser/layoutService.js';

export const PETS_COUNCIL_NATIVE_OVERLAY_ENABLED='petsCouncil.nativeOverlay.enabled';
export const IPetsCouncilOverlayService=createDecorator<IPetsCouncilOverlayService>('petsCouncilOverlayService');
export type PetsCouncilNativeState='idle'|'thinking'|'suggestion'|'silent'|'approval'|'error';
export type PetsCouncilNativeAnchor='editor'|'terminal'|'sidebar'|'memory';
export interface IPetsCouncilNativeAtlas{readonly format:'strip-v1'|'hatch-v2';readonly dataUri:string;readonly cellWidth:number;readonly cellHeight:number;readonly columns:number;readonly rows:number;readonly states:Readonly<Record<PetsCouncilNativeState,{readonly column:number;readonly row:number}>>;}
export interface IPetsCouncilNativePlacement{readonly x:number;readonly y:number;}
export interface IPetsCouncilNativeCompanion{readonly role:string;readonly petId:string;readonly name:string;readonly glyph:string;readonly state:PetsCouncilNativeState;readonly suggestionCount:number;readonly anchor:PetsCouncilNativeAnchor;readonly atlas?:IPetsCouncilNativeAtlas;readonly placement?:IPetsCouncilNativePlacement;}
export interface IPetsCouncilNativeSnapshot{readonly visible:boolean;readonly companions:readonly IPetsCouncilNativeCompanion[];}
export interface IPetsCouncilOverlayService{readonly _serviceBrand:undefined;update(snapshot:IPetsCouncilNativeSnapshot):void;hide():void;}

export class PetsCouncilOverlayService extends Disposable implements IPetsCouncilOverlayService{
  declare readonly _serviceBrand:undefined;
  private readonly container:HTMLDivElement;
  private readonly companionDisposables=this._register(new DisposableStore());
  private snapshot:IPetsCouncilNativeSnapshot|undefined;
  constructor(@IWorkbenchLayoutService layoutService:IWorkbenchLayoutService,@IConfigurationService private readonly configurationService:IConfigurationService,@ICommandService private readonly commandService:ICommandService){
    super();this.container=layoutService.mainContainer.ownerDocument.createElement('div');this.container.className='pets-council-native-overlay';this.container.setAttribute('aria-label','Pets Council companions');this.container.hidden=true;layoutService.mainContainer.appendChild(this.container);this._register(toDisposable(()=>this.container.remove()));this._register(this.configurationService.onDidChangeConfiguration((event)=>{if(event.affectsConfiguration(PETS_COUNCIL_NATIVE_OVERLAY_ENABLED))this.render();}));
  }
  update(snapshot:IPetsCouncilNativeSnapshot):void{this.snapshot=sanitizeSnapshot(snapshot);this.render();}
  hide():void{this.snapshot=undefined;this.companionDisposables.clear();this.container.replaceChildren();this.container.hidden=true;}
  private render():void{
    this.companionDisposables.clear();this.container.replaceChildren();const snapshot=this.snapshot;const enabled=this.configurationService.getValue<boolean>(PETS_COUNCIL_NATIVE_OVERLAY_ENABLED)!==false;
    if(!enabled||!snapshot?.visible||snapshot.companions.length===0){this.container.hidden=true;return;}
    snapshot.companions.forEach((companion,index)=>{
      const button=this.container.ownerDocument.createElement('button');button.type='button';button.className=`pets-council-native-companion state-${companion.state} anchor-${companion.anchor}`;button.dataset.role=companion.role;button.dataset.anchor=companion.anchor;button.style.setProperty('--pet-index',String(index));button.setAttribute('aria-label',`${companion.name}, ${companion.role}, ${companion.state}, near ${companion.anchor}`);
      if(companion.placement){button.classList.add('custom-placement');button.style.left=`${companion.placement.x}px`;button.style.top=`${companion.placement.y}px`;}
      const visual=this.container.ownerDocument.createElement('span');visual.className='pets-council-native-companion-visual';
      if(companion.atlas){applyAtlasFrame(visual,companion.atlas,companion.state);}else{visual.classList.add('pets-council-native-companion-glyph');visual.textContent=companion.glyph;}
      button.appendChild(visual);
      if(companion.suggestionCount>0){const badge=this.container.ownerDocument.createElement('span');badge.className='pets-council-native-companion-badge';badge.textContent=String(companion.suggestionCount);button.appendChild(badge);}
      installDrag(button,this.container,companion.role,this.commandService);
      this.companionDisposables.add(addDisposableListener(button,EventType.CLICK,(event)=>{if(button.dataset.dragged==='true'){event.preventDefault();return;}void this.commandService.executeCommand('petsCouncil.openCouncil');}));this.container.appendChild(button);
    });
    this.container.hidden=false;
  }
}

function installDrag(button:HTMLButtonElement,container:HTMLDivElement,role:string,commandService:ICommandService):void{
  button.addEventListener('pointerdown',(event)=>{
    if(event.button!==0)return;
    const containerRect=container.getBoundingClientRect(),buttonRect=button.getBoundingClientRect();
    const originX=buttonRect.left-containerRect.left,originY=buttonRect.top-containerRect.top,startX=event.clientX,startY=event.clientY;
    let latestX=originX,latestY=originY,dragged=false;
    button.setPointerCapture(event.pointerId);
    const move=(current:PointerEvent):void=>{
      const dx=current.clientX-startX,dy=current.clientY-startY;if(!dragged&&Math.hypot(dx,dy)<4)return;dragged=true;
      latestX=clamp(originX+dx,0,Math.max(0,container.clientWidth-button.offsetWidth));latestY=clamp(originY+dy,0,Math.max(0,container.clientHeight-button.offsetHeight));
      button.dataset.dragged='true';button.classList.add('custom-placement','is-dragging');button.style.left=`${Math.round(latestX)}px`;button.style.top=`${Math.round(latestY)}px`;button.style.right='auto';button.style.bottom='auto';
    };
    const finish=(current:PointerEvent):void=>{
      button.removeEventListener('pointermove',move);button.removeEventListener('pointerup',finish);button.removeEventListener('pointercancel',finish);button.classList.remove('is-dragging');
      if(button.hasPointerCapture(current.pointerId))button.releasePointerCapture(current.pointerId);
      if(dragged){void commandService.executeCommand('petsCouncil.petPlacement.update',{role,placement:{x:Math.round(latestX),y:Math.round(latestY)}});setTimeout(()=>delete button.dataset.dragged,0);}
    };
    button.addEventListener('pointermove',move);button.addEventListener('pointerup',finish);button.addEventListener('pointercancel',finish);
  });
}

function applyAtlasFrame(element:HTMLSpanElement,atlas:IPetsCouncilNativeAtlas,state:PetsCouncilNativeState):void{
  const cell=atlas.states[state]??atlas.states.idle;
  const x=atlas.columns<=1?0:(cell.column/(atlas.columns-1))*100;
  const y=atlas.rows<=1?0:(cell.row/(atlas.rows-1))*100;
  element.classList.add('pets-council-native-companion-sprite');
  element.style.backgroundImage=`url("${atlas.dataUri.replaceAll('"','%22')}")`;
  element.style.backgroundSize=`${atlas.columns*100}% ${atlas.rows*100}%`;
  element.style.backgroundPosition=`${x}% ${y}%`;
  element.style.aspectRatio=`${atlas.cellWidth} / ${atlas.cellHeight}`;
}

function sanitizeSnapshot(value:unknown):IPetsCouncilNativeSnapshot|undefined{if(typeof value!=='object'||value===null)return undefined;const candidate=value as Partial<IPetsCouncilNativeSnapshot>;if(!Array.isArray(candidate.companions))return undefined;return{visible:candidate.visible!==false,companions:candidate.companions.map(sanitizeCompanion).filter((value):value is IPetsCouncilNativeCompanion=>Boolean(value)).slice(0,8)};}
function sanitizeCompanion(value:unknown):IPetsCouncilNativeCompanion|undefined{
  if(typeof value!=='object'||value===null)return undefined;const candidate=value as Partial<IPetsCouncilNativeCompanion>;if(!candidate.role||!candidate.petId||!candidate.name||!candidate.glyph)return undefined;
  const states:readonly PetsCouncilNativeState[]=['idle','thinking','suggestion','silent','approval','error'];const anchors:readonly PetsCouncilNativeAnchor[]=['editor','terminal','sidebar','memory'];
  return{role:String(candidate.role),petId:String(candidate.petId),name:String(candidate.name),glyph:String(candidate.glyph).slice(0,8),state:states.includes(candidate.state as PetsCouncilNativeState)?candidate.state as PetsCouncilNativeState:'idle',suggestionCount:Math.max(0,Math.min(9,Number(candidate.suggestionCount)||0)),anchor:anchors.includes(candidate.anchor as PetsCouncilNativeAnchor)?candidate.anchor as PetsCouncilNativeAnchor:'editor',atlas:sanitizeAtlas(candidate.atlas),placement:sanitizePlacement(candidate.placement)};
}
function sanitizeAtlas(value:unknown):IPetsCouncilNativeAtlas|undefined{
  if(typeof value!=='object'||value===null)return undefined;const atlas=value as Partial<IPetsCouncilNativeAtlas>;const formats=['strip-v1','hatch-v2'];
  if(!formats.includes(String(atlas.format))||typeof atlas.dataUri!=='string'||!atlas.dataUri.startsWith('data:image/')||atlas.dataUri.length>500_000)return undefined;
  const cellWidth=positiveInteger(atlas.cellWidth),cellHeight=positiveInteger(atlas.cellHeight),columns=positiveInteger(atlas.columns),rows=positiveInteger(atlas.rows);if(!cellWidth||!cellHeight||!columns||!rows||typeof atlas.states!=='object'||atlas.states===null)return undefined;
  const states={} as Record<PetsCouncilNativeState,{column:number;row:number}>;for(const state of ['idle','thinking','suggestion','silent','approval','error'] as const){const cell=(atlas.states as Record<string,unknown>)[state];if(typeof cell!=='object'||cell===null)return undefined;const candidate=cell as{column?:unknown;row?:unknown};const column=nonNegativeInteger(candidate.column),row=nonNegativeInteger(candidate.row);if(column===undefined||row===undefined||column>=columns||row>=rows)return undefined;states[state]={column,row};}
  return{format:atlas.format as 'strip-v1'|'hatch-v2',dataUri:atlas.dataUri,cellWidth,cellHeight,columns,rows,states};
}
function sanitizePlacement(value:unknown):IPetsCouncilNativePlacement|undefined{if(typeof value!=='object'||value===null)return undefined;const candidate=value as{x?:unknown;y?:unknown};const x=nonNegativeInteger(candidate.x),y=nonNegativeInteger(candidate.y);return x===undefined||y===undefined||x>10_000||y>10_000?undefined:{x,y};}
function positiveInteger(value:unknown):number|undefined{return typeof value==='number'&&Number.isInteger(value)&&value>0?value:undefined;}
function nonNegativeInteger(value:unknown):number|undefined{return typeof value==='number'&&Number.isInteger(value)&&value>=0?value:undefined;}
function clamp(value:number,min:number,max:number):number{return Math.max(min,Math.min(max,value));}
