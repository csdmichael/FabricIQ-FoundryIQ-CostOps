output "cosmos_database_id" {
  description = "Resource ID of the Tokenomics Cosmos SQL database."
  value       = azapi_resource.database.id
}

output "cosmos_container_id" {
  description = "Resource ID of the Tokenomics token-consumption container."
  value       = azapi_resource.container.id
}

output "showcase_visits_container_id" {
  description = "Resource ID of the TTL-enabled Showcase Visits container."
  value       = azapi_resource.showcase_visits_container.id
}

output "maps_client_id" {
  description = "Azure Maps account client ID used for managed-identity geolocation."
  value       = azapi_resource.maps.output.properties.uniqueId
}

output "raw_container_id" {
  description = "Resource ID of the private raw Blob container."
  value       = azapi_resource.raw_container.id
}
