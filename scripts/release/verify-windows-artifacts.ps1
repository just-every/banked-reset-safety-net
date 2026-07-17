param(
  [Parameter(Mandatory = $true)]
  [ValidateSet("x64", "arm64")]
  [string]$Architecture,

  [string]$ReleaseDirectory = "release"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$installers = @(Get-ChildItem -Path $ReleaseDirectory -File -Filter "Reset-Net-*-win-$Architecture.exe")
if ($installers.Count -ne 1) {
  throw "Expected exactly one Windows $Architecture installer, found $($installers.Count)."
}
if ($installers[0].Length -eq 0) {
  throw "Windows $Architecture installer is empty."
}

$unpackedDirectoryName = if ($Architecture -eq "x64") { "win-unpacked" } else { "win-arm64-unpacked" }
$application = Join-Path (Join-Path $ReleaseDirectory $unpackedDirectoryName) "Reset Net.exe"
if (-not (Test-Path -Path $application -PathType Leaf)) {
  throw "Packaged Windows application is missing at $application."
}

$stream = [System.IO.File]::OpenRead($application)
$reader = $null
try {
  $reader = [System.IO.BinaryReader]::new($stream)
  $stream.Position = 0x3c
  $peOffset = $reader.ReadInt32()
  $stream.Position = $peOffset + 4
  $machine = $reader.ReadUInt16()
}
finally {
  if ($null -ne $reader) {
    $reader.Dispose()
  }
  else {
    $stream.Dispose()
  }
}

$expectedMachine = if ($Architecture -eq "x64") { 0x8664 } else { 0xaa64 }
if ($machine -ne $expectedMachine) {
  throw ("Packaged application machine type is 0x{0:x4}; expected 0x{1:x4} for {2}." -f $machine, $expectedMachine, $Architecture)
}

$hash = Get-FileHash -Algorithm SHA256 -Path $installers[0].FullName
"$($hash.Hash.ToLowerInvariant())  $($installers[0].Name)" |
  Set-Content -Path "$ReleaseDirectory/SHA256SUMS-windows-$Architecture.txt" -Encoding ascii
