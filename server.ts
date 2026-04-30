import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'fs/promises';
import { Readable } from 'stream';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Proxy to Local Ollama Chat
  app.post('/api/chat', async (req, res) => {
    const baseUrl = req.body.baseUrl || 'http://127.0.0.1:11434';
    try {
      const response = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(req.body.payload),
      });

      if (!response.ok) {
        return res
          .status(response.status)
          .json({ error: `Ollama failed: ${response.statusText}`, details: await response.text() });
      }

      if (response.body) {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Transfer-Encoding', 'chunked');
        
        // As a Web Stream, let's stream it as it comes
        const readable = Readable.fromWeb(response.body as any);
        readable.pipe(res);
      } else {
        res.end();
      }
    } catch (err: any) {
      console.error('Ollama connection error:', err);
      res.status(500).json({ error: err.message, message: 'Make sure Ollama is running locally.' });
    }
  });

  // API Proxy for Ollama Tags (Checking connection)
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
      
      // Simple path traversal check constraints to cwd
      if (!fullPath.startsWith(process.cwd())) {
         return res.status(403).json({ error: 'Invalid path' });
      }
      
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
      if (!fullPath.startsWith(process.cwd())) {
         return res.status(403).json({ error: 'Invalid path' });
      }
      
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
      if (!fullPath.startsWith(process.cwd())) {
         return res.status(403).json({ error: 'Invalid path' });
      }
      
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
      if (!fullPath.startsWith(process.cwd())) {
         return res.status(403).json({ error: 'Invalid path' });
      }
      
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
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`VibeCoder backend running on http://localhost:${PORT}`);
  });
}

startServer();
