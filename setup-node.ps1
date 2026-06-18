# setup-node.ps1
# This script downloads and extracts a portable version of Node.js and NPM in the workspace.

$ErrorActionPreference = "Stop"

$workspaceDir = "C:\Users\Varun Jain\OneDrive\Desktop\Product Management\Vibe coding projects\Zomato AI"
$nodeBinDir = Join-Path $workspaceDir ".node-bin"
$zipFile = Join-Path $nodeBinDir "node-portable.zip"
$downloadUrl = "https://nodejs.org/dist/v18.20.3/node-v18.20.3-win-x64.zip"

Write-Host "Creating directory: $nodeBinDir..."
if (!(Test-Path $nodeBinDir)) {
    New-Item -ItemType Directory -Path $nodeBinDir | Out-Null
}

Write-Host "Downloading portable Node.js from $downloadUrl..."
Write-Host "This might take a moment..."
Invoke-WebRequest -Uri $downloadUrl -OutFile $zipFile

Write-Host "Extracting archive..."
tar -xf $zipFile -C $nodeBinDir

Write-Host "Cleaning up zip file..."
Remove-Item $zipFile

# Find the extracted directory name
$extractedFolder = Get-ChildItem -Path $nodeBinDir -Directory | Where-Object { $_.Name -like "node-*" } | Select-Object -First 1

if ($extractedFolder) {
    Write-Host "Node.js successfully extracted to: $($extractedFolder.FullName)"
    
    # Verify execution
    $nodeExe = Join-Path $extractedFolder.FullName "node.exe"
    $npmCmd = Join-Path $extractedFolder.FullName "npm.cmd"
    
    if (Test-Path $nodeExe) {
        $version = & $nodeExe -v
        Write-Host "Verification Success: node.exe version is $version"
        
        # Create helper batch files in the root for easy access
        $nodeHelper = Join-Path $workspaceDir "node-run.cmd"
        $nodeContent = "@echo off`r`n`"" + $nodeExe + "`" %*"
        $nodeContent | Out-File -FilePath $nodeHelper -Encoding ascii
        
        $npmHelper = Join-Path $workspaceDir "npm-run.cmd"
        $npmContent = "@echo off`r`n`"" + $npmCmd + "`" %*"
        $npmContent | Out-File -FilePath $npmHelper -Encoding ascii
        
        Write-Host "Created helper scripts:"
        Write-Host "  - node-run.cmd (wrapper for node)"
        Write-Host "  - npm-run.cmd (wrapper for npm)"
    } else {
        Write-Error "Could not find node.exe inside the extracted folder!"
    }
} else {
    Write-Error "Could not locate the extracted Node.js folder!"
}
