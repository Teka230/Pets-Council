import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_CODEX_EFFORT,
  DEFAULT_CODEX_MODEL,
  formatTokenUsage,
  normalizeModelList,
  parseTokenUsageNotification,
  readConfigSelection,
  resolveModelSelection
} from './modelSelection';

test('defaults to gpt-5.5 medium when available', () => {
  const models = normalizeModelList({
    data: [
      {
        id: 'gpt-5',
        model: 'gpt-5',
        displayName: 'GPT-5',
        isDefault: true,
        supportedReasoningEfforts: [{ reasoningEffort: 'low' }, { reasoningEffort: 'high' }],
        defaultReasoningEffort: 'high'
      },
      {
        id: 'gpt-5.5',
        model: 'gpt-5.5',
        displayName: 'GPT-5.5',
        supportedReasoningEfforts: [{ reasoningEffort: 'medium' }, { reasoningEffort: 'high' }],
        defaultReasoningEffort: 'high'
      }
    ]
  });

  assert.deepEqual(resolveModelSelection(models, undefined), {
    model: DEFAULT_CODEX_MODEL,
    effort: DEFAULT_CODEX_EFFORT
  });
});

test('honors explicit model and effort overrides', () => {
  const models = normalizeModelList({
    data: [{
      id: 'gpt-5.5',
      model: 'gpt-5.5',
      displayName: 'GPT-5.5',
      isDefault: true,
      supportedReasoningEfforts: [{ reasoningEffort: 'medium' }, { reasoningEffort: 'high' }],
      defaultReasoningEffort: 'medium'
    }]
  });

  assert.deepEqual(resolveModelSelection(models, { model: 'gpt-5.5', effort: 'high' }), {
    model: 'gpt-5.5',
    effort: 'high'
  });
});

test('reads config defaults from snake_case keys', () => {
  assert.deepEqual(readConfigSelection({
    model: 'gpt-5.5',
    model_provider: 'openai',
    model_reasoning_effort: 'medium'
  }), {
    model: 'gpt-5.5',
    modelProvider: 'openai',
    effort: 'medium'
  });
});

test('parses thread token usage and quota hints', () => {
  const usage = parseTokenUsageNotification({
    threadId: 'thread-1',
    tokenUsage: {
      last: {
        totalTokens: 1200,
        inputTokens: 800,
        cachedInputTokens: 100,
        outputTokens: 300,
        reasoningOutputTokens: 100
      },
      modelContextWindow: 128000,
      usedPercent: 42,
      windowDurationMins: 300
    }
  });

  assert.ok(usage);
  const formatted = formatTokenUsage(usage);
  assert.ok(formatted);
  assert.match(formatted, /1,200 tokens/);
  assert.match(formatted, /800 in/);
  assert.match(formatted, /100 reasoning/);
  assert.match(formatted, /context 128K/);
  assert.match(formatted, /quota 42%/);
});
