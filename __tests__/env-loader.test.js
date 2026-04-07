const { parseEnvContent, loadEnvFile } = require("../lib/env-loader");
const fs = require("fs");
const path = require("path");
const os = require("os");

describe("parseEnvContent", () => {
  test("parses simple key=value pairs", () => {
    expect(parseEnvContent("KEY=value")).toEqual({ KEY: "value" });
  });

  test("parses multiple lines", () => {
    const result = parseEnvContent("A=1\nB=2\nC=3");
    expect(result).toEqual({ A: "1", B: "2", C: "3" });
  });

  test("skips comment lines", () => {
    const result = parseEnvContent("# this is a comment\nKEY=value");
    expect(result).toEqual({ KEY: "value" });
  });

  test("skips empty lines", () => {
    const result = parseEnvContent("\n\nKEY=value\n\n");
    expect(result).toEqual({ KEY: "value" });
  });

  test("trims whitespace from keys and values", () => {
    const result = parseEnvContent("  KEY  =  value  ");
    expect(result).toEqual({ KEY: "value" });
  });

  test("handles values containing = signs", () => {
    const result = parseEnvContent("URL=https://example.com?a=1&b=2");
    expect(result).toEqual({ URL: "https://example.com?a=1&b=2" });
  });

  test("returns empty object for empty content", () => {
    expect(parseEnvContent("")).toEqual({});
  });

  test("skips lines without = sign", () => {
    const result = parseEnvContent("INVALID_LINE\nKEY=value");
    expect(result).toEqual({ KEY: "value" });
  });

  test("skips lines where = is at position 0", () => {
    const result = parseEnvContent("=value\nKEY=ok");
    expect(result).toEqual({ KEY: "ok" });
  });
});

describe("loadEnvFile", () => {
  let tmpDir;
  let envFile;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "env-test-"));
    envFile = path.join(tmpDir, ".env");
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test("loads env vars into target object", () => {
    fs.writeFileSync(envFile, "TEST_KEY=test_value");
    const env = {};
    loadEnvFile(envFile, env);
    expect(env.TEST_KEY).toBe("test_value");
  });

  test("does not overwrite existing env vars", () => {
    fs.writeFileSync(envFile, "EXISTING=new_value");
    const env = { EXISTING: "original" };
    loadEnvFile(envFile, env);
    expect(env.EXISTING).toBe("original");
  });

  test("returns empty object for nonexistent file", () => {
    const result = loadEnvFile("/tmp/nonexistent/.env", {});
    expect(result).toEqual({});
  });

  test("returns parsed vars even when not overwriting", () => {
    fs.writeFileSync(envFile, "K=v");
    const env = { K: "existing" };
    const result = loadEnvFile(envFile, env);
    expect(result).toEqual({ K: "v" });
    expect(env.K).toBe("existing");
  });
});
