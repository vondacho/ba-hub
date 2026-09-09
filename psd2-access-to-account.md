# PSD2 access to account

## What this map is telling you

- **3 boundaries have no owner** — Access to account (the Bank, ASPSP), Authorization (the OIDC-provider) and Account aggregation (the TPP). An unowned boundary is a suggestion, and suggestions lose to deadlines.

## Access to account (the Bank, ASPSP)

Let a licensed third party read a customer's payment accounts, or initiate a payment from them, exactly as far as the customer consented and after the customer proved it was them with two independent factors. Everything else in the estate exists to make that safe, auditable and repeatable.

### Consent and account access

`core`

Turning a consent given at the bank into an enforceable access right on the XS2A interface, serving account data no wider than that right, and executing no payment the customer did not approve on that same interface.

**Owner:** Product owner, open banking

#### Consent management

`modelled`

Where a request from a TPP becomes a Consent with a status, an authorisation trail and a list of accessible accounts. A Consent here is the resource of NextGenPSD2 section 6.3: access rights, recurrence, validity, frequency.

**Owner:** Product owner, open banking

**Language:** `Consent`, `Consent status`, `Authorisation sub-resource`, `SCA status`, `Account access`, `Accessible account`, `Available account`, `Bank-offered consent`, `Recurring indicator`, `Valid until`, `Frequency per day`, `Usage counter`, `Confirmation`

**Aggregates:** Consent, Authorisation

#### Account information

`modelled`

Where the /accounts endpoints answer a TPP. An Account here is a resource with an opaque resourceId, projected from the ledger and filtered by one consent; never the ledger's account.

**Owner:** Product owner, open banking

**Language:** `Account resource`, `Resource id`, `Balance`, `Balance type`, `Transaction report`, `Booking status`, `With balance`, `PSU present`, `Hyperlink`, `Entry reference`, `Delta access`, `Transaction details`, `Paging`

**Aggregates:** AccountResource, TransactionReport, DeltaCursor

#### Payment initiation

`modelled`

Where a payment posted by a PISP becomes a Payment with a transaction status and its own authorisation trail. Shares the authorisation model with consents on purpose.

**Owner:** Product owner, payments

**Language:** `Payment`, `Payment product`, `Transaction status`, `Authorisation sub-resource`, `Cancellation`, `Payment service`, `Execution`, `Settlement`

**Aggregates:** Payment, PaymentAuthorisation, PaymentCancellation

### Customer identity and strong customer authentication

`core`

Knowing who the customer is, which devices are theirs, and proving with two independent elements, dynamically linked to what is being approved, that the customer is present.

**Owner:** Head of customer identity (CIAM)

#### Customer identity and SCA

`modelled`

The CIAM. A PSU here is a customer identity with credentials and enrolled devices; a Challenge is what the customer approves on one of those devices; an Authentication session is one journey from login to a signed approval. Also the OpenID Provider that the OIDC-provider brokers to.

**Owner:** Head of customer identity (CIAM)

**Language:** `PSU`, `PSU-ID`, `Credential`, `First factor`, `Second factor`, `Registered device`, `Device key`, `Attestation`, `Enrolment`, `SCA challenge`, `Dynamic link`, `QR code`, `Push`, `Approval`, `Authentication session`, `Risk assessment`, `Consent screen`, `Account selection`

**Aggregates:** PsuIdentity, RegisteredDevice, ScaChallenge, AuthenticationSession

### Third-party identification

`supporting`

Knowing which licensed party is calling, from its eIDAS certificate, and which PSD2 roles it holds.

**Owner:** Security officer, open banking

#### TPP identification

`modelled`

Where a QWAC or QSEAL presented on a connection becomes a TPP identity with roles, or a refusal. Consumed by the XS2A gateway and by the OIDC-provider's client registry.

**Owner:** Security officer, open banking

**Language:** `TPP`, `QWAC`, `QSEAL`, `Organization identifier`, `PSD2 role`, `AISP`, `PISP`, `PIISP`, `Qualified trust service provider`, `Revocation`, `Request signature`

