import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { searchJira } from "../services/jira.client.js";
import { config } from "../config.js";

export function registerGetSprintSummary(server: McpServer) {
  server.tool(
    "get_sprint_summary",
    "Get a summary of all tickets in the active sprint grouped by status",
    {},
    async () => {
      const issues = await searchJira(
        `project = '${config.JIRA_PROJECT}' AND sprint IN openSprints()`,
        "summary,status,priority,issuetype,assignee"
      );

      const grouped = issues.reduce((acc: any, issue: any) => {
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
}
