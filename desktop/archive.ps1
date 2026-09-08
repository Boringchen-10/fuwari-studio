$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$releaseRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../release-v012'))
$appRoot = Join-Path $releaseRoot 'Blog Studio-win32-x64'
$archivePath = Join-Path $releaseRoot 'Blog-Studio-v0.1.2-Windows-x64.zip'
$stream = [IO.File]::Open($archivePath, [IO.FileMode]::Create)
$archive = [IO.Compression.ZipArchive]::new($stream, [IO.Compression.ZipArchiveMode]::Create)
$pending = [Collections.Generic.Stack[string]]::new()
$pending.Push($appRoot)
$count = 0
try {
    while ($pending.Count -gt 0) {
        $directory = $pending.Pop()
        foreach ($entry in [IO.Directory]::EnumerateFileSystemEntries($directory)) {
            $name = [IO.Path]::GetFileName($entry)
            if ($directory -eq $appRoot -and $name -eq 'Fuwari Studio Data') { continue }
            $attributes = [IO.File]::GetAttributes($entry)
            if ($attributes -band [IO.FileAttributes]::ReparsePoint) { throw "Unexpected link in distribution: $entry" }
            if ($attributes -band [IO.FileAttributes]::Directory) { $pending.Push($entry); continue }
            $relative = [IO.Path]::GetRelativePath($releaseRoot, $entry).Replace('\', '/')
            [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $entry, $relative, [IO.Compression.CompressionLevel]::Optimal) | Out-Null
            $count++
        }
    }
} finally { $archive.Dispose(); $stream.Dispose() }
$hash = (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash.ToLowerInvariant()
[IO.File]::WriteAllText($archivePath + '.sha256', "$hash  $([IO.Path]::GetFileName($archivePath))`n")
Write-Output "Files: $count"
Get-Item -LiteralPath $archivePath | Select-Object FullName, Length
Write-Output "SHA256: $hash"
