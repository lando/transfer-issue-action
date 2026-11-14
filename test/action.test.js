const assert = require('node:assert/strict');
const {spawnSync} = require('node:child_process');
const {mkdtempSync, readFileSync, rmSync, writeFileSync} = require('node:fs');
const {tmpdir} = require('node:os');
const path = require('node:path');
const {test} = require('node:test');

// Exercise the actual action and locked Octokit stack; fetch never leaves the process.
const runner = `
const assert = require('node:assert/strict');
const fs = require('node:fs');
const calls = [];
globalThis.fetch = async (url, options) => {
  const request = {url, method: options.method, body: options.body && JSON.parse(options.body)};
  calls.push(request);
  let data = {};
  let status = 200;
  const pathname = new URL(url).pathname;
  if (pathname === '/repos/example/destination') {
    if (process.env.SCENARIO === 'denied') {
      status = 403;
      data = {message: 'Fixture access denied'};
    } else data = {node_id: 'REPO_DESTINATION'};
  } else if (pathname === '/graphql') {
    assert.match(request.body.query, /repositoryId: "REPO_DESTINATION"/);
    assert.match(request.body.query, /issueId: "ISSUE_SOURCE"/);
    data = {data: {transferIssue: {issue: {number: 42}}}};
  } else if (pathname === '/repos/example/source/issues') {
    assert.equal(request.body.title, 'Original issue');
    assert.equal(request.body.body, 'Original body');
    data = {number: 7};
  } else if (pathname === '/repos/example/source/issues/7/comments') {
    assert.match(request.body.body, /@reporter/);
    assert.ok(request.body.body.includes('destination/issues/42'));
  } else if (pathname === '/repos/example/source/issues/7') {
    assert.equal(request.body.state, 'closed');
  } else if (pathname === '/repos/example/source/issues/7/lock') {
    assert.equal(request.body.lock_reason, 'off-topic');
  } else if (pathname === '/repos/example/destination/labels') {
    if (options.method === 'GET') data = [];
    else assert.deepEqual(request.body, {name: 'Needs Triage', color: 'C0FFEE'});
  } else if (pathname === '/repos/example/destination/issues/42') {
    assert.deepEqual(request.body.labels, ['Needs Triage']);
  } else throw new Error('Unexpected request: ' + url);
  return new Response(JSON.stringify(data), {status, headers: {'content-type': 'application/json'}});
};
require('undici').fetch = globalThis.fetch;
require('node:net').Socket.prototype.connect = () => { throw new Error('Network access forbidden in action tests'); };
process.on('exit', () => fs.writeFileSync(process.env.CALLS_PATH, JSON.stringify(calls)));
require('./lib/index.js');
`;

const run = (scenario, optional = false) => {
  const directory = mkdtempSync(path.join(tmpdir(), 'transfer-action-'));
  try {
    const event = path.join(directory, 'event.json');
    const output = path.join(directory, 'output');
    const calls = path.join(directory, 'calls.json');
    writeFileSync(event, JSON.stringify({
      repository: {name: 'source', owner: {login: 'example'}},
      issue: {node_id: 'ISSUE_SOURCE', title: 'Original issue', body: 'Original body', user: {login: 'reporter'}},
      label: {name: scenario === 'skip' ? 'unrelated' : 'move'},
    }));
    writeFileSync(output, '');
    const result = spawnSync(process.execPath, ['-e', runner], {
      cwd: path.resolve(__dirname, '..'), encoding: 'utf8', timeout: 10000,
      env: {
        PATH: process.env.PATH, GITHUB_EVENT_PATH: event, GITHUB_OUTPUT: output,
        INPUT_ROUTER: 'move:destination', INPUT_TOKEN: 'fixture-token', INPUT_DEBUG: 'false',
        INPUT_CREATE_STUB: String(optional), INPUT_APPLY_LABEL: optional ? 'Needs Triage:C0FFEE' : 'false',
        SCENARIO: scenario, CALLS_PATH: calls,
      },
    });
    assert.ifError(result.error);
    return {...result, outputs: readFileSync(output, 'utf8'), calls: JSON.parse(readFileSync(calls, 'utf8'))};
  } finally {
    rmSync(directory, {recursive: true, force: true});
  }
};

test('transfers with locked Octokit, preserving optional stub and label behavior', () => {
  const result = run('transfer', true);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(result.calls.length, 10);
  for (const value of ['new_issue_number', '42', 'destination_repo', 'destination', 'stub_issue_number', '7']) {
    assert.ok(result.outputs.includes(value), result.outputs);
  }
});

test('transfers without optional mutations', () => {
  const result = run('transfer');
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(result.calls.length, 3);
  assert.ok(!result.outputs.includes('stub_issue_number'));
});

test('ignores labels that do not match the router without making requests', () => {
  const result = run('skip');
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.deepEqual(result.calls, []);
  assert.equal(result.outputs, '');
});

test('reports access errors without transferring an issue', () => {
  const result = run('denied');
  assert.equal(result.status, 1);
  assert.match(result.stdout, /Fixture access denied/);
  assert.ok(result.calls.every(call => call.method === 'GET'));
  assert.equal(result.outputs, '');
});
