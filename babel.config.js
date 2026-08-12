const { execFileSync } = require("node:child_process");

const DEPLOYED_GIT_SHA_PLACEHOLDER = "__NOVELIDEAS_DEPLOYED_GIT_SHA__";

function resolveDeployedGitSha() {
  const environmentSha = String(
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.EXPO_PUBLIC_DEPLOYED_GIT_SHA ||
    process.env.GIT_COMMIT_SHA ||
    "",
  ).trim();
  if (environmentSha) return environmentSha;

  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  } catch {
    return "development";
  }
}

module.exports = function babelConfig(api) {
  const deployedGitSha = resolveDeployedGitSha();
  api.cache.using(() => deployedGitSha);

  return {
    presets: ["babel-preset-expo"],
    plugins: [
      function injectDeployedGitSha({ types }) {
        return {
          visitor: {
            StringLiteral(path) {
              if (path.node.value === DEPLOYED_GIT_SHA_PLACEHOLDER) {
                path.replaceWith(types.stringLiteral(deployedGitSha));
              }
            },
          },
        };
      },
    ],
  };
};
