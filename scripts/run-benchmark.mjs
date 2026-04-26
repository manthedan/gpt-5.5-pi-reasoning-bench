#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, rmSync, readdirSync, statSync, appendFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const configPath = resolve(process.argv[2] ?? join(root, 'bench.config.json'));
const config = JSON.parse(readFileSync(configPath, 'utf8'));
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const outDir = resolve(config.outputDir ?? join(root, 'results', stamp));
const workspaceRoot = join(outDir, 'workspaces');
const sessionDir = join(outDir, 'sessions');
mkdirSync(workspaceRoot, { recursive: true });
mkdirSync(sessionDir, { recursive: true });

const results = [];

for (const taskId of config.tasks) {
  const task = JSON.parse(readFileSync(join(root, 'tasks', `${taskId}.json`), 'utf8'));
  for (const thinking of config.thinkingLevels) {
    for (let rep = 1; rep <= (config.repetitions ?? 1); rep++) {
      const runId = `${task.id}__${thinking}__r${rep}`;
      const cwd = join(workspaceRoot, runId);
      console.log(`\n=== ${runId} ===`);
      setupWorkspace(task, cwd);
      const result = await runPi({ task, cwd, runId, thinking });
      results.push(result);
      writeFileSync(join(outDir, 'results.json'), JSON.stringify(results, null, 2));
      writeCsv(results, join(outDir, 'results.csv'));
      writeMarkdown(results, join(outDir, 'README.md'));
      console.log(`${result.status} time=${result.durationSeconds.toFixed(1)}s tokens=${result.usage.totalTokens} tests=${result.tests.exitCode}`);
    }
  }
}

console.log(`\nWrote results to ${outDir}`);

function setupWorkspace(task, cwd) {
  rmSync(cwd, { recursive: true, force: true });
  mkdirSync(cwd, { recursive: true });
  for (const [rel, content] of Object.entries(task.files)) {
    const path = join(cwd, rel);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
  }
  if (task.evaluationRubric?.length) {
    writeFileSync(join(cwd, 'EVALUATION_RUBRIC.md'), `# Human evaluation rubric\n\n${task.evaluationRubric.map(item => `- ${item}`).join('\n')}\n`);
  }
  run('git', ['init'], cwd);
  run('git', ['config', 'user.email', 'bench@example.local'], cwd);
  run('git', ['config', 'user.name', 'Pi Bench'], cwd);
  run('git', ['add', '.'], cwd);
  run('git', ['commit', '-m', 'baseline'], cwd);
}

