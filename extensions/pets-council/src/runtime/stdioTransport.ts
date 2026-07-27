import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { JsonlDecoder, encodeJsonLine } from './jsonl';
import type {
  CodexMessageTransport,
  RuntimeDisposable
} from './types';

const STDERR_TAIL_LIMIT = 4_000;

export async function createStdioCodexTransport(
  binary: string
): Promise<CodexMessageTransport> {
  return await new Promise((resolve, reject) => {
    const child = spawn(binary, ['app-server', '--listen', 'stdio://'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
      env: process.env
    });
    const transport = new StdioCodexTransport(child);
    let settled = false;

    child.once('spawn', () => {
      settled = true;
      resolve(transport);
    });

    child.once('error', (error) => {
      if (!settled) {
        settled = true;
        reject(new Error(`Unable to start Codex binary "${binary}": ${error.message}`));
      }
    });
  });
}

class StdioCodexTransport implements CodexMessageTransport {
  private readonly decoder = new JsonlDecoder();
  private readonly messageListeners = new Set<(message: unknown) => void>();
  private readonly closeListeners = new Set<(reason: string) => void>();
  private stderrTail = '';
  private closed = false;

  constructor(private readonly child: ChildProcessWithoutNullStreams) {
    child.stdout.on('data', (chunk: Buffer) => this.handleStdout(chunk));
    child.stderr.on('data', (chunk: Buffer) => this.handleStderr(chunk));
    child.on('error', (error) => this.close(`Codex process error: ${error.message}`));
    child.on('exit', (code, signal) => {
      const suffix = this.stderrTail.trim() ? ` Last stderr: ${this.stderrTail.trim()}` : '';
      this.close(
        `Codex app-server exited${code === null ? '' : ` with code ${code}`}${signal ? ` (${signal})` : ''}.${suffix}`
      );
    });
  }

  send(message: unknown): void {
    if (this.closed || !this.child.stdin.writable) {
      throw new Error('Codex app-server stdin is not writable.');
    }

    this.child.stdin.write(encodeJsonLine(message));
  }

  onMessage(listener: (message: unknown) => void): RuntimeDisposable {
    this.messageListeners.add(listener);
    return disposable(() => this.messageListeners.delete(listener));
  }

  onClose(listener: (reason: string) => void): RuntimeDisposable {
    this.closeListeners.add(listener);
    return disposable(() => this.closeListeners.delete(listener));
  }

  dispose(): void {
    if (this.closed) {
      return;
    }

    this.closed = true;
    this.child.stdin.end();
    if (this.child.exitCode === null && this.child.signalCode === null) {
      this.child.kill('SIGTERM');
      const forceKill = setTimeout(() => {
        if (this.child.exitCode === null && this.child.signalCode === null) {
          this.child.kill('SIGKILL');
        }
      }, 1_000);
      forceKill.unref();
    }

    this.messageListeners.clear();
    this.closeListeners.clear();
  }

  private handleStdout(chunk: Buffer): void {
    try {
      for (const message of this.decoder.push(chunk)) {
        for (const listener of this.messageListeners) {
          listener(message);
        }
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      this.close(`Codex app-server emitted invalid JSONL: ${detail}`);
      if (this.child.exitCode === null && this.child.signalCode === null) {
        this.child.kill('SIGTERM');
      }
    }
  }

  private handleStderr(chunk: Buffer): void {
    this.stderrTail = `${this.stderrTail}${chunk.toString('utf8')}`.slice(-STDERR_TAIL_LIMIT);
  }

  private close(reason: string): void {
    if (this.closed) {
      return;
    }

    this.closed = true;
    for (const listener of this.closeListeners) {
      listener(reason);
    }
    this.messageListeners.clear();
    this.closeListeners.clear();
  }
}

function disposable(dispose: () => void): RuntimeDisposable {
  return { dispose };
}
