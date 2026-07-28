import assert from 'node:assert/strict';
import test from 'node:test';
import { parsePetPackJson, safePetPackDirectoryName } from './petPackInstallation';

const manifest={schemaVersion:1,id:'demo.pack',name:'Demo Pack',version:'1.0.0',pets:[{id:'demo',name:'Demo',glyph:'D',description:'Demo pet'}],assignments:[{role:'architect',petId:'demo'}]};

test('accepts a structurally valid Pet Pack manifest',()=>{const result=parsePetPackJson(JSON.stringify(manifest));assert.equal(result.errors.length,0);assert.equal(result.manifest?.id,'demo.pack');});
test('rejects malformed JSON and incomplete manifests without throwing',()=>{assert.match(parsePetPackJson('{').errors[0]??'',/not valid JSON/);assert.ok(parsePetPackJson('{}').errors.length>0);});
test('creates bounded storage directory names',()=>{assert.equal(safePetPackDirectoryName(' My / Fancy Pack '),'my-fancy-pack');assert.equal(safePetPackDirectoryName('///'),'pet-pack');});
