/**
 * js/utils/versioning.js
 * Advanced versioning using Google's diff-match-patch
 */

// We assume diff-match-patch is loaded via script tag or available globally
// If not, we'd need to import it or provide a fallback
const dmp = typeof diff_match_patch !== 'undefined' ? new diff_match_patch() : null;

/**
 * Creates a patch/delta between old content and new content.
 * @param {string} oldText
 * @param {string} newText
 * @returns {string} The patch as a text string
 */
export const createDelta = (oldText, newText) => {
    if (!dmp) {
        console.warn('diff-match-patch not found, falling back to full text storage.');
        return null;
    }
    const patches = dmp.patch_make(oldText || '', newText || '');
    return dmp.patch_toText(patches);
};

/**
 * Applies a patch to a base text to restore a version.
 * @param {string} baseText
 * @param {string} patchText
 * @returns {string} The restored text
 */
export const applyDelta = (baseText, patchText) => {
    if (!dmp || !patchText) return baseText;
    const patches = dmp.patch_fromText(patchText);
    const [restoredText, results] = dmp.patch_apply(patches, baseText || '');
    return restoredText;
};

/**
 * Compares two strings and returns a list of differences for UI display.
 * @param {string} text1
 * @param {string} text2
 */
export const computeDiff = (text1, text2) => {
    if (!dmp) return [];
    return dmp.diff_main(text1 || '', text2 || '');
};
