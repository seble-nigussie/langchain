import { createAgent, tool } from "langchain";
import { ChatOllama } from "@langchain/ollama";
import { createRequire } from "module";
import * as z from "zod";
import path from "path";
import { fileURLToPath } from "url";
import http from "http";
import fs from "fs";

const require = createRequire(import.meta.url);
const Database = require("better-sqlite3");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const db = new Database(path.join(__dirname, "subscriptions.db"));
db.pragma("foreign_keys = ON");

const runSql = tool(
  ({ query }) => {
    console.log(`\n[tool] run_sql\n  SQL: ${query}`);
    try {
      const stmt = db.prepare(query);
      if (stmt.reader) {
        const rows = stmt.all();
        const result = rows.length === 0 ? "Query returned no rows." : JSON.stringify(rows, null, 2);
        console.log(`  Result: ${rows.length} row(s)`);
        return result;
      } else {
        const info = stmt.run();
        console.log(`  Result: ${info.changes} change(s)`);
        return `OK. Changes: ${info.changes}, last inserted id: ${info.lastInsertRowid}`;
      }
    } catch (err) {
      console.log(`  Error: ${err.message}`);
      return `SQL error: ${err.message}`;
    }
  },
  {
    name: "run_sql",
    description:
      "Run any SELECT or INSERT SQL statement against the subscriptions database and return the result. " +
      "Tables: categories(id, name), subscriptions(id, name, cost, billing_cycle, next_payment_date, category_id, status).",
    schema: z.object({
      query: z.string().describe("A valid SQLite SELECT or INSERT statement"),
    }),
  }
);

const agent = createAgent({
  model: new ChatOllama({ model: "qwen2.5:3b" }),
  tools: [runSql],
});

const html = fs.readFileSync(path.join(__dirname, "index.html"));
const history = [];

const server = http.createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/") {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(html);

  } else if (req.method === "POST" && req.url === "/chat") {
    let body = "";
    req.on("data", chunk => (body += chunk));
    req.on("end", async () => {
      try {
        const { message } = JSON.parse(body);
        history.push({ role: "user", content: message });
        console.log(`\n${"─".repeat(50)}\n[user] ${message}`);

        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
        });

        const result = await agent.invoke({ messages: history });
        const reply = result.messages.at(-1).content;

        history.push({ role: "assistant", content: reply });
        console.log(`\n[agent] ${reply}`);

        res.write(`data: ${JSON.stringify(reply)}\n\n`);
        res.write("data: [DONE]\n\n");
        res.end();
      } catch (err) {
        console.log(`\n[error] ${err.message}`);
        res.write(`data: ${JSON.stringify(`Error: ${err.message}`)}\n\n`);
        res.write("data: [DONE]\n\n");
        res.end();
      }
    });

  } else if (req.method === "POST" && req.url === "/reset") {
    history.length = 0;
    console.log("\n[reset] conversation history cleared");
    res.writeHead(200);
    res.end();

  } else {
    res.writeHead(404);
    res.end();
  }
});

server.listen(3000, () => console.log("Server running at http://localhost:8000"));
