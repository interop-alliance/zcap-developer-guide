# zCap (Authorization Capabilities) Developer's Guide

[![CC BY-NC-SA 4.0][cc-by-nc-sa-shield]][cc-by-nc-sa]

> A hands-on guide for developers working with zCaps (Authorization Capabilities).

## Table of Contents

- [Introduction](#introduction)
- [License](#license)

## Introduction

### Motivation

Currently, Authorization Capabilities (zCaps for short) are in an awkward but
familiar situation where the deployed state of the art is significantly ahead
of the [specification](https://w3c-ccg.github.io/zcap-spec/).

This implementation guide is meant to fill the gap between the spec and its usage
in production.

### Core Concepts

What are Authorization Capabilities? (Aside from a less confusing name for
[object capabilities](https://en.wikipedia.org/wiki/Object-capability_model).)
You can think of them as fancy structured access tokens, with some key features
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

* **who** - which agent (identified by a cryptographic key) is being given permission
* **can** - what actions is the agent allowed to perform
* **with** - what *resource* are they allowed to perform the actions on
* **given** - what other restrictions are in place? (these are also known as
  "caveats" or "attenuations")

Here is an example zcap (given in Javascript notation just so we can add comments):

```js
{
  // Unique id for the zcap
  id: 'urn:uuid:b7576396-c032-46eb-9726-2a628a72828d',

  // 'who' - the DID of the agent that is allowed to perform actions
  controller: 'did:key:z6MkpmRaHigFewVnmQtLEYS8Zckb4kJNDJCk3bSFeiJNQfZy',

  // 'can' - which actions (HTTP verbs) they're allowed to perform
  allowedAction: ['GET', 'POST'],

  // 'with' - what resource can those actions be performed on
  invocationTarget: 'https://example.com/api/hello'
}
```

## License
This work is licensed under a
[Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International License][cc-by-nc-sa].

[![CC BY-NC-SA 4.0][cc-by-nc-sa-image]][cc-by-nc-sa]

[cc-by-nc-sa]: http://creativecommons.org/licenses/by-nc-sa/4.0/
[cc-by-nc-sa-image]: https://licensebuttons.net/l/by-nc-sa/4.0/88x31.png
[cc-by-nc-sa-shield]: https://img.shields.io/badge/License-CC%20BY--NC--SA%204.0-lightgrey.svg

Examples and code snippets are licensed under the MIT license.
