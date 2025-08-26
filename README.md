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

What are Authorization Capabilities? (Aside from - a less confusing name for
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

## License
This work is licensed under a
[Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International License][cc-by-nc-sa].

[![CC BY-NC-SA 4.0][cc-by-nc-sa-image]][cc-by-nc-sa]

[cc-by-nc-sa]: http://creativecommons.org/licenses/by-nc-sa/4.0/
[cc-by-nc-sa-image]: https://licensebuttons.net/l/by-nc-sa/4.0/88x31.png
[cc-by-nc-sa-shield]: https://img.shields.io/badge/License-CC%20BY--NC--SA%204.0-lightgrey.svg

Examples and code snippets are licensed under the MIT license.
