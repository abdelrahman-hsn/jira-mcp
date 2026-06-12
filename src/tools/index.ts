import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerGetMyTickets } from "./get-my-tickets.js";
import { registerGetActiveSprintTickets } from "./get-active-sprint-tickets.js";
import { registerGetIssueDetails } from "./get-issue-details.js";
import { registerAddComment } from "./add-comment.js";
import { registerGetMyStandup } from "./get-my-standup.js";
import { registerGetSprintSummary } from "./get-sprint-summary.js";
import { registerSearchTickets } from "./search-tickets.js";
import { registerGetContextForPr } from "./get-context-for-pr.js";
import { registerStartTicket } from "./start-ticket.js";

export function registerTools(server?: McpServer) {
  // Use the global server if none passed (used in normal start)
  const targetServer = server || require("../mcp-server.js").server;
  
  registerGetMyTickets(targetServer);
  registerGetActiveSprintTickets(targetServer);
  registerGetIssueDetails(targetServer);
  registerAddComment(targetServer);
  registerGetMyStandup(targetServer);
  registerGetSprintSummary(targetServer);
  registerSearchTickets(targetServer);
  registerGetContextForPr(targetServer);
  registerStartTicket(targetServer);
}
