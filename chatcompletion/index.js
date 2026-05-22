import { ChatOllama } from '@langchain/ollama';
import { HumanMessage, AIMessage } from '@langchain/core/messages';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const llm = new ChatOllama({
  baseUrl: "http://localhost:11434",
  model: "phi3:mini"
});

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(__dirname, 'index.html'));

const history = [];

const server = http.createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(html);

  } else if (req.method === 'POST' && req.url === '/chat') {
    let body = '';
    req.on('data', chunk => (body += chunk));
    req.on('end', async () => {
      try {
        const { message } = JSON.parse(body);
        history.push(new HumanMessage(message));

        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        });

        let fullResponse = '';
        for await (const chunk of await llm.stream(history)) {
          const token = chunk.content;
          fullResponse += token;
          res.write(`data: ${JSON.stringify(token)}\n\n`);
        }

        history.push(new AIMessage(fullResponse));
        res.write('data: [DONE]\n\n');
        res.end();
      } catch (err) {
        res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
        res.end();
      }
    });

  } else if (req.method === 'POST' && req.url === '/reset') {
    history.length = 0;
    res.writeHead(200);
    res.end();

  } else {
    res.writeHead(404);
    res.end();
  }
});

server.listen(3000, () => console.log('Server running at http://localhost:3000'));