**Aggregates:** TppIdentity

### Core banking

`generic`

The ledger: accounts, balances, bookings.

**Owner:** Core banking platform manager

#### Accounts ledger

`unmodelled`

Existing system, wrapped. Nothing inside this boundary is our model; the account information context translates it.

**Owner:** Core banking platform manager

**Language:** `Account`, `IBAN`, `Booking`, `Ledger balance`

### Push notifications

`generic`

Delivering a notification to a mobile device.

**Owner:** Mobile platform team

*No contexts yet.*

## Authorization (the OIDC-provider)

Issue tokens a resource server can trust, for exactly the resource the customer authorised, to exactly the client that asked.

### Authorization server

`supporting`

The OAuth2 authorization server of NextGenPSD2 section 13: code flow with PKCE, mTLS client authentication, certificate-bound tokens, refresh tokens, metadata.

**Owner:** Platform team, identity

#### Token issuance

`modelled`

Where an authorization request with scope AIS:\<consentId\> becomes, after the Bank has authenticated the customer, a certificate-bound access token and a refresh token. A Client here is a TPP registered by its organization identifier.

**Owner:** Platform team, identity

**Language:** `Client`, `Client id`, `Authorization request`, `Scope`, `State`, `PKCE`, `Authorization code`, `Access token`, `Refresh token`, `Certificate binding`, `Subject`, `Identity broker`, `ID token`, `ACR`, `AMR`, `Metadata`

**Aggregates:** ClientRegistration, AuthorizationRequest, TokenGrant

## Account aggregation (the TPP)

Show a person all their accounts in one place, with as few authentications as the law allows.

### Bank connections

`supporting`

Establishing and keeping alive the link between one user of the TPP and one bank, through that bank's consent and token lifecycle.

**Owner:** Product owner, the TPP

#### Bank connection

`modelled`

Where a user's choice of a bank becomes a Bank connection that holds the consent, the authorisation attempt and the tokens, and knows when it needs re-consent. The XS2A and OAuth2 vocabularies are consumed, never redefined.

**Owner:** Product owner, the TPP

**Language:** `Bank`, `Bank registry`, `Bank connection`, `Connection state`, `Authorization attempt`, `Token set`, `Re-consent`, `Account view`

**Aggregates:** BankConnection, BankRegistryEntry, AuthorizationAttempt

## Relationships

### TPP identification → Consent management

**Open host service**

*TPP identification is upstream: Consent management accommodates its model.*

**What crosses:** A validated TPP identity: organization identifier, legal name, PSD2 roles, certificate validity.

**Why:** Every XS2A endpoint and the OIDC-provider's client registry need the same answer; one service is cheaper than three certificate parsers.

### TPP identification → Token issuance

**Open host service**

*TPP identification is upstream: Token issuance accommodates its model.*

**What crosses:** The same validated TPP identity, used to authenticate the client at the token endpoint and to bind the token to its certificate.

**Why:** Client id and certificate subject must mean the same thing at the bank and at the OIDC-provider.

### Consent management → Account information

**Customer/supplier**

*Consent management is upstream: Account information accommodates its model.*

**What crosses:** Consent status, accessible accounts with their access types, and the per-account daily usage counters.

**Why:** Same product owner, so account information can ask for a change in the consent model and get it. Account information serves nothing the consent does not cover.

### Consent management ↔ Payment initiation

**Shared kernel**

**What crosses:** The authorisation sub-resource and its SCA status vocabulary (NextGenPSD2 section 7).

**Why:** The specification defines one authorisation process for AIS and PIS. Two copies would drift; neither context can be downstream of the other.

### Consent management → Customer identity and SCA

**Customer/supplier**

*Consent management is upstream: Customer identity and SCA accommodates its model.*

**What crosses:** The consent to display on the consent screen, and the outcome to record: SCA status, accessible accounts, PSU-ID.

**Why:** The CIAM speaks the consent's language when it shows and updates it; both teams sit inside the Bank and negotiate the contract.

### Consent management → Token issuance

**Open host service / Anticorruption layer**

