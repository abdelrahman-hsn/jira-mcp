import { describe, it, expect, beforeEach } from "vitest";
import { getJiraClient } from "../src/services/jira.client.js";
import { config } from "../src/config.js";

describe("Jira Client", () => {
  beforeEach(() => {
    config.JIRA_EMAIL = "test@company.com";
    config.JIRA_TOKEN = "token";
    config.JIRA_DOMAIN = "test.atlassian.net";
    config.JIRA_PROJECT = "TEST";
  });

  it("should throw if config is missing", () => {
    config.JIRA_EMAIL = undefined;
    expect(() => getJiraClient()).toThrow("Cannot create Jira client: missing credentials.");
  });

  it("should return an axios instance when config is valid", () => {
    const client = getJiraClient();
    expect(client.defaults.baseURL).toBe("https://test.atlassian.net/rest/api/3");
    expect(client.defaults.auth).toEqual({
      username: "test@company.com",
      password: "token"
    });
  });
});
