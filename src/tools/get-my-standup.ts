import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { searchJira } from "../services/jira.client.js";

export function registerGetMyStandup(server: McpServer) {
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
}
