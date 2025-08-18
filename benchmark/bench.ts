import { Bench } from 'tinybench'
import fs from 'fs'

import { search, searchFile, validatePattern } from '../index.js'

// Create large test content to showcase Rust's performance
const createLargeContent = (baseContent: string, multiplier: number) => {
  return baseContent.repeat(multiplier)
}

// JavaScript implementation for comparison (including file read time)
function jsSearchWithFileRead(pattern: string, filePath: string) {
  const content = fs.readFileSync(filePath, 'utf-8')
  const lines = content.split('\n')
  const matches = []
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (line.includes(pattern)) {
      matches.push({
        lineNumber: i + 1,
        line: line,
        start: line.indexOf(pattern),
        end: line.indexOf(pattern) + pattern.length
      })
    }
  }
  
  return matches
}

// JavaScript multi-file search (naive implementation)
function jsMultiFileSearch(pattern: string, filePaths: string[]) {
  const allMatches = []
  let filesSearched = 0
  let filesWithMatches = 0
  
  for (const filePath of filePaths) {
    try {
      const content = fs.readFileSync(filePath, 'utf-8')
      const lines = content.split('\n')
      const fileMatches = []
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        if (line.includes(pattern)) {
          fileMatches.push({
            path: filePath,
            lineNumber: i + 1,
            line: line,
            start: line.indexOf(pattern),
            end: line.indexOf(pattern) + pattern.length
          })
        }
      }
      
      filesSearched++
      if (fileMatches.length > 0) {
        filesWithMatches++
        allMatches.push(...fileMatches)
      }
    } catch (err) {
      // Skip files that can't be read
    }
  }
  
  return {
    matches: allMatches,
    filesSearched,
    filesWithMatches,
    totalMatches: allMatches.length
  }
}

// Complex regex search in JavaScript
function jsComplexRegexSearch(pattern: string, filePath: string) {
  const content = fs.readFileSync(filePath, 'utf-8')
  const regex = new RegExp(pattern, 'gm')
  const lines = content.split('\n')
  const matches = []
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    let match
    regex.lastIndex = 0
    while ((match = regex.exec(line)) !== null) {
      matches.push({
        lineNumber: i + 1,
        line: line,
        start: match.index,
        end: match.index + match[0].length
      })
    }
  }
  
  return matches
}

// Setup: Create large test files to showcase performance differences
const baseContent = fs.readFileSync('./src/lib.rs', 'utf-8')
const largeContent = createLargeContent(baseContent, 50) // 50x larger
const veryLargeContent = createLargeContent(baseContent, 200) // 200x larger

// Write test files
if (!fs.existsSync('./benchmark/temp')) {
  fs.mkdirSync('./benchmark/temp')
}

fs.writeFileSync('./benchmark/temp/large.rs', largeContent)
fs.writeFileSync('./benchmark/temp/very_large.rs', veryLargeContent)

// Create multiple test files for multi-file search
for (let i = 0; i < 20; i++) {
  fs.writeFileSync(`./benchmark/temp/test_${i}.rs`, baseContent)
}

const testFiles = Array.from({ length: 20 }, (_, i) => `./benchmark/temp/test_${i}.rs`)

const bench = new Bench()

// 1. Large file search - where Rust's memory efficiency shines
bench.add('🦀 ripgrep-napi: search in large file (50x)', () => {
  searchFile('pub fn', './benchmark/temp/large.rs')
})

bench.add('🐌 JavaScript: search in large file (50x)', () => {
  jsSearchWithFileRead('pub fn', './benchmark/temp/large.rs')
})

// 2. Very large file search - pushing the limits
bench.add('🦀 ripgrep-napi: search in very large file (200x)', () => {
  searchFile('struct', './benchmark/temp/very_large.rs')
})

bench.add('🐌 JavaScript: search in very large file (200x)', () => {
  jsSearchWithFileRead('struct', './benchmark/temp/very_large.rs')
})

// 3. Multi-file search - ripgrep's bread and butter
bench.add('🦀 ripgrep-napi: search across 20 files', () => {
  search('fn', testFiles)
})

bench.add('🐌 JavaScript: search across 20 files', () => {
  jsMultiFileSearch('fn', testFiles)
})

// 4. Complex regex patterns - where ripgrep's regex engine excels
const complexPattern = '(?:pub\\s+)?(?:async\\s+)?fn\\s+\\w+\\s*\\([^)]*\\)\\s*(?:->\\s*[^{]+)?\\s*\\{'

bench.add('🦀 ripgrep-napi: complex regex pattern', () => {
  searchFile(complexPattern, './src/lib.rs')
})

bench.add('🐌 JavaScript: complex regex pattern', () => {
  jsComplexRegexSearch(complexPattern, './src/lib.rs')
})

// 5. Case-insensitive search with options
bench.add('🦀 ripgrep-napi: case-insensitive + word boundaries', () => {
  searchFile('FUNCTION', './benchmark/temp/large.rs', { 
    caseSensitive: false, 
    wordRegexp: true 
  })
})

// 6. Search with file traversal (directory search)
bench.add('🦀 ripgrep-napi: directory traversal search', () => {
  search('use', ['./src', './__test__'], { 
    maxDepth: 3,
    hidden: false 
  })
})

// 7. Pattern validation (Rust's regex compilation)
const patterns = [
  '\\d{3}-\\d{2}-\\d{4}',
  '(?i)hello\\s+world',
  '[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}',
  '\\b(?:pub|private|protected)\\s+(?:static\\s+)?\\w+\\s*\\(',
  '^\\s*(?:#\\[\\w+(?:\\([^)]*\\))?\\]\\s*)*(?:pub\\s+)?(?:async\\s+)?fn\\s+\\w+'
]

bench.add('🦀 ripgrep-napi: validate complex patterns', () => {
  patterns.forEach(pattern => validatePattern(pattern))
})

// 8. Large directory with ignore patterns
bench.add('🦀 ripgrep-napi: search with ignore patterns', () => {
  search('fn', ['./'], {
    maxDepth: 2,
    ignorePatterns: ['target', 'node_modules', '*.lock', '*.log']
  })
})

await bench.run()

console.log('\n🏆 Performance Results:')
console.table(bench.table())

// Cleanup
try {
  fs.rmSync('./benchmark/temp', { recursive: true, force: true })
} catch (err) {
  console.log('Note: Cleanup failed, you may need to manually remove ./benchmark/temp')
}
