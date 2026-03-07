#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const projectRoot = path.resolve(__dirname, '..');

const SKIP_DIRS = new Set(['node_modules', '.git']);

function walk(dir, extension, files = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) {
        walk(path.join(dir, entry.name), extension, files);
      }
      continue;
    }

    if (entry.name.endsWith(extension)) {
      files.push(path.join(dir, entry.name));
    }
  }

  return files;
}

function runNodeSyntaxCheck(filePath) {
  const result = spawnSync(process.execPath, ['--check', filePath], {
    encoding: 'utf8'
  });

  return {
    ok: result.status === 0,
    stderr: result.stderr.trim(),
    filePath
  };
}

function parseJson(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');

  try {
    JSON.parse(content);
    return { ok: true, filePath };
  } catch (error) {
    return { ok: false, filePath, message: error.message };
  }
}

function toRelative(filePath) {
  return path.relative(projectRoot, filePath);
}

function main() {
  const jsFiles = walk(projectRoot, '.js');
  const jsonFiles = walk(projectRoot, '.json');

  const jsFailures = jsFiles
    .map(runNodeSyntaxCheck)
    .filter(result => !result.ok);

  const jsonFailures = jsonFiles
    .map(parseJson)
    .filter(result => !result.ok);

  if (jsFailures.length || jsonFailures.length) {
    console.error('Pre-upload review checks failed.');

    if (jsFailures.length) {
      console.error('\nJavaScript syntax errors:');
      jsFailures.forEach(failure => {
        console.error(`- ${toRelative(failure.filePath)}`);
        if (failure.stderr) {
          console.error(failure.stderr);
        }
      });
    }

    if (jsonFailures.length) {
      console.error('\nJSON parse errors:');
      jsonFailures.forEach(failure => {
        console.error(`- ${toRelative(failure.filePath)} -> ${failure.message}`);
      });
    }

    process.exit(1);
  }

  console.log(`✅ JavaScript files checked: ${jsFiles.length}`);
  console.log(`✅ JSON files checked: ${jsonFiles.length}`);
  console.log('✅ Project is ready for upload checks.');
}

main();
