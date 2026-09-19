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
