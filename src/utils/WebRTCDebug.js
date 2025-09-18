// Enable WebRTC debugging in the browser
function enableWebRTCDebug() {
  if (window.localStorage) {
    window.localStorage.setItem('debug', 'webrtc*');
  }
  
  // Enable browser WebRTC logging
  if (window.webrtcLogs === undefined) {
    window.webrtcLogs = [];
    
    // Override console methods to capture WebRTC logs
    const originalConsoleLog = console.log;
    const originalConsoleError = console.error;
    const originalConsoleWarn = console.warn;
    const originalConsoleInfo = console.info;
    
    // Only capture WebRTC related logs
    const isWebRTCLog = (args) => {
      if (!args || args.length === 0) return false;
      
      const firstArg = String(args[0]);
      return firstArg.includes('WebRTC') || 
             firstArg.includes('RTC') || 
             firstArg.includes('ICE') || 
             firstArg.includes('SDP') || 
             firstArg.includes('peer') || 
             firstArg.includes('signal') ||
             firstArg.includes('data channel');
    };
    
    // Capture logs
    console.log = function() {
      if (isWebRTCLog(arguments)) {
        window.webrtcLogs.push({
          type: 'log',
          timestamp: new Date().toISOString(),
          message: Array.from(arguments).map(arg => 
            typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
          ).join(' ')
        });
      }
      originalConsoleLog.apply(console, arguments);
    };
    
    console.error = function() {
      if (isWebRTCLog(arguments)) {
        window.webrtcLogs.push({
          type: 'error',
          timestamp: new Date().toISOString(),
          message: Array.from(arguments).map(arg => 
            typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
          ).join(' ')
        });
      }
      originalConsoleError.apply(console, arguments);
    };
    
    console.warn = function() {
      if (isWebRTCLog(arguments)) {
        window.webrtcLogs.push({
          type: 'warn',
          timestamp: new Date().toISOString(),
          message: Array.from(arguments).map(arg => 
            typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
          ).join(' ')
        });
      }
      originalConsoleWarn.apply(console, arguments);
    };
    
    console.info = function() {
      if (isWebRTCLog(arguments)) {
        window.webrtcLogs.push({
          type: 'info',
          timestamp: new Date().toISOString(),
          message: Array.from(arguments).map(arg => 
            typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
          ).join(' ')
        });
      }
      originalConsoleInfo.apply(console, arguments);
    };
    
    console.log('WebRTC debug logging enabled');
  }
  
  return window.webrtcLogs;
}

// Send WebRTC logs to server
async function sendWebRTCLogs(sessionId, clientId) {
  if (!window.webrtcLogs) return;
  
  try {
    const response = await fetch(`/api/webrtc_debug.php?id=${sessionId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Client-ID': clientId,
        'X-Debug-Mode': 'true'
      },
      body: JSON.stringify({
        logs: window.webrtcLogs
      })
    });
    
    const data = await response.json();
    console.log('WebRTC logs sent to server:', data);
    
    // Clear logs after sending
    window.webrtcLogs = [];
  } catch (error) {
    console.error('Error sending WebRTC logs:', error);
  }
}

export { enableWebRTCDebug, sendWebRTCLogs };
