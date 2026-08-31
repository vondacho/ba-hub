# iac — AWS Docker host for ba-hub

Terraform for a single EC2 instance that runs `ba-portal` and `ba-ddd-mapper` as
separate containers behind Caddy, published as:

- https://ba-portal.obya.ch
- https://ddd-mapper.obya.ch

The images are the ones `.github/workflows/build-images.yml` already pushes to
GHCR — nothing is built here. This stack is the *host*; `host/` is what runs on
it; `deploy.sh` is what puts the two together.

The `helm/` charts are a separate, local path (Rancher Desktop, `*.localhost`)
and are unaffected by any of this.

## Shape

```
        DigitalOcean DNS (obya.ch)   ← records added by hand, outside Terraform
    ba-portal ─┐               ┌─ ddd-mapper
               └──► Elastic IP ─┘
                        │
                   EC2 t3.small ── security group: 80 + 443 only, no inbound admin port
                        │
                    Caddy :80 :443          TLS, Let's Encrypt, HTTP→HTTPS
                     ├── ba-portal      :4321   (not published to the host)
                     └── ba-ddd-mapper  :4322   (not published to the host)

    GitHub Actions ──OIDC──► sts:AssumeRoleWithWebIdentity ──► ssm:SendCommand ──┘
```

Only Caddy is bound to the host, so neither app can be reached over plain HTTP.
Nothing else is reachable at all: administration and deployment both arrive
through the SSM agent's *outbound* connection, so there is no inbound admin
surface.

## How CI reaches AWS

The deploy job holds no credential. It presents a token signed by GitHub, STS
validates it against the role's trust policy, and returns credentials that
expire when the job ends.

```
role      ba-hub-deploy                       (iac/oidc.tf)
trusts    token.actions.githubusercontent.com
only if   aud = sts.amazonaws.com
    and   sub = repo:vondacho/ba-hub:ref:refs/heads/main
may do    ssm:SendCommand  → AWS-RunShellScript, on instances tagged Project=ba-hub
          plus the read calls needed to find the host and collect the output
```

The `sub` condition is the load-bearing one. Without it — or with a wildcard —
any repository on GitHub could assume the role. It is pinned to this repository
*and* to `main`, so a workflow on a branch or a fork gets nothing.

The role cannot start, stop, or reconfigure the instance, and cannot touch any
instance that is not tagged as part of this project.

## Connecting to AWS yourself

Terraform authenticates through the standard AWS credential chain. Nothing in
this repository holds an AWS credential, and none is written into the state
file — the provider block sets only a region and an optional profile name.

Recommended, in order of preference:

1. **IAM Identity Center (SSO)** — short-lived, nothing long-lived on disk:

   ```sh
   aws configure sso --profile ba-hub     # once
   aws sso login --profile ba-hub         # per session, expires on its own
   ```

   then set `aws_profile = "ba-hub"` in `terraform.tfvars`, or export
   `AWS_PROFILE=ba-hub`.

2. **An IAM user's access keys in `~/.aws/credentials`** — `aws configure
   --profile ba-hub`. The file is outside the repo and `chmod 600`. Give the
   user only what this stack touches (EC2, VPC read, IAM to create the two
   roles and the OIDC provider, SSM read for the AMI parameter), and rotate the
   keys periodically.

3. **Environment variables** (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`,
   `AWS_SESSION_TOKEN`) — fine for a one-off, but they leak into shell history
   and process listings, so prefer a profile for anything repeated.

Verify before applying: `aws sts get-caller-identity --profile ba-hub`.

## Where the secrets live

Very few, by construction — CI holds none and the host holds none:

| Secret | Lives in | Why not elsewhere |
|---|---|---|
| AWS credentials | `~/.aws/` (or an SSO session) on your machine only | Used solely to *provision*. CI gets short-lived credentials from OIDC instead. |
| CI's AWS credentials | nowhere — minted per job, expire with it | That is the whole point of OIDC. |
| SSH private key | nowhere — the host has no key pair by default | Replaced by SSM Session Manager, authenticated by your AWS identity. |
| Let's Encrypt account key | the `caddy_data` volume on the host | Generated there, never leaves. |
| Anthropic API key | nowhere — the browser sends it per request as `x-model-key` | `ba-ddd-mapper` never stores or logs it; there is no server-side key to provision. |
| GHCR pull credential | none — the packages are public | See step 1 below. |
| DigitalOcean API token | none — the two records are created by hand | Terraform never talks to DigitalOcean. |

Two things must stay out of git, and `.gitignore` already covers both:
`terraform.tfvars` and `terraform.tfstate` (the full resource inventory).
`.terraform.lock.hcl` is the exception — commit it, so every apply resolves the
same provider build.

## Before the first apply

1. **Make both GHCR packages public.** In the repo's *Packages → package
   settings*, set `ba-hub/ba-portal` and `ba-hub/ba-ddd-mapper` to public. The
   host then pulls anonymously and there is no registry credential to provision
   or rotate. (Neither image contains a secret: `ba-ddd-mapper` takes the
   Anthropic key off the request header, it is never baked in.)
