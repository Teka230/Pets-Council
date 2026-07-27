/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Pets Council contributors. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import './media/petsCouncilOverlay.css';
import { CommandsRegistry } from '../../../../platform/commands/common/commands.js';
import { IConfigurationRegistry, Extensions as ConfigurationExtensions } from '../../../../platform/configuration/common/configurationRegistry.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IPetsCouncilOverlayService, PETS_COUNCIL_NATIVE_OVERLAY_ENABLED, PetsCouncilOverlayService, type IPetsCouncilNativeSnapshot } from './petsCouncilOverlay.js';

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
  id:'petsCouncil',title:'Pets Council',properties:{[PETS_COUNCIL_NATIVE_OVERLAY_ENABLED]:{type:'boolean',default:true,description:'Shows Pets Council companions in the Code - OSS workbench overlay.'}}
});
registerSingleton(IPetsCouncilOverlayService,PetsCouncilOverlayService,InstantiationType.Delayed);
CommandsRegistry.registerCommand('petsCouncil.nativeOverlay.update',(accessor,snapshot:IPetsCouncilNativeSnapshot)=>{accessor.get(IPetsCouncilOverlayService).update(snapshot);});
CommandsRegistry.registerCommand('petsCouncil.nativeOverlay.hide',(accessor)=>{accessor.get(IPetsCouncilOverlayService).hide();});
