param(
    [string]$Message = "Update Flutter web"
)

$BACKEND = "https://eldersspace-backend.onrender.com"

Write-Host "Building Flutter web..." -ForegroundColor Cyan
Set-Location eldersspace
flutter build web --release --no-tree-shake-icons --dart-define=BACKEND_HOST=$BACKEND
if ($LASTEXITCODE -ne 0) {
    Write-Host "Build failed" -ForegroundColor Red
    Set-Location ..
    exit 1
}

Write-Host "Deploying Flutter web to Vercel..." -ForegroundColor Cyan
Set-Location build\web
vercel . --prod
if ($LASTEXITCODE -ne 0) {
    Write-Host "Vercel deploy failed" -ForegroundColor Red
    Set-Location ..\..\..
    exit 1
}

Set-Location ..\..\..
Write-Host "Staging changes..." -ForegroundColor Cyan
git add -f eldersspace/build/web
git add eldersspace/lib
git add eldersspace_backend

Write-Host "Committing..." -ForegroundColor Cyan
git commit -m $Message
if ($LASTEXITCODE -ne 0) {
    Write-Host "Nothing to commit or commit failed" -ForegroundColor Yellow
    exit 0
}

Write-Host "Pushing..." -ForegroundColor Cyan
git push

Write-Host "Done!" -ForegroundColor Green
