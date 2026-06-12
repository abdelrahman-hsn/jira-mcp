import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getJiraClient } from "../services/jira.client.js";

export function registerGetIssueDetails(server: McpServer) {
  server.tool(
    "get_issue_details",
    "Get full details (description + attachments) for a specific Jira issue",
    { issueKey: z.string().describe("The Jira issue key, e.g. STUD-17797") },
    async ({ issueKey }) => {
      const jiraClient = getJiraClient();
      const response = await jiraClient.get(`/issue/${issueKey}`);
      return { content: [{ type: "text", text: JSON.stringify(response.data, null, 2) }] };
    }
  );
}
