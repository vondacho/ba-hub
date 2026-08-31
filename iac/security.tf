# The description is immutable in AWS: editing it replaces the security group
# and every rule in it, which for a live host means a window with no rules
# attached. It stays as first written; what the group actually allows is
# documented by the rules below.
resource "aws_security_group" "host" {
  name        = "ba-hub-host"
  description = "ba-hub Docker host: public HTTP/HTTPS, restricted SSH"
  vpc_id      = data.aws_vpc.default.id

  tags = {
    Name = "ba-hub-host"
  }
}

# 80 stays open even though everything redirects: Caddy needs it for the
# ACME HTTP-01 challenge and for the redirect itself to be reachable.
resource "aws_vpc_security_group_ingress_rule" "http" {
  security_group_id = aws_security_group.host.id
  description       = "HTTP (redirect to HTTPS + ACME HTTP-01 challenge)"
  cidr_ipv4         = "0.0.0.0/0"
  from_port         = 80
  to_port           = 80
  ip_protocol       = "tcp"
}

resource "aws_vpc_security_group_ingress_rule" "https" {
  security_group_id = aws_security_group.host.id
  description       = "HTTPS"
  cidr_ipv4         = "0.0.0.0/0"
  from_port         = 443
  to_port           = 443
  ip_protocol       = "tcp"
}

# Two deliberate absences:
#
#   * The app ports (4321, 4322). Neither container publishes to the host, so
#     only Caddy is reachable and TLS cannot be bypassed.
#   * Port 22. Both CI and human access go through SSM Session Manager, which
#     is an *outbound* connection from the agent — there is no inbound admin
#     surface to scan, brute-force, or firewall correctly. `ssh_allowed_cidrs`
#     defaults to an empty list and creates no rules; set it only as a
#     break-glass path if the SSM agent ever wedges.
resource "aws_vpc_security_group_ingress_rule" "ssh" {
  for_each = toset(var.ssh_allowed_cidrs)

  security_group_id = aws_security_group.host.id
  description       = "SSH (break-glass only)"
  cidr_ipv4         = each.value
  from_port         = 22
  to_port           = 22
  ip_protocol       = "tcp"
}

# Outbound is what makes the host manageable at all: the SSM agent dials out to
# reach Systems Manager, and Docker pulls from GHCR.
resource "aws_vpc_security_group_egress_rule" "all" {
  security_group_id = aws_security_group.host.id
  # No apostrophe in "Lets": AWS restricts the character set for a rule
  # description and silently drops it, producing a diff on every plan.
  description = "Outbound: SSM, GHCR pulls, apt, Lets Encrypt"
  cidr_ipv4   = "0.0.0.0/0"
  ip_protocol = "-1"
}
