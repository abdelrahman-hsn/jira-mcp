export const config = {
  get JIRA_EMAIL() { return process.env.JIRA_EMAIL; },
  set JIRA_EMAIL(val: string | undefined) { if (val) process.env.JIRA_EMAIL = val; else delete process.env.JIRA_EMAIL; },
  
  get JIRA_TOKEN() { return process.env.JIRA_TOKEN; },
  set JIRA_TOKEN(val: string | undefined) { if (val) process.env.JIRA_TOKEN = val; else delete process.env.JIRA_TOKEN; },
  
  get JIRA_DOMAIN() { return process.env.JIRA_DOMAIN; },
  set JIRA_DOMAIN(val: string | undefined) { if (val) process.env.JIRA_DOMAIN = val; else delete process.env.JIRA_DOMAIN; },
  
  get JIRA_PROJECT() { return process.env.JIRA_PROJECT; },
  set JIRA_PROJECT(val: string | undefined) { if (val) process.env.JIRA_PROJECT = val; else delete process.env.JIRA_PROJECT; },
  
  get missing() {
    return ["JIRA_EMAIL", "JIRA_TOKEN", "JIRA_DOMAIN", "JIRA_PROJECT"].filter(
      (k) => !process.env[k]
    );
  }
};
