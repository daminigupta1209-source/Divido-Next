$srcPath = "C:\Users\damin\.gemini\antigravity\brain\d7c77501-3a36-4a70-b77e-a874a371f881\scratch\isolated_ge_utf8.js"
$destPath = "C:\Users\damin\OneDrive\Documents\divido-next\scratch\formatted_ge.js"

$content = [System.IO.File]::ReadAllText($srcPath, [System.Text.Encoding]::UTF8)

# Format content
$formatted = $content -replace ';', ";`n" -replace '\{', "{`n" -replace '\}', "`n}`n" -replace '&&', " && " -replace '\|\|', " || "

[System.IO.File]::WriteAllText($destPath, $formatted, [System.Text.Encoding]::UTF8)
Write-Output "Formatted file written to $destPath"
