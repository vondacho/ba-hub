# The default VPC is enough for a single public host: it already has an
# internet gateway and public subnets, and there is nothing here to isolate
# from anything else. Building a VPC would add five resources that only
# reproduce what the default one already provides.
data "aws_vpc" "default" {
  default = true
}

data "aws_subnets" "default" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }
}

# Ubuntu rather than Amazon Linux 2023: Docker's own apt repository ships
# docker-compose-plugin as a package, while on AL2023 the plugin has to be
# downloaded and dropped into place by hand from user_data.
data "aws_ssm_parameter" "ubuntu" {
  name = "/aws/service/canonical/ubuntu/server/24.04/stable/current/amd64/hvm/ebs-gp3/ami-id"
}

data "aws_caller_identity" "current" {}

data "aws_partition" "current" {}
