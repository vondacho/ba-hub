# GitHub Actions authenticates to AWS with a short-lived OIDC token instead of
# a stored credential: the workflow presents a token signed by GitHub, STS
# checks it against the trust policy below, and hands back credentials that
# expire with the job. Nothing long-lived exists to leak or rotate.
#
# This replaces the SSH key the deploy job used to hold — which is also why the
# security group no longer opens port 22 at all (see security.tf).

# An account can hold only one provider per issuer URL, so an account that
# already has one for another repository must reuse it rather than create a
# second.
resource "aws_iam_openid_connect_provider" "github" {
  count = var.create_github_oidc_provider ? 1 : 0

  url = "https://token.actions.githubusercontent.com"
  # `sts.amazonaws.com` is the audience aws-actions/configure-aws-credentials
  # requests by default.
  client_id_list = ["sts.amazonaws.com"]
  # No thumbprint_list: AWS has trusted this issuer's certificate chain
  # natively since 2023, and a pinned thumbprint is one more thing to expire.

  tags = {
    Name = "github-actions"
  }
}

data "aws_iam_openid_connect_provider" "github" {
  count = var.create_github_oidc_provider ? 0 : 1

  url = "https://token.actions.githubusercontent.com"
}

locals {
  github_oidc_arn = one(concat(
    aws_iam_openid_connect_provider.github[*].arn,
    data.aws_iam_openid_connect_provider.github[*].arn,
  ))
}

data "aws_iam_policy_document" "deploy_trust" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [local.github_oidc_arn]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }

    # The tightest useful constraint: this repository, on this ref only. A
    # wildcard on `sub` (or omitting it) would let *any* repository on GitHub
    # assume the role — the classic misconfiguration.
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:sub"
      values   = ["repo:${var.github_repository}:ref:${var.github_deploy_ref}"]
    }
  }
}

resource "aws_iam_role" "deploy" {
  name               = "ba-hub-deploy"
  description        = "Assumed by GitHub Actions to roll new images onto the ba-hub host via SSM"
  assume_role_policy = data.aws_iam_policy_document.deploy_trust.json

  tags = {
    Name = "ba-hub-deploy"
  }
}

# Scoped to exactly what the deploy job does: find the host, run one shell
# document on it, read the result. It cannot start, stop, or reconfigure
# anything, and cannot reach any instance that is not tagged as part of this
# project.
data "aws_iam_policy_document" "deploy" {
  statement {
    sid    = "FindTheHost"
    effect = "Allow"
    # Neither action supports resource-level permissions; both are read-only.
    actions = [
      "ec2:DescribeInstances",
      "ssm:DescribeInstanceInformation",
    ]
    resources = ["*"]
  }

  statement {
    sid       = "RunShellDocument"
    effect    = "Allow"
    actions   = ["ssm:SendCommand"]
    resources = ["arn:${data.aws_partition.current.partition}:ssm:${var.aws_region}::document/AWS-RunShellScript"]
  }

  statement {
    sid       = "TargetProjectInstancesOnly"
    effect    = "Allow"
    actions   = ["ssm:SendCommand"]
    resources = ["arn:${data.aws_partition.current.partition}:ec2:${var.aws_region}:${data.aws_caller_identity.current.account_id}:instance/*"]

    condition {
      test     = "StringEquals"
      variable = "ssm:resourceTag/Project"
      values   = ["ba-hub"]
    }
  }

  statement {
    sid    = "ReadCommandResults"
    effect = "Allow"
    actions = [
      "ssm:GetCommandInvocation",
      "ssm:ListCommandInvocations",
    ]
    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "deploy" {
  name   = "ba-hub-deploy"
  role   = aws_iam_role.deploy.id
  policy = data.aws_iam_policy_document.deploy.json
}
