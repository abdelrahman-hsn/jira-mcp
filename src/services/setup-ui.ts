import { createServer, IncomingMessage, ServerResponse } from "http";
import { execSync } from "child_process";
import { writeFileSync, readFileSync, existsSync } from "fs";
import { homedir } from "os";
import { join, dirname } from "path";
import axios from "axios";
import { config } from "../config.js";

const SETUP_PORT = 9898;

function openBrowser(url: string) {
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

function readMcpJson(path: string) {
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

export async function launchSetupUi(onComplete: () => Promise<void>): Promise<void> {
  return new Promise((resolve) => {
    const setupServer = createServer((req: IncomingMessage, res: ServerResponse) => {
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
            const updatedClients: string[] = [];

            for (const c of configs) {
              const dir = dirname(c.path);
              if (existsSync(dir)) {
                const mcp = readMcpJson(c.path);
                mcp[c.key] = mcp[c.key] || {};
                const existing = mcp[c.key]["jira-mcp"] || {};
                mcp[c.key]["jira-mcp"] = {
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
                  writeFileSync(c.path, JSON.stringify(mcp, null, 2));
                  updatedClients.push(c.name);
                } catch (err) {
                  // Ignore
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
            
            config.JIRA_EMAIL = email;
            config.JIRA_TOKEN = token;
            config.JIRA_DOMAIN = domain;
            config.JIRA_PROJECT = project;
            
            await onComplete();
            resolve();
          } catch (e: any) {
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
      process.stderr.write(
        `[jira-mcp] ⚙️  Setup required — opening browser to configure your Jira credentials.\n` +
        `[jira-mcp] If the browser didn't open: ${url}\n`
      );
      openBrowser(url);
    });

    process.on("SIGINT", () => { setupServer.close(); process.exit(0); });
  });
}
