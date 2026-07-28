import * as vscode from 'vscode';
import type { PetPackManifest } from './petPack';
import { parsePetPackJson, safePetPackDirectoryName } from './petPackInstallation';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export class ExternalPetPackStore {
  constructor(private readonly root: vscode.Uri, private readonly state: vscode.Memento) {}

  async load(workspaceKey: string): Promise<PetPackManifest | undefined> {
    const location = this.state.get<string>(storageKey(workspaceKey));
    if (!location) return undefined;
    try {
      const text = decoder.decode(await vscode.workspace.fs.readFile(vscode.Uri.parse(location)));
      const parsed = parsePetPackJson(text);
      if (parsed.manifest) return parsed.manifest;
      await this.restoreBuiltin(workspaceKey);
      return undefined;
    } catch {
      await this.restoreBuiltin(workspaceKey);
      return undefined;
    }
  }

  async install(workspaceKey: string, sourceFolder: vscode.Uri): Promise<PetPackManifest> {
    const source = vscode.Uri.joinPath(sourceFolder, 'pet-pack.json');
    const text = decoder.decode(await vscode.workspace.fs.readFile(source));
    const parsed = parsePetPackJson(text);
    if (!parsed.manifest) throw new Error(parsed.errors.join('\n'));
    const targetDirectory = vscode.Uri.joinPath(this.root, 'pet-packs', safePetPackDirectoryName(parsed.manifest.id));
    const target = vscode.Uri.joinPath(targetDirectory, 'pet-pack.json');
    await vscode.workspace.fs.createDirectory(targetDirectory);
    await vscode.workspace.fs.writeFile(target, encoder.encode(`${JSON.stringify(parsed.manifest, null, 2)}\n`));
    await this.state.update(storageKey(workspaceKey), target.toString());
    return parsed.manifest;
  }

  async restoreBuiltin(workspaceKey: string): Promise<void> {
    await this.state.update(storageKey(workspaceKey), undefined);
  }
}

function storageKey(workspaceKey: string): string { return `activePetPack:${workspaceKey}`; }
