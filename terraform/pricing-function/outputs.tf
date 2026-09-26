output "function_app_id" {
  value       = azurerm_linux_function_app.pricing.id
  description = "Resource ID of the pricing sync Function App."
}

output "function_app_name" {
  value       = azurerm_linux_function_app.pricing.name
  description = "Name of the pricing sync Function App."
}

output "principal_id" {
  value       = azurerm_linux_function_app.pricing.identity[0].principal_id
  description = "System-assigned managed identity principal ID (grant OneLake write access to this)."
}

output "default_hostname" {
  value       = "https://${azurerm_linux_function_app.pricing.default_hostname}"
  description = "Default hostname of the pricing sync Function App."
}
