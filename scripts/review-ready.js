#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const projectRoot = path.resolve(__dirname, '..');
const JS_DIRECTORIES = ['js', 'scripts'];
const ROOT_JS_FILES = ['fix_views.js'];
const JSON_FILES = ['package.json', 'manifest.json'];

function collectJsFiles() {
  const files = [];

  for (const relativeDir of JS_DIRECTORIES) {
    const dirPath = path.join(projectRoot, relativeDir);
    if (!fs.existsSync(dirPath)) {
      continue;
    }

    walkDirectory(dirPath, filePath => {
      if (filePath.endsWith('.js')) {
        files.push(filePath);
      }
    });
  }

  for (const relativeFile of ROOT_JS_FILES) {
    const filePath = path.join(projectRoot, relativeFile);
    if (fs.existsSync(filePath)) {
      files.push(filePath);
    }
  }

  return [...new Set(files)].sort();
}

function collectJsonFiles() {
  return JSON_FILES
    .map(relativeFile => path.join(projectRoot, relativeFile))
    .filter(filePath => fs.existsSync(filePath));
}

function walkDirectory(dirPath, onFile) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const entryPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      walkDirectory(entryPath, onFile);
      continue;
    }

    if (entry.isFile()) {
      onFile(entryPath);
    }
  }
}

function runNodeSyntaxCheck(filePath) {
  const result = spawnSync(process.execPath, ['--check', filePath], {
    encoding: 'utf8'
  });

  return {
    ok: result.status === 0,
    stderr: (result.stderr || '').trim(),
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

function printFailures(jsFailures, jsonFailures) {
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
}

function main() {
  const jsFiles = collectJsFiles();
  const jsonFiles = collectJsonFiles();

  const jsFailures = jsFiles.map(runNodeSyntaxCheck).filter(result => !result.ok);
  const jsonFailures = jsonFiles.map(parseJson).filter(result => !result.ok);

  if (jsFailures.length || jsonFailures.length) {
    printFailures(jsFailures, jsonFailures);
    process.exit(1);
  }

  console.log(`✅ JavaScript files checked: ${jsFiles.length}`);
  console.log(`✅ JSON files checked: ${jsonFiles.length}`);
  console.log('✅ Project is ready for upload checks.');
}

main();
