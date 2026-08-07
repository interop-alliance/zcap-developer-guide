# zCap (Authorization Capabilities) Developer's Guide

[![CC BY-NC-SA 4.0][cc-by-nc-sa-shield]][cc-by-nc-sa]

> A hands-on guide for developers working with zCaps (Authorization Capabilities).

Report issues to this guide's repo: https://github.com/interop-alliance/zcap-developer-guide

Contributions are welcome -- see [CONTRIBUTING.md](./CONTRIBUTING.md).

## Table of Contents

* [Motivation](#motivation)
* [Introduction](#introduction)
  - [When to Use zCaps (and When Not To)](#when-to-use-zcaps-and-when-not-to)
  - [Limitations and Future Work](#limitations-and-future-work)
* [Terminology](#terminology)
* [zCap Lifecycle](#zcap-lifecycle)
  - [Creating and Delegating zCaps](#creating-and-delegating-zcaps)
  - [Requesting zCaps](#requesting-zcaps)
  - [Revoking zCaps](#revoking-zcaps)
* [Using zCaps with HTTP Requests](#using-zcaps-with-http-requests)
* [Verifying zCaps on the Resource Server](#verifying-zcaps-on-the-resource-server)
  - [Verification Algorithm Overview](#verification-algorithm-overview)
  - [Where Does the Root zCap Come From?](#where-does-the-root-zcap-come-from)
  - [JS Example - Verifying an Incoming Request](#js-example---verifying-an-incoming-request)
  - [What the Verification Library Does *Not* Check](#what-the-verification-library-does-not-check)
  - [Verifying the `Digest` Header](#verifying-the-digest-header)
* [Performance Considerations](#performance-considerations)
  - [Caching zCaps by `id` for Verification](#caching-zcaps-by-id-for-verification)
* [Case Studies](#case-studies)
  - [Using zCaps with Encrypted Data Vaults (EDVs)](#using-zcaps-with-encrypted-data-vaults-edvs)
  - [Using zCaps with Wallet Attached Storage (WAS)](#using-zcaps-with-wallet-attached-storage-was)
* [Appendix A: IANA Registration Considerations](#appendix-a-iana-registration-considerations)
* [Appendix B: Implementations](#appendix-b-implementations)
* [Appendix C: FAQ](#appendix-c-faq)
  - [Why not OAuth 2](#why-not-oauth-2)
  - [What About JSON-LD / Linked Data?](#what-about-json-ld--linked-data)
* [License](#license)

## Motivation

Currently, Authorization Capabilities (zCaps for short) are in an awkward but
familiar situation where the deployed state of the art is significantly ahead
of the [specification](https://w3c-ccg.github.io/zcap-spec/).

This implementation guide is meant to fill the gap between the spec and its usage
in production.

## Introduction

What are Authorization Capabilities? (Aside from a less confusing name for
[object capabilities](https://en.wikipedia.org/wiki/Object-capability_model).)
You can think of them as advanced structured access tokens, with some key features
built in, including cryptographic proof of possession, as well as a compact
way of chaining proofs together for purposes of delegation.

They are incredibly useful for advanced authorization use cases such as for:

* API microservice ecosystems (REST- or RPC-based) with complex permission models
* Guardrails for Agentic AI
* Decentralized permissioned storage systems such as [Encrypted Data
  Vaults](https://identity.foundation/edv-spec/) and [Wallet Attached
  Storage](https://github.com/digitalcredentials/wallet-attached-storage-spec/)

What do we mean by "structured access tokens"? Basically, they're JSON objects
(although they can also be serialized to other formats, such as [CBOR](https://cbor.io/))
with the following properties, which roughly answer the question of "who can
perform what actions with a given resource, given these restrictions":

* **who** - which [agent](#agent) (identified by a cryptographic key or
  [DID](#did-decentralized-identifier)) is being given permission
* **can** - what actions is the agent allowed to perform
* **with** - what *resource* are they allowed to perform the actions on
* **given** - what other restrictions are in place? (these are also known as
  "caveats" or "attenuations")

Here is a (simplified) example zcap (given in Javascript notation just so we can
add comments):

```js
{
  // Unique id for the zcap (optional, but often useful)
  id: 'urn:uuid:b7576396-c032-46eb-9726-2a628a72828d',

  // 'who' - the DID of the agent that is allowed to perform actions
  controller: 'did:key:z6MkpmRaHigFewVnmQtLEYS8Zckb4kJNDJCk3bSFeiJNQfZy',

  // 'can' - which actions (here, HTTP verbs) they're allowed to perform
  allowedAction: ['GET', 'POST'],

  // 'with' - what resource can those actions be performed on
  invocationTarget: 'https://example.com/api/hello'
}
```

This is a simplified example, in that it's missing things like expiration,
or any sense of who granted that permission in the first place, nor does it have
any kind of proof chain.

But hopefully you can already get a sense of what this object is _for_ --
you can give it to any app, AI agent, or microservice, that can manage its
own keys (that can prove control over the cryptographic key serialized as
the `did:key` [DID](https://w3c.github.io/did/)). And now that app can perform
authorized API requests (via http GET and POST actions) to a given API endpoint
(here, `https://example.com/api/hello`). Specifically, it would include the zcap
in its API requests, either by stuffing it into HTTP headers in case of REST APIs,
or by passing it along as a parameter in case of JSON-RPC or something similar.

And, of course, the requests would need to include a cryptographic proof of
control (similar to what [DPoP](https://datatracker.ietf.org/doc/html/rfc9449)
does), so that even if the API requests were intercepted by a third party, the
zcaps could not be reused/replayed (as long as the original app did not leak its
private keys).

### When to Use zCaps (and When Not To)

zCaps are not a drop-in replacement for every authorization mechanism. They
earn their (real) complexity when delegation, decentralization, or proof of
possession are actual requirements of your system -- and they are the wrong
tool when a session cookie or a plain bearer token already does the job.

**Reach for zCaps when:**

* **Delegation is a first-class requirement.** This is the headline feature.
  If authority in your system naturally flows through chains -- a user grants
  an app, the app grants a backend service, the service grants a short-lived
  worker or AI agent -- zCaps model this directly. Each hop can
  [attenuate](#attenuation) (narrow) the authority it passes on, the
  "delegation can only narrow, never expand" rule is enforced
  cryptographically rather than by policy code, and delegation happens
  *offline*: no round trip to a central authorization server to mint the new
  token.
* **There is no central authorization server (and you don't want one).**
  Verification is self-contained: the [resource server](#resource-server-rs)
  synthesizes the [root zcap](#root-zcap) itself and verifies the delegation
  chain cryptographically -- no token introspection endpoint, no shared
  session store. This is why zCaps fit decentralized and multi-tenant storage
  (EDV, WAS), where each user controls their own resources and the server
  merely enforces, rather than owns, the permission model.
* **Bearer tokens fail your threat model.** Every zCap invocation is signed
  with the invoker's key (proof of possession, as with
  [DPoP](https://datatracker.ietf.org/doc/html/rfc9449)). A zcap leaked
  through a log file, a proxy, or a stolen header grants an attacker nothing
  without the corresponding private key.
* **You want to eliminate ambient authority.** Services that act on behalf of
  many principals (microservice meshes, AI agents) are classic [confused
  deputy](https://en.wikipedia.org/wiki/Confused_deputy_problem) victims: they
  get tricked into using their *own* broad privileges on an attacker's behalf.
  With zCaps, the authority travels with the request and names the exact
  resource and action -- the deputy has no ambient privileges to confuse.
* **Your resources are URL-shaped and hierarchical.** The
  `invocationTarget` model (plus target attenuation onto sub-paths) maps
  naturally onto REST APIs and document/collection storage. This is why
  storage systems are the current sweet spot -- see the
  [case studies](#case-studies).

**Prefer something simpler when:**

* **You just need login and roles for your own app.** If "is this user signed
  in, and are they an admin?" describes your authorization model, sessions or
  OpenID Connect are simpler, better tooled, and already understood by your
  team. zCaps pay off only once delegation or decentralization enters the
  picture.
* **Your clients can't manage keys.** Every invoker needs a keypair and must
  sign every request. Third-party webhooks, `curl`-with-an-API-key
  integrations, and legacy clients can't do that -- bearer tokens exist
  precisely because they demand nothing of the client.
* **You need off-the-shelf ecosystem maturity.** OAuth 2 has audited
  libraries in every language, hosted providers, and decades of operational
  lore. The zCap stack is currently JavaScript-centric, and (see
  [Current vs Future Deployments](#current-vs-future-deployments)) still
  rests on draft-era HTTP signature specs. If you can't absorb that maturity
  level, wait.
* **You need instant, centralized revocation or dynamic policy.** Revocation
  is each resource server's own responsibility, out of band (see
  [Revoking zCaps](#revoking-zcaps)). If your compliance posture demands
  "disable this user everywhere, from one console, within seconds," or your
  decisions depend on runtime context (risk scores, time-of-day rules), a
  centralized policy server fits better. With zCaps, the standard mitigation
  is short [expiration](#expiration) windows.
* **You actually need authentication, not authorization.** A zcap says what a
  *key* may do; it deliberately says nothing about who a *person* is. For
  identity, attributes, and claims, use OpenID Connect or Verifiable
  Credentials -- possibly alongside zCaps, which is a feature, not a gap.

These choices also compose: it's common to authenticate users with OIDC or
VCs, *request* zCaps via a protocol like [GNAP](#requesting-zcaps), and then
use zCaps for the machine-to-machine authorization underneath. For a more
direct comparison with OAuth 2, see the [FAQ](#why-not-oauth-2).

### Limitations and Future Work

* Currently, a zCap is limited to one invocationTarget.
  * Needs to be: multiple invocationTarget-action combinations
* No caveat notation currently used (or rather, implicit attenuation via URL suffixes)

## Terminology

#### action, allowed action

A list of operations that the holder of the zcap is allowed to perform on the
[target](#target-invocation-target), provided they can provide an invocation
signature.

#### agent
Any entity, usually an app (mobile, desktop or web app), an AI agent,
or cloud microservice, capable of generating or storing cryptographic material
(at least a public/private [keypair](#key-cryptographic-key)) so that it can
prove cryptographic control over its identifier.

#### attenuation
A restriction placed on a zcap during [delegation](#delegation), narrowing what
the new zcap is allowed to do compared to its parent. For example: a shorter
list of [allowed actions](#action-allowed-action), an earlier
[expiration](#expiration), or a more specific [invocation
target](#target-invocation-target) (such as a sub-path of the parent's target
URL). Also known as a "caveat" in the object capability literature.

A key security property of zcaps is that delegation can only ever _narrow_
authority, never expand it -- a delegated zcap cannot allow more actions or a
broader target than its parent.

Note that current zCap deployments express attenuation implicitly (by
delegating a narrower URL path or a smaller list of actions), rather than
through an explicit `caveat` property; see [Limitations and Future
Work](#limitations-and-future-work).

#### Authorization header
An HTTP header typically used to carry request authorizations.
See [Constructing the Authorization Header](#constructing-the-authorization-header).

#### capability chain, proof chain
The list of zcaps connecting a [delegated](#delegation) zcap back to its
[root zcap](#root-zcap), serialized as the `capabilityChain` array inside the
zcap's `proof` property. Each zcap in the chain is signed by the
[controller](#controller) of its parent, which allows a [resource
server](#resource-server-rs) to verify the whole chain of authority, starting
from the root, and to check that each delegation step only
[attenuated](#attenuation) (never expanded) the authority of its parent.

See the example delegated zcap in the [Delegating a zCap](#delegating-a-zcap)
section, which shows a `capabilityChain` containing the root zcap's id.

#### caveat
See [attenuation](#attenuation).

#### controller
The [DID](#did-decentralized-identifier) of the [agent](#agent) authorized to
invoke a capability.

#### data integrity proof
A way to cryptographically sign a structured document (like a JSON object), used
for chained delegation proofs.
See the [Verifiable Credential Data Integrity 1.0](https://www.w3.org/TR/vc-data-integrity/)
specification for more details.

#### delegation
The act of granting another [agent](#agent) some (or all) of the authority
contained in an existing zcap. Delegation works by creating a new zcap that:

1. names the receiving agent's DID as its [controller](#controller),
2. points at the zcap it was derived from via the `parentCapability` property,
   and
3. is signed by the delegating agent, using a [data integrity
   proof](#data-integrity-proof) with the `capabilityDelegation` proof purpose.

The resulting zcap can be [attenuated](#attenuation) (restricted to fewer
actions, a narrower target, or an earlier expiration), and can itself be
further delegated, forming a [capability chain](#capability-chain-proof-chain).

See [Delegating a zCap](#delegating-a-zcap) for a code example.

#### Digest header
An HTTP header containing a digest hash of the request body.
See [Constructing the Digest Header](#constructing-the-digest-header).

#### DID, Decentralized Identifier
See [Decentralized Identifier 1.1](https://www.w3.org/TR/did-1.1/) spec

#### expiration
An optional zcap property with a timestamp determining when a zcap expires.
The timestamp is a string, in [XML-Schema dateTimeStamp](https://www.w3.org/TR/xmlschema11-2/#dateTimeStamp)
format (web developers may be familiar with this format from the Javascript
[`toISOString()`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date/toISOString)
function).

#### HTTP Signatures
Refers to [RFC9421: HTTP Message Signatures](https://www.rfc-editor.org/rfc/rfc9421.html),
a specification that details how to sign HTTP requests (headers and body).
However, see the [Current vs Future Deployments](#current-vs-future-deployments)
section for more discussion.

#### invocation, capability invocation
The _act_ of invoking a capability at the intended destination ([resource 
server](#resource-server-rs)), a combination of _presenting_ the capability, and
also proving cryptographic control (usually via a digital signature).

Analogy: a government servant may possess a badge of office in their pocket,
but specifically the act of _presenting_ the badge to some other person (and
thus proving possession of the badge, even if not cryptographicaly) would be
the equivalent of invoking a capability.

#### key, cryptographic key
Used to sign capability invocations, HTTP headers, and to generate delegation
proofs. For zCaps specifically, this is likely to be an asymmetric key pair,
using an appropriate elliptic curve such as `ed25519`.

#### resource server, RS
A server hosting a resource that's protected by an authorization capability.
For API use cases, it's the API server itself, for storage use cases, it's
the actual file or database server hosting the individual objects specified in
`invocationTarget`.
Note: The RS is ultimately responsible for verifying and enforcing zCaps.

#### revocation
A way to revoke (make invalid) a given zcap, after it was issued.

#### root zcap
Using zCaps to make authorization-carrying HTTP requests is done in one of two
modes: either using a [root capability](#root-zcap), or using a delegated
capability.

Root zcaps are used in cases where full "admin" access is appropriate.
All other zcaps are delegated by the agent holding a root zcap. Delegation
is expressed in the [proof chain](#capability-chain-proof-chain) section of a
zcap.

See [Creating a Root zCap](#creating-a-root-zcap)

#### signer
An abstract handle to a signature function -- an object with an `id` (the
verification method, usually a DID with a key fragment) and an async `sign()`
method. Using signers (instead of raw private [keys](#key-cryptographic-key))
allows the actual key material to live elsewhere, such as in an HSM (Hardware
Security Module) or a remote KMS.

See [Creating a did:key Signer Instance](https://github.com/digitalcredentials/wallet-attached-storage#creating-a-didkey-signer-instance)

#### target, invocation target
The resource that a zcap's [allowed actions](#action-allowed-action) apply to,
specified in the zcap's `invocationTarget` property. This is usually a URL --
an API endpoint for REST/RPC use cases, or an individual object (a document,
collection, or file) for storage use cases -- hosted on a [resource
server](#resource-server-rs).

#### zcap

Short for 'Authori**z**ation **Cap**ability'. Used generally to refer to a specific
capability constructed according to the [Authorization Capabilities for Linked
Data v0.3](https://w3c-ccg.github.io/zcap-spec/) specification. Sometimes used
as a general term for a stuctured access token with proof of control and the
ability to do delegation chain proofs.

For Object Capability enthusiasts: zCaps are an example of a _certificate-based_
capability, as opposed to _platform capabilities_ such as those used by the
[OCapN](https://ocapn.org/) protocol. Don't worry, though, 'certificate-based'
just means that it uses a digital signature, you won't actually have to wrangle
x509 certificates.

## zCap Lifecycle

### Creating and Delegating zCaps

#### Creating a root zCap

Creating a root zcap is easy:

1. Choose a URL for which this zcap is intended. This will determine both
   the `invocationTarget` and the zcap's `id`
2. Construct the `id` like so: `urn:zcap:root:${encodeURIComponent(url)}`
3. Choose the controller DID
4. Put it all together using the root zcap template (see below)

Javascript example of how to construct a root zcap, provided you know the URL
that it's intended for, and the DID of the controller:

```js
const ROOT_ZCAP_TEMPLATE = {
  '@context': [
    'https://w3id.org/zcap/v1',
    // Assumes you're using an ed25519 based DID; substitute as appropriate
    'https://w3id.org/security/suites/ed25519-2020/v1'
  ],
  id: 'urn:zcap:root:...',
  controller: 'did:...',
  invocationTarget: 'https://example.com/api/endpoint'
};

const url = 'https://example.com/api/endpoint';
const did = 'did:key:z6MknBxrctS4KsfiBsEaXsfnrnfNYTvDjVpLYYUAN6PX2EfG';
const rootCapability = {
  ...ROOT_ZCAP_TEMPLATE,
  id: `urn:zcap:root:${encodeURIComponent(url)}`,
  controller: did,
  invocationTarget: url
};
```

Example root zcap:

```json
{
  "@context": [
    "https://w3id.org/zcap/v1", "https://w3id.org/security/suites/ed25519-2020/v1"
  ],
  "id": "urn:zcap:root:https%3A%2F%2Fexample.com%2Fapi",
  "controller": "did:key:z6Mkfeco2NSEPeFV3DkjNSabaCza1EoS3CmqLb1eJ5BriiaR",
  "invocationTarget": "https://example.com/api"
}
```

#### Delegating a zCap

```js
import { Ed25519Signature2020 } from '@digitalcredentials/ed25519-signature-2020';
import { ZcapClient } from '@digitalcredentials/ezcap';

const zcapClient = new ZcapClient({
  delegationSigner: capabilityDelegationKey.signer(),
  SuiteClass: Ed25519Signature2020
});

const allowedActions = ['GET']
// DID identifying the entity to delegate to.
const delegatee = 'did:key:...';

const url = 'https://example.com/api/endpoint';

// Pass in the zcap to delegate - either the original root zcap or its descendant
const capability = rootZcap;

const delegatedCapability = await zcapClient.delegate({
  url, capability, targetDelegate: delegatee, allowedActions
});
```

Example delegated zcap:

```json
{
  "@context": [
    "https://w3id.org/zcap/v1", "https://w3id.org/security/suites/ed25519-2020/v1"
  ],
  "id": "urn:zcap:delegated:z9gLKoFmKHwhxCzmo91Ywnh",
  "parentCapability": "urn:zcap:root:https%3A%2F%2Fexample.com%2Fdocuments",
  "invocationTarget": "https://example.com/documents",
  "controller": "did:key:z6MknBxrctS4KsfiBsEaXsfnrnfNYTvDjVpLYYUAN6PX2EfG",
  "expires": "2022-11-28T20:53:06Z",
  "allowedAction": ["read"],
  "proof": {
    "type": "Ed25519Signature2020",
    "created": "2021-11-28T20:53:06Z",
    "verificationMethod": "did:key:z6Mkfeco2NSEPeFV3DkjNSabaCza1EoS3CmqLb1eJ5BriiaR#z6Mkfeco2NSEPeFV3DkjNSabaCza1EoS3CmqLb1eJ5BriiaR",
    "proofPurpose": "capabilityDelegation",
    "capabilityChain": [
      "urn:zcap:root:https%3A%2F%2Fexample.com%2Fdocuments"
    ],
    "proofValue": "z244yxzRuFMyGfK85QcE6UewEZ3JpGDDTCvBKuxNiwdnxF3AmsSAoVYTBPLvFpYV7SeeWB4tUBGMGTF7pka6xR3av"
  }
}
```

### Requesting zCaps

How does an agent request a zCap? (From the [resource server](#resource-server-rs)'s
controller or similar appropriate entity.)

* For many use cases, zCaps do not need to be dynamically requested. Instead,
  they are created/delegated at service provisioning time, and the resulting
  zCap in a config file (environment variable or your secrets management
  infrastructure)
* For user-facing workflows, consider using VC-API in combination with the
  [Authorization Capability Request](https://w3c-ccg.github.io/vp-request-spec/#authorization-capability-request)
  query from the VPR spec. 
* Other workflows and protocols, such as the [Grant Negotiation and Authorization
  Protocol (GNAP)](https://datatracker.ietf.org/doc/rfc9635/) can also be used
  to request zCaps.

Example zCap request:

```json
{
    "verifiablePresentationRequest": {
      "interact": {
        "type": "UnmediatedHttpPresentationService2021",
        "serviceEndpoint": "https://example.com/exchanges/tx/12345"
      },
      "query": [
        {
          "type": "ZcapQuery",
          "capabilityQuery": {
            "reason":
              "Example App is requesting the permission to read and write to the Verifiable Credentials and VC Evidence collections.",
            "allowedAction": ["GET", "PUT", "POST"],
            "controller": "did:example:12345",
            "invocationTarget": 
              { "type": "https://w3id.org/byoe#collection", "contentType": "application/vc", "name": "VerifiableCredential collection"}
          }
        }
      ]
    }
}
```

### Revoking zCaps

* Out of band
* [Resource Server](#resource-server-rs) is responsible for handling its own
  revocation API / logic

## Using zCaps with HTTP Requests

### Code Examples

Although this guide goes into the details (below) of how to construct an HTTP
request using zCaps for authorization, developers are likely to interact with
zCaps using some sort of REST client with a wrapper that constructs the
necessary headers.

Javascript example, using a [root capability](#root-zcap) to make requests.
Note that to use a root zcap, the client needs to know just two things:

1. Which cryptographic key type to use (that's the `Ed25519Signature2020` suite)
2. A [signer](#signer), which is an abstract handle to a signature function.
   Signers are either provisioned at config time (with a private key loaded from
   an environment secret), or, preferably, used via an HSM (Hardware Security
   Module).

```js
import { Ed25519Signature2020 } from '@digitalcredentials/ed25519-signature-2020'
import { ZcapClient } from '@digitalcredentials/ezcap'

const rootSigner = await loadOrConstructRootSigner()

// Construct a client, pass it the ability to sign requests (via invocationSigner)
const zcapClient = new ZcapClient({
  SuiteClass: Ed25519Signature2020, invocationSigner: rootSigner
})

// You can now perform authorization-carrying requests
const url = 'https://example.com/api/protected-endpoint'

const response = await zcapClient.request({
  url, method: 'GET', action: 'GET'
})
console.log(response)
```

When using a [delegated](#delegating-a-zcap) zcap, you will need to also include
it in each request. Example:

```js
const capability = await loadDelegatedCapabilityFromConfig()
const invocationSigner = await loadSignerFromConfig()
const zcapClient = new ZcapClient({
  SuiteClass: Ed25519Signature2020, invocationSigner
})

// You can also include additional custom headers
const response = await zcapClient.request({
  url, capability, headers,
  method: 'POST', action: 'POST', json: { hello: "world" }
})
console.log(response)
```

### Constructing an HTTP Request Algorithm Overview

Note: This section is mostly for the benefit of zCap library implementers.
Developers wishing to use zCaps to make requests are encouraged to use existing
libraries whenever possible, such as the `@digitalcredentials/ezcap` Javascript
library.

To create an authorized HTTP request by [invoking](#invocation-capability-invocation)
a given zcap, follow this general algorithm:

1. Construct the `Capability-Invocation` header
2. Construct the `Digest` header if applicable (only if your request has a
   body/payload -- applicable for PUT/POST but not for GET)
3. Assemble the pseudo-headers and headers to sign:
   `['(key-id)', '(created)', '(expires)', '(request-target)','host', 'capability-invocation']`
    * If request has a body, add `'content-type', 'digest'` headers to the above list
4. Create the signature string (see below for details)
5. Construct the `Authorization` header, add the signature and other relevant parameters
6. Perform the HTTP request, include the `Capability-Invocation`, `Authorization`,
   and (optionally, if request has a body) the `Digest` headers

### Current vs Future Deployments

* Current zCap deployments and implementation libraries use the `Digest` header
  from the [`draft-ietf-httpbis-digest-headers-05`](https://www.ietf.org/archive/id/draft-ietf-httpbis-digest-headers-05.html)
  draft spec, and use the `Authorization` header from the
  [Cavage HTTP Signatures Draft 12](https://datatracker.ietf.org/doc/html/draft-cavage-http-signatures-12)
  spec
* Future iterations of the zCap spec and implementations are expected to migrate
  to use [RFC 9421: HTTP Message Signatures](https://datatracker.ietf.org/doc/html/rfc9421)
  and its corresponding `Signature-Input`, `Signature`, and `Content-Digest`
  headers instead.

### The `Capability-Invocation` Header

For root zcap invocations, use the zcap id by itself:

```
Capability-Invocation: zcap id="urn:zcap:root:https%3A%2F%2Fexample.com%2Fapi"
```

For delegated (non-root) zcaps, include the full encoded gzip'd capability, as
well as the action being invoked.

Example using JS string templates to construct the header for performing a `GET`
action:

```js
// base64url encoding: RFC 4648 url-safe, UNPADDED
const encodedCapability = base64UrlEncode(gzip(JSON.stringify(capability)))

headers['capability-invocation'] = `zcap capability="${encodedCapability}",action="GET"`
```

#### JS Example - `Capability-Invocation` Header



### Constructing the `Digest` Header

* Only relevant/recommended if your request has a payload or request body
  (that is, if it's a PUT or POST request, etc)
* See the [`draft-ietf-httpbis-digest-headers-05`](https://www.ietf.org/archive/id/draft-ietf-httpbis-digest-headers-05.html)
  draft spec for details
* Current deployments use either:
  - the `SHA-256` hash method with base64url encoding, or
  - Multihash encoding (also using `sha256`)

Example base64url encoded `Digest` header:

```
Digest: SHA-256=X48E9qOokqqrvdts8nOJRJN3OWDUoyWxBf7kbu9DBPE=
```

Example Multihash encoded `Digest` header:

```
Digest: mh=uEiBfjwT2o6iSqqu922zyc4lEk3c5YNSjJbEF_uRu70ME8Q
```

### Constructing the HTTP Message Signature

* Current deployments still use the [Cavage HTTP Signatures Draft 12](https://datatracker.ietf.org/doc/html/draft-cavage-http-signatures-12)
  spec

### Constructing the `Authorization` Header

Example `Authorization` header:

```
Authorization: Signature keyId="...",algorithm="rsa-sha256",headers="...",created="...",expires="...",signature="..."
```

The `signature` parameter is base64 encoded (RFC 4648, standard alphabet, PADDED).

## Verifying zCaps on the Resource Server

The [resource server](#resource-server-rs) is ultimately responsible for
verifying and enforcing zCaps. As with making requests, developers are
encouraged to use an existing library rather than implementing verification
from scratch -- in Javascript, that's the `@interop/http-signature-zcap-verify`
package (a fork of `@digitalbazaar/http-signature-zcap-verify`).

Verifying an incoming request involves two separate cryptographic checks:

1. **The HTTP signature** (from the `Authorization` header) -- proves that the
   requester controls the key it claims, and that the request was not tampered
   with in transit (this is the proof-of-possession part).
2. **The capability chain** (from the `Capability-Invocation` header) -- proves
   that the key used to sign the request was actually granted authority over
   this target, by an unbroken chain of [delegations](#delegation) leading back
   to the expected [root zcap](#root-zcap).

### Verification Algorithm Overview

Note: as with the request construction section, this is mostly for the benefit
of zCap library implementers. The whole algorithm below is performed by a
single call to `verifyCapabilityInvocation()` (see the code example in the next
section).

1. Parse the `Authorization` header (see [Current vs Future
   Deployments](#current-vs-future-deployments)) and check that all the
   expected pseudo-headers and headers were covered by the signature:
   `['(key-id)', '(created)', '(expires)', '(request-target)', 'host',
   'capability-invocation']`, plus `'content-type'` and `'digest'` if the
   request has a body. Check the signature's `created` and `expires`
   timestamps against the current time (allowing for some clock skew,
   typically 300 seconds).
2. Check that the `Host` header matches the server's own expected host.
3. Dereference the signature's `keyId` (for example, resolve the `did:key` to
   get the public key), reconstruct the signing string, and verify the
   signature.
4. Parse the `Capability-Invocation` header (the scheme must be `zcap`):
   * If it contains an `id` parameter, the invoked capability is a [root
     zcap](#root-zcap), referenced by its `urn:zcap:root:...` id.
   * If it contains a `capability` parameter, base64url-decode and gunzip it
     to get the full delegated zcap. A zcap passed by value _must_ have a
     `parentCapability` (root zcaps may only be invoked by `id`).
5. Validate the capability itself:
   * Dereference the [capability chain](#capability-chain-proof-chain) back to
     the root, and check that the root matches the *expected* root capability
     id for this URL (which the server computes itself -- see the next
     section).
   * Verify the [data integrity proof](#data-integrity-proof) on each
     delegation in the chain.
   * Check that each zcap in the chain is not [expired](#expiration), that
     each step only [attenuates](#attenuation) authority, and that the chain
     does not exceed the maximum allowed length.
   * Check that the invoked action is in the zcap's [allowed
     actions](#action-allowed-action), matches the action the endpoint
     expects, and that the request URL matches the zcap's [invocation
     target](#target-invocation-target).
   * Check that the key that signed the request belongs to the zcap's
     [controller](#controller).
6. If all of the above passes, the request is authorized. The verification
   result includes the invoked `capability`, the `capabilityAction`, and the
   `controller` (the invoker's DID), which the server can use for any further
   application-level checks, logging, or auditing.

### Where Does the Root zCap Come From?

Recall from [Creating a Root zCap](#creating-a-root-zcap) that root zcap ids
are deterministic: `urn:zcap:root:${encodeURIComponent(url)}`. This means the
resource server never needs to _store_ root zcaps. Instead, it synthesizes
them on demand during verification: given an expected target URL, the server
constructs the root capability object itself, filling in the `controller`
with the DID of the resource's owner (which the server knows from its own
database -- for example, the controller of a storage space, or an admin DID
from a config file).

This is the crucial trust step: by synthesizing the root zcap, **the server
itself decides who sits at the root of the delegation chain** for each
resource. Everything else (delegations) is verified cryptographically from
there.

In the `@interop` / `@digitalbazaar` library stack, this synthesis is done by
giving the verifier a document loader that handles the `urn:zcap:root:` URN
prefix (see the code example below).

### JS Example - Verifying an Incoming Request

Adapted from a working server implementation
([was-teaching-server](https://github.com/interop-alliance/was-teaching-server)):

```js
import { securityLoader } from '@interop/security-document-loader'
import { verifyCapabilityInvocation } from '@interop/http-signature-zcap-verify'
import { Ed25519VerificationKey } from '@interop/ed25519-verification-key'
import { Ed25519Signature2020 } from '@interop/ed25519-signature'
import * as didKey from '@interop/did-method-key'

// Set up a did:key resolver, used to dereference the invocation's signing key
const didKeyDriver = didKey.driver()
didKeyDriver.use({
  multibaseMultikeyHeader: 'z6Mk',
  fromMultibase: Ed25519VerificationKey.from
})

/**
 * Verifies the capability invocation on an incoming HTTP request.
 *
 * @param options {object}
 * @param options.url {string}   full request URL
 * @param options.method {string}   HTTP method of the request
 * @param options.headers {object}   request headers (including `authorization`,
 *   `capability-invocation`, and `digest`)
 * @param options.allowedTarget {string}   the expected invocationTarget URL
 * @param options.allowedAction {string}   the expected action, e.g. 'GET'
 * @param options.resourceController {string}   DID of the resource owner; this
 *   becomes the controller of the synthesized root zcap
 * @returns {Promise<object>}   `{ verified, capability, capabilityAction,
 *   controller, dereferencedChain, ... }`
 */
export async function verifyZcap({
  url, method, headers, allowedTarget, allowedAction, resourceController
}) {
  // The server computes the expected root capability id itself
  const expectedRootCapability = `urn:zcap:root:${encodeURIComponent(allowedTarget)}`

  // Document loader that synthesizes root zcaps on demand
  const loader = securityLoader()
  loader.setProtocolHandler({
    protocol: 'urn',
    handler: {
      get: async ({ id, url }) => {
        const resolvedUrl = url || id
        const rootZcapTarget = decodeURIComponent(
          resolvedUrl.split('urn:zcap:root:')[1]
        )
        return {
          '@context': 'https://w3id.org/zcap/v1',
          id: resolvedUrl,
          invocationTarget: rootZcapTarget,
          // This is the trust anchor: the server decides who the root
          // controller is for this resource
          controller: resourceController
        }
      }
    }
  })
  const documentLoader = loader.build()

  return verifyCapabilityInvocation({
    url, method, headers,
    expectedHost: new URL(allowedTarget).host,
    expectedAction: allowedAction,
    expectedRootCapability,
    expectedTarget: allowedTarget,
    documentLoader,
    // Resolves the invocation signature's keyId to a verifier
    async getVerifier({ keyId }) {
      const verificationMethod = await didKeyDriver.get({ url: keyId })
      const key = await Ed25519VerificationKey.from(verificationMethod)
      return { verifier: key.verifier(), verificationMethod }
    },
    suite: new Ed25519Signature2020()
  })
}
```

The result object looks like:

```js
{
  verified: true,
  capability,           // the invoked zcap
  capabilityAction,     // the action that was invoked, e.g. 'GET'
  controller,           // DID of the invoker
  invoker: controller,
  dereferencedChain,    // the full zcap chain, root first
  verificationMethod
}
```

A typical HTTP handler then becomes:

```js
const result = await verifyZcap({
  url, method, headers,
  allowedTarget: 'https://example.com/documents/123',
  allowedAction: method,  // e.g. require the action to match the HTTP verb
  resourceController: documentOwnerDid
})
if (!result.verified) {
  return response.status(401).end()
}
// ... proceed with the request
```

### What the Verification Library Does *Not* Check

A few things remain the resource server's responsibility, beyond the
`verifyCapabilityInvocation()` call:

* **The request body hash.** The HTTP signature covers the `Digest` _header_,
  but the library never sees the request body -- the server must independently
  compute the hash of the received body and compare it against the `Digest`
  header value. Skipping this check allows an attacker to replay a signed
  request with a different payload. See [Verifying the `Digest`
  Header](#verifying-the-digest-header) below.
* **[Revocation](#revocation).** The library accepts an optional
  `inspectCapabilityChain` callback; use it to check each zcap id in the chain
  against your revocation list. (See also [Revoking zCaps](#revoking-zcaps).)
* **Application-level authorization.** A verified invocation proves the
  requester holds a valid, unexpired zcap chain for this target and action --
  any business rules beyond that (rate limits, quotas, per-tenant logic) are
  up to the server, using the returned `controller` and `capability`.

Useful optional knobs on `verifyCapabilityInvocation()`:

* `allowTargetAttenuation` - allow delegated zcaps to narrow the invocation
  target to a sub-path of the parent's URL (hierarchical RESTful attenuation;
  see [attenuation](#attenuation)). Most storage use cases (EDV, WAS) need
  this enabled.
* `maxChainLength` - maximum number of delegations allowed in a chain.
* `maxDelegationTtl` - maximum time-to-live of any delegated zcap in the
  chain (measured as the difference between the delegation proof's `created`
  and the zcap's `expires`).
* `maxClockSkew` - seconds of clock skew tolerated when checking signature
  and capability expiration times (default: 300).

### Verifying the `Digest` Header

This is the server-side counterpart of [Constructing the `Digest`
Header](#constructing-the-digest-header), and only applies to requests that
have a body (PUT, POST, etc).

The procedure: hash the request body with SHA-256, encode the hash the same
way the client did (the encoding is indicated by the header value's prefix --
`SHA-256=` for base64, `mh=` for Multihash), and compare against the received
`Digest` header value.

Two things to watch out for:

* Hash the **raw received body bytes**, not a re-serialized version of the
  parsed body. A `JSON.parse()` / `JSON.stringify()` round trip is not
  guaranteed to reproduce the exact bytes the client hashed.
* If the endpoint accepts a body, treat a _missing_ `Digest` header as an
  error, too -- otherwise an attacker can strip the header along with swapping
  the body.

Javascript example, using the `@interop/http-digest-header` package (which
handles both encodings automatically):

```js
import { verifyHeaderValue } from '@interop/http-digest-header'

// In your HTTP handler, alongside the zcap verification:
if (requestHasBody) {
  const digestHeader = headers.digest
  if (!digestHeader) {
    return response.status(400).end()
  }
  const { verified } = await verifyHeaderValue({
    data: rawBody, headerValue: digestHeader
  })
  if (!verified) {
    return response.status(400).end()
  }
}
```

## Performance Considerations

### Caching zCaps by `id` for Verification

## Case Studies

### Using zCaps with Encrypted Data Vaults (EDVs)

### Using zCaps with Wallet Attached Storage (WAS)

## Appendix A: IANA Registration Considerations

## Appendix B: Implementations

## Appendix C: FAQ

### Why Not OAuth 2

Developers familiar with common API authorization schemes might well ask, "how
is this better than OAuth 2?".

...

### What About JSON-LD / Linked Data?

* The current spec version, [Authorization Capabilities for Linked Data v0.3](https://w3c-ccg.github.io/zcap-spec/),
  uses JSON-LD serializations for zCaps, primarily for the convenience of
  using various Data Integrity cryptosuites for proof chains.
* However, now that the W3C Verifiable Credentials Working Group has released
  specs that don't require linked data canonicalization (such as the
  [`eddsa-jcs-2022`](https://w3c.github.io/vc-di-eddsa/#eddsa-jcs-2022) suite),
  proof chains can be done without the use of `@context` or JSON-LD.
* (From conversations with the zCap spec editors) The next version of the zCap
  spec is going to drop the `@context` requirement, and use either JCS-based
  signature methods, or perhaps specify a _default context_.


## License
This work is licensed under a
[Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International License][cc-by-nc-sa].

[![CC BY-NC-SA 4.0][cc-by-nc-sa-image]][cc-by-nc-sa]

[cc-by-nc-sa]: http://creativecommons.org/licenses/by-nc-sa/4.0/
[cc-by-nc-sa-image]: https://licensebuttons.net/l/by-nc-sa/4.0/88x31.png
[cc-by-nc-sa-shield]: https://img.shields.io/badge/License-CC%20BY--NC--SA%204.0-lightgrey.svg

Examples and code snippets are licensed under the MIT license.
