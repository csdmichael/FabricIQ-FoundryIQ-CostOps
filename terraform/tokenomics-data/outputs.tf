output "cosmos_database_id" {
  description = "Resource ID of the Tokenomics Cosmos SQL database."
  value       = azapi_resource.database.id
}

output "cosmos_container_id" {
  description = "Resource ID of the Tokenomics token-consumption container."
  value       = azapi_resource.container.id
}

output "raw_container_id" {
  description = "Resource ID of the private raw Blob container."
  value       = azapi_resource.raw_container.id
}