*Consent management is upstream: Token issuance accommodates its model.*

**What crosses:** Existence, owner and status of the consent named in a scope; revocation of every token of a consent.

**Why:** the OIDC-provider must never learn the consent model beyond existence and status. A thin layer at the OIDC-provider keeps AIS:\<consentId\> an opaque handle.

### Customer identity and SCA → Token issuance

**Open host service / Conformist**

*Customer identity and SCA is upstream: Token issuance accommodates its model.*

**What crosses:** An OpenID Connect ID token with subject, acr, amr and the consent id that was authorised.

**Why:** The CIAM is an OpenID Provider; the OIDC-provider brokers to it like to any other and accepts the claims as given.

### Token issuance → Account information

**Published language**

*Token issuance is upstream: Account information accommodates its model.*

**What crosses:** A JWT access token with audience, scope AIS:\<consentId\>, certificate thumbprint and expiry, verifiable with the OIDC-provider's JWKS.

**Why:** Read by the XS2A gateway, by the payment endpoints and by auditors. RFC 7519 and RFC 8705 are the schema.

### Accounts ledger → Account information

**Anticorruption layer**

*Accounts ledger is upstream: Account information accommodates its model.*

**What crosses:** Accounts, balances and bookings of one customer.

**Why:** The ledger's account is not the XS2A account: resource ids are tokenised, balances typed, sub-accounts split by currency. The layer exists so the ledger vocabulary never reaches a TPP.

### Accounts ledger → Customer identity and SCA

**Conformist**

*Accounts ledger is upstream: Customer identity and SCA accommodates its model.*

**What crosses:** The list of a customer's payment accounts, for account selection on the consent screen.

**Why:** A read-only list; not worth a translation layer of its own.

### Consent management → Bank connection

**Published language**

*Consent management is upstream: Bank connection accommodates its model.*

**What crosses:** The consent, authorisation and status resources of the XS2A interface, with their steering hyperlinks.

**Why:** NextGenPSD2 XS2A is read by every TPP in the market. The interchange format is the asset, not either side's model.

### Account information → Bank connection

**Published language**

*Account information is upstream: Bank connection accommodates its model.*

**What crosses:** The account list, account details, balances and transaction reports of the XS2A interface.

**Why:** Same specification, same reason.

### Token issuance → Bank connection

**Published language**

*Token issuance is upstream: Bank connection accommodates its model.*

**What crosses:** OAuth2 authorization-server metadata, authorization and token endpoints, token responses.

**Why:** RFC 6749, 7636, 8414 and 8705 are read by every OAuth2 client; The TPP conforms to them, not to the OIDC-provider.

### Payment initiation → Customer identity and SCA

**Customer/supplier**

*Payment initiation is upstream: Customer identity and SCA accommodates its model.*

**What crosses:** The payment to show on the review screen and to cover with the dynamic link, and the outcome to record: SCA status, the debtor account the PSU chose, the PSU-ID.

**Why:** The CIAM shows and approves a payment the same way it shows and approves a consent; both teams sit inside the bank.

### Payment initiation → Token issuance

**Open host service / Anticorruption layer**

*Payment initiation is upstream: Token issuance accommodates its model.*

**What crosses:** Existence, owner and status of the payment named in a PIS or Cancel-PIS scope.

**Why:** The authorization server must never learn an amount or a payee. A thin layer keeps PIS:\<paymentId\> an opaque handle.

### Accounts ledger → Payment initiation

**Anticorruption layer**

*Accounts ledger is upstream: Payment initiation accommodates its model.*

**What crosses:** Funds and limit checks, the booking of an accepted payment, and the settlement or rejection that follows.

**Why:** The ledger's execution vocabulary is not the interface's transaction status; the layer maps one to the other so no core banking code reaches a TPP.

### TPP identification → Payment initiation

**Open host service**

*TPP identification is upstream: Payment initiation accommodates its model.*

**What crosses:** The same validated TPP identity, with the PISP role that the payment endpoints require.

**Why:** One answer to who is calling, whichever endpoint is called.
