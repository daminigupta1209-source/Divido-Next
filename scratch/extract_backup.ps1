$logPath = "C:\Users\damin\.gemini\antigravity\brain\2c9728f9-9169-4909-bad9-af2ff9238a75\.system_generated\logs\transcript.jsonl"
$lines = [System.IO.File]::ReadAllLines($logPath)

for ($i = $lines.Length - 1; $i -ge 0; $i--) {
    $line = $lines[$i]
    if ($line -like "*ExpenseModal.tsx*" -and $line -like "*Total Lines: 29*") {
        Write-Output "Found matching log line at index $i"
        [System.IO.File]::WriteAllText("c:\Users\damin\OneDrive\Documents\divido-next\scratch\extracted_line.json", $line)
        break
    }
}
