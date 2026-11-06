// Starts FloodShield with one command: the backend first, then the site once the backend answers.
// Run from the project folder:  npm run dev      Stop with Ctrl+C, which stops both.
import { spawn, execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const API = 'http://127.0.0.1:8000';
const isWindows = process.platform === 'win32';
const children = [];

const say = (text) => console.log(`\x1b[36m[floodshield]\x1b[0m ${text}`);
const status = async (url) => {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
    return res.status;
  } catch {
    return 0;
  }
};

function start(name, command, args, cwd) {
  const child = spawn(command, args, { cwd, stdio: 'inherit', shell: isWindows });
  child.on('exit', (code) => {
    if (!stopping) {
      say(`The ${name} stopped (exit code ${code}). Stopping everything.`);
      stop(code ?? 1);
    }
  });
  children.push(child);
  return child;
}

let stopping = false;
function stop(code = 0) {
  stopping = true;
  for (const child of children) {
    if (child.exitCode !== null) continue;
    try {
      // On Windows the servers run under a shell, so the whole process tree has to go.
      if (isWindows) execSync(`taskkill /pid ${child.pid} /T /F`, { stdio: 'ignore' });
      else child.kill('SIGINT');
    } catch {
      /* already stopped */
    }
  }
  process.exit(code);
}
process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));

/* Port 8000 may already hold a backend, from another terminal or another copy of the project. */
const running = await status(`${API}/api/health`);
if (running) {
  if ((await status(`${API}/api/live`)) === 404) {
    say('Port 8000 is used by an older FloodShield backend without live forecasts, probably from another folder.');
    say('Stop it with Ctrl+C in the terminal that started it, then run npm run dev again.');
    process.exit(1);
  }
  say('A FloodShield backend is already running on port 8000, so it will be used.');
} else {
  say('Starting the backend on port 8000. The model takes about 20 seconds to load.');
  start('backend', 'python', ['-m', 'uvicorn', 'app.backend.main:app', '--host', '127.0.0.1', '--port', '8000'], ROOT);
  const deadline = Date.now() + 120_000;
  while ((await status(`${API}/api/health`)) !== 200) {
    if (stopping) process.exit(1);
    if (Date.now() > deadline) {
      say('The backend did not answer within 2 minutes. Check the messages above.');
      stop(1);
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  say('Backend ready.');
}

say('Starting the site. Open http://localhost:5173/dashboard');
start('site', 'npm', ['run', 'dev'], path.join(ROOT, 'app', 'frontend'));
