import * as vscode from 'vscode';
import type { CouncilRoleId } from '../domain';
import { normalizePetPlacement, parsePetPlacementMap, type PetPlacement, type PetPlacementMap } from './placement';

const PREFIX='petsCouncil.petPlacements.';

export class PetPlacementStore{
  constructor(private readonly state:vscode.Memento){}
  load(workspaceKey:string):PetPlacementMap{return parsePetPlacementMap(this.state.get<unknown>(key(workspaceKey)));}
  async save(workspaceKey:string,role:CouncilRoleId,placement:PetPlacement):Promise<PetPlacementMap>{
    const normalized=normalizePetPlacement(placement);if(!normalized)throw new Error('Invalid pet placement.');
    const next={...this.load(workspaceKey),[role]:normalized};await this.state.update(key(workspaceKey),next);return next;
  }
  async reset(workspaceKey:string,role?:CouncilRoleId):Promise<PetPlacementMap>{
    if(!role){await this.state.update(key(workspaceKey),undefined);return{};}
    const next={...this.load(workspaceKey)};delete next[role];await this.state.update(key(workspaceKey),next);return next;
  }
}

function key(workspaceKey:string):string{return`${PREFIX}${workspaceKey}`;}
