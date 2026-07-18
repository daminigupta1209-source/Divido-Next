$logPath = "C:\Users\damin\.gemini\antigravity\brain\2c9728f9-9169-4909-bad9-af2ff9238a75\.system_generated\logs\transcript.jsonl"
$lines = [System.IO.File]::ReadAllLines($logPath)

for ($i = 0; $i -lt $lines.Length; $i++) {
    $line = $lines[$i]
    if ($line -like "*view_file*" -and $line -like "*ExpenseModal.tsx*") {
        try {
            $json = $line | ConvertFrom-Json
            if ($json.content) {
                Write-Output "Line $($i): Content Length = $($json.content.Length)"
            }
        } catch {}
    }
}
