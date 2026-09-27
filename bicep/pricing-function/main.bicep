targetScope = 'resourceGroup'

// Pricing sync Azure Function — calls the multi-cloud pricing sources on a schedule
// and appends changed rows to the governed prices.token_price_history Delta table in
// Fabric OneLake via managed identity. Hosted on the same Linux App Service plan as the API.
// Fully config-driven from config/deployment.json (pricingFunction block).

var config = loadJsonContent('../../config/deployment.json')
var fn = config.pricingFunction
var api = config.dashboardApi
var tags = config.?tags ?? {}

@description('Location for the Function App (defaults to the resource group location).')
param location string = resourceGroup().location

resource hostingPlan 'Microsoft.Web/serverfarms@2023-12-01' = {
  name: fn.existingPlanName
  location: location
  tags: tags
  kind: 'linux'
  sku: {
    name: 'B1'
    tier: 'Basic'
  }
  properties: {
    reserved: true
  }
}

resource storage 'Microsoft.Storage/storageAccounts@2025-06-01' existing = {
  name: fn.storageAccountName
}

resource functionApp 'Microsoft.Web/sites@2023-12-01' = {
  name: fn.appName
  location: location
  tags: tags
  kind: 'functionapp,linux'
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    serverFarmId: hostingPlan.id
    httpsOnly: true
    reserved: true
    virtualNetworkSubnetId: fn.integrationSubnetResourceId
    siteConfig: {
      linuxFxVersion: 'Python|3.11'
      ftpsState: 'Disabled'
      minTlsVersion: '1.2'
      http20Enabled: true
      alwaysOn: true
      vnetRouteAllEnabled: true
      appSettings: [
        {
          name: 'FUNCTIONS_EXTENSION_VERSION'
          value: '~4'
        }
        {
          name: 'FUNCTIONS_WORKER_RUNTIME'
          value: 'python'
        }
        // Identity-based AzureWebJobsStorage (no account keys / connection strings).
        {
          name: 'AzureWebJobsStorage__accountName'
          value: storage.name
        }
        {
          name: 'AzureWebJobsStorage__credential'
          value: 'managedidentity'
        }
        {
          name: 'SCM_DO_BUILD_DURING_DEPLOYMENT'
          value: 'true'
        }
        {
          name: 'WEBSITE_VNET_ROUTE_ALL'
          value: '1'
        }
        // Pricing-sync inputs (consumed by the function).
        {
          name: 'TOKENOMICS_SQL_ENDPOINT_HOST'
          value: config.fabric.?sqlEndpointHost ?? ''
        }
        {
          name: 'TOKENOMICS_LAKEHOUSE_NAME'
          value: config.fabric.?lakehouseName ?? 'lh_tokenomics'
        }
        {
          name: 'FABRIC_WORKSPACE_ID'
          value: config.fabric.?workspaceId ?? ''
        }
        {
          name: 'FABRIC_LAKEHOUSE_ID'
          value: config.fabric.?lakehouseId ?? ''
        }
        {
          name: 'TOKENOMICS_PRICES_SCHEMA'
          value: fn.?pricesSchema ?? api.?pricesSchema ?? 'prices'
        }
        {
          name: 'TOKENOMICS_PRICES_TABLE'
          value: fn.?pricesTable ?? api.?pricesTable ?? 'token_price_history'
        }
        {
          name: 'PRICING_SYNC_SCHEDULE'
          value: fn.?schedule ?? '0 0 6 * * *'
        }
        {
          name: 'TOKENOMICS_CONFIG_PATH'
          value: '/home/site/wwwroot/config/deployment.json'
        }
      ]
    }
  }
}

// Grant the Function's managed identity access to its own storage (identity-based host storage).
var storageBlobDataOwner = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'b7e6dc6d-f1e8-4753-8033-0f276bb0955b')

resource storageRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(storage.id, functionApp.id, storageBlobDataOwner)
  scope: storage
  properties: {
    roleDefinitionId: storageBlobDataOwner
    principalId: functionApp.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

output functionAppId string = functionApp.id
output functionAppName string = functionApp.name
output principalId string = functionApp.identity.principalId
output defaultHostName string = functionApp.properties.defaultHostName
