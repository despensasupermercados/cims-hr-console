import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runMaria, MARIA_TOOLS, mariaSystemPrompt } from '../src/maria.js';

test('MARIA_TOOLS: read-only catalogue is well-formed', () => {
  assert.ok(MARIA_TOOLS.length >= 6);
  for (const t of MARIA_TOOLS) {
    assert.ok(t.name && t.description && t.input_schema, 'tool needs name/description/input_schema');
    assert.equal(t.input_schema.type, 'object');
  }
  const names = MARIA_TOOLS.map(t => t.name);
  assert.ok(names.includes('find_crew') && names.includes('contract_ledger'));
});

test('mariaSystemPrompt: enforces read-only + no-fabrication + baseline rule', () => {
  const p = mariaSystemPrompt('2026-06-25');
  assert.match(p, /READ-ONLY/);
  assert.match(p, /baseline pending/);
  assert.match(p, /2026-06-25/);
});

test('runMaria: executes a tool then answers from the result', async () => {
  let call = 0;
  const fetchImpl = async (_url, opts) => {
    call++;
    const body = JSON.parse(opts.body);
    if (call === 1) {
      // model decides to call find_crew
      assert.ok(body.tools && body.tools.length, 'tools must be sent');
      return { ok: true, json: async () => ({ stop_reason: 'tool_use', content: [
        { type: 'tool_use', id: 'tu_1', name: 'find_crew', input: { name: 'Cruz' } }
      ] }) };
    }
    // second call: the tool_result must have been appended
    const last = body.messages[body.messages.length - 1];
    assert.equal(last.role, 'user');
    assert.equal(last.content[0].type, 'tool_result');
    assert.match(last.content[0].content, /On board/);
    return { ok: true, json: async () => ({ stop_reason: 'end_turn', content: [
      { type: 'text', text: 'Juan Cruz is On board the Symphony.' }
    ] }) };
  };
  const execTool = async (name, input) => {
    assert.equal(name, 'find_crew');
    assert.equal(input.name, 'Cruz');
    return { matches: [{ name: 'Cruz, Juan', status: 'On board', vessel: 'Symphony' }] };
  };
  const res = await runMaria({ apiKey: 'k', question: 'where is cruz?', execTool, fetchImpl, today: '2026-06-25' });
  assert.equal(res.answer, 'Juan Cruz is On board the Symphony.');
  assert.deepEqual(res.sources, ['find_crew']);
  assert.equal(call, 2);
});

test('runMaria: returns error on model HTTP failure', async () => {
  const fetchImpl = async () => ({ ok: false, status: 529, text: async () => 'overloaded' });
  const res = await runMaria({ apiKey: 'k', question: 'hi', execTool: async () => ({}), fetchImpl });
  assert.equal(res.answer, null);
  assert.match(res.error, /model_http_529/);
});

test('runMaria: answers directly when no tool needed', async () => {
  const fetchImpl = async () => ({ ok: true, json: async () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'I can only report CIMS data, not change it.' }] }) });
  const res = await runMaria({ apiKey: 'k', question: 'delete all crew', execTool: async () => ({}), fetchImpl });
  assert.match(res.answer, /report/);
  assert.deepEqual(res.sources, []);
});

test('MARIA_TOOLS: includes schedule-backed upcoming_movements', () => {
  const t = MARIA_TOOLS.find(x => x.name === 'upcoming_movements');
  assert.ok(t, 'upcoming_movements tool must exist');
  assert.match(t.description, /LIVE rotation schedule|debark/i);
  assert.ok(t.input_schema.properties.days, 'takes a days window');
});
