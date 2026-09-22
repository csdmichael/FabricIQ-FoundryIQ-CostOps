targetScope = 'subscription'

var config = loadJsonContent('../../config/deployment.json')
var apimConfig = config.apim
var identityConfig = config.identity

@minLength(36)
@maxLength(36)
type entraIdentifier = string

@description('Generated client ID of the Fabric resource API application registration.')
param resourceApiClientId entraIdentifier

@description('Generated client IDs allowed to call the tokenomics API.')
@minLength(1)
param tokenomicsClientIds entraIdentifier[]

@description('Fabric-tenant user object IDs allowed to call the APIs.')
@minLength(1)
param allowedUserObjectIds entraIdentifier[]

@description('Optional existing Application Insights component name. Diagnostics are omitted when empty.')
param applicationInsightsName string = ''

@description('Resource group of the existing Application Insights component.')
param applicationInsightsResourceGroupName string = ''

@description('Existing Log Analytics workspace resource ID for APIM gateway and LLM token diagnostics.')
param logAnalyticsWorkspaceId string = ''

var effectiveApplicationInsightsResourceGroupName = empty(applicationInsightsResourceGroupName) ? apimConfig.resourceGroup : applicationInsightsResourceGroupName

module apimStack './stack.bicep' = {
  name: 'fabric-apim-stack'
  scope: resourceGroup(apimConfig.subscriptionId, apimConfig.resourceGroup)
  params: {
    apimServiceName: apimConfig.serviceName
    resourceTenantId: identityConfig.resourceTenantId
    callerTenantId: identityConfig.callerTenantId
    resourceApiClientId: resourceApiClientId
    delegatedScope: identityConfig.delegatedScope
    tokenomicsClientIds: tokenomicsClientIds
    allowedUserObjectIds: allowedUserObjectIds
    rateLimitCalls: apimConfig.rateLimitCalls
    rateLimitRenewalSeconds: apimConfig.rateLimitRenewalSeconds
    requestTimeoutSeconds: apimConfig.requestTimeoutSeconds
    tokenomicsApiId: apimConfig.tokenomicsApiId
    tokenomicsApiPath: apimConfig.tokenomicsApiPath
    fabricProductId: apimConfig.fabricProductId
    uiAllowedOrigin: config.ui.allowedOrigin
    applicationInsightsName: applicationInsightsName
    applicationInsightsResourceGroupName: effectiveApplicationInsightsResourceGroupName
    logAnalyticsWorkspaceId: logAnalyticsWorkspaceId
  }
}

output apimPrincipalId string = apimStack.outputs.apimPrincipalId
output tokenomicsApiUrl string = '${apimConfig.gatewayUrl}/${apimConfig.tokenomicsApiPath}'
output fabricProductId string = apimStack.outputs.fabricProductId
