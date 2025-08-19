import test from 'ava'

import { search, searchFile, validatePattern, getSupportedFileTypes } from '../index.js'

// Check if we're running in WASI environment
const isWASI = process.env.NAPI_RS_FORCE_WASI === '1'

test('validate pattern function', (t) => {
  t.true(validatePattern('hello'))
  t.true(validatePattern('\\d+'))
  t.false(validatePattern('['))
})

test('get supported file types function', (t) => {
  const types = getSupportedFileTypes()
  t.true(Array.isArray(types))
  t.true(types.length > 0)
  t.true(types.includes('rust'))
  t.true(types.includes('javascript'))
})

test('search function with basic pattern', (t) => {
  if (isWASI) {
    // In WASI environment, skip file system tests
    t.pass('Skipping file system test in WASI environment')
    return
  }
  
  // Search for 'use' in the current source file
  const result = search('use', ['./src/lib.rs'])
  
  t.true(result.success)
  t.is(typeof result.filesSearched, 'number')
  t.is(typeof result.filesWithMatches, 'number')
  t.is(typeof result.totalMatches, 'number')
  t.true(Array.isArray(result.matches))
})

test('search file function', (t) => {
  if (isWASI) {
    // In WASI environment, skip file system tests
    t.pass('Skipping file system test in WASI environment')
    return
  }
  
  // Search for 'fn' in the source file
  const result = searchFile('fn', './src/lib.rs')
  
  t.true(result.success)
  t.true(result.matches.length > 0)
  
  // Check first match structure
  const firstMatch = result.matches[0]
  t.is(typeof firstMatch.path, 'string')
  t.is(typeof firstMatch.lineNumber, 'number')
  t.is(typeof firstMatch.line, 'string')
})
