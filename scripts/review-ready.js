#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const projectRoot = path.resolve(__dirname, '..');

const SKIP_DIRS = new Set(['node_modules', '.git']);
const TEXT_EXTENSIONS = new Set(['.js', '.json', '.html', '.md', '.css']);

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

function walkAllFiles(dir, files = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) {
        walkAllFiles(path.join(dir, entry.name), files);
      }
      continue;
    }

    files.push(path.join(dir, entry.name));
  }

  return files;
}

function isTextReviewFile(filePath) {
  return TEXT_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

function checkTextQuality(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split(/\r?\n/);
  const trailingWhitespaceLines = [];
  const mergeConflictLines = [];

  lines.forEach((line, index) => {
    const lineNumber = index + 1;

    if (/\s+$/.test(line)) {
      trailingWhitespaceLines.push(lineNumber);
    }

    if (/^(<<<<<<<|=======|>>>>>>>)\s/.test(line)) {
      mergeConflictLines.push(lineNumber);
    }
  });

  return {
    ok: mergeConflictLines.length === 0,
    filePath,
    trailingWhitespaceLines,
    mergeConflictLines
  };
}

function collectHtmlAssetReferences(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const attrPattern = /(?:src|href)=(["'])([^"']+)\1/g;
  const refs = [];
  let match;

  while ((match = attrPattern.exec(content)) !== null) {
    const reference = match[2].trim();

    if (!reference ||
      reference.startsWith('#') ||
      /^https?:\/\//i.test(reference) ||
      reference.startsWith('//') ||
      reference.startsWith('mailto:') ||
      reference.startsWith('tel:') ||
      reference.startsWith('data:')) {
      continue;
    }

    const cleanRef = reference.split('?')[0].split('#')[0];

    if (!cleanRef || cleanRef.endsWith('/')) {
      continue;
    }

    refs.push(cleanRef);
  }

  return refs;
}

function checkHtmlAssetReferences(filePath) {
  const refs = collectHtmlAssetReferences(filePath);
  const htmlDir = path.dirname(filePath);
  const missing = [];

  refs.forEach(ref => {
    const absoluteRef = path.resolve(htmlDir, ref);
    if (!fs.existsSync(absoluteRef)) {
      missing.push(ref);
    }
  });

  return {
    ok: missing.length === 0,
    filePath,
    missing
  };
}


function main() {
  const jsFiles = walk(projectRoot, '.js');
  const jsonFiles = walk(projectRoot, '.json');
  const htmlFiles = walk(projectRoot, '.html');
  const reviewTextFiles = walkAllFiles(projectRoot).filter(isTextReviewFile);

  const jsFailures = jsFiles
    .map(runNodeSyntaxCheck)
    .filter(result => !result.ok);

  const jsonFailures = jsonFiles
    .map(parseJson)
    .filter(result => !result.ok);

  const htmlFailures = htmlFiles
    .map(checkHtmlAssetReferences)
    .filter(result => !result.ok);

  const textQualityChecks = reviewTextFiles.map(checkTextQuality);
  const textQualityFailures = textQualityChecks.filter(result => !result.ok);

  if (jsFailures.length || jsonFailures.length || htmlFailures.length || textQualityFailures.some(result => result.mergeConflictLines.length)) {
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

    if (htmlFailures.length) {
      console.error('\nHTML asset reference errors:');
      htmlFailures.forEach(failure => {
        console.error(`- ${toRelative(failure.filePath)}`);
        failure.missing.forEach(ref => {
          console.error(`  · Missing reference: ${ref}`);
        });
      });
    }

    const mergeMarkerFailures = textQualityFailures.filter(result => result.mergeConflictLines.length);
    if (mergeMarkerFailures.length) {
      console.error('\nMerge conflict marker errors:');
      mergeMarkerFailures.forEach(failure => {
        console.error(`- ${toRelative(failure.filePath)}`);
        console.error(`  · Merge conflict marker lines: ${failure.mergeConflictLines.join(', ')}`);
      });
    }

    process.exit(1);
  }

  const trailingWhitespaceWarnings = textQualityChecks.filter(result => result.trailingWhitespaceLines.length);
  if (trailingWhitespaceWarnings.length) {
    console.warn(`⚠️ Trailing whitespace detected in ${trailingWhitespaceWarnings.length} file(s).`);
  }

  console.log(`✅ JavaScript files checked: ${jsFiles.length}`);
  console.log(`✅ JSON files checked: ${jsonFiles.length}`);
  console.log(`✅ HTML files checked: ${htmlFiles.length}`);
  console.log(`✅ Text quality files checked: ${reviewTextFiles.length}`);
  console.log('✅ Project is ready for upload checks.');
}

main();
