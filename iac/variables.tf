variable "aws_region" {
  description = "AWS region hosting the Docker host. Must match the region of var.ssh_key_name."
  type        = string
  default     = "eu-central-1"
}

variable "aws_profile" {
  description = "Named profile from ~/.aws/config to authenticate with. Leave null to use the ambient credential chain (env vars, SSO, instance role)."
  type        = string
  default     = null
}

variable "domain" {
  description = "Apex domain the apps are published under. DNS for it is served by DigitalOcean, outside this stack — only used to build URLs and the dns_records output."
  type        = string
  default     = "obya.ch"
}

variable "portal_subdomain" {
  description = "Subdomain serving ba-portal."
  type        = string
  default     = "ba-portal"
}

variable "mapper_subdomain" {
  description = "Subdomain serving ba-ddd-mapper."
  type        = string
  default     = "ddd-mapper"
}

variable "instance_type" {
  description = "EC2 instance type. Must be x86_64 — the images are built linux/amd64 only (see .github/workflows/build-images.yml)."
  type        = string
  default     = "t3.small"
}

variable "ssh_key_name" {
  description = "Optional name of an existing EC2 key pair, for break-glass SSH. Leave null: administration and deployment both go through SSM Session Manager."
  type        = string
  default     = null
}

variable "ssh_allowed_cidrs" {
  description = "CIDR blocks allowed to reach port 22. Empty by default — there is no inbound admin surface unless you deliberately open one."
  type        = list(string)
  default     = []
}

variable "acme_email" {
  description = "Contact address Caddy registers with Let's Encrypt; receives expiry warnings if renewal ever stops working."
  type        = string
}

variable "root_volume_size" {
  description = "Root EBS volume size in GiB. Two Node images plus Caddy and their layers sit comfortably under 20."
  type        = number
  default     = 20
}

variable "github_repository" {
  description = "owner/name of the repository allowed to assume the deploy role."
  type        = string
  default     = "vondacho/ba-hub"
}

variable "github_deploy_ref" {
  description = "Git ref the deploy role is bound to. Only a workflow running on this exact ref can assume it."
  type        = string
  default     = "refs/heads/main"
}

variable "github_deploy_environment" {
  description = "GitHub Actions environment the deploy job declares. It selects the `sub` claim GitHub puts in the OIDC token, so it must match the workflow's `environment:` name exactly."
  type        = string
  default     = "production"
}

variable "create_github_oidc_provider" {
  description = "Create the GitHub OIDC provider. Set false if the account already has one — AWS allows only a single provider per issuer URL."
  type        = bool
  default     = true
}
