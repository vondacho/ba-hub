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

# GitHub mints the `sub` claim in one of two shapes, and which one you get is
# not under this repository's control:
#
#   classic     repo:vondacho/ba-hub:environment:production
#   immutable   repo:vondacho@3777501/ba-hub@1343390785:environment:production
#
# Since 2026-07-15 every newly created repository gets the immutable form
# automatically — the numeric owner and repository IDs close a real hole, where
# deleting a repository and recreating it under the same name let a new owner
# mint the same subject. This repository is on the immutable form (confirm with
# `gh api /repos/OWNER/NAME/actions/oidc/customization/sub`, which reports the
# prefix in use).
#
# So `sub` is deliberately NOT the load-bearing condition here: matching it
# exactly means pinning IDs that differ per fork and per account, and silently
# breaks again the day a repository flips form. The authorization is carried by
# the dedicated claim keys below — `repository`, `ref`, `environment` — which
# STS has validated natively for GitHub since January 2026 and which say what
# they mean instead of packing three facts into one string.
locals {
  github_owner = split("/", var.github_repository)[0]
  github_repo  = split("/", var.github_repository)[1]
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

    # The tightest useful constraint: this repository, on this branch, from
    # this environment. All three must hold. Dropping `repository` — or
    # widening it — would let *any* repository on GitHub assume the role, the
    # classic misconfiguration.
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:repository"
      values   = [var.github_repository]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:ref"
      values   = [var.github_deploy_ref]
    }

    # The deploy job declares `environment: production`, so the token carries
    # it. Keep this in step with the workflow's `environment:` name.
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:environment"
      values   = [var.github_deploy_environment]
    }

    # STS still requires the trust policy to constrain `sub` at all, so it is
    # constrained to both shapes of *this* repository's subject and no further.
    # It adds nothing the three conditions above do not already enforce.
    condition {
      test     = "StringLike"
      variable = "token.actions.githubusercontent.com:sub"
      values = [
        "repo:${local.github_owner}/${local.github_repo}:*",
        "repo:${local.github_owner}@*/${local.github_repo}@*:*",
      ]
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
