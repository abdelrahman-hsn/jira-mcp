#!/usr/bin/env node
import axios from "axios";
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

// ── Start ────────────────────────────────────────────────────────────────────
const transport = new StdioServerTransport();
await server.connect(transport);
