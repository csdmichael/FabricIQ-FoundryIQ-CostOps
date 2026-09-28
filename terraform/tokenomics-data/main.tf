locals {
  config = jsondecode(file(var.config_path))

  subscription_id = local.config.azure.subscriptionId
  tenant_id       = local.config.azure.tenantId
  resource_group  = local.config.azure.resourceGroup
  platform        = local.config.tokenomicsPlatform
}

data "azurerm_resource_group" "tokenomics" {
  name = local.resource_group
}

data "azurerm_cosmosdb_account" "existing" {
  name                = local.platform.cosmos.accountName
  resource_group_name = data.azurerm_resource_group.tokenomics.name
}

data "azurerm_storage_account" "existing" {
  name                = local.platform.rawStorage.accountName
  resource_group_name = data.azurerm_resource_group.tokenomics.name
}

data "azurerm_linux_web_app" "api" {
  name                = local.config.dashboardApi.appName
  resource_group_name = data.azurerm_resource_group.tokenomics.name
}

resource "azapi_resource" "database" {
  type      = "Microsoft.DocumentDB/databaseAccounts/sqlDatabases@2024-11-15"
  name      = local.platform.cosmos.databaseName
  parent_id = data.azurerm_cosmosdb_account.existing.id

  body = {
    properties = {
      resource = {
        id = local.platform.cosmos.databaseName
      }
    }
  }
}

resource "azapi_resource" "container" {
  type      = "Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2024-11-15"
  name      = local.platform.cosmos.containerName
  parent_id = azapi_resource.database.id

  body = {
    properties = {
      resource = {
        id = local.platform.cosmos.containerName
        partitionKey = {
          kind    = "Hash"
          paths   = [local.platform.cosmos.partitionKeyPath]
          version = 2
        }
        indexingPolicy = {
          automatic    = true
          indexingMode = "consistent"
          includedPaths = [
            { path = "/*" }
          ]
          excludedPaths = [
            { path = "/\"_etag\"/?" }
          ]
        }
      }
    }
  }
}

resource "azapi_resource" "showcase_visits_container" {
  type      = "Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2024-11-15"
  name      = local.platform.cosmos.showcaseVisits.containerName
  parent_id = azapi_resource.database.id

  body = {
    properties = {
      resource = {
        id         = local.platform.cosmos.showcaseVisits.containerName
        defaultTtl = local.platform.cosmos.showcaseVisits.retentionDays * 86400
        partitionKey = {
          kind    = "Hash"
          paths   = [local.platform.cosmos.showcaseVisits.partitionKeyPath]
          version = 2
        }
        indexingPolicy = {
          automatic     = true
          indexingMode  = "consistent"
          includedPaths = [{ path = "/*" }]
          excludedPaths = [{ path = "/\"_etag\"/?" }]
        }
      }
    }
  }
}

resource "azapi_resource" "showcase_cosmos_role" {
  type      = "Microsoft.DocumentDB/databaseAccounts/sqlRoleAssignments@2024-11-15"
  name      = uuidv5("url", "${data.azurerm_cosmosdb_account.existing.id}/${azapi_resource.showcase_visits_container.id}/${data.azurerm_linux_web_app.api.id}")
  parent_id = data.azurerm_cosmosdb_account.existing.id

  body = {
    properties = {
      principalId      = data.azurerm_linux_web_app.api.identity[0].principal_id
      roleDefinitionId = "${data.azurerm_cosmosdb_account.existing.id}/sqlRoleDefinitions/00000000-0000-0000-0000-000000000002"
      scope            = "${data.azurerm_cosmosdb_account.existing.id}/dbs/${local.platform.cosmos.databaseName}/colls/${local.platform.cosmos.showcaseVisits.containerName}"
    }
  }
}

resource "azapi_resource" "maps" {
  type      = "Microsoft.Maps/accounts@2023-06-01"
  name      = local.platform.cosmos.showcaseVisits.mapsAccountName
  parent_id = data.azurerm_resource_group.tokenomics.id
  location  = "global"

  body = {
    kind = "Gen2"
    sku = {
      name = "G2"
    }
    properties = {
      disableLocalAuth = true
    }
  }

  response_export_values = ["properties.uniqueId"]
}

resource "azurerm_role_assignment" "maps_reader" {
  name               = uuidv5("url", "${azapi_resource.maps.id}/${data.azurerm_linux_web_app.api.id}/423170ca-a8f6-4b0f-8487-9e4eb8f49bfa")
  scope              = azapi_resource.maps.id
  role_definition_id = "/subscriptions/${local.subscription_id}/providers/Microsoft.Authorization/roleDefinitions/423170ca-a8f6-4b0f-8487-9e4eb8f49bfa"
  principal_id       = data.azurerm_linux_web_app.api.identity[0].principal_id
  principal_type     = "ServicePrincipal"
}

resource "azapi_resource" "raw_container" {
  type      = "Microsoft.Storage/storageAccounts/blobServices/containers@2025-06-01"
  name      = local.platform.rawStorage.containerName
  parent_id = "${data.azurerm_storage_account.existing.id}/blobServices/default"

  body = {
    properties = {
      publicAccess = "None"
    }
  }
}
