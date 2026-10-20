/**
 * Content / discussion sync CLI.
 *
 *   pnpm sync            # mirror local content/papers into the database
 *   pnpm sync --github   # pull the configured GitHub content repository
 */
import { loadLocalPapers } from "../src/lib/content";

async function main() {
  const useGitHub = process.argv.includes("--github");
  if (useGitHub) {
    const { syncFromGitHub } = await import("../src/lib/sync");
    const report = await syncFromGitHub({ actorLogin: "cli" });
    console.log("GitHub 同步完成", report);
    if (report.failed.length) process.exitCode = 1;
    return;
  }

  const { syncLocalRepository } = await import("../src/lib/ingest");
  const records = loadLocalPapers();
  console.log(`发现 ${records.length} 篇本地论文`);
  const report = await syncLocalRepository({ actorLogin: "cli" });
  console.log("本地同步完成", report);
  if (report.failed.length) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    const { prisma } = await import("../src/lib/db");
    await prisma.$disconnect();
  });
