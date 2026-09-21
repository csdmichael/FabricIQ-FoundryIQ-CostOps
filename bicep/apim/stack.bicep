targetScope = 'resourceGroup'

param apimServiceName string
param resourceTenantId string
param callerTenantId string
param resourceApiClientId string
param delegatedScope string
param tokenomicsClientIds array
param allowedUserObjectIds array
param brokerAudience string
param brokerRole string
param brokerPrivateUrl string
param rateLimitCalls int
param rateLimitRenewalSeconds int
param requestTimeoutSeconds int
param tokenomicsApiId string
param tokenomicsApiPath string
param fabricProductId string
param uiAllowedOrigin string
param applicationInsightsName string
param applicationInsightsResourceGroupName string
param logAnalyticsWorkspaceId string

var diagnosticsEnabled = !empty(applicationInsightsName)
var tokenomicsDiagnosticsEnabled = !empty(logAnalyticsWorkspaceId)
var loggerName = 'fabric-obo-insights'
var commonApiPolicy = loadTextContent('../../apim/policies/fabric-obo-api-policy.xml')
var namedValueSettings = [
  { name: 'fabric-obo-resource-tenant-id', value: resourceTenantId }
  { name: 'fabric-obo-caller-tenant-id', value: callerTenantId }
  { name: 'fabric-obo-resource-api-client-id', value: resourceApiClientId }
  { name: 'fabric-obo-delegated-scope', value: delegatedScope }
  { name: 'fabric-obo-allowed-user-ids', value: join(allowedUserObjectIds, ',') }
  { name: 'fabric-obo-broker-audience', value: brokerAudience }
  { name: 'fabric-obo-broker-role', value: brokerRole }
  { name: 'fabric-obo-broker-private-url', value: brokerPrivateUrl }
  { name: 'fabric-obo-rate-limit-calls', value: string(rateLimitCalls) }
  { name: 'fabric-obo-rate-limit-renewal-seconds', value: string(rateLimitRenewalSeconds) }
  { name: 'fabric-obo-request-timeout-seconds', value: string(requestTimeoutSeconds) }
  { name: 'fabric-obo-ui-origin', value: uiAllowedOrigin }
]

resource apim 'Microsoft.ApiManagement/service@2024-06-01-preview' existing = {
  name: apimServiceName
}

resource namedValues 'Microsoft.ApiManagement/service/namedValues@2024-06-01-preview' = [for setting in namedValueSettings: {
  parent: apim
  name: setting.name
  properties: {
    displayName: setting.name
    value: setting.value
    secret: false
  }
}]

resource tokenomicsApi 'Microsoft.ApiManagement/service/apis@2024-06-01-preview' = {
  parent: apim
  name: tokenomicsApiId
  properties: {
    displayName: 'Fabric Tokenomics'
    description: 'Privacy-preserving APIM request, token, allocation, and cost analytics.'
    path: tokenomicsApiPath
    protocols: [
      'https'
    ]
    subscriptionRequired: false
    format: 'openapi+json'
    value: loadTextContent('../../apim/openapi/tokenomics.json')
  }
}

resource tokenomicsApiPolicy 'Microsoft.ApiManagement/service/apis/policies@2024-06-01-preview' = {
  parent: tokenomicsApi
  name: 'policy'
  properties: {
    format: 'rawxml'
    value: replace(commonApiPolicy, '__ALLOWED_CLIENT_IDS__', join(tokenomicsClientIds, ','))
  }
  dependsOn: [
    namedValues
  ]
}

resource tokenomicsSummaryOperation 'Microsoft.ApiManagement/service/apis/operations@2024-06-01-preview' existing = {
  parent: tokenomicsApi
  name: 'get-tokenomics-summary'
}

resource tokenomicsSummaryPolicy 'Microsoft.ApiManagement/service/apis/operations/policies@2024-06-01-preview' = {
  parent: tokenomicsSummaryOperation
  name: 'policy'
  properties: {
    format: 'rawxml'
    value: loadTextContent('../../apim/policies/tokenomics-summary-operation-policy.xml')
  }
}

resource fabricProduct 'Microsoft.ApiManagement/service/products@2024-06-01-preview' = {
  parent: apim
  name: fabricProductId
  properties: {
    displayName: 'fabric'
    description: 'Fabric Tokenomics endpoints governed by Microsoft Entra ID and the broker.'
    subscriptionRequired: false
    state: 'published'
  }
}

resource fabricProductApiLink 'Microsoft.ApiManagement/service/products/apiLinks@2024-06-01-preview' = {
  parent: fabricProduct
  name: 'link-${tokenomicsApiId}'
  properties: {
    apiId: tokenomicsApi.id
  }
}

resource insights 'Microsoft.Insights/components@2020-02-02' existing = if (diagnosticsEnabled) {
  scope: resourceGroup(applicationInsightsResourceGroupName)
  name: applicationInsightsName
}

resource logger 'Microsoft.ApiManagement/service/loggers@2024-06-01-preview' = if (diagnosticsEnabled) {
  parent: apim
  name: loggerName
  properties: {
    loggerType: 'applicationInsights'
    credentials: {
      instrumentationKey: insights!.properties.InstrumentationKey
    }
    resourceId: insights!.id
    isBuffered: true
  }
}

resource tokenomicsDiagnostic 'Microsoft.Insights/diagnosticSettings@2021-05-01-preview' = if (tokenomicsDiagnosticsEnabled) {
  name: 'fabric-tokenomics'
  scope: apim
  properties: {
    workspaceId: logAnalyticsWorkspaceId
    logAnalyticsDestinationType: 'Dedicated'
    logs: [
      {
        category: 'GatewayLogs'
        enabled: true
      }
      {
        category: 'GatewayLlmLogs'
        enabled: true
      }
    ]
    metrics: [
      {
        category: 'AllMetrics'
        enabled: true
      }
    ]
  }
}

var diagnosticProperties = {
  loggerId: resourceId('Microsoft.ApiManagement/service/loggers', apimServiceName, loggerName)
  alwaysLog: 'allErrors'
  sampling: {
    samplingType: 'fixed'
    percentage: 100
  }
  verbosity: 'information'
  logClientIp: false
  httpCorrelationProtocol: 'W3C'
  frontend: {
    request: { headers: [], body: { bytes: 0 } }
    response: { headers: [], body: { bytes: 0 } }
  }
  backend: {
    request: { headers: [], body: { bytes: 0 } }
    response: { headers: [], body: { bytes: 0 } }
  }
}

resource tokenomicsApiDiagnostic 'Microsoft.ApiManagement/service/apis/diagnostics@2024-06-01-preview' = if (diagnosticsEnabled) {
  parent: tokenomicsApi
  name: 'applicationinsights'
  properties: diagnosticProperties
  dependsOn: [
    logger
  ]
}

output apimPrincipalId string = apim.identity.principalId
output tokenomicsApiId string = tokenomicsApi.id
output tokenomicsDiagnosticId string = tokenomicsDiagnosticsEnabled ? tokenomicsDiagnostic.id : ''
output fabricProductId string = fabricProduct.id
