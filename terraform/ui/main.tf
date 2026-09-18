locals {
  config          = jsondecode(file(var.config_path))
  subscription_id = local.config.azure.subscriptionId
  tenant_id       = local.config.azure.tenantId
  resource_group  = local.config.azure.resourceGroup
  location        = local.config.azure.location
  tags            = tomap(local.config.tags)
  apim_host       = trimsuffix(trimprefix(local.config.apim.gatewayUrl, "https://"), "/")
  workspace_id    = "/subscriptions/${local.subscription_id}/resourceGroups/${local.resource_group}/providers/Microsoft.OperationalInsights/workspaces/log-${local.config.broker.appName}"
}

data "azurerm_resource_group" "ui" {
  name = local.resource_group
}

data "azurerm_service_plan" "ui" {
  name                = local.config.ui.existingPlanName
  resource_group_name = local.resource_group
}

resource "azurerm_windows_web_app" "ui" {
  name                                           = local.config.ui.appName
  resource_group_name                            = local.resource_group
  location                                       = local.location
  service_plan_id                                = data.azurerm_service_plan.ui.id
  https_only                                     = true
  public_network_access_enabled                  = true
  virtual_network_subnet_id                      = local.config.ui.integrationSubnetResourceId
  ftp_publish_basic_authentication_enabled       = false
  webdeploy_publish_basic_authentication_enabled = false
  tags                                           = local.tags

  app_settings = {
    APIM_GATEWAY_HOST              = local.apim_host
    APIM_TOKENOMICS_API_PATH       = local.config.apim.tokenomicsApiPath
    NODE_ENV                       = "production"
    SCM_DO_BUILD_DURING_DEPLOYMENT = "false"
    WEBSITE_NODE_DEFAULT_VERSION   = "~22"
    WEBSITE_VNET_ROUTE_ALL         = "1"
  }

  site_config {
    always_on                         = true
    app_command_line                  = "node server.js"
    ftps_state                        = "Disabled"
    health_check_eviction_time_in_min = 5
    health_check_path                 = "/health"
    http2_enabled                     = true
    ip_restriction_default_action     = "Allow"
    minimum_tls_version               = "1.2"
    scm_ip_restriction_default_action = "Allow"
    scm_minimum_tls_version           = "1.2"
    use_32_bit_worker                 = false
    vnet_route_all_enabled            = true

    application_stack {
      current_stack = "node"
      node_version  = "~22"
    }
  }

  lifecycle {
    precondition {
      condition     = data.azurerm_service_plan.ui.os_type == "Windows" && upper(data.azurerm_service_plan.ui.sku_name) == "B1"
      error_message = "ui.existingPlanName must identify the existing Windows B1 App Service plan."
    }
  }
}

resource "azurerm_monitor_diagnostic_setting" "ui" {
  name                       = "ui-host-logs"
  target_resource_id         = azurerm_windows_web_app.ui.id
  log_analytics_workspace_id = local.workspace_id

  enabled_log {
    category = "AppServiceHTTPLogs"
  }

  enabled_log {
    category = "AppServiceConsoleLogs"
  }

  enabled_metric {
    category = "AllMetrics"
  }
}