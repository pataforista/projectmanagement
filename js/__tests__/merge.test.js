/**
 * BUG FIX #6: Unit Tests for Field-Level Merge Logic
 *
 * These tests validate the fieldLevelMerge function which handles
 * Last-Write-Wins (LWW) merges with per-field timestamps.
 *
 * Critical scenarios:
 * - Concurrent edits on different fields (should preserve both)
 * - Equal timestamp conflicts (should keep local)
 * - Per-field vs record-level timestamps
 * - Timestamp map merging
 */

/**
 * Simulates the fieldLevelMerge logic for testing
 * (extracted from sync.js for testability)
 */
function fieldLevelMerge(local, remote) {
    if (!local) return remote;
    if (!remote) return local;

    const merged = { ...local, ...remote };
    const atomicFields = new Set(['id', 'user_id', 'created_at', 'createdAt', '_deleted', '_timestamps']);
    const allKeys = new Set([...Object.keys(local), ...Object.keys(remote)]);
    const conflictLog = [];

    allKeys.forEach(key => {
        if (atomicFields.has(key)) return;

        const localTime = local._timestamps?.[key] || local.updatedAt || local.updated_at || 0;
        const remoteTime = remote._timestamps?.[key] || remote.updatedAt || remote.updated_at || 0;

        // CONFLICT DETECTION: Equal timestamps + different values = real conflict
        if (localTime === remoteTime && localTime > 0 && local[key] !== remote[key]) {
            conflictLog.push({
                field: key,
                localValue: local[key],
                remoteValue: remote[key],
                timestamp: localTime
            });
            merged[key] = local[key]; // Keep local
        } else {
            // LWW: last-write-wins by timestamp
            merged[key] = localTime > remoteTime ? local[key] : remote[key];
        }
    });

    // Merge timestamp maps
    if (local._timestamps || remote._timestamps) {
        merged._timestamps = { ...(local._timestamps || {}), ...(remote._timestamps || {}) };
        const allTsKeys = new Set([
            ...Object.keys(local._timestamps || {}),
            ...Object.keys(remote._timestamps || {}),
        ]);
        allTsKeys.forEach(tsKey => {
            merged._timestamps[tsKey] = Math.max(
                local._timestamps?.[tsKey] || 0,
                remote._timestamps?.[tsKey] || 0,
            );
        });
    }

    return { merged, conflictLog };
}

// ─────────────────────────────────────────────────────────────────────────

/**
 * TEST SUITE: Field-Level Merge
 */

function test(description, fn) {
    try {
        fn();
        console.log(`✅ ${description}`);
    } catch (err) {
        console.error(`❌ ${description}`);
        console.error(`   ${err.message}`);
        process.exit(1);
    }
}

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

function assertEqual(actual, expected, message) {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw new Error(`${message}\nExpected: ${JSON.stringify(expected)}\nActual: ${JSON.stringify(actual)}`);
    }
}

// ─────────────────────────────────────────────────────────────────────────
// TEST 1: Concurrent edits on different fields
// ─────────────────────────────────────────────────────────────────────────

test('Concurrent edits on different fields preserve both changes', () => {
    const local = {
        id: 'task_1',
        title: 'Task A',
        status: 'open',
        mentor: 'John',
        burnout: false,
        updatedAt: 100,
        _timestamps: {
            title: 50,
            status: 50,
            mentor: 100,    // Local edited mentor at t=100
            burnout: 50
        }
    };

    const remote = {
        id: 'task_1',
        title: 'Task A',
        status: 'closed',   // Remote edited status at t=200
        mentor: 'John',
        burnout: true,      // Remote edited burnout at t=200
        updatedAt: 200,
        _timestamps: {
            title: 50,
            status: 200,
            mentor: 100,
            burnout: 200
        }
    };

    const { merged } = fieldLevelMerge(local, remote);

    // Mentor: local wins (100 > 100? No, but local has priority on equal)
    assert(merged.mentor === 'John', 'mentor should be preserved from local');

    // Status: remote wins (200 > 50)
    assert(merged.status === 'closed', 'status should be updated from remote');

    // Burnout: remote wins (200 > 50)
    assert(merged.burnout === true, 'burnout should be updated from remote');

    // Timestamps merged correctly
    assert(merged._timestamps.mentor === 100, 'mentor timestamp preserved');
    assert(merged._timestamps.status === 200, 'status timestamp updated');
    assert(merged._timestamps.burnout === 200, 'burnout timestamp updated');
});

// ─────────────────────────────────────────────────────────────────────────
// TEST 2: Equal timestamp with different values = conflict
// ─────────────────────────────────────────────────────────────────────────

test('Equal timestamp with different values triggers conflict', () => {
    const local = {
        id: 'task_1',
        name: 'Task A',
        priority: 'high',
        _timestamps: { priority: 100 },
        updatedAt: 100
    };

    const remote = {
        id: 'task_1',
        name: 'Task A',
        priority: 'low',    // Same timestamp but different value
        _timestamps: { priority: 100 },
        updatedAt: 100
    };

    const { merged, conflictLog } = fieldLevelMerge(local, remote);

    // Conflict detected
    assert(conflictLog.length === 1, 'one conflict should be detected');
    assertEqual(conflictLog[0].field, 'priority', 'conflict field should be priority');
    assertEqual(conflictLog[0].localValue, 'high', 'local value should be high');
    assertEqual(conflictLog[0].remoteValue, 'low', 'remote value should be low');

    // Local wins on conflict
    assert(merged.priority === 'high', 'local should win on conflict');
});

