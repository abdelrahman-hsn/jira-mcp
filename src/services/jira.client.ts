import axios from "axios";
import { config } from "../config.js";

/**
 * Creates and returns an axios instance configured for Jira.
 * Dynamic getter ensures we pick up credentials injected after the Setup UI completes.
 */
export const getJiraClient = () => {
  if (config.missing.length > 0) {
    throw new Error("Cannot create Jira client: missing credentials.");
  }
  
  return axios.create({
    baseURL: `https://${config.JIRA_DOMAIN}/rest/api/3`,
    auth: { username: config.JIRA_EMAIL!, password: config.JIRA_TOKEN! },
  });
};

/**
 * Helper to execute a JQL search and return normalized issue data.
 */
export async function searchJira(jql: string, fields = "summary,status,priority,description,issuetype,attachment,reporter") {
  const jiraClient = getJiraClient();
  const response = await jiraClient.get("/search/jql", { params: { jql, fields } });
  
  return (response.data.issues || []).map((i: any) => ({
    key: i.key,
    summary: i.fields?.summary,
    status: i.fields?.status?.name,
    priority: i.fields?.priority?.name,
    type: i.fields?.issuetype?.name,
    reporter: i.fields?.reporter?.displayName,
    description: JSON.stringify(i.fields?.description),
    attachments: (i.fields?.attachment || []).map((a: any) => a.content),
  }));
}

/**
 * Extracts plain text from Atlassian Document Format nodes.
 */
export function extractAdfText(node: any): string {
  if (!node) return "";
  if (node.type === "text") return node.text || "";
  if (node.type === "hardBreak") return "\n";
  if (node.content && Array.isArray(node.content)) {
    return node.content.map(extractAdfText).join(node.type === "paragraph" ? "\n" : " ");
  }
  return "";
}
