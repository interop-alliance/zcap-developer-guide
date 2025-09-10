#!/usr/bin/env node

/**
 * @fileoverview
 * 
 * # `put-website.ts`
 * 
 * this is a script that will put a website from a fs dir to a was collection.
 * 
 * ## Current Status
 * 
 * ⚠️ Work in Progress. Not yet functional.
 * 
 * This was a bit of a detour when I needed a way to deploy local builds of wasup-react/website to WAS for testing.
 * Ultimately I found a workaround by fixing wallet-attached-storage-action on gobengo/private-wasup-react.
 * There is still a need for good js modules for this logic that is currently only in the gh action in shell,
 * e.g. putting index.html to 'collection/' to simulate the common expectation of resolving 'collection/' to 'collection/index.html' dynamically.
 * 
 * ## Next Steps
 * 
 * This needs to use did-sshpk for the signer instead of generating one randomly in `main`.
 */

import { Dirent } from "node:fs";
import { readdir } from "node:fs/promises";
import path, { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { createRequestForCapabilityInvocation } from "dzcap/zcap-invocation-request"
import { Ed25519Signer } from "@did.coop/did-key-ed25519"
import * as fs from "node:fs"
import assert from "node:assert";

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  console.debug('main')
  main().catch(error => {
    console.error(error)
    process.exit(1)
  })
}

/**
 * called when thie file is executed
 */
async function main() {
  const args = parseArgs({
    options: {
      source: {
        type: 'string',
        default: fileURLToPath(new URL('../website/build/client/', import.meta.url))
      },
    },
    allowPositionals: true,
  })
  const [targetArg] = args.positionals

  const targetCollectionUrl = new URL(targetArg)

  const sourceArg = args.values.source

  // throw new Error('todo: dont just generate a random signer here because then allt he requests get a 401')
  const defaultSigner = await Ed25519Signer.generate()

  console.debug(`uploading ${sourceArg} ${targetCollectionUrl}`)
  for await (const {path} of walkEntries(sourceArg)) {
      const name = relative(sourceArg, path)
      const source = `${sourceArg}${name}`
      // this is the url we want to upload from source to
      const target = new URL(`${targetCollectionUrl.toString()}${name}`)

      console.debug(`@todo: wasup ${source} ${target}`)

      const isDirectory = fs.statSync(source).isDirectory()
      if (isDirectory) continue

      // try to upload
      const sourceBlob = await createBlobFromPath(source)
      await putBlob(sourceBlob, target, defaultSigner)
  }
}

// Simple MIME type mapping
const mimeTypes: Record<string, string> = {
  '.txt': 'text/plain',
  '.json': 'application/json',
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.pdf': 'application/pdf',
  // Add more as needed
};

async function createBlobFromPath(filePath: string, mimeType?: string): Promise<Blob> {
  const buffer = await fs.promises.readFile(filePath);
  
  const type = mimeType || 
    mimeTypes[path.extname(filePath).toLowerCase()] || 
    'application/octet-stream';
  
  return new Blob([new Uint8Array(buffer)], { type });
}

/**
 * put resources to target for all entries of a source filesystem directory
 */
async function putBlob(source: Blob, target: URL, invocationSigner: Ed25519Signer) {
  console.debug('start putFromFsDir', { source, target: target.toString() })
  const requestToPutFromFsToTarget = new Request(target, {
    ...await createRequestForCapabilityInvocation(withProtocol('https:', target), {
      method: 'PUT',
      invocationSigner,
      body: source,
    })
  })

  const responseToPutFromFsToTarget = await fetch(requestToPutFromFsToTarget)
  console.debug('responseToPutFromFsToTarget', responseToPutFromFsToTarget)
  // @todo: this fails because we're not actually setting up the space controller to be the same as invocationSigner, which is randomly generated each time.
  assert.equal(responseToPutFromFsToTarget.status, 201, `response to PUT MUST have status 201`)
  assert.notEqual(responseToPutFromFsToTarget.status, 401, `response.status for successful PUT MUST not be 401`)
}

// convert a url to another with changed protocol
export function withProtocol(protocol: `${string}:`, url: URL) {
  const url2 = new URL(url)
  url2.protocol = protocol
  return url2
}

async function* walkEntries(dir: string): AsyncGenerator<{path:string}> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const path = join(entry.parentPath, entry.name)
      yield {
        ...entry,
        path,
      }
      
      if (entry.isDirectory()) {
        yield* walkEntries(path);
      }
    }
  } catch (error) {
    // Skip directories we can't read
    throw error
  }
}
