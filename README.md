# zCap (Authorization Capabilities) Developer's Guide

[![CC BY-NC-SA 4.0][cc-by-nc-sa-shield]][cc-by-nc-sa]

> A hands-on guide for developers working with zCaps (Authorization Capabilities).

Report issues to this guide's repo: https://github.com/interop-alliance/zcap-developer-guide

## Table of Contents

* [Introduction](#introduction)
  - [Core Concept](#core-concept)
  - [Why not OAuth 2](#why-not-oauth-2)
  - [What About JSON-LD / Linked Data?](#what-about-json-ld--linked-data)
* [Terminology](#terminology)
* [Creating and Delegating zCaps](#creating-and-delegating-zcaps)
* [Using zCaps with HTTP Requests](#using-zcaps-with-http-requests)
* [Verifying zCaps on the Resource Server](#verifying-zcaps-on-the-resource-server)
* [Performance Considerations](#performance-considerations)
  - [Caching zCaps by `id` for Verification](#caching-zcaps-by-id-for-verification)
* [Appendix A: IANA Registration Considerations](#appendix-a-iana-registration-considerations)
* [Appendix B: Implementations](#appendix-b-implementations)
* [License](#license)

## Introduction

Currently, Authorization Capabilities (zCaps for short) are in an awkward but
familiar situation where the deployed state of the art is significantly ahead
of the [specification](https://w3c-ccg.github.io/zcap-spec/).

This implementation guide is meant to fill the gap between the spec and its usage
in production.

### Core Concept

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

* **who** - which [agent](#agent) (identified by a cryptographic key) is being
  given permission
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

## Terminology

#### action, allowed action

#### agent
Any entity, usually an app (mobile, desktop or web app), an AI agent,
or cloud microservice, capable of generating or storing cryptographic material
(at least a public/private [keypair](#key-cryptographic-key)) so that it can
prove cryptographic control over its identifier.

#### attenuation

#### Authorization header

#### capability chain

#### caveat

#### controller

#### data integrity proof

#### delegation

#### Digest header

#### DID, Decentralized Identifier

#### expiration

#### HTTP Signatures

#### invocation, capability invocation
The _act_ of invoking a capability at the intended destination ([resource 
server](#resource-server-rs)), a combination of _presenting_ the capability, and
also proving cryptographic control (usually via a digital signature).

Analogy: a government servant may possess a badge of office in their pocket,
but specifically the act of _presenting_ the badge to some other person (and
thus proving possession of the badge, even if not cryptographicaly) would be
the equivalent of invoking a capability.

#### invoker

#### key, cryptographic key

#### proof chain

#### resource server, RS

#### revocation

#### root zcap

#### target, invocation target

#### zcap

## Creating and Delegating zCaps

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

## Using zCaps with HTTP Requests

## Verifying zCaps on the Resource Server

## Performance Considerations

### Caching zCaps by `id` for Verification

## Case Studies

## Appendix A: IANA Registration Considerations

## Appendix B: Implementations

## License
This work is licensed under a
[Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International License][cc-by-nc-sa].

[![CC BY-NC-SA 4.0][cc-by-nc-sa-image]][cc-by-nc-sa]

[cc-by-nc-sa]: http://creativecommons.org/licenses/by-nc-sa/4.0/
[cc-by-nc-sa-image]: https://licensebuttons.net/l/by-nc-sa/4.0/88x31.png
[cc-by-nc-sa-shield]: https://img.shields.io/badge/License-CC%20BY--NC--SA%204.0-lightgrey.svg

Examples and code snippets are licensed under the MIT license.
