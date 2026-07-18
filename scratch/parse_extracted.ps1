$json = Get-Content "c:\Users\damin\OneDrive\Documents\divido-next\scratch\extracted_line.json" -Raw | ConvertFrom-Json
$json.PSObject.Properties | ForEach-Object { 
    $val = $_.Value
    if ($val -ne $null) {
        $str = $val.ToString()
        $len = [Math]::Min(150, $str.Length)
        Write-Output "Property: $($_.Name) = $($str.Substring(0, $len))"
    } else {
        Write-Output "Property: $($_.Name) = null"
    }
}
