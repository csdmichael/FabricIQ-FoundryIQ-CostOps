# CostOps UI Terraform

This root reads `../../config/deployment.json` and creates the production Windows Web App on the existing B1 plan. The app uses the existing App Service integration subnet and proxies only the tokenomics summary route to private APIM. It enables HTTPS, Node 22, health checks, route-all networking, diagnostics, and disables FTP/WebDeploy basic authentication.

Build and publish the portable ZIP with `scripts/build-ui-package.ps1`; Terraform intentionally manages only infrastructure. Bicep and Terraform are alternative owners of this logical stack and must not be applied together.

```powershell
terraform init -backend=false
terraform fmt -check
terraform validate
```