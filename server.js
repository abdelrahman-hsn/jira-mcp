#!/usr/bin/env node
import axios from "axios";
import { execSync } from "child_process";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// ── Jira credentials (injected by MCP client via env) ──────────────────────
const JIRA_EMAIL   = process.env.JIRA_EMAIL;
const JIRA_TOKEN   = process.env.JIRA_TOKEN;
const JIRA_DOMAIN  = process.env.JIRA_DOMAIN;
const JIRA_PROJECT = process.env.JIRA_PROJECT;

const missing = ["JIRA_EMAIL", "JIRA_TOKEN", "JIRA_DOMAIN", "JIRA_PROJECT"].filter(k => !process.env[k]);
if (missing.length) {
  process.stderr.write(
    `[jira-mcp] Missing required environment variables: ${missing.join(", ")}\n` +
    `Set them in your MCP client config under the "env" key.\n`
  );
  process.exit(1);
}

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
    comment:  z.string().describe("The comment text to add"),
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
