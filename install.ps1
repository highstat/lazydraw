$ErrorActionPreference = "Stop"
$Repo = "highstat/lazydraw"
$BinName = "lazydraw-windows-x64.exe"
$DownloadUrl = "https://github.com/$Repo/releases/latest/download/$BinName"

$InstallDir = Join-Path $HOME ".local\bin"
if (!(Test-Path $InstallDir)) {
    New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
}

$Target = Join-Path $InstallDir "lazydraw.exe"

Write-Host "Downloading lazydraw for Windows from GitHub Releases..."
Invoke-WebRequest -Uri $DownloadUrl -OutFile $Target -UseBasicParsing

Write-Host "Successfully installed lazydraw to $Target"

$UserPath = [Environment]::GetEnvironmentVariable("Path", "User")
if ($UserPath -notlike "*$InstallDir*") {
    [Environment]::SetEnvironmentVariable("Path", "$UserPath;$InstallDir", "User")
    Write-Host "Added $InstallDir to user PATH. Please restart your terminal."
}

Write-Host "Run 'lazydraw' to start!"
