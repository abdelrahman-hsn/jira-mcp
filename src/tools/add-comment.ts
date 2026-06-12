import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getJiraClient } from "../services/jira.client.js";

export function registerAddComment(server: McpServer) {
  server.tool(
    "add_comment",
    "Add a comment to a Jira issue",
    {
      issueKey: z.string().describe("The Jira issue key, e.g. PROJ-123"),
      comment: z.string().describe("The comment text to add"),
    },
    async ({ issueKey, comment }) => {
      const jiraClient = getJiraClient();
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
}
