import { describe, it, expect, beforeEach } from "vitest";
import { config } from "../src/config.js";

describe("Config", () => {
  beforeEach(() => {
    delete process.env.JIRA_EMAIL;
    delete process.env.JIRA_TOKEN;
    delete process.env.JIRA_DOMAIN;
    delete process.env.JIRA_PROJECT;
  });

  it("should report missing properties when empty", () => {
    expect(config.missing).toEqual(["JIRA_EMAIL", "JIRA_TOKEN", "JIRA_DOMAIN", "JIRA_PROJECT"]);
  });

  it("should dynamically reflect process.env updates", () => {
    process.env.JIRA_EMAIL = "test@test.com";
    expect(config.JIRA_EMAIL).toBe("test@test.com");
    expect(config.missing).not.toContain("JIRA_EMAIL");
    
    config.JIRA_TOKEN = "token123";
    expect(process.env.JIRA_TOKEN).toBe("token123");
    expect(config.missing).not.toContain("JIRA_TOKEN");
  });
});
