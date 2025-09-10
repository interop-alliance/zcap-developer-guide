#!/usr/bin/env -S node --no-warnings

import { parseArgs } from 'node:util'

const args = parseArgs({
  options: {
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
const SPACE_PATH = `/space/${spaceUuid}`
const linkset = {
  "linkset": [
    {
      "anchor": `${SPACE_PATH}`,
      'serving-preference': [
        {
          type: 'DefaultHtml',
          href: `${SPACE_PATH}/index.html`,
        }
      ]
    },
    {
      "anchor": `${SPACE_PATH}/`,
      "acl": [
        {
          "href": `${SPACE_PATH}/acl.json`
        }
      ]
    },
  ]
}
console.info(JSON.stringify(linkset, null, 2))
