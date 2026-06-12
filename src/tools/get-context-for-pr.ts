import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getJiraClient, extractAdfText } from "../services/jira.client.js";
import { config } from "../config.js";

export function registerGetContextForPr(server: McpServer) {
  server.tool(
    "get_context_for_pr",
    "Extract the Jira ticket key from a branch name, fetch its details and comments, and return a structured PR context block ready for AI to write a pull request description",
    {
      branch: z.string().describe("Git branch name, e.g. STUD-17891-add-email-icon or feature/STUD-17891"),
    },
    async ({ branch }) => {
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
      const jiraClient = getJiraClient();

      const [issueRes, commentsRes] = await Promise.all([
        jiraClient.get(`/issue/${issueKey}`, {
          params: { fields: "summary,description,issuetype,priority,status,assignee,reporter,labels,components" },
        }),
        jiraClient.get(`/issue/${issueKey}/comment`, {
          params: { maxResults: 10, orderBy: "-created" },
        }),
      ]);

      const f = issueRes.data.fields;
      const description = extractAdfText(f.description).trim() || "No description provided.";

      const comments = (commentsRes.data.comments || []).map((c: any) => ({
        author: c.author?.displayName,
        body: extractAdfText(c.body).trim(),
        created: c.created?.split("T")[0],
      })).filter((c: any) => c.body);

      const context = {
        issue_key: issueKey,
        summary: f.summary,
        type: f.issuetype?.name,
        priority: f.priority?.name,
        status: f.status?.name,
        assignee: f.assignee?.displayName ?? "Unassigned",
        reporter: f.reporter?.displayName,
        labels: f.labels ?? [],
        components: (f.components ?? []).map((c: any) => c.name),
        description,
        recent_comments: comments,
        pr_context: [
          `## ${issueKey}: ${f.summary}`,
          ``,
          `**Type:** ${f.issuetype?.name} | **Priority:** ${f.priority?.name} | **Status:** ${f.status?.name}`,
          ``,
          `### What this PR does`,
          description,
          comments.length > 0 ? `\n### Discussion context\n${comments.map((c: any) => `- **${c.author}** (${c.created}): ${c.body}`).join("\n")}` : "",
          ``,
          `### Jira ticket`,
          `https://${config.JIRA_DOMAIN}/browse/${issueKey}`,
        ].filter(Boolean).join("\n"),
      };

      return { content: [{ type: "text", text: JSON.stringify(context, null, 2) }] };
    }
  );
}
