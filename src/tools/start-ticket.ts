import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getJiraClient } from "../services/jira.client.js";
import { gitService } from "../services/git.service.js";

export function registerStartTicket(server: McpServer) {
  server.tool(
    "start_ticket",
    "Assign the ticket to yourself, move it to 'In Progress', and optionally create/checkout a git branch (if you are in a git repo).",
    {
      issueKey: z.string().describe("The Jira issue key, e.g. PROJ-123"),
      createBranch: z.boolean().optional().default(true).describe("Whether to create and checkout a git branch"),
    },
    async ({ issueKey, createBranch }) => {
      const jiraClient = getJiraClient();
      const user = await jiraClient.get("/myself");
      const accountId = user.data.accountId;

      const log: string[] = [];

      try {
        await jiraClient.put(`/issue/${issueKey}/assignee`, { accountId });
        log.push(`✅ Assigned ${issueKey} to you.`);
      } catch (e: any) {
        log.push(`⚠️ Could not assign ticket: ${e.message}`);
      }

      try {
        const transRes = await jiraClient.get(`/issue/${issueKey}/transitions`);
        const transitions = transRes.data.transitions || [];
        const inProgressTrans = transitions.find((t: any) =>
          t.name.toLowerCase().includes("in progress") ||
          t.name.toLowerCase().includes("start")
        );

        if (inProgressTrans) {
          await jiraClient.post(`/issue/${issueKey}/transitions`, {
            transition: { id: inProgressTrans.id },
          });
          log.push(`✅ Moved ${issueKey} to In Progress.`);
        } else {
          log.push(`ℹ️ No "In Progress" transition found. Available: ${transitions.map((t: any) => t.name).join(", ")}`);
        }
      } catch (e: any) {
        log.push(`⚠️ Could not move ticket: ${e.message}`);
      }

      if (createBranch) {
        try {
          const repo = gitService.detectGitRepo();
          const issueRes = await jiraClient.get(`/issue/${issueKey}`, { params: { fields: "summary" } });
          const summary = issueRes.data.fields?.summary || "feature";
          const slug = summary.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
          const branchName = `${issueKey}-${slug}`;

          const branchLog = gitService.createBranch(repo, branchName);
          log.push(branchLog);
        } catch (e: any) {
          log.push(`⚠️ Could not create branch: ${e.message}`);
        }
      }

      return { content: [{ type: "text", text: log.join("\n") }] };
    }
  );
}
