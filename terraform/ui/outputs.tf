output "app_id" {
  value       = azurerm_windows_web_app.ui.id
  description = "Resource ID of the production CostOps UI host."
}

output "url" {
  value       = "https://${azurerm_windows_web_app.ui.default_hostname}"
  description = "Production CostOps UI URL."
}