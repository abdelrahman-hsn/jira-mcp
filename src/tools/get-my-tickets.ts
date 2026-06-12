import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { searchJira } from "../services/jira.client.js";

export function registerGetMyTickets(server: McpServer) {
  server.tool(
    "get_my_tickets",
    "Get all Jira tickets assigned to the current user",
    {},
    async () => {
      const result = await searchJira("assignee = currentUser() ORDER BY updated DESC");
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );
}
