targetScope = 'resourceGroup'

var config = loadJsonContent('../../config/deployment.json')
var platform = config.tokenomicsPlatform
var showcaseVisits = platform.cosmos.showcaseVisits

resource cosmosAccount 'Microsoft.DocumentDB/databaseAccounts@2024-11-15' existing = {
  name: platform.cosmos.accountName
}

resource tokenomicsDatabase 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases@2024-11-15' = {
  parent: cosmosAccount
  name: platform.cosmos.databaseName
  properties: {
    resource: {
      id: platform.cosmos.databaseName
    }
  }
}

resource tokenConsumptionContainer 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2024-11-15' = {
  parent: tokenomicsDatabase
  name: platform.cosmos.containerName
  properties: {
    resource: {
      id: platform.cosmos.containerName
      partitionKey: {
        kind: 'Hash'
        paths: [
          platform.cosmos.partitionKeyPath
        ]
        version: 2
      }
      indexingPolicy: {
        automatic: true
        indexingMode: 'consistent'
        includedPaths: [
          {
            path: '/*'
          }
        ]
        excludedPaths: [
          {
            path: '/"_etag"/?'
          }
        ]
      }
    }
  }
}

resource showcaseVisitsContainer 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2024-11-15' = {
  parent: tokenomicsDatabase
  name: showcaseVisits.containerName
  properties: {
    resource: {
      id: showcaseVisits.containerName
      defaultTtl: int(showcaseVisits.retentionDays) * 86400
      partitionKey: {
        kind: 'Hash'
        paths: [
          showcaseVisits.partitionKeyPath
        ]
        version: 2
      }
      indexingPolicy: {
        automatic: true
        indexingMode: 'consistent'
        includedPaths: [
          {
            path: '/*'
          }
        ]
        excludedPaths: [
          {
            path: '/"_etag"/?'
          }
        ]
      }
    }
  }
}

resource apiApp 'Microsoft.Web/sites@2023-12-01' existing = {
  name: config.dashboardApi.appName
}

resource showcaseCosmosRole 'Microsoft.DocumentDB/databaseAccounts/sqlRoleAssignments@2024-11-15' = {
  parent: cosmosAccount
  name: guid(cosmosAccount.id, showcaseVisitsContainer.id, apiApp.id)
  properties: {
    principalId: apiApp.identity.principalId
    roleDefinitionId: '${cosmosAccount.id}/sqlRoleDefinitions/00000000-0000-0000-0000-000000000002'
    scope: '${cosmosAccount.id}/dbs/${platform.cosmos.databaseName}/colls/${showcaseVisits.containerName}'
  }
}

resource mapsAccount 'Microsoft.Maps/accounts@2023-06-01' = {
  name: showcaseVisits.mapsAccountName
  location: 'global'
  kind: 'Gen2'
  sku: {
    name: 'G2'
  }
  properties: {
    disableLocalAuth: true
  }
}

var azureMapsDataReader = subscriptionResourceId(
  'Microsoft.Authorization/roleDefinitions',
  '423170ca-a8f6-4b0f-8487-9e4eb8f49bfa'
)

resource mapsRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(mapsAccount.id, apiApp.id, azureMapsDataReader)
  scope: mapsAccount
  properties: {
    roleDefinitionId: azureMapsDataReader
    principalId: apiApp.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

resource rawStorageAccount 'Microsoft.Storage/storageAccounts@2025-06-01' existing = {
  name: platform.rawStorage.accountName
}

resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2025-06-01' existing = {
  parent: rawStorageAccount
  name: 'default'
}

resource rawContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2025-06-01' = {
  parent: blobService
  name: platform.rawStorage.containerName
  properties: {
    publicAccess: 'None'
  }
}

output cosmosDatabaseId string = tokenomicsDatabase.id
output cosmosContainerId string = tokenConsumptionContainer.id
output showcaseVisitsContainerId string = showcaseVisitsContainer.id
output mapsClientId string = mapsAccount.properties.uniqueId
output rawContainerId string = rawContainer.id
output rawBlobBaseUrl string = 'https://${rawStorageAccount.name}.blob.${environment().suffixes.storage}/${rawContainer.name}/${platform.rawStorage.prefix}'
