import { jest } from "@jest/globals";
import { isAbsolute } from "path";

// Mock dependencies before importing the module under test
const mockExec = jest.fn();
const mockGetInput = jest.fn();
const mockInfo = jest.fn();
const mockSetFailed = jest.fn();
const mockSetOutput = jest.fn();
const mockWarning = jest.fn();
const mockDownloadTool = jest.fn();
const mockReadFile = jest.fn();

jest.unstable_mockModule("@actions/exec", () => ({
  exec: mockExec,
}));

jest.unstable_mockModule("@actions/core", () => ({
  getInput: mockGetInput,
  info: mockInfo,
  setFailed: mockSetFailed,
  setOutput: mockSetOutput,
  warning: mockWarning,
}));

jest.unstable_mockModule("@actions/tool-cache", () => ({
  downloadTool: mockDownloadTool,
}));

jest.unstable_mockModule("fs/promises", () => ({
  readFile: mockReadFile,
  unlink: jest.fn().mockResolvedValue(undefined),
}));

const {
  verifyJava,
  verifyNotShallow,
  downloadBazelDiff,
  resolveBaseRef,
  parseGitHubEvent,
  getCurrentRef,
  buildGenerateHashesArgs,
  buildGetImpactedTargetArgs,
  verifyBazel,
  run,
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

  it("throws a helpful message when git exec fails", async () => {
    mockExec.mockRejectedValue(new Error("git not found"));
    await expect(verifyNotShallow()).rejects.toThrow(
      /Failed to check repository depth/,
    );
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

  it("throws when push event has null SHA as before", async () => {
    const payload = { before: "0000000000000000000000000000000000000000" };
    mockReadFile.mockResolvedValue(JSON.stringify(payload));
    await expect(parseGitHubEvent("/tmp/event.json", "push")).rejects.toThrow(
      /Push event has no previous commit/,
    );
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

  it("throws when GITHUB_EVENT_PATH is set but GITHUB_EVENT_NAME is missing", async () => {
    mockGetInput.mockReturnValue("");
    process.env.GITHUB_EVENT_PATH = "/tmp/event.json";
    delete process.env.GITHUB_EVENT_NAME;
    await expect(resolveBaseRef()).rejects.toThrow(
      /GITHUB_EVENT_PATH is set but GITHUB_EVENT_NAME is missing/,
    );
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

describe("buildGenerateHashesArgs", () => {
  const jarPath = "/tmp/bazel-diff.jar";
  const workspacePath = ".";
  const bazelPath = "bazel";
  const outputPath = "/tmp/hashes.json";

  it("builds basic args with no options", () => {
    const options = {
      useCquery: false,
      excludeExternal: false,
      targetType: "",
      startupOptions: "",
      commandOptions: "",
      depEdgesFile: "",
    };
    const result = buildGenerateHashesArgs(
      jarPath,
      workspacePath,
      bazelPath,
      outputPath,
      options,
    );
    expect(result).toEqual([
      "-jar",
      "/tmp/bazel-diff.jar",
      "generate-hashes",
      "-w",
      ".",
      "-b",
      "bazel",
      "/tmp/hashes.json",
    ]);
  });

  it("includes --useCquery when enabled", () => {
    const options = {
      useCquery: true,
      excludeExternal: false,
      targetType: "",
      startupOptions: "",
      commandOptions: "",
      depEdgesFile: "",
    };
    const result = buildGenerateHashesArgs(
      jarPath,
      workspacePath,
      bazelPath,
      outputPath,
      options,
    );
    expect(result).toContain("--useCquery");
  });

  it("includes --excludeExternalTargets when enabled", () => {
    const options = {
      useCquery: false,
      excludeExternal: true,
      targetType: "",
      startupOptions: "",
      commandOptions: "",
      depEdgesFile: "",
    };
    const result = buildGenerateHashesArgs(
      jarPath,
      workspacePath,
      bazelPath,
      outputPath,
      options,
    );
    expect(result).toContain("--excludeExternalTargets");
  });

  it("includes target type filter", () => {
    const options = {
      useCquery: false,
      excludeExternal: false,
      targetType: "java_library,go_test",
      startupOptions: "",
      commandOptions: "",
      depEdgesFile: "",
    };
    const result = buildGenerateHashesArgs(
      jarPath,
      workspacePath,
      bazelPath,
      outputPath,
      options,
    );
    const ttIndex = result.indexOf("-tt");
    expect(ttIndex).toBeGreaterThan(-1);
    expect(result[ttIndex + 1]).toBe("java_library,go_test");
  });

  it("includes startup and command options", () => {
    const options = {
      useCquery: false,
      excludeExternal: false,
      targetType: "",
      startupOptions: "--host_jvm_args=-Xmx4g",
      commandOptions: "--keep_going",
      depEdgesFile: "",
    };
    const result = buildGenerateHashesArgs(
      jarPath,
      workspacePath,
      bazelPath,
      outputPath,
      options,
    );
    const soIndex = result.indexOf("-so");
    expect(soIndex).toBeGreaterThan(-1);
    expect(result[soIndex + 1]).toBe("--host_jvm_args=-Xmx4g");
    const coIndex = result.indexOf("-co");
    expect(coIndex).toBeGreaterThan(-1);
    expect(result[coIndex + 1]).toBe("--keep_going");
  });

  it("includes dep edges file", () => {
    const options = {
      useCquery: false,
      excludeExternal: false,
      targetType: "",
      startupOptions: "",
      commandOptions: "",
      depEdgesFile: "/tmp/dep_edges.json",
    };
    const result = buildGenerateHashesArgs(
      jarPath,
      workspacePath,
      bazelPath,
      outputPath,
      options,
    );
    const depIndex = result.indexOf("--depEdgesFile");
    expect(depIndex).toBeGreaterThan(-1);
    expect(result[depIndex + 1]).toBe("/tmp/dep_edges.json");
  });

  it("places output path last", () => {
    const options = {
      useCquery: true,
      excludeExternal: true,
      targetType: "java_test",
      startupOptions: "--batch",
      commandOptions: "--keep_going",
      depEdgesFile: "/tmp/deps.json",
    };
    const result = buildGenerateHashesArgs(
      jarPath,
      workspacePath,
      bazelPath,
      outputPath,
      options,
    );
    expect(result[result.length - 1]).toBe(outputPath);
  });
});

describe("verifyBazel", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("succeeds when bazel is available", async () => {
    mockExec.mockResolvedValue(0);
    await expect(verifyBazel("bazel")).resolves.not.toThrow();
    expect(mockExec).toHaveBeenCalledWith("bazel", ["--version"]);
  });

  it("uses custom bazel path", async () => {
    mockExec.mockResolvedValue(0);
    await expect(verifyBazel("/usr/local/bin/bazel")).resolves.not.toThrow();
    expect(mockExec).toHaveBeenCalledWith("/usr/local/bin/bazel", [
      "--version",
    ]);
  });

  it("throws when bazel is not found", async () => {
    mockExec.mockRejectedValue(new Error("Unable to locate executable"));
    await expect(verifyBazel("bazel")).rejects.toThrow(
      /Bazel is required but not found/,
    );
  });
});

describe("buildGetImpactedTargetArgs", () => {
  const jarPath = "/tmp/bazel-diff.jar";
  const workspacePath = ".";
  const startingHashesPath = "/tmp/base_hashes.json";
  const finalHashesPath = "/tmp/head_hashes.json";
  const outputPath = "/tmp/impacted_targets.txt";

  it("builds basic args with no options", () => {
    const options = {
      excludeExternal: false,
      targetType: "",
      depEdgesFile: "",
    };
    const result = buildGetImpactedTargetArgs(
      jarPath,
      workspacePath,
      startingHashesPath,
      finalHashesPath,
      outputPath,
      options,
    );
    expect(result).toEqual([
      "-jar",
      "/tmp/bazel-diff.jar",
      "get-impacted-targets",
      "-w",
      ".",
      "-o",
      "/tmp/impacted_targets.txt",
      "-fh",
      "/tmp/head_hashes.json",
      "-sh",
      "/tmp/base_hashes.json",
    ]);
  });

  it("includes --excludeExternalTargets when enabled", () => {
    const options = {
      excludeExternal: true,
      targetType: "",
      depEdgesFile: "",
    };
    const result = buildGetImpactedTargetArgs(
      jarPath,
      workspacePath,
      startingHashesPath,
      finalHashesPath,
      outputPath,
      options,
    );
    expect(result).toContain("--excludeExternalTargets");
  });

  it("includes target type filter", () => {
    const options = {
      excludeExternal: false,
      targetType: "java_test",
      depEdgesFile: "",
    };
    const result = buildGetImpactedTargetArgs(
      jarPath,
      workspacePath,
      startingHashesPath,
      finalHashesPath,
      outputPath,
      options,
    );
    const ttIndex = result.indexOf("-tt");
    expect(ttIndex).toBeGreaterThan(-1);
    expect(result[ttIndex + 1]).toBe("java_test");
  });

  it("includes dep edges file", () => {
    const options = {
      excludeExternal: false,
      targetType: "",
      depEdgesFile: "/tmp/dep_edges.json",
    };
    const result = buildGetImpactedTargetArgs(
      jarPath,
      workspacePath,
      startingHashesPath,
      finalHashesPath,
      outputPath,
      options,
    );
    const depIndex = result.indexOf("--depEdgesFile");
    expect(depIndex).toBeGreaterThan(-1);
    expect(result[depIndex + 1]).toBe("/tmp/dep_edges.json");
  });
});

describe("run", () => {
  const inputDefaults = {
    "bazel-path": "bazel",
    "workspace-path": ".",
    "bazel-diff-version": "latest",
    "base-ref": "base-sha",
    "use-cquery": "false",
    "exclude-external-targets": "false",
    "target-type": "",
    "bazel-startup-options": "",
    "bazel-command-options": "",
    "include-distance": "false",
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetInput.mockImplementation((key) => inputDefaults[key] ?? "");
    mockExec.mockImplementation((cmd, args, options) => {
      if (cmd === "git" && args[1] === "--is-shallow-repository") {
        options.listeners.stdout(Buffer.from("false\n"));
      }
      if (cmd === "git" && args[0] === "rev-parse" && args[1] === "HEAD") {
        options.listeners.stdout(Buffer.from("headsha123\n"));
      }
      return Promise.resolve(0);
    });
    mockDownloadTool.mockResolvedValue("/tmp/bazel-diff.jar");
    mockReadFile.mockResolvedValue("//some:target");
  });

  it("resolves workspace-path '.' to an absolute path before passing to the JAR", async () => {
    await run();

    expect(mockSetFailed).not.toHaveBeenCalled();
    const javaExecCalls = mockExec.mock.calls.filter(([cmd]) => cmd === "java");
    expect(javaExecCalls.length).toBeGreaterThan(0);
    for (const [, args] of javaExecCalls) {
      const wIndex = args.indexOf("-w");
      if (wIndex !== -1) {
        expect(isAbsolute(args[wIndex + 1])).toBe(true);
      }
    }
  });

  it("handles include-distance output as JSON", async () => {
    mockGetInput.mockImplementation(
      (key) =>
        ({
          ...inputDefaults,
          "include-distance": "true",
        })[key] ?? "",
    );
    mockReadFile.mockResolvedValue(
      JSON.stringify([
        { label: "//some:target", targetDistance: 1, packageDistance: 1 },
      ]),
    );

    await run();

    expect(mockSetFailed).not.toHaveBeenCalled();
    expect(mockSetOutput).toHaveBeenCalledWith("has-changes", "true");
    expect(mockSetOutput).toHaveBeenCalledWith("target-count", "1");
  });
});
