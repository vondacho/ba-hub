# The instance's own identity. It exists for one reason: to let the SSM agent
# register the host with Systems Manager, which is what both the deploy job and
# `aws ssm start-session` ride on.
data "aws_iam_policy_document" "host_trust" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "host" {
  name               = "ba-hub-host"
  description        = "Instance role for the ba-hub Docker host (SSM managed-instance registration)"
  assume_role_policy = data.aws_iam_policy_document.host_trust.json

  tags = {
    Name = "ba-hub-host"
  }
}

# AWS-managed rather than hand-rolled: this policy is the documented contract
# for the SSM agent, and AWS updates it when the agent needs a new action.
resource "aws_iam_role_policy_attachment" "host_ssm" {
  role       = aws_iam_role.host.name
  policy_arn = "arn:${data.aws_partition.current.partition}:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_instance_profile" "host" {
  name = "ba-hub-host"
  role = aws_iam_role.host.name
}
