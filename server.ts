import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { Readable } from 'stream';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Proxy to Local Ollama
  app.post('/api/chat', async (req, res) => {
    try {
      const response = await fetch('http://127.0.0.1:11434/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(req.body),
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
