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
export interface IPetsCouncilNativeCompanion{readonly role:string;readonly petId:string;readonly name:string;readonly glyph:string;readonly state:PetsCouncilNativeState;readonly suggestionCount:number;}
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
    for(const companion of snapshot.companions){const button=this.container.ownerDocument.createElement('button');button.type='button';button.className=`pets-council-native-companion state-${companion.state}`;button.dataset.role=companion.role;button.setAttribute('aria-label',`${companion.name}, ${companion.role}, ${companion.state}`);const glyph=this.container.ownerDocument.createElement('span');glyph.className='pets-council-native-companion-glyph';glyph.textContent=companion.glyph;button.appendChild(glyph);if(companion.suggestionCount>0){const badge=this.container.ownerDocument.createElement('span');badge.className='pets-council-native-companion-badge';badge.textContent=String(companion.suggestionCount);button.appendChild(badge);}this.companionDisposables.add(addDisposableListener(button,EventType.CLICK,()=>{void this.commandService.executeCommand('petsCouncil.openCouncil');}));this.container.appendChild(button);}
    this.container.hidden=false;
  }
}
function sanitizeSnapshot(value:unknown):IPetsCouncilNativeSnapshot|undefined{if(typeof value!=='object'||value===null)return undefined;const candidate=value as Partial<IPetsCouncilNativeSnapshot>;if(!Array.isArray(candidate.companions))return undefined;return{visible:candidate.visible!==false,companions:candidate.companions.map(sanitizeCompanion).filter((value):value is IPetsCouncilNativeCompanion=>Boolean(value)).slice(0,8)};}
function sanitizeCompanion(value:unknown):IPetsCouncilNativeCompanion|undefined{if(typeof value!=='object'||value===null)return undefined;const candidate=value as Partial<IPetsCouncilNativeCompanion>;if(!candidate.role||!candidate.petId||!candidate.name||!candidate.glyph)return undefined;const allowed:readonly PetsCouncilNativeState[]=['idle','thinking','suggestion','silent','approval','error'];return{role:String(candidate.role),petId:String(candidate.petId),name:String(candidate.name),glyph:String(candidate.glyph).slice(0,8),state:allowed.includes(candidate.state as PetsCouncilNativeState)?candidate.state as PetsCouncilNativeState:'idle',suggestionCount:Math.max(0,Math.min(9,Number(candidate.suggestionCount)||0))};}
