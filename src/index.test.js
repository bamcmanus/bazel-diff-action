import { jest } from "@jest/globals";

// Mock dependencies before importing the module under test
const mockExec = jest.fn();
const mockGetInput = jest.fn();
const mockInfo = jest.fn();
const mockSetFailed = jest.fn();
const mockDownloadTool = jest.fn();
const mockReadFile = jest.fn();

jest.unstable_mockModule("@actions/exec", () => ({
  exec: mockExec,
}));

jest.unstable_mockModule("@actions/core", () => ({
  getInput: mockGetInput,
  info: mockInfo,
  setFailed: mockSetFailed,
}));

jest.unstable_mockModule("@actions/tool-cache", () => ({
  downloadTool: mockDownloadTool,
}));

jest.unstable_mockModule("fs/promises", () => ({
  readFile: mockReadFile,
}));

const {
  verifyJava,
  verifyNotShallow,
  downloadBazelDiff,
  resolveBaseRef,
  parseGitHubEvent,
  getCurrentRef,
} = await import("./index.js");

describe("verifyJava", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("succeeds when java is available", async () => {
    mockExec.mockResolvedValue(0);
    await expect(verifyJava()).resolves.not.toThrow();
    expect(mockExec).toHaveBeenCalledWith("java", ["-version"]);
  });

  it("throws when java is not found", async () => {
    mockExec.mockRejectedValue(new Error("Unable to locate executable"));
    await expect(verifyJava()).rejects.toThrow(
      /Java is required but not found/,
    );
  });
});

describe("verifyNotShallow", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("succeeds when repository is not shallow", async () => {
    mockExec.mockImplementation((cmd, args, options) => {
      options.listeners.stdout(Buffer.from("false\n"));
      return Promise.resolve(0);
    });
    await expect(verifyNotShallow()).resolves.not.toThrow();
  });

  it("throws when repository is shallow", async () => {
    mockExec.mockImplementation((cmd, args, options) => {
      options.listeners.stdout(Buffer.from("true\n"));
      return Promise.resolve(0);
    });
    await expect(verifyNotShallow()).rejects.toThrow(
      /Repository is a shallow clone/,
    );
  });
});

describe("downloadBazelDiff", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("uses latest URL when version is latest", async () => {
    mockDownloadTool.mockResolvedValue("/tmp/bazel-diff.jar");
    const result = await downloadBazelDiff("latest");
    expect(mockDownloadTool).toHaveBeenCalledWith(
      "https://github.com/Tinder/bazel-diff/releases/latest/download/bazel-diff_deploy.jar",
    );
    expect(result).toBe("/tmp/bazel-diff.jar");
  });

  it("uses versioned URL when specific version is provided", async () => {
    mockDownloadTool.mockResolvedValue("/tmp/bazel-diff.jar");
    const result = await downloadBazelDiff("22.0.0");
    expect(mockDownloadTool).toHaveBeenCalledWith(
      "https://github.com/Tinder/bazel-diff/releases/download/22.0.0/bazel-diff_deploy.jar",
    );
    expect(result).toBe("/tmp/bazel-diff.jar");
  });
});

describe("parseGitHubEvent", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("extracts base sha from pull_request event", async () => {
    const payload = { pull_request: { base: { sha: "abc123" } } };
    mockReadFile.mockResolvedValue(JSON.stringify(payload));
    const result = await parseGitHubEvent("/tmp/event.json", "pull_request");
    expect(result).toBe("abc123");
  });

  it("extracts before sha from push event", async () => {
    const payload = { before: "def456" };
    mockReadFile.mockResolvedValue(JSON.stringify(payload));
    const result = await parseGitHubEvent("/tmp/event.json", "push");
    expect(result).toBe("def456");
  });

  it("extracts base_sha from merge_group event", async () => {
    const payload = { merge_group: { base_sha: "ghi789" } };
    mockReadFile.mockResolvedValue(JSON.stringify(payload));
    const result = await parseGitHubEvent("/tmp/event.json", "merge_group");
    expect(result).toBe("ghi789");
  });

  it("throws for unsupported event types", async () => {
    mockReadFile.mockResolvedValue(JSON.stringify({}));
    await expect(
      parseGitHubEvent("/tmp/event.json", "schedule"),
    ).rejects.toThrow(/unsupported event type: schedule/);
  });
});

describe("resolveBaseRef", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("returns base-ref input when provided", async () => {
    mockGetInput.mockReturnValue("main");
    const result = await resolveBaseRef();
    expect(result).toBe("main");
  });

  it("falls back to GitHub event when no input provided", async () => {
    mockGetInput.mockReturnValue("");
    process.env.GITHUB_EVENT_PATH = "/tmp/event.json";
    process.env.GITHUB_EVENT_NAME = "pull_request";
    const payload = { pull_request: { base: { sha: "abc123" } } };
    mockReadFile.mockResolvedValue(JSON.stringify(payload));
    const result = await resolveBaseRef();
    expect(result).toBe("abc123");
  });

  it("falls back to HEAD~1 when no input and no event path", async () => {
    mockGetInput.mockReturnValue("");
    delete process.env.GITHUB_EVENT_PATH;
    delete process.env.GITHUB_EVENT_NAME;
    const result = await resolveBaseRef();
    expect(result).toBe("HEAD~1");
  });
});

describe("getCurrentRef", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns the current HEAD sha", async () => {
    mockExec.mockImplementation((cmd, args, options) => {
      options.listeners.stdout(Buffer.from("abc123def456\n"));
      return Promise.resolve(0);
    });
    const result = await getCurrentRef();
    expect(result).toBe("abc123def456");
    expect(mockExec).toHaveBeenCalledWith(
      "git",
      ["rev-parse", "HEAD"],
      expect.objectContaining({ listeners: expect.any(Object) }),
    );
  });

  it("handles multi-chunk stdout", async () => {
    mockExec.mockImplementation((cmd, args, options) => {
      options.listeners.stdout(Buffer.from("abc123"));
      options.listeners.stdout(Buffer.from("def456\n"));
      return Promise.resolve(0);
    });
    const result = await getCurrentRef();
    expect(result).toBe("abc123def456");
  });
});
