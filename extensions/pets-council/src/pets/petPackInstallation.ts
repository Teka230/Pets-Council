import type { PetPackManifest } from './petPack';
import { validatePetPack } from './petPack';

export type PetPackParseResult = Readonly<{
  manifest?: PetPackManifest;
  errors: readonly string[];
}>;

export function parsePetPackJson(text: string): PetPackParseResult {
  let value: unknown;
  try { value = JSON.parse(text); }
  catch (error) { return { errors: [`pet-pack.json is not valid JSON: ${error instanceof Error ? error.message : String(error)}`] }; }
  const structural = structuralErrors(value);
  if (structural.length) return { errors: structural };
  const manifest = value as PetPackManifest;
  try {
    const errors = validatePetPack(manifest);
    return errors.length ? { errors } : { manifest, errors: [] };
  } catch (error) {
    return { errors: [`Pet Pack validation failed: ${error instanceof Error ? error.message : String(error)}`] };
  }
}

export function safePetPackDirectoryName(id: string): string {
  return id.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'pet-pack';
}

function structuralErrors(value: unknown): string[] {
  if (!isRecord(value)) return ['Pet Pack root must be an object.'];
  const errors: string[] = [];
  if (value.schemaVersion !== 1) errors.push('schemaVersion must be 1.');
  for (const field of ['id','name','version'] as const) if (!nonEmpty(value[field])) errors.push(`${field} must be a non-empty string.`);
  if (!Array.isArray(value.pets) || value.pets.length === 0) errors.push('pets must contain at least one pet.');
  if (!Array.isArray(value.assignments) || value.assignments.length === 0) errors.push('assignments must contain at least one role assignment.');
  if (Array.isArray(value.pets)) for (const [index, raw] of value.pets.entries()) {
    if (!isRecord(raw)) { errors.push(`pets[${index}] must be an object.`); continue; }
    for (const field of ['id','name','glyph','description'] as const) if (!nonEmpty(raw[field])) errors.push(`pets[${index}].${field} must be a non-empty string.`);
    if (raw.atlas !== undefined && !isRecord(raw.atlas)) errors.push(`pets[${index}].atlas must be an object.`);
  }
  if (Array.isArray(value.assignments)) for (const [index, raw] of value.assignments.entries()) {
    if (!isRecord(raw)) { errors.push(`assignments[${index}] must be an object.`); continue; }
    if (!['architect','guardian','strategist','notetaker'].includes(String(raw.role))) errors.push(`assignments[${index}].role is invalid.`);
    if (!nonEmpty(raw.petId)) errors.push(`assignments[${index}].petId must be a non-empty string.`);
  }
  return errors;
}

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function nonEmpty(value: unknown): value is string { return typeof value === 'string' && Boolean(value.trim()); }
