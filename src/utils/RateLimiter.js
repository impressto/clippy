/**
 * A simple rate limiter for API calls
 * Ensures an endpoint is not called more than once within the specified cooldown period
 */

// Store last call timestamps for each endpoint
const lastCallTimestamps = {};

/**
 * Check if a call to an endpoint is allowed based on rate limit
 * @param {string} endpointKey - A unique identifier for the endpoint
 * @param {number} cooldownMs - The cooldown period in milliseconds
 * @returns {boolean} - Whether the call is allowed
 */
export const canCallEndpoint = (endpointKey, cooldownMs = 5000) => {
  const now = Date.now();
  const lastCallTime = lastCallTimestamps[endpointKey] || 0;
  
  // Check if enough time has passed since the last call
  if (now - lastCallTime < cooldownMs) {
    console.log(`Rate limited: ${endpointKey} (last call ${now - lastCallTime}ms ago)`);
    return false;
  }
  
  // Update the last call time
  lastCallTimestamps[endpointKey] = now;
  return true;
};
