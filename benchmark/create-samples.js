import fs from 'fs';

// Create sample files for benchmarking
const sampleData = `
function hello() {
  console.log("Hello, world!");
}

function goodbye() {
  console.log("Goodbye, world!");
}

const message = "This is a test file for benchmarking ripgrep-napi";
const numbers = [1, 2, 3, 4, 5];

// Some patterns to search for
const patterns = ["function", "console", "test", "hello", "world"];
`;

// Create benchmark sample files
fs.writeFileSync('./benchmark/sample1.js', sampleData);
fs.writeFileSync('./benchmark/sample2.js', sampleData.repeat(10));
fs.writeFileSync('./benchmark/sample3.js', sampleData.repeat(100));

console.log('Sample files created for benchmarking');
