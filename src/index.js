import * as core from "@actions/core";
import * as exec from "@actions/exec";
import * as tc from "@actions/tool-cache";
import { readFile, unlink } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

export async function verifyJava() {
  try {
    await exec.exec("java", ["-version"]);
  } catch (error) {
    throw new Error(
      `Java is required but not found on the runner. Add actions/setup-java to your workflow. ${error.message}`,
      { cause: error },
    );
  }
}

export async function verifyBazel(bazelPath) {
  try {
    await exec.exec(bazelPath, ["--version"]);
  } catch (error) {
    throw new Error(
      `Bazel is required but not found on the runner: ${error.message}`,
      {
        cause: error,
      },
    );
  }
}

export async function verifyNotShallow() {
  let stdout = "";
  await exec.exec("git", ["rev-parse", "--is-shallow-repository"], {
    listeners: {
      stdout: (out) => {
        stdout += out.toString();
      },
    },
  });
  if (stdout.trim() === "true") {
    throw new Error(
      "Repository is a shallow clone. Set fetch-depth: 0 in actions/checkout to enable full history.",
    );
  }
}

export async function downloadBazelDiff(version) {
  const url =
    version === "latest"
      ? "https://github.com/Tinder/bazel-diff/releases/latest/download/bazel-diff_deploy.jar"
      : `https://github.com/Tinder/bazel-diff/releases/download/${version}/bazel-diff_deploy.jar`;

  core.info(`Downloading bazel-diff from ${url}`);
  const jarPath = await tc.downloadTool(url);
  return jarPath;
}

export async function resolveBaseRef() {
  let baseRef = core.getInput("base-ref");
  if (baseRef !== "") {
    return baseRef;
  }
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (eventPath) {
    const event = process.env.GITHUB_EVENT_NAME;
    return parseGitHubEvent(eventPath, event);
  }
  return "HEAD~1";
}

export async function parseGitHubEvent(filePath, eventType) {
  const event = JSON.parse(await readFile(filePath, "utf8"));
  if (eventType === "pull_request") {
    return event.pull_request.base.sha;
  }
  if (eventType === "push") {
    return event.before;
  }
  if (eventType === "merge_group") {
    return event.merge_group.base_sha;
  }
  throw new Error(`unsupported event type: ${eventType}`);
}

export async function getCurrentRef() {
  let ref = "";
  await exec.exec("git", ["rev-parse", "HEAD"], {
    listeners: { stdout: (data) => (ref += data.toString()) },
  });
  return ref.trim();
}

export function buildGenerateHashesArgs(
  jarPath,
  workspacePath,
  bazelPath,
  outputPath,
  options,
) {
  const args = [
    "-jar",
    jarPath,
    "generate-hashes",
    "-w",
    workspacePath,
    "-b",
    bazelPath,
  ];
  if (options.useCquery) args.push("--useCquery");
  if (options.excludeExternal) args.push("--excludeExternalTargets");
  if (options.targetType) args.push("-tt", options.targetType);
  if (options.startupOptions) args.push("-so", options.startupOptions);
  if (options.commandOptions) args.push("-co", options.commandOptions);
  if (options.depEdgesFile) args.push("--depEdgesFile", options.depEdgesFile);
  args.push(outputPath);
  return args;
}

export function buildGetImpactedTargetArgs(
  jarPath,
  workspacePath,
  startingHashesPath,
  finalHashesPath,
  outputPath,
  options,
) {
  const args = [
    "-jar",
    jarPath,
    "get-impacted-targets",
    "-w",
    workspacePath,
    "-o",
    outputPath,
    "-fh",
    finalHashesPath,
    "-sh",
    startingHashesPath,
  ];
  if (options.excludeExternal) args.push("--excludeExternalTargets");
  if (options.targetType) args.push("-tt", options.targetType);
  if (options.depEdgesFile) args.push("--depEdgesFile", options.depEdgesFile);
  return args;
}

export async function run() {
  let originalRef;
  const tempFiles = [];
  try {
    core.info("bazel-diff action starting...");

    await verifyJava();

    const bazelPath = core.getInput("bazel-path");
    await verifyBazel(bazelPath);

    await verifyNotShallow();

    const version = core.getInput("bazel-diff-version");
    const jarPath = await downloadBazelDiff(version);
    core.info(`bazel-diff downloaded to ${jarPath}`);

    // generate head hashes
    originalRef = await getCurrentRef();
    const headHashesPath = join(tmpdir(), "head_hashes.json");
    tempFiles.push(headHashesPath);
    const workspacePath = core.getInput("workspace-path");
    const options = Object.freeze({
      useCquery: core.getInput("use-cquery") === "true",
      excludeExternal: core.getInput("exclude-external-targets") === "true",
      targetType: core.getInput("target-type"),
      startupOptions: core.getInput("bazel-startup-options"),
      commandOptions: core.getInput("bazel-command-options"),
      depEdgesFile:
        core.getInput("include-distance") === "true"
          ? join(tmpdir(), "dep_edges.json")
          : "",
    });
    if (options.depEdgesFile) tempFiles.push(options.depEdgesFile);
    const headArgs = buildGenerateHashesArgs(
      jarPath,
      workspacePath,
      bazelPath,
      headHashesPath,
      options,
    );
    await exec.exec("java", headArgs);
    core.info(`Calculated hashes for original ref: ${originalRef}`);

    // generate base hashes
    const baseRef = await resolveBaseRef();
    core.info(`Checking out base ref: ${baseRef}`);
    await exec.exec("git", ["checkout", baseRef]);
    const baseHashesPath = join(tmpdir(), "base_hashes.json");
    tempFiles.push(baseHashesPath);
    const baseArgs = buildGenerateHashesArgs(
      jarPath,
      workspacePath,
      bazelPath,
      baseHashesPath,
      options,
    );
    await exec.exec("java", baseArgs);
    core.info(`Calculated hashes for base ref`);

    // compute impacted targets
    const fileType = options.depEdgesFile ? "json" : "txt";
    const impactedTargetsPath = join(tmpdir(), `impacted_targets.${fileType}`);
    const diffArgs = buildGetImpactedTargetArgs(
      jarPath,
      workspacePath,
      baseHashesPath,
      headHashesPath,
      impactedTargetsPath,
      options,
    );
    await exec.exec("java", diffArgs);

    // set outputs
    const output = await readFile(impactedTargetsPath, "utf8");
    const targets = output.trim();
    const targetList = targets === "" ? [] : targets.split("\n");
    core.setOutput("impacted-targets", targets);
    core.setOutput("impacted-targets-file", impactedTargetsPath);
    if (options.depEdgesFile) {
      const parsed = JSON.parse(output);
      core.setOutput("has-changes", (parsed.length > 0).toString());
      core.setOutput("target-count", parsed.length.toString());
    } else {
      core.setOutput("has-changes", (targetList.length > 0).toString());
      core.setOutput("target-count", targetList.length.toString());
    }
  } catch (error) {
    core.setFailed(error.message);
  } finally {
    if (originalRef) {
      try {
        await exec.exec("git", ["checkout", originalRef]);
      } catch {
        core.warning(`failed to restore original ref: ${originalRef}`);
      }
    }
    for (const file of tempFiles) {
      try {
        await unlink(file);
      } catch {
        /* ignore if already removed */
      }
    }
  }
}

run();
