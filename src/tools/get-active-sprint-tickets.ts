import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { searchJira } from "../services/jira.client.js";
import { config } from "../config.js";

export function registerGetActiveSprintTickets(server: McpServer) {
  server.tool(
    "get_active_sprint_tickets",
    "Get user tickets in the active sprint for the configured Jira project",
    {},
    async () => {
      const result = await searchJira(
        `project = '${config.JIRA_PROJECT}' AND sprint IN openSprints() AND assignee = currentUser()`
      );
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );
}
