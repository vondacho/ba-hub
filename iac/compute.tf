resource "aws_instance" "host" {
  ami                    = data.aws_ssm_parameter.ubuntu.value
  instance_type          = var.instance_type
  subnet_id              = data.aws_subnets.default.ids[0]
  vpc_security_group_ids = [aws_security_group.host.id]
  iam_instance_profile   = aws_iam_instance_profile.host.name
  # Optional, and null by default: administration goes through SSM, so the host
  # normally has no key pair and no way in over the network.
  key_name = var.ssh_key_name

  user_data = templatefile("${path.module}/user-data.sh", {
    acme_email = var.acme_email
  })

  # user_data only prepares the machine (Docker, /opt/ba-hub). What actually
  # runs there lives in host/ and is shipped by the deploy job, so a change to
  # the runtime never has to replace the instance.
  user_data_replace_on_change = false

  root_block_device {
    volume_size = var.root_volume_size
    volume_type = "gp3"
    encrypted   = true
  }

  metadata_options {
    http_tokens   = "required" # IMDSv2 only
    http_endpoint = "enabled"
  }

  tags = {
    Name = "ba-hub-host"
  }

  lifecycle {
    # The SSM lookup resolves to whatever Canonical published most recently, so
    # a plan months from now would otherwise propose replacing a perfectly
    # healthy host. Replace it deliberately with `-replace` when you want the
    # newer image.
    ignore_changes = [ami]
  }
}

# The address outlives the instance, so the DNS records below stay valid across
# a host rebuild and the CI deploy secret never has to be rotated.
resource "aws_eip" "host" {
  domain = "vpc"

  tags = {
    Name = "ba-hub-host"
  }
}

resource "aws_eip_association" "host" {
  instance_id   = aws_instance.host.id
  allocation_id = aws_eip.host.id
}
