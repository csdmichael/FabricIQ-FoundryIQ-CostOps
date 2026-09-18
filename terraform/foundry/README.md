# Private Foundry Terraform

This root is Terraform parity for `bicep/foundry`. It creates an exclusive delegated agent subnet, private Foundry account/project, pinned model deployment, project capability host, private endpoint with existing DNS zones, least-privilege RBAC, and two APIM managed-identity model connections with fixed agent attribution headers.

Custom OAuth project connections and Prompt Agent versions are provisioned idempotently by `scripts/provision-foundry-agents.ps1`. It checkpoints each verified connection and agent version so a partial failure can be resumed safely; they are intentionally excluded from Terraform state because they require rotating client secrets and per-user consent redirects.

```powershell
terraform init -backend=false
terraform fmt -check
terraform validate
terraform plan -var-file=main.tfvars.json
```

Bicep and Terraform are alternative owners of the same logical resources and must not be applied together.