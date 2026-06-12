#!/usr/bin/env node
import axios from "axios";
import { createServer } from "http";
import { execSync } from "child_process";
import { writeFileSync, readFileSync, existsSync } from "fs";
import { homedir } from "os";
import { join, dirname } from "path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// ── Jira credentials (injected by MCP client via env) ──────────────────────
let JIRA_EMAIL = process.env.JIRA_EMAIL;
let JIRA_TOKEN = process.env.JIRA_TOKEN;
let JIRA_DOMAIN = process.env.JIRA_DOMAIN;
let JIRA_PROJECT = process.env.JIRA_PROJECT;

const missing = ["JIRA_EMAIL", "JIRA_TOKEN", "JIRA_DOMAIN", "JIRA_PROJECT"].filter(k => !process.env[k]);

// ── Setup mode: launch browser UI when credentials are missing ───────────────
if (missing.length) {
  const SETUP_PORT = 9898;

  function openBrowser(url) {
    try {
      const cmd = process.platform === "win32" ? `start "" "${url}"`
        : process.platform === "darwin" ? `open "${url}"`
          : `xdg-open "${url}"`;
      execSync(cmd, { stdio: "ignore" });
    } catch { /* user will open manually */ }
  }

  function getMcpConfigs() {
    const isMac = process.platform === "darwin";
    const isWin = process.platform === "win32";
    const isLinux = process.platform === "linux";
    const home = homedir();
    const appData = process.env.APPDATA || home;

    return [
      {
        name: "VS Code",
        path: isMac || isLinux
          ? join(home, "Library", "Application Support", "Code", "User", "mcp.json")
          : join(appData, "Code", "User", "mcp.json"),
        key: "servers"
      },
      {
        name: "Cursor",
        path: isMac
          ? join(home, "Library", "Application Support", "Cursor", "User", "mcp.json")
          : isLinux
            ? join(home, ".config", "Cursor", "User", "mcp.json")
            : join(appData, "Cursor", "User", "mcp.json"),
        key: "servers"
      },
      {
        name: "Claude Desktop",
        path: isMac
          ? join(home, "Library", "Application Support", "Claude", "claude_desktop_config.json")
          : join(appData, "Claude", "claude_desktop_config.json"),
        key: "mcpServers"
      },
      {
        name: "Antigravity",
        path: join(home, ".gemini", "config", "mcp_config.json"),
        key: "mcpServers"
      }
    ];
  }

  function readMcpJson(path) {
    try { return JSON.parse(readFileSync(path, "utf8")); } catch { return { servers: {} }; }
  }

  const SETUP_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"><title>jira-mcp setup</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#0d1117;color:#e6edf3;min-height:100vh;display:flex;align-items:center;justify-content:center}
    .card{background:#161b22;border:1px solid #30363d;border-radius:12px;padding:40px;width:480px}
    .logo{display:flex;align-items:center;gap:10px;margin-bottom:28px}
    .logo span{font-size:20px;font-weight:600}
    h1{font-size:18px;font-weight:600;margin-bottom:8px}
    p{color:#8b949e;font-size:14px;margin-bottom:24px;line-height:1.5}
    label{display:block;font-size:13px;font-weight:500;margin-bottom:6px;color:#c9d1d9}
    input{width:100%;background:#0d1117;border:1px solid #30363d;border-radius:6px;padding:10px 12px;color:#e6edf3;font-size:14px;outline:none;margin-bottom:16px}
    input:focus{border-color:#388bfd}
    .token-row{display:flex;gap:8px;align-items:flex-start}
    .token-row input{margin-bottom:0}
    .open-btn{white-space:nowrap;background:#21262d;border:1px solid #30363d;border-radius:6px;padding:10px 14px;color:#c9d1d9;font-size:13px;cursor:pointer;margin-bottom:16px}
    .open-btn:hover{background:#30363d}
    button[type=submit]{width:100%;background:#1f6feb;border:none;border-radius:6px;padding:12px;color:#fff;font-size:15px;font-weight:600;cursor:pointer;margin-top:4px}
    button[type=submit]:hover{background:#388bfd}
    .status{display:none;margin-top:20px;padding:14px;border-radius:6px;font-size:14px}
    .status.ok{background:#0d3321;border:1px solid #1a7f37;color:#3fb950;display:block}
    .status.err{background:#2d0f0e;border:1px solid #f85149;color:#f85149;display:block}
    hr{border:none;border-top:1px solid #21262d;margin:20px 0}
  </style>
</head>
<body>
<div class="card">
  <div class="logo">
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none"><rect width="32" height="32" rx="8" fill="#1f6feb"/><path d="M16 7L7 25h5l4-8 4 8h5L16 7z" fill="white"/></svg>
    <span>jira-mcp setup</span>
  </div>
  <h1>Connect to Jira</h1>
  <p>Your credentials are saved locally to your MCP client configs only — never sent anywhere else.</p>
  <form id="form">
    <label>Jira email</label>
    <input name="email" type="email" placeholder="you@company.com" required autocomplete="email"/>
    <label>API token</label>
    <div class="token-row">
      <input name="token" type="password" placeholder="Paste your API token here" required/>
      <button type="button" class="open-btn" onclick="window.open('https://id.atlassian.com/manage-profile/security/api-tokens','_blank')">Get token ↗</button>
    </div>
    <label>Jira domain</label>
    <input name="domain" type="text" placeholder="yourcompany.atlassian.net" required/>
    <label>Project key</label>
    <input name="project" type="text" placeholder="PROJ" required style="text-transform:uppercase"/>
    <hr/>
    <button type="submit">Connect &amp; save to detected clients ✓</button>
  </form>
  <div class="status" id="status"></div>
</div>
<script>
document.getElementById("form").addEventListener("submit",async(e)=>{
  e.preventDefault();
  const btn=e.target.querySelector("button[type=submit]");
  btn.textContent="Connecting...";btn.disabled=true;
  const status=document.getElementById("status");
  status.className="status";
  const body=Object.fromEntries(new FormData(e.target));
  body.project=body.project.toUpperCase();
  try{
    const res=await fetch("/save",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
    const data=await res.json();
    if(data.ok){status.className="status ok";status.textContent="✅ "+data.message;btn.textContent="Done! You can close this tab.";}
    else throw new Error(data.error);
  }catch(err){status.className="status err";status.textContent="❌ "+err.message;btn.textContent="Connect & save to detected clients ✓";btn.disabled=false;}
});
</script>
</body></html>`;

  // Start local setup server
  const setupServer = createServer((req, res) => {
    if (req.method === "GET" && req.url === "/") {
      res.writeHead(200, { "Content-Type": "text/html" });
      return res.end(SETUP_HTML);
    }
    if (req.method === "POST" && req.url === "/save") {
      let body = "";
      req.on("data", chunk => { body += chunk; });
      req.on("end", async () => {
        res.writeHead(200, { "Content-Type": "application/json" });
        try {
          const { email, token, domain, project } = JSON.parse(body);
          await axios.get(`https://${domain}/rest/api/3/myself`, {
            auth: { username: email, password: token },
          });
          const configs = getMcpConfigs();
          const updatedClients = [];

          for (const config of configs) {
            const dir = dirname(config.path);
            if (existsSync(dir)) {
              const mcp = readMcpJson(config.path);
              mcp[config.key] = mcp[config.key] || {};
              const existing = mcp[config.key]["jira-mcp"] || {};
              mcp[config.key]["jira-mcp"] = {
                command: existing.command || "npx",
                args: existing.args || ["-y", "@abdelrahmanhsn/jira-mcp"],
                env: {
                  ...(existing.env || {}),
                  JIRA_EMAIL: email,
                  JIRA_TOKEN: token,
                  JIRA_DOMAIN: domain,
                  JIRA_PROJECT: project
                },
              };
              try {
                writeFileSync(config.path, JSON.stringify(mcp, null, 2));
                updatedClients.push(config.name);
              } catch (err) {
                // Ignore write errors for individual clients
              }
            }
          }

          if (updatedClients.length === 0) {
            res.end(JSON.stringify({ ok: false, error: "No supported MCP client configurations found." }));
            return;
          }

          res.end(JSON.stringify({ ok: true, message: `Connected! You can now close this tab, the MCP server is starting automatically.` }));
          process.stderr.write(`[jira-mcp] ✅ Setup complete. Updated config for: ${updatedClients.join(", ")}\n`);
          setupServer.close();

          // Update global variables
          JIRA_EMAIL = email;
          JIRA_TOKEN = token;
          JIRA_DOMAIN = domain;
          JIRA_PROJECT = project;

          // Start the MCP server without exiting
          startMcpServer();
        } catch (e) {
          const msg = e.response?.status === 401 ? "Invalid email or API token."
            : e.response?.status === 404 ? "Jira domain not found."
              : e.message;
          res.end(JSON.stringify({ ok: false, error: msg }));
        }
      });
      return;
    }
    res.writeHead(404); res.end();
  });

  setupServer.listen(SETUP_PORT, "127.0.0.1", () => {
    const url = `http://localhost:${SETUP_PORT}`;
    // Send MCP-compatible log message so VS Code shows it in the chat panel
    process.stderr.write(
      `[jira-mcp] ⚙️  Setup required — opening browser to configure your Jira credentials.\n` +
      `[jira-mcp] If the browser didn't open: ${url}\n`
    );
    openBrowser(url);
  });

  // Keep process alive until setup completes
  process.on("SIGINT", () => { setupServer.close(); process.exit(0); });

}

async function startMcpServer() {

  const jiraClient = axios.create({
    baseURL: `https://${JIRA_DOMAIN}/rest/api/3`,
    auth: { username: JIRA_EMAIL, password: JIRA_TOKEN },
  });

  // ── Helper ───────────────────────────────────────────────────────────────────
  async function searchJira(jql, fields = "summary,status,priority,description,issuetype,attachment,reporter") {
    const response = await jiraClient.get("/search/jql", { params: { jql, fields } });
    return (response.data.issues || []).map(i => ({
      key: i.key,
      summary: i.fields?.summary,
      status: i.fields?.status?.name,
      priority: i.fields?.priority?.name,
      type: i.fields?.issuetype?.name,
      reporter: i.fields?.reporter?.displayName,
      description: JSON.stringify(i.fields?.description),
      attachments: (i.fields?.attachment || []).map(a => a.content),
    }));
  }

  // ── MCP Server ───────────────────────────────────────────────────────────────
  const server = new McpServer({
    name: "jira-mcp",
    version: "1.0.0",
  });

  // Tool: get_my_tickets
  server.tool(
    "get_my_tickets",
    "Get all Jira tickets assigned to the current user",
    {},
    async () => {
      const result = await searchJira("assignee = currentUser() ORDER BY updated DESC");
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  // Tool: get_active_sprint_tickets
  server.tool(
    "get_active_sprint_tickets",
    "Get user tickets in the active sprint for the configured Jira project",
    {},
    async () => {
      const result = await searchJira(
        `project = '${JIRA_PROJECT}' AND sprint IN openSprints() AND assignee = currentUser()`
      );
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  // Tool: get_issue_details
  server.tool(
    "get_issue_details",
    "Get full details (description + attachments) for a specific Jira issue",
    { issueKey: z.string().describe("The Jira issue key, e.g. STUD-17797") },
    async ({ issueKey }) => {
      const response = await jiraClient.get(`/issue/${issueKey}`);
      return { content: [{ type: "text", text: JSON.stringify(response.data, null, 2) }] };
    }
  );

  // Tool: add_comment
  server.tool(
    "add_comment",
    "Add a comment to a Jira issue",
    {
      issueKey: z.string().describe("The Jira issue key, e.g. PROJ-123"),
      comment: z.string().describe("The comment text to add"),
    },
    async ({ issueKey, comment }) => {
      await jiraClient.post(`/issue/${issueKey}/comment`, {
        body: {
          type: "doc",
          version: 1,
          content: [{ type: "paragraph", content: [{ type: "text", text: comment }] }],
        },
      });
      return { content: [{ type: "text", text: `Comment added to ${issueKey}.` }] };
    }
  );

  // Tool: get_my_standup
  server.tool(
    "get_my_standup",
    "Get a standup summary: tickets you updated or commented on yesterday and today",
    {},
    async () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const since = yesterday.toISOString().split("T")[0]; // YYYY-MM-DD

      const [updated, commented] = await Promise.all([
        searchJira(
          `assignee = currentUser() AND updated >= "${since}" ORDER BY updated DESC`,
          "summary,status,priority,issuetype"
        ),
        searchJira(
          `issueFunction in commented("by currentUser() after ${since}")`,
          "summary,status,issuetype"
        ).catch(() => []), // issueFunction requires ScriptRunner; gracefully skip if unavailable
      ]);

      const result = {
        updated_tickets: updated,
        commented_tickets: commented,
        summary: `You updated ${updated.length} ticket(s) since ${since}.`,
      };
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  // Tool: get_sprint_summary
  server.tool(
    "get_sprint_summary",
    "Get a summary of all tickets in the active sprint grouped by status",
    {},
    async () => {
      const issues = await searchJira(
        `project = '${JIRA_PROJECT}' AND sprint IN openSprints()`,
        "summary,status,priority,issuetype,assignee"
      );

      const grouped = issues.reduce((acc, issue) => {
        const s = issue.status || "Unknown";
        if (!acc[s]) acc[s] = [];
        acc[s].push({ key: issue.key, summary: issue.summary, priority: issue.priority, type: issue.type });
        return acc;
      }, {});

      const result = {
        total: issues.length,
        by_status: grouped,
      };
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  // Tool: search_tickets
  server.tool(
    "search_tickets",
    "Search Jira tickets using a plain-text query or a JQL string",
    {
      query: z.string().describe(
        "Plain English query (e.g. 'open bugs assigned to me') or raw JQL (e.g. 'project = PROJ AND status = Open')"
      ),
      maxResults: z.number().optional().default(20).describe("Maximum number of results to return (default 20)"),
    },
    async ({ query, maxResults }) => {
      // Use as raw JQL if it looks like JQL, otherwise wrap in a text search
      const looksLikeJql = /\b(AND|OR|IN|=|!=|~|project|status|assignee|sprint|priority|issuetype)\b/i.test(query);
      const jql = looksLikeJql
        ? query
        : `project = '${JIRA_PROJECT}' AND text ~ "${query.replace(/"/g, '\\"')}" ORDER BY updated DESC`;

      const response = await jiraClient.get("/search/jql", {
        params: { jql, fields: "summary,status,priority,issuetype,assignee,reporter", maxResults },
      });

      const issues = (response.data.issues || []).map(i => ({
        key: i.key,
        summary: i.fields?.summary,
        status: i.fields?.status?.name,
        priority: i.fields?.priority?.name,
        type: i.fields?.issuetype?.name,
        assignee: i.fields?.assignee?.displayName ?? "Unassigned",
        reporter: i.fields?.reporter?.displayName,
      }));

      return { content: [{ type: "text", text: JSON.stringify(issues, null, 2) }] };
    }
  );

  // Tool: get_context_for_pr
  server.tool(
    "get_context_for_pr",
    "Extract the Jira ticket key from a branch name, fetch its details and comments, and return a structured PR context block ready for AI to write a pull request description",
    {
      branch: z.string().describe("Git branch name, e.g. STUD-17891-add-email-icon or feature/STUD-17891"),
    },
    async ({ branch }) => {
      // Extract issue key (e.g. STUD-17891) from anywhere in the branch name
      const match = branch.match(/([A-Z][A-Z0-9]+-\d+)/i);
      if (!match) {
        return {
          content: [{
            type: "text",
            text: `Could not find a Jira issue key in branch name: "${branch}". Expected format: PROJ-123 anywhere in the branch.`,
          }],
        };
      }

      const issueKey = match[1].toUpperCase();

      const [issueRes, commentsRes] = await Promise.all([
        jiraClient.get(`/issue/${issueKey}`, {
          params: { fields: "summary,description,issuetype,priority,status,assignee,reporter,labels,components" },
        }),
        jiraClient.get(`/issue/${issueKey}/comment`, {
          params: { maxResults: 10, orderBy: "-created" },
        }),
      ]);

      const f = issueRes.data.fields;

      // Extract plain text from Atlassian Document Format description
      function extractText(node) {
        if (!node) return "";
        if (node.type === "text") return node.text || "";
        if (node.content) return node.content.map(extractText).join(" ");
        return "";
      }

      const description = extractText(f.description).trim() || "No description provided.";

      const comments = (commentsRes.data.comments || []).map(c => ({
        author: c.author?.displayName,
        body: extractText(c.body).trim(),
        created: c.created?.split("T")[0],
      })).filter(c => c.body);

      const context = {
        issue_key: issueKey,
        summary: f.summary,
        type: f.issuetype?.name,
        priority: f.priority?.name,
        status: f.status?.name,
        assignee: f.assignee?.displayName ?? "Unassigned",
        reporter: f.reporter?.displayName,
        labels: f.labels ?? [],
        components: (f.components ?? []).map(c => c.name),
        description,
        recent_comments: comments,
        pr_context: [
          `## ${issueKey}: ${f.summary}`,
          ``,
          `**Type:** ${f.issuetype?.name} | **Priority:** ${f.priority?.name} | **Status:** ${f.status?.name}`,
          ``,
          `### What this PR does`,
          description,
          comments.length > 0 ? `\n### Discussion context\n${comments.map(c => `- **${c.author}** (${c.created}): ${c.body}`).join("\n")}` : "",
          ``,
          `### Jira ticket`,
          `https://${JIRA_DOMAIN}/browse/${issueKey}`,
        ].filter(Boolean).join("\n"),
      };

      return { content: [{ type: "text", text: JSON.stringify(context, null, 2) }] };
    }
  );

  // Tool: start_ticket
  server.tool(
    "start_ticket",
    "Fully start a Jira ticket in AUTONOMOUS mode: self-assigns, moves to In Progress, creates the git branch, then returns agent instructions that drive non-stop autonomous implementation, testing, commit, push, PR creation, and Jira comment — no confirmation needed",
    {
      issueKey: z.string().describe("The Jira issue key, e.g. STUD-17891"),
      workingDir: z.string().optional().describe("Absolute path to the git repo. If omitted, the tool auto-detects from the current working directory."),
    },
    async ({ issueKey, workingDir }) => {
      const actions = [];

      // ── Auto-detect workingDir if not provided ────────────────────────────────
      if (!workingDir) {
        try {
          workingDir = execSync("git rev-parse --show-toplevel", { stdio: "pipe" }).toString().trim();
          actions.push(`✅ Auto-detected repo: ${workingDir}`);
        } catch {
          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                error: "Could not auto-detect the git repository.",
                fix: "Re-run start_ticket and pass the workingDir parameter explicitly, e.g. /Users/you/code/my-project",
                hint: "The AI should look at the currently open workspace/files in the editor to determine the correct path and retry.",
              }, null, 2),
            }],
          };
        }
      }

      // ── 0. Preflight: verify gh CLI is installed and authenticated ───────────
      try {
        execSync("gh --version", { stdio: "pipe" });
      } catch {
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              error: "GitHub CLI (gh) is not installed.",
              fix: "Install it first, then re-run start_ticket.",
              install_steps: {
                macOS: "brew install gh",
                windows: "winget install --id GitHub.cli",
                linux: "https://github.com/cli/cli/blob/trunk/docs/install_linux.md",
              },
              after_install: "Run `gh auth login` to authenticate, then retry.",
            }, null, 2),
          }],
        };
      }

      try {
        execSync("gh auth status", { stdio: "pipe" });
      } catch {
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              error: "GitHub CLI is installed but not authenticated.",
              fix: "Run `gh auth login` in your terminal, complete the browser flow, then retry start_ticket.",
            }, null, 2),
          }],
        };
      }

      actions.push("✅ GitHub CLI (gh) is installed and authenticated");

      // ── 1. Fetch ticket + comments + current user in parallel ────────────────
      const [issueRes, commentsRes, myselfRes, transitionsRes] = await Promise.all([
        jiraClient.get(`/issue/${issueKey}`, {
          params: {
            fields: "summary,description,issuetype,priority,status,assignee,reporter,labels,components,customfield_10016,customfield_10014,customfield_10021,subtasks,parent",
          },
        }),
        jiraClient.get(`/issue/${issueKey}/comment`, {
          params: { maxResults: 20, orderBy: "-created" },
        }),
        jiraClient.get("/myself"),
        jiraClient.get(`/issue/${issueKey}/transitions`),
      ]);

      const f = issueRes.data.fields;
      const me = myselfRes.data;

      // Extract plain text from Atlassian Document Format
      function extractText(node) {
        if (!node) return "";
        if (node.type === "text") return node.text || "";
        if (node.type === "hardBreak") return "\n";
        if (node.content) return node.content.map(extractText).join(node.type === "paragraph" ? "\n" : " ");
        return "";
      }

      const description = extractText(f.description).trim() || "No description provided.";
      const acceptanceCriteria = extractText(
        f["customfield_10016"] || f["customfield_10014"] || f["customfield_10021"] || null
      ).trim();

      const comments = (commentsRes.data.comments || [])
        .map(c => ({ author: c.author?.displayName, body: extractText(c.body).trim(), created: c.created?.split("T")[0] }))
        .filter(c => c.body);

      const subtasks = (f.subtasks || []).map(s => ({
        key: s.key,
        summary: s.fields?.summary,
        status: s.fields?.status?.name,
      }));

      // ── 2. Self-assign the ticket ─────────────────────────────────────────────
      try {
        await jiraClient.put(`/issue/${issueKey}/assignee`, { accountId: me.accountId });
        actions.push(`✅ Assigned to ${me.displayName}`);
      } catch (e) {
        actions.push(`⚠️  Could not assign: ${e.response?.data?.errorMessages?.[0] ?? e.message}`);
      }

      // ── 3. Transition to "In Progress" ────────────────────────────────────────
      const transitions = transitionsRes.data.transitions || [];
      const inProgress = transitions.find(t =>
        /in.?progress|start|doing|in.?dev/i.test(t.name)
      );
      if (inProgress) {
        try {
          await jiraClient.post(`/issue/${issueKey}/transitions`, { transition: { id: inProgress.id } });
          actions.push(`✅ Moved to "${inProgress.name}"`);
        } catch (e) {
          actions.push(`⚠️  Could not transition: ${e.response?.data?.errorMessages?.[0] ?? e.message}`);
        }
      } else {
        const available = transitions.map(t => t.name).join(", ");
        actions.push(`⚠️  No "In Progress" transition found. Available: ${available}`);
      }

      // ── 4. Create git branch ──────────────────────────────────────────────────
      const slugifiedSummary = (f.summary || "")
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, "")
        .trim()
        .replace(/\s+/g, "-")
        .slice(0, 50)
        .replace(/-+$/, "");
      const branchName = `${issueKey.toLowerCase()}-${slugifiedSummary}`;

      try {
        execSync(`git -C "${workingDir}" checkout -b "${branchName}"`, { stdio: "pipe" });
        actions.push(`✅ Created and switched to branch: ${branchName}`);
      } catch (e) {
        const stderr = e.stderr?.toString() ?? "";
        if (stderr.includes("already exists")) {
          try {
            execSync(`git -C "${workingDir}" checkout "${branchName}"`, { stdio: "pipe" });
            actions.push(`✅ Branch already exists — switched to: ${branchName}`);
          } catch {
            actions.push(`⚠️  Branch exists but could not switch: ${stderr}`);
          }
        } else {
          actions.push(`⚠️  Git error: ${stderr || e.message}`);
        }
      }

      const ticketUrl = `https://${JIRA_DOMAIN}/browse/${issueKey}`;

      const agentInstructions = [
        `You are now in AUTONOMOUS CODING MODE for ${issueKey}.`,
        ``,
        `RULES — follow these exactly, do NOT stop or ask for confirmation at any point:`,
        `1. You are already on branch \`${branchName}\` in \`${workingDir}\` — start coding immediately.`,
        `2. Read the description and acceptance criteria below — implement everything required.`,
        `3. After implementing, run the test suite automatically. Fix any failures before moving on.`,
        `4. If you encounter an ambiguity, make the most reasonable assumption and document it in a code comment — do NOT pause to ask.`,
        `5. After all tests pass, run: \`git -C "${workingDir}" add -A && git -C "${workingDir}" commit -m "${issueKey}: ${f.summary}" && git -C "${workingDir}" push -u origin ${branchName}\``,
        `6. Create the PR by running: \`gh pr create --repo $(git -C "${workingDir}" remote get-url origin) --title "${issueKey}: ${f.summary}" --body "Resolves ${ticketUrl}" --head ${branchName}\``,
        `7. Capture the PR URL from the gh output and call the add_comment tool to post it on ${issueKey}.`,
        `8. Only stop when the PR is open and the Jira ticket has been commented. That is the definition of done.`,
      ].join("\n");

      const brief = [
        `# 🤖 AUTONOMOUS MODE — ${issueKey}: ${f.summary}`,
        ``,
        agentInstructions,
        ``,
        `**Type:** ${f.issuetype?.name} | **Priority:** ${f.priority?.name}`,
        `**Assignee:** ${me.displayName} | **Reporter:** ${f.reporter?.displayName}`,
        f.labels?.length ? `**Labels:** ${f.labels.join(", ")}` : "",
        f.components?.length ? `**Components:** ${f.components.map(c => c.name).join(", ")}` : "",
        `**Ticket:** ${ticketUrl}`,
        ``,
        `## ⚡ Actions Taken`,
        ...actions.map(a => `- ${a}`),
        ``,
        `## 📋 Description`,
        description,
        acceptanceCriteria ? `\n## ✅ Acceptance Criteria\n${acceptanceCriteria}` : "",
        subtasks.length > 0
          ? `\n## 🔀 Subtasks\n${subtasks.map(s => `- [${s.status === "Done" ? "x" : " "}] ${s.key}: ${s.summary} (${s.status})`).join("\n")}`
          : "",
        comments.length > 0
          ? `\n## 💬 Recent Comments\n${comments.slice(0, 5).map(c => `**${c.author}** (${c.created}):\n${c.body}`).join("\n\n---\n\n")}`
          : "",
        ``,
        `## 🚀 Implementation Checklist`,
        `- [ ] Implement the feature/fix on branch \`${branchName}\``,
        `- [ ] Write unit tests`,
        `- [ ] Write integration tests if applicable`,
        `- [ ] Run full test suite`,
        `- [ ] Create PR with title: \`${issueKey}: ${f.summary}\``,
        `- [ ] Link PR to ticket: ${ticketUrl}`,
        ``,
        `## 📝 PR Description Template`,
        `### What`,
        description.split("\n")[0],
        ``,
        `### Why`,
        `Resolves ${issueKey} — ${ticketUrl}`,
        ``,
        `### How`,
        `<!-- Describe your implementation approach -->`,
        ``,
        `### Testing`,
        `- [ ] Unit tests added/updated`,
        `- [ ] Integration tests added/updated`,
        `- [ ] Manually tested`,
      ].filter(l => l !== null && l !== undefined).join("\n");

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            issue_key: issueKey,
            summary: f.summary,
            type: f.issuetype?.name,
            priority: f.priority?.name,
            branch_name: branchName,
            ticket_url: ticketUrl,
            actions_taken: actions,
            agent_instructions: agentInstructions,
            description,
            acceptance_criteria: acceptanceCriteria || null,
            subtasks,
            comments,
            brief,
          }, null, 2),
        }],
      };
    }
  );

  // ── Start ────────────────────────────────────────────────────────────────────
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

if (!missing.length) {
  startMcpServer();
}
