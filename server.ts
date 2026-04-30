import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'fs/promises';
import { Readable } from 'stream';
import { fileURLToPath } from 'url';
import { WebSocketServer } from 'ws';
import { spawn } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Logging override for Output Pane
const logs: string[] = [];
const origLog = console.log;
const origError = console.error;
const origWarn = console.warn;

function addLog(level: string, ...args: any[]) {
    const msg = args.map(a => typeof a === 'string' ? a : (a instanceof Error ? a.stack || a.message : JSON.stringify(a))).join(' ');
    logs.push(`[${new Date().toISOString()}] [${level}] ${msg}`);
    if (logs.length > 500) logs.shift();
}

console.log = (...args) => { origLog(...args); addLog('INFO', ...args); };
console.error = (...args) => { origError(...args); addLog('ERROR', ...args); };
console.warn = (...args) => { origWarn(...args); addLog('WARN', ...args); };

async function startServer() {
  const app = express();
  
  // AI Studio requires Port 3000 for preview. If we are running in PM2 locally, we can default to 3003.
  const isAIStudioPreview = process.env.DISABLE_HMR === 'true'; // Set by AI Studio specifically
  const PORT = isAIStudioPreview ? 3000 : (process.env.PORT || 3003);

  app.use(express.json());

  app.get('/api/logs', (req, res) => {
    res.json(logs);
  });

  // API Proxy to Local Ollama Chat
  app.post('/api/chat', async (req, res) => {
    const baseUrl = req.body.baseUrl || 'http://127.0.0.1:11434';
    const controller = new AbortController();
    
    // Abort fetch when client disconnects
    req.on('close', () => {
      controller.abort();
    });

    try {
      const response = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(req.body.payload),
        signal: controller.signal
      });

      if (!response.ok) {
        let errStr = response.statusText;
        try {
          const errBody = await response.json();
          if (errBody.error) errStr = errBody.error + " - " + (errBody.message || errBody.details);
        } catch(e) {}
        return res.status(response.status).json({ error: `Ollama failed: ${errStr}` });
      }

      if (response.body) {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Transfer-Encoding', 'chunked');
        const readable = Readable.fromWeb(response.body as any);
        readable.pipe(res);
      } else {
        res.end();
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
         return res.end();
      }
      console.error('Ollama connection error:', err);
      res.status(500).json({ error: err.message, message: 'Make sure Ollama is running locally.' });
    }
  });

  // API Proxy for Ollama Tags
  app.post('/api/tags', async (req, res) => {
    const baseUrl = req.body.baseUrl || 'http://127.0.0.1:11434';
    try {
      const response = await fetch(`${baseUrl}/api/tags`);
      if (!response.ok) {
        return res.status(response.status).json({ error: 'Failed to fetch tags' });
      }
      const data = await response.json();
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Filesystem APIs
  app.get('/api/files', async (req, res) => {
    try {
      const getTree = async (dir: string): Promise<any[]> => {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        const items = await Promise.all(
          entries.map(async (entry) => {
            if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist') return null;
            const fullPath = path.join(dir, entry.name);
            const relPath = path.relative(process.cwd(), fullPath).replace(/\\/g, '/');
            if (entry.isDirectory()) {
              return { name: entry.name, type: 'directory', path: relPath, children: await getTree(fullPath) };
            }
            return { name: entry.name, type: 'file', path: relPath };
          })
        );
        return items.filter(Boolean);
      };
      const tree = await getTree(process.cwd());
      res.json(tree);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/file', async (req, res) => {
    try {
      const filePath = req.query.path as string;
      if (!filePath) return res.status(400).json({ error: 'path is required' });
      const fullPath = path.join(process.cwd(), filePath);
      if (!fullPath.startsWith(process.cwd())) return res.status(403).json({ error: 'Invalid path' });
      
      const content = await fs.readFile(fullPath, 'utf-8');
      res.json({ content });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/file', async (req, res) => {
    try {
      const { path: filePath, content = '' } = req.body;
      if (!filePath) return res.status(400).json({ error: 'path is required' });
      const fullPath = path.join(process.cwd(), filePath);
      if (!fullPath.startsWith(process.cwd())) return res.status(403).json({ error: 'Invalid path' });
      
      await fs.mkdir(path.dirname(fullPath), { recursive: true });
      await fs.writeFile(fullPath, content, 'utf-8');
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/dir', async (req, res) => {
    try {
      const { path: dirPath } = req.body;
      if (!dirPath) return res.status(400).json({ error: 'path is required' });
      const fullPath = path.join(process.cwd(), dirPath);
      if (!fullPath.startsWith(process.cwd())) return res.status(403).json({ error: 'Invalid path' });
      
      await fs.mkdir(fullPath, { recursive: true });
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/file', async (req, res) => {
    try {
      const filePath = req.query.path as string;
      if (!filePath) return res.status(400).json({ error: 'path is required' });
      const fullPath = path.join(process.cwd(), filePath);
      if (!fullPath.startsWith(process.cwd())) return res.status(403).json({ error: 'Invalid path' });
      
      await fs.rm(fullPath, { recursive: true, force: true });
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/search', async (req, res) => {
    try {
      const q = req.query.q as string;
      if (!q) return res.json([]);
      const results: { path: string, line: number, content: string }[] = [];
      const searchDir = async (dir: string) => {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
           if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist') continue;
           const fullPath = path.join(dir, entry.name);
           if (entry.isDirectory()) {
             await searchDir(fullPath);
           } else {
             try {
                const content = await fs.readFile(fullPath, 'utf-8');
                const lines = content.split('\n');
                lines.forEach((line, idx) => {
                   if (line.toLowerCase().includes(q.toLowerCase())) {
                      results.push({
                         path: path.relative(process.cwd(), fullPath).replace(/\\/g, '/'),
                         line: idx + 1,
                         content: line.trim()
                      });
                   }
                });
             } catch(e) {}
           }
        }
      };
      await searchDir(process.cwd());
      res.json(results);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => res.sendFile(path.join(distPath, 'index.html')));
  }

  const server = app.listen(Number(PORT), '0.0.0.0', () => {
    console.log(`VibeCoder backend running on http://localhost:${PORT}`);
  });

  // Attach WebSocket Server onto the SAME HTTP port as Express
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    const pathname = request.url ? new URL(request.url, `http://${request.headers.host}`).pathname : '';
    console.log('[WS] Upgrade request for', pathname);
    if (pathname === '/ws/terminal') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    }
    // We do NOT destroy the socket otherwise Vite HMR will break!
  });

  wss.on('connection', (ws) => {
    let shell: any;
    try {
        console.log('[WS] Terminal connected. Spawning bash...');
        // Spawn bash via python's pty module to allocate a real pseudo-terminal
        // This natively handles \r\n conversion, Ctrl+C (SIGINT), text formatting, and interactive echoing!
        shell = spawn('python3', ['-c', 'import pty; pty.spawn("/bin/bash")'], {
            env: { ...process.env, TERM: 'xterm-256color', COLORTERM: 'truecolor' },
            cwd: process.cwd(),
        });
        
        ws.on('message', (msg) => {
            if (shell?.stdin.writable) shell.stdin.write(msg.toString());
        });
        
        shell.stdout.on('data', (data: Buffer) => ws.send(data.toString()));
        shell.stderr.on('data', (data: Buffer) => ws.send(data.toString()));
        
        ws.on('close', () => shell.kill());
        shell.on('exit', () => ws.close());
    } catch(e: any) {
        ws.send(`Error starting shell: ${e.message}\r\n`);
    }
  });
}

startServer();