// ─────────────────────────────────────────────────────────────────────────
// TEST 3: Multiple conflicts
// ─────────────────────────────────────────────────────────────────────────

test('Multiple simultaneous conflicts are all detected', () => {
    const local = {
        id: 'task_1',
        title: 'Original',
        status: 'open',
        priority: 'high',
        _timestamps: {
            title: 100,
            status: 100,
            priority: 100
        },
        updatedAt: 100
    };

    const remote = {
        id: 'task_1',
        title: 'Modified',
        status: 'closed',
        priority: 'low',
        _timestamps: {
            title: 100,     // Same timestamp = conflict
            status: 100,    // Same timestamp = conflict
            priority: 100   // Same timestamp = conflict
        },
        updatedAt: 100
    };

    const { merged, conflictLog } = fieldLevelMerge(local, remote);

    // All conflicts detected
    assert(conflictLog.length === 3, 'three conflicts should be detected');
    assert(conflictLog.map(c => c.field).includes('title'), 'title conflict detected');
    assert(conflictLog.map(c => c.field).includes('status'), 'status conflict detected');
    assert(conflictLog.map(c => c.field).includes('priority'), 'priority conflict detected');

    // All local values preserved
    assert(merged.title === 'Original', 'local title should win');
    assert(merged.status === 'open', 'local status should win');
    assert(merged.priority === 'high', 'local priority should win');
});

// ─────────────────────────────────────────────────────────────────────────
// TEST 4: Timestamp map merging
// ─────────────────────────────────────────────────────────────────────────

test('Timestamp maps merge correctly (keeps maximum per-field)', () => {
    const local = {
        id: 'task_1',
        a: 'a_val',
        b: 'b_val',
        _timestamps: {
            a: 100,
            b: 50
        }
    };

    const remote = {
        id: 'task_1',
        a: 'a_val',
        b: 'b_val',
        _timestamps: {
            a: 80,    // Lower than local
            b: 120    // Higher than local
        }
    };

    const { merged } = fieldLevelMerge(local, remote);

    // Merged timestamps keep maximum values
    assert(merged._timestamps.a === 100, 'a timestamp should be 100 (max)');
    assert(merged._timestamps.b === 120, 'b timestamp should be 120 (max)');
});

// ─────────────────────────────────────────────────────────────────────────
// TEST 5: One side missing (create/delete scenarios)
// ─────────────────────────────────────────────────────────────────────────

test('Missing field on one side', () => {
    const local = {
        id: 'task_1',
        title: 'Task A',
        description: 'Original',
        _timestamps: { title: 100, description: 100 }
    };

    const remote = {
        id: 'task_1',
        title: 'Task A Updated',
        // description omitted (deleted remotely)
        _timestamps: { title: 150 }
    };

    const { merged } = fieldLevelMerge(local, remote);

    // Remote wins on title (newer)
    assert(merged.title === 'Task A Updated', 'title should be updated from remote');

    // Description from local (remote doesn't have it)
    assert(merged.description === 'Original', 'description should be from local');
});

// ─────────────────────────────────────────────────────────────────────────
// TEST 6: No timestamp (fallback to updatedAt)
// ─────────────────────────────────────────────────────────────────────────

test('Fallback to record-level updatedAt when per-field timestamp missing', () => {
    const local = {
        id: 'task_1',
        title: 'Original',
        status: 'open',
        updatedAt: 100
        // No _timestamps
    };

    const remote = {
        id: 'task_1',
        title: 'Modified',
        status: 'open',
        updatedAt: 200
        // No _timestamps
    };

    const { merged } = fieldLevelMerge(local, remote);

    // Remote wins everything (newer updatedAt)
    assert(merged.title === 'Modified', 'title should be from remote (newer updatedAt)');
});

// ─────────────────────────────────────────────────────────────────────────
// TEST 7: Atomic fields never merge per-field
// ─────────────────────────────────────────────────────────────────────────

test('Atomic fields (id, created_at) never merge per-field', () => {
    const local = {
        id: 'task_1',
        created_at: '2024-01-01',
        title: 'Task A',
        _timestamps: { title: 100 }
    };

    const remote = {
        id: 'task_1',  // Same ID
        created_at: '2024-01-01',  // Should never change
        title: 'Task A',
        _timestamps: { title: 200 }
    };

    const { merged } = fieldLevelMerge(local, remote);

    // IDs preserved (atomic)
    assert(merged.id === 'task_1', 'id should be preserved');
    assert(merged.created_at === '2024-01-01', 'created_at should be preserved');

    // Title merges normally
    assert(merged.title === 'Task A', 'title should be from remote (newer)');
});

// ─────────────────────────────────────────────────────────────────────────
// SUMMARY
// ─────────────────────────────────────────────────────────────────────────

console.log('\n' + '='.repeat(60));
console.log('✅ ALL MERGE TESTS PASSED');
console.log('='.repeat(60) + '\n');