async function runPi({ task, cwd, runId, thinking }) {
  const prompt = [
    task.prompt,
    '',
    'Benchmark constraints:',
    '- Work autonomously; do not ask questions.',
    '- Modify files in this repository as needed.',
    `- Test command: ${task.testCommand}`,
    '- When done, provide a concise summary of what changed and test results.'
  ].join('\n');

  const args = [
    '--mode', 'json',
    '--session-dir', sessionDir,
    '--model', config.model,
    '--thinking', thinking,
    ...(config.piArgs ?? []),
    prompt
  ];

  const stdoutPath = join(outDir, `${runId}.events.jsonl`);
  const stderrPath = join(outDir, `${runId}.stderr.log`);
  const started = Date.now();
  // Important: in JSON/print modes pi reads piped stdin and waits for EOF.
  // Node's default spawn stdin is an open pipe, so ignore stdin or pi will hang.
  const pi = spawn('pi', args, { cwd, env: { ...process.env, PI_SKIP_VERSION_CHECK: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '';
  let stderr = '';
  let eventBuffer = '';
  let timedOut = false;
  let lastProgressAt = Date.now();
  const timeout = setTimeout(() => {
    timedOut = true;
    pi.kill('SIGTERM');
    setTimeout(() => pi.kill('SIGKILL'), 5000).unref();
  }, (config.timeoutSeconds ?? 900) * 1000);

  writeFileSync(stdoutPath, '');
  writeFileSync(stderrPath, '');
  pi.stdout.on('data', d => {
    const chunk = d.toString();
    stdout += chunk;
    appendFileSync(stdoutPath, chunk);
    eventBuffer = processEventChunk(eventBuffer + chunk, runId, () => lastProgressAt = Date.now());
  });
  pi.stderr.on('data', d => {
    const chunk = d.toString();
    stderr += chunk;
    appendFileSync(stderrPath, chunk);
    for (const line of chunk.split('\n').filter(Boolean)) console.log(`  [stderr] ${line}`);
  });

  const heartbeat = setInterval(() => {
    const elapsed = ((Date.now() - started) / 1000).toFixed(0);
    const idle = ((Date.now() - lastProgressAt) / 1000).toFixed(0);
    console.log(`  [heartbeat] elapsed=${elapsed}s idle=${idle}s events=${stdout.split('\n').filter(Boolean).length}`);
  }, 60_000);

  const exitCode = await new Promise(resolve => pi.on('close', resolve));
  clearTimeout(timeout);
  clearInterval(heartbeat);
  const ended = Date.now();
  writeFileSync(stdoutPath, stdout);
  writeFileSync(stderrPath, stderr);

  const metrics = parseEvents(stdout);
  const tests = runShell(task.testCommand, cwd, 120_000);
  const diff = run('git', ['diff', '--stat'], cwd).stdout;
  const patch = run('git', ['diff'], cwd).stdout;
  const numstat = run('git', ['diff', '--numstat'], cwd).stdout;
  writeFileSync(join(outDir, `${runId}.diff.patch`), patch);
  writeFileSync(join(outDir, `${runId}.test.stdout.log`), tests.stdout);
  writeFileSync(join(outDir, `${runId}.test.stderr.log`), tests.stderr);

  const sessionFile = findSessionForCwd(sessionDir, cwd);
  const selfAnalysis = task.id === 'js-agent-session-inspector-open-ended'
    ? runSessionInspectorAgainstOwnSession({ cwd, runId, sessionFile })
    : undefined;

  const status = timedOut ? 'timeout' : exitCode === 0 ? (tests.exitCode === 0 ? 'pass' : 'test_fail') : 'pi_fail';
  return {
    runId,
    taskId: task.id,
    title: task.title,
    model: config.model,
    thinking,
    repetition: Number(runId.match(/__r(\d+)$/)?.[1] ?? 1),
    status,
    piExitCode: exitCode,
    durationSeconds: (ended - started) / 1000,
    usage: metrics.usage,
    toolCalls: metrics.toolCalls,
    assistantTurns: metrics.assistantTurns,
    finalAssistantText: metrics.finalAssistantText,
    tests: { exitCode: tests.exitCode, command: task.testCommand },
    diff: { stat: diff, numstat, ...summarizeNumstat(numstat) },
    evaluationRubric: task.evaluationRubric ?? [],
    selfAnalysis,
    artifacts: {
      events: stdoutPath,
      stderr: stderrPath,
      patch: join(outDir, `${runId}.diff.patch`),
      workspace: cwd,
      session: sessionFile,
      selfAnalysisStdout: selfAnalysis?.stdoutPath,
      selfAnalysisStderr: selfAnalysis?.stderrPath
    }
  };
}

function processEventChunk(buffer, runId, markProgress) {
  const lines = buffer.split('\n');
  const remainder = lines.pop() ?? '';
  for (const line of lines) {
    if (!line.trim()) continue;
    let event;
    try { event = JSON.parse(line); } catch { continue; }
    const msg = formatProgressEvent(event);
    if (msg) {
      markProgress();
      console.log(`  ${msg}`);
    }
  }
  return remainder;
}

function formatProgressEvent(event) {
  switch (event.type) {
    case 'session':
      return `[session] ${event.id}`;
    case 'agent_start':
      return '[agent] start';
    case 'agent_end':
      return '[agent] end';
    case 'turn_start':
      return '[turn] start';
    case 'tool_execution_start':
      return `[tool:start] ${event.toolName} ${summarizeToolArgs(event.toolName, event.args)}`.trimEnd();
    case 'tool_execution_end':
      return `[tool:end] ${event.toolName} ${event.isError ? 'ERROR' : 'ok'}`;
    case 'message_end': {
      const role = event.message?.role;
      if (role === 'assistant') {
        const u = event.message.usage;
        const usage = u ? ` tokens=${u.totalTokens ?? 0} in=${u.input ?? 0} out=${u.output ?? 0} cache=${u.cacheRead ?? 0}` : '';
        const stop = event.message.stopReason ? ` stop=${event.message.stopReason}` : '';
        const text = contentText(event.message.content).replace(/\s+/g, ' ').trim();
        return `[assistant]${stop}${usage}${text ? ` — ${truncate(text, 120)}` : ''}`;
      }
      return undefined;
    }
    case 'auto_retry_start':
      return `[retry] attempt=${event.attempt}/${event.maxAttempts} delay=${event.delayMs}ms ${event.errorMessage ?? ''}`;
    case 'compaction_start':
      return `[compaction] start reason=${event.reason}`;
    case 'compaction_end':
      return `[compaction] end reason=${event.reason} aborted=${event.aborted}`;
    default:
      return undefined;
  }
}

function summarizeToolArgs(toolName, args) {
  if (!args || typeof args !== 'object') return '';
  if (toolName === 'bash') return truncate(JSON.stringify({ command: args.command }), 160);
  if (toolName === 'read') return truncate(JSON.stringify({ path: args.path }), 160);
  if (toolName === 'write' || toolName === 'edit') return truncate(JSON.stringify({ path: args.path }), 160);
  return truncate(JSON.stringify(args), 160);
}

function truncate(text, max) {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function findSessionForCwd(dir, cwd) {
  const matches = [];
  for (const file of listFiles(dir)) {
    if (!file.endsWith('.jsonl')) continue;
    try {
      const firstLine = readFileSync(file, 'utf8').split('\n')[0];
      const header = JSON.parse(firstLine);
      if (header.type === 'session' && header.cwd === cwd) {
        matches.push({ file, mtimeMs: statSync(file).mtimeMs });
      }
    } catch {
      // Ignore partial or non-session JSONL files.
    }
  }
  matches.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return matches[0]?.file;
}

function listFiles(dir) {
  let files = [];
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, name.name);
    if (name.isDirectory()) files = files.concat(listFiles(path));
    else files.push(path);
  }
  return files;
}

function runSessionInspectorAgainstOwnSession({ cwd, runId, sessionFile }) {
  const stdoutPath = join(outDir, `${runId}.self-analysis.stdout.log`);
  const stderrPath = join(outDir, `${runId}.self-analysis.stderr.log`);
  if (!sessionFile) {
    const result = { exitCode: 1, ok: false, error: 'No matching pi session file found for this workspace.', stdoutPath, stderrPath };
    writeFileSync(stdoutPath, '');
    writeFileSync(stderrPath, result.error + '\n');
    return result;
  }

  const code = `
    import { readFileSync } from 'node:fs';
    import { parseSessionJsonl, analyzeSession, formatReport } from './session-inspector.js';
    const text = readFileSync(${JSON.stringify(sessionFile)}, 'utf8');
    const parsed = parseSessionJsonl(text);
    const entries = Array.isArray(parsed) ? parsed : parsed.entries;
    const diagnostics = Array.isArray(parsed) ? [] : (parsed.diagnostics ?? []);
    const analysis = analyzeSession(entries, diagnostics);
    const report = formatReport(analysis);
    console.log(String(report));
    console.log('\\n---SELF_ANALYSIS_JSON---');
    console.log(JSON.stringify({
      entries: entries?.length ?? 0,
      diagnostics: diagnostics.length,
      metrics: analysis?.metrics ?? null
    }, null, 2));
  `;
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', code], { cwd, encoding: 'utf8', timeout: 120_000 });
  writeFileSync(stdoutPath, r.stdout ?? '');
  writeFileSync(stderrPath, r.stderr ?? '');
  return {
    exitCode: r.status ?? 1,
    ok: (r.status ?? 1) === 0,
    sessionFile,
    stdoutPath,
    stderrPath
  };
}

function parseEvents(jsonl) {
  const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, costTotal: 0 };
  const toolCalls = {};
  let assistantTurns = 0;
  let finalAssistantText = '';
  for (const line of jsonl.split('\n')) {
    if (!line.trim()) continue;
    let event;
    try { event = JSON.parse(line); } catch { continue; }
    if (event.type === 'tool_execution_start') toolCalls[event.toolName] = (toolCalls[event.toolName] ?? 0) + 1;
    if (event.type === 'turn_end' && event.message?.role === 'assistant') assistantTurns++;
    // Count usage on message_end only. turn_end repeats the same assistant message.
    if (event.type === 'message_end' && event.message?.role === 'assistant') {
      const u = event.message.usage;
      if (u) {
        usage.input += u.input ?? 0;
        usage.output += u.output ?? 0;
        usage.cacheRead += u.cacheRead ?? 0;
        usage.cacheWrite += u.cacheWrite ?? 0;
        usage.totalTokens += u.totalTokens ?? ((u.input ?? 0) + (u.output ?? 0));
        usage.costTotal += u.cost?.total ?? 0;
      }
      const text = contentText(event.message.content);
      if (text) finalAssistantText = text;
    }
  }
  return { usage, toolCalls, assistantTurns, finalAssistantText };
}

function contentText(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content.filter(b => b.type === 'text').map(b => b.text).join('\n');
}

function summarizeNumstat(numstat) {
  let added = 0, deleted = 0, filesChanged = 0;
  for (const line of numstat.trim().split('\n')) {
    if (!line) continue;
    const [a, d] = line.split('\t');
    added += Number(a) || 0;
    deleted += Number(d) || 0;
    filesChanged++;
  }
  return { filesChanged, added, deleted };
}

function run(cmd, args, cwd) {
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8' });
  return { exitCode: r.status ?? 1, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

function runShell(command, cwd, timeout) {
  const r = spawnSync(command, { cwd, shell: true, encoding: 'utf8', timeout });
  return { exitCode: r.status ?? 1, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

function writeCsv(rows, path) {
  const headers = ['runId','taskId','model','thinking','status','durationSeconds','totalTokens','input','output','cacheRead','cacheWrite','costTotal','assistantTurns','filesChanged','added','deleted','testExitCode','selfAnalysisOk'];
  const lines = [headers.join(',')];
  for (const r of rows) lines.push([
    r.runId, r.taskId, r.model, r.thinking, r.status, r.durationSeconds.toFixed(3), r.usage.totalTokens, r.usage.input, r.usage.output, r.usage.cacheRead, r.usage.cacheWrite, r.usage.costTotal, r.assistantTurns, r.diff.filesChanged, r.diff.added, r.diff.deleted, r.tests.exitCode, r.selfAnalysis?.ok ?? ''
  ].map(csv).join(','));
  writeFileSync(path, lines.join('\n') + '\n');
}

function csv(v) {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? '"' + s.replaceAll('"', '""') + '"' : s;
}

function writeMarkdown(rows, path) {
  const lines = ['# Pi reasoning benchmark results', '', '| run | status | time | tokens | cost | diff | tests | self-analysis |', '|---|---:|---:|---:|---:|---:|---:|---:|'];
  for (const r of rows) {
    const self = r.selfAnalysis ? (r.selfAnalysis.ok ? 'ok' : 'fail') : '';
    lines.push(`| ${r.runId} | ${r.status} | ${r.durationSeconds.toFixed(1)}s | ${r.usage.totalTokens} | $${r.usage.costTotal.toFixed(4)} | +${r.diff.added}/-${r.diff.deleted} | ${r.tests.exitCode} | ${self} |`);
  }
  writeFileSync(path, lines.join('\n') + '\n');
}
