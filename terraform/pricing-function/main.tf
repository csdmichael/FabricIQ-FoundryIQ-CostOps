locals {
  config          = jsondecode(file(var.config_path))
  subscription_id = local.config.azure.subscriptionId
  tenant_id       = local.config.azure.tenantId
  resource_group  = local.config.azure.resourceGroup
  location        = local.config.azure.location
  tags            = tomap(local.config.tags)

  fn             = local.config.pricingFunction
  prices_schema  = try(local.fn.pricesSchema, try(local.config.dashboardApi.pricesSchema, "prices"))
  prices_table   = try(local.fn.pricesTable, try(local.config.dashboardApi.pricesTable, "token_price_history"))
  schedule       = try(local.fn.schedule, "0 0 6 * * *")
  sql_host       = try(local.config.fabric.sqlEndpointHost, "")
  lakehouse_name = try(local.config.fabric.lakehouseName, "lh_tokenomics")
  workspace_id   = try(local.config.fabric.workspaceId, "")
  lakehouse_id   = try(local.config.fabric.lakehouseId, "")
}

data "azurerm_resource_group" "fn" {
  name = local.resource_group
}

data "azurerm_service_plan" "fn" {
  name                = local.fn.existingPlanName
  resource_group_name = local.resource_group
}

data "azurerm_storage_account" "fn" {
  name                = local.fn.storageAccountName
  resource_group_name = try(local.fn.storageAccountResourceGroup, local.resource_group)
}

# Pricing sync Azure Function — Python on the existing Linux plan, identity-based host
# storage (no keys), writing to prices.token_price_history in Fabric OneLake via MI.
resource "azurerm_linux_function_app" "pricing" {
  name                                           = local.fn.appName
  resource_group_name                            = local.resource_group
  location                                       = local.location
  service_plan_id                                = data.azurerm_service_plan.fn.id
  storage_account_name                           = data.azurerm_storage_account.fn.name
  storage_uses_managed_identity                  = true
  https_only                                     = true
  ftp_publish_basic_authentication_enabled       = false
  webdeploy_publish_basic_authentication_enabled = false
  tags                                           = local.tags

  identity {
    type = "SystemAssigned"
  }

  app_settings = {
    TOKENOMICS_SQL_ENDPOINT_HOST   = local.sql_host
    TOKENOMICS_LAKEHOUSE_NAME      = local.lakehouse_name
    FABRIC_WORKSPACE_ID            = local.workspace_id
    FABRIC_LAKEHOUSE_ID            = local.lakehouse_id
    TOKENOMICS_PRICES_SCHEMA       = local.prices_schema
    TOKENOMICS_PRICES_TABLE        = local.prices_table
    PRICING_SYNC_SCHEDULE          = local.schedule
    SCM_DO_BUILD_DURING_DEPLOYMENT = "true"
  }

  site_config {
    always_on           = true
    ftps_state          = "Disabled"
    http2_enabled       = true
    minimum_tls_version = "1.2"

    application_stack {
      python_version = "3.11"
    }
  }

  lifecycle {
    precondition {
      condition     = data.azurerm_service_plan.fn.os_type == "Linux"
      error_message = "pricingFunction.existingPlanName must identify an existing Linux App Service plan."
    }
  }
}

# Identity-based access to the host storage account (no account keys).
resource "azurerm_role_assignment" "fn_storage" {
  scope                = data.azurerm_storage_account.fn.id
  role_definition_name = "Storage Blob Data Owner"
  principal_id         = azurerm_linux_function_app.pricing.identity[0].principal_id
}
