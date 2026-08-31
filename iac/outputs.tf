output "public_ip" {
  description = "Elastic IP of the Docker host, and the target of both DNS records below."
  value       = aws_eip.host.public_ip
}

# DNS for obya.ch is served by DigitalOcean, not Route 53, so this stack cannot
# create the records — it prints exactly what to enter instead. The address is
# an Elastic IP, so these are set once and survive an instance rebuild.
output "dns_records" {
  description = "A records to create in the DigitalOcean DNS panel for obya.ch."
  value = [
    for host in [var.portal_subdomain, var.mapper_subdomain] :
    "A  ${host}  ${aws_eip.host.public_ip}  TTL 300"
  ]
}

output "instance_id" {
  description = "Instance the deploy targets. iac/deploy.sh resolves this by tag, so nothing needs to be copied anywhere."
  value       = aws_instance.host.id
}

output "deploy_role_arn" {
  description = "Role GitHub Actions assumes via OIDC. This is the value for the AWS_DEPLOY_ROLE_ARN repository variable."
  value       = aws_iam_role.deploy.arn
}

output "session_command" {
  description = "Open a shell on the host. Authenticated by your AWS identity — no key, no open port."
  value       = "aws ssm start-session --target ${aws_instance.host.id} --region ${var.aws_region}"
}

output "portal_url" {
  value = "https://${var.portal_subdomain}.${var.domain}"
}

output "mapper_url" {
  value = "https://${var.mapper_subdomain}.${var.domain}"
}
