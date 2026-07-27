import assert from 'node:assert/strict';
import test from 'node:test';
import { JsonlDecoder, encodeJsonLine } from './jsonl';

test('decodes multiple newline-delimited messages', () => {
  const decoder = new JsonlDecoder();

  assert.deepEqual(
    decoder.push('{"id":1,"result":{}}\n{"method":"initialized"}\n'),
    [
      { id: 1, result: {} },
      { method: 'initialized' }
    ]
  );
});

test('keeps an incomplete message until the next chunk', () => {
  const decoder = new JsonlDecoder();

  assert.deepEqual(decoder.push('{"id":1,'), []);
  assert.deepEqual(decoder.push('"result":{"ok":true}}\n'), [
    { id: 1, result: { ok: true } }
  ]);
});

test('accepts a final message without a newline', () => {
  const decoder = new JsonlDecoder();
  decoder.push('{"method":"warning"}');

  assert.deepEqual(decoder.finish(), [{ method: 'warning' }]);
});

test('rejects invalid JSONL without echoing the payload', () => {
  const decoder = new JsonlDecoder();

  assert.throws(
    () => decoder.push('{not-json}\n'),
    /Invalid JSONL message/
  );
});

test('encodes exactly one JSON message per line', () => {
  assert.equal(
    encodeJsonLine({ method: 'initialized' }),
    '{"method":"initialized"}\n'
  );
});
