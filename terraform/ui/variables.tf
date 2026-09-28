variable "config_path" {
  description = "Path to the shared Fabric deployment configuration JSON file."
  type        = string
  default     = "../../config/deployment.json"

  validation {
    condition     = fileexists(var.config_path)
    error_message = "config_path must point to an existing deployment.json file."
  }
}

variable "runtime_client_id" {
  description = "Microsoft Entra application client ID used by the browser client."
  type        = string
}

variable "runtime_scope" {
  description = "Delegated API scope requested by the browser client."
  type        = string
}