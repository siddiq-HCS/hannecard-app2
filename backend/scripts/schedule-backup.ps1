$TaskName = 'HanycardBackupDaily'
$BatchPath = 'C:\Users\HCS122\hannecard-app\backend\scripts\backup-runner.bat'
$WorkingDirectory = 'C:\Users\HCS122\hannecard-app\backend'

schtasks /Delete /TN $TaskName /F 2>$null

schtasks /Create /TN $TaskName `
  /TR "$BatchPath" `
  /SC DAILY `
  /ST 17:00 `
  /RL HIGHEST `
  /F

Write-Host "Task created: $TaskName"
Write-Host "Command: $BatchPath"
Write-Host "Working directory: $WorkingDirectory"
