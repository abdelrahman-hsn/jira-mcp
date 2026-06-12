import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getJiraClient } from "../services/jira.client.js";
import { config } from "../config.js";

export function registerSearchTickets(server: McpServer) {
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
      const looksLikeJql = /\b(AND|OR|IN|=|!=|~|project|status|assignee|sprint|priority|issuetype)\b/i.test(query);
      const jql = looksLikeJql
        ? query
        : `project = '${config.JIRA_PROJECT}' AND text ~ "${query.replace(/"/g, '\\"')}" ORDER BY updated DESC`;

      const jiraClient = getJiraClient();
      const response = await jiraClient.get("/search/jql", {
        params: { jql, fields: "summary,status,priority,issuetype,assignee,reporter", maxResults },
      });

      const issues = (response.data.issues || []).map((i: any) => ({
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
}
