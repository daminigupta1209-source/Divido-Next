$json = Get-Content "c:\Users\damin\OneDrive\Documents\divido-next\scratch\extracted_line.json" -Raw | ConvertFrom-Json
$contentStr = $json.content

$lines = $contentStr -split "\r?\n"
$originalLines = @()
$foundCodeStart = $false

foreach ($line in $lines) {
    if ($line -match '^\d+:\s') {
        $foundCodeStart = $true
        $colonIdx = $line.IndexOf(":")
        if ($colonIdx -ne -1) {
            $code = $line.Substring($colonIdx + 1)
            if ($code.StartsWith(" ")) {
                $code = $code.Substring(1)
            }
            $originalLines += $code
        }
    }
}

$reconstructed = $originalLines -join "`r`n"
$filePath = "c:\Users\damin\OneDrive\Documents\divido-next\src\components\ExpenseModal.tsx"
$utf8NoBOM = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($filePath, $reconstructed, $utf8NoBOM)

Write-Output "Successfully restored ExpenseModal.tsx from transcript backup!"
