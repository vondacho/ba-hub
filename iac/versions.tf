terraform {
  required_version = ">= 1.9"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }

  # State is local on purpose: this stack is a single host owned by a single
  # operator, and a bucket + lock table would be more infrastructure than the
  # infrastructure it tracks. To share it later, add:
  #
  #   backend "s3" {
  #     bucket       = "<your-state-bucket>"
  #     key          = "ba-hub/terraform.tfstate"
  #     region       = "eu-central-1"
  #     encrypt      = true
  #     use_lockfile = true
  #   }
  #
  # then `terraform init -migrate-state`.
}

# Credentials are never configured here. The provider resolves them through the
# standard AWS chain — environment variables, then the named profile, then SSO,
# then an instance role — so nothing authenticating to AWS is ever written into
# this repository or into the state file.
provider "aws" {
  region  = var.aws_region
  profile = var.aws_profile

  # Every resource in this stack is part of one deployment; tagging it here
  # keeps the individual resource blocks free of boilerplate.
  default_tags {
    tags = {
      Project   = "ba-hub"
      ManagedBy = "terraform"
    }
  }
}
