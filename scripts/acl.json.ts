#!/usr/bin/env -S node --no-warnings

import { parseArgs } from 'node:util'
const options = {
}
const args = parseArgs({ options })
const acl = {
  type: "PublicCanRead"
}
console.info(JSON.stringify(acl, null, 2))
