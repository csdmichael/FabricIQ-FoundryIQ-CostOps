targetScope = 'resourceGroup'

@description('Production CostOps UI App Service name.')
param appName string

@description('Existing Windows B1 App Service plan name.')
param existingPlanName string

@description('Existing App Service VNet integration subnet resource ID.')
param integrationSubnetResourceId string

@description('Private APIM gateway hostname used only by the server-side proxy.')
param apimGatewayHost string

@description('APIM tokenomics API path used by the server-side proxy.')
param tokenomicsApiPath string

@description('Existing Log Analytics workspace resource ID for UI host diagnostics.')
param logAnalyticsWorkspaceId string

@description('Customer tags from the shared deployment configuration.')
param tags object = {}

resource appServicePlan 'Microsoft.Web/serverfarms@2023-12-01' existing = {
  name: existingPlanName
}

resource uiApp 'Microsoft.Web/sites@2023-12-01' = {
  name: appName
  location: resourceGroup().location
  tags: tags
  kind: 'app'
  properties: {
    clientAffinityEnabled: false
    httpsOnly: true
    publicNetworkAccess: 'Enabled'
    reserved: false
    serverFarmId: appServicePlan.id
    siteConfig: any({
      alwaysOn: true
      appCommandLine: 'node server.js'
      appSettings: [
        {
          name: 'APIM_GATEWAY_HOST'
          value: apimGatewayHost
        }
        {
          name: 'APIM_TOKENOMICS_API_PATH'
          value: tokenomicsApiPath
        }
        {
          name: 'NODE_ENV'
          value: 'production'
        }
        {
          name: 'SCM_DO_BUILD_DURING_DEPLOYMENT'
          value: 'false'
        }
        {
          name: 'WEBSITE_NODE_DEFAULT_VERSION'
          value: '~22'
        }
        {
          name: 'WEBSITE_VNET_ROUTE_ALL'
          value: '1'
        }
      ]
      ftpsState: 'Disabled'
      healthCheckEvictionTimeInMin: 5
      healthCheckPath: '/health'
      http20Enabled: true
      ipSecurityRestrictionsDefaultAction: 'Allow'
      minTlsVersion: '1.2'
      scmIpSecurityRestrictionsDefaultAction: 'Allow'
      scmMinTlsVersion: '1.2'
      use32BitWorkerProcess: false
      vnetRouteAllEnabled: true
    })
    virtualNetworkSubnetId: integrationSubnetResourceId
  }
}

resource uiMetadata 'Microsoft.Web/sites/config@2023-12-01' = {
  parent: uiApp
  name: 'metadata'
  properties: {
    CURRENT_STACK: 'node'
  }
}

resource scmBasicPublishingCredentials 'Microsoft.Web/sites/basicPublishingCredentialsPolicies@2023-12-01' = {
  parent: uiApp
  name: 'scm'
  properties: {
    allow: false
  }
}

resource ftpBasicPublishingCredentials 'Microsoft.Web/sites/basicPublishingCredentialsPolicies@2023-12-01' = {
  parent: uiApp
  name: 'ftp'
  properties: {
    allow: false
  }
}

resource uiDiagnosticSetting 'Microsoft.Insights/diagnosticSettings@2021-05-01-preview' = {
  scope: uiApp
  name: 'ui-host-logs'
  properties: {
    logs: [
      {
        category: 'AppServiceHTTPLogs'
        enabled: true
      }
      {
        category: 'AppServiceConsoleLogs'
        enabled: true
      }
    ]
    metrics: [
      {
        category: 'AllMetrics'
        enabled: true
      }
    ]
    workspaceId: logAnalyticsWorkspaceId
  }
}

output appId string = uiApp.id
output defaultHostName string = uiApp.properties.defaultHostName
output url string = 'https://${uiApp.properties.defaultHostName}'
