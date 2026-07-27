import * as vscode from 'vscode';
import type { PetSnapshot } from './petPack';

export const NATIVE_OVERLAY_UPDATE_COMMAND='petsCouncil.nativeOverlay.update';
export const NATIVE_OVERLAY_HIDE_COMMAND='petsCouncil.nativeOverlay.hide';
export type NativeOverlaySnapshot=Readonly<{visible:boolean;companions:readonly PetSnapshot[]}>;

export class NativeOverlayBridge{
  private availability:boolean|undefined;
  async publish(snapshot:NativeOverlaySnapshot):Promise<void>{if(!(await this.isAvailable()))return;await vscode.commands.executeCommand(NATIVE_OVERLAY_UPDATE_COMMAND,snapshot);}
  async hide():Promise<void>{if(!(await this.isAvailable()))return;await vscode.commands.executeCommand(NATIVE_OVERLAY_HIDE_COMMAND);}
  invalidate():void{this.availability=undefined;}
  private async isAvailable():Promise<boolean>{if(this.availability!==undefined)return this.availability;const commands=await vscode.commands.getCommands(true);const available=commands.includes(NATIVE_OVERLAY_UPDATE_COMMAND);this.availability=available;return available;}
}
