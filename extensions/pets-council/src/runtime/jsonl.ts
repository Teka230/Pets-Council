export class JsonlDecoder {
  private buffer = '';

  push(chunk: string | Uint8Array): readonly unknown[] {
    this.buffer += typeof chunk === 'string'
      ? chunk
      : Buffer.from(chunk).toString('utf8');

    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() ?? '';

    return lines
      .map((line) => line.endsWith('\r') ? line.slice(0, -1) : line)
      .filter((line) => line.trim().length > 0)
      .map(parseJsonLine);
  }

  finish(): readonly unknown[] {
    const finalLine = this.buffer.trim();
    this.buffer = '';
    return finalLine ? [parseJsonLine(finalLine)] : [];
  }
}

export function encodeJsonLine(message: unknown): string {
  return `${JSON.stringify(message)}\n`;
}

function parseJsonLine(line: string): unknown {
  try {
    return JSON.parse(line) as unknown;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid JSONL message: ${detail}`);
  }
}
