param(
    [string]$Protocol = "codemonkey",
    [string]$AppName = "Codemonkey Games Launcher",
    [string]$AppPath
)

if (-not $AppPath) {
    Write-Error "AppPath parameter is required."
    exit 1
}

$RegistryPath = "HKCU:\Software\Classes\$Protocol"

if (-not (Test-Path $RegistryPath)) {
    New-Item -Path $RegistryPath -Force | Out-Null
}

Set-ItemProperty -Path $RegistryPath -Name "(Default)" -Value "URL:$AppName" -Force
Set-ItemProperty -Path $RegistryPath -Name "URL Protocol" -Value "" -Force

$IconPath = "$RegistryPath\DefaultIcon"
if (-not (Test-Path $IconPath)) {
    New-Item -Path $IconPath -Force | Out-Null
}
Set-ItemProperty -Path $IconPath -Name "(Default)" -Value """$AppPath""" -Force

$CommandPath = "$RegistryPath\shell\open\command"
if (-not (Test-Path $CommandPath)) {
    New-Item -Path $CommandPath -Force | Out-Null
}
Set-ItemProperty -Path $CommandPath -Name "(Default)" -Value """$AppPath"" ""%1""" -Force

Write-Host "Successfully registered '$Protocol' URL protocol."
