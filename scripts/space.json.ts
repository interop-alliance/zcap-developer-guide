#!/usr/bin/env node

import { parseArgs } from 'node:util'
const DEFAULT_CONTROLLER = undefined
const args = parseArgs({
  strict: false,
  options: {
    controller: {
      type: 'string',
    },
    server: {
      type: 'string',
    },
    uuid: {
      type: 'string',
      default: process.env.SPACE_UUID || crypto.randomUUID(),
    }
  }
})
const spaceUuid = args.values.uuid
const id = `urn:uuid:${spaceUuid}`
const link = `/space/${spaceUuid}/linkset.json`
const controller = 'false' === args.values.controller ? undefined : (true === args.values.controller) ? DEFAULT_CONTROLLER : args.values.controller || DEFAULT_CONTROLLER
const space = {
  controller,
  id,
  link,
}
console.info(JSON.stringify(space, null, 2))
