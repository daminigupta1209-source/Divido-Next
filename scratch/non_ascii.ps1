$filePath = "c:\Users\damin\OneDrive\Documents\divido-next\src\components\ExpenseModal.tsx"
$lines = [System.IO.File]::ReadAllLines($filePath)
for ($i = 0; $i -lt $lines.Length; $i++) {
    $line = $lines[$i]
    if ($line -match '[^\x00-\x7F]') {
        Write-Output "Line $($i+1): $line"
    }
}
