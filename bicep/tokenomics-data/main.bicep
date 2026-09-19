targetScope = 'resourceGroup'

var config = loadJsonContent('../../config/deployment.json')
var platform = config.tokenomicsPlatform

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
output rawContainerId string = rawContainer.id
output rawBlobBaseUrl string = 'https://${rawStorageAccount.name}.blob.${environment().suffixes.storage}/${rawContainer.name}/${platform.rawStorage.prefix}'