2. **Know where `obya.ch` DNS lives.** It is served by DigitalOcean
   (`ns[1-3].digitalocean.com`), not Route 53, so Terraform does not touch it.
   You add the two A records by hand after the apply — the `dns_records`
   output prints them. Deliberate: the zone serves more than this stack, and a
   delegation move would put all of it through a cutover for two records.
3. **Check for an existing GitHub OIDC provider.** An AWS account may hold only
   one per issuer URL:

   ```sh
   aws iam list-open-id-connect-providers
   ```

   If one already exists for `token.actions.githubusercontent.com`, set
   `create_github_oidc_provider = false` and this stack will reference it
   instead of colliding with it.

## Apply

```sh
cp terraform.tfvars.example terraform.tfvars   # then edit
aws sts get-caller-identity                    # confirm you are the right principal
terraform init
terraform plan
terraform apply
```

Expect: 1 security group + 3 rules, 1 instance, 1 EIP + association, 1 OIDC
provider, 2 IAM roles + policies, 1 instance profile.

Then create the DNS records at DigitalOcean — `terraform output dns_records`
prints them ready to copy:

```
A  ba-portal    <elastic ip>  TTL 300
A  ddd-mapper   <elastic ip>  TTL 300
```

Because the address is an Elastic IP, this is a one-time step: it survives an
instance rebuild. Confirm with `dig +short ba-portal.obya.ch` before expecting
certificates.

Finally, set two repository **variables** (Settings → Secrets and variables →
Actions → Variables). They are variables, not secrets: neither is sensitive,
and a role ARN is useless without a matching OIDC token.

| Variable | Value |
|---|---|
| `AWS_DEPLOY_ROLE_ARN` | `terraform output -raw deploy_role_arn` |
| `AWS_REGION` | your `aws_region` (optional; defaults to `eu-central-1`) |

### Applying onto a host that already exists

Attaching the instance profile is an in-place update, but two things do not
follow automatically:

- **The SSM agent may not notice the new role.** Check with
  `aws ssm describe-instance-information`; if the instance has not appeared
  after a few minutes, `aws ec2 reboot-instances --instance-ids "$(terraform
  output -raw instance_id)"` — that call needs no agent, and the agent picks up
  the role on boot.
- **`user_data` does not re-run.** By design (`user_data_replace_on_change =
  false`), so an edit to it never proposes a rebuild. Anything it newly does —
  such as enabling the SSM agent — applies to the *next* instance, not this
  one.

The first push to `main` after that runs the `deploy` job. Caddy issues the
certificates on its first start — it needs the A records to resolve by then,
otherwise the ACME HTTP-01 challenge fails and it retries with a backoff.

## Day-to-day

Changing what runs on the host — image tag, env var, a new site in the
Caddyfile — is an edit to `host/` and a push to `main`. The instance is not
touched: `user_data` only installs Docker and creates `/opt/ba-hub`, and
`user_data_replace_on_change = false` keeps a stray edit there from proposing a
rebuild.

Deploy by hand, with any identity holding the same permissions — the CI job
runs this exact script:

```sh
./deploy.sh
```

Open a shell on the host without a key or an open port:

```sh
aws ssm start-session --target "$(terraform output -raw instance_id)"
sudo -i
cd /opt/ba-hub
docker compose ps
docker compose logs -f caddy
```

This needs the Session Manager plugin installed locally
(`brew install --cask session-manager-plugin`).

A reboot brings the stack back on its own: `user-data.sh` installs a
`ba-hub.service` unit that replays `docker compose up -d`.

To pick up a newer Ubuntu AMI, `terraform apply -replace=aws_instance.host`.
The Elastic IP, the DNS records, and the deploy role all survive it.

### Break-glass

If the SSM agent ever wedges, the host becomes unreachable — that is the
trade-off for having no open admin port. Recover by setting `ssh_key_name` and
`ssh_allowed_cidrs` to your own address and applying; both default to nothing,
so this is a deliberate, visible change in the plan. `ssh_key_name` only takes
effect on a fresh instance, so an existing host needs a replace.

## Cost

Roughly USD 17/month in `eu-central-1`: t3.small on-demand (~15), 20 GiB gp3
(~2), plus egress. No Route 53 charge — DNS stays at DigitalOcean. SSM,
the OIDC provider, and IAM roles are free. The Elastic IP is free while
associated with a running instance and billed hourly when it is not — so a
stopped instance still costs a little.

## Teardown

```sh
terraform destroy
```

Removes the instance, EIP, security group, both IAM roles, and the OIDC
provider — the last of which will break *any other* repository relying on it,
so check `create_github_oidc_provider` first if the account is shared. The DNS
records and the GHCR packages are untouched; delete the two A records at
DigitalOcean by hand.
