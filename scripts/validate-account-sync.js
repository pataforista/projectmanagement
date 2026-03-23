#!/usr/bin/env node

/**
 * Validate Account Sync Architecture
 * This script checks that the account sync fixes have been properly applied
 */

const fs = require('fs');
const path = require('path');

const ERRORS = [];
const WARNINGS = [];
const SUCCESSES = [];

function checkFile(filePath, pattern, description) {
    const content = fs.readFileSync(filePath, 'utf8');
    if (content.includes(pattern)) {
        SUCCESSES.push(`✓ ${description}`);
        return true;
    } else {
        ERRORS.push(`✗ ${description} - Not found in ${path.basename(filePath)}`);
        return false;
    }
}

function checkFileMultiple(filePath, patterns) {
    const content = fs.readFileSync(filePath, 'utf8');
    for (const [pattern, description] of patterns) {
        if (content.includes(pattern)) {
            SUCCESSES.push(`✓ ${description}`);
        } else {
            WARNINGS.push(`⚠ ${description} - Not found in ${path.basename(filePath)}`);
        }
    }
}

console.log('🔍 Validating Account Sync Architecture...\n');

// Check 1: AccountChangeDetector improvements
console.log('📋 Checking AccountChangeDetector...');
checkFile(
    'js/utils/account-detector.js',
    'reason: \'email_updated\'',
    'Email update detection (sameSub=true)'
);
checkFile(
    'js/utils/account-detector.js',
    'previousSubjects',
    'Email alias history tracking'
);
checkFile(
    'js/utils/account-detector.js',
    'EMAIL IS PRIMARY KEY',
    'Email as primary key documentation'
);

// Check 2: SessionManager improvements
console.log('\n📋 Checking SessionManager...');
checkFile(
    'js/utils/session-manager.js',
    'EMAIL IS PRIMARY KEY',
    'Email as primary key in SessionManager'
);
checkFile(
    'js/utils/session-manager.js',
    'sub: metadata.sub',
    'Google sub stored in metadata'
);
checkFile(
    'js/utils/session-manager.js',
    'aud: metadata.aud',
    'Google aud stored in metadata'
);
checkFile(
    'js/utils/session-manager.js',
    'BroadcastChannel(\'session-sync\')',
    'Cross-tab sync via BroadcastChannel'
);
checkFile(
    'js/utils/session-manager.js',
    'syncAcrossTabs',
    'syncAcrossTabs method'
);

// Check 3: StorageManager improvements
console.log('\n📋 Checking StorageManager...');
checkFile(
    'js/utils/storage-manager.js',
    'validateEmailAsKey()',
    'Email as key validation'
);
checkFile(
    'js/utils/storage-manager.js',
    'CRITICAL: Session has token but no email',
    'Email presence validation'
);

// Check 4: Sync manager improvements
console.log('\n📋 Checking Sync Manager...');
checkFile(
    'js/sync.js',
    'isSameAccount = false',
    'Same account flag in handleAccountSwitch'
);
checkFile(
    'js/sync.js',
    'Email alias updated',
    'Email alias handling'
);
checkFile(
    'js/sync.js',
    'EMAIL IS PRIMARY KEY',
    'Email as primary key documented in sync.js'
);

// Check 5: Documentation
console.log('\n📋 Checking Documentation...');
const docPath = 'ACCOUNT_SYNC_ARCHITECTURE.md';
if (fs.existsSync(docPath)) {
    const docContent = fs.readFileSync(docPath, 'utf8');
    if (docContent.includes('EMAIL AS CLAVE PRIMARIA') || docContent.includes('EMAIL COMO CLAVE PRIMARIA')) {
        SUCCESSES.push('✓ Architecture documentation exists');
    } else {
        WARNINGS.push('⚠ Architecture documentation incomplete');
    }
} else {
    ERRORS.push('✗ Architecture documentation missing');
}

// Summary
console.log('\n' + '='.repeat(60));
console.log('VALIDATION RESULTS');
console.log('='.repeat(60));

if (SUCCESSES.length > 0) {
    console.log(`\n✅ SUCCESSES (${SUCCESSES.length}):`);
    SUCCESSES.forEach(s => console.log('  ' + s));
}

if (WARNINGS.length > 0) {
    console.log(`\n⚠️  WARNINGS (${WARNINGS.length}):`);
    WARNINGS.forEach(w => console.log('  ' + w));
}

if (ERRORS.length > 0) {
    console.log(`\n❌ ERRORS (${ERRORS.length}):`);
    ERRORS.forEach(e => console.log('  ' + e));
}

console.log('\n' + '='.repeat(60));
const totalChecks = SUCCESSES.length + WARNINGS.length + ERRORS.length;
const passRate = Math.round((SUCCESSES.length / totalChecks) * 100);
console.log(`PASS RATE: ${passRate}% (${SUCCESSES.length}/${totalChecks})`);
console.log('='.repeat(60) + '\n');

process.exit(ERRORS.length > 0 ? 1 : 0);
