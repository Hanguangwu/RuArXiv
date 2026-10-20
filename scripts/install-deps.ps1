$ErrorActionPreference = "Continue"
Set-Location (Split-Path $PSScriptRoot -Parent)

$batches = @(
  @("-D", "typescript", "@types/node", "@types/react", "@types/react-dom", "tsx"),
  @("-D", "prisma@6.16.2", "tailwindcss", "@tailwindcss/postcss", "postcss"),
  @("next@16.4.2", "react", "react-dom"),
  @("@prisma/client@6.16.2", "gray-matter", "yaml", "zod"),
  @("react-markdown", "remark-gfm", "remark-math", "rehype-katex", "rehype-sanitize", "katex"),
  @("@octokit/rest", "clsx", "tailwind-merge", "lucide-react", "date-fns")
)

foreach ($b in $batches) {
  $ok = $false
  for ($i = 1; $i -le 5; $i++) {
    Write-Host "==> batch: $($b -join ' ') (attempt $i)"
    & pnpm add @b --fetch-timeout 600000 --network-concurrency 2 *> install.log
    if ($LASTEXITCODE -eq 0) { $ok = $true; break }
  }
  if (-not $ok) {
    Write-Host "!! FAILED batch: $($b -join ' ')"
    Get-Content install.log -Tail 15
  }
}
Write-Host "==> done"
Get-Content package.json
